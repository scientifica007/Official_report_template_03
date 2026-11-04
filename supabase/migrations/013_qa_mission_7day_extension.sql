-- M5.9 (QA ONLY) — Owner-controlled seven-day renewal.
-- Applies only to the disposable Supabase QA project. Do not deploy to production.
-- Does NOT resurrect closed missions, revoked members or expired direct-link tokens.
begin;

alter table public.titularisation_access_events
 drop constraint titularisation_access_events_kind_check;
alter table public.titularisation_access_events
 add constraint titularisation_access_events_kind_check check (kind in (
  'mission_created','seat_issued','password_rotated','seat_revoked',
  'contribution_saved','contribution_submitted','mission_closed',
  'account_deleted','link_issued','mission_extended'
 ));

create or replace function public.extend_titularisation_qa_mission_7_days(
 p_mission_id uuid
) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $extend$
declare
 v_mission public.titularisation_missions%rowtype;
 v_expiry timestamptz;
begin
 if (select auth.uid()) is null
   or p_mission_id is null
   or not public.is_titularisation_owner(p_mission_id) then
  raise exception 'Only this mission''s approved inspector may renew its validity'
   using errcode='42501';
 end if;

 select * into v_mission
 from public.titularisation_missions
 where id=p_mission_id for update;
 if not found or v_mission.status <> 'draft' or v_mission.closed_at is not null then
  raise exception 'Only a not-closed mission may be extended' using errcode='22023';
 end if;

 -- Seven FULL days from the later of now or previous end. Never shorten.
 v_expiry:=greatest(now(),v_mission.expires_at)+interval '7 days';
 if v_expiry>v_mission.created_at+interval '30 days' then
  raise exception 'Renewal exceeds the 30-day overall mission limit'
   using errcode='22023';
 end if;

 update public.titularisation_missions set expires_at=v_expiry
 where id=p_mission_id and status='draft';

 -- Existing active accounts are prolonged; no replacement accounts, no
 -- edits to member marks, notes, submissions, prior revisions or grading.
 update public.titularisation_seats set expires_at=v_expiry
 where mission_id=p_mission_id and status='active' and revoked_at is null;

 insert into public.titularisation_access_events
  (mission_id,seat_code,actor_id,kind,description)
 values(p_mission_id,null,(select auth.uid()),'mission_extended',
  'QA 7-day extension; old direct links not reactivated');

 -- Link generation is a separate explicit Edge operation: new secrets are
 -- minted and encrypted, and the earlier invitation is invalidated.
 return v_expiry;
end;
$extend$;

revoke all on function public.extend_titularisation_qa_mission_7_days(uuid)
 from public,anon,authenticated;
grant execute on function public.extend_titularisation_qa_mission_7_days(uuid)
 to authenticated;

commit;
