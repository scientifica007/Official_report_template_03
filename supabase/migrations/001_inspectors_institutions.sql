-- M2.1 — Shared institution directory for verified/approved professional inspectors
-- Execute ONCE in your own Supabase project's SQL Editor (never inside GitHub Pages).
-- The public browser key is NOT an authorization boundary: every table uses RLS.
begin;
create extension if not exists pgcrypto;

create table if not exists public.inspector_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 first_name text not null default '',
 last_name text not null default '',
 profession text not null default 'IFEP' check (profession in ('IFEP','ITP','IAF')),
 district text not null default '',
 approved boolean not null default false,
 is_admin boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists inspector_profiles_approved_idx on public.inspector_profiles (approved);

-- The auth-service creates professional profiles; users must NEVER self-approve.
create or replace function public.create_inspector_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare raw_prof text;
begin
 raw_prof := coalesce(new.raw_user_meta_data->>'profession','IFEP');
 insert into public.inspector_profiles(id,email,first_name,last_name,profession,district,approved,is_admin)
 values (new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'first_name',''),120),
 left(coalesce(new.raw_user_meta_data->>'last_name',''),120),
 case when raw_prof in ('IFEP','ITP','IAF') then raw_prof else 'IFEP' end,
 left(coalesce(new.raw_user_meta_data->>'district',''),120),false,false)
 on conflict (id) do nothing;
 return new;
end; $$;
drop trigger if exists trg_inspector_on_signup on auth.users;
create trigger trg_inspector_on_signup after insert on auth.users
for each row execute function public.create_inspector_profile();

create or replace function public.is_approved_inspector()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.inspector_profiles
 where id=(select auth.uid()) and approved=true);
$$;
create or replace function public.is_admin_inspector()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.inspector_profiles
 where id=(select auth.uid()) and approved=true and is_admin=true);
$$;

create or replace function public.approve_inspector(p_user_id uuid,p_approved boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_admin_inspector() then raise exception 'Only an approved system administrator can approve inspector accounts' using errcode='42501'; end if;
 if p_user_id=(select auth.uid()) and not p_approved then raise exception 'Cannot revoke own approval' using errcode='42501'; end if;
 if not exists(select 1 from public.inspector_profiles where id=p_user_id) then raise exception 'Unknown inspector'; end if;
 update public.inspector_profiles set approved=p_approved where id=p_user_id;
end; $$;

create table if not exists public.shared_institutions (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 1 and 300),
 wilaya text not null default '',
 code text not null default '',
 institution_data jsonb not null default '{}'::jsonb check(jsonb_typeof(institution_data)='object'),
 director_data jsonb not null default '{}'::jsonb check(jsonb_typeof(director_data)='object'),
 version bigint not null default 1 check(version > 0),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint institution_identity_consistency check (
   coalesce(institution_data->>'name','')=name
   and coalesce(institution_data->>'code','')=code
   and coalesce(institution_data->>'wilaya','')=wilaya
 )
);
create unique index if not exists shared_institutions_code_unique
 on public.shared_institutions(lower(btrim(code))) where btrim(code)<>'';
create unique index if not exists shared_institutions_name_wilaya_unique
 on public.shared_institutions(lower(btrim(name)),lower(btrim(wilaya)));

create table if not exists public.institution_changes (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.shared_institutions(id) on delete restrict,
 actor_id uuid references auth.users(id),
 action text not null check(action in ('created','updated')),
 changes jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists institution_changes_by_institution on public.institution_changes(institution_id,created_at desc);

create table if not exists public.institution_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references auth.users(id) on delete cascade,
 change_id uuid not null references public.institution_changes(id) on delete cascade,
 read_at timestamptz,
 created_at timestamptz not null default now(),
 unique(recipient_id,change_id)
);
create index if not exists notifications_by_recipient on public.institution_notifications(recipient_id,created_at desc);

-- All changes are audited at database level, not merely by cooperating web clients.
create or replace function public.guard_shared_institution()
returns trigger language plpgsql set search_path = '' as $$
begin
 if (select auth.uid()) is null or not public.is_approved_inspector() then
   raise exception 'An approved inspector is required' using errcode='42501';
 end if;
 if new.updated_by<>(select auth.uid()) then raise exception 'updated_by must be current inspector' using errcode='42501'; end if;
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
end; $$;
drop trigger if exists trg_guard_shared_institution on public.shared_institutions;
create trigger trg_guard_shared_institution before insert or update on public.shared_institutions
for each row execute function public.guard_shared_institution();

create or replace function public.audit_institution_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare delta jsonb:='{}'::jsonb; fld text; oldv jsonb; newv jsonb; audit_id uuid; audit_action text;
begin
 if tg_op='INSERT' then
   delta:=jsonb_build_object('institution',jsonb_build_object('old',null,'new',new.institution_data),
                            'director',jsonb_build_object('old',null,'new',new.director_data));
   audit_action:='created';
 else
   for fld in select key from jsonb_object_keys(old.institution_data || new.institution_data) as key loop
     oldv:=old.institution_data->fld;newv:=new.institution_data->fld;
     if oldv is distinct from newv then
       delta:=delta||jsonb_build_object('institution.'||fld,jsonb_build_object('old',oldv,'new',newv));
     end if;
   end loop;
   for fld in select key from jsonb_object_keys(old.director_data || new.director_data) as key loop
     oldv:=old.director_data->fld;newv:=new.director_data->fld;
     if oldv is distinct from newv then
       delta:=delta||jsonb_build_object('director.'||fld,jsonb_build_object('old',oldv,'new',newv));
     end if;
   end loop;
   if delta='{}'::jsonb then return new; end if;
   audit_action:='updated';
 end if;
 insert into public.institution_changes(institution_id,actor_id,action,changes)
 values(new.id,new.updated_by,audit_action,delta) returning id into audit_id;
 insert into public.institution_notifications(recipient_id,change_id)
 select id,audit_id from public.inspector_profiles
 where approved=true and id<>new.updated_by;
 return new;
end; $$;
drop trigger if exists trg_audit_shared_institution on public.shared_institutions;
create trigger trg_audit_shared_institution after insert or update on public.shared_institutions
for each row execute function public.audit_institution_change();

alter table public.inspector_profiles enable row level security;
alter table public.shared_institutions enable row level security;
alter table public.institution_changes enable row level security;
alter table public.institution_notifications enable row level security;

drop policy if exists inspector_profile_read on public.inspector_profiles;
create policy inspector_profile_read on public.inspector_profiles for select to authenticated
using (id=(select auth.uid()) or
       (approved and public.is_approved_inspector()) or
       public.is_admin_inspector());

drop policy if exists institution_read on public.shared_institutions;
create policy institution_read on public.shared_institutions for select to authenticated
using (public.is_approved_inspector());
drop policy if exists institution_insert on public.shared_institutions;
create policy institution_insert on public.shared_institutions for insert to authenticated
with check(public.is_approved_inspector() and created_by=(select auth.uid()) and updated_by=(select auth.uid()) and version=1);
drop policy if exists institution_update on public.shared_institutions;
create policy institution_update on public.shared_institutions for update to authenticated
using(public.is_approved_inspector())
with check(public.is_approved_inspector() and updated_by=(select auth.uid()));

drop policy if exists changes_read on public.institution_changes;
create policy changes_read on public.institution_changes for select to authenticated
using(public.is_approved_inspector());

drop policy if exists notifications_read on public.institution_notifications;
create policy notifications_read on public.institution_notifications for select to authenticated
using(recipient_id=(select auth.uid()) and public.is_approved_inspector());
drop policy if exists notifications_mark_read on public.institution_notifications;
create policy notifications_mark_read on public.institution_notifications for update to authenticated
using(recipient_id=(select auth.uid()) and public.is_approved_inspector())
with check(recipient_id=(select auth.uid()) and public.is_approved_inspector());

-- API grants. Never grant the browser permission to change approval or audit history.
revoke all on public.inspector_profiles from anon,authenticated;
revoke all on public.shared_institutions from anon,authenticated;
revoke all on public.institution_changes from anon,authenticated;
revoke all on public.institution_notifications from anon,authenticated;
grant select on public.inspector_profiles to authenticated;
grant select,insert on public.shared_institutions to authenticated;
grant update(name,wilaya,code,institution_data,director_data,version,updated_by) on public.shared_institutions to authenticated;
grant select on public.institution_changes to authenticated;
grant select on public.institution_notifications to authenticated;
grant update(read_at) on public.institution_notifications to authenticated;
grant execute on function public.is_approved_inspector() to authenticated;
grant execute on function public.is_admin_inspector() to authenticated;
revoke all on function public.approve_inspector(uuid,boolean) from public,anon;
grant execute on function public.approve_inspector(uuid,boolean) to authenticated;
revoke all on function public.create_inspector_profile() from public,anon,authenticated;
revoke all on function public.guard_shared_institution() from public,anon,authenticated;
revoke all on function public.audit_institution_change() from public,anon,authenticated;
commit;

-- INITIAL BOOTSTRAP (run separately AFTER registering and verifying your own account):
-- UPDATE public.inspector_profiles
-- SET approved=true,is_admin=true
-- WHERE email='YOUR_VERIFIED_EMAIL';
-- Do not use service_role keys in website files or GitHub secrets for this static browser app.
