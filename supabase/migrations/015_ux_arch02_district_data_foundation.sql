-- UX-ARCH-02: additive, FAIL-CLOSED work-district authorization foundation.
-- This migration DOES NOT change the existing broad inspector_profiles / shared_institutions RLS.
-- Their final cut-over requires verified district assignments and historical mission review.
-- QA validation first, production additive rollout only after negative authorization tests.
begin;
create schema if not exists ux_core;
revoke all on schema ux_core from public, anon, authenticated;
grant usage on schema ux_core to authenticated;

create table if not exists public.work_districts(
 id uuid primary key default gen_random_uuid(),
 code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9._-]{2,39}$'),
 label text not null check (length(trim(label)) between 3 and 160),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.inspector_profiles
 add column if not exists work_district_id uuid references public.work_districts(id);
create index if not exists inspector_profiles_work_district_idx
 on public.inspector_profiles(work_district_id);

create or replace function ux_core.approved_inspector()
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.inspector_profiles p
 where p.id=(select auth.uid()) and p.approved
 and p.account_status='approved');
$$;
create or replace function ux_core.is_admin()
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.inspector_profiles p
 where p.id=(select auth.uid()) and p.approved and p.is_admin
 and p.account_status='approved');
$$;
create or replace function ux_core.my_district()
returns uuid language sql stable security definer set search_path=''
as $$
 select p.work_district_id from public.inspector_profiles p
 join public.work_districts d on d.id=p.work_district_id and d.active
 where p.id=(select auth.uid()) and p.approved and p.account_status='approved';
$$;
revoke all on function ux_core.approved_inspector(),ux_core.is_admin(),
 ux_core.my_district() from public,anon,authenticated;
grant execute on function ux_core.approved_inspector(),ux_core.is_admin(),
 ux_core.my_district() to authenticated;

create table if not exists public.work_district_assignment_events(
 id uuid primary key default gen_random_uuid(),
 inspector_id uuid not null references public.inspector_profiles(id),
 previous_district_id uuid references public.work_districts(id),
 new_district_id uuid not null references public.work_districts(id),
 admin_id uuid not null references public.inspector_profiles(id),
 reason text not null check(length(trim(reason)) between 10 and 500),
 changed_at timestamptz not null default now()
);

create table if not exists public.inspector_private_records(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.inspector_profiles(id),
 work_district_id uuid not null references public.work_districts(id),
 kind text not null check(kind in ('institution','reference','note')),
 title text not null check(length(trim(title)) between 3 and 250),
 payload jsonb not null default '{}'::jsonb
  check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=65536),
 revision bigint not null default 1 check(revision>=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists inspector_private_records_owner_idx
 on public.inspector_private_records(owner_id,updated_at desc);

create table if not exists public.mission_preparations(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.inspector_profiles(id),
 work_district_id uuid not null references public.work_districts(id),
 template_id text not null check(template_id in ('OFFICIAL_REPORT_TEMPLATE_03','TITULARISATION')),
 title text not null check(length(trim(title)) between 3 and 250),
 fields jsonb not null default '{}'::jsonb
  check(jsonb_typeof(fields)='object' and pg_column_size(fields)<=65536),
 phase text not null default 'preparation'
  check(phase in ('preparation','ready','active','review','closed')),
 planned_date date,
 revision bigint not null default 1 check(revision>=1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists mission_preparations_owner_idx
 on public.mission_preparations(owner_id,updated_at desc);

create table if not exists public.district_publication_requests(
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.inspector_profiles(id),
 work_district_id uuid not null references public.work_districts(id),
 private_record_id uuid not null references public.inspector_private_records(id),
 resource_kind text not null check(resource_kind='institution'),
 proposed_payload jsonb not null check(jsonb_typeof(proposed_payload)='object'
  and pg_column_size(proposed_payload)<=65536),
 status text not null default 'submitted'
  check(status in ('submitted','approved','rejected')),
 reviewer_id uuid references public.inspector_profiles(id),
 decision_reason text,
 submitted_at timestamptz not null default now(),
 decided_at timestamptz
);
create index if not exists district_publication_requests_scope_idx
 on public.district_publication_requests(work_district_id,status,submitted_at desc);
create index if not exists district_publication_requests_author_idx
 on public.district_publication_requests(author_id,submitted_at desc);

create table if not exists public.district_published_resources(
 id uuid primary key default gen_random_uuid(),
 work_district_id uuid not null references public.work_districts(id),
 resource_kind text not null check(resource_kind='institution'),
 title text not null check(length(trim(title)) between 3 and 250),
 code text not null default '',
 wilaya text not null default '',
 payload jsonb not null check(jsonb_typeof(payload)='object'
  and pg_column_size(payload)<=65536),
 publication_status text not null default 'published'
  check(publication_status='published'),
 source_request_id uuid not null unique references public.district_publication_requests(id),
 approved_by uuid not null references public.inspector_profiles(id),
 published_at timestamptz not null default now(),
 version bigint not null default 1 check(version>=1)
);
create index if not exists district_published_resources_scope_idx
 on public.district_published_resources(work_district_id,resource_kind,publication_status);
create unique index if not exists district_published_resources_code_uniq
 on public.district_published_resources(work_district_id,lower(code))
 where length(trim(code))>0;

create table if not exists public.district_access_grants(
 id uuid primary key default gen_random_uuid(),
 grantee_id uuid not null references public.inspector_profiles(id),
 grantee_district_id_at_grant uuid not null references public.work_districts(id),
 granted_by uuid not null references public.inspector_profiles(id),
 capability text not null check(capability in ('view_inspector','view_institution','collaborate_mission')),
 resource_id uuid not null,
 resource_district_id uuid not null references public.work_districts(id),
 reason text not null check(length(trim(reason)) between 10 and 500),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 revoked_by uuid references public.inspector_profiles(id),
 check(expires_at>created_at and expires_at<=created_at+interval '30 days'),
 check((revoked_at is null)=(revoked_by is null))
);
create index if not exists district_access_grants_lookup_idx
 on public.district_access_grants(grantee_id,capability,resource_id,expires_at)
 where revoked_at is null;

create table if not exists public.district_access_grant_events(
 id uuid primary key default gen_random_uuid(),
 grant_id uuid not null references public.district_access_grants(id),
 action text not null check(action in ('granted','revoked')),
 actor_id uuid not null references public.inspector_profiles(id),
 reason text not null,
 occurred_at timestamptz not null default now()
);

create or replace function ux_core.has_grant(p_capability text,p_resource uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
 select 1 from public.district_access_grants g
 join public.inspector_profiles p on p.id=g.grantee_id
 join public.work_districts d on d.id=p.work_district_id and d.active
 where p.id=(select auth.uid()) and p.approved and p.account_status='approved'
   and g.grantee_id=p.id and g.grantee_district_id_at_grant=p.work_district_id
   and g.capability=p_capability and g.resource_id=p_resource
   and g.revoked_at is null and g.expires_at>now()
 );
$$;
revoke all on function ux_core.has_grant(text,uuid) from public,anon,authenticated;
grant execute on function ux_core.has_grant(text,uuid) to authenticated;

-- RLS is enabled *before* granting client-facing table privileges.
alter table public.work_districts enable row level security;
alter table public.work_district_assignment_events enable row level security;
alter table public.inspector_private_records enable row level security;
alter table public.mission_preparations enable row level security;
alter table public.district_publication_requests enable row level security;
alter table public.district_published_resources enable row level security;
alter table public.district_access_grants enable row level security;
alter table public.district_access_grant_events enable row level security;
revoke all on public.work_districts,public.work_district_assignment_events,
 public.inspector_private_records,public.mission_preparations,
 public.district_publication_requests,public.district_published_resources,
 public.district_access_grants,public.district_access_grant_events
 from public,anon,authenticated;
grant select on public.work_districts to authenticated;
grant select,insert,update on public.inspector_private_records,public.mission_preparations to authenticated;
grant select on public.district_publication_requests,public.district_published_resources,
 public.district_access_grants,public.district_access_grant_events,
 public.work_district_assignment_events to authenticated;

create policy ux_district_read on public.work_districts
 for select to authenticated using (
 active and ((select ux_core.my_district())=id or (select ux_core.is_admin()))
);
create policy ux_assignment_admin_read on public.work_district_assignment_events
 for select to authenticated using((select ux_core.is_admin()));
create policy ux_private_read on public.inspector_private_records
 for select to authenticated using(
 owner_id=(select auth.uid()) and (select ux_core.approved_inspector()));
create policy ux_private_insert on public.inspector_private_records
 for insert to authenticated with check (
 owner_id=(select auth.uid()) and work_district_id=(select ux_core.my_district())
 and (select ux_core.approved_inspector()));
create policy ux_private_update on public.inspector_private_records
 for update to authenticated using(
 owner_id=(select auth.uid()) and (select ux_core.approved_inspector()))
 with check(owner_id=(select auth.uid()) and (select ux_core.approved_inspector()));
create policy ux_prep_read on public.mission_preparations
 for select to authenticated using(
 owner_id=(select auth.uid()) and (select ux_core.approved_inspector()));
create policy ux_prep_insert on public.mission_preparations
 for insert to authenticated with check(
 owner_id=(select auth.uid()) and work_district_id=(select ux_core.my_district())
 and (select ux_core.approved_inspector()));
create policy ux_prep_update on public.mission_preparations
 for update to authenticated using(
 owner_id=(select auth.uid()) and (select ux_core.approved_inspector()))
 with check(owner_id=(select auth.uid()) and (select ux_core.approved_inspector()));
create policy ux_publication_request_read on public.district_publication_requests
 for select to authenticated using (
 (author_id=(select auth.uid()) and (select ux_core.approved_inspector()))
 or ((select ux_core.is_admin()) and work_district_id=(select ux_core.my_district()))
);
create policy ux_resource_read on public.district_published_resources
 for select to authenticated using (
 publication_status='published' and (select ux_core.approved_inspector()) and
 (work_district_id=(select ux_core.my_district()) or
  ux_core.has_grant('view_institution',id))
);
create policy ux_grant_read on public.district_access_grants
 for select to authenticated using(
 grantee_id=(select auth.uid()) or (granted_by=(select auth.uid()) and (select ux_core.is_admin()))
);
create policy ux_grant_events_read on public.district_access_grant_events
 for select to authenticated using(
 exists(select 1 from public.district_access_grants g where g.id=grant_id
 and (g.grantee_id=(select auth.uid()) or
 (g.granted_by=(select auth.uid()) and (select ux_core.is_admin()))))
);

-- Defense-in-depth: immutable owner, district and creation metadata.
create or replace function ux_core.immutable_owned_record()
returns trigger language plpgsql set search_path=''
as $$
begin
 if tg_op='UPDATE' then
  if new.owner_id is distinct from old.owner_id or
     new.work_district_id is distinct from old.work_district_id or
     new.id is distinct from old.id or
     new.created_at is distinct from old.created_at then
   raise exception 'Immutable owner/district cannot be changed' using errcode='42501';
  end if;
  if new.revision<>old.revision+1 then
   raise exception 'Revision conflict' using errcode='40001';
  end if;
  new.updated_at=now();
 end if;
 return new;
end;
$$;
create trigger ux_private_revision_guard before update on public.inspector_private_records
 for each row execute function ux_core.immutable_owned_record();
create trigger ux_prep_revision_guard before update on public.mission_preparations
 for each row execute function ux_core.immutable_owned_record();

-- Mutations of review resources/grants are restricted to guarded RPC only;
-- no table insert/update/delete grant is issued to authenticated/anon.
commit;
