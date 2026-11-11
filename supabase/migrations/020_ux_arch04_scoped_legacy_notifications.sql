-- UX-ARCH-04: prevent cross-district creation of institution change notifications.
-- Existing historical audit/notifications are retained; their RLS reads are gated by 019.
begin;
create or replace function public.audit_institution_change()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare delta jsonb:='{}'::jsonb; fld text; oldv jsonb; newv jsonb; audit_id uuid; audit_action text;
begin
 if tg_op='INSERT' then
  delta:=jsonb_build_object('institution',jsonb_build_object('old',null,'new',new.institution_data),
                           'director',jsonb_build_object('old',null,'new',new.director_data));
  audit_action:='created';
 else
  for fld in select key from jsonb_object_keys(old.institution_data || new.institution_data) as key loop
   oldv:=old.institution_data->fld;newv:=new.institution_data->fld;
   if oldv is distinct from newv then
    delta:=delta||jsonb_build_object('institution.'||fld,jsonb_build_object('old',oldv,'new',newv));
   end if;
  end loop;
  for fld in select key from jsonb_object_keys(old.director_data || new.director_data) as key loop
   oldv:=old.director_data->fld;newv:=new.director_data->fld;
   if oldv is distinct from newv then
    delta:=delta||jsonb_build_object('director.'||fld,jsonb_build_object('old',oldv,'new',newv));
   end if;
  end loop;
  if delta='{}'::jsonb then return new; end if;
  audit_action:='updated';
 end if;
 insert into public.institution_changes(institution_id,actor_id,action,changes)
 values(new.id,new.updated_by,audit_action,delta) returning id into audit_id;
 insert into public.institution_notifications(recipient_id,change_id)
 select p.id,audit_id from public.inspector_profiles p
 where p.approved=true and p.account_status='approved' and p.id<>new.updated_by
   and (
    p.is_admin
    or (not p.is_admin and p.work_district_id is not null and exists(
      select 1 from public.district_published_resources r
      where r.legacy_institution_id=new.id and r.publication_status='published'
       and (
        exists(select 1 from public.district_resource_assignments a
               where a.resource_id=r.id and a.work_district_id=p.work_district_id)
        or exists(select 1 from public.district_access_grants g
          where g.grantee_id=p.id and g.capability='view_institution'
          and g.resource_id=r.id and g.grantee_district_id_at_grant=p.work_district_id
          and g.revoked_at is null and g.expires_at>now())
       )
    ))
   );
 return new;
end; $fn$;
commit;
