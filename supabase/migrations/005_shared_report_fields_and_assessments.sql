-- M3.3: shared report supplementary fields and optional assessments.
-- Additive migration. Depends on 003 and 004.
begin;
create table if not exists public.inspection_report_field_events (
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null references public.inspection_missions(id) on delete restrict,
 field_group text not null check(field_group in ('mission','summary')),
 field_key text not null,
 field_value text not null check(char_length(field_value)<=30000),
 author_id uuid not null references auth.users(id) on delete restrict,
 request_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(mission_id,author_id,request_id)
);
create index if not exists inspection_report_field_events_lookup
 on public.inspection_report_field_events(mission_id,field_group,field_key,created_at desc,id desc);
create table if not exists public.inspection_assessment_events (
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null references public.inspection_missions(id) on delete restrict,
 item_id text not null references public.inspection_catalog_targets(item_id),
 assessment text not null check(assessment in ('','compliant','non_compliant','not_applicable')),
 author_id uuid not null references auth.users(id) on delete restrict,
 request_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(mission_id,author_id,request_id)
);
create index if not exists inspection_assessment_events_lookup
 on public.inspection_assessment_events(mission_id,item_id,created_at desc,id desc);

alter table public.inspection_report_field_events enable row level security;
alter table public.inspection_assessment_events enable row level security;
create policy inspection_report_field_events_read on public.inspection_report_field_events
 for select to authenticated using(public.is_accepted_mission_member(mission_id));
create policy inspection_assessment_events_read on public.inspection_assessment_events
 for select to authenticated using(public.is_accepted_mission_member(mission_id));
revoke all on public.inspection_report_field_events from public,anon,authenticated;
revoke all on public.inspection_assessment_events from public,anon,authenticated;
grant select on public.inspection_report_field_events to authenticated;
grant select on public.inspection_assessment_events to authenticated;

-- Optimistic compare-and-append; the latest event is the canonical value.
-- Mission row lock serializes edits across members and rejects stale revisions.
create or replace function public.set_inspection_report_field(
 p_mission_id uuid,p_group text,p_key text,p_value text,
 p_expected_event_id uuid,p_request_id uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_last uuid;v_id uuid;v_prev public.inspection_report_field_events%rowtype;
begin
 if v_actor is null or not public.is_accepted_mission_member(p_mission_id) then
  raise exception 'Accepted inspector membership required' using errcode='42501';end if;
 perform 1 from public.inspection_missions where id=p_mission_id and status='draft' for update;
 if not found then raise exception 'Mission closed' using errcode='42501';end if;
 if p_request_id is null or p_group is null or p_key is null or p_value is null or
  char_length(p_value)>30000 or not (
    (p_group='mission' and p_key in ('period','previousReports','monthYear')) or
    (p_group='summary' and p_key in ('generalAssessment','generalRecommendations'))
  ) then raise exception 'Invalid report field' using errcode='22023';end if;
 select * into v_prev from public.inspection_report_field_events where mission_id=p_mission_id
   and author_id=v_actor and request_id=p_request_id;
 if found then
  if v_prev.field_group<>p_group or v_prev.field_key<>p_key or v_prev.field_value<>p_value then
   raise exception 'Request ID reused with different payload' using errcode='23505';end if;
  return v_prev.id;
 end if;
 select id into v_last from public.inspection_report_field_events
  where mission_id=p_mission_id and field_group=p_group and field_key=p_key
  order by created_at desc,id desc limit 1;
 if v_last is distinct from p_expected_event_id then
  raise exception 'Field changed by another inspector; refresh before editing' using errcode='40001';end if;
 insert into public.inspection_report_field_events(mission_id,field_group,field_key,field_value,author_id,request_id)
 values(p_mission_id,p_group,p_key,p_value,v_actor,p_request_id) returning id into v_id;
 return v_id;
end $$;

create or replace function public.set_inspection_assessment(
 p_mission_id uuid,p_item_id text,p_assessment text,
 p_expected_event_id uuid,p_request_id uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid());v_last uuid;v_id uuid;v_prev public.inspection_assessment_events%rowtype;
begin
 if v_actor is null or not public.is_accepted_mission_member(p_mission_id) then
  raise exception 'Accepted inspector membership required' using errcode='42501';end if;
 perform 1 from public.inspection_missions where id=p_mission_id and status='draft' for update;
 if not found then raise exception 'Mission closed' using errcode='42501';end if;
 if p_request_id is null or p_assessment is null or
   p_assessment not in ('','compliant','non_compliant','not_applicable') or
   not exists(select 1 from public.inspection_catalog_targets where item_id=p_item_id) then
  raise exception 'Invalid assessment or official item' using errcode='22023';end if;
 select * into v_prev from public.inspection_assessment_events
  where mission_id=p_mission_id and author_id=v_actor and request_id=p_request_id;
 if found then
  if v_prev.item_id<>p_item_id or v_prev.assessment<>p_assessment then
   raise exception 'Request ID reused with different payload' using errcode='23505';end if;
  return v_prev.id;
 end if;
 select id into v_last from public.inspection_assessment_events
  where mission_id=p_mission_id and item_id=p_item_id order by created_at desc,id desc limit 1;
 if v_last is distinct from p_expected_event_id then
  raise exception 'Assessment changed by another inspector; refresh before editing' using errcode='40001';end if;
 insert into public.inspection_assessment_events(mission_id,item_id,assessment,author_id,request_id)
 values(p_mission_id,p_item_id,p_assessment,v_actor,p_request_id) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.set_inspection_report_field(uuid,text,text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.set_inspection_assessment(uuid,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.set_inspection_report_field(uuid,text,text,text,uuid,uuid) to authenticated;
grant execute on function public.set_inspection_assessment(uuid,text,text,uuid,uuid) to authenticated;
commit;
