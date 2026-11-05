-- UX-ARCH-04: strengthen legacy helper authorization without changing existing accounts.
-- Disabled/suspended users are not approved inspectors; site Admin is not an inspector.
begin;
create or replace function public.is_approved_inspector()
returns boolean language sql stable security definer set search_path=''
as $fn$
 select exists(select 1 from public.inspector_profiles p
  where p.id=(select auth.uid()) and p.approved=true
    and p.account_status='approved' and not p.is_admin);
$fn$;
create or replace function public.is_admin_inspector()
returns boolean language sql stable security definer set search_path=''
as $fn$
 select exists(select 1 from public.inspector_profiles p
  where p.id=(select auth.uid()) and p.approved=true
    and p.account_status='approved' and p.is_admin);
$fn$;

-- Legacy record editing is admin-only under migration 019, and the trigger must
-- use the SAME authority predicate rather than an obsolete inspector-only check.
create or replace function public.guard_shared_institution()
returns trigger language plpgsql set search_path=''
as $fn$
begin
 if (select auth.uid()) is null or not ux_core.is_admin() then
  raise exception 'Site Admin required for legacy institution writes' using errcode='42501';
 end if;
 if new.updated_by<>(select auth.uid()) then
  raise exception 'updated_by must be current Admin' using errcode='42501';
 end if;
 if tg_op='INSERT' then
  if new.created_by<>(select auth.uid()) or new.version<>1 then
   raise exception 'Invalid creator or initial version' using errcode='42501';
  end if;
 else
  if new.created_by<>old.created_by or new.created_at<>old.created_at or new.id<>old.id then
   raise exception 'Immutable institution identity fields cannot change' using errcode='42501';
  end if;
  if new.version<>old.version+1 then
   raise exception 'Institution version must increase exactly once' using errcode='23514';
  end if;
 end if;
 new.updated_at=now();
 return new;
end; $fn$;
revoke all on function public.is_approved_inspector(),public.is_admin_inspector()
 from public,anon;
grant execute on function public.is_approved_inspector(),public.is_admin_inspector() to authenticated;
commit;
