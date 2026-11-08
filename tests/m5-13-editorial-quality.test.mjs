import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {composeGroundedProse,auditInspectorDraft} from "../prototypes/titularisation-committee/inspector-prose-quality.mjs";
import {synthesizeInspectorNotes} from "../prototypes/titularisation-committee/inspector-synthesis.mjs";
const read=p=>readFileSync(p,"utf8");
const notes=(general)=>({lesson:{},discussion:{},lessonSummary:"",discussionSummary:"",general,recommendations:""});
function sample(...generals){
 return {
  owner_only:true,qa_only:true,mission_id:"11111111-1111-4111-8111-111111111111",
  rubric_id:"lesson_grouped_5_v1",
  rows:generals.map((general,i)=>({
   seat_code:"member"+(i+1),notes:notes(general),revision:1,
   submitted_at:"2026-11-04T20:00:00Z"
  }))
 };
}
test("M5.13: duplicated clauses disappear across multi-clause member assessments, not the sources",()=>{
 const first="أحسن الأستاذ تنظيم الأنشطة؛ يحتاج إلى تحسين توزيع الزمن";
 const second="أحسن الأستاذ تنظيم الأنشطة؛ وقدم توضيحات دقيقة";
 const s=synthesizeInspectorNotes(sample(first,second));
 const field=s.fields.find(f=>f.key==="field:general");
 assert.ok(field);
 assert.equal(field.sources.length,2);
 assert.equal(field.sources[0].original,first);
 assert.equal(field.sources[1].original,second);
 assert.equal(field.clauseDuplicates,1);
 assert.equal(field.clauseCount,3);
 assert.equal(field.candidate.match(/أحسن الأستاذ تنظيم الأنشطة/gu)?.length,1);
 assert.match(field.candidate,/تحسين توزيع الزمن/);
 assert.match(field.candidate,/وقدم توضيحات دقيقة/);
 assert.equal(field.blocked,false);
});
test("M5.13: retains strengths and improvements in source order without adding invented connectors",()=>{
 const quality=composeGroundedProse([
  "أحسن الأستاذ تنظيم مراحل الحصة؛ لم يحسن استثمار الوقت",
  "استعمل الأستاذ الوسائل بطريقة ملائمة"
 ]);
 assert.equal(quality.candidate,
  "أحسن الأستاذ تنظيم مراحل الحصة؛ لم يحسن استثمار الوقت؛ استعمل الأستاذ الوسائل بطريقة ملائمة.");
 assert.equal(quality.breakdown.strength,2);
 assert.equal(quality.breakdown.improvement,1);
 assert.equal(quality.breakdown.observation,0);
 assert.equal(quality.clauseDuplicates,0);
});
test("M5.13: identical clauses with different ending marks collapse; distinct variants remain",()=>{
 const q=composeGroundedProse([
  "حقق الأستاذ الربط بين الأنشطة، بصورة جيدة.",
  "حقق الأستاذ الربط بين الأنشطة، بصورة جيدة؛ تحقق الربط بين النظرية والتطبيق"
 ]);
 assert.equal(q.clauseDuplicates,1);
 assert.equal(q.clauseCount,2);
 assert.match(q.candidate,/تحقق الربط بين النظرية والتطبيق/);
 const variants=composeGroundedProse([
  "أحسن الأستاذ توزيع الوقت؛",
  "لم يحسن الأستاذ توزيع الوقت."
 ]);
 assert.equal(variants.clauseDuplicates,0);
 assert.equal(variants.clauseCount,2);
});
test("M5.13: empty/long/malformed inputs rejected or represented without fabricated clauses",()=>{
 assert.deepEqual(composeGroundedProse([]).clauses,[]);
 assert.equal(composeGroundedProse(["   ؛ ؛ "]).candidate,"");
 for(const input of [null,["A".repeat(4001)],["x",null],["x","y","z","w"]])
  assert.throws(()=>composeGroundedProse(input));
});
test("M5.13: manually edited inspector wording accepted as author-owned, with source-number warning",()=>{
 const original="اعتمد الأستاذ 3 أنشطة في الحصة.";
 const baseline=[{original}];
 const edited=auditInspectorDraft("اعتمد الأستاذ 3 أنشطة، وبلغ الإنجاز 80%.",baseline);
 assert.equal(edited.text,"اعتمد الأستاذ 3 أنشطة، وبلغ الإنجاز 80%.");
 assert.deepEqual(edited.introducedNumbers,["80%"]);
 assert.equal(edited.requiresHumanReview,true);
 assert.match(edited.warnings.join(" "),/أضيفت أرقام/);
 const safe=auditInspectorDraft("اعتمد الأستاذ 3 أنشطة.",baseline);
 assert.deepEqual(safe.introducedNumbers,[]);
});
test("M5.13: Arabic digits are normalized in numerical audit",()=>{
 const info=auditInspectorDraft("أُنجزت ٣ أنشطة.",[{original:"أُنجزت 3 أنشطة."}]);
 assert.deepEqual(info.introducedNumbers,[]);
});
test("M5.13: block automatic report attribution, empty and too-long edited drafts",()=>{
 for(const draft of [
  "ورد في تقديرات العضو الأول أن الحصة جيدة",
  "بحسب رأي العضو الثالث فقد نجح الأستاذ",
  "  ",
  "X".repeat(4001)
 ])assert.throws(()=>auditInspectorDraft(draft,[{original:"الحصة جيدة"}]));
 assert.equal(auditInspectorDraft("تحسن الأداء.",[{original:"تحسن الأداء."}]).text,"تحسن الأداء.");
});
test("M5.13: direct QA report has inspector editor; member bundle remains excluded",()=>{
 const ui=read("prototypes/titularisation-committee/inspector-synthesis-ui.mjs");
 const app=read("prototypes/titularisation-committee/app.mjs");
 const report=read("qa-titularisation/report/index.html");
 const member=read("committee-member/app.mjs");
 const memberPage=read("qa-titularisation/member/index.html");
 assert.match(ui,/auditInspectorDraft\(draft\.value,field\.sources\)/);
 assert.match(ui,/draft\.maxLength=4000/);
 assert.match(ui,/applyNote\(field\.field,field\.itemId,audited\.text\)/);
 assert.match(ui,/sourceFingerprint\(latest\)!==snapshot\.sourceFingerprint/);
 assert.match(ui,/if\(!confirm\(question\)\)/);
 assert.match(app,/inspector-synthesis-ui\.mjs\?v=p2-prod-20261108/);
 assert.match(report,/app\.mjs\?v=p08-qa-inspector-prefill-20261106/);
 assert.doesNotMatch(member,/inspector-synthesis|inspector-prose-quality|synthesis_sources/);
 assert.doesNotMatch(memberPage,/inspector-prose-quality|synthesis_sources/);
 assert.doesNotMatch(ui,/fetch\(|openai|llm|service_role/i);
 for(const path of [
  "prototypes/titularisation-committee/inspector-prose-quality.mjs",
  "prototypes/titularisation-committee/inspector-synthesis.mjs",
  "prototypes/titularisation-committee/inspector-synthesis-ui.mjs"
 ])assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path],{stdio:"pipe"}));
});
