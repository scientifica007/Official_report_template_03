import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import * as workspace from "../titularisation/production-workspace.mjs";
import {RUBRICS,suggestedWeights} from "../prototypes/titularisation-workbench/engine.mjs";
import {mergeSubmittedCloudMembers,prepareCloudCommitteeDraft}
 from "../prototypes/titularisation-committee/committee-cloud-bridge.mjs";
const text=p=>readFileSync(p,"utf8");
const id="6b711111-2222-4333-8444-555555555555";
const resource="7c711111-2222-4333-8444-555555555555";
const token="c".repeat(64);
const rubricProfile={frozen:true,weights:suggestedWeights()};
let seatRows=[],contribRows=[];
let missions=[{id,title:"تجربة 007",status:"draft",rubric_id:RUBRICS.analytical14.id,
 rubric_profile:rubricProfile,created_at:"2026-11-08T06:00:00Z",
 institution_resource_id:resource,institution_name_snapshot:"مؤسسة تبسة"}];
const get=async table=>{
 if(table==="titularisation_missions")return missions;
 if(table==="district_published_resources")return [{
  id:resource,title:"مؤسسة تبسة",code:"1201",wilaya:"تبسة",
  resource_kind:"institution",publication_status:"published"}];
 if(table==="titularisation_seats")return seatRows;
 if(table==="titularisation_contributions")return contribRows;
 return [];
};

test("P2 SQL defines separate owner-only seats, restricted direct links, revisions and audit",()=>{
 const sql=text("supabase/migrations/028_p2_unified_production_titularisation_committee.sql");
 for(const name of ["titularisation_seats","titularisation_contributions",
  "titularisation_contribution_revisions","titularisation_access_events",
  "titularisation_score_caps"])assert.match(sql,new RegExp("create table public\\."+name));
 assert.match(sql,/enable row level security/g);
 assert.match(sql,/grant select\(mission_id,seat_code,display_name,status,expires_at,revoked_at,updated_at\)/);
 for(const fn of ["issue_prod_titularisation_invitation","revoke_prod_titularisation_invitation",
  "load_prod_titularisation_member","save_prod_titularisation_member",
  "validate_prod_titularisation_member_payload"])assert.ok(sql.includes(fn));
 assert.match(sql,/extensions\.gen_random_bytes\(32\)/);
 assert.match(sql,/extensions\.digest\(p_token,'sha256'\)/);
 assert.match(sql,/grant execute on function public\.load_prod_titularisation_member\(uuid,text,text\) to anon,authenticated/);
 assert.match(sql,/grant execute on function public\.save_prod_titularisation_member\(uuid,text,text,jsonb,bigint,boolean\)\s+to anon,authenticated/);
 assert.doesNotMatch(sql,/createUser|deleteUser|insert into auth\.users|QA_FEDERATION/);
 assert.match(sql,/Final submission requires every nonzero indicator grade/);
 assert.match(sql,/Final submission requires all lesson and discussion marks/);
 assert.match(sql,/Contribution changed; reload before overwriting/);
 assert.match(sql,/corrections require explicit resubmission/i);
 assert.match(sql,/titularisation_contribution_revisions/);
});
test("P2 production inspector issues and revokes links without touching original contributions",async()=>{
 seatRows=[];contribRows=[];
 await workspace.refresh(get);
 const page=workspace.render({profile:{is_admin:false}});
 for(const member of ["member1","member2","member3"])
  assert.ok(page.includes('data-cloud-action="prod-tit-issue-seat" data-seat="'+member+'"'));
 const priorWindow=globalThis.window;
 try{
  globalThis.window={location:{href:"https://scientifica007.github.io/Official_report_template_03/?utm_source=x"}};
  const raw=async (method,path,args,authorized)=>{
   assert.equal(method,"POST");assert.equal(authorized,true);
   if(path.includes("issue_prod")){
    assert.equal(args.p_mission_id,id);
    assert.equal(args.p_seat_code,"member1");
    seatRows=[{mission_id:id,seat_code:"member1",display_name:args.p_display_name,
     status:"active",expires_at:"2026-11-15T06:00:00Z",revoked_at:null}];
    return {seat_code:"member1",token,expires_at:"2026-11-15T06:00:00Z"};
   }
   if(path.includes("revoke_prod")){
    seatRows=[{...seatRows[0],status:"revoked",revoked_at:"2026-11-08T07:00:00Z"}];
    return true;
   }
   throw Error("Unexpected RPC");
  };
  const invite=await workspace.issueSeat(raw,get,id,"member1","مساهم تجريبي");
  assert.ok(invite.url.includes("/titularisation/member/?mission="+id+"&seat=member1#access="+token));
  assert.equal(invite.title,"تجربة 007");
  assert.ok(workspace.render({profile:{is_admin:false}}).includes("تنزيل بطاقة QR وPDF"));
  contribRows=[{mission_id:id,seat_code:"member1",status:"submitted",revision:2}];
  await workspace.revokeSeat(raw,get,id,"member1");
  assert.equal(workspace.currentIssuedInvitation(),null);
  assert.equal(contribRows[0].revision,2);
  assert.match(workspace.render({profile:{is_admin:false}}),/مرسلة — مراجعة 2/);
 }finally{globalThis.window=priorWindow}
});
test("P2 production member reuses same scoring engine, direct bearer links, and original QA remains separate",()=>{
 const member=text("committee-member/app.mjs");
 const config=text("cloud-config.js");
 const prodShell=text("titularisation/member/index.html");
 const qaShell=text("qa-titularisation/member/index.html");
 assert.match(member,/productionMember=location\.pathname\.includes\("\/titularisation\/member\/"\)/);
 assert.match(member,/load_prod_titularisation_member/);
 assert.match(member,/save_prod_titularisation_member/);
 assert.match(member,/p_expected_revision:contributionRevision/);
 assert.ok(member.includes('productionMember?"_"+requestedMission+"_"+requestedSeat'));
 assert.match(member,/missingMandatoryScores\(payload\.grading\)/);
 assert.match(member,/if\(productionMember\)\{/);
 assert.match(member,/history\.replaceState\(null,"",location\.pathname\+location\.search\)/);
 assert.match(prodShell,/cloud-config\.js/);
 assert.match(qaShell,/config\.js/);
 assert.match(config,/titularisationCommitteeEnabled: true/);
 assert.match(config,/temporaryCommitteeEnabled: false/);
});
test("P2 same report editor imports only submitted rows without touching chair grading",()=>{
 const mission=missions[0];
 const blank=prepareCloudCommitteeDraft(mission);
 const memberGrading={
  schema:"titularisation-workbench-draft-v1",revision:1,rubricId:mission.rubric_id,
  profile:rubricProfile,scores:{lesson:{g1_1:2},discussion:{}}
 };
 const notes={lesson:{},discussion:{},lessonSummary:"",discussionSummary:"",
  general:"نص عضو",recommendations:""};
 const merged=mergeSubmittedCloudMembers(blank,mission,[{
  seat_code:"member1",status:"submitted",payload:{grading:memberGrading,notes},
  revision:1
 }]);
 assert.deepEqual(merged.seats,["member1"]);
 assert.equal(merged.state.members.member1.notes.general,"نص عضو");
 assert.deepEqual(merged.state.final.grading.scores,{lesson:{},discussion:{}});
 assert.equal(merged.state.final.grading.profile.frozen,true);
 assert.match(text("prototypes/titularisation-committee/committee-cloud-bridge.mjs"),
  /const rowsPromise=read\("titularisation_contributions"/);
 const ui=text("prototypes/titularisation-committee/app.mjs");
 assert.match(ui,/if\(missionBoundReport\)\{/);
 assert.match(ui,/panel\.hidden=false/);
 assert.match(ui,/loadCloudCommitteeSubmissions/);
});
test("P2 modified modules parse and production cache busting is explicit",()=>{
 for(const path of ["cloud.js","titularisation/production-workspace.mjs",
 "committee-member/app.mjs","prototypes/titularisation-committee/committee-cloud-bridge.mjs",
 "prototypes/titularisation-committee/inspector-synthesis-ui.mjs"]){
  assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path]));
 }
 assert.match(text("index.html"),/cloud\.js\?v=p2-identity-20261108/);
 assert.match(text("titularisation/report/index.html"),/app\.mjs\?v=p214-seat-prefill-20261110/);
});

test("P2 member draft save provides one visible, accessible confirmation after server success",()=>{
 const member=text("committee-member/app.mjs");
 const shell=text("titularisation/member/index.html");
 assert.doesNotMatch(member,/n\.id="member-status"/);
 assert.match(member,/saveFeedback\.id="member-status"/);
 assert.match(member,/saveFeedback\.setAttribute\("role","status"\)/);
 assert.match(member,/saveFeedback\.setAttribute\("aria-live","polite"\)/);
 assert.match(member,/card\.append\(bar,saveFeedback\)/);
 assert.match(member,/statusText\("جارٍ الحفظ على الخادم\.\.\."\)/);
 assert.match(member,/productionMember\?" — المراجعة "\+contributionRevision/);
 assert.match(member,/statusText\("فشل الحفظ: "\+error\.message,"error"\)/);
 assert.match(shell,/app\.mjs\?v=p2-identity-total-20261108/);
});
