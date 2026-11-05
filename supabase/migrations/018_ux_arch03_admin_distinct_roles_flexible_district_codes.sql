-- UX-ARCH-03: the site owner is a site administrator, NOT an inspector.
-- Work-district codes are ADMIN-CHOSEN labels, not wilaya codes.
-- Institutions are single records with a many-to-many district publication map.
-- No legacy inspector/institution data are automatically reassigned.
begin;

alter table public.work_districts drop constraint if exists work_districts_code_check;
alter table public.work_districts add constraint work_districts_code_check
 check (char_length(btrim(code)) between 1 and 100 and code=btrim(code)
   and code !~ '[[:cntrl:]]');
alter table public.work_districts drop constraint if exists work_districts_label_check;
alter table public.work_districts add constraint work_districts_label_check
 check (char_length(btrim(label)) between 1 and 200 and label=btrim(label)
   and label !~ '[[:cntrl:]]');
alter table public.work_district_assignment_events drop constraint if exists work_district_assignment_events_reason_check;
alter table public.work_district_assignment_events add constraint work_district_assignment_events_reason_check
 check (char_length(reason)<=500);

-- Admin is a separate site-management role; only the non-admin account
-- participates in the new inspector's private records and missions.
create or replace function ux_core.approved_inspector()
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.inspector_profiles p
 where p.id=(select auth.uid()) and p.approved and not p.is_admin
 and p.account_status='approved');
$$;
create or replace function ux_core.my_district()
returns uuid language sql stable security definer set search_path=''
as $$
 select p.work_district_id from public.inspector_profiles p
 join public.work_districts d on d.id=p.work_district_id and d.active
 where p.id=(select auth.uid()) and p.approved and not p.is_admin
 and p.account_status='approved';
$$;
-- Preserve read access to the administrator's OWN historical private rows
-- and preparations created before these roles were separated. No access
-- to another inspector's records is ever granted to the site admin.
drop policy if exists ux_private_read on public.inspector_private_records;
create policy ux_private_read on public.inspector_private_records
 for select to authenticated using (
 owner_id=(select auth.uid()) and
 ((select ux_core.approved_inspector()) or (select ux_core.is_admin()))
);
drop policy if exists ux_prep_read on public.mission_preparations;
create policy ux_prep_read on public.mission_preparations
 for select to authenticated using (
 owner_id=(select auth.uid()) and
 ((select ux_core.approved_inspector()) or (select ux_core.is_admin()))
);

create or replace function ux_core.has_grant(p_capability text,p_resource uuid)
returns boolean language sql stable security definer set search_path=''
as $
 select exists(
 select 1 from public.district_access_grants g
 join public.inspector_profiles p on p.id=g.grantee_id
 join public.work_districts d on d.id=p.work_district_id and d.active
 where p.id=(select auth.uid()) and p.approved and not p.is_admin
 and p.account_status='approved'
 and g.grantee_id=p.id and g.grantee_district_id_at_grant=p.work_district_id
 and g.capability=p_capability and g.resource_id=p_resource
 and g.revoked_at is null and g.expires_at>now()
 );
$$;

alter table public.district_published_resources
 alter column source_request_id drop not null;
-- Admin may keep a shared institution unassigned until deciding its audiences.
alter table public.district_published_resources
 alter column work_district_id drop not null;
alter table public.district_published_resources
 add column if not exists legacy_institution_id uuid unique
 references public.shared_institutions(id);

-- A published institution is a SINGLE row, linked to zero/one/many districts.
create table if not exists public.district_resource_assignments(
 resource_id uuid not null references public.district_published_resources(id) on delete cascade,
 work_district_id uuid not null references public.work_districts(id),
 assigned_by uuid not null references public.inspector_profiles(id),
 created_at timestamptz not null default now(),
 primary key(resource_id,work_district_id)
);
create index if not exists ux_district_resource_assignments_district_idx
 on public.district_resource_assignments(work_district_id,resource_id);
create table if not exists public.district_resource_assignment_events(
 id uuid primary key default gen_random_uuid(),
 resource_id uuid not null references public.district_published_resources(id),
 work_district_id uuid not null references public.work_districts(id),
 action text not null check(action in ('assigned','unassigned')),
 admin_id uuid not null references public.inspector_profiles(id),
 occurred_at timestamptz not null default now()
);

alter table public.district_resource_assignments enable row level security;
alter table public.district_resource_assignment_events enable row level security;
revoke all on public.district_resource_assignments,
 public.district_resource_assignment_events from public,anon,authenticated;
grant select on public.district_resource_assignments,
 public.district_resource_assignment_events to authenticated;
create policy ux_resource_assignments_admin_read on public.district_resource_assignments
 for select to authenticated using ((select ux_core.is_admin()));
create policy ux_resource_assignment_events_admin_read on public.district_resource_assignment_events
 for select to authenticated using ((select ux_core.is_admin()));

-- Backfill any already published records to preserve the *old* scope.
insert into public.district_resource_assignments(resource_id,work_district_id,assigned_by)
select r.id,r.work_district_id,r.approved_by
from public.district_published_resources r
on conflict(resource_id,work_district_id) do nothing;

create or replace function ux_core.resource_in_my_district(p_resource uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select ux_core.approved_inspector() and exists(
  select 1 from public.district_resource_assignments a
  where a.resource_id=p_resource and a.work_district_id=ux_core.my_district()
 );
$$;
revoke all on function ux_core.resource_in_my_district(uuid) from public,anon,authenticated;
grant execute on function ux_core.resource_in_my_district(uuid) to authenticated;

drop policy if exists ux_resource_read on public.district_published_resources;
create policy ux_resource_read on public.district_published_resources
 for select to authenticated using(
 publication_status='published' and (
  (select ux_core.is_admin())
  or (ux_core.resource_in_my_district(id))
  or ((select ux_core.approved_inspector()) and ux_core.has_grant('view_institution',id))
 ));
drop policy if exists ux_publication_request_read on public.district_publication_requests;
create policy ux_publication_request_read on public.district_publication_requests
 for select to authenticated using(
 (author_id=(select auth.uid()) and (select ux_core.approved_inspector()))
 or (select ux_core.is_admin())
 );
drop policy if exists ux_grant_read on public.district_access_grants;
create policy ux_grant_read on public.district_access_grants
 for select to authenticated using(
 (grantee_id=(select auth.uid()) and (select ux_core.approved_inspector()))
 or (select ux_core.is_admin())
 );
drop policy if exists ux_district_read on public.work_districts;
create policy ux_district_read on public.work_districts
 for select to authenticated using (
 (select ux_core.is_admin()) or
 (active and id=(select ux_core.my_district()))
 );
drop policy if exists ux_grant_events_read on public.district_access_grant_events;
create policy ux_grant_events_read on public.district_access_grant_events
 for select to authenticated using(
 (select ux_core.is_admin()) or exists(
  select 1 from public.district_access_grants g
  where g.id=grant_id and g.grantee_id=(select auth.uid())
   and (select ux_core.approved_inspector())
 ));
-- Publication status is unrelated to the province where the institution is located.
-- Do not drop/replace broad RLS on pre-existing shared_institutions in this migration.

create or replace function public.ux_admin_create_work_district(
 p_code text,p_label text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null or not ux_core.is_admin() then
  raise exception 'Admin only' using errcode='42501';
 end if;
 if nullif(btrim(coalesce(p_code,'')),'') is null or
    nullif(btrim(coalesce(p_label,'')),'') is null then
  raise exception 'Code and label may not be empty' using errcode='22023';
 end if;
 insert into public.work_districts(code,label)
 values(btrim(p_code),btrim(p_label)) returning id into v_id;
 return v_id;
end;
$$;
create or replace function public.ux_admin_update_work_district(
 p_district uuid,p_code text,p_label text)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if (select auth.uid()) is null or not ux_core.is_admin() then
  raise exception 'Admin only' using errcode='42501';
 end if;
 if nullif(btrim(coalesce(p_code,'')),'') is null or
    nullif(btrim(coalesce(p_label,'')),'') is null then
  raise exception 'Code and label may not be empty' using errcode='22023';
 end if;
 update public.work_districts
 set code=btrim(p_code),label=btrim(p_label)
 where id=p_district;
 if not found then raise exception 'Work district not found' using errcode='22023'; end if;
 -- district UUID stays stable: profile assignment remains valid.
end;
$$;
create or replace function public.ux_admin_assign_work_district(
 p_inspector uuid,p_district uuid,p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_old uuid;v_is_admin boolean;
begin
 if (select auth.uid()) is null or not ux_core.is_admin() then
  raise exception 'Admin only' using errcode='42501';
 end if;
 if not exists(select 1 from public.work_districts
  where id=p_district and active) then
  raise exception 'Work district not found' using errcode='22023';
 end if;
 select work_district_id,is_admin into v_old,v_is_admin from public.inspector_profiles
 where id=p_inspector for update;
 if not found then raise exception 'Account not found' using errcode='22023'; end if;
 if v_is_admin then
  raise exception 'Site admin is not an inspector account' using errcode='42501';
 end if;
 if v_old is not distinct from p_district then return; end if;
 update public.inspector_profiles set work_district_id=p_district where id=p_inspector;
 insert into public.work_district_assignment_events
  (inspector_id,previous_district_id,new_district_id,admin_id,reason)
 values(p_inspector,v_old,p_district,(select auth.uid()),
 left(coalesce(nullif(btrim(p_reason),''),'تعيين بواسطة إدارة الموقع'),500));
end;
$$;

-- The review is performed by the SITE admin regardless of admin's legacy
-- district value, and the newly published record is assigned to the
-- requesting inspector's district. The admin may add other districts.
create or replace function public.ux_review_institution_request(
 p_request uuid,p_approve boolean,p_reason text default '')
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_request public.district_publication_requests%rowtype;
 v_admin uuid:=(select auth.uid());v_resource uuid;
begin
 if v_admin is null or not ux_core.is_admin() then
  raise exception 'Site admin only' using errcode='42501';
 end if;
 select * into v_request from public.district_publication_requests
 where id=p_request for update;
 if not found or v_request.status<>'submitted' then
  raise exception 'No pending publication request' using errcode='22023';
 end if;
 if p_approve is null then
  raise exception 'A publication decision is required' using errcode='22023';
 end if;
 -- A site owner may decide requests from either account; reasons are optional.
 -- Every accepted/rejected request still records the actor and time.
 update public.district_publication_requests
  set status=case when p_approve then 'approved' else 'rejected' end,
  reviewer_id=v_admin,decision_reason=left(btrim(coalesce(p_reason,'')),500),
  decided_at=now() where id=p_request;
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
  insert into public.district_resource_assignments(resource_id,work_district_id,assigned_by)
  values(v_resource,v_request.work_district_id,v_admin);
  insert into public.district_resource_assignment_events(resource_id,work_district_id,action,admin_id)
  values(v_resource,v_request.work_district_id,'assigned',v_admin);
 end if;
 return v_resource;
end;
$$;

create or replace function public.ux_admin_create_institution(
 p_title text,p_code text,p_wilaya text,p_initial_district uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_admin uuid:=(select auth.uid());
begin
 if v_admin is null or not ux_core.is_admin() then
  raise exception 'Site admin only' using errcode='42501';
 end if;
 if nullif(btrim(coalesce(p_title,'')),'') is null then
  raise exception 'Institution name required' using errcode='22023';
 end if;
 if p_initial_district is not null and
    not exists(select 1 from public.work_districts where id=p_initial_district and active) then
  raise exception 'Invalid initial district' using errcode='22023';
 end if;
 insert into public.district_published_resources
  (work_district_id,resource_kind,title,code,wilaya,payload,approved_by)
 values(p_initial_district,'institution',left(btrim(p_title),250),
  btrim(coalesce(p_code,'')),btrim(coalesce(p_wilaya,'')),
  jsonb_build_object('title',left(btrim(p_title),250),
     'code',btrim(coalesce(p_code,'')),'wilaya',btrim(coalesce(p_wilaya,''))),
  v_admin) returning id into v_id;
 if p_initial_district is not null then
  insert into public.district_resource_assignments(resource_id,work_district_id,assigned_by)
  values(v_id,p_initial_district,v_admin);
  insert into public.district_resource_assignment_events(resource_id,work_district_id,action,admin_id)
  values(v_id,p_initial_district,'assigned',v_admin);
 end if;
 return v_id;
end;
$;
create or replace function public.ux_admin_import_legacy_institution(
 p_legacy_id uuid,p_initial_district uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_old public.shared_institutions%rowtype;
 v_id uuid;v_admin uuid:=(select auth.uid());
begin
 if v_admin is null or not ux_core.is_admin() then
  raise exception 'Site admin only' using errcode='42501';
 end if;
 if p_initial_district is not null and
    not exists(select 1 from public.work_districts where id=p_initial_district and active) then
  raise exception 'Invalid initial district' using errcode='22023';
 end if;
 select * into v_old from public.shared_institutions
 where id=p_legacy_id;
 if not found then raise exception 'Legacy institution missing' using errcode='22023';end if;
 if exists(select 1 from public.district_published_resources
  where legacy_institution_id=p_legacy_id) then
  raise exception 'Institution already registered in new catalog' using errcode='23505';
 end if;
 insert into public.district_published_resources
  (work_district_id,resource_kind,title,code,wilaya,payload,approved_by,legacy_institution_id)
 values(p_initial_district,'institution',left(btrim(v_old.name),250),
  btrim(coalesce(v_old.code,'')),btrim(coalesce(v_old.wilaya,'')),
  jsonb_build_object('title',left(btrim(v_old.name),250),
   'code',btrim(coalesce(v_old.code,'')),'wilaya',btrim(coalesce(v_old.wilaya,''))),
  v_admin,p_legacy_id) returning id into v_id;
 if p_initial_district is not null then
  insert into public.district_resource_assignments(resource_id,work_district_id,assigned_by)
  values(v_id,p_initial_district,v_admin);
  insert into public.district_resource_assignment_events(resource_id,work_district_id,action,admin_id)
  values(v_id,p_initial_district,'assigned',v_admin);
 end if;
 return v_id;
end;
$;
create or replace function public.ux_admin_set_institution_districts(
 p_resource uuid,p_districts uuid[])
returns void language plpgsql security definer set search_path=''
as $$
declare v_admin uuid:=(select auth.uid());v_id uuid;
begin
 if v_admin is null or not ux_core.is_admin() then
  raise exception 'Site admin only' using errcode='42501';
 end if;
 if not exists(select 1 from public.district_published_resources
  where id=p_resource and publication_status='published' for update) then
  raise exception 'Unknown published institution' using errcode='22023';
 end if;
 if p_districts is null then
  raise exception 'District selection must be an array, possibly empty'
   using errcode='22023';
 end if;
 if exists(select 1 from unnest(p_districts) as d(id)
  where d.id is null or not exists(select 1 from public.work_districts
   where id=d.id and active)) then
  raise exception 'Invalid or inactive district' using errcode='22023';
 end if;
 for v_id in
  delete from public.district_resource_assignments
  where resource_id=p_resource and not (work_district_id=any(p_districts))
  returning work_district_id
 loop
  insert into public.district_resource_assignment_events
   (resource_id,work_district_id,action,admin_id)
  values(p_resource,v_id,'unassigned',v_admin);
 end loop;
 for v_id in select distinct unnest(p_districts) loop
  if not exists(select 1 from public.district_resource_assignments
     where resource_id=p_resource and work_district_id=v_id) then
   insert into public.district_resource_assignments
    (resource_id,work_district_id,assigned_by)
   values(p_resource,v_id,v_admin);
   insert into public.district_resource_assignment_events
    (resource_id,work_district_id,action,admin_id)
   values(p_resource,v_id,'assigned',v_admin);
  end if;
 end loop;
end;
$$;

-- The "code" of an institution is an administrative text label, not proof
-- of geographic district, and should not block the site owner's assignment.
drop index if exists public.district_published_resources_code_uniq;
alter table public.district_published_resources
 drop constraint if exists district_published_resources_title_check;
alter table public.district_published_resources
 add constraint district_published_resources_title_check
 check (length(btrim(title)) between 1 and 250);

-- No new table mutations available to ordinary authenticated browser users.
revoke all on function public.ux_admin_update_work_district(uuid,text,text),
 public.ux_admin_create_institution(text,text,text,uuid),
 public.ux_admin_import_legacy_institution(uuid,uuid),
 public.ux_admin_set_institution_districts(uuid,uuid[])
 from public,anon,authenticated;
grant execute on function public.ux_admin_update_work_district(uuid,text,text),
 public.ux_admin_create_institution(text,text,text,uuid),
 public.ux_admin_import_legacy_institution(uuid,uuid),
 public.ux_admin_set_institution_districts(uuid,uuid[])
 to authenticated;

-- Existing admin exception catalog and grant RPC respect multi-district membership.
create or replace function public.ux_admin_list_exception_resources(
 p_grantee uuid,p_capability text)
returns table(resource_id uuid,resource_label text,district_label text)
language plpgsql stable security definer set search_path=''
as $$
declare v_district uuid;
begin
 if (select auth.uid()) is null or not ux_core.is_admin() then
  raise exception 'Admin only' using errcode='42501';
 end if;
 if p_capability not in ('view_inspector','view_institution','collaborate_mission')
    or p_capability is null then
  raise exception 'Unknown exception capability' using errcode='22023';
 end if;
 select p.work_district_id into v_district
 from public.inspector_profiles p
 join public.work_districts d on d.id=p.work_district_id and d.active
 where p.id=p_grantee and p.approved and p.account_status='approved';
 if v_district is null then
  raise exception 'Recipient work district is not verified' using errcode='42501';
 end if;
 if p_capability='view_inspector' then
  return query select p.id,
   left(trim(p.first_name||' '||p.last_name)||' — '||p.profession,180),
   d.label
   from public.inspector_profiles p
   join public.work_districts d on d.id=p.work_district_id and d.active
   where p.id<>p_grantee and p.work_district_id<>v_district
     and not p.is_admin and p.approved and p.account_status='approved'
   order by d.label,p.last_name,p.first_name limit 300;
 elsif p_capability='view_institution' then
  return query select r.id,
   left(r.title||case when r.code='' then '' else ' — '||r.code end,220),
   d.label
   from public.district_published_resources r
   join public.work_districts d on d.id=r.work_district_id and d.active
   where r.publication_status='published'
    and not exists(select 1 from public.district_resource_assignments a
     where a.resource_id=r.id and a.work_district_id=v_district)
   order by d.label,r.title limit 300;
 else
  return query select m.id,left(m.title,220),d.label
  from public.inspection_missions m
  join public.inspector_profiles p on p.id=m.created_by
  join public.work_districts d on d.id=p.work_district_id and d.active
  where p.work_district_id<>v_district
  order by d.label,m.title limit 300;
 end if;
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
 where p.id=p_grantee and p.approved=true and not p.is_admin
  and p.account_status='approved';
 if v_recipient_district is null or p_grantee=v_admin then
  raise exception 'Recipient must be an approved inspector with a verified district'
   using errcode='42501';
 end if;
 if p_capability='view_inspector' then
  select p.work_district_id into v_resource_district
  from public.inspector_profiles p
  join public.work_districts d on d.id=p.work_district_id and d.active
  where p.id=p_resource and p.approved and not p.is_admin
  and p.account_status='approved';
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
 if v_resource_district is null then
  raise exception 'Requested resource not eligible' using errcode='42501';
 end if;
 if p_capability='view_institution' then
  if exists(select 1 from public.district_resource_assignments a
    where a.resource_id=p_resource and a.work_district_id=v_recipient_district) then
   raise exception 'Institution is already shared with inspector district' using errcode='22023';
  end if;
 elsif v_resource_district=v_recipient_district then
  raise exception 'Only foreign-district resource eligible' using errcode='42501';
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


commit;
