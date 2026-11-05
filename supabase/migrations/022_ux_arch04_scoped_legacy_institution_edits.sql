-- UX-ARCH-04 follow-up: allow a professional inspector to maintain existing
-- institutions explicitly assigned to their work district.
-- A view-only exceptional grant does NOT authorize edits. Admin retains full
-- control over creation, institution identity and district assignments.
begin;

create or replace function ux_core.legacy_institution_editable(p_legacy uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
 select p_legacy is not null and (
   (select ux_core.is_admin()) or
   ((select ux_core.approved_inspector()) and exists (
     select 1 from public.district_published_resources r
     join public.district_resource_assignments a on a.resource_id=r.id
     where r.legacy_institution_id=p_legacy
       and r.publication_status='published'
       and a.work_district_id=(select ux_core.my_district())
   ))
 );
$fn$;

revoke all on function ux_core.legacy_institution_editable(uuid)
 from public,anon,authenticated;
grant execute on function ux_core.legacy_institution_editable(uuid) to authenticated;

drop policy if exists institution_update on public.shared_institutions;
create policy institution_update on public.shared_institutions
 for update to authenticated
 using (ux_core.legacy_institution_editable(id))
 with check (
   ux_core.legacy_institution_editable(id)
   and updated_by=(select auth.uid())
 );

create or replace function public.guard_shared_institution()
returns trigger language plpgsql set search_path=''
as $fn$
declare v_admin boolean := ux_core.is_admin();
begin
 if (select auth.uid()) is null then
   raise exception 'Authentication is required' using errcode='42501';
 end if;
 if new.updated_by<>(select auth.uid()) then
   raise exception 'updated_by must be the current account' using errcode='42501';
 end if;
 if tg_op='INSERT' then
   if not v_admin then
     raise exception 'Only Admin can create a historic institution' using errcode='42501';
   end if;
   if new.created_by<>(select auth.uid()) or new.version<>1 then
     raise exception 'Invalid creator or initial version' using errcode='42501';
   end if;
 else
   if not ux_core.legacy_institution_editable(old.id) then
     raise exception 'Institution is outside this work district' using errcode='42501';
   end if;
   if new.created_by<>old.created_by or new.created_at<>old.created_at
      or new.id<>old.id then
     raise exception 'Immutable legacy record fields cannot change' using errcode='42501';
   end if;
   -- District assignment is Admin-managed; identity corrections likewise
   -- require Admin. Inspectors can still maintain director and other fields.
   if not v_admin and (
     new.name is distinct from old.name
     or new.code is distinct from old.code
     or new.wilaya is distinct from old.wilaya
     or new.institution_data->>'name' is distinct from old.institution_data->>'name'
     or new.institution_data->>'code' is distinct from old.institution_data->>'code'
     or new.institution_data->>'wilaya' is distinct from old.institution_data->>'wilaya'
   ) then
     raise exception 'Only Admin can change institutional identity'
       using errcode='42501';
   end if;
   if new.version<>old.version+1 then
     raise exception 'Institution version must increase exactly once' using errcode='23514';
   end if;
 end if;
 new.updated_at=now();
 return new;
end;
$fn$;
commit;
