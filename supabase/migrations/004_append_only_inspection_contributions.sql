-- M3.2 — Immutable multi-inspector findings, recommendations and authored replies.
-- Requires migration 003_shared_inspection_missions.sql. Non-destructive.
-- No direct authenticated INSERT/UPDATE/DELETE to inspection_contributions.
begin;

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
 -- Match the stable domain/indicator identifiers from catalog.json.
 if v_item not in ('X','XI') and v_item !~
    '^(II|III|IV|V|VI|VII|VIII|IX)(-[A-Za-z0-9]+)+$' then
  raise exception 'Invalid catalog item identifier' using errcode='22023';
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
