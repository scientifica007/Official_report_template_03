import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee,editMeta,editScore,editNote,restoreCommittee,stringifyCommittee}
 from "../prototypes/titularisation-committee/committee-engine.mjs";
import {hydrateReportSeatIdentities,loadCloudCommitteeSubmissions,prepareCloudCommitteeDraft}
 from "../prototypes/titularisation-committee/committee-cloud-bridge.mjs";
import {buildReferenceDocuments} from "../prototypes/titularisation-committee/document-model.mjs";
import {committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";

const missionId="12345678-2222-4333-8444-555555555555";
const rows=[
 {seat_code:"member1",given_name:"أحمد",family_name:"مفتاح",
  member_role:"مدير مؤسسة",display_name:"اسم عرض سابق"},
 {seat_code:"member2",given_name:"سليم",family_name:"منصوري",
  member_role:"رئيس مصلحة",display_name:"اسم عرض سابق"},
 {seat_code:"member3",given_name:"كمال",family_name:"خليل",
  member_role:"أستاذ متخصص",display_name:"اسم عرض سابق"}
];

test("P2-14: owner reads saved seat identities even without issued links or submitted contributions",async()=>{
 const old={fetch:globalThis.fetch,window:globalThis.window,localStorage:globalThis.localStorage};
 const mission={id:missionId,title:"مهمة الترسيم",rubric_id:"lesson_grouped_5_v1",
  institution_resource_id:"12345678-2222-4333-8444-777777777777",
  institution_name_snapshot:"مؤسسة"},
  queries=[];
 try{
  globalThis.window={REPORT03_CLOUD_CONFIG:{qaOnly:false,titularisationWorkspaceEnabled:true,
   temporaryCommitteeEnabled:false,supabaseUrl:"https://example.supabase.co",publishableKey:"sb_publishable_test"}};
  globalThis.localStorage={getItem:key=>key==="official_report03_cloud_session_v1"?
   JSON.stringify({access_token:"inspector-test-token",
    expires_at_ms:Date.now()+1800000,user:{id:"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}}):null};
  globalThis.fetch=async(url,opts)=>{
   const u=new URL(url),table=u.pathname.split("/").pop();
   queries.push({table,query:u.searchParams,headers:opts.headers});
   assert.equal(opts.headers.Authorization,"Bearer inspector-test-token");
   assert.equal(u.searchParams.get("mission_id")||u.searchParams.get("id"),"eq."+missionId);
   let result;
   if(table==="titularisation_missions")result=[mission];
   else if(table==="titularisation_contributions")result=[];
   else if(table==="titularisation_seats")result=rows;
   else throw Error("Unexpected REST read "+table);
   return {ok:true,json:async()=>result};
  };
  const payload=await loadCloudCommitteeSubmissions(missionId);
  assert.deepEqual(payload.rows,[]);
  assert.equal(payload.seatIdentities.length,3);
  assert.equal(queries.find(x=>x.table==="titularisation_contributions").query.get("status"),"eq.submitted");
  assert.equal(queries.find(x=>x.table==="titularisation_seats").query.get("limit"),"3");
  const initial=prepareCloudCommitteeDraft(payload.mission);
  const filled=hydrateReportSeatIdentities(initial,payload.seatIdentities);
  const paper=buildReferenceDocuments(filled.state);
  assert.equal(paper.signers[0].name,"أحمد مفتاح");
  assert.equal(paper.signers[1].role,"رئيس مصلحة");
  assert.equal(paper.signers[2].name,"كمال خليل");
  assert.equal(paper.signers[2].role,"أستاذ متخصص");
  const xml=committeeDocumentXml(filled.state,{kind:"minutes"});
  assert.match(xml,/أحمد مفتاح/);
  assert.match(xml,/سليم منصوري/);
  assert.match(xml,/كمال خليل/);
  assert.match(xml,/أستاذ متخصص/);
  const recovered=restoreCommittee(JSON.parse(stringifyCommittee(filled.state)));
  assert.equal(recovered.meta.member3Name,"كمال خليل");
  assert.equal(initial.meta.member1Name,"");
 }finally{
  globalThis.fetch=old.fetch;globalThis.window=old.window;
  globalThis.localStorage=old.localStorage;
 }
});

test("P2-14: initial identity hydration fills blanks only; manual signer edits and scores remain unchanged",()=>{
 let state=freshCommittee("individual","grouped5");
 state=editMeta(state,"member1Name","اسم اختاره المفتش");
 state=editMeta(state,"member2Role","وظيفة حررها المفتش");
 state=editScore(state,"final","lesson","g1",3);
 state=editNote(state,"final","lesson","تقدير مهني حرره المفتش","g1");
 const previous=JSON.stringify(state);
 const filled=hydrateReportSeatIdentities(state,rows);
 assert.deepEqual(filled.filled.sort(),[
  "member1Role","member2Name","member3Name","member3Role"
 ].sort());
 assert.equal(filled.state.meta.member1Name,"اسم اختاره المفتش");
 assert.equal(filled.state.meta.member2Role,"وظيفة حررها المفتش");
 assert.equal(filled.state.meta.member1Role,"مدير مؤسسة");
 assert.equal(filled.state.meta.member2Name,"سليم منصوري");
 assert.equal(filled.state.final.grading.scores.lesson.g1,3);
 assert.equal(filled.state.final.notes.lesson.g1,"تقدير مهني حرره المفتش");
 assert.equal(JSON.stringify(state),previous,"original draft and inspector marks are immutable");
 const repeat=hydrateReportSeatIdentities(filled.state,rows);
 assert.strictEqual(repeat.state,filled.state,"no changes should preserve state identity");
 assert.deepEqual(repeat.filled,[]);
});
test("P2-14: no identity values never clear a signer; display name is used only as fallback",()=>{
 let state=freshCommittee("individual","grouped5");
 state=editMeta(state,"member1Name","اسم مثبت");
 const loaded=hydrateReportSeatIdentities(state,[
  {seat_code:"member1",given_name:"",family_name:"",member_role:"",display_name:""},
  {seat_code:"member3",given_name:"",family_name:"",member_role:"",display_name:"اسم العرض"}
 ]);
 assert.equal(loaded.state.meta.member1Name,"اسم مثبت");
 assert.equal(loaded.state.meta.member3Name,"اسم العرض");
 assert.equal(loaded.state.meta.member1Role,"");
 assert.deepEqual(hydrateReportSeatIdentities(state,[]).filled,[]);
});
test("P2-14: forged, duplicate or malformed seat identities fail without altering the report",()=>{
 const source=freshCommittee("individual","grouped5"),before=JSON.stringify(source);
 for(const invalid of [
  null,{},[...rows,rows[0]],
  [{...rows[0],seat_code:"member4"}],
  [{...rows[0],member_role:42}]
 ]){
  assert.throws(()=>hydrateReportSeatIdentities(source,invalid));
 }
 assert.equal(JSON.stringify(source),before);
});
test("P2-14: production startup hydrates seat names independently of the contribution import action",()=>{
 const app=readFileSync("prototypes/titularisation-committee/app.mjs","utf8");
 const bridge=readFileSync("prototypes/titularisation-committee/committee-cloud-bridge.mjs","utf8");
 assert.match(app,/loadCloudCommitteeSubmissions\(linked\),loadCloudCommitteeReportDraft\(linked\)/);
 assert.match(app,/\{mission,seatIdentities\},saved,inspectorProfile/);
 assert.match(app,/hydrateReportSeatIdentities\(enriched.state,seatIdentities\)/);
 assert.match(app,/signerHydrated\.filled\.length>0/);
 assert.match(app,/state=signerHydrated\.state;who="final";render\(\)/);
 assert.match(bridge,/select:"seat_code,display_name,given_name,family_name,member_role"/);
 assert.match(bridge,/mission_id:"eq."\+id,order:"seat_code.asc",limit:"3"/);
});
