import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import * as workspace from "../titularisation/production-workspace.mjs";
import {RUBRICS} from "../prototypes/titularisation-workbench/engine.mjs";

const institution="21111111-2222-4333-8444-555555555555";
const mission="b1111111-2222-4333-8444-555555555555";
const catalog=[{id:institution,title:"معهد التكوين المهني — ولاية تبسة",
 code:"1224",wilaya:"تبسة",resource_kind:"institution",publication_status:"published"}];
let catalogVisible=true;
let tasks=[];
const get=async table=>table==="titularisation_missions"?tasks:
 catalogVisible?catalog:[];

test("P1.2: display 14-indicator title, rubric and catalog selection survive portal re-render",async()=>{
 catalogVisible=true;
 tasks=[];
 await workspace.refresh(get);
 workspace.rememberMissionFormField("prod-tit-title",'ترسيم الأستاذة المتربصة "سعاد"');
 workspace.rememberMissionFormField("prod-tit-rubric",RUBRICS.analytical14.id);
 workspace.rememberMissionFormField("prod-tit-institution",institution);
 const view=workspace.render({profile:{is_admin:false}});
 assert.match(view,/ترسيم الأستاذة المتربصة &quot;سعاد&quot;/);
 assert.match(view,/14 مؤشرًا — بأوزان يحددها المفتش/);
 assert.ok(view.includes('value="'+RUBRICS.analytical14.id+'" selected'));
 assert.ok(view.includes('value="'+institution+'" selected'));
 await workspace.refresh(get); // unrelated refresh must not clear draft
 const retained=workspace.render({profile:{is_admin:false}});
 assert.ok(retained.includes('value="'+institution+'" selected'));
 assert.ok(retained.includes('value="'+RUBRICS.analytical14.id+'" selected'));
 assert.match(retained,/ترسيم الأستاذة المتربصة &quot;سعاد&quot;/);
});

test("P1.2: client checks UUID syntax; server alone decides institution authorization even if catalog cache is stale",async()=>{
 // Reproduce a selected resource remaining valid on the server after the
 // separately refreshed local list has stopped including it.
 catalogVisible=false;
 await workspace.refresh(get);
 let requests=0;
 const raw=async(method,path,body,authRequired)=>{
  requests++;
  assert.equal(method,"POST");
  assert.equal(path,"/rest/v1/rpc/create_titularisation_mission");
  assert.equal(body.p_institution_resource_id,institution);
  assert.equal(body.p_rubric_id,RUBRICS.analytical14.id);
  assert.equal(authRequired,true);
  tasks.push({id:mission, title:body.p_title,rubric_id:body.p_rubric_id,
   status:"draft", rubric_profile:null,institution_name_snapshot:"معهد التكوين المهني"});
  return mission;
 };
 const id=await workspace.create(raw,get,{
  title:"ترسيم الأستاذة المتربصة سعاد",
  rubric:RUBRICS.analytical14.id,
  institutionId:institution
 });
 assert.equal(id,mission);
 assert.equal(requests,1);
 assert.equal(workspace.currentTaskId(),mission);
 assert.equal(tasks.length,1);
 const after=workspace.render({profile:{is_admin:false}});
 assert.ok(!after.includes('value="'+institution+'" selected')); // prevents accidental duplicate
 assert.ok(after.includes('value="'+RUBRICS.grouped5.id+'" selected'));
 assert.ok(after.includes('الأوزان لم تثبت بعد'));
});

test("P1.2: clear Arabic validation messages identify exact missing field and do not attempt server write",async()=>{
 let writes=0;
 const raw=async()=>{writes++;throw Error("server called unexpectedly")};
 const legal={title:"مهمة ترسيم تجريبية",rubric:RUBRICS.analytical14.id,institutionId:institution};
 await assert.rejects(workspace.create(raw,get,{...legal,title:"  "}),/عنوان المهمة مطلوب/);
 await assert.rejects(workspace.create(raw,get,{...legal,rubric:"unsupported"}),/شبكة التقييم غير معروفة/);
 await assert.rejects(workspace.create(raw,get,{...legal,institutionId:"not-a-uuid"}),/لم يُلتقط معرّف المؤسسة/);
 assert.equal(writes,0);
});

test("P1.2: server authorization errors preserve the chosen title, rubric and institution for correction",async()=>{
 catalogVisible=true;
 await workspace.refresh(get);
 const fields={
  title:"اختبار إنشاء مهمة 14 مؤشرًا",
  rubric:RUBRICS.analytical14.id,
  institutionId:institution
 };
 await assert.rejects(workspace.create(async()=>{
  throw Error("Institution not available to inspector");
 },get,fields),/Institution not available/);
 const retained=workspace.render({profile:{is_admin:false}});
 assert.match(retained,/اختبار إنشاء مهمة 14 مؤشرًا/);
 assert.ok(retained.includes('value="'+institution+'" selected'));
 assert.ok(retained.includes('value="'+RUBRICS.analytical14.id+'" selected'));
});

test("P1.2: switching inspector accounts drops private unsaved form state and cached tasks",async()=>{
 const first="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
 const second="bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
 workspace.syncInspectorScope(first);
 catalogVisible=true;
 await workspace.refresh(get);
 workspace.rememberMissionFormField("prod-tit-title","مسودة من حساب المفتش الأول");
 workspace.rememberMissionFormField("prod-tit-institution",institution);
 assert.match(workspace.render({profile:{is_admin:false}}),/مسودة من حساب المفتش الأول/);
 workspace.syncInspectorScope(second);
 const secondPage=workspace.render({profile:{is_admin:false}});
 assert.doesNotMatch(secondPage,/مسودة من حساب المفتش الأول/);
 assert.ok(!secondPage.includes('value="'+institution+'" selected'));
 assert.match(secondPage,/مهمات الترسيم الجارية والمحفوظة \(0\)/);
});

test("P1.2: capture all form fields before async module import and preserve backend RLS",()=>{
 const cloud=readFileSync("cloud.js","utf8");
 const module=readFileSync("titularisation/production-workspace.mjs","utf8");
 const index=readFileSync("index.html","utf8");
 const create=cloud.slice(cloud.indexOf("}else if(action==='prod-tit-create')"),
   cloud.indexOf("}else if(action==='prod-tit-freeze')"));
 assert.ok(create.indexOf("const fields={")<create.indexOf("await ensureProductionTitularisation()"));
 assert.match(cloud,/rememberMissionFormField\(e\.target\.id,e\.target\.value\)/);
 assert.match(module,/UUID\.test\(institutionId\)/);
 assert.doesNotMatch(module,/!institutions\.some\(r=>r\.id===institutionId\)/);
 assert.match(module,/const id=await raw\("POST","\/rest\/v1\/rpc\/create_titularisation_mission"/);
 assert.match(index,/cloud\.js\?v=p12-create-form-20261107/);
 assert.match(cloud,/production-workspace\.mjs\?v=p12-create-form-20261107/);
});
