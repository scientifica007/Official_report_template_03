import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {
 DEMO_USERS,DEMO_INSTITUTIONS,DEMO_MISSIONS,initialDemoState,
 colleaguesFor,institutionsFor,missionsFor,personalPreparations,personalRecords,
 upsertPreparation,addPrivateRecord,requestPublication,pendingRequestsFor,
 decidePublication,grantException,revokeException,normalizedDemoState
} from "../prototypes/ux-arch-01/demo-model.mjs";
const admin=DEMO_USERS[0],tebessa=DEMO_USERS[1],blida=DEMO_USERS[2],unknown=DEMO_USERS[3],
 rejected=DEMO_USERS[4];
const TIME=Date.parse("2026-11-05T12:00:00.000Z");
const DAY=86400000;
const id="new-grant-1";
const grantData=(changes={})=>({
 granteeId:tebessa.id,capability:"view_institution",
 resourceId:"institution-b",reason:"مهمة مشتركة مع مقاطعة أخرى",
 expiresAt:new Date(TIME+7*DAY).toISOString(),...changes
});
const grant=(state=initialDemoState(),changes={})=>
 grantException(state,admin,grantData(changes),id,TIME);
test("UX-ARCH-01: default district separation applies to both colleagues and approved institutions",()=>{
 const s=initialDemoState();
 assert.deepEqual(colleaguesFor(s,tebessa,TIME).map(x=>x.id),["admin-t"]);
 assert.deepEqual(colleaguesFor(s,blida,TIME).map(x=>x.id),[]);
 assert.deepEqual(institutionsFor(s,tebessa,TIME).map(x=>x.id),["institution-t"]);
 assert.deepEqual(institutionsFor(s,blida,TIME).map(x=>x.id),["institution-b"]);
 assert.equal(institutionsFor(s,tebessa,TIME).some(x=>x.id==="institution-t-pending"),false);
 assert.equal(institutionsFor(s,tebessa,TIME).some(x=>x.wilaya==="البليدة"),false);
});
test("UX-ARCH-01: even admin has no automatic right to browse other districts",()=>{
 const s=initialDemoState();
 assert.ok(!institutionsFor(s,admin,TIME).some(x=>x.id==="institution-b"));
 assert.ok(!colleaguesFor(s,admin,TIME).some(x=>x.id==="inspector-b"));
});
test("UX-ARCH-01: canonical work district, not residence or institution wilaya, scopes access",()=>{
 const state=initialDemoState();
 const foreignGeography={id:"inst-test",districtId:tebessa.districtId,
  name:"مؤسسة تدريب أخرى",status:"published",code:"ONE",wilaya:"البليدة"};
 state.institutions.push(foreignGeography);
 assert.ok(institutionsFor(state,tebessa,TIME).some(x=>x.id==="inst-test"));
 assert.ok(!institutionsFor(state,blida,TIME).some(x=>x.id==="inst-test"));
});
test("UX-ARCH-01: verified work district required even for an approved account",()=>{
 const s=initialDemoState();
 for(const u of [unknown,rejected]){
  assert.deepEqual(colleaguesFor(s,u,TIME),[]);
  assert.deepEqual(institutionsFor(s,u,TIME),[]);
  assert.deepEqual(missionsFor(s,u,TIME),[]);
  assert.throws(()=>upsertPreparation(s,u,{title:"مرحلة تحضير"},"draft-u",TIME));
 }
});
test("UX-ARCH-01: admin grants exactly one remote published institution, with reason and expiry",()=>{
 const s=grant();
 assert.deepEqual(institutionsFor(s,tebessa,TIME).map(x=>x.id),
  ["institution-t","institution-b"]);
 assert.ok(!institutionsFor(s,tebessa,TIME).some(x=>x.id==="institution-t-pending"));
 assert.deepEqual(institutionsFor(s,admin,TIME).map(x=>x.id),["institution-t"]);
 assert.equal(s.audit.length,1);
 assert.equal(s.audit[0].action,"granted");
 assert.equal(s.exceptions[0].granteeDistrictId,"district-tebessa");
 assert.equal(s.exceptions[0].resourceId,"institution-b");
 assert.equal(s.exceptions[0].adminId,admin.id);
 assert.deepEqual(institutionsFor(s,tebessa,TIME+7*DAY),[
  DEMO_INSTITUTIONS[0]]);
});
test("UX-ARCH-01: admin can grant named inspector visibility, not the entire foreign district",()=>{
 const s=grantException(initialDemoState(),admin,grantData({
  capability:"view_inspector",resourceId:blida.id
 }),id,TIME);
 assert.ok(colleaguesFor(s,tebessa,TIME).some(x=>x.id===blida.id));
 assert.ok(!institutionsFor(s,tebessa,TIME).some(x=>x.id==="institution-b"));
});
test("UX-ARCH-01: mission exception is scoped to one mission, not unrelated institutions",()=>{
 const s=grantException(initialDemoState(),admin,grantData({
  capability:"collaborate_mission",resourceId:"mission-b"
 }),id,TIME);
 assert.deepEqual(missionsFor(s,tebessa,TIME).map(x=>x.id),["mission-t","mission-b"]);
 assert.deepEqual(institutionsFor(s,tebessa,TIME).map(x=>x.id),["institution-t"]);
});
test("UX-ARCH-01: a non-admin may not grant OR revoke exceptions",()=>{
 const s=initialDemoState();
 assert.throws(()=>grantException(s,tebessa,grantData(),id,TIME),/admin/);
 assert.throws(()=>grantException(s,blida,grantData(),id,TIME),/admin/);
 assert.throws(()=>revokeException(grant(),tebessa,id,TIME+1),/admin/);
});
test("UX-ARCH-01: reject broad/invalid scopes, unapproved grantees, poor reasons and long grants",()=>{
 const s=initialDemoState();
 const invalid=[
  {granteeId:rejected.id},
  {granteeId:unknown.id},
  {granteeId:admin.id},
  {capability:"all_resources"},
  {resourceId:"institution-t"},
  {resourceId:"institution-t-pending"},
  {resourceId:"does-not-exist"},
  {reason:"لا"},
  {expiresAt:new Date(TIME).toISOString()},
  {expiresAt:new Date(TIME+31*DAY).toISOString()}
 ];
 for(const payload of invalid)
  assert.throws(()=>grantException(s,admin,grantData(payload),id,TIME),
   "Expected denied grant: "+JSON.stringify(payload));
});
test("UX-ARCH-01: revocation is immediate and preserved in an append-only audit event",()=>{
 const s=grant(),r=revokeException(s,admin,id,TIME+1000);
 assert.equal(institutionsFor(r,tebessa,TIME+2000).some(x=>x.id==="institution-b"),false);
 assert.equal(r.audit.length,2);
 assert.deepEqual(r.audit.map(x=>x.action),["granted","revoked"]);
 assert.equal(s.audit.length,1,"original prior version stays immutable");
 assert.throws(()=>revokeException(r,admin,id,TIME+2000));
});
test("UX-ARCH-01: preparation can be incrementally edited/reopened without losing prior input",()=>{
 const blank=initialDemoState(),draftId="prep-1";
 const first=upsertPreparation(blank,tebessa,{
  title:"الترسيم",templateId:"TITULARISATION",
  institution:"مؤسسة في مقاطعة العمل",plannedDate:"2026-12-01",
  notes:"المعاينة الأولية"
 },draftId,TIME);
 const second=upsertPreparation(first,tebessa,{
  ...first.preparations[0],notes:"المعاينة الأولية وتحديث آخر"
 },draftId,TIME+1000);
 assert.equal(second.preparations.length,1);
 assert.equal(second.preparations[0].id,draftId);
 assert.equal(second.preparations[0].revision,2);
 assert.equal(second.preparations[0].createdAt,first.preparations[0].createdAt);
 assert.equal(second.preparations[0].institution,"مؤسسة في مقاطعة العمل");
 assert.equal(second.preparations[0].plannedDate,"2026-12-01");
 assert.equal(personalPreparations(second,tebessa)[0].notes,"المعاينة الأولية وتحديث آخر");
 assert.deepEqual(personalPreparations(second,blida),[]);
 assert.throws(()=>upsertPreparation(second,blida,{title:"اختراق"},draftId,TIME+2000));
 const reloaded=normalizedDemoState(JSON.parse(JSON.stringify(second)));
 assert.equal(personalPreparations(reloaded,tebessa)[0].revision,2);
});
test("UX-ARCH-01: private records remain owner-only and publication is a separate snapshot",()=>{
 const s=addPrivateRecord(initialDemoState(),tebessa,{
  kind:"institution",title:"المؤسسة الجديدة",code:"NEW-TB-001",wilaya:"بئر العاتر",
  text:"بيانات المعاينة الخاصة"
 },"private-1",TIME);
 assert.deepEqual(personalRecords(s,blida),[]);
 assert.ok(!institutionsFor(s,admin,TIME).some(x=>x.name==="المؤسسة الجديدة"));
 const pending=requestPublication(s,tebessa,"private-1","request-1",TIME+100);
 assert.equal(pending.publicationRequests[0].status,"submitted");
 assert.equal(pending.privateRecords[0].title,"المؤسسة الجديدة");
 assert.ok(!institutionsFor(pending,tebessa,TIME).some(x=>x.name==="المؤسسة الجديدة"));
 assert.deepEqual(pendingRequestsFor(pending,blida),[]);
 assert.equal(pendingRequestsFor(pending,admin).length,1);
 const approved=decidePublication(pending,admin,"request-1","approved","تم التحقق",TIME+200);
 assert.equal(approved.publicationRequests[0].reviewerId,admin.id);
 assert.ok(institutionsFor(approved,tebessa,TIME+300).some(x=>x.name==="المؤسسة الجديدة"));
 assert.ok(!institutionsFor(approved,blida,TIME+300).some(x=>x.name==="المؤسسة الجديدة"));
 assert.equal(personalRecords(approved,tebessa)[0].text,"بيانات المعاينة الخاصة");
});
test("UX-ARCH-01: author cannot approve own request; rejection does not remove original",()=>{
 const s=addPrivateRecord(initialDemoState(),tebessa,{kind:"institution",title:"المدرسة الجديدة"},"private-2",TIME);
 const req=requestPublication(s,tebessa,"private-2","req-2",TIME);
 assert.throws(()=>decidePublication(req,tebessa,"req-2","approved","",TIME),/اعتماد/);
 assert.throws(()=>decidePublication(req,blida,"req-2","approved","",TIME));
 const rejected=decidePublication(req,admin,"req-2","rejected","بيانات غير كافية",TIME);
 assert.equal(rejected.publicationRequests[0].status,"rejected");
 assert.equal(personalRecords(rejected,tebessa).length,1);
 assert.ok(!institutionsFor(rejected,tebessa,TIME).some(x=>x.name==="المدرسة الجديدة"));
});
test("UX-ARCH-01: member or unpublished institutions cannot be exposed by exception",()=>{
 const s=initialDemoState();
 assert.throws(()=>grantException(s,admin,grantData({
  resourceId:"institution-t-pending"
 }),id,TIME));
 assert.throws(()=>grantException(s,admin,grantData({
  capability:"view_inspector",resourceId:rejected.id
 }),id,TIME));
});
test("UX-ARCH-01: prototype is isolated, responsive, and clearly states no real security enforcement",()=>{
 const html=readFileSync("prototypes/ux-arch-01/index.html","utf8");
 const ui=readFileSync("prototypes/ux-arch-01/app.mjs","utf8");
 const css=readFileSync("prototypes/ux-arch-01/style.css","utf8");
 const docs=readFileSync("docs/UX_ARCH_01_UNIFIED_WORKSPACE_DISTRICT_SCOPE_2026-11-05.md","utf8");
 assert.match(html,/بيانات اصطناعية/);
 assert.match(html,/ليس متصلًا بحسابات أو قواعد بيانات المنصة/);
 assert.match(html,/app\.mjs\?v=uxarch01/);
 assert.match(ui,/localStorage\.setItem/);
 assert.match(html,/data-route="dashboard"/);
 assert.match(css,/@media\(max-width:850px\)/);
 assert.doesNotMatch(ui,/supabase\.co|service_role|publishableKey/);
 assert.match(docs,/استثناءات المقاطعات التي يمنحها admin/);
 assert.match(docs,/RLS/);
 for(const path of ["prototypes/ux-arch-01/demo-model.mjs","prototypes/ux-arch-01/app.mjs"])
  assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path],{stdio:"pipe"}));
});
