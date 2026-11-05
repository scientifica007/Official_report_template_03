-- P0.2 QA-only: persist the chair's report/minutes draft on the SAME
-- titularisation_missions ID as committee seats and member submissions.
-- This migration is not part of the current production rollout.
begin;

create table if not exists public.titularisation_report_drafts (
 mission_id uuid primary key references public.titularisation_missions(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 payload jsonb not null,
 revision bigint not null default 1 check (revision >= 1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint titularisation_report_draft_shape check (
  jsonb_typeof(payload)='object'
  and payload->>'schema'='titularisation-committee-lab-v1'
  and jsonb_typeof(payload->'meta')='object'
  and jsonb_typeof(payload->'final')='object'
  and octet_length(payload::text) <= 1048576
 )
);

alter table public.titularisation_report_drafts enable row level security;

drop policy if exists titularisation_report_draft_owner_read
 on public.titularisation_report_drafts;
create policy titularisation_report_draft_owner_read
 on public.titularisation_report_drafts for select to authenticated
 using (
  owner_id=(select auth.uid())
  and public.is_titularisation_owner(mission_id)
 );

-- No direct API writes; the RPC below performs CAS and validates mission owner.
revoke all on table public.titularisation_report_drafts from public,anon,authenticated;
grant select on table public.titularisation_report_drafts to authenticated;

create or replace function public.save_titularisation_report_draft(
 p_mission_id uuid,
 p_payload jsonb,
 p_expected_revision bigint
)
returns bigint
language plpgsql security definer set search_path=''
as $fn$
declare
 v_owner uuid:=(select auth.uid());
 v_mission public.titularisation_missions%rowtype;
 v_revision bigint;
begin
 if v_owner is null or not public.is_titularisation_owner(p_mission_id) then
  raise exception 'Mission owner required' using errcode='42501';
 end if;
 if p_expected_revision is null or p_expected_revision < 0
   or jsonb_typeof(p_payload) is distinct from 'object'
   or p_payload->>'schema' is distinct from 'titularisation-committee-lab-v1'
   or p_payload->>'rubricId' is null
   or jsonb_typeof(p_payload->'meta') is distinct from 'object'
   or jsonb_typeof(p_payload->'final') is distinct from 'object'
   or octet_length(p_payload::text)>1048576 then
  raise exception 'Invalid report draft' using errcode='22023';
 end if;
 select * into v_mission from public.titularisation_missions m
 where m.id=p_mission_id and m.owner_id=v_owner;
 if not found then raise exception 'Mission unavailable' using errcode='42501'; end if;
 if p_payload->>'rubricId' is distinct from v_mission.rubric_id then
  raise exception 'Report rubric differs from the pinned mission rubric'
   using errcode='22023';
 end if;
 if v_mission.rubric_id='lesson_derived_indicators_v1' and
   (v_mission.rubric_profile->>'frozen' is distinct from 'true'
    or p_payload #> '{final,grading,profile,weights}'
       is distinct from v_mission.rubric_profile->'weights'
    or p_payload #>> '{final,grading,profile,frozen}' is distinct from 'true') then
   raise exception 'Report weights differ from the pinned mission weights'
    using errcode='22023';
 end if;

 if p_expected_revision=0 then
  insert into public.titularisation_report_drafts(mission_id,owner_id,payload)
  values(p_mission_id,v_owner,p_payload)
  on conflict (mission_id) do nothing returning revision into v_revision;
 else
  update public.titularisation_report_drafts d
   set payload=p_payload,revision=d.revision+1,updated_at=now()
   where d.mission_id=p_mission_id
    and d.owner_id=v_owner
    and d.revision=p_expected_revision
   returning revision into v_revision;
 end if;
 if v_revision is null then
  raise exception 'Report draft revision conflict: reload before overwriting'
   using errcode='40001';
 end if;
 return v_revision;
end;
$fn$;

revoke all on function public.save_titularisation_report_draft(uuid,jsonb,bigint)
 from public,anon,authenticated;
grant execute on function public.save_titularisation_report_draft(uuid,jsonb,bigint)
 to authenticated;
commit;
