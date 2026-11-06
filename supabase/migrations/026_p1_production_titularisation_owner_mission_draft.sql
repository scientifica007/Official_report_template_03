-- P1 pilot: real inspector-owned teacher titularisation task and chair's
-- report/minutes draft in production. Committee member accounts/links are NOT
-- enabled by this migration and QA data is NOT transferred.
-- Existing inspector profiles, institutions and inspection reports are untouched.
begin;

create table public.titularisation_missions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 title text not null check (length(btrim(title)) between 3 and 200),
 rubric_id text not null check (rubric_id in ('lesson_grouped_5_v1','lesson_inspector_10_v1')),
 rubric_profile jsonb,
 institution_resource_id uuid not null references public.district_published_resources(id),
 institution_name_snapshot text not null check (length(btrim(institution_name_snapshot)) > 0),
 institution_code_snapshot text not null,
 status text not null default 'draft' check (status in ('draft','closed')),
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index titularisation_missions_owner_created_idx
 on public.titularisation_missions(owner_id,created_at desc);

alter table public.titularisation_missions enable row level security;
create policy titularisation_mission_owner_read
 on public.titularisation_missions for select to authenticated
 using (owner_id=(select auth.uid())
 and exists(select 1 from public.inspector_profiles p
 where p.id=(select auth.uid()) and p.approved=true
 and p.account_status='approved' and p.is_admin=false));
revoke all on public.titularisation_missions from public,anon,authenticated;
grant select on public.titularisation_missions to authenticated;

create table public.titularisation_report_drafts (
 mission_id uuid primary key references public.titularisation_missions(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 payload jsonb not null,
 revision bigint not null default 1 check (revision>=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint titularisation_draft_valid check (
  jsonb_typeof(payload)='object'
  and payload->>'schema'='titularisation-committee-lab-v1'
  and jsonb_typeof(payload->'meta')='object'
  and jsonb_typeof(payload->'final')='object'
  and octet_length(payload::text)<=1048576
 )
);
alter table public.titularisation_report_drafts enable row level security;
create policy titularisation_report_owner_read
 on public.titularisation_report_drafts for select to authenticated
 using (owner_id=(select auth.uid()) and exists(
 select 1 from public.titularisation_missions m where m.id=mission_id
 and m.owner_id=(select auth.uid())));
revoke all on public.titularisation_report_drafts from public,anon,authenticated;
grant select on public.titularisation_report_drafts to authenticated;

create function public.create_titularisation_mission(
 p_title text,p_rubric_id text,p_institution_resource_id uuid
)
returns uuid language plpgsql security definer set search_path=''
as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_name text;
 v_code text;
 v_id uuid;
begin
 if v_uid is null or not exists(
  select 1 from public.inspector_profiles p where p.id=v_uid
  and p.approved=true and p.account_status='approved' and p.is_admin=false
 ) then
  raise exception 'Approved inspector account required' using errcode='42501';
 end if;
 if p_title is null or length(btrim(p_title)) not between 3 and 200
 or p_rubric_id not in ('lesson_grouped_5_v1','lesson_inspector_10_v1')
 or p_institution_resource_id is null then
  raise exception 'Invalid titularisation mission input' using errcode='22023';
 end if;
 -- Do not trust a client-supplied district or a client institution name.
 -- These rights are checked against the assigned production catalog.
 select r.title,r.code into v_name,v_code
 from public.district_published_resources r
 where r.id=p_institution_resource_id
 and r.resource_kind='institution' and r.publication_status='published'
 and (ux_core.resource_in_my_district(r.id)
      or ux_core.has_grant('view_institution',r.id));
 if not found then
  raise exception 'Institution not available to inspector' using errcode='42501';
 end if;
 insert into public.titularisation_missions
  (owner_id,title,rubric_id,institution_resource_id,
   institution_name_snapshot,institution_code_snapshot)
 values (v_uid,btrim(p_title),p_rubric_id,p_institution_resource_id,v_name,v_code)
 returning id into v_id;
 return v_id;
end;
$fn$;

revoke all on function public.create_titularisation_mission(text,text,uuid)
 from public,anon,authenticated;
grant execute on function public.create_titularisation_mission(text,text,uuid) to authenticated;

create function public.save_titularisation_report_draft(
 p_mission_id uuid,p_payload jsonb,p_expected_revision bigint
)
returns bigint language plpgsql security definer set search_path=''
as $fn$
declare
 v_uid uuid:=(select auth.uid());
 v_mission public.titularisation_missions%rowtype;
 v_revision bigint;
begin
 if v_uid is null or not exists(
  select 1 from public.inspector_profiles p where p.id=v_uid
  and p.approved=true and p.account_status='approved' and p.is_admin=false
 ) then
  raise exception 'Approved inspector account required' using errcode='42501';
 end if;
 if p_expected_revision is null or p_expected_revision < 0 or
  jsonb_typeof(p_payload) is distinct from 'object' or
  p_payload->>'schema' is distinct from 'titularisation-committee-lab-v1' or
  p_payload->>'rubricId' is null or
  jsonb_typeof(p_payload->'meta') is distinct from 'object' or
  jsonb_typeof(p_payload->'final') is distinct from 'object' or
  octet_length(p_payload::text)>1048576 then
  raise exception 'Invalid report draft' using errcode='22023';
 end if;
 select * into v_mission from public.titularisation_missions
 where id=p_mission_id and owner_id=v_uid and status='draft';
 if not found then
  raise exception 'Mission unavailable to inspector' using errcode='42501';
 end if;
 if p_payload->>'rubricId' is distinct from v_mission.rubric_id then
  raise exception 'Report rubric differs from mission rubric' using errcode='22023';
 end if;
 -- P1 always references the resource of the same original mission.
 -- This prevents invisible cross-district replacement in a report JSON.
 if p_payload #>> '{meta,institutionResourceId}' is distinct from
    v_mission.institution_resource_id::text or
    p_payload #>> '{meta,institution}' is distinct from
    v_mission.institution_name_snapshot then
  raise exception 'Report institution differs from original mission'
   using errcode='22023';
 end if;
 if p_expected_revision=0 then
  insert into public.titularisation_report_drafts(mission_id,owner_id,payload)
  values (p_mission_id,v_uid,p_payload)
  on conflict (mission_id) do nothing returning revision into v_revision;
 else
  update public.titularisation_report_drafts d
  set payload=p_payload,revision=d.revision+1,updated_at=now()
  where d.mission_id=p_mission_id and d.owner_id=v_uid
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
