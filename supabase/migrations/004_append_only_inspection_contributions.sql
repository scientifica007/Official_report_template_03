-- M3.2 — Immutable multi-inspector findings, recommendations and authored replies.
-- Requires migration 003_shared_inspection_missions.sql. Non-destructive.
-- No direct authenticated INSERT/UPDATE/DELETE to inspection_contributions.
begin;

-- Pin allowed identifiers to the official catalog deployed with Report 03.
-- This prevents a malicious client from injecting unrecognized indicator IDs.
create table if not exists public.inspection_catalog_targets (
 item_id text primary key
);
insert into public.inspection_catalog_targets(item_id) values
 ('II-MAIN'),
 ('II-MAIN-I001'),
 ('II-MAIN-I002'),
 ('II-MAIN-I003A'),
 ('II-MAIN-I003B'),
 ('II-MAIN-I003C'),
 ('II-MAIN-I003D'),
 ('II-MAIN-I003E'),
 ('II-MAIN-I003F'),
 ('II-MAIN-I003G'),
 ('II-MAIN-I003H'),
 ('II-MAIN-I003I'),
 ('II-MAIN-I003J'),
 ('II-MAIN-I003K'),
 ('II-MAIN-I003L'),
 ('II-MAIN-I003M'),
 ('II-MAIN-I003N'),
 ('II-MAIN-I003O'),
 ('III-01'),
 ('III-01-I001'),
 ('III-01-I002'),
 ('III-02'),
 ('III-02-I001'),
 ('III-02-I002'),
 ('III-02-I003'),
 ('III-02-I004'),
 ('III-02-I005'),
 ('III-03'),
 ('III-03-I001'),
 ('III-03-I002'),
 ('III-03-I003'),
 ('III-03-I004'),
 ('III-04'),
 ('III-04-I001'),
 ('III-04-I002'),
 ('III-04-I003'),
 ('III-05'),
 ('III-05-I001'),
 ('III-05-I002'),
 ('III-05-I003'),
 ('III-05-I004'),
 ('III-06'),
 ('III-06-I001'),
 ('III-06-I002'),
 ('III-06-I003'),
 ('III-06-I004'),
 ('III-06-I005'),
 ('III-06-I006'),
 ('III-07'),
 ('III-07-I001'),
 ('III-07-I002'),
 ('III-08'),
 ('III-08-I001'),
 ('III-08-I002'),
 ('III-09'),
 ('III-09-I001'),
 ('III-09-I002'),
 ('III-09-I003'),
 ('III-09-I004'),
 ('III-09-I005'),
 ('III-10'),
 ('III-10-I001'),
 ('III-10-I002'),
 ('III-10-I003'),
 ('III-10-I004'),
 ('III-10-I005'),
 ('III-11'),
 ('III-11-I001'),
 ('III-11-I002'),
 ('III-11-I003'),
 ('III-11-I004'),
 ('III-11-I005'),
 ('III-11-I006'),
 ('III-12'),
 ('III-12-I001'),
 ('III-12-I002'),
 ('III-12-I003'),
 ('III-12-I004'),
 ('III-12-I005'),
 ('III-12-I006'),
 ('III-12-I007'),
 ('III-12-I008'),
 ('III-12-I009'),
 ('III-12-I010'),
 ('III-12-I011'),
 ('III-12-I012'),
 ('III-12-I013'),
 ('III-13'),
 ('III-13-I001'),
 ('III-13-I002'),
 ('III-13-I003'),
 ('III-13-I004'),
 ('III-13-I005'),
 ('III-13-I006'),
 ('III-13-I007'),
 ('III-14'),
 ('III-14-I001'),
 ('III-14-I002'),
 ('III-14-I003'),
 ('III-14-I004'),
 ('III-15'),
 ('III-15-I001'),
 ('III-15-I002'),
 ('III-15-I003'),
 ('III-15-I004'),
 ('III-16'),
 ('III-16-I001'),
 ('III-16-I002'),
 ('III-17'),
 ('III-17-I001'),
 ('III-18'),
 ('III-18-I001'),
 ('III-18-I002'),
 ('III-19'),
 ('III-19-I001'),
 ('III-19-I002'),
 ('IV-01'),
 ('IV-01-I001'),
 ('IV-01-I002'),
 ('IV-02'),
 ('IV-02-I001'),
 ('IV-03'),
 ('IV-03-I001'),
 ('IV-03-I002'),
 ('IV-03-I003'),
 ('IV-03-I004'),
 ('IV-03-I005'),
 ('IV-03-I006'),
 ('IV-03-I007'),
 ('IV-03-I008'),
 ('IV-03-I009'),
 ('IV-03-I010'),
 ('IV-03-I011A'),
 ('IV-03-I011B'),
 ('IV-03-I011C'),
 ('IV-03-I012'),
 ('IV-03-I013'),
 ('IV-04'),
 ('IV-04-I001'),
 ('V-01'),
 ('V-01-I001'),
 ('V-02'),
 ('V-02-I001'),
 ('V-02-I002'),
 ('V-02-I003'),
 ('V-03'),
 ('V-03-I001'),
 ('V-03-I002A'),
 ('V-03-I002B'),
 ('V-03-I003'),
 ('V-03-I004'),
 ('V-03-I005'),
 ('V-04'),
 ('V-04-I001'),
 ('V-05'),
 ('V-05-I001'),
 ('VI-01'),
 ('VI-01-I001'),
 ('VI-01-I002'),
 ('VI-01-I003'),
 ('VI-01-I004'),
 ('VI-02'),
 ('VI-02-I001'),
 ('VI-02-I002'),
 ('VI-02-I003A'),
 ('VI-02-I003B'),
 ('VI-02-I003C'),
 ('VI-02-I004'),
 ('VI-02-I005'),
 ('VI-02-I006'),
 ('VI-02-I007'),
 ('VI-02-I008'),
 ('VI-02-I009'),
 ('VI-02-I010'),
 ('VII-01'),
 ('VII-01-I001'),
 ('VII-01-I002'),
 ('VII-01-I003'),
 ('VII-01-I004'),
 ('VII-01-I005'),
 ('VII-02'),
 ('VII-02-I001'),
 ('VII-02-I002'),
 ('VII-02-I003'),
 ('VII-02-I004A'),
 ('VII-02-I004B'),
 ('VII-02-I004C'),
 ('VII-03'),
 ('VII-03-I001'),
 ('VII-03-I002'),
 ('VII-04'),
 ('VII-04-I001'),
 ('VII-04-I002'),
 ('VII-05'),
 ('VII-05-I001'),
 ('VII-05-I002'),
 ('VII-05-I003'),
 ('VIII-01'),
 ('VIII-01-I001'),
 ('VIII-01-I002'),
 ('VIII-01-I003'),
 ('VIII-01-I004'),
 ('VIII-01-I005'),
 ('VIII-01-I006'),
 ('VIII-01-I007'),
 ('VIII-01-I008'),
 ('VIII-02'),
 ('VIII-02-I001'),
 ('IX-GENERAL'),
 ('IX-GENERAL-I001'),
 ('IX-GENERAL-I002'),
 ('IX-GENERAL-I003'),
 ('IX-GENERAL-I004'),
 ('IX-GENERAL-I005'),
 ('IX-GENERAL-I006'),
 ('X'),
 ('XI')
on conflict (item_id) do nothing;
revoke all on public.inspection_catalog_targets from public,anon,authenticated;

-- UUID is generated on the browser before sending; retries reuse the same
-- request UUID to prevent duplicate inserts after ambiguous network failures.
create or replace function public.append_inspection_contribution(
 p_mission_id uuid,
 p_item_id text,
 p_kind text,
 p_body text,
 p_parent_id uuid default null,
 p_client_request_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
 v_actor uuid := (select auth.uid());
 v_id uuid;
 v_parent public.inspection_contributions%rowtype;
 v_body text := btrim(coalesce(p_body,''));
 v_item text := btrim(coalesce(p_item_id,''));
 v_existing public.inspection_contributions%rowtype;
begin
 if v_actor is null or not public.is_accepted_mission_member(p_mission_id) then
  raise exception 'Accepted and active inspector membership required' using errcode='42501';
 end if;

 -- The row lock serializes contribution submission with mission closure.
 perform 1 from public.inspection_missions
 where id=p_mission_id and status='draft' for share;
 if not found then
  raise exception 'Mission is closed or unavailable' using errcode='42501';
 end if;

 if p_client_request_id is null then
  raise exception 'Request identifier required to prevent duplicate contributions'
   using errcode='22023';
 end if;
 if char_length(v_body) not between 1 and 30000 then
  raise exception 'Contribution must contain between 1 and 30000 characters'
   using errcode='22023';
 end if;
 -- Enforce exact deployed catalog identifiers, not just a permissive pattern.
 if not exists (select 1 from public.inspection_catalog_targets where item_id=v_item) then
  raise exception 'Unrecognized official catalog item identifier' using errcode='22023';
 end if;
 if p_kind not in ('finding','recommendation','reply','correction') then
  raise exception 'Unsupported contribution kind' using errcode='22023';
 end if;
 if ((p_kind in ('reply','correction')) <> (p_parent_id is not null)) then
  raise exception 'Reply and correction require a parent; findings and recommendations cannot have one'
   using errcode='22023';
 end if;
 if p_parent_id is not null then
  select * into v_parent from public.inspection_contributions
   where id=p_parent_id and mission_id=p_mission_id and item_id=v_item;
  if not found or v_parent.kind not in ('finding','recommendation') then
   raise exception 'Parent must be a finding or recommendation from the same mission and item'
    using errcode='22023';
  end if;
  -- Only the originator may formally correct an existing original text.
  -- Peers may submit a reply, but may not silently replace its meaning.
  if p_kind='correction' and v_parent.author_id<>v_actor then
   raise exception 'Only the original author may issue a correction'
    using errcode='42501';
  end if;
 end if;

 -- Same request id + same payload is idempotent, including concurrent requests.
 insert into public.inspection_contributions
  (mission_id,item_id,kind,body,author_id,parent_id,client_request_id)
 values (p_mission_id,v_item,p_kind,v_body,v_actor,p_parent_id,p_client_request_id)
 on conflict (mission_id,author_id,client_request_id) do nothing
 returning id into v_id;
 if v_id is null then
  select * into v_existing from public.inspection_contributions
   where mission_id=p_mission_id and author_id=v_actor
     and client_request_id=p_client_request_id;
  if not found or v_existing.item_id<>v_item or v_existing.kind<>p_kind or
     v_existing.body<>v_body or v_existing.parent_id is distinct from p_parent_id then
   raise exception 'Request id was already used for different content'
    using errcode='23505';
  end if;
  v_id:=v_existing.id;
 end if;
 return v_id;
end; $$;

-- Default PUBLIC function EXECUTE is dangerous for SECURITY DEFINER RPCs.
revoke all on function public.append_inspection_contribution(uuid,text,text,text,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.append_inspection_contribution(uuid,text,text,text,uuid,uuid)
 to authenticated;

-- Repeat restrictive table grants as a migration-level invariant.
revoke insert,update,delete on public.inspection_contributions from public,anon,authenticated;
grant select on public.inspection_contributions to authenticated;

commit;

-- Verify after running:
-- select proname from pg_proc where pronamespace='public'::regnamespace
--   and proname='append_inspection_contribution';
-- select relrowsecurity from pg_class
--   where oid='public.inspection_contributions'::regclass;
