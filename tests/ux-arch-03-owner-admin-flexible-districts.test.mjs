import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {viewDistricts,viewInspectors,viewInstitutions,viewRequests} from "../prototypes/ux-arch-03/admin/views.mjs";
const file=path=>readFileSync(path,"utf8");
const sql=file("supabase/migrations/018_ux_arch03_admin_distinct_roles_flexible_district_codes.sql");
const api=file("prototypes/ux-arch-03/admin/api.mjs");
const views=file("prototypes/ux-arch-03/admin/views.mjs");
const app=file("prototypes/ux-arch-03/admin/app.mjs");
const html=file("prototypes/ux-arch-03/admin/index.html");
test("UX-ARCH-03: admin-chosen Arabic, numeric and compound district codes",()=>{
 const codes=["12","12-01","12-أ","تبسة-شرق","09","District-X"];
 assert.match(sql,/char_length\(btrim\(code\)\) between 1 and 100/);
 assert.match(sql,/code=btrim\(code\)/);
 assert.doesNotMatch(sql,/code ~ '\^\[A-Z0-9\]/);
 assert.match(sql,/values\(btrim\(p_code\),btrim\(p_label\)\)/);
 assert.match(views,/12-أ/);
 for(const code of codes)assert.ok(code.trim().length>=1);
 assert.doesNotMatch(app,/09 رمز ولاية البليدة/);
});
test("UX-ARCH-03: renamed district preserves UUID and memberships",()=>{
 const snippet=sql.slice(sql.indexOf("function public.ux_admin_update_work_district"),
  sql.indexOf("function public.ux_admin_assign_work_district"));
 assert.match(snippet,/set code=btrim\(p_code\),label=btrim\(p_label\)/);
 assert.match(snippet,/where id=p_district/);
 assert.doesNotMatch(snippet,/delete from|update public\.inspector_profiles|update public\.district_resource_assignments/i);
 assert.match(views,/تعديل هذه المقاطعة يبقي هويتها الداخلية/);
 assert.match(app,/ux_admin_update_work_district/);
});
test("UX-ARCH-03: platform admin is distinct from inspector",()=>{
 assert.match(sql,/not p\.is_admin/);
 assert.match(sql,/create or replace function ux_core\.approved_inspector/);
 assert.match(sql,/create or replace function ux_core\.my_district/);
 assert.match(file("supabase/migrations/015_ux_arch02_district_data_foundation.sql"),/create or replace function ux_core\.is_admin/);
 const assign=sql.slice(sql.indexOf("function public.ux_admin_assign_work_district"),
  sql.indexOf("function public.ux_review_institution_request"));
 assert.match(assign,/if v_is_admin then/);
 assert.match(assign,/Site admin is not an inspector account/);
 assert.match(app,/!p\?\.is_admin/);
 assert.match(app,/profile=p/);
 assert.doesNotMatch(views,/حساب Admin.*مقاطعة عمله الخاصة/);
});
test("UX-ARCH-03: published institution has many-to-many district mapping",()=>{
 assert.match(sql,/create table if not exists public\.district_resource_assignments/);
 assert.match(sql,/primary key\(resource_id,work_district_id\)/);
 assert.match(sql,/resource_id uuid not null references public\.district_published_resources\(id\)/);
 assert.match(sql,/work_district_id uuid not null references public\.work_districts\(id\)/);
 assert.match(sql,/create or replace function public\.ux_admin_set_institution_districts/);
 assert.match(sql,/delete from public\.district_resource_assignments/);
 assert.match(sql,/select distinct unnest\(p_districts\)/);
 assert.match(sql,/create or replace function ux_core\.resource_in_my_district/);
 assert.match(sql,/ux_core\.resource_in_my_district\(id\)/);
 assert.match(views,/name="p_districts" type="checkbox"/);
 assert.match(app,/getAll\("p_districts"\)/);
 assert.match(app,/إلغاء إتاحة هذه المؤسسة في جميع المقاطعات/);
});
test("UX-ARCH-03: old institutions preserved; no auto-mapping based on wilaya",()=>{
 assert.match(sql,/legacy_institution_id uuid unique/);
 assert.match(sql,/function public\.ux_admin_import_legacy_institution/);
 assert.match(sql,/where id=p_legacy_id/);
 assert.match(sql,/Institution already registered in new catalog/);
 assert.doesNotMatch(sql,/update public\.shared_institutions|delete from public\.shared_institutions/i);
 assert.match(views,/مقاطعة النشر الأولى/);
 assert.match(views,/availableLegacy=db\.legacy\.filter/);
});
test("UX-ARCH-03: site admin may manage publication requests regardless of own district",()=>{
 const review=sql.slice(sql.indexOf("function public.ux_review_institution_request"),
  sql.indexOf("function public.ux_admin_create_institution"));
 assert.match(review,/not ux_core\.is_admin\(\)/);
 assert.doesNotMatch(review,/ux_core\.my_district\(\)/);
 assert.match(review,/insert into public\.district_resource_assignments/);
 assert.match(sql,/create policy ux_publication_request_read[\s\S]*ux_core\.is_admin/);
 assert.match(views,/مراجعة/);
});
test("UX-ARCH-03: admin cannot read inspector's private records through new tables",()=>{
 const fromOld=file("supabase/migrations/015_ux_arch02_district_data_foundation.sql");
 assert.match(fromOld,/create policy ux_private_read[\s\S]*owner_id=\(select auth\.uid\(\)\)/);
 assert.match(fromOld,/create policy ux_prep_read[\s\S]*owner_id=\(select auth\.uid\(\)\)/);
 assert.doesNotMatch(sql,/create policy.*private.*is_admin/i);
 assert.doesNotMatch(app,/inspector_private_records|mission_preparations/);
});
test("UX-ARCH-03: admin mutations have real role checks and anonymous execution revoked",()=>{
 const funcs=["ux_admin_create_work_district","ux_admin_update_work_district",
  "ux_admin_assign_work_district","ux_admin_create_institution",
  "ux_admin_import_legacy_institution","ux_admin_set_institution_districts",
  "ux_review_institution_request"];
 for(const n of funcs){
  assert.match(sql,new RegExp("function public\\."+n+"\\("));
 }
 assert.match(sql,/not ux_core\.is_admin\(\)/);
 assert.match(sql,/revoke all on function public\.ux_admin_update_work_district[\s\S]*from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.ux_admin_update_work_district[\s\S]*to authenticated/);
 assert.match(sql,/alter table public\.district_resource_assignments enable row level security/);
 assert.match(sql,/alter table public\.district_resource_assignment_events enable row level security/);
 assert.doesNotMatch(sql,/grant (update|insert|delete) on public\.district_resource_assignments to authenticated/i);
});
test("UX-ARCH-03: old admin/inspector paths and production datasets remain untouched by proposal",()=>{
 assert.match(html,/prototypes|UX-ARCH-03/);
 assert.match(html,/app\.mjs\?v=uxarch03-admin-auth-1/);
 assert.match(api,/official_report03_cloud_session_v1/);
 assert.match(api,/\/auth\/v1\/user/);
 assert.match(app,/!p\?\.is_admin/);
 assert.match(api,/\/rest\/v1\/rpc\//);
 assert.doesNotMatch(app,/service_role|sb_secret_|refresh_token/i);
 assert.match(app,/type="password"/);
 assert.match(app,/await verifyAdmin\(\)/);
 assert.doesNotMatch(sql,/drop table public\.shared_institutions|drop table public\.inspector_profiles/i);
 for(const path of ["prototypes/ux-arch-03/admin/api.mjs",
  "prototypes/ux-arch-03/admin/views.mjs",
  "prototypes/ux-arch-03/admin/app.mjs"])
  assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path],{stdio:"pipe"}));
});

test("UX-ARCH-03: admin can create or import institution without assigning any district",()=>{
 assert.match(sql,/alter column work_district_id drop not null/);
 const create=sql.slice(sql.indexOf("function public.ux_admin_create_institution"),
  sql.indexOf("function public.ux_admin_import_legacy_institution"));
 const importLegacy=sql.slice(sql.indexOf("function public.ux_admin_import_legacy_institution"),
  sql.indexOf("function public.ux_admin_set_institution_districts"));
 assert.match(create,/if p_initial_district is not null/);
 assert.match(importLegacy,/if p_initial_district is not null/);
 assert.match(views,/لا تنشر في أي مقاطعة الآن/);
 assert.match(views,/مقاطعة النشر الأولى \(اختياري\)/);
 assert.match(app,/p_initial_district:form\.elements\.p_initial_district\.value\?/);
});
test("UX-ARCH-03: admin's legacy own data remains readable, but nobody can read another inspector's private data",()=>{
 const privatePolicy=sql.slice(sql.indexOf("drop policy if exists ux_private_read"),
  sql.indexOf("create or replace function ux_core.has_grant"));
 assert.match(privatePolicy,/owner_id=\(select auth\.uid\(\)\)/);
 assert.match(privatePolicy,/ux_core\.approved_inspector\(\)\) or \(select ux_core\.is_admin\(\)/);
 assert.doesNotMatch(privatePolicy,/owner_id<>|work_district_id=/);
});
test("UX-ARCH-03: publication reason is optional for site owner, but actor and decision are recorded",()=>{
 const review=sql.slice(sql.indexOf("function public.ux_review_institution_request"),
  sql.indexOf("function public.ux_admin_create_institution"));
 assert.doesNotMatch(review,/v_request\.author_id=v_admin/);
 assert.doesNotMatch(review,/Rejection requires a reason/);
 assert.match(review,/reviewer_id=v_admin/);
 assert.match(review,/decided_at=now\(\)/);
});

test("UX-ARCH-03 UI: one institution may be selected in two districts with a single record",()=>{
 const db={
  districts:[
   {id:"11111111-1111-4111-8111-111111111111",code:"12",label:"تبسة",active:true},
   {id:"22222222-2222-4222-8222-222222222222",code:"12-أ",label:"مقاطعة ثانية",active:true}],
  profiles:[],resources:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",title:"مؤسسة مشتركة",
   code:"INST01",legacy_institution_id:null}],
  assignments:[
   {resource_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    work_district_id:"11111111-1111-4111-8111-111111111111"},
   {resource_id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    work_district_id:"22222222-2222-4222-8222-222222222222"}],
  legacy:[],requests:[]
 };
 const content=viewInstitutions(db);
 assert.match(content,/مؤسسة مشتركة/);
 assert.match(content,/INST01 \(2 مقاطعة\)/);
 assert.equal((content.match(/name="p_districts" type="checkbox"/g)||[]).length,2);
 assert.equal((content.match(/name="p_districts" type="checkbox"[^>]* checked/g)||[]).length,2);
 assert.equal((content.match(/data-operation="institution-assign"/g)||[]).length,1);
 const admin=viewDistricts(db);
 assert.match(admin,/12-أ/);
 assert.match(admin,/data-operation="district-edit"/);
 assert.match(content,/لا تنشر في أي مقاطعة الآن/);
});
test("UX-ARCH-03 UI: admin identity excluded from selectable inspector accounts",()=>{
 const base={districts:[{id:"11111111-1111-4111-8111-111111111111",
  label:"تبسة",code:"12",active:true}]};
 const content=viewInspectors({...base,profiles:[
  {id:"admin",first_name:"مالك",last_name:"الموقع",is_admin:true},
  {id:"inspector",first_name:"مفتش",last_name:"مهني",is_admin:false,
   profession:"IFEP",work_district_id:base.districts[0].id}
 ]});
 assert.ok(!content.includes('value="admin"'));
 assert.ok(content.includes('value="inspector"'));
 assert.match(content,/IFEP/);
});
test("UX-ARCH-03 UI: shared institution names are HTML escaped",()=>{
 const content=viewInstitutions({
  districts:[{id:"11111111-1111-4111-8111-111111111111",code:"12",label:"تبسة",active:true}],
  resources:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",title:"<script>alert(1)</script>",
   code:"INST"}],assignments:[],legacy:[],requests:[]
 });
 assert.ok(!content.includes("<script>alert(1)</script>"));
 assert.match(content,/&lt;script&gt;/);
});
