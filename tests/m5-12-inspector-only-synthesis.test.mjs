import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {synthesizeInspectorNotes,sourceFingerprint} from "../prototypes/titularisation-committee/inspector-synthesis.mjs";
const read=p=>readFileSync(p,"utf8");
const source=(entries,rubric_id="lesson_grouped_5_v1")=>({
 owner_only:true,qa_only:true,mission_id:"11111111-1111-4111-8111-111111111111",rubric_id,
 rows:entries.map(([seat_code,notes],i)=>({seat_code,notes,revision:i+1,
  submitted_at:"2026-11-04T19:30:00Z"}))
});
const note=(fields={})=>({lesson:{},discussion:{},
 lessonSummary:"",discussionSummary:"",general:"",recommendations:"",...fields});

test("M5.12: exact/reformatted duplicate notes collapse without losing original provenance",()=>{
 const original="أحسن الأستاذ تنظيم الأنشطة وتسلسلها، مع ضرورة تحسين توزيع الوقت";
 const sample=source([
  ["member1",note({general:original})],
  ["member2",note({general:original+"."})],
  ["member3",note({general:"ينبغي تخصيص وقت كاف للنشاط التطبيقي"})]
 ]);
 const s=synthesizeInspectorNotes(sample);
 const general=s.fields.find(x=>x.key==="field:general");
 assert.equal(general.sources.length,3);
 assert.equal(general.distinctCount,2);
 assert.equal(general.duplicateCount,1);
 assert.equal(general.blocked,false);
 assert.match(general.candidate,/أحسن الأستاذ تنظيم الأنشطة/);
 assert.match(general.candidate,/تخصيص وقت كاف/);
 assert.equal(general.candidate.match(/أحسن الأستاذ/g).length,1);
 assert.deepEqual(general.sources.map(x=>x.seat_code),
  ["member1","member2","member3"]);
 assert.doesNotMatch(general.candidate,/العضو الأول|ورد في تقديرات|رئيس اللجنة/);
});

test("M5.12: contrary assessments block insertion instead of inventing a consensus",()=>{
 const s=synthesizeInspectorNotes(source([
  ["member1",note({lesson:{g1:"تمكن الأستاذ من تنظيم الأنشطة بصورة جيدة"}})],
  ["member2",note({lesson:{g1:"لم يتمكن الأستاذ من تنظيم الأنشطة بصورة جيدة"}})]
 ]));
 const row=s.fields.find(x=>x.key==="lesson:g1");
 assert.equal(row.possibleConflicts,1);
 assert.equal(row.blocked,true);
 assert.equal(row.candidate,"");
 assert.equal(row.sources.length,2);
 assert.match(row.reasons.join(" "),/تعارض/);
});

test("M5.12: simulated attribution removed ONLY from controlled test wrapper",()=>{
 const s=synthesizeInspectorNotes(source([["member1",
  note({lesson:{g1:"بيانات تجريبية — العضو الأول — التنشيط: استخدم الأستاذ الوسائل بشكل ملائم"}})
 ]]));
 const row=s.fields.find(x=>x.key==="lesson:g1");
 assert.equal(row.blocked,false);
 assert.equal(row.candidate,"استخدم الأستاذ الوسائل بشكل ملائم.");
 assert.match(row.sources[0].original,/بيانات تجريبية/);
});

test("M5.12: unstripped contributor attribution is blocked, with source retained",()=>{
 const s=synthesizeInspectorNotes(source([["member1",
  note({general:"ورد في تقديرات العضو الأول أن الأستاذ أحسن التنشيط"})
 ]]));
 const row=s.fields.find(x=>x.key==="field:general");
 assert.equal(row.blocked,true);
 assert.equal(row.candidate,"");
 assert.match(row.reasons.join(" "),/نسبة قول/);
});

test("M5.12: field sources separated across 5/10/14 lesson rubrics and discussion",()=>{
 for(const [rubric,id] of [
  ["lesson_grouped_5_v1","g1"],
  ["lesson_inspector_10_v1","c1"],
  ["lesson_derived_indicators_v1","g1_1"]
 ]){
  const s=synthesizeInspectorNotes(source([["member3",note({
   lesson:{[id]:"تحقق الربط بين المراحل"},
   discussion:{d1:"قدم توضيحات دقيقة"}
  })]],rubric));
  assert.equal(s.fields.length,2);
  assert.ok(s.fields.some(x=>x.key==="lesson:"+id));
  assert.ok(s.fields.some(x=>x.key==="discussion:d1"));
  assert.ok(!s.fields.some(x=>x.key==="lesson:unknown"));
 }
});

test("M5.12: null/missing/empty notes are never converted to fabricated assessments",()=>{
 const s=synthesizeInspectorNotes(source([["member2",note({general:"   "})]]));
 assert.equal(s.fields.length,0);
});

test("M5.12: source revision or member correction invalidates preview fingerprint",()=>{
 const first=source([["member1",note({general:"تنظيم مناسب"})]]);
 const second=structuredClone(first);
 second.rows[0].revision=2;
 assert.notEqual(sourceFingerprint(first),sourceFingerprint(second));
 const third=structuredClone(first);
 third.rows[0].notes.general="تنظيم يحتاج إلى تحسين";
 assert.notEqual(sourceFingerprint(first),sourceFingerprint(third));
});

test("M5.12: source input must be QA owner-only, unique submitted seats, valid notes",()=>{
 for(const invalid of [
  {...source([]),owner_only:false},
  {...source([]),qa_only:false},
  source([["member1",note({})],["member1",note({})]]),
  source([["chair",note({})]]),
  source([["member1",{lesson:{},discussion:null,general:"رأي"}]]),
  source([["member1",note({general:"X".repeat(4001)})]])
 ])assert.throws(()=>synthesizeInspectorNotes(invalid));
});

test("M5.12: inspector-only backend must validate owner before reading submitted prose",()=>{
 const edge=read("supabase/functions/titularisation-access/index.ts");
 const start=edge.indexOf('if(action==="synthesis_sources"){');
 assert.ok(start>edge.indexOf('const {db,id,mission}=await requireOwner(token,missionId)'));
 const handler=edge.slice(start,edge.indexOf('if((action==="issue"',start));
 assert.match(handler,/IS_DISPOSABLE_QA/);
 assert.match(handler,/eq\("mission_id",missionId\)\.eq\("status","submitted"\)/);
 assert.match(handler,/\.in\("seat_code",\["member1","member2","member3"\]\)/);
 assert.match(handler,/owner_only:true/);
 assert.doesNotMatch(handler,/status","draft"/);
 const bridge=read("prototypes/titularisation-committee/committee-cloud-bridge.mjs");
 assert.match(bridge,/loadInspectorSynthesisSources/);
 assert.match(bridge,/action:"synthesis_sources"/);
 assert.match(bridge,/qaOnly!==true/);
 assert.match(bridge,/owner_only!==true/);
});

test("M5.12: inspector page loads review only after authorized contribution import",()=>{
 const app=read("prototypes/titularisation-committee/app.mjs");
 assert.match(app,/if\(missionBoundReport\)\{\s*try\{\s*const \{loadInspectorSynthesisSources\}/);
 assert.match(app,/await synthesisReview\.activate\(id\)/);
 assert.match(app,/state=editNote\(state,"final",field,text,itemId\)/);
 assert.match(app,/synthesisReview\?\.reset\(\)/);
 const member=read("committee-member/app.mjs");
 const page=read("qa-titularisation/member/index.html");
 assert.doesNotMatch(member,/inspector-synthesis|synthesis_sources|synthesizeInspectorNotes/);
 assert.doesNotMatch(page,/inspector-synthesis|synthesis_sources/);
 const style=read("prototypes/titularisation-committee/style.css");
 assert.match(style,/@media print\{#inspector-synthesis\{display:none!important\}\}/);
});

test("M5.12: explicit inspector decision, stale-source check and untouched score/print engines",()=>{
 const ui=read("prototypes/titularisation-committee/inspector-synthesis-ui.mjs");
 assert.match(ui,/if\(latest\.owner_only!==true\|\|latest\.qa_only!==true/);
 assert.match(ui,/sourceFingerprint\(latest\)!==snapshot\.sourceFingerprint/);
 assert.match(ui,/getState\(\)\.serial!==generatedSerial/);
 assert.match(ui,/getWho\(\)!=="final"/);
 assert.match(ui,/if\(!confirm\(question\)\)/);
 assert.match(ui,/applyNote\(field\.field,field\.itemId,audited\.text\)/);
 assert.doesNotMatch(ui,/fetch\(|openai|llm|service_role/i);
 for(const path of [
  "prototypes/titularisation-committee/app.mjs",
  "prototypes/titularisation-committee/inspector-synthesis.mjs",
  "prototypes/titularisation-committee/inspector-synthesis-ui.mjs",
  "prototypes/titularisation-committee/committee-cloud-bridge.mjs"
 ])assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path],{stdio:"pipe"}));
});
