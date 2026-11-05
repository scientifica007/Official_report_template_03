-- UX-ARCH-04 emergency RLS rollback captured directly from production BEFORE 019-022.
-- CAUTION: restores the historically overly broad access policies (a security regression).
-- Run ONLY if the new policies cause a critical production outage; restore via a tested independent database backup when possible.
-- This file does NOT contain application records, credentials, passwords, or API keys.
-- Keep a separate offline database backup. Validate rollbacks on QA before any production use.
begin;

CREATE OR REPLACE FUNCTION public.is_approved_inspector()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.inspector_profiles
 where id=(select auth.uid()) and approved=true);
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_inspector()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.inspector_profiles
 where id=(select auth.uid()) and approved=true and is_admin=true);
$function$;

CREATE OR REPLACE FUNCTION public.guard_shared_institution()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if (select auth.uid()) is null or not public.is_approved_inspector() then
   raise exception 'An approved inspector is required' using errcode='42501';
 end if;
 if new.updated_by<>(select auth.uid()) then raise exception 'updated_by must be current inspector' using errcode='42501'; end if;
 if tg_op='INSERT' then
   if new.created_by<>(select auth.uid()) or new.version<>1 then
     raise exception 'Invalid creator or initial version' using errcode='42501';
   end if;
 else
   if new.created_by<>old.created_by or new.created_at<>old.created_at or new.id<>old.id then
     raise exception 'Immutable institution identity fields cannot change' using errcode='42501';
   end if;
   if new.version<>old.version+1 then
     raise exception 'Institution version must increase exactly once' using errcode='23514';
   end if;
 end if;
 new.updated_at=now();
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.audit_institution_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 select id,audit_id from public.inspector_profiles
 where approved=true and id<>new.updated_by;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.create_inspection_mission(p_institution_id uuid, p_title text, p_purpose text DEFAULT ''::text, p_visit_start date DEFAULT NULL::date, p_visit_end date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=(select auth.uid());
 v_institution public.shared_institutions%rowtype;
 v_id uuid;
begin
 if v_actor is null or not public.is_approved_inspector() then
  raise exception 'Approved inspector required' using errcode='42501';
 end if;
 if p_title is null or char_length(btrim(p_title)) not between 3 and 200 or
    char_length(coalesce(p_purpose,''))>3000 or
    (p_visit_start is not null and p_visit_end is not null and p_visit_end<p_visit_start) then
  raise exception 'Invalid mission metadata' using errcode='22023';
 end if;
 select * into v_institution from public.shared_institutions
 where id=p_institution_id;
 if not found then raise exception 'Institution not found' using errcode='P0002';end if;
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
end; $function$;

CREATE OR REPLACE FUNCTION public.invite_inspection_member(p_mission_id uuid, p_inspector_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor uuid:=(select auth.uid());
 v_title text;v_name text;
begin
 if v_actor is null or not public.is_accepted_mission_member(p_mission_id) then
  raise exception 'Accepted mission member required' using errcode='42501';
 end if;
 if p_inspector_id is null or p_inspector_id=v_actor or not exists(
   select 1 from public.inspector_profiles
   where id=p_inspector_id and approved=true and account_status='approved') then
  raise exception 'Invitee must be a different approved inspector' using errcode='22023';
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
end; $function$;

drop policy if exists inspector_profile_read on public.inspector_profiles;
create policy inspector_profile_read on public.inspector_profiles for select to authenticated
 using (((id = ( SELECT auth.uid() AS uid)) OR (approved AND is_approved_inspector()) OR is_admin_inspector()));

drop policy if exists changes_read on public.institution_changes;
create policy changes_read on public.institution_changes for select to authenticated
 using (is_approved_inspector());

drop policy if exists notifications_mark_read on public.institution_notifications;
create policy notifications_mark_read on public.institution_notifications for update to authenticated
 using (((recipient_id = ( SELECT auth.uid() AS uid)) AND is_approved_inspector()))
 with check (((recipient_id = ( SELECT auth.uid() AS uid)) AND is_approved_inspector()));

drop policy if exists notifications_read on public.institution_notifications;
create policy notifications_read on public.institution_notifications for select to authenticated
 using (((recipient_id = ( SELECT auth.uid() AS uid)) AND is_approved_inspector()));

drop policy if exists institution_insert on public.shared_institutions;
create policy institution_insert on public.shared_institutions for insert to authenticated
 with check ((is_approved_inspector() AND (created_by = ( SELECT auth.uid() AS uid)) AND (updated_by = ( SELECT auth.uid() AS uid)) AND (version = 1)));

drop policy if exists institution_read on public.shared_institutions;
create policy institution_read on public.shared_institutions for select to authenticated
 using (is_approved_inspector());

drop policy if exists institution_update on public.shared_institutions;
create policy institution_update on public.shared_institutions for update to authenticated
 using (is_approved_inspector())
 with check ((is_approved_inspector() AND (updated_by = ( SELECT auth.uid() AS uid))));

commit;
