import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {RUBRICS} from "../prototypes/titularisation-workbench/engine.mjs";
import {freshCommittee,restoreCommittee,editMeta,editScore,stringifyCommittee}
 from "../prototypes/titularisation-committee/committee-engine.mjs";
import {MISSION_CONTEXT_FIELDS,missionContextDraft,
 applyMissionContextFields,serializeMissionContext}
 from "../qa-titularisation/mission-context.mjs";

const mission={id:"11111111-2222-4333-8444-555555555555",
 rubric_id:RUBRICS.grouped5.id,rubric_profile:null};
const sample=()=>Object.fromEntries(MISSION_CONTEXT_FIELDS.map(({key})=>[key,""]));
const read=p=>readFileSync(p,"utf8");

test("P0.3: panel uses existing draft as single source of chair metadata",()=>{
 const board=read("qa-titularisation/app.mjs");
 assert.match(board,/rows\("titularisation_report_drafts",\{/);
 assert.match(board,/select:"mission_id,payload,revision,updated_at"/);
 assert.match(board,/renderMissionContext\(choose,mission\)/);
 assert.match(board,/id="qa-mission-context"|box\.id="qa-mission-context"/);
 assert.match(board,/save\.id="qa-context-save"/);
 assert.match(board,/rpc\("save_titularisation_report_draft",\{/);
 assert.match(board,/p_expected_revision:expected/);
 assert.match(board,/await refreshDetails\(\)/);
 assert.match(board,/if\(selected!==id\)return/);
 assert.doesNotMatch(board,/insert.*titularisation_report_drafts|sessionStorage\.setItem\("qa_context"/);
 const html=read("qa-titularisation/index.html");
 assert.match(html,/app\.mjs\?v=p05-qa-task-first-20261106/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","qa-titularisation/app.mjs"]));
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","qa-titularisation/mission-context.mjs"]));
});

test("P0.3: creating metadata from the mission creates a valid report draft without replacing the existing renderer",()=>{
 const values={...sample(),familyName:"تمرين",givenName:"تجريبي",
  institution:"مؤسسة اختبار",rank:"رتبة تجريبية",date:"05/11/2026",
  location:"مركز اختبار",session:"التجربة الأولى",chairName:"رئيس تجريبي"};
 const blank=missionContextDraft(mission,null);
 const changed=applyMissionContextFields(blank,values,[]);
 const saved=serializeMissionContext(changed);
 const recovered=restoreCommittee(saved);
 assert.equal(recovered.meta.institution,"مؤسسة اختبار");
 assert.equal(recovered.meta.candidate,"تمرين تجريبي");
 assert.equal(recovered.meta.familyName,"تمرين");
 assert.equal(recovered.meta.givenName,"تجريبي");
 assert.equal(recovered.meta.date,"05/11/2026");
 assert.equal(recovered.meta.chairName,"رئيس تجريبي");
 assert.equal(recovered.rubricId,mission.rubric_id);
 assert.equal(saved.schema,"titularisation-committee-lab-v1");
 assert.deepEqual(restoreCommittee(JSON.parse(stringifyCommittee(recovered))),recovered);
});

test("P0.3: changing metadata retains chair grades, authored notes and other report sections",()=>{
 let existing=freshCommittee("individual","grouped5");
 existing=editScore(existing,"final","lesson","g1",2);
 existing=editMeta(existing,"candidate","اسم قديم");
 existing.final.notes.general="تقدير حر من رئيس اللجنة";
 const values={...sample(),institution:"المؤسسة الموحدة",date:"05/11/2026"};
 const next=applyMissionContextFields(existing,values,[]);
 assert.equal(next.final.grading.scores.lesson.g1,2);
 assert.equal(next.final.notes.general,"تقدير حر من رئيس اللجنة");
 assert.equal(next.meta.candidate,"اسم قديم"); // old unsplit name isn't guessed
 assert.equal(next.meta.institution,"المؤسسة الموحدة");
 assert.equal(existing.meta.institution,"");
});

test("P0.3: issued seat display names populate blank report names without overwriting authored names",()=>{
 let original=missionContextDraft(mission,null);
 original=editMeta(original,"member1Name","اسم حر كتبه المفتش");
 const seats=[
  {seat_code:"member1",display_name:"اسم الدعوة الجديد"},
  {seat_code:"member2",display_name:"العضو التجريبي الثاني"},
  {seat_code:"member3",display_name:" "}
 ];
 const saved=applyMissionContextFields(original,sample(),seats);
 assert.equal(saved.meta.member1Name,"اسم حر كتبه المفتش");
 assert.equal(saved.meta.member2Name,"العضو التجريبي الثاني");
 assert.equal(saved.meta.member3Name,"");
 assert.equal(original.meta.member2Name,"");
});

test("P0.3: incompatible rubric or malformed metadata cannot be persisted",()=>{
 const wrong={...mission,rubric_id:RUBRICS.inspector10.id};
 const raw={payload:missionContextDraft(mission,null)};
 assert.throws(()=>missionContextDraft(wrong,raw),/لا تطابق/);
 assert.throws(()=>applyMissionContextFields(raw.payload,{...sample(),institution:"x".repeat(301)}),/غير صالحة/);
 assert.throws(()=>applyMissionContextFields(raw.payload,{...sample(),candidate:"unexpected"}),/غير صالح/);
});
