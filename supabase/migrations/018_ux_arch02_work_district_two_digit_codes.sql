-- UX-ARCH-02 hotfix: a two-digit code, such as 09, is a valid
-- technical unique identifier for ONE work-district record.
-- District IDs remain canonical UUIDs. A wilaya code is NOT proof of an
-- inspector's work-district assignment and must not trigger auto-mapping.
begin;
alter table public.work_districts
 drop constraint if exists work_districts_code_check;
alter table public.work_districts
 add constraint work_districts_code_check
 check (code ~ '^[A-Z0-9][A-Z0-9._-]{1,39}$');
commit;
