-- P2: production committee seats and passwordless, revocable member capabilities.
-- This is intentionally NOT the QA temporary-auth schema. Only the chair's
-- production mission is the parent. Member tokens never create Auth accounts.
-- Member endpoints authorize solely using 256-bit random bearer capabilities.
begin;

create table public.titularisation_seats (
 mission_id uuid not null references public.titularisation_missions(id) on delete restrict,
 seat_code text not null check(seat_code in ('member1','member2','member3')),
 display_name text not null default '' check(length(display_name)<=160),
 status text not null default 'vacant' check(status in ('vacant','active','revoked')),
 token_hash text unique check(token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz,
 revoked_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(mission_id,seat_code),
 constraint titularisation_seat_state check(
  (status='vacant' and token_hash is null) or
  (status='active' and token_hash is not null and expires_at is not null and revoked_at is null) or
  (status='revoked' and token_hash is null and revoked_at is not null)
 )
);
create table public.titularisation_contributions (
 mission_id uuid not null,
 seat_code text not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=90000),
 status text not null check(status in ('draft','submitted')),
 revision bigint not null check(revision>=1),
 submitted_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(mission_id,seat_code),
 foreign key(mission_id,seat_code) references public.titularisation_seats(mission_id,seat_code) on delete restrict,
 check ((status='draft' and submitted_at is null) or (status='submitted' and submitted_at is not null))
);
create table public.titularisation_contribution_revisions (
 id bigint generated always as identity primary key,
 mission_id uuid not null,
 seat_code text not null,
 revision bigint not null,
 payload jsonb not null,
 status text not null,
 submitted_at timestamptz,
 replaced_at timestamptz not null default now(),
 unique(mission_id,seat_code,revision),
 foreign key(mission_id,seat_code) references public.titularisation_contributions(mission_id,seat_code) on delete restrict
);
create table public.titularisation_access_events (
 id bigint generated always as identity primary key,
 mission_id uuid not null references public.titularisation_missions(id) on delete restrict,
 seat_code text not null check(seat_code in ('member1','member2','member3')),
 event_kind text not null check(event_kind in ('issued','revoked','saved','submitted','corrected')),
 created_at timestamptz not null default now()
);

alter table public.titularisation_seats enable row level security;
alter table public.titularisation_contributions enable row level security;
alter table public.titularisation_contribution_revisions enable row level security;
alter table public.titularisation_access_events enable row level security;
revoke all on public.titularisation_seats,public.titularisation_contributions,
 public.titularisation_contribution_revisions,public.titularisation_access_events from public,anon,authenticated;
-- Even the chair cannot read the stored capability digest through REST.
grant select(mission_id,seat_code,display_name,status,expires_at,revoked_at,updated_at)
 on public.titularisation_seats to authenticated;
grant select on public.titularisation_contributions to authenticated;
grant select on public.titularisation_contribution_revisions to authenticated;
grant select on public.titularisation_access_events to authenticated;

create policy titularisation_prod_seats_owner_read
 on public.titularisation_seats for select to authenticated
 using(exists(select 1 from public.titularisation_missions m
  where m.id=mission_id and m.owner_id=(select auth.uid())));
create policy titularisation_prod_contrib_owner_read
 on public.titularisation_contributions for select to authenticated
 using(exists(select 1 from public.titularisation_missions m
  where m.id=mission_id and m.owner_id=(select auth.uid())));
create policy titularisation_prod_revisions_owner_read
 on public.titularisation_contribution_revisions for select to authenticated
 using(exists(select 1 from public.titularisation_missions m
  where m.id=mission_id and m.owner_id=(select auth.uid())));
create policy titularisation_prod_events_owner_read
 on public.titularisation_access_events for select to authenticated
 using(exists(select 1 from public.titularisation_missions m
  where m.id=mission_id and m.owner_id=(select auth.uid())));

create table public.titularisation_score_caps (
 rubric_id text not null,
 phase text not null check(phase in ('lesson','discussion')),
 item_id text not null,
 cap numeric not null check(cap>=0),
 primary key(rubric_id,phase,item_id)
);
insert into public.titularisation_score_caps(rubric_id,phase,item_id,cap) values
 ('lesson_grouped_5_v1','lesson','g1',12),('lesson_grouped_5_v1','lesson','g2',8),
 ('lesson_grouped_5_v1','lesson','g3',8),('lesson_grouped_5_v1','lesson','g4',6),
 ('lesson_grouped_5_v1','lesson','g5',6),
 ('lesson_inspector_10_v1','lesson','c1',5),('lesson_inspector_10_v1','lesson','c2',4),
 ('lesson_inspector_10_v1','lesson','c3',4),('lesson_inspector_10_v1','lesson','c4',5),
 ('lesson_inspector_10_v1','lesson','c5',5),('lesson_inspector_10_v1','lesson','c6',5),
 ('lesson_inspector_10_v1','lesson','c7',4),('lesson_inspector_10_v1','lesson','c8',2),
 ('lesson_inspector_10_v1','lesson','c9',2),('lesson_inspector_10_v1','lesson','c10',4),
 ('lesson_grouped_5_v1','discussion','d1',3),('lesson_grouped_5_v1','discussion','d2',3),
 ('lesson_grouped_5_v1','discussion','d3',3),('lesson_grouped_5_v1','discussion','d4',3),
 ('lesson_grouped_5_v1','discussion','d5',3),('lesson_grouped_5_v1','discussion','d6',3),
 ('lesson_grouped_5_v1','discussion','d7',2),
 ('lesson_inspector_10_v1','discussion','d1',3),('lesson_inspector_10_v1','discussion','d2',3),
 ('lesson_inspector_10_v1','discussion','d3',3),('lesson_inspector_10_v1','discussion','d4',3),
 ('lesson_inspector_10_v1','discussion','d5',3),('lesson_inspector_10_v1','discussion','d6',3),
 ('lesson_inspector_10_v1','discussion','d7',2);
alter table public.titularisation_score_caps enable row level security;
revoke all on public.titularisation_score_caps from public,anon,authenticated;

-- Shared server validation: no fabricated keys/caps or edited frozen profile.
-- Invoked internally by the privileged, capability-guarded save RPC ONLY.
create function public.validate_prod_titularisation_member_payload(
 p_mission_id uuid,p_payload jsonb,p_submit boolean
) returns void language plpgsql security definer set search_path='' as $v$
declare
 m public.titularisation_missions%rowtype;
 g jsonb; n jsonb; scores jsonb; note_map jsonb; v jsonb;
 ph text; item text; cap numeric; num numeric; r record;
begin
 select * into m from public.titularisation_missions where id=p_mission_id;
 if not found then raise exception 'Mission unavailable' using errcode='42501';end if;
 if p_submit is null or jsonb_typeof(p_payload) is distinct from 'object'
  or octet_length(p_payload::text)>90000
  or (select count(*) from jsonb_object_keys(p_payload))<>2
  or exists(select 1 from jsonb_object_keys(p_payload) as k where k not in ('grading','notes'))
 then raise exception 'Invalid contribution format' using errcode='22023';end if;
 g:=p_payload->'grading';n:=p_payload->'notes';
 if jsonb_typeof(g) is distinct from 'object'
  or jsonb_typeof(n) is distinct from 'object'
  or g->>'schema' is distinct from 'titularisation-workbench-draft-v1'
  or g->'revision' is distinct from '1'::jsonb
  or g->>'rubricId' is distinct from m.rubric_id
  or jsonb_typeof(g->'scores') is distinct from 'object'
  or (select count(*) from jsonb_object_keys(g))<>5
  or exists(select 1 from jsonb_object_keys(g) as k where k not in ('schema','revision','rubricId','profile','scores'))
  or (select count(*) from jsonb_object_keys(g->'scores'))<>2
  or (select count(*) from jsonb_object_keys(n))<>6
  or exists(select 1 from jsonb_object_keys(n) as k
   where k not in ('lesson','discussion','lessonSummary','discussionSummary','general','recommendations'))
 then raise exception 'Invalid grading fields' using errcode='22023';end if;
 if m.rubric_id='lesson_derived_indicators_v1' then
  if m.rubric_profile->'frozen' is distinct from 'true'::jsonb
    or g->'profile' is distinct from m.rubric_profile
  then raise exception 'Analytical profile differs from pinned weights' using errcode='22023';end if;
 elsif g->'profile' is distinct from 'null'::jsonb then
  raise exception 'Unexpected analytical profile' using errcode='22023';
 end if;
 for ph in select unnest(array['lesson','discussion']) loop
  scores:=g->'scores'->ph;note_map:=n->ph;
  if jsonb_typeof(scores) is distinct from 'object'
    or jsonb_typeof(note_map) is distinct from 'object'
  then raise exception 'Missing score or note phase' using errcode='22023';end if;
  for item,v in select key,value from jsonb_each(scores) loop
   cap:=null;
   if m.rubric_id='lesson_derived_indicators_v1' and ph='lesson' then
    cap:=(m.rubric_profile->'weights'->>item)::numeric;
   else
    select c.cap into cap from public.titularisation_score_caps c
    where c.rubric_id=case when m.rubric_id='lesson_derived_indicators_v1'
      then 'lesson_grouped_5_v1' else m.rubric_id end
     and c.phase=ph and c.item_id=item;
   end if;
   if cap is null or cap=0 or jsonb_typeof(v) is distinct from 'number'
   then raise exception 'Unknown or nonnumeric grading item' using errcode='22023';end if;
   num:=(v::text)::numeric;
   if num<0 or num>cap or mod(num*2,1)<>0
   then raise exception 'Grade outside allowed half-point range' using errcode='22023';end if;
  end loop;
  for item,v in select key,value from jsonb_each(note_map) loop
   cap:=null;
   if m.rubric_id='lesson_derived_indicators_v1' and ph='lesson' then
    cap:=(m.rubric_profile->'weights'->>item)::numeric;
   else
    select c.cap into cap from public.titularisation_score_caps c
    where c.rubric_id=case when m.rubric_id='lesson_derived_indicators_v1'
      then 'lesson_grouped_5_v1' else m.rubric_id end
      and c.phase=ph and c.item_id=item;
   end if;
   if cap is null or jsonb_typeof(v) is distinct from 'string'
     or length(v#>>'{}')>4000
   then raise exception 'Invalid indicator note' using errcode='22023';end if;
  end loop;
  if p_submit then
   if m.rubric_id='lesson_derived_indicators_v1' and ph='lesson' then
    for r in select key as item_id,value::numeric as cap
      from jsonb_each_text(m.rubric_profile->'weights') loop
     if r.cap>0 and not (scores ? r.item_id)
     then raise exception 'Final submission requires every nonzero indicator grade' using errcode='22023';end if;
    end loop;
   else
    for r in select c.item_id,c.cap from public.titularisation_score_caps c
      where c.rubric_id=case when m.rubric_id='lesson_derived_indicators_v1'
       then 'lesson_grouped_5_v1' else m.rubric_id end and c.phase=ph loop
     if r.cap>0 and not (scores ? r.item_id)
     then raise exception 'Final submission requires all lesson and discussion marks' using errcode='22023';end if;
    end loop;
   end if;
  end if;
 end loop;
 for item in select unnest(array['lessonSummary','discussionSummary','general','recommendations']) loop
  v:=n->item;
  if jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>10000
  then raise exception 'Invalid summary text' using errcode='22023';end if;
 end loop;
end $v$;
revoke all on function public.validate_prod_titularisation_member_payload(uuid,jsonb,boolean)
 from public,anon,authenticated;

-- Owner gets a token ONCE on issue/rotation; only the SHA-256 digest is stored.
-- Reissue revokes old links, but never deletes or rewrites contributions.
create function public.issue_prod_titularisation_invitation(
 p_mission_id uuid,p_seat_code text,p_display_name text default ''
) returns jsonb language plpgsql security definer set search_path='' as $issue$
declare
 m public.titularisation_missions%rowtype;
 tok text; expire timestamptz; uid uuid:=(select auth.uid());
begin
 if uid is null or not exists(select 1 from public.inspector_profiles p
  where p.id=uid and p.approved=true and p.account_status='approved' and p.is_admin=false)
 then raise exception 'Approved inspector required' using errcode='42501';end if;
 select * into m from public.titularisation_missions
 where id=p_mission_id and owner_id=uid for update;
 if not found or m.status<>'draft' or (m.expires_at is not null and m.expires_at<=now())
 then raise exception 'Owned open mission required' using errcode='42501';end if;
 if p_seat_code not in ('member1','member2','member3') or
  length(coalesce(p_display_name,''))>160
 then raise exception 'Invalid seat or name' using errcode='22023';end if;
 if m.rubric_id='lesson_derived_indicators_v1'
  and m.rubric_profile->'frozen' is distinct from 'true'::jsonb
 then raise exception 'Freeze analytical weights before inviting a member' using errcode='22023';end if;
 tok:=encode(extensions.gen_random_bytes(32),'hex');
 expire:=least(coalesce(m.expires_at,now()+interval '7 days'),now()+interval '7 days');
 insert into public.titularisation_seats
  (mission_id,seat_code,display_name,status,token_hash,expires_at,revoked_at)
 values(p_mission_id,p_seat_code,btrim(coalesce(p_display_name,'')),'active',
  encode(extensions.digest(tok,'sha256'),'hex'),expire,null)
 on conflict(mission_id,seat_code) do update
 set display_name=excluded.display_name,status='active',token_hash=excluded.token_hash,
     expires_at=excluded.expires_at,revoked_at=null,updated_at=now();
 insert into public.titularisation_access_events(mission_id,seat_code,event_kind)
 values(p_mission_id,p_seat_code,'issued');
 return jsonb_build_object('seat_code',p_seat_code,'token',tok,'expires_at',expire);
end $issue$;
revoke all on function public.issue_prod_titularisation_invitation(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.issue_prod_titularisation_invitation(uuid,text,text) to authenticated;

create function public.revoke_prod_titularisation_invitation(
 p_mission_id uuid,p_seat_code text
) returns boolean language plpgsql security definer set search_path='' as $revoke$
declare uid uuid:=(select auth.uid());
begin
 if uid is null or not exists(select 1 from public.inspector_profiles p
  where p.id=uid and p.approved=true and p.account_status='approved' and p.is_admin=false)
  or not exists(select 1 from public.titularisation_missions m
  where m.id=p_mission_id and m.owner_id=uid)
 then raise exception 'Mission owner required' using errcode='42501';end if;
 update public.titularisation_seats set status='revoked',token_hash=null,
  revoked_at=now(),updated_at=now()
 where mission_id=p_mission_id and seat_code=p_seat_code and status='active';
 if not found then raise exception 'No active invitation to revoke' using errcode='22023';end if;
 insert into public.titularisation_access_events(mission_id,seat_code,event_kind)
 values(p_mission_id,p_seat_code,'revoked');
 return true;
end $revoke$;
revoke all on function public.revoke_prod_titularisation_invitation(uuid,text)
 from public,anon,authenticated;
grant execute on function public.revoke_prod_titularisation_invitation(uuid,text) to authenticated;

-- Every anonymous read/write must prove knowledge of a full random 256-bit
-- token. Never trust a claimed seat, mission, authorization role, or client cap.
create function public.load_prod_titularisation_member(
 p_mission_id uuid,p_seat_code text,p_token text
) returns jsonb language plpgsql security definer set search_path='' as $load$
declare m public.titularisation_missions%rowtype;
 s public.titularisation_seats%rowtype;
 c public.titularisation_contributions%rowtype;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$'
 then raise exception 'Invalid or expired invitation' using errcode='42501';end if;
 select * into s from public.titularisation_seats
 where mission_id=p_mission_id and seat_code=p_seat_code
  and status='active' and expires_at>now() and revoked_at is null
  and token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then raise exception 'Invalid or expired invitation' using errcode='42501';end if;
 select * into m from public.titularisation_missions
 where id=p_mission_id and status='draft'
  and (expires_at is null or expires_at>now());
 if not found or (m.rubric_id='lesson_derived_indicators_v1'
  and m.rubric_profile->'frozen' is distinct from 'true'::jsonb)
 then raise exception 'Mission unavailable' using errcode='42501';end if;
 select * into c from public.titularisation_contributions
 where mission_id=p_mission_id and seat_code=p_seat_code;
 return jsonb_build_object(
  'mission',jsonb_build_object('id',m.id,'title',m.title,'rubric_id',m.rubric_id,
      'rubric_profile',m.rubric_profile,'status',m.status),
  'seat',jsonb_build_object('seat_code',s.seat_code,'display_name',s.display_name,
      'status',s.status,'expires_at',s.expires_at),
  'saved',case when c.revision is null then null else jsonb_build_object(
    'payload',c.payload,'status',c.status,'revision',c.revision,'submitted_at',c.submitted_at) end
 );
end $load$;
revoke all on function public.load_prod_titularisation_member(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.load_prod_titularisation_member(uuid,text,text) to anon,authenticated;

create function public.save_prod_titularisation_member(
 p_mission_id uuid,p_seat_code text,p_token text,p_payload jsonb,
 p_expected_revision bigint,p_submit boolean
) returns bigint language plpgsql security definer set search_path='' as $save$
declare
 m public.titularisation_missions%rowtype;
 s public.titularisation_seats%rowtype;
 c public.titularisation_contributions%rowtype;
 next_rev bigint;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_expected_revision is null
  or p_expected_revision<0 or p_submit is null
 then raise exception 'Invalid member submission' using errcode='22023';end if;
 -- Lock in strict order: mission > seat > contribution, including reissues.
 select * into m from public.titularisation_missions
 where id=p_mission_id and status='draft'
  and (expires_at is null or expires_at>now()) for update;
 if not found then raise exception 'Mission unavailable' using errcode='42501';end if;
 select * into s from public.titularisation_seats
 where mission_id=p_mission_id and seat_code=p_seat_code for update;
 if not found or s.status<>'active' or s.revoked_at is not null
  or s.expires_at<=now() or s.token_hash is distinct from
   encode(extensions.digest(p_token,'sha256'),'hex')
 then raise exception 'Invalid or expired invitation' using errcode='42501';end if;
 perform public.validate_prod_titularisation_member_payload(p_mission_id,p_payload,p_submit);
 select * into c from public.titularisation_contributions
 where mission_id=p_mission_id and seat_code=p_seat_code for update;
 if coalesce(c.revision,0)<>p_expected_revision
 then raise exception 'Contribution changed; reload before overwriting' using errcode='40001';end if;
 if c.status='submitted' and not p_submit
 then raise exception 'Submitted corrections require explicit resubmission' using errcode='22023';end if;
 next_rev:=p_expected_revision+1;
 if p_expected_revision=0 then
  insert into public.titularisation_contributions
    (mission_id,seat_code,payload,status,revision,submitted_at)
  values(p_mission_id,p_seat_code,p_payload,
   case when p_submit then 'submitted' else 'draft' end,1,
   case when p_submit then now() else null end);
 else
  insert into public.titularisation_contribution_revisions
   (mission_id,seat_code,revision,payload,status,submitted_at)
  values(p_mission_id,p_seat_code,c.revision,c.payload,c.status,c.submitted_at);
  update public.titularisation_contributions
  set payload=p_payload,revision=next_rev,status=case when p_submit then 'submitted' else 'draft' end,
   submitted_at=case when p_submit then now() else null end,updated_at=now()
  where mission_id=p_mission_id and seat_code=p_seat_code;
 end if;
 insert into public.titularisation_access_events(mission_id,seat_code,event_kind)
 values(p_mission_id,p_seat_code,
  case when c.status='submitted' then 'corrected'
    when p_submit then 'submitted' else 'saved' end);
 return next_rev;
end $save$;
revoke all on function public.save_prod_titularisation_member(uuid,text,text,jsonb,bigint,boolean)
 from public,anon,authenticated;
grant execute on function public.save_prod_titularisation_member(uuid,text,text,jsonb,bigint,boolean)
 to anon,authenticated;
commit;