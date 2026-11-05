-- UX-ARCH-02: auditable narrow RPC mutations. NO broad district bypass.
-- All functions SECURITY DEFINER with pinned search_path and explicit auth.
begin;
create or replace function public.ux_admin_create_work_district(
 p_code text,p_label text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null or not ux_core.is_admin() then
  raise exception 'Admin approval is required' using errcode='42501';
 end if;
 insert into public.work_districts(code,label)
 values(upper(trim(p_code)),trim(p_label)) returning id into v_id;
 return v_id;
end;
$$;

create or replace function public.ux_admin_assign_work_district(
 p_inspector uuid,p_district uuid,p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_old uuid;
begin
 if (select auth.uid()) is null or not ux_core.is_admin() then
  raise exception 'Admin approval is required' using errcode='42501';
 end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 500 then
  raise exception 'A documented reason (10-500 characters) is required'
   using errcode='22023';
 end if;
 if not exists(select 1 from public.work_districts
  where id=p_district and active) then
  raise exception 'Target work district is not active' using errcode='22023';
 end if;
 select work_district_id into v_old from public.inspector_profiles
 where id=p_inspector for update;
 if not found then raise exception 'Inspector not found' using errcode='22023'; end if;
 if v_old is not distinct from p_district then return; end if;
 update public.inspector_profiles set work_district_id=p_district where id=p_inspector;
 insert into public.work_district_assignment_events
  (inspector_id,previous_district_id,new_district_id,admin_id,reason)
 values(p_inspector,v_old,p_district,(select auth.uid()),trim(p_reason));
 -- Grants are bound to the recipient's work district at issue time.
 -- Reassigning a district automatically invalidates old grants at RLS read time.
end;
$$;

create or replace function public.ux_submit_institution_request(
 p_private_record uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_record public.inspector_private_records%rowtype;
 v_id uuid; v_owner uuid:=(select auth.uid());v_district uuid;
begin
 if v_owner is null or not ux_core.approved_inspector() then
  raise exception 'Approved inspector required' using errcode='42501';
 end if;
 v_district:=ux_core.my_district();
 if v_district is null then
  raise exception 'Verified work district is required' using errcode='42501';
 end if;
 select * into v_record from public.inspector_private_records
 where id=p_private_record and owner_id=v_owner for update;
 if not found or v_record.kind<>'institution' or v_record.work_district_id<>v_district then
  raise exception 'Only own district institution records can be submitted'
   using errcode='42501';
 end if;
 -- Whitelist publication fields: NEVER publish private notes or arbitrary payload.
 insert into public.district_publication_requests
  (author_id,work_district_id,private_record_id,resource_kind,proposed_payload)
 values(v_owner,v_district,v_record.id,'institution',
  jsonb_build_object(
   'title',left(v_record.title,250),
   'code',left(coalesce(v_record.payload->>'code',''),80),
   'wilaya',left(coalesce(v_record.payload->>'wilaya',''),120)
  )) returning id into v_id;
 return v_id;
end;
$$;

create or replace function public.ux_review_institution_request(
 p_request uuid,p_approve boolean,p_reason text default '')
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_request public.district_publication_requests%rowtype;
 v_admin uuid:=(select auth.uid());v_resource uuid;
begin
 if v_admin is null or not ux_core.is_admin() or ux_core.my_district() is null then
  raise exception 'Approved district admin required' using errcode='42501';
 end if;
 select * into v_request from public.district_publication_requests
 where id=p_request for update;
 if not found or v_request.status<>'submitted' or
  v_request.work_district_id<>ux_core.my_district() then
  raise exception 'No pending request within admin work district'
   using errcode='42501';
 end if;
 if v_request.author_id=v_admin then
  raise exception 'Inspector cannot approve own publication request'
   using errcode='42501';
 end if;
 if p_approve is null or (p_approve=false and length(trim(coalesce(p_reason,'')))<6) then
  raise exception 'Rejection must include a reason' using errcode='22023';
 end if;
 update public.district_publication_requests
  set status=case when p_approve then 'approved' else 'rejected' end,
      reviewer_id=v_admin,decision_reason=left(trim(coalesce(p_reason,'')),500),
      decided_at=now()
 where id=p_request;
 if p_approve then
  insert into public.district_published_resources
   (work_district_id,resource_kind,title,code,wilaya,payload,
    source_request_id,approved_by)
  values(v_request.work_district_id,'institution',
   left(v_request.proposed_payload->>'title',250),
   left(coalesce(v_request.proposed_payload->>'code',''),80),
   left(coalesce(v_request.proposed_payload->>'wilaya',''),120),
   v_request.proposed_payload,p_request,v_admin)
  returning id into v_resource;
 end if;
 return v_resource;
end;
$$;

create or replace function public.ux_admin_grant_district_access(
 p_grantee uuid,p_capability text,p_resource uuid,
 p_reason text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_admin uuid:=(select auth.uid());
 v_recipient_district uuid;v_resource_district uuid;v_id uuid;
begin
 if v_admin is null or not ux_core.is_admin() then
  raise exception 'Admin only' using errcode='42501';
 end if;
 if p_capability not in ('view_inspector','view_institution','collaborate_mission')
 or p_capability is null or p_resource is null then
  raise exception 'Unsupported permission or resource' using errcode='22023';
 end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 500 then
  raise exception 'Professional justification must be 10-500 characters'
   using errcode='22023';
 end if;
 if p_expires_at is null or p_expires_at<=now() or
  p_expires_at>now()+interval '30 days' then
  raise exception 'Exception must expire within the next 30 days'
   using errcode='22023';
 end if;
 select p.work_district_id into v_recipient_district
 from public.inspector_profiles p
 join public.work_districts d on d.id=p.work_district_id and d.active
 where p.id=p_grantee and p.approved=true and p.account_status='approved';
 if v_recipient_district is null or p_grantee=v_admin then
  raise exception 'Recipient must be an approved inspector with a verified district'
   using errcode='42501';
 end if;
 if p_capability='view_inspector' then
  select p.work_district_id into v_resource_district
  from public.inspector_profiles p
  join public.work_districts d on d.id=p.work_district_id and d.active
  where p.id=p_resource and p.approved and p.account_status='approved';
 elsif p_capability='view_institution' then
  select r.work_district_id into v_resource_district
  from public.district_published_resources r
  where r.id=p_resource and r.publication_status='published';
 elsif p_capability='collaborate_mission' then
  select p.work_district_id into v_resource_district
  from public.inspection_missions m
  join public.inspector_profiles p on p.id=m.created_by
  join public.work_districts d on d.id=p.work_district_id and d.active
  where m.id=p_resource;
 end if;
 if v_resource_district is null or
  v_resource_district=v_recipient_district then
  raise exception 'Only a specific authorized foreign-district resource is eligible'
   using errcode='42501';
 end if;
 insert into public.district_access_grants
  (grantee_id,grantee_district_id_at_grant,granted_by,
   capability,resource_id,resource_district_id,reason,expires_at)
 values(p_grantee,v_recipient_district,v_admin,p_capability,p_resource,
  v_resource_district,trim(p_reason),p_expires_at)
 returning id into v_id;
 insert into public.district_access_grant_events(grant_id,action,actor_id,reason)
 values(v_id,'granted',v_admin,trim(p_reason));
 return v_id;
end;
$$;

create or replace function public.ux_admin_revoke_district_access(
 p_grant uuid,p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_admin uuid:=(select auth.uid());
begin
 if v_admin is null or not ux_core.is_admin() then
  raise exception 'Admin only' using errcode='42501';
 end if;
 if length(trim(coalesce(p_reason,''))) not between 6 and 500 then
  raise exception 'Revocation reason is required' using errcode='22023';
 end if;
 update public.district_access_grants
 set revoked_at=now(),revoked_by=v_admin
 where id=p_grant and revoked_at is null;
 if not found then raise exception 'Grant already revoked or unavailable' using errcode='22023'; end if;
 insert into public.district_access_grant_events(grant_id,action,actor_id,reason)
 values(p_grant,'revoked',v_admin,trim(p_reason));
end;
$$;

-- Enforce privilege at RPC boundary and avoid PUBLIC execute defaults.
revoke all on function public.ux_admin_create_work_district(text,text),
 public.ux_admin_assign_work_district(uuid,uuid,text),
 public.ux_submit_institution_request(uuid),
 public.ux_review_institution_request(uuid,boolean,text),
 public.ux_admin_grant_district_access(uuid,text,uuid,text,timestamptz),
 public.ux_admin_revoke_district_access(uuid,text)
 from public,anon,authenticated;
grant execute on function public.ux_admin_create_work_district(text,text),
 public.ux_admin_assign_work_district(uuid,uuid,text),
 public.ux_submit_institution_request(uuid),
 public.ux_review_institution_request(uuid,boolean,text),
 public.ux_admin_grant_district_access(uuid,text,uuid,text,timestamptz),
 public.ux_admin_revoke_district_access(uuid,text)
 to authenticated;
commit;
