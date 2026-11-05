-- UX-ARCH-04: preserve colleague identity within already-accepted shared missions.
-- Do not expose foreign institutions, unrelated inspectors, or private records.
begin;
create or replace function ux_core.inspector_profile_visible(p_target uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
 select p_target is not null and (
  p_target=(select auth.uid())
  or (select ux_core.is_admin())
  or (
   (select ux_core.approved_inspector())
   and exists (
    select 1 from public.inspector_profiles p
    where p.id=p_target
      and p.approved=true
      and not p.is_admin
      and p.account_status='approved'
      and (
        (p.work_district_id is not null and
         p.work_district_id=(select ux_core.my_district()))
        or ux_core.has_grant('view_inspector',p.id)
        or exists (
          select 1 from public.inspection_mission_members me
          join public.inspection_mission_members peer
            on peer.mission_id=me.mission_id
          where me.inspector_id=(select auth.uid())
            and me.membership_status='accepted'
            and peer.inspector_id=p.id
            and peer.membership_status='accepted'
        )
      )
   )
  )
 );
$fn$;
revoke all on function ux_core.inspector_profile_visible(uuid)
 from public,anon,authenticated;
grant execute on function ux_core.inspector_profile_visible(uuid) to authenticated;
commit;
