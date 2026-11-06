import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import * as workspace from "../titularisation/production-workspace.mjs";
import {freshCommittee,editMeta,restoreCommittee,stringifyCommittee}
 from "../prototypes/titularisation-committee/committee-engine.mjs";

const read=p=>readFileSync(p,"utf8");
const resource="11111111-2222-4333-8444-555555555555";
const mission="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const newer="ffffffff-ffff-4fff-8fff-ffffffffffff";
const mockInstitutions=[{id:resource,title:"مؤسسة مهنية من مقاطعة المفتش",
 code:"12-أ",wilaya:"تبسة",resource_kind:"institution",publication_status:"published"}];
let tasks=[];
const get=async table=>table==="titularisation_missions"?tasks:mockInstitutions;

test("P1 production backend: owner-only pilot tables enforce institution scope and CAS",()=>{
 const sql=read("supabase/migrations/026_p1_production_titularisation_owner_mission_draft.sql");
 assert.match(sql,/create table public\.titularisation_missions/);
 assert.match(sql,/institution_resource_id uuid not null references public\.district_published_resources\(id\)/);
 assert.match(sql,/create table public\.titularisation_report_drafts/);
 assert.match(sql,/owner_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/account_status='approved' and p\.is_admin=false/);
 assert.match(sql,/alter table public\.titularisation_missions enable row level security/);
 assert.match(sql,/alter table public\.titularisation_report_drafts enable row level security/);
 assert.match(sql,/revoke all on public\.titularisation_report_drafts from public,anon,authenticated/);
 assert.match(sql,/ux_core\.resource_in_my_district\(r\.id\)/);
 assert.match(sql,/ux_core\.has_grant\('view_institution',r\.id\)/);
 assert.match(sql,/r\.publication_status='published'/);
 assert.match(sql,/p_payload #>> '\{meta,institutionResourceId\}' is distinct from/);
 assert.match(sql,/p_payload #>> '\{meta,institution\}' is distinct from/);
 assert.match(sql,/p_expected_revision=0/);
 assert.match(sql,/d\.revision=p_expected_revision/);
 assert.match(sql,/using errcode='40001'/);
 assert.doesNotMatch(sql,/titularisation_seats|titularisation_contributions|qa_federated_inspector_links/);
});

test("P1 production: list authorized tasks, create mission using server-side catalog resource, and resume",async()=>{
 tasks=[{id:mission,title:"مهمة موجودة",rubric_id:"lesson_grouped_5_v1",
  institution_name_snapshot:"مؤسسة سابقة",status:"draft",created_at:"2026-11-05"}];
 await workspace.refresh(get);
 let view=workspace.render({profile:{is_admin:false}});
 assert.match(view,/مهمات الترسيم الجارية والمحفوظة/);
 assert.match(view,/مهمة موجودة/);
 assert.match(view,/مؤسسة مهنية من مقاطعة المفتش/);
 let args;
 const raw=async(method,path,body,auth)=>{
  args={method,path,body,auth};
  tasks=[{id:newer,title:body.p_title,rubric_id:body.p_rubric_id,
   institution_name_snapshot:"مؤسسة مهنية من مقاطعة المفتش",status:"draft",
   created_at:"2026-11-06"},...tasks];
  return newer;
 };
 assert.equal(await workspace.create(raw,get,{
  title:"ترسيم أستاذ تجريبي",rubric:"lesson_grouped_5_v1",institutionId:resource
 }),newer);
 assert.equal(args.method,"POST");
 assert.equal(args.path,"/rest/v1/rpc/create_titularisation_mission");
 assert.deepEqual(args.body,{p_title:"ترسيم أستاذ تجريبي",
  p_rubric_id:"lesson_grouped_5_v1",p_institution_resource_id:resource});
 assert.equal(args.auth,true);
 assert.equal(workspace.currentTaskId(),newer);
 view=workspace.render({profile:{is_admin:false}});
 assert.ok(view.indexOf("مهمات الترسيم الجارية")<view.indexOf("إنشاء مهمة ترسيم جديدة"));
 assert.match(view,/فتح التقرير والمحضر واستئناف المسودة/);
 assert.doesNotMatch(view,/رابط.*عضو.*إصدار/);
 assert.throws(()=>workspace.create(raw,get,{
  title:"مهمة",rubric:"lesson_grouped_5_v1",institutionId:"not-assigned"
 }),/اختر/);
});

test("P1 production: only mission UUID enters report URL, not inspector credentials",()=>{
 const before=globalThis.window;
 let visited=null;
 try{
  globalThis.window={location:{assign:url=>{visited=url}}};
  workspace.open(newer);
  assert.equal(visited,"./titularisation/report/?mission="+newer);
  assert.doesNotMatch(visited,/token|refresh|password|email/i);
  assert.throws(()=>workspace.open("undefined"),/غير متاحة/);
  assert.throws(()=>workspace.open(resource),/غير متاحة/);
 }finally{globalThis.window=before}
});

test("P1 report: new production mission seeds pinned institution without changing the document engine",()=>{
 let report=freshCommittee("individual","grouped5");
 report=editMeta(report,"institution","مؤسسة مهنية من مقاطعة المفتش");
 report=editMeta(report,"institutionResourceId",resource);
 const stored=restoreCommittee(JSON.parse(stringifyCommittee(report)));
 assert.equal(stored.meta.institution,"مؤسسة مهنية من مقاطعة المفتش");
 assert.equal(stored.meta.institutionResourceId,resource);
 const editor=read("prototypes/titularisation-committee/app.mjs");
 const html=read("titularisation/report/index.html");
 assert.match(editor,/const missionBoundReport=qaReport\|\|prodReport/);
 assert.match(editor,/target=editMeta\(target,"institution",mission\.institution_name_snapshot\)/);
 assert.match(editor,/target=editMeta\(target,"institutionResourceId",mission\.institution_resource_id\)/);
 assert.match(editor,/target\.meta\.institutionResourceId!==mission\.institution_resource_id/);
 assert.match(editor,/if\(prodReport\)\$\("members"\)\.hidden=true/);
 assert.match(editor,/control\.readOnly=true/);
 assert.match(html,/src="\.\.\/\.\.\/cloud-config\.js"/);
 assert.match(html,/محرر التقرير والمحضر المرتبط بمهمة الترسيم في حساب المفتش الأصلي/);
 assert.match(html,/app\.mjs\?v=p1-prod-inspector-20261106/);
 assert.doesNotMatch(html,/مشروع اختبار Supabase مستقل/);
});

test("P1 two-tenant separation: production never imports QA members; QA remains available independently",()=>{
 const bridge=read("prototypes/titularisation-committee/committee-cloud-bridge.mjs");
 const cloud=read("cloud.js");
 const cfg=read("cloud-config.js");
 assert.match(bridge,/productionWorkspace\(\)\)return \{mission:missions\[0\],rows:\[\]\}/);
 assert.match(bridge,/const QA_SESSION="scientifica_committee_qa_session_v1"/);
 assert.match(bridge,/official_report03_cloud_session_v1/);
 assert.match(bridge,/read\("inspector_profiles"/);
 assert.match(cloud,/if\(productionTitularisationEnabled\)\s+return productionTitularisationModule/);
 assert.match(cloud,/createProductionTitularisation|prod-tit-create/);
 assert.match(cloud,/ensureProductionTitularisation\(\)/);
 assert.match(cfg,/titularisationWorkspaceEnabled: true/);
 assert.match(cfg,/temporaryCommitteeEnabled: false/);
 assert.match(read("index.html"),/cloud\.js\?v=p1-prod-inspector-20261106/);
 const standalone=read("prototypes/titularisation-committee/index.html");
 assert.doesNotMatch(standalone,/titularisationWorkspaceEnabled/);
});

test("P1 production: main portal and shared report engine remain parseable",()=>{
 for(const path of ["cloud.js","titularisation/production-workspace.mjs",
   "prototypes/titularisation-committee/app.mjs",
   "prototypes/titularisation-committee/committee-cloud-bridge.mjs"]){
  assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path]),
   "parse failure: "+path);
 }
});
