import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";

const read=path=>readFileSync(path,"utf8");
const rls=read("supabase/migrations/019_ux_arch04_legacy_district_rls_cutover.sql");
const notices=read("supabase/migrations/020_ux_arch04_scoped_legacy_notifications.sql");
const portal=read("cloud.js");

test("UX-ARCH-04: legacy institutions require explicit admin publication and district assignment",()=>{
 assert.match(rls,/function ux_core\.legacy_institution_visible/);
 assert.match(rls,/legacy_institution_id=p_legacy/);
 assert.match(rls,/ux_core\.resource_in_my_district\(r\.id\)/);
 assert.match(rls,/ux_core\.has_grant\('view_institution',r\.id\)/);
 assert.doesNotMatch(rls,/wilaya\s*=\s*.*district|district\s*=\s*.*wilaya/i);
 assert.doesNotMatch(rls,/update public\.district_resource_assignments|insert into public\.district_resource_assignments/i);
});

test("UX-ARCH-04: broad permissive policies replaced atomically, not combined",()=>{
 for(const policy of ["inspector_profile_read","institution_read","institution_insert",
  "institution_update","changes_read","notifications_read","notifications_mark_read"]){
  assert.match(rls,new RegExp("drop policy if exists "+policy+" on public\\."));
  assert.match(rls,new RegExp("create policy "+policy+" on public\\."));
 }
 assert.match(rls,/create policy institution_read[\s\S]*ux_core\.legacy_institution_visible\(id\)/);
 assert.match(rls,/create policy inspector_profile_read[\s\S]*ux_core\.inspector_profile_visible\(id\)/);
 assert.doesNotMatch(rls,/using\s*\(public\.is_approved_inspector\(\)\)/);
 assert.match(rls,/\nbegin;[\s\S]*commit;\s*$/);
});

test("UX-ARCH-04: no automatic remapping or erasure of historic missions, users or institutions",()=>{
 assert.doesNotMatch(rls,/delete from public\.(shared_institutions|inspection_missions|inspection_mission_members|inspector_profiles)/i);
 assert.doesNotMatch(rls,/update public\.inspector_profiles\s+set\s+work_district_id/i);
 assert.doesNotMatch(rls,/drop table|truncate table/i);
 assert.match(rls,/create or replace function public\.create_inspection_mission/);
 assert.match(rls,/if not ux_core\.legacy_institution_visible\(p_institution_id\)/);
 assert.match(rls,/create or replace function public\.invite_inspection_member/);
 assert.match(rls,/g\.capability='collaborate_mission'/);
 assert.match(rls,/g\.revoked_at is null and g\.expires_at>now\(\)/);
});

test("UX-ARCH-04: notifications are scoped on read and at future delivery",()=>{
 assert.match(rls,/ux_core\.legacy_change_visible\(change_id\)/);
 assert.match(notices,/create or replace function public\.audit_institution_change/);
 assert.match(notices,/r\.legacy_institution_id=new\.id/);
 assert.match(notices,/a\.work_district_id=p\.work_district_id/);
 assert.match(notices,/g\.capability='view_institution'/);
 assert.match(notices,/g\.expires_at>now\(\)/);
 assert.doesNotMatch(notices,/where approved=true and id<>new\.updated_by/);
});

test("UX-ARCH-04: scoped legacy inspector updates require explicit assignments and immutable identity",()=>{
 const sql=read("supabase/migrations/022_ux_arch04_scoped_legacy_institution_edits.sql");
 assert.match(sql,/function ux_core\.legacy_institution_editable/);
 assert.match(sql,/district_resource_assignments/);
 assert.match(sql,/a\.work_district_id=\(select ux_core\.my_district\(\)\)/);
 assert.match(sql,/create policy institution_update/);
 assert.match(sql,/using \(ux_core\.legacy_institution_editable\(id\)\)/);
 assert.match(sql,/Only Admin can change institutional identity/);
 assert.match(sql,/Only Admin can create a historic institution/);
 assert.doesNotMatch(sql,/has_grant\('view_institution'/);
 assert.doesNotMatch(sql,/insert into public\.district_resource_assignments/);
});

test("UX-ARCH-04: portal permits authorized legacy data edits but not inspector identity or creation",()=>{
 assert.match(portal,/المؤسسات المتاحة لمقاطعة عملي/);
 assert.match(portal,/prototypes\/ux-arch-02\//);
 assert.match(portal,/const canCreate=Boolean\(profile\?\.is_admin\)/);
 assert.match(portal,/const locked=identity&&!canCreate/);
 assert.match(portal,/!selectedSharedId&&!profile\?\.is_admin/);
 assert.match(portal,/لا يستطيع المفتش تغيير الهوية الأساسية للمؤسسة/);
 assert.doesNotMatch(portal,/يمكن لجميع المفتشين المعتمدين إضافة المؤسسات وتعديلها/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","cloud.js"]));
});

test("UX-ARCH-04: accepted cross-district mission teammates retain a narrowly-scoped directory identity",()=>{
 const sql=read("supabase/migrations/023_ux_arch04_accepted_mission_colleague_visibility.sql");
 assert.match(sql,/create or replace function ux_core\.inspector_profile_visible/);
 assert.match(sql,/public\.inspection_mission_members me/);
 assert.match(sql,/join public\.inspection_mission_members peer/);
 assert.match(sql,/peer\.mission_id=me\.mission_id/);
 assert.match(sql,/me\.inspector_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/me\.membership_status='accepted'/);
 assert.match(sql,/peer\.membership_status='accepted'/);
 assert.doesNotMatch(sql,/create policy institution_read|create policy inspection_missions_read|delete from public\.inspection_mission_members/i);
});
test("UX-ARCH-04: emergency rollback is available and flags restoration of previously broad access as a risk",()=>{
 const sql=read("supabase/rollback/UX_ARCH_04_PRE_CUTOVER_RESTORE_LEGACY_POLICIES.sql");
 assert.match(sql,/CAUTION: restores the historically overly broad access policies/);
 assert.match(sql,/create policy institution_read/i);
 assert.match(sql,/create policy inspector_profile_read/i);
 assert.match(sql,/create or replace function public\.guard_shared_institution/i);
 assert.match(sql,/create or replace function public\.create_inspection_mission/i);
 assert.match(sql,/^--[\s\S]*\nbegin;[\s\S]*\ncommit;\s*$/);
});
