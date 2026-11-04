-- QA ONLY: federated inspector sign-in from the approved primary platform.
-- This migration MUST NOT be applied to the production Supabase project.
-- Standard QA inspector accounts and all previously saved missions remain intact.

alter table public.inspector_profiles
 add column if not exists federation_required boolean not null default false;

create table if not exists public.qa_federated_inspector_links (
  qa_user_id uuid primary key references auth.users(id) on delete cascade,
  production_user_id uuid not null unique,
  federation_only boolean not null default true,
  expires_at timestamptz not null,
  first_linked_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  constraint qa_federation_expiry_valid check (expires_at > first_linked_at)
);

alter table public.qa_federated_inspector_links enable row level security;
revoke all on table public.qa_federated_inspector_links from public, anon, authenticated;
grant select on table public.qa_federated_inspector_links to authenticated;

drop policy if exists qa_federated_link_own_read on public.qa_federated_inspector_links;
create policy qa_federated_link_own_read
on public.qa_federated_inspector_links for select to authenticated
using (qa_user_id = (select auth.uid()));

-- All committee-owner RLS uses this central predicate.
-- Local QA-approved accounts remain valid as before; new federated accounts
-- lose access when their proof of primary-portal approval ages out (12 h).
create or replace function public.is_approved_inspector()
returns boolean language sql stable security definer set search_path = ''
as $function$
 select exists (
  select 1 from public.inspector_profiles p
  where p.id = (select auth.uid())
    and p.approved = true
    and p.account_status = 'approved'
    and (
      p.federation_required = false
      or exists (
        select 1 from public.qa_federated_inspector_links f
        where f.qa_user_id = p.id
          and f.federation_only = true
          and f.expires_at > now()
      )
    )
 );
$function$;

-- The browser is not allowed to write federation records.
-- Only the QA Edge Function service-role identity may provision or refresh them.
comment on table public.qa_federated_inspector_links is
 'QA-only, one-to-one identity binding for approved primary-platform IFEP/ITP inspectors; tokens and passwords are never stored.';
