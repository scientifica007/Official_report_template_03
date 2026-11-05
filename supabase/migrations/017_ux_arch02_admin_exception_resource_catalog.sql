-- UX-ARCH-02: admin-only minimal catalog of grant-eligible foreign resources.
-- Prevents forcing an admin user to copy raw UUIDs to authorize one record.
begin;
create or replace function public.ux_admin_list_exception_resources(
 p_grantee uuid,p_capability text)
returns table(resource_id uuid,resource_label text,district_label text)
language plpgsql stable security definer set search_path=''
as $$
declare v_district uuid;
begin
 if (select auth.uid()) is null or not ux_core.is_admin() then
  raise exception 'Admin only' using errcode='42501';
 end if;
 if p_capability not in ('view_inspector','view_institution','collaborate_mission')
    or p_capability is null then
  raise exception 'Unknown exception capability' using errcode='22023';
 end if;
 select p.work_district_id into v_district
 from public.inspector_profiles p
 join public.work_districts d on d.id=p.work_district_id and d.active
 where p.id=p_grantee and p.approved and p.account_status='approved';
 if v_district is null then
  raise exception 'Recipient work district is not verified' using errcode='42501';
 end if;
 if p_capability='view_inspector' then
  return query select p.id,
   left(trim(p.first_name||' '||p.last_name)||' — '||p.profession,180),
   d.label
   from public.inspector_profiles p
   join public.work_districts d on d.id=p.work_district_id and d.active
   where p.id<>p_grantee and p.work_district_id<>v_district
     and p.approved and p.account_status='approved'
   order by d.label,p.last_name,p.first_name limit 300;
 elsif p_capability='view_institution' then
  return query select r.id,
   left(r.title||case when r.code='' then '' else ' — '||r.code end,220),
   d.label
   from public.district_published_resources r
   join public.work_districts d on d.id=r.work_district_id and d.active
   where r.work_district_id<>v_district and r.publication_status='published'
   order by d.label,r.title limit 300;
 else
  return query select m.id,left(m.title,220),d.label
  from public.inspection_missions m
  join public.inspector_profiles p on p.id=m.created_by
  join public.work_districts d on d.id=p.work_district_id and d.active
  where p.work_district_id<>v_district
  order by d.label,m.title limit 300;
 end if;
end;
$$;
revoke all on function public.ux_admin_list_exception_resources(uuid,text)
 from public,anon,authenticated;
grant execute on function public.ux_admin_list_exception_resources(uuid,text)
 to authenticated;
commit;
