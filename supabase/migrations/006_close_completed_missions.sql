-- M4.1: close a completed mission without deleting any report data.
-- Run once in the owner's Supabase SQL Editor AFTER migration 005.
-- Both individual and collaborative missions share the same workflow.
begin;
create or replace function public.close_inspection_mission(p_mission_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
 if (select auth.uid()) is null or not public.is_accepted_mission_member(p_mission_id) then
  raise exception 'An accepted mission inspector is required' using errcode='42501';
 end if;
 select status into v_status from public.inspection_missions
 where id=p_mission_id for update;
 if not found or v_status<>'draft' then
  raise exception 'Mission is already closed or unavailable' using errcode='22023';
 end if;
 update public.inspection_missions set status='closed' where id=p_mission_id;
end; $$;
revoke all on function public.close_inspection_mission(uuid) from public,anon,authenticated;
grant execute on function public.close_inspection_mission(uuid) to authenticated;
commit;

-- Verification only, after applying the migration:
-- select proname from pg_proc where pronamespace='public'::regnamespace
-- and proname='close_inspection_mission';
