-- M3.0 / M3.1 — Shared inspection missions, invitations and immutable contribution substrate.
-- Non-destructive; depends on migrations 001_inspectors_institutions.sql and 002_inspector_account_lifecycle.sql.
-- Execute ONCE in Supabase SQL Editor after owner reviews. Until then portal remains in setup mode.
begin;
create extension if not exists pgcrypto;

create table if not exists public.inspection_missions (
 id uuid primary key default gen_random_uuid(),
 template_id text not null default 'OFFICIAL_REPORT_TEMPLATE_03'
  check (template_id='OFFICIAL_REPORT_TEMPLATE_03'),
 institution_id uuid not null references public.shared_institutions(id) on delete restrict,
 institution_snapshot jsonb not null check (jsonb_typeof(institution_snapshot)='object'),
 director_snapshot jsonb not null check (jsonb_typeof(director_snapshot)='object'),
 title text not null check (char_length(btrim(title)) between 3 and 200),
 purpose text not null default '' check (char_length(purpose)<=3000),
 visit_start date,visit_end date,
 status text not null default 'draft' check (status in ('draft','closed')),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 constraint inspection_visit_range_valid check (visit_end is null or visit_start is null or visit_end>=visit_start)
);
create index if not exists inspection_missions_created_idx
 on public.inspection_missions(created_at desc);

create table if not exists public.inspection_mission_members (
 mission_id uuid not null references public.inspection_missions(id) on delete restrict,
 inspector_id uuid not null references auth.users(id) on delete restrict,
 invited_by uuid not null references auth.users(id) on delete restrict,
 membership_status text not null check (membership_status in ('invited','accepted','declined')),
 created_at timestamptz not null default now(),
 responded_at timestamptz,
 primary key (mission_id,inspector_id),
 constraint membership_response_consistency check (
  (membership_status='invited' and responded_at is null) or
  (membership_status in ('accepted','declined') and responded_at is not null)
 )
);
create index if not exists inspection_members_by_inspector
 on public.inspection_mission_members(inspector_id,membership_status,created_at desc);

create table if not exists public.inspection_mission_notifications (
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null references public.inspection_missions(id) on delete restrict,
 recipient_id uuid not null references auth.users(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 event_type text not null check (event_type in ('invited','accepted','declined')),
 -- Invitations only expose minimal mission metadata. Report and findings are never included.
 description text not null check (char_length(description)<=350),
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists inspection_mission_notifications_recipient
 on public.inspection_mission_notifications(recipient_id,created_at desc);

-- Introduced in M3.0 but writes are intentionally disabled pending M3.2.
create table if not exists public.inspection_contributions (
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null references public.inspection_missions(id) on delete restrict,
 item_id text not null check (char_length(btrim(item_id)) between 1 and 150),
 kind text not null check (kind in ('finding','recommendation','reply','correction')),
 body text not null check (char_length(btrim(body)) between 1 and 30000),
 author_id uuid not null references auth.users(id) on delete restrict,
 parent_id uuid references public.inspection_contributions(id) on delete restrict,
 client_request_id uuid not null,
 created_at timestamptz not null default now(),
 unique (mission_id,author_id,client_request_id),
 check ((kind in ('reply','correction')) = (parent_id is not null))
);
create index if not exists inspection_contributions_by_mission
 on public.inspection_contributions(mission_id,item_id,created_at);
create table if not exists public.inspection_proposals (
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null references public.inspection_missions(id) on delete restrict,
 item_id text not null check (char_length(btrim(item_id)) between 1 and 150),
 kind text not null check (kind in ('finding','recommendation')),
 body text not null check (char_length(btrim(body)) between 1 and 30000),
 proposed_by uuid not null references auth.users(id) on delete restrict,
 reviewer_id uuid not null references auth.users(id) on delete restrict,
 status text not null default 'pending' check (status in ('pending','accepted','rejected')),
 decision_reason text check (char_length(coalesce(decision_reason,''))<=3000),
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 constraint proposal_review_consistency check (
 (status='pending' and decided_at is null) or
 (status in ('accepted','rejected') and decided_at is not null))
);

-- SECURITY DEFINER helper avoids recursive policies on members. It must NOT
-- grant the administrator special access to content of non-member missions.
create or replace function public.is_accepted_mission_member(p_mission uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_mission is not null and public.is_approved_inspector() and exists (
  select 1 from public.inspection_mission_members m
  where m.mission_id=p_mission and m.inspector_id=(select auth.uid())
    and m.membership_status='accepted'
 );
$$;
revoke all on function public.is_accepted_mission_member(uuid) from public,anon,authenticated;
grant execute on function public.is_accepted_mission_member(uuid) to authenticated;

alter table public.inspection_missions enable row level security;
alter table public.inspection_mission_members enable row level security;
alter table public.inspection_mission_notifications enable row level security;
alter table public.inspection_contributions enable row level security;
alter table public.inspection_proposals enable row level security;

create policy inspection_missions_read on public.inspection_missions
 for select to authenticated using (public.is_accepted_mission_member(id));
create policy inspection_members_read on public.inspection_mission_members
 for select to authenticated using (
 (inspector_id=(select auth.uid()) and public.is_approved_inspector())
 or public.is_accepted_mission_member(mission_id));
create policy inspection_notifications_read on public.inspection_mission_notifications
 for select to authenticated using (
 recipient_id=(select auth.uid()) and public.is_approved_inspector());
create policy inspection_notifications_ack on public.inspection_mission_notifications
 for update to authenticated using (
 recipient_id=(select auth.uid()) and public.is_approved_inspector())
 with check (recipient_id=(select auth.uid()) and public.is_approved_inspector());
create policy inspection_contributions_read on public.inspection_contributions
 for select to authenticated using (public.is_accepted_mission_member(mission_id));
create policy inspection_proposals_read on public.inspection_proposals
 for select to authenticated using (public.is_accepted_mission_member(mission_id));

-- No authenticated INSERT/UPDATE/DELETE grants on missions, membership,
-- contributions or proposals. All authenticated writes use verified RPCs.
revoke all on public.inspection_missions from public,anon,authenticated;
revoke all on public.inspection_mission_members from public,anon,authenticated;
revoke all on public.inspection_mission_notifications from public,anon,authenticated;
revoke all on public.inspection_contributions from public,anon,authenticated;
revoke all on public.inspection_proposals from public,anon,authenticated;
grant select on public.inspection_missions to authenticated;
grant select on public.inspection_mission_members to authenticated;
grant select on public.inspection_mission_notifications to authenticated;
grant update(read_at) on public.inspection_mission_notifications to authenticated;
grant select on public.inspection_contributions to authenticated;
grant select on public.inspection_proposals to authenticated;

create or replace function public.create_inspection_mission(
 p_institution_id uuid,p_title text,p_purpose text default '',
 p_visit_start date default null,p_visit_end date default null
) returns uuid
language plpgsql security definer set search_path='' as $$
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
end; $$;

create or replace function public.invite_inspection_member(
 p_mission_id uuid,p_inspector_id uuid
) returns void
language plpgsql security definer set search_path='' as $$
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
end; $$;

create or replace function public.respond_inspection_invitation(
 p_mission_id uuid,p_accept boolean
) returns void
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=(select auth.uid());
 v_inviter uuid;
 v_status text;
 v_label text;
begin
 if v_actor is null or not public.is_approved_inspector() or p_accept is null then
  raise exception 'Approved inspector and explicit decision required' using errcode='42501';
 end if;
 select invited_by,membership_status into v_inviter,v_status
 from public.inspection_mission_members
 where mission_id=p_mission_id and inspector_id=v_actor for update;
 if not found or v_status<>'invited' then
  raise exception 'No pending invitation for this account' using errcode='22023';
 end if;
 if not exists(select 1 from public.inspection_missions
  where id=p_mission_id and status='draft') then
  raise exception 'Mission is not open for invitations' using errcode='22023';
 end if;
 update public.inspection_mission_members
 set membership_status=case when p_accept then 'accepted' else 'declined' end,
     responded_at=now()
 where mission_id=p_mission_id and inspector_id=v_actor;
 update public.inspection_mission_notifications
 set read_at=coalesce(read_at,now())
 where mission_id=p_mission_id and recipient_id=v_actor and event_type='invited';
 select title into v_label from public.inspection_missions where id=p_mission_id;
 insert into public.inspection_mission_notifications
  (mission_id,recipient_id,actor_id,event_type,description)
 select p_mission_id,m.inspector_id,v_actor,
   case when p_accept then 'accepted' else 'declined' end,
   left('رد على الدعوة: '||v_label,350)
 from public.inspection_mission_members m
 where m.mission_id=p_mission_id and m.membership_status='accepted'
   and m.inspector_id<>v_actor;
end; $$;

-- Explicitly restrict DEFINER functions: public EXECUTE is granted by default otherwise.
revoke all on function public.create_inspection_mission(uuid,text,text,date,date) from public,anon,authenticated;
revoke all on function public.invite_inspection_member(uuid,uuid) from public,anon,authenticated;
revoke all on function public.respond_inspection_invitation(uuid,boolean) from public,anon,authenticated;
grant execute on function public.create_inspection_mission(uuid,text,text,date,date) to authenticated;
grant execute on function public.invite_inspection_member(uuid,uuid) to authenticated;
grant execute on function public.respond_inspection_invitation(uuid,boolean) to authenticated;
commit;

-- Safe verification after running:
-- select relname,relrowsecurity from pg_class where oid in
-- ('public.inspection_missions'::regclass,'public.inspection_mission_members'::regclass,
--  'public.inspection_mission_notifications'::regclass,'public.inspection_contributions'::regclass,
--  'public.inspection_proposals'::regclass);
-- select proname from pg_proc where pronamespace='public'::regnamespace
-- and proname in ('create_inspection_mission','invite_inspection_member','respond_inspection_invitation');
