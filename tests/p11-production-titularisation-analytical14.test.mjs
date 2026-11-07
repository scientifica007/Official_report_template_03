import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import * as workspace from "../titularisation/production-workspace.mjs";
import {RUBRICS,GROUPS,suggestedWeights,validateWeights,sameWeightProfile}
 from "../prototypes/titularisation-workbench/engine.mjs";
import {prepareCloudCommitteeDraft} from "../prototypes/titularisation-committee/committee-cloud-bridge.mjs";
import {restoreCommittee,stringifyCommittee}
 from "../prototypes/titularisation-committee/committee-engine.mjs";

const read=path=>readFileSync(path,"utf8");
const institution="11111111-2222-4333-8444-555555555555";
const oldId="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const analyticalId="bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const rubric=RUBRICS.analytical14.id;
let tasks=[
 {id:oldId,title:"مهمة الخمسة السابقة",rubric_id:RUBRICS.grouped5.id,
  rubric_profile:null,status:"draft",institution_name_snapshot:"مؤسسة مسجلة سابقًا"},
];
const catalog=[{id:institution,title:"مؤسسة منشورة في تبسة",code:"1201",
 wilaya:"تبسة",resource_kind:"institution",publication_status:"published"}];
const get=async table=>table==="titularisation_missions"?tasks:catalog;

test("P1.1 DB: migration allows 14 without changing existing 5/10, freezes owner-only and enforces saved profile",()=>{
 const sql=read("supabase/migrations/027_p1_production_analytical14_frozen_mission_weights.sql");
 assert.match(sql,/drop constraint if exists titularisation_missions_rubric_id_check/);
 assert.match(sql,/lesson_derived_indicators_v1/);
 assert.match(sql,/create function public\.freeze_titularisation_analytical_weights/);
 assert.match(sql,/owner_id=v_uid for update/);
 assert.match(sql,/account_status='approved' and p\.is_admin=false/);
 assert.match(sql,/m\.rubric_profile is not null or exists/);
 assert.match(sql,/from public\.titularisation_report_drafts d/);
 assert.match(sql,/jsonb_object_keys\(p_weights\)\)<>14/);
 assert.match(sql,/('g1',12::numeric)/);
 assert.match(sql,/('g2',8::numeric)/);
 assert.match(sql,/('g3',8::numeric)/);
 assert.match(sql,/('g4',6::numeric)/);
 assert.match(sql,/('g5',6::numeric)/);
 assert.match(sql,/mod\(v_number\*2,1\)<>0/);
 assert.match(sql,/p_payload #> '\{final,grading,profile\}' is distinct from v_mission\.rubric_profile/);
 assert.match(sql,/create or replace function public\.create_titularisation_mission/);
 assert.match(sql,/create or replace function public\.save_titularisation_report_draft/);
 assert.doesNotMatch(sql,/insert into public\.titularisation_seats|insert into public\.titularisation_contributions/);
});

test("P1.1 UI: all three networks offered; 14 requires group-by-group weight confirmation before editor",async()=>{
 await workspace.refresh(get);
 const first=workspace.render({profile:{is_admin:false}});
 assert.match(first,/خمسة معايير/);
 assert.match(first,/عشرة عناصر/);
 assert.match(first,/14 مؤشرًا — بأوزان يحددها المفتش/);
 assert.match(first,/مهمة الخمسة السابقة/);
 assert.equal(validateWeights(suggestedWeights()).valid,true);
 let received;
 const raw=async(method,path,body,auth)=>{
  received={method,path,body,auth};
  tasks=[...tasks,{id:analyticalId,title:body.p_title,rubric_id:body.p_rubric_id,
   rubric_profile:null,status:"draft",institution_name_snapshot:"مؤسسة منشورة في تبسة"}];
  return analyticalId;
 };
 const id=await workspace.create(raw,get,{title:"ترسيم باستخدام 14 مؤشرًا",
  rubric,institutionId:institution});
 assert.equal(id,analyticalId);
 assert.equal(received.body.p_rubric_id,rubric);
 assert.equal(received.body.p_institution_resource_id,institution);
 assert.equal(received.auth,true);
 const html=workspace.render({profile:{is_admin:false}});
 assert.match(html,/توزيع أوزان المؤشرات الأربعة عشر/);
 assert.equal((html.match(/data-prod-tit-weight="/g)||[]).length,14);
 for(const g of GROUPS)assert.match(html,new RegExp(g.label));
 assert.equal(html.includes('data-cloud-action="prod-tit-open" data-mission-id="'+analyticalId+'"'),false);
 assert.throws(()=>workspace.open(analyticalId),/غير متاحة/);
 assert.equal(tasks.find(t=>t.id===oldId).rubric_id,RUBRICS.grouped5.id);
});

test("P1.1 UI: invalid weights rejected locally; valid freeze goes through backend and remains immutable",async()=>{
 const bad={...suggestedWeights(),g1_1:3.5};
 await assert.rejects(workspace.freeze(async()=>{throw Error("backend must not be called")},get,analyticalId,bad),/مجموع/);
 const weights=suggestedWeights();
 const pinned={frozen:true,weights};
 let received;
 const raw=async(method,path,body,auth)=>{
  received={method,path,body,auth};
  tasks=tasks.map(t=>t.id===analyticalId?{...t,rubric_profile:pinned}:t);
  return pinned;
 };
 const result=await workspace.freeze(raw,get,analyticalId,weights);
 assert.equal(sameWeightProfile(result,pinned),true);
 assert.equal(received.path,"/rest/v1/rpc/freeze_titularisation_analytical_weights");
 assert.equal(received.body.p_mission_id,analyticalId);
 assert.deepEqual(received.body.p_weights,weights);
 assert.equal(received.auth,true);
 const page=workspace.render({profile:{is_admin:false}});
 assert.match(page,/الأوزان مثبتة على الخادم/);
 assert.equal(page.includes('data-cloud-action="prod-tit-open" data-mission-id="'+analyticalId+'"'),true);
 assert.equal((page.match(/data-prod-tit-weight="/g)||[]).length,0);
 await assert.rejects(workspace.freeze(raw,get,analyticalId,weights),/لا يمكن تعديل/);
 const previousWindow=globalThis.window;
 let location="";
 try{
  globalThis.window={location:{assign:href=>{location=href}}};
  workspace.open(analyticalId);
  assert.equal(location,"./titularisation/report/?mission="+analyticalId);
 }finally{globalThis.window=previousWindow}
 assert.equal(tasks.find(t=>t.id===oldId).rubric_id,RUBRICS.grouped5.id);
});

test("P1.1 report: frozen 14 profile rehydrates unchanged in the field-accepted engine",()=>{
 const weights=suggestedWeights();
 const profile={frozen:true,weights};
 const mission={rubric_id:rubric,rubric_profile:profile};
 const initial=prepareCloudCommitteeDraft(mission);
 assert.equal(initial.rubricId,rubric);
 assert.equal(sameWeightProfile(initial.final.grading.profile,profile),true);
 const restored=restoreCommittee(JSON.parse(stringifyCommittee(initial)));
 assert.equal(sameWeightProfile(restored.final.grading.profile,profile),true);
 for(const member of Object.values(restored.members))
  assert.equal(sameWeightProfile(member.grading.profile,profile),true);
 assert.throws(()=>prepareCloudCommitteeDraft({...mission,rubric_profile:null}),/أوزان/);
});

test("P1.1 session/QA isolation and scripts remain intact",()=>{
 const portal=read("cloud.js");
 const bridge=read("prototypes/titularisation-committee/committee-cloud-bridge.mjs");
 const cfg=read("cloud-config.js");
 assert.match(portal,/action==='prod-tit-freeze'/);
 assert.match(portal,/workspace\.rememberWeights\(missionId,weights\)/);
  assert.match(read("titularisation/production-workspace.mjs"),/freeze_titularisation_analytical_weights/);
 assert.match(cfg,/temporaryCommitteeEnabled: false/);
 assert.match(bridge,/productionWorkspace\(\)\)return \{mission:missions\[0\],rows:\[\]\}/);
 for(const p of ["titularisation/production-workspace.mjs","cloud.js"]){
  assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",p]));
 }
});
