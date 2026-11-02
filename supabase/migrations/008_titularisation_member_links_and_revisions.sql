-- M5.3 — password-free, revocable per-seat invitation and corrective revisions.
-- QA first; production rollout requires explicit approval and live RLS testing.
begin;
create table public.titularisation_member_links (
 mission_id uuid not null,
 seat_code text not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 primary key(mission_id,seat_code),
 foreign key(mission_id,seat_code)
  references public.titularisation_seats(mission_id,seat_code) on delete restrict
);
alter table public.titularisation_member_links enable row level security;
revoke all on public.titularisation_member_links from public,anon,authenticated;

-- Explicit audit label for generating a direct-login capability.
alter table public.titularisation_access_events
 drop constraint if exists titularisation_access_events_kind_check;
alter table public.titularisation_access_events
 add constraint titularisation_access_events_kind_check check(kind in (
 'mission_created','seat_issued','password_rotated','seat_revoked',
 'contribution_saved','contribution_submitted','mission_closed',
 'account_deleted','link_issued'
 ));

-- Historic version prior to each correction, including the initial submission.
-- No authenticated role can modify, delete, or insert these records directly.
create table public.titularisation_contribution_revisions (
 id bigint generated always as identity primary key,
 mission_id uuid not null,
 seat_code text not null,
 revision bigint not null,
 payload jsonb not null,
 status text not null,
 author_user_id uuid,
 submitted_at timestamptz,
 replaced_at timestamptz not null default now(),
 replaced_by uuid,
 unique(mission_id,seat_code,revision),
 foreign key(mission_id,seat_code)
  references public.titularisation_contributions(mission_id,seat_code) on delete restrict
);
alter table public.titularisation_contribution_revisions enable row level security;
revoke all on public.titularisation_contribution_revisions from public,anon,authenticated;
grant select on public.titularisation_contribution_revisions to authenticated;
create policy titularisation_revision_select on public.titularisation_contribution_revisions
 for select to authenticated using (
 public.is_titularisation_owner(mission_id)
 or public.is_active_titularisation_seat(mission_id,seat_code)
 );

create or replace function public.archive_titularisation_contribution_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.revision<>old.revision+1 then
  raise exception 'Contribution revision must increment by one' using errcode='22023';
 end if;
 insert into public.titularisation_contribution_revisions
 (mission_id,seat_code,revision,payload,status,author_user_id,submitted_at,replaced_by)
 values(old.mission_id,old.seat_code,old.revision,old.payload,old.status,
        old.author_user_id,old.submitted_at,(select auth.uid()));
 return new;
end; $$;
revoke all on function public.archive_titularisation_contribution_revision() from public,anon,authenticated;
create trigger titularisation_archive_before_update
before update on public.titularisation_contributions
for each row execute function public.archive_titularisation_contribution_revision();

create or replace function public.save_titularisation_member_contribution(
 p_mission_id uuid,p_seat_code text,p_payload jsonb,p_submit boolean default false
) returns bigint language plpgsql security definer set search_path='' as $$
declare v_rubric text;v_revision bigint;v_prev_status text;
begin
 -- Consistent lock order: mission, seat, contribution.
 select rubric_id into v_rubric
 from public.titularisation_missions
 where id=p_mission_id and status='draft' and expires_at>now() for update;
 if not found then raise exception 'Mission closed or expired' using errcode='42501'; end if;
 perform 1 from public.titularisation_seats
 where mission_id=p_mission_id and seat_code=p_seat_code for update;
 if not found or not public.is_active_titularisation_seat(p_mission_id,p_seat_code) then
  raise exception 'Seat access expired or revoked' using errcode='42501';
 end if;
 perform public.validate_titularisation_member_payload(v_rubric,p_payload);
 if p_submit is null then raise exception 'Explicit submission state required' using errcode='22023'; end if;
 select status into v_prev_status from public.titularisation_contributions
 where mission_id=p_mission_id and seat_code=p_seat_code for update;
 if v_prev_status='submitted' and not p_submit then
  raise exception 'Corrections to submitted contributions must be explicitly resubmitted' using errcode='22023';
 end if;
 insert into public.titularisation_contributions
 (mission_id,seat_code,payload,author_user_id,status,revision,submitted_at)
 values(p_mission_id,p_seat_code,p_payload,(select auth.uid()),
 case when p_submit then 'submitted' else 'draft' end,1,
 case when p_submit then now() else null end)
 on conflict(mission_id,seat_code) do update
 set payload=excluded.payload,
 revision=public.titularisation_contributions.revision+1,
 updated_at=now(),
 status=excluded.status,
 submitted_at=excluded.submitted_at,
 author_user_id=excluded.author_user_id
 returning revision into v_revision;
 insert into public.titularisation_access_events(mission_id,seat_code,actor_id,kind,description)
 values(p_mission_id,p_seat_code,(select auth.uid()),
 case when p_submit then 'contribution_submitted' else 'contribution_saved' end,
 case when v_prev_status='submitted' then 'Corrected after submission; previous revision archived'
 else '' end);
 return v_revision;
end; $$;
revoke all on function public.save_titularisation_member_contribution(uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_titularisation_member_contribution(uuid,text,jsonb,boolean) to authenticated;
commit;
