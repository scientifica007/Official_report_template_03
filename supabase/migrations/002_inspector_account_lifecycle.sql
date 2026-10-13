-- M2.1.1: additive, existing-account-safe migration.
-- Run ONCE in the owner's Supabase SQL Editor, on the established production project.
-- It does not delete users, institutions, reports or audit records.
begin;

-- Preserve existing decisions: approved accounts stay approved; all other
-- existing accounts become pending, never silently marked rejected.
alter table public.inspector_profiles
 add column if not exists account_status text;
update public.inspector_profiles
set account_status = case when approved then 'approved' else 'pending' end
where account_status is null;
alter table public.inspector_profiles
 alter column account_status set default 'pending',
 alter column account_status set not null;

do $$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.inspector_profiles'::regclass
               and conname='inspector_status_allowed') then
  alter table public.inspector_profiles
   add constraint inspector_status_allowed
   check (account_status in ('pending','approved','rejected','suspended'));
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.inspector_profiles'::regclass
               and conname='inspector_status_approved_consistency') then
  alter table public.inspector_profiles
   add constraint inspector_status_approved_consistency
   check (approved = (account_status = 'approved'));
 end if;
end $$;

create table if not exists public.inspector_account_decisions (
 id uuid primary key default gen_random_uuid(),
 inspector_id uuid not null references auth.users(id) on delete restrict,
 decided_by uuid not null references auth.users(id) on delete restrict,
 previous_status text not null check (previous_status in ('pending','approved','rejected','suspended')),
 new_status text not null check (new_status in ('pending','approved','rejected','suspended')),
 reason text check (reason is null or char_length(reason) <= 1000),
 decided_at timestamptz not null default now(),
 constraint inspector_status_must_change check (previous_status <> new_status)
);
create index if not exists account_decisions_target_recent
 on public.inspector_account_decisions(inspector_id,decided_at desc);

alter table public.inspector_account_decisions enable row level security;

drop policy if exists account_decisions_visible on public.inspector_account_decisions;
create policy account_decisions_visible on public.inspector_account_decisions
 for select to authenticated using (
  inspector_id = (select auth.uid()) or public.is_admin_inspector()
 );

revoke all on public.inspector_account_decisions from public,anon,authenticated;
grant select on public.inspector_account_decisions to authenticated;

create or replace function public.set_inspector_account_status(
 p_user_id uuid,
 p_new_status text,
 p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
 v_actor uuid := (select auth.uid());
 v_previous text;
 v_target_admin boolean;
 v_confirmed timestamptz;
 v_reason text := nullif(btrim(coalesce(p_reason,'')),'');
begin
 if v_actor is null or not public.is_admin_inspector() then
  raise exception 'Approved system administrator required' using errcode='42501';
 end if;
 if p_user_id is null or p_user_id = v_actor then
  raise exception 'Cannot make lifecycle decisions about own account' using errcode='42501';
 end if;
 if p_new_status not in ('approved','rejected','suspended') or p_new_status is null then
  raise exception 'Unsupported account status' using errcode='22023';
 end if;
 if char_length(coalesce(p_reason,'')) > 1000 then
  raise exception 'Decision reason is too long (max 1000 characters)' using errcode='22023';
 end if;

 -- Serialize decisions and prevent inconsistent concurrent updates.
 select p.account_status,p.is_admin,u.email_confirmed_at
 into v_previous,v_target_admin,v_confirmed
 from public.inspector_profiles p
 join auth.users u on u.id=p.id
 where p.id=p_user_id
 for update of p;
 if not found then
  raise exception 'Inspector account not found' using errcode='P0002';
 end if;
 if v_target_admin and p_new_status<>'approved' then
  raise exception 'Administrator access cannot be revoked through this workflow' using errcode='42501';
 end if;
 if v_previous = p_new_status then
  raise exception 'The account already has this status' using errcode='22023';
 end if;
 if not (
   (v_previous='pending'   and p_new_status in ('approved','rejected')) or
   (v_previous='approved'  and p_new_status='suspended') or
   (v_previous='rejected'  and p_new_status='approved') or
   (v_previous='suspended' and p_new_status='approved')
 ) then
  raise exception 'Invalid account status transition: % -> %',v_previous,p_new_status using errcode='22023';
 end if;
 if p_new_status='approved' and v_confirmed is null then
  raise exception 'Inspector must confirm email before approval' using errcode='42501';
 end if;

 update public.inspector_profiles
 set account_status=p_new_status,
     approved=(p_new_status='approved')
 where id=p_user_id;

 insert into public.inspector_account_decisions
 (inspector_id,decided_by,previous_status,new_status,reason)
 values (p_user_id,v_actor,v_previous,p_new_status,v_reason);
end; $$;

-- Preserve compatibility with cached M2.1 web clients while ensuring every
-- legacy approval is routed through the audited lifecycle workflow.
create or replace function public.approve_inspector(p_user_id uuid,p_approved boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_approved is distinct from true then
  raise exception 'Legacy revocation is unsupported. Use set_inspector_account_status.' using errcode='22023';
 end if;
 perform public.set_inspector_account_status(p_user_id,'approved',null);
end; $$;

revoke all on function public.set_inspector_account_status(uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_inspector_account_status(uuid,text,text) to authenticated;
revoke all on function public.approve_inspector(uuid,boolean) from public,anon,authenticated;
grant execute on function public.approve_inspector(uuid,boolean) to authenticated;

commit;

-- Verification (run separately, after the transaction succeeds):
-- select account_status,approved,is_admin,count(*) from public.inspector_profiles
-- group by 1,2,3 order by 1,2,3;
-- select relname,relrowsecurity from pg_class where oid='public.inspector_account_decisions'::regclass;
