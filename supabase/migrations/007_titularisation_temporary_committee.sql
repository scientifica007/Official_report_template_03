-- M5.1 — Titularisation-only temporary committee accounts.
-- Additive; deliberately separate from inspection_missions and inspector account roles.
-- NOT automatically deployed. Review, run in a disposable Supabase project,
-- verify all RLS/negative scenarios, THEN explicitly approve production migration.
begin;
create extension if not exists pgcrypto;

-- Auth Admin creates disposable committee users. Never enroll them into the
-- permanent inspector approval queue: only server-writable app_metadata
-- identifies these accounts. User-editable user_metadata is not trusted here.
-- Existing inspector signup retains exactly its original behavior.
create or replace function public.create_inspector_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare raw_prof text;
begin
 if new.raw_app_meta_data->>'account_type' = 'titularisation_temporary' then
  return new;
 end if;
 raw_prof := coalesce(new.raw_user_meta_data->>'profession','IFEP');
 insert into public.inspector_profiles(id,email,first_name,last_name,profession,district,approved,is_admin)
 values(new.id,coalesce(new.email,''),
   left(coalesce(new.raw_user_meta_data->>'first_name',''),120),
   left(coalesce(new.raw_user_meta_data->>'last_name',''),120),
   case when raw_prof in ('IFEP','ITP','IAF') then raw_prof else 'IFEP' end,
   left(coalesce(new.raw_user_meta_data->>'district',''),120),false,false)
 on conflict(id) do nothing;
 return new;
end; $$;
revoke all on function public.create_inspector_profile() from public,anon,authenticated;


create table if not exists public.titularisation_missions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete restrict,
 title text not null check(char_length(btrim(title)) between 3 and 200),
 rubric_id text not null check(rubric_id in ('lesson_grouped_5_v1','lesson_inspector_10_v1')),
 status text not null default 'draft' check(status in ('draft','closed')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '7 days'),
 closed_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '30 days'),
 check ((status='draft' and closed_at is null) or (status='closed' and closed_at is not null))
);
create index if not exists titularisation_missions_owner_idx
 on public.titularisation_missions(owner_id,created_at desc);

create table if not exists public.titularisation_seats (
 mission_id uuid not null references public.titularisation_missions(id) on delete restrict,
 seat_code text not null check(seat_code in ('member1','member2','member3')),
 display_name text not null default '' check(char_length(display_name)<=160),
 username text unique check(username is null or username ~ '^cm-[a-z0-9]{12,32}$'),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 status text not null default 'vacant' check(status in ('vacant','active','revoked')),
 activated_at timestamptz,
 revoked_at timestamptz,
 expires_at timestamptz,
 primary key(mission_id,seat_code),
 check(
  (status='vacant' and auth_user_id is null and username is null and activated_at is null and revoked_at is null)
  or (status='active' and auth_user_id is not null and username is not null and activated_at is not null and revoked_at is null and expires_at is not null)
  or (status='revoked' and username is not null and revoked_at is not null)
 )
);
create index if not exists titularisation_seats_uid_idx
 on public.titularisation_seats(auth_user_id) where auth_user_id is not null;

-- Keep one permanently identifiable contribution per seat.
-- A deleted auth user only clears the author UUID; data and seat remain.
create table if not exists public.titularisation_contributions (
 mission_id uuid not null,
 seat_code text not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=90000),
 author_user_id uuid references auth.users(id) on delete set null,
 status text not null default 'draft' check(status in ('draft','submitted')),
 revision bigint not null default 1 check(revision>=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 submitted_at timestamptz,
 primary key(mission_id,seat_code),
 foreign key(mission_id,seat_code) references public.titularisation_seats(mission_id,seat_code) on delete restrict,
 check ((status='draft' and submitted_at is null) or (status='submitted' and submitted_at is not null))
);

create table if not exists public.titularisation_access_events (
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null references public.titularisation_missions(id) on delete restrict,
 seat_code text check(seat_code is null or seat_code in ('member1','member2','member3')),
 actor_id uuid references auth.users(id) on delete set null,
 kind text not null check(kind in (
 'mission_created','seat_issued','password_rotated','seat_revoked','contribution_saved',
 'contribution_submitted','mission_closed','account_deleted')),
 description text not null default '' check(char_length(description)<=250),
 created_at timestamptz not null default now()
);
create index if not exists titularisation_events_mission_idx
 on public.titularisation_access_events(mission_id,created_at desc);

-- Security definer helpers avoid recursive RLS, but derive identity solely
-- from signed auth.uid(); never from caller-provided user_id or user_metadata.
create or replace function public.is_titularisation_owner(p_mission uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and public.is_approved_inspector()
   and exists(select 1 from public.titularisation_missions m
    where m.id=p_mission and m.owner_id=(select auth.uid()));
$$;

create or replace function public.is_active_titularisation_seat(p_mission uuid,p_seat text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null
 and exists(
  select 1 from public.titularisation_seats s
  join public.titularisation_missions m on m.id=s.mission_id
  where s.mission_id=p_mission and s.seat_code=p_seat
  and s.auth_user_id=(select auth.uid()) and s.status='active'
  and s.revoked_at is null and s.expires_at>now()
  and m.status='draft' and m.expires_at>now()
 );
$$;

alter table public.titularisation_missions enable row level security;
alter table public.titularisation_seats enable row level security;
alter table public.titularisation_contributions enable row level security;
alter table public.titularisation_access_events enable row level security;

create policy titularisation_mission_select on public.titularisation_missions
 for select to authenticated using (
 public.is_titularisation_owner(id)
 or exists(select 1 from public.titularisation_seats s
  where s.mission_id=id and s.auth_user_id=(select auth.uid())
  and public.is_active_titularisation_seat(s.mission_id,s.seat_code))
);
create policy titularisation_seat_select on public.titularisation_seats
 for select to authenticated using (
 public.is_titularisation_owner(mission_id)
 or public.is_active_titularisation_seat(mission_id,seat_code));
create policy titularisation_contribution_select on public.titularisation_contributions
 for select to authenticated using (
 public.is_titularisation_owner(mission_id)
 or public.is_active_titularisation_seat(mission_id,seat_code));
create policy titularisation_events_select on public.titularisation_access_events
 for select to authenticated using(public.is_titularisation_owner(mission_id));

-- No direct authenticated writes. Only authenticated, guarded RPCs and the
-- server-side Edge Function (service role, with owner authentication).
revoke all on public.titularisation_missions from public,anon,authenticated;
revoke all on public.titularisation_seats from public,anon,authenticated;
revoke all on public.titularisation_contributions from public,anon,authenticated;
revoke all on public.titularisation_access_events from public,anon,authenticated;
grant select on public.titularisation_missions to authenticated;
grant select on public.titularisation_seats to authenticated;
grant select on public.titularisation_contributions to authenticated;
grant select on public.titularisation_access_events to authenticated;

create or replace function public.create_titularisation_mission(
 p_title text,p_rubric_id text,p_expiry_hours integer default 168
) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null or not public.is_approved_inspector() then
  raise exception 'Approved professional inspector required' using errcode='42501';
 end if;
 if p_title is null or char_length(btrim(p_title)) not between 3 and 200
    or p_rubric_id not in ('lesson_grouped_5_v1','lesson_inspector_10_v1')
    or p_rubric_id is null or p_expiry_hours is null
    or p_expiry_hours not between 1 and 720 then
  raise exception 'Invalid title, rubric or duration' using errcode='22023';
 end if;
 insert into public.titularisation_missions(owner_id,title,rubric_id,expires_at)
 values((select auth.uid()),btrim(p_title),p_rubric_id,now()+make_interval(hours=>p_expiry_hours))
 returning id into v_id;
 insert into public.titularisation_seats(mission_id,seat_code)
 values(v_id,'member1'),(v_id,'member2'),(v_id,'member3');
 insert into public.titularisation_access_events(mission_id,actor_id,kind)
 values(v_id,(select auth.uid()),'mission_created');
 return v_id;
end; $$;

create or replace function public.close_titularisation_mission(p_mission_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_titularisation_owner(p_mission_id) then
  raise exception 'Mission owner required' using errcode='42501';
 end if;
 update public.titularisation_missions
 set status='closed',closed_at=now()
 where id=p_mission_id and status='draft';
 if not found then raise exception 'Mission already closed' using errcode='22023'; end if;
 update public.titularisation_seats
 set status='revoked',revoked_at=now()
 where mission_id=p_mission_id and status='active';
 insert into public.titularisation_access_events(mission_id,actor_id,kind)
 values(p_mission_id,(select auth.uid()),'mission_closed');
end; $$;

-- The cloud may later support analytical 14-item weights after a shared
-- immutable profile is frozen and validated server-side. For now prevent
-- incompatible or unconstrained analytical scores.
create table if not exists public.titularisation_score_caps(
 rubric_id text not null, phase text not null check(phase in ('lesson','discussion')),
 item_id text not null, cap numeric not null check(cap>=0),
 primary key(rubric_id,phase,item_id)
);
insert into public.titularisation_score_caps(rubric_id,phase,item_id,cap) values
 ('lesson_grouped_5_v1','lesson','g1',12),
 ('lesson_grouped_5_v1','lesson','g2',8),
 ('lesson_grouped_5_v1','lesson','g3',8),
 ('lesson_grouped_5_v1','lesson','g4',6),
 ('lesson_grouped_5_v1','lesson','g5',6),
 ('lesson_inspector_10_v1','lesson','c1',5),
 ('lesson_inspector_10_v1','lesson','c2',4),
 ('lesson_inspector_10_v1','lesson','c3',4),
 ('lesson_inspector_10_v1','lesson','c4',5),
 ('lesson_inspector_10_v1','lesson','c5',5),
 ('lesson_inspector_10_v1','lesson','c6',5),
 ('lesson_inspector_10_v1','lesson','c7',4),
 ('lesson_inspector_10_v1','lesson','c8',2),
 ('lesson_inspector_10_v1','lesson','c9',2),
 ('lesson_inspector_10_v1','lesson','c10',4),
 ('lesson_grouped_5_v1','discussion','d1',3),
 ('lesson_grouped_5_v1','discussion','d2',3),
 ('lesson_grouped_5_v1','discussion','d3',3),
 ('lesson_grouped_5_v1','discussion','d4',3),
 ('lesson_grouped_5_v1','discussion','d5',3),
 ('lesson_grouped_5_v1','discussion','d6',3),
 ('lesson_grouped_5_v1','discussion','d7',2),
 ('lesson_inspector_10_v1','discussion','d1',3),
 ('lesson_inspector_10_v1','discussion','d2',3),
 ('lesson_inspector_10_v1','discussion','d3',3),
 ('lesson_inspector_10_v1','discussion','d4',3),
 ('lesson_inspector_10_v1','discussion','d5',3),
 ('lesson_inspector_10_v1','discussion','d6',3),
 ('lesson_inspector_10_v1','discussion','d7',2)
on conflict do nothing;
revoke all on public.titularisation_score_caps from public,anon,authenticated;

-- Strict validation of all submitted fields, including against the exact
-- same half-point caps as the accepted local scoring workbench.
create or replace function public.validate_titularisation_member_payload(p_rubric text,p jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
 v_grading jsonb;v_notes jsonb;v_scores jsonb;
 v_phase text;v_key text;v_value jsonb;v_cap numeric;v_number numeric;
begin
 if p is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>90000 then
  raise exception 'Invalid or oversized payload' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_object_keys(p) as keys(field_name) where field_name not in ('grading','notes')) then
  raise exception 'Unexpected payload field' using errcode='22023';
 end if;
 v_grading:=p->'grading';v_notes:=p->'notes';
 if jsonb_typeof(v_grading) is distinct from 'object' or jsonb_typeof(v_notes) is distinct from 'object'
 or v_grading->>'schema' is distinct from 'titularisation-workbench-draft-v1'
 or v_grading->>'rubricId' is distinct from p_rubric
 or v_grading->'revision' is distinct from '1'::jsonb
 or jsonb_typeof(v_grading->'scores') is distinct from 'object' then
  raise exception 'Invalid grading data or rubric' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_object_keys(v_grading) as keys(field_name)
   where field_name not in ('schema','revision','rubricId','profile','scores'))
 or exists(select 1 from jsonb_object_keys(v_notes) as keys(field_name)
   where field_name not in ('lesson','discussion','lessonSummary','discussionSummary','general','recommendations')) then
  raise exception 'Unknown grading or note field' using errcode='22023';
 end if;
 if v_grading->'profile' is distinct from 'null'::jsonb then
  raise exception 'Unexpected unfrozen analytical weights' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_object_keys(v_grading->'scores') as keys(field_name)
  where field_name not in ('lesson','discussion')) then
  raise exception 'Unexpected score phase' using errcode='22023';
 end if;
 for v_phase in select unnest(array['lesson','discussion']) loop
  v_scores:=v_grading->'scores'->v_phase;
  if jsonb_typeof(v_scores) is distinct from 'object'
   or jsonb_typeof(v_notes->v_phase) is distinct from 'object' then
   raise exception 'Missing scores or note phase' using errcode='22023';
  end if;
  for v_key,v_value in select key,value from jsonb_each(v_scores) loop
   select cap into v_cap from public.titularisation_score_caps
   where rubric_id=p_rubric and phase=v_phase and item_id=v_key;
   if not found or jsonb_typeof(v_value) is distinct from 'number' then
    raise exception 'Unknown item or non-numeric grade' using errcode='22023';
   end if;
   v_number:=(v_value::text)::numeric;
   if v_number<0 or v_number>v_cap or mod(v_number*2,1)<>0 then
    raise exception 'Grade outside cap or half-point step' using errcode='22023';
   end if;
  end loop;
  for v_key,v_value in select key,value from jsonb_each(v_notes->v_phase) loop
   if jsonb_typeof(v_value) is distinct from 'string' or length(v_value #>> '{}')>5000
    or not exists(select 1 from public.titularisation_score_caps
     where rubric_id=p_rubric and phase=v_phase and item_id=v_key) then
    raise exception 'Unknown item or invalid note' using errcode='22023';
   end if;
  end loop;
 end loop;
 for v_key in select unnest(array['lessonSummary','discussionSummary','general','recommendations']) loop
  v_value:=v_notes->v_key;
  if jsonb_typeof(v_value) is distinct from 'string' or length(v_value #>> '{}')>10000 then
   raise exception 'Invalid summary field' using errcode='22023';
  end if;
 end loop;
end; $$;

create or replace function public.save_titularisation_member_contribution(
 p_mission_id uuid,p_seat_code text,p_payload jsonb,p_submit boolean default false
) returns bigint language plpgsql security definer set search_path='' as $$
declare v_rubric text;v_revision bigint;
begin
 -- Lock mission THEN seat before authorization. This serializes member
 -- submission with simultaneous close/revoke and prevents late accepted writes.
 select rubric_id into v_rubric
 from public.titularisation_missions where id=p_mission_id and status='draft' for update;
 if not found then raise exception 'Mission closed' using errcode='42501'; end if;
 perform 1 from public.titularisation_seats s
 where s.mission_id=p_mission_id and s.seat_code=p_seat_code for update;
 if not found or not public.is_active_titularisation_seat(p_mission_id,p_seat_code) then
  raise exception 'Seat access expired or revoked' using errcode='42501';
 end if;
 perform public.validate_titularisation_member_payload(v_rubric,p_payload);
 if p_submit is null then raise exception 'Explicit submit decision required' using errcode='22023'; end if;
 insert into public.titularisation_contributions
  (mission_id,seat_code,payload,author_user_id,status,revision,submitted_at)
 values(p_mission_id,p_seat_code,p_payload,(select auth.uid()),
        case when p_submit then 'submitted' else 'draft' end,
        1,case when p_submit then now() else null end)
 on conflict(mission_id,seat_code) do update
 set payload=excluded.payload,
     revision=public.titularisation_contributions.revision+1,
     updated_at=now(),
     status=excluded.status,
     submitted_at=excluded.submitted_at,
     author_user_id=excluded.author_user_id
 where public.titularisation_contributions.status='draft'
 returning revision into v_revision;
 if v_revision is null then
  raise exception 'Contribution already submitted and immutable' using errcode='42501';
 end if;
 insert into public.titularisation_access_events(mission_id,seat_code,actor_id,kind)
 values(p_mission_id,p_seat_code,(select auth.uid()),
        case when p_submit then 'contribution_submitted' else 'contribution_saved' end);
 return v_revision;
end; $$;


-- Server-only user-name throttling. Even unknown usernames are counted, and
-- neither usernames nor credentials are exposed in browser-readable tables.
create table if not exists public.titularisation_login_attempts (
 username text primary key,
 window_started_at timestamptz not null default now(),
 attempts integer not null default 0 check(attempts>=0)
);
alter table public.titularisation_login_attempts enable row level security;
revoke all on public.titularisation_login_attempts from public,anon,authenticated;
create or replace function public.guard_titularisation_login(p_username text)
returns void language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if p_username is null or p_username !~ '^cm-[a-z0-9]{12,32}$' then
  raise exception 'Invalid username' using errcode='22023';
 end if;
 insert into public.titularisation_login_attempts(username,window_started_at,attempts)
 values(p_username,now(),1)
 on conflict(username) do update
 set attempts=case when public.titularisation_login_attempts.window_started_at<now()-interval '15 minutes'
       then 1 else public.titularisation_login_attempts.attempts+1 end,
     window_started_at=case when public.titularisation_login_attempts.window_started_at<now()-interval '15 minutes'
       then now() else public.titularisation_login_attempts.window_started_at end
 returning attempts into v_count;
 if v_count>10 then
  raise exception 'Too many login attempts' using errcode='P0001';
 end if;
end; $$;
revoke all on function public.guard_titularisation_login(text) from public,anon,authenticated;
grant execute on function public.guard_titularisation_login(text) to service_role;

revoke all on function public.is_titularisation_owner(uuid) from public,anon,authenticated;
revoke all on function public.is_active_titularisation_seat(uuid,text) from public,anon,authenticated;
revoke all on function public.create_titularisation_mission(text,text,integer) from public,anon,authenticated;
revoke all on function public.close_titularisation_mission(uuid) from public,anon,authenticated;
revoke all on function public.validate_titularisation_member_payload(text,jsonb) from public,anon,authenticated;
revoke all on function public.save_titularisation_member_contribution(uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.is_titularisation_owner(uuid) to authenticated;
grant execute on function public.is_active_titularisation_seat(uuid,text) to authenticated;
grant execute on function public.create_titularisation_mission(text,text,integer) to authenticated;
grant execute on function public.close_titularisation_mission(uuid) to authenticated;
grant execute on function public.save_titularisation_member_contribution(uuid,text,jsonb,boolean) to authenticated;
commit;

-- IMPORTANT: Supabase migration alone does NOT create logins. Provision
-- Supabase Auth users only through the Edge Function with SERVER secrets.
-- Run RLS negative tests before the production migration.
