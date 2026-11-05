-- UX-ARCH-04: explicit-district cut-over for legacy directory and institution API.
-- No automatic province mapping, legacy deletion, membership deletion or report rewrite.
-- Admin must link historical institutions to district_published_resources manually.
-- Historical missions remain readable by their existing accepted members via snapshots.
begin;

create or replace function ux_core.legacy_institution_visible(p_legacy uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
 select p_legacy is not null and
  ((select ux_core.is_admin()) or
   ((select ux_core.approved_inspector()) and exists(
    select 1 from public.district_published_resources r
    where r.legacy_institution_id=p_legacy
     and r.publication_status='published'
     and (ux_core.resource_in_my_district(r.id) or
          ux_core.has_grant('view_institution',r.id))
   )));
$fn$;

create or replace function ux_core.inspector_profile_visible(p_target uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
 select p_target is not null and (
  p_target=(select auth.uid()) or
  (select ux_core.is_admin()) or
  ((select ux_core.approved_inspector()) and exists(
   select 1 from public.inspector_profiles p
   where p.id=p_target and p.approved and not p.is_admin
    and p.account_status='approved'
    and ((p.work_district_id is not null and
          p.work_district_id=(select ux_core.my_district()))
         or ux_core.has_grant('view_inspector',p.id))
  )));
$fn$;

create or replace function ux_core.legacy_change_visible(p_change uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
 select exists(select 1 from public.institution_changes c
  where c.id=p_change and ux_core.legacy_institution_visible(c.institution_id));
$fn$;

revoke all on function ux_core.legacy_institution_visible(uuid),
 ux_core.inspector_profile_visible(uuid),
 ux_core.legacy_change_visible(uuid) from public,anon,authenticated;
grant execute on function ux_core.legacy_institution_visible(uuid),
 ux_core.inspector_profile_visible(uuid),
 ux_core.legacy_change_visible(uuid) to authenticated;

-- PostgreSQL permissive policies combine with OR: remove broad policies in
-- the SAME transaction as installing the narrower replacements.
drop policy if exists inspector_profile_read on public.inspector_profiles;
create policy inspector_profile_read on public.inspector_profiles
 for select to authenticated
 using (ux_core.inspector_profile_visible(id));

drop policy if exists institution_read on public.shared_institutions;
create policy institution_read on public.shared_institutions
 for select to authenticated
 using (ux_core.legacy_institution_visible(id));
drop policy if exists institution_insert on public.shared_institutions;
create policy institution_insert on public.shared_institutions
 for insert to authenticated
 with check ((select ux_core.is_admin()) and
  created_by=(select auth.uid()) and updated_by=(select auth.uid()) and version=1);
drop policy if exists institution_update on public.shared_institutions;
create policy institution_update on public.shared_institutions
 for update to authenticated
 using ((select ux_core.is_admin()))
 with check ((select ux_core.is_admin()) and updated_by=(select auth.uid()));

drop policy if exists changes_read on public.institution_changes;
create policy changes_read on public.institution_changes
 for select to authenticated
 using (ux_core.legacy_institution_visible(institution_id));
drop policy if exists notifications_read on public.institution_notifications;
create policy notifications_read on public.institution_notifications
 for select to authenticated
 using (recipient_id=(select auth.uid()) and
        ux_core.legacy_change_visible(change_id));
drop policy if exists notifications_mark_read on public.institution_notifications;
create policy notifications_mark_read on public.institution_notifications
 for update to authenticated
 using (recipient_id=(select auth.uid()) and
        ux_core.legacy_change_visible(change_id))
 with check (recipient_id=(select auth.uid()) and
        ux_core.legacy_change_visible(change_id));

-- SECURITY DEFINER RPCs bypass table RLS; check scope at RPC boundary.
create or replace function public.create_inspection_mission(
 p_institution_id uuid, p_title text,
 p_purpose text default ''::text, p_visit_start date default null,
 p_visit_end date default null)
returns uuid language plpgsql security definer set search_path=''
as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_institution public.shared_institutions%rowtype;
 v_id uuid;
begin
 if v_actor is null or not ux_core.approved_inspector() then
  raise exception 'Approved inspector required' using errcode='42501';
 end if;
 if p_title is null or char_length(btrim(p_title)) not between 3 and 200 or
    char_length(coalesce(p_purpose,''))>3000 or
    (p_visit_start is not null and p_visit_end is not null and p_visit_end<p_visit_start) then
  raise exception 'Invalid mission metadata' using errcode='22023';
 end if;
 if not ux_core.legacy_institution_visible(p_institution_id) then
  raise exception 'Institution not published to your work district' using errcode='42501';
 end if;
 select * into v_institution from public.shared_institutions
 where id=p_institution_id;
 if not found then raise exception 'Institution not found' using errcode='P0002'; end if;
 insert into public.inspection_missions
 (institution_id,institution_snapshot,director_snapshot,title,purpose,
  visit_start,visit_end,created_by)
 values (v_institution.id,v_institution.institution_data,v_institution.director_data,
         btrim(p_title),coalesce(p_purpose,''),p_visit_start,p_visit_end,v_actor)
 returning id into v_id;
 insert into public.inspection_mission_members
  (mission_id,inspector_id,invited_by,membership_status,responded_at)
 values (v_id,v_actor,v_actor,'accepted',now());
 return v_id;
end; $fn$;

create or replace function public.invite_inspection_member(
 p_mission_id uuid, p_inspector_id uuid)
returns void language plpgsql security definer set search_path=''
as $fn$
declare
 v_actor uuid:=(select auth.uid());
 v_title text;v_name text;
begin
 if v_actor is null or not ux_core.approved_inspector()
    or not public.is_accepted_mission_member(p_mission_id) then
  raise exception 'Accepted mission member required' using errcode='42501';
 end if;
 if p_inspector_id is null or p_inspector_id=v_actor or not exists(
   select 1 from public.inspector_profiles p
   where p.id=p_inspector_id and p.approved and not p.is_admin
    and p.account_status='approved' and p.work_district_id is not null
    and (p.work_district_id=(select ux_core.my_district()) or
     exists(select 1 from public.district_access_grants g
      where g.grantee_id=p.id and
       g.grantee_district_id_at_grant=p.work_district_id and
       g.capability='collaborate_mission' and g.resource_id=p_mission_id
       and g.revoked_at is null and g.expires_at>now()))
 ) then
  raise exception 'Invitee requires same work district or active mission grant'
   using errcode='42501';
 end if;
 select m.title,m.institution_snapshot->>'name'
 into v_title,v_name from public.inspection_missions m
 where m.id=p_mission_id and m.status='draft' for update;
 if not found then raise exception 'Mission is unavailable or closed' using errcode='22023'; end if;
 if exists(select 1 from public.inspection_mission_members
           where mission_id=p_mission_id and inspector_id=p_inspector_id) then
  raise exception 'Inspector already invited or participating' using errcode='23505';
 end if;
 insert into public.inspection_mission_members
  (mission_id,inspector_id,invited_by,membership_status)
 values(p_mission_id,p_inspector_id,v_actor,'invited');
 insert into public.inspection_mission_notifications
  (mission_id,recipient_id,actor_id,event_type,description)
 values(p_mission_id,p_inspector_id,v_actor,'invited',
   left('دعوة لمهمة: '||v_title||' — '||coalesce(v_name,''),350));
end; $fn$;

-- Avoid invitations through function defaults for anonymous sessions.
revoke all on function public.create_inspection_mission(uuid,text,text,date,date),
 public.invite_inspection_member(uuid,uuid) from public,anon;
grant execute on function public.create_inspection_mission(uuid,text,text,date,date),
 public.invite_inspection_member(uuid,uuid) to authenticated;
commit;
