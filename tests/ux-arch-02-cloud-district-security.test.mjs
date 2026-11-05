import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const read=x=>readFileSync(x,"utf8");
const schema=read("supabase/migrations/015_ux_arch02_district_data_foundation.sql");
const rpc=read("supabase/migrations/016_ux_arch02_district_admin_rpcs.sql");
const client=read("prototypes/ux-arch-02/app.mjs");
const html=read("prototypes/ux-arch-02/index.html");

test("UX-ARCH-02 creates eight isolated tables, all with RLS",()=>{
 const names=["work_districts","work_district_assignment_events",
  "inspector_private_records","mission_preparations",
  "district_publication_requests","district_published_resources",
  "district_access_grants","district_access_grant_events"];
 for(const t of names){
  assert.match(schema,new RegExp("create table if not exists public\\."+t+"\\("));
  assert.match(schema,new RegExp("alter table public\\."+t+" enable row level security"));
 }
 assert.match(schema,/revoke all on public\.work_districts/);
 assert.match(schema,/revoke all on public\.work_districts,[\s\S]*from public,anon,authenticated;/);
 assert.doesNotMatch(schema,/drop policy.*inspector_profile_read|drop policy.*institution_read/i);
});
test("UX-ARCH-02 private data owner-only and preparation immutable ownership and revision check",()=>{
 assert.match(schema,/create policy ux_private_read[\s\S]*owner_id=\(select auth\.uid\(\)\)/);
 assert.match(schema,/create policy ux_prep_read[\s\S]*owner_id=\(select auth\.uid\(\)\)/);
 assert.match(schema,/owner_id=\(select auth\.uid\(\)\) and work_district_id=\(select ux_core\.my_district\(\)\)/);
 assert.match(schema,/new\.work_district_id is distinct from old\.work_district_id/);
 assert.match(schema,/new\.revision<>old\.revision\+1/);
 assert.match(client,/revision:"eq\."\+draft\.revision/);
 assert.match(client,/savePromise=call\("PATCH"/);
 assert.match(client,/if\(dirty\)return saveDraft\(\)/);
});
test("UX-ARCH-02 only approved active profiles with canonical work district pass helpers",()=>{
 assert.match(schema,/account_status='approved'/);
 assert.match(schema,/join public\.work_districts d on d\.id=p\.work_district_id and d\.active/);
 assert.match(schema,/g\.grantee_district_id_at_grant=p\.work_district_id/);
 assert.match(schema,/g\.revoked_at is null and g\.expires_at>now\(\)/);
 assert.doesNotMatch(schema,/raw_user_meta_data|user_metadata/i);
});
test("UX-ARCH-02 institutional publication is request-and-review, NOT automatic sharing of notes",()=>{
 assert.match(rpc,/create or replace function public\.ux_submit_institution_request/);
 assert.match(rpc,/jsonb_build_object\([\s\S]*'title'[\s\S]*'code'[\s\S]*'wilaya'/);
 assert.doesNotMatch(rpc,/proposed_payload\)\s*values[^;]*v_record\.payload\s*\)/);
 assert.match(rpc,/create or replace function public\.ux_review_institution_request/);
 assert.match(rpc,/v_request\.author_id=v_admin/);
 assert.match(rpc,/v_request\.work_district_id<>ux_core\.my_district\(\)/);
 assert.match(rpc,/if p_approve then[\s\S]*insert into public\.district_published_resources/);
});
test("UX-ARCH-02 grant is admin-scoped, resource-verified, expiring, and revocable",()=>{
 assert.match(rpc,/if v_admin is null or not ux_core\.is_admin\(\)/);
 assert.match(rpc,/view_inspector','view_institution','collaborate_mission/);
 assert.match(rpc,/p_expires_at>now\(\)\+interval '30 days'/);
 assert.match(rpc,/where p\.id=p_grantee and p\.approved(?:=true)? and p\.account_status='approved'/);
 assert.match(rpc,/r\.publication_status='published'/);
 assert.match(rpc,/v_resource_district=v_recipient_district/);
 assert.match(rpc,/ux_admin_revoke_district_access/);
 assert.match(rpc,/set revoked_at=now\(\),revoked_by=v_admin/);
 assert.match(rpc,/insert into public\.district_access_grant_events/);
 assert.doesNotMatch(schema,/grant (update|insert|delete) on public\.district_access_grants to authenticated/i);
});
test("UX-ARCH-02 RPCs cannot be invoked by anonymous browser clients",()=>{
 assert.match(rpc,/revoke all on function public\.ux_admin_create_work_district[\s\S]*from public,anon,authenticated;/);
 assert.match(rpc,/grant execute on function public\.ux_admin_create_work_district[\s\S]*to authenticated;/);
});
test("UX-ARCH-02 standalone real workspace uses existing primary login with no production secrets",()=>{
 assert.match(html,/<script src="\.\.\/\.\.\/cloud-config\.js"><\/script>/);
 assert.match(client,/official_report03_cloud_session_v1/);
 assert.match(client,/https:\/\/uxtsyzyotnohxvopgcmh\.supabase\.co/);
 assert.match(client,/call\("GET","\/auth\/v1\/user"\)/);
 assert.match(client,/user\?\.id!==session\.user\.id/);
 assert.match(client,/list\("inspector_private_records"/);
 assert.match(client,/list\("mission_preparations"/);
 assert.match(client,/list\("district_published_resources"/);
 assert.match(client,/rpc\("ux_admin_assign_work_district"/);
 assert.match(client,/rpc\("ux_admin_grant_district_access"/);
 assert.match(client,/rpc\("ux_admin_revoke_district_access"/);
 assert.doesNotMatch(client,/npxwshvcrowbfoiqyrwx|service_role|sb_secret_/i);
 assert.match(html,/الفصل العام للبيانات القديمة لم يُفعّل بعد/);
 assert.match(html,/بيانات الإنتاج|حساب الإنتاج/);
});
test("UX-ARCH-02 app has syntax-safe ESM and no accidental password or demo grant store",()=>{
 for(const path of ["prototypes/ux-arch-02/app.mjs"]){
  assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path],{stdio:"pipe"}));
 }
 assert.doesNotMatch(client,/localStorage\.setItem\([^)]*district_access_grants|data\.password/i);
});

test("UX-ARCH-02 admin resource chooser cannot disclose unapproved people or institutions",()=>{
 const sql=read("supabase/migrations/017_ux_arch02_admin_exception_resource_catalog.sql");
 const frontend=read("prototypes/ux-arch-02/app.mjs");
 assert.match(sql,/ux_admin_list_exception_resources/);
 assert.match(sql,/not ux_core\.is_admin\(\)/);
 assert.match(sql,/p\.approved and p\.account_status='approved'/);
 assert.match(sql,/r\.publication_status='published'/);
 assert.match(sql,/p\.work_district_id<>v_district/);
 assert.match(sql,/r\.work_district_id<>v_district/);
 assert.match(sql,/revoke all on function public\.ux_admin_list_exception_resources[\s\S]*from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.ux_admin_list_exception_resources[\s\S]*to authenticated/);
 assert.match(frontend,/rpc\("ux_admin_list_exception_resources"/);
 assert.match(frontend,/id="grant-resource"/);
 assert.match(frontend,/refreshCatalog\(\)/);
 assert.match(frontend,/selected\.disabled=true/);
 assert.doesNotMatch(frontend,/<input name="p_resource"/);
 assert.match(read("prototypes/ux-arch-02/index.html"),/app\.mjs\?v=uxarch03-role-separation/);
});
