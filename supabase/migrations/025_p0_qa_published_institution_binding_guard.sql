-- QA-only P0: guard the optional institution UUID carried in the SAME
-- report draft; never trust a client-supplied district/resource association.
-- No production registry rows are copied or changed.
begin;
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
 v_institution_ref text;
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
 -- Optional published catalog ID. A typed institution name alone remains a
 -- QA draft; an ID can never refer to a foreign or unpublished resource.
 v_institution_ref:=coalesce(p_payload #>> '{meta,institutionResourceId}','');
 if v_institution_ref<>'' then
  if v_institution_ref !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}
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

 then
   raise exception 'Invalid published institution identifier' using errcode='22023';
  end if;
  if not exists(
   select 1 from public.district_published_resources r
   where r.id=v_institution_ref::uuid
     and r.resource_kind='institution'
     and r.publication_status='published'
     and r.title=(p_payload #>> '{meta,institution}')
     and ux_core.approved_inspector()
     and (ux_core.resource_in_my_district(r.id)
          or ux_core.has_grant('view_institution',r.id))
  ) then
   raise exception 'Institution is not published to the inspector district'
    using errcode='42501';
  end if;
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
