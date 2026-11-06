import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {freshCommittee,editMeta,editScore,restoreCommittee,stringifyCommittee}
 from "../prototypes/titularisation-committee/committee-engine.mjs";
import {hydrateReportInspectorFromVerifiedProfile}
 from "../qa-titularisation/report-inspector-prefill.mjs";
import {loadCloudCommitteeInspectorProfile}
 from "../prototypes/titularisation-committee/committee-cloud-bridge.mjs";

const read=path=>readFileSync(path,"utf8");
const qaUserId="11111111-2222-4333-8444-555555555555";
const profile={id:qaUserId,first_name:"مفتش",last_name:"معتمد",
 district:"تبسة (12)",email:"qa@example.invalid",
 approved:true,account_status:"approved",is_admin:false,federation_required:true};

test("P0: opening QA report with an empty inspector section fills professional details without a separate task form save",()=>{
 const old=freshCommittee("individual","grouped5");
 const {state,filled,sourceAvailable}=hydrateReportInspectorFromVerifiedProfile(old,profile);
 assert.equal(sourceAvailable,true);
 assert.equal(state.meta.chairName,"مفتش معتمد");
 assert.equal(state.meta.inspectorDistrict,"تبسة (12)");
 assert.equal(state.meta.inspectorEmail,"qa@example.invalid");
 assert.equal(state.meta.inspectorPhone,""); // unavailable in primary account
 assert.equal(state.meta.inspectorSeat,"");  // unavailable in primary account
 assert.equal(old.meta.chairName,"");
 assert.deepEqual(filled,[
  "اسم رئيس اللجنة","المقاطعة التقنية والبيداغوجية","البريد الإلكتروني للمفتش"
 ]);
 assert.deepEqual(restoreCommittee(JSON.parse(stringifyCommittee(state))).meta,state.meta);
});

test("P0: profile hydration preserves chair-authored text, grades and institution binding",()=>{
 let report=freshCommittee("individual","grouped5");
 report=editMeta(report,"chairName","رئيس لجنة تجريبية");
 report=editMeta(report,"inspectorEmail","بريد كتبه المفتش");
 report=editMeta(report,"institution","مؤسسة اصطناعية");
 report=editScore(report,"final","lesson","g1",2);
 const {state,filled}=hydrateReportInspectorFromVerifiedProfile(report,profile);
 assert.equal(state.meta.chairName,"رئيس لجنة تجريبية");
 assert.equal(state.meta.inspectorEmail,"بريد كتبه المفتش");
 assert.equal(state.meta.inspectorDistrict,"تبسة (12)");
 assert.equal(state.meta.institution,"مؤسسة اصطناعية");
 assert.equal(state.final.grading.scores.lesson.g1,2);
 assert.deepEqual(filled,["المقاطعة التقنية والبيداغوجية"]);
 const again=hydrateReportInspectorFromVerifiedProfile(state,profile);
 assert.deepEqual(again.filled,[]);
 assert.deepEqual(again.state,state);
});

test("P0: unapproved or Admin accounts are never treated as inspector sources",()=>{
 for(const p of [{...profile,approved:false},
  {...profile,is_admin:true},{...profile,account_status:"suspended"},null]){
  const {state,filled,sourceAvailable}=hydrateReportInspectorFromVerifiedProfile(freshCommittee(),p);
  assert.deepEqual(filled,[]);
  assert.equal(sourceAvailable,false);
  assert.equal(state.meta.chairName,"");
 }
});

test("P0: QA professional profile is fetched only under the active QA inspector's own RLS session",async()=>{
 const old={window:globalThis.window,fetch:globalThis.fetch,sessionStorage:globalThis.sessionStorage};
 const calls=[];
 try{
  globalThis.window={REPORT03_CLOUD_CONFIG:{
   qaOnly:true,temporaryCommitteeEnabled:true,
   supabaseUrl:"https://npxwshvcrowbfoiqyrwx.supabase.co",
   publishableKey:"sb_publishable_testonly_notasecret"
  }};
  globalThis.sessionStorage={getItem:key=>key==="scientifica_committee_qa_session_v1"?
   JSON.stringify({access_token:"qa-jwt-for-test",refresh_token:"qa-refresh",
    userId:qaUserId,expiresAt:Date.now()+3600000}):null};
  globalThis.fetch=async(url,opts)=>{
   calls.push({url:String(url),opts});
   return {ok:true,json:async()=>[profile]};
  };
  const loaded=await loadCloudCommitteeInspectorProfile();
  assert.equal(loaded.id,qaUserId);
  assert.equal(calls.length,1);
  assert.ok(calls[0].url.includes("/rest/v1/inspector_profiles?"));
  assert.ok(calls[0].url.includes("id=eq."+qaUserId));
  assert.equal(calls[0].opts.headers.Authorization,"Bearer qa-jwt-for-test");
  globalThis.fetch=async()=>({ok:true,json:async()=>[
   {...profile,id:"ffffffff-ffff-4fff-8fff-ffffffffffff"}]});
  await assert.rejects(loadCloudCommitteeInspectorProfile(),/تعذر التحقق/);
 }finally{
  globalThis.window=old.window;
  globalThis.fetch=old.fetch;
  globalThis.sessionStorage=old.sessionStorage;
 }
});

test("P0: bound QA editor preloads inspector source, marks unsaved prefill and offers explicit chair-name replacement",()=>{
 const editor=read("prototypes/titularisation-committee/app.mjs");
 const html=read("qa-titularisation/report/index.html");
 assert.match(editor,/loadCloudCommitteeInspectorProfile\(\)\.catch\(error=>/);
 assert.match(editor,/hydrateReportInspectorFromVerifiedProfile\(target,inspectorProfile\)/);
 assert.match(editor,/cloudDraftDirty=enriched\.filled\.length>0/);
 assert.match(editor,/showVerifiedInspectorSource\(inspectorProfile\)/);
 assert.match(editor,/cloudDraftStatus\("جُلبت بيانات المفتش إلى التقرير تلقائيًا/);
 assert.match(editor,/useName\.addEventListener\("click"/);
 assert.match(editor,/سيُستبدل اسم رئيس اللجنة الذي كتبته/);
 assert.match(editor,/commit\(\(\)=>editMeta\(state,"chairName",defaults\.chairName\)\)/);
 assert.match(html,/id="qa-inspector-profile-source" hidden/);
 assert.match(html,/id="qa-chair-use-profile-name"/);
 assert.match(html,/app\.mjs\?v=p08-qa-inspector-prefill-20261106/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","prototypes/titularisation-committee/app.mjs"]));
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","prototypes/titularisation-committee/committee-cloud-bridge.mjs"]));
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","qa-titularisation/report-inspector-prefill.mjs"]));
});

test("P0: standalone field-approved report engine remains unchanged; no production schema or credential write",()=>{
 const standalone=read("prototypes/titularisation-committee/index.html");
 assert.doesNotMatch(standalone,/qa-inspector-profile-source/);
 const editor=read("prototypes/titularisation-committee/app.mjs");
 assert.match(editor,/if\(!missionBoundReport\)return/);
 assert.match(editor,/if\(!missionBoundReport\|\|!cloudDraftReady\)return/);
 assert.match(editor,/saveCloudCommitteeReportDraft\(linkedMissionId,payload,expected\)/);
 assert.doesNotMatch(read("qa-titularisation/report-inspector-prefill.mjs"),/setItem|access_token|refresh_token/);
});
