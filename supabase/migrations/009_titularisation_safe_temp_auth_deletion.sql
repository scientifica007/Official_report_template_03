-- M5.4 — allow Supabase Auth user deletion to detach a member account
-- without pretending that a bookkeeping FK change is a revised assessment.
-- The full contribution + prior revisions remain immutable except via the
-- existing guarded and version-incrementing member submission RPC.
begin;
create or replace function public.archive_titularisation_contribution_revision()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 -- Auth Admin deletion triggers FK ON DELETE SET NULL on author_user_id.
 -- Only this exact author-reference removal is exempt from the version
 -- increment and should not create a new assessment revision.
 if old.author_user_id is not null
    and new.author_user_id is null
    and new.revision = old.revision
    and (to_jsonb(new) - 'author_user_id')
        = (to_jsonb(old) - 'author_user_id') then
   return new;
 end if;

 if new.revision <> old.revision + 1 then
   raise exception 'Contribution revision must increment by one'
     using errcode = '22023';
 end if;
 insert into public.titularisation_contribution_revisions
  (mission_id,seat_code,revision,payload,status,author_user_id,submitted_at,replaced_by)
 values(old.mission_id,old.seat_code,old.revision,old.payload,old.status,
        old.author_user_id,old.submitted_at,(select auth.uid()));
 return new;
end; $$;
revoke all on function public.archive_titularisation_contribution_revision()
 from public,anon,authenticated;
commit;