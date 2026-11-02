-- M5.6: QA-first analytical 14-indicator rubric.
-- Every score is checked against a single inspector-frozen per-mission
-- profile. Existing grouped5/inspector10 missions are NOT migrated or changed.
begin;
alter table public.titularisation_missions
 drop constraint if exists titularisation_missions_rubric_id_check;
alter table public.titularisation_missions
 add constraint titularisation_missions_rubric_id_check
 check (rubric_id in ('lesson_grouped_5_v1','lesson_inspector_10_v1',
                     'lesson_derived_indicators_v1'));
alter table public.titularisation_missions
 add column if not exists rubric_profile jsonb;
alter table public.titularisation_missions
 add constraint titularisation_analytical_profile_scope
 check ((rubric_id='lesson_derived_indicators_v1')
   or rubric_profile is null);

-- Individual group caps and the 14 immutable item IDs match the tested
-- score engine exactly. Each group sums to its existing group cap.
create or replace function public.freeze_titularisation_analytical_weights(
 p_mission_id uuid,p_weights jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.titularisation_missions%rowtype;
 v text;w jsonb;v_value jsonb;v_number numeric;
 group_cap numeric;group_sum numeric;item_count integer;
begin
 if not public.is_titularisation_owner(p_mission_id) then
  raise exception 'Mission owner required' using errcode='42501';
 end if;
 select * into m from public.titularisation_missions
  where id=p_mission_id for update;
 if not found or m.status<>'draft' or m.expires_at<=now()
    or m.rubric_id<>'lesson_derived_indicators_v1' then
  raise exception 'Open analytical mission required' using errcode='42501';
 end if;
 if m.rubric_profile is not null then
  raise exception 'Analytical weights already frozen' using errcode='22023';
 end if;
 if exists(select 1 from public.titularisation_seats s
  where s.mission_id=m.id and s.status<>'vacant')
 or exists(select 1 from public.titularisation_contributions c where c.mission_id=m.id) then
  raise exception 'Cannot freeze after issuing a seat or receiving grades' using errcode='22023';
 end if;
 if jsonb_typeof(p_weights) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_weights))<>14 then
  raise exception 'Exactly 14 indicator weights required' using errcode='22023';
 end if;
 for v,group_cap in
  select * from (values
   ('g1',12::numeric),('g2',8::numeric),('g3',8::numeric),
   ('g4',6::numeric),('g5',6::numeric)) as caps(group_id,cap)
 loop
  select count(*),coalesce(sum((value::text)::numeric),0)
  into item_count,group_sum
  from jsonb_each(p_weights)
  where key like v||'_%'
    and jsonb_typeof(value)='number';
  if group_sum<>group_cap or
    item_count<>case v when 'g1' then 3 when 'g2' then 3
                        when 'g3' then 4 else 2 end then
   raise exception 'Group caps must sum to 12,8,8,6,6' using errcode='22023';
  end if;
 end loop;
 for v,v_value in select key,value from jsonb_each(p_weights) loop
  if v not in (
   'g1_1','g1_2','g1_3','g2_1','g2_2','g2_3',
   'g3_1','g3_2','g3_3','g3_4','g4_1','g4_2','g5_1','g5_2')
    or jsonb_typeof(v_value) is distinct from 'number' then
   raise exception 'Unknown or nonnumeric indicator weight' using errcode='22023';
  end if;
  v_number:=(v_value::text)::numeric;
  if v_number<0 or mod(v_number*2,1)<>0 then
   raise exception 'Weights must be nonnegative half-points' using errcode='22023';
  end if;
 end loop;
 w:=jsonb_build_object('weights',p_weights,'frozen',true);
 update public.titularisation_missions set rubric_profile=w where id=m.id;
 return w;
end; $$;
revoke all on function public.freeze_titularisation_analytical_weights(uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.freeze_titularisation_analytical_weights(uuid,jsonb)
 to authenticated;

create or replace function public.create_titularisation_mission(
 p_title text,p_rubric_id text,p_expiry_hours integer default 168
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null or not public.is_approved_inspector() then
  raise exception 'Approved inspector required' using errcode='42501';
 end if;
 if p_title is null or char_length(btrim(p_title)) not between 3 and 200
 or p_rubric_id is null or p_rubric_id not in (
 'lesson_grouped_5_v1','lesson_inspector_10_v1','lesson_derived_indicators_v1')
 or p_expiry_hours is null or p_expiry_hours not between 1 and 720 then
  raise exception 'Invalid mission options' using errcode='22023';
 end if;
 insert into public.titularisation_missions(owner_id,title,rubric_id,expires_at)
 values((select auth.uid()),btrim(p_title),p_rubric_id,
  now()+make_interval(hours=>p_expiry_hours)) returning id into v_id;
 insert into public.titularisation_seats(mission_id,seat_code)
 values(v_id,'member1'),(v_id,'member2'),(v_id,'member3');
 insert into public.titularisation_access_events(mission_id,actor_id,kind)
 values(v_id,(select auth.uid()),'mission_created');
 return v_id;
end; $$;
revoke all on function public.create_titularisation_mission(text,text,integer)
 from public,anon,authenticated;
grant execute on function public.create_titularisation_mission(text,text,integer)
 to authenticated;

-- Distinct strict validator for analytical profiles, after verifying the
-- frozen server-side profile and exact nested JSON shape.
create or replace function public.validate_titularisation_analytical_payload(
 p_mission uuid,p jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare v_profile jsonb;g jsonb;n jsonb;v_scores jsonb;
 phase text;key text;val jsonb;cap numeric;num numeric;
begin
 select rubric_profile into v_profile from public.titularisation_missions
 where id=p_mission and rubric_id='lesson_derived_indicators_v1';
 if v_profile is null or v_profile->'frozen' is distinct from 'true'::jsonb then
  raise exception 'Analytical weights not frozen' using errcode='22023';
 end if;
 if p is null or jsonb_typeof(p) is distinct from 'object'
    or octet_length(p::text)>90000
    or (select count(*) from jsonb_object_keys(p))<>2
    or exists(select 1 from jsonb_object_keys(p) k where k not in ('grading','notes')) then
  raise exception 'Malformed contribution payload' using errcode='22023';
 end if;
 g:=p->'grading';n:=p->'notes';
 if jsonb_typeof(g) is distinct from 'object'
 or jsonb_typeof(n) is distinct from 'object'
 or g->>'schema' is distinct from 'titularisation-workbench-draft-v1'
 or g->'revision' is distinct from '1'::jsonb
 or g->>'rubricId' is distinct from 'lesson_derived_indicators_v1'
 or g->'profile' is distinct from v_profile
 or jsonb_typeof(g->'scores') is distinct from 'object'
 or (select count(*) from jsonb_object_keys(g))<>5
 or exists(select 1 from jsonb_object_keys(g) k where k not in
  ('schema','revision','rubricId','profile','scores'))
 or (select count(*) from jsonb_object_keys(g->'scores'))<>2
 or jsonb_typeof(n->'lesson') is distinct from 'object'
 or jsonb_typeof(n->'discussion') is distinct from 'object'
 or (select count(*) from jsonb_object_keys(n))<>6
 or exists(select 1 from jsonb_object_keys(n) k where k not in
  ('lesson','discussion','lessonSummary','discussionSummary','general','recommendations'))
 then
  raise exception 'Invalid rubric or modified frozen profile' using errcode='22023';
 end if;
 for phase in select unnest(array['lesson','discussion']) loop
  v_scores:=g->'scores'->phase;
  if jsonb_typeof(v_scores) is distinct from 'object' then
   raise exception 'Missing score phase' using errcode='22023';
  end if;
  for key,val in select * from jsonb_each(v_scores) loop
   if phase='lesson' then
    cap:=(v_profile->'weights'->>key)::numeric;
   else
    select c.cap into cap from public.titularisation_score_caps c
    where c.rubric_id='lesson_grouped_5_v1'
    and c.phase='discussion' and c.item_id=key;
   end if;
   if cap is null or jsonb_typeof(val) is distinct from 'number' then
    raise exception 'Unknown or nonnumeric grade' using errcode='22023';
   end if;
   num:=(val::text)::numeric;
   if cap=0 or num<0 or num>cap or mod(num*2,1)<>0 then
    raise exception 'Grade outside frozen cap or half-point precision' using errcode='22023';
   end if;
  end loop;
  for key,val in select * from jsonb_each(n->phase) loop
   if phase='lesson' then cap:=(v_profile->'weights'->>key)::numeric;
   else
    select c.cap into cap from public.titularisation_score_caps c
     where c.rubric_id='lesson_grouped_5_v1'
     and c.phase='discussion' and c.item_id=key;
   end if;
   if cap is null or jsonb_typeof(val) is distinct from 'string'
    or length(val #>> '{}')>4000 then
    raise exception 'Unknown indicator or invalid note' using errcode='22023';
   end if;
  end loop;
 end loop;
 for key in select unnest(array['lessonSummary','discussionSummary','general','recommendations']) loop
  val:=n->key;
  if jsonb_typeof(val) is distinct from 'string' or length(val #>> '{}')>4000 then
   raise exception 'Invalid prose field' using errcode='22023';
  end if;
 end loop;
end; $$;
revoke all on function public.validate_titularisation_analytical_payload(uuid,jsonb)
 from public,anon,authenticated;

-- Preserve existing reversible corrections, locking and audit exactly;
-- only the selection of validation by the mission's rubric changes.
create or replace function public.save_titularisation_member_contribution(
 p_mission_id uuid,p_seat_code text,p_payload jsonb,p_submit boolean default false
) returns bigint language plpgsql security definer set search_path='' as $$
declare v_rubric text;v_revision bigint;v_prev_status text;
begin
 select rubric_id into v_rubric from public.titularisation_missions
 where id=p_mission_id and status='draft' and expires_at>now() for update;
 if not found then raise exception 'Mission closed or expired' using errcode='42501'; end if;
 perform 1 from public.titularisation_seats
 where mission_id=p_mission_id and seat_code=p_seat_code for update;
 if not found or not public.is_active_titularisation_seat(p_mission_id,p_seat_code) then
  raise exception 'Seat expired or revoked' using errcode='42501';
 end if;
 if v_rubric='lesson_derived_indicators_v1' then
  perform public.validate_titularisation_analytical_payload(p_mission_id,p_payload);
 else
  perform public.validate_titularisation_member_payload(v_rubric,p_payload);
 end if;
 if p_submit is null then raise exception 'Explicit submission state required' using errcode='22023'; end if;
 select status into v_prev_status from public.titularisation_contributions
 where mission_id=p_mission_id and seat_code=p_seat_code for update;
 if v_prev_status='submitted' and not p_submit then
  raise exception 'Corrections require explicit resubmission' using errcode='22023';
 end if;
 insert into public.titularisation_contributions
  (mission_id,seat_code,payload,author_user_id,status,revision,submitted_at)
 values(p_mission_id,p_seat_code,p_payload,(select auth.uid()),
  case when p_submit then 'submitted' else 'draft' end,1,
  case when p_submit then now() else null end)
 on conflict(mission_id,seat_code) do update
 set payload=excluded.payload,
 revision=public.titularisation_contributions.revision+1,
 updated_at=now(),status=excluded.status,
 submitted_at=excluded.submitted_at,author_user_id=excluded.author_user_id
 returning revision into v_revision;
 insert into public.titularisation_access_events(mission_id,seat_code,actor_id,kind,description)
 values(p_mission_id,p_seat_code,(select auth.uid()),
 case when p_submit then 'contribution_submitted' else 'contribution_saved' end,
 case when v_prev_status='submitted' then 'Corrected after submission; previous revision archived'
 else '' end);
 return v_revision;
end; $$;
revoke all on function public.save_titularisation_member_contribution(uuid,text,jsonb,boolean)
 from public,anon,authenticated;
grant execute on function public.save_titularisation_member_contribution(uuid,text,jsonb,boolean)
 to authenticated;
commit;
