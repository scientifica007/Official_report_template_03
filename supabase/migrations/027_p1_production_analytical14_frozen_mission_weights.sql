-- P1.1: production analytical rubric (14 indicators), with owner-frozen
-- per-mission weights matching the existing QA rubric engine.
-- No production member seats are added, and existing 5/10 missions remain intact.
begin;

alter table public.titularisation_missions
 drop constraint if exists titularisation_missions_rubric_id_check;
alter table public.titularisation_missions
 add constraint titularisation_missions_rubric_id_check
 check (rubric_id in ('lesson_grouped_5_v1','lesson_inspector_10_v1',
                     'lesson_derived_indicators_v1'));

alter table public.titularisation_missions
 add constraint titularisation_prod_rubric_profile_scope
 check (
 (rubric_id <> 'lesson_derived_indicators_v1' and rubric_profile is null)
 or
 (rubric_id = 'lesson_derived_indicators_v1'
  and (rubric_profile is null or (
   jsonb_typeof(rubric_profile)='object'
   and rubric_profile->'frozen'='true'::jsonb
   and jsonb_typeof(rubric_profile->'weights')='object'
  )))
 );

-- Authorized inspector can freeze once, only before the first draft is saved.
-- 14 exact identifiers, nonnegative half points, group totals 12/8/8/6/6.
create function public.freeze_titularisation_analytical_weights(
 p_mission_id uuid,p_weights jsonb
) returns jsonb language plpgsql security definer set search_path='' as $rubric14$
declare
 v_uid uuid:=(select auth.uid());
 m public.titularisation_missions%rowtype;
 v text;
 v_value jsonb;
 v_number numeric;
 group_cap numeric;
 group_sum numeric;
 item_count integer;
 frozen jsonb;
begin
 if v_uid is null or not exists(
  select 1 from public.inspector_profiles p
  where p.id=v_uid and p.approved=true
    and p.account_status='approved' and p.is_admin=false
 ) then
  raise exception 'Approved professional inspector required' using errcode='42501';
 end if;
 select * into m from public.titularisation_missions
 where id=p_mission_id and owner_id=v_uid for update;
 if not found or m.status<>'draft'
    or m.rubric_id<>'lesson_derived_indicators_v1' then
  raise exception 'Owned open analytical mission required' using errcode='42501';
 end if;
 if m.rubric_profile is not null or exists(
   select 1 from public.titularisation_report_drafts d
   where d.mission_id=p_mission_id
 ) then
  raise exception 'Mission weights already frozen or report already started' using errcode='22023';
 end if;
 if jsonb_typeof(p_weights) is distinct from 'object'
  or (select count(*) from jsonb_object_keys(p_weights))<>14 then
  raise exception 'Exactly 14 indicator weights required' using errcode='22023';
 end if;
 for v,group_cap in
  select * from (values
   ('g1',12::numeric),('g2',8::numeric),('g3',8::numeric),
   ('g4',6::numeric),('g5',6::numeric)) caps(group_id,cap)
 loop
  select count(*),coalesce(sum((value::text)::numeric),0)
   into item_count,group_sum
   from jsonb_each(p_weights)
   where key like v||'_%' and jsonb_typeof(value)='number';
  if group_sum<>group_cap or
   item_count<>(case v when 'g1' then 3 when 'g2' then 3
      when 'g3' then 4 else 2 end) then
   raise exception 'Group weights must sum to 12,8,8,6,6' using errcode='22023';
  end if;
 end loop;
 for v,v_value in select key,value from jsonb_each(p_weights) loop
  if v not in ('g1_1','g1_2','g1_3','g2_1','g2_2','g2_3',
    'g3_1','g3_2','g3_3','g3_4','g4_1','g4_2','g5_1','g5_2')
    or jsonb_typeof(v_value) is distinct from 'number' then
   raise exception 'Unknown or nonnumeric indicator weight' using errcode='22023';
  end if;
  v_number:=(v_value::text)::numeric;
  if v_number<0 or mod(v_number*2,1)<>0 then
   raise exception 'Weights must be nonnegative half-points' using errcode='22023';
  end if;
 end loop;
 frozen:=jsonb_build_object('weights',p_weights,'frozen',true);
 update public.titularisation_missions
 set rubric_profile=frozen,updated_at=now()
 where id=p_mission_id and owner_id=v_uid;
 return frozen;
end;
$rubric14$;

revoke all on function public.freeze_titularisation_analytical_weights(uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.freeze_titularisation_analytical_weights(uuid,jsonb)
 to authenticated;

-- Keep the pre-existing institution ownership checks and return type.
create or replace function public.create_titularisation_mission(
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
 or p_rubric_id not in ('lesson_grouped_5_v1','lesson_inspector_10_v1','lesson_derived_indicators_v1')
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


-- A draft must match the frozen server-side 14-item profile.
create or replace function public.save_titularisation_report_draft(
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
 -- A 14-indicator production mission must have a frozen, server-validated
 -- profile identical to the report's final grading; no browser-defined weights.
 if v_mission.rubric_id='lesson_derived_indicators_v1' and (
   v_mission.rubric_profile is null or
   v_mission.rubric_profile->'frozen' is distinct from 'true'::jsonb or
   p_payload #> '{final,grading,profile}' is distinct from v_mission.rubric_profile
 ) then
  raise exception 'Report weights differ from pinned analytical mission'
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

commit;
