-- P2.11 additive member seat identity, independent of immutable scoring revisions.
-- Existing contribution payload, seat access link and weights remain unchanged.
begin;
alter table public.titularisation_seats
 add column given_name text not null default '' check(length(given_name)<=100),
 add column family_name text not null default '' check(length(family_name)<=100),
 add column member_role text not null default '' check(length(member_role)<=160);
grant select(given_name,family_name,member_role)
 on public.titularisation_seats to authenticated;

-- Chair can prepare fields before the invitation is issued. The member can
-- subsequently correct any of them through a separately token-verified RPC.
create function public.set_prod_titularisation_seat_identity(
 p_mission_id uuid,p_seat_code text,p_given_name text,p_family_name text,p_member_role text
) returns boolean language plpgsql security definer set search_path='' as $owner$
declare uid uuid:=(select auth.uid());
 m public.titularisation_missions%rowtype;
 g text:=btrim(coalesce(p_given_name,'')); f text:=btrim(coalesce(p_family_name,''));
 v text:=btrim(coalesce(p_member_role,''));
begin
 if uid is null or not exists(select 1 from public.inspector_profiles p
  where p.id=uid and p.approved=true and p.account_status='approved' and p.is_admin=false)
 then raise exception 'Approved inspector required' using errcode='42501';end if;
 select * into m from public.titularisation_missions
 where id=p_mission_id and owner_id=uid and status='draft'
  and (expires_at is null or expires_at>now()) for update;
 if not found then raise exception 'Owned open mission required' using errcode='42501';end if;
 if p_seat_code not in ('member1','member2','member3')
  or char_length(g)>100 or char_length(f)>100 or char_length(v)>160
 then raise exception 'Invalid seat identity' using errcode='22023';end if;
 insert into public.titularisation_seats
  (mission_id,seat_code,given_name,family_name,member_role,display_name)
 values(p_mission_id,p_seat_code,g,f,v,left(concat_ws(' ',nullif(g,''),nullif(f,'')),160))
 on conflict(mission_id,seat_code) do update
 set given_name=excluded.given_name,family_name=excluded.family_name,
  member_role=excluded.member_role,display_name=excluded.display_name,updated_at=now();
 return true;
end $owner$;
revoke all on function public.set_prod_titularisation_seat_identity(uuid,text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.set_prod_titularisation_seat_identity(uuid,text,text,text,text)
 to authenticated;

-- The 256-bit capability is scoped to exactly one seat of an open mission.
-- No client-provided identity, role or seat is trusted without token verification.
create function public.save_prod_titularisation_member_identity(
 p_mission_id uuid,p_seat_code text,p_token text,
 p_given_name text,p_family_name text,p_member_role text
) returns boolean language plpgsql security definer set search_path='' as $member$
declare m public.titularisation_missions%rowtype;
 s public.titularisation_seats%rowtype;
 g text:=btrim(coalesce(p_given_name,'')); f text:=btrim(coalesce(p_family_name,''));
 v text:=btrim(coalesce(p_member_role,''));
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$'
  or p_seat_code not in ('member1','member2','member3')
  or char_length(g)>100 or char_length(f)>100 or char_length(v)>160
 then raise exception 'Invalid identity or token' using errcode='22023';end if;
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
 update public.titularisation_seats
 set given_name=g,family_name=f,member_role=v,
  display_name=left(concat_ws(' ',nullif(g,''),nullif(f,'')),160),updated_at=now()
 where mission_id=p_mission_id and seat_code=p_seat_code;
 return true;
end $member$;
revoke all on function public.save_prod_titularisation_member_identity(uuid,text,text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.save_prod_titularisation_member_identity(uuid,text,text,text,text,text)
 to anon,authenticated;

-- Preserve the existing read protocol while extending seat properties.
create or replace function public.load_prod_titularisation_member(
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
      'given_name',s.given_name,'family_name',s.family_name,
      'member_role',s.member_role,'status',s.status,'expires_at',s.expires_at),
  'saved',case when c.revision is null then null else jsonb_build_object(
    'payload',c.payload,'status',c.status,'revision',c.revision,'submitted_at',c.submitted_at) end
 );
end $load$;
revoke all on function public.load_prod_titularisation_member(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.load_prod_titularisation_member(uuid,text,text) to anon,authenticated;
commit;
