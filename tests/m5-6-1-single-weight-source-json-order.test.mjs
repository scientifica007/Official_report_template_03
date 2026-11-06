import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 RUBRICS,newDraft,suggestedWeights,sameWeightProfile
} from "../prototypes/titularisation-workbench/engine.mjs";
import {
 freshCommittee,restoreCommittee
} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {
 prepareCloudCommitteeDraft,mergeSubmittedCloudMembers
} from "../prototypes/titularisation-committee/committee-cloud-bridge.mjs";
const notes=()=>({lesson:{},discussion:{},lessonSummary:"",discussionSummary:"",
 general:"",recommendations:""});
const file=p=>readFileSync(p,"utf8");
test("M5.6.1: valid JSONB profiles match when keys have different insertion order",()=>{
 const a=suggestedWeights();
 const b=Object.fromEntries(Object.entries(a).reverse());
 const profileA={weights:a,frozen:true};
 const profileB={frozen:true,weights:b};
 assert.notEqual(JSON.stringify(profileA),JSON.stringify(profileB));
 assert.equal(sameWeightProfile(profileA,profileB),true);
 assert.equal(sameWeightProfile(null,null),true);
 const bad=structuredClone(profileB);bad.weights.g1_1+=.5;
 assert.equal(sameWeightProfile(profileA,bad),false);
 const missing=structuredClone(profileB);delete missing.weights.g2_2;
 assert.equal(sameWeightProfile(profileA,missing),false);
 const extra=structuredClone(profileB);extra.weights.unknown=4;
 assert.equal(sameWeightProfile(profileA,extra),false);
 assert.equal(sameWeightProfile(profileA,{weights:a,frozen:false}),false);
 assert.equal(sameWeightProfile(profileA,{weights:{...a,g1_1:"4"},frozen:true}),false);
});
test("M5.6.1: inspector imports one valid 14-item submitted member without re-entering weights",()=>{
 const weights=suggestedWeights();
 const mission={rubric_id:RUBRICS.analytical14.id,
  rubric_profile:{frozen:true,weights:Object.fromEntries(Object.entries(weights).reverse())}};
 const local=prepareCloudCommitteeDraft(mission);
 assert.equal(sameWeightProfile(local.final.grading.profile,mission.rubric_profile),true);
 local.final.notes.general="نص مهني تجريبي حرره المفتش";
 local.finalNoteEdits=["field:general"];
 const grade=newDraft(RUBRICS.analytical14.id);
 grade.profile={weights:{...weights},frozen:true};
 grade.scores.lesson.g1_1=2;
 grade.scores.discussion.d1=1;
 const before=JSON.stringify(local.final);
 const imported=mergeSubmittedCloudMembers(local,mission,[{
  seat_code:"member1",status:"submitted",
  payload:{grading:grade,notes:{...notes(),general:"نص تجريبي للعضو"}}
 }]);
 assert.equal(JSON.stringify(imported.state.final),before);
 assert.equal(imported.state.members.member1.submitted,true);
 assert.equal(imported.state.members.member1.notes.general,"نص تجريبي للعضو");
 assert.deepEqual(restoreCommittee(imported.state),imported.state);
});
test("M5.6.1: still rejects a different rubric or nonmatching weights",()=>{
 const m={rubric_id:RUBRICS.analytical14.id,
  rubric_profile:{weights:suggestedWeights(),frozen:true}};
 const base=prepareCloudCommitteeDraft(m);
 const grade=newDraft(RUBRICS.analytical14.id);
 grade.profile=structuredClone(m.rubric_profile);
 grade.scores.lesson.g1_1=1;
 const row={seat_code:"member1",status:"submitted",
  payload:{grading:grade,notes:notes()}};
 assert.throws(()=>mergeSubmittedCloudMembers(base,{...m,rubric_id:RUBRICS.grouped5.id},[row]),/تختلف/);
 const altered=structuredClone(row);altered.payload.grading.profile.weights.g1_1+=.5;
 assert.throws(()=>mergeSubmittedCloudMembers(base,m,[altered]),/أوزان/);
});
test("M5.6.1: linked QA report automatically inherits frozen mission rubric, without a second weight form",()=>{
 const app=file("prototypes/titularisation-committee/app.mjs");
 const bridge=file("prototypes/titularisation-committee/committee-cloud-bridge.mjs");
 const member=file("committee-member/app.mjs");
 const committee=file("prototypes/titularisation-committee/committee-engine.mjs");
 assert.match(app,/const qaReport=.*qaOnly===true/);
 assert.match(app,/\$\("rubric"\)\.disabled=qaReport/);
 assert.match(app,/if\(qaReport\)\{/);
 assert.match(app,/لا يلزم إدخالها مرة ثانية/);
 assert.match(app,/loadCloudCommitteeInspectorProfile\(\)\.catch\(error=>/);
 assert.match(app,/state!==untouched/);
 assert.match(app,/prepareCloudCommitteeDraft\(mission\)/);
 assert.match(app,/sameWeightProfile\(state\.final\.grading\.profile,mission\.rubric_profile\)/);
 assert.match(bridge,/sameWeightProfile\(grading\?\.profile,mission\.rubric_profile\)/);
 assert.match(member,/sameWeightProfile\(payload\.grading\.profile,mission\.rubric_profile\)/);
 assert.match(committee,/sameWeightProfile\(grading\.profile,lockedProfile\)/);
 assert.doesNotMatch(app,/JSON\.stringify\(state\.final\.grading\.profile\)===JSON\.stringify\(mission\.rubric_profile\)/);
});
test("M5.6.1: legacy grouped five JSON draft remains compatible",()=>{
 const original=freshCommittee("individual","grouped5");
 assert.equal(restoreCommittee(original).rubricId,RUBRICS.grouped5.id);
 assert.equal(sameWeightProfile(original.final.grading.profile,null),true);
});
