import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {RUBRICS,suggestedWeights,validateWeights,newDraft} from "../prototypes/titularisation-workbench/engine.mjs";
import {restoreCommittee} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {prepareCloudCommitteeDraft,mergeSubmittedCloudMembers} from "../prototypes/titularisation-committee/committee-cloud-bridge.mjs";
const sql=readFileSync("supabase/migrations/011_titularisation_analytical14_frozen_mission_rubric.sql","utf8");
const qa=readFileSync("qa-titularisation/app.mjs","utf8");
const member=readFileSync("committee-member/app.mjs","utf8");
const importer=readFileSync("prototypes/titularisation-committee/app.mjs","utf8");
const bridge=readFileSync("prototypes/titularisation-committee/committee-cloud-bridge.mjs","utf8");
const prod=readFileSync("cloud-config.js","utf8");
const html=readFileSync("qa-titularisation/report/index.html","utf8");
const edge=readFileSync("supabase/functions/titularisation-access/index.ts","utf8");
const notes=()=>({lesson:{},discussion:{},lessonSummary:"",discussionSummary:"",general:"",recommendations:""});

test("M5.6: QA 14-item profile is frozen by owner, group totals verified, not mutable after issuance",()=>{
 assert.match(sql,/lesson_derived_indicators_v1/);
 assert.match(sql,/rubric_profile jsonb/);
 assert.match(sql,/create or replace function public\.freeze_titularisation_analytical_weights/);
 assert.match(sql,/not public\.is_titularisation_owner\(p_mission_id\)/);
 assert.match(sql,/m\.rubric_profile is not null/);
 assert.match(sql,/jsonb_object_keys\(p_weights\)\)<>14/);
 assert.match(sql,/if group_sum<>group_cap/);
 assert.match(sql,/mod\(v_number\*2,1\)<>0/);
 assert.match(sql,/s\.status<>'vacant'/);
 assert.match(sql,/rubric_profile=w/);
 assert.match(edge,/ثبّت أوزان المؤشرات الأربعة عشر/);
});
test("M5.6: server validates every analytic score against exact mission-frozen profile",()=>{
 assert.match(sql,/g->'profile' is distinct from v_profile/);
 assert.match(sql,/jsonb_typeof\(g->'scores'\) is distinct from 'object'/);
 assert.match(sql,/v_profile->'weights'->>key/);
 assert.match(sql,/cap=0 or num<0 or num>cap or mod\(num\*2,1\)<>0/);
 assert.match(sql,/Unknown indicator or invalid note/);
 assert.match(sql,/public\.validate_titularisation_analytical_payload\(p_mission_id,p_payload\)/);
 assert.match(sql,/public\.validate_titularisation_member_payload\(v_rubric,p_payload\)/);
 assert.match(sql,/where id=p_mission_id and status='draft' and expires_at>now\(\) for update/);
 assert.match(sql,/revision=public\.titularisation_contributions\.revision\+1/);
 assert.match(sql,/v_prev_status='submitted' and not p_submit/);
 assert.doesNotMatch(sql,/grant execute on function public\.validate_titularisation_analytical_payload\(uuid,jsonb\)\s+to authenticated/);
});
test("M5.6: QA inspector and member use frozen 14-item rubric, no invented conversion",()=>{
 assert.match(qa,/freeze_titularisation_analytical_weights/);
 assert.match(qa,/suggestedWeights\(\)/);
 assert.match(qa,/validateWeights\(weights\)/);
 assert.match(qa,/mission\.rubric_profile\?\.frozen===true/);
 assert.match(qa,/report\/\?mission=/);
 assert.match(member,/rubric_profile\?\.frozen!==true/);
 assert.match(member,/grading\.profile=structuredClone\(mission\.rubric_profile\)/);
 assert.match(member,/if\(item\.cap===0\)score\.disabled=true/);
 assert.match(member,/save_titularisation_member_contribution/);
});
test("M5.6: QA report reuses accepted generator, never loads production cloud credentials",()=>{
 assert.match(html,/qa-titularisation|QA — مشروع اختبار/);
 assert.match(html,/src="\.\.\/config\.js"/);
 assert.match(html,/prototypes\/titularisation-committee\/app\.mjs/);
 assert.match(html,/prototypes\/titularisation-committee\/print-layout-b5\.css/);
 assert.doesNotMatch(html,/src="\.\.\/\.\.\/cloud-config\.js"/);
 assert.match(bridge,/scientifica_committee_qa_session_v1/);
 assert.match(bridge,/sessionStorage\.getItem\(QA_SESSION\)/);
 assert.match(bridge,/mission\.rubric_profile/);
 assert.match(importer,/prepareCloudCommitteeDraft\(mission\)/);
 assert.match(importer,/صدّر JSON احتياطيًا/);
 assert.match(prod,/temporaryCommitteeEnabled: false/);
});
test("M5.6: local merging preserves 14-indicator weights and inspector final",()=>{
 const weights=suggestedWeights();
 assert.equal(validateWeights(weights).valid,true);
 const mission={rubric_id:RUBRICS.analytical14.id,rubric_profile:{weights,frozen:true}};
 const draft=prepareCloudCommitteeDraft(mission);
 assert.equal(draft.rubricId,RUBRICS.analytical14.id);
 assert.deepEqual(draft.final.grading.profile,mission.rubric_profile);
 const grading=newDraft(RUBRICS.analytical14.id);
 grading.profile=structuredClone(mission.rubric_profile);
 grading.scores.lesson.g1_1=3.5;grading.scores.discussion.d1=2;
 const sample={seat_code:"member1",status:"submitted",payload:{
  grading,notes:{...notes(),general:"اختبار تجريبي فقط"}
 }};
 const untouched=JSON.stringify(draft.final);
 const merged=mergeSubmittedCloudMembers(draft,mission,[sample]);
 assert.deepEqual(merged.seats,["member1"]);
 assert.equal(JSON.stringify(merged.state.final),untouched);
 assert.equal(merged.state.members.member1.submitted,true);
 assert.equal(merged.state.members.member1.grading.scores.lesson.g1_1,3.5);
 assert.equal(merged.state.members.member1.notes.general,"اختبار تجريبي فقط");
 assert.deepEqual(restoreCommittee(merged.state),merged.state);
 const forged=structuredClone(sample);forged.payload.grading.profile.weights.g1_1=4.5;
 assert.throws(()=>mergeSubmittedCloudMembers(draft,mission,[forged]),/أوزان/);
 assert.throws(()=>mergeSubmittedCloudMembers(draft,
  {...mission,rubric_id:RUBRICS.grouped5.id},[sample]),/تختلف/);
});
test("M5.6: new browser modules have valid JS syntax",()=>{
 for(const path of [
  "committee-member/app.mjs","qa-titularisation/app.mjs",
  "prototypes/titularisation-committee/app.mjs",
  "prototypes/titularisation-committee/committee-cloud-bridge.mjs"
 ])assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path],{stdio:"pipe"}));
});
