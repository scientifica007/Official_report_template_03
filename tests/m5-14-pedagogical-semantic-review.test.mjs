import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {analyzePedagogicalRelations} from "../prototypes/titularisation-committee/inspector-semantic-review.mjs";
import {synthesizeInspectorNotes} from "../prototypes/titularisation-committee/inspector-synthesis.mjs";
const read=path=>readFileSync(path,"utf8");
const id="11111111-1111-4111-8111-111111111111";
const notes=parts=>({lesson:{},discussion:{},lessonSummary:"",
 discussionSummary:"",general:"",recommendations:"",...parts});
const caseSource=(...members)=>({
 owner_only:true,qa_only:true,mission_id:id,rubric_id:"lesson_grouped_5_v1",
 rows:members.map((n,i)=>({
  seat_code:"member"+(i+1),revision:1,submitted_at:"2026-11-04T22:10:00Z",
  notes:notes(n)
 }))
});
function field(key,title,...texts){
 return {
  key,title,field:"lesson",itemId:key,
  sources:texts.map((text,i)=>({
   seat_code:"member"+(i+1),seat_label:"العضو "+(i+1),
   text,original:text,revision:1
  }))
 };
}
test("M5.14: time management and unfinished practical activity are related, NOT causal",()=>{
 const x=analyzePedagogicalRelations([
  field("g1","تنظيم الحصة","لم يحسن الأستاذ توزيع وقت الحصة"),
  {key:"lesson:g2",title:"الأنشطة التطبيقية",sources:[
   {seat_code:"member2",seat_label:"العضو الثاني",revision:2,
    text:"لم يستكمل الأستاذ النشاط التطبيقي",original:"لم يستكمل الأستاذ النشاط التطبيقي"}
  ]}
 ]);
 const link=x.relations.find(c=>c.id==="time::completion");
 assert.ok(link,"a thematic, cross-field relationship must be visible");
 assert.match(link.first.text,/وقت الحصة/);
 assert.match(link.second.text,/النشاط التطبيقي/);
 assert.match(link.explanation,/لا تثبت/);
 assert.doesNotMatch(link.explanation,/بسبب سوء|أدى.*إلى/);
 assert.equal(link.first.seatCode,"member1");
 assert.equal(link.second.seatCode,"member2");
 assert.equal(x.conflicts.length,0,"both are negative on different concepts, not contradictory");
});
test("M5.14: different wording of opposite time assessments flags implicit disagreement",()=>{
 const x=analyzePedagogicalRelations([field("g1","تنظيم الحصة",
  "أحسن الأستاذ توزيع الوقت",
  "التسيير الزمني ضعيف")]);
 assert.equal(x.conflicts.length,1);
 assert.equal(x.conflicts[0].topic,"time");
 assert.equal(x.conflicts[0].kind,"possible_disagreement");
 assert.equal(x.conflicts[0].first.seatCode,"member1");
 assert.equal(x.conflicts[0].second.seatCode,"member2");
 assert.match(x.conflicts[0].explanation,/قد تختلف/);
});
test("M5.14: cross-field unfinished vs completed activities prompts review without hiding either note",()=>{
 const source=caseSource(
  {lesson:{g1:"استكمل الأستاذ جميع الأنشطة المبرمجة"}},
  {lesson:{g2:"بقي النشاط الأخير غير منجز"}}
 );
 const result=synthesizeInspectorNotes(source);
 const mismatch=result.semantic.conflicts.find(c=>c.topic==="completion");
 assert.ok(mismatch,"cross-field contradiction recognized through pedagogical completion concept");
 assert.ok(result.fields.some(f=>f.key==="lesson:g1"));
 assert.ok(result.fields.some(f=>f.key==="lesson:g2"));
 for(const f of result.fields){
  assert.ok(f.candidate,"a cross-field lexical disagreement is flagged, not erased");
  assert.ok(f.semanticConflictCount>0);
  assert.equal(f.semanticConflictWithinField,0);
  assert.match(f.reasons.join(" "),/راجع لوحة العلاقات/);
 }
});
test("M5.14: conflicting interpretations in same field block the mechanical suggested insertion",()=>{
 const source=caseSource(
  {lesson:{g1:"أحسن الأستاذ توزيع الوقت"}},
  {lesson:{g1:"التسيير الزمني ضعيف"}}
 );
 const r=synthesizeInspectorNotes(source);
 const f=r.fields.find(f=>f.key==="lesson:g1");
 assert.equal(f.blocked,true);
 assert.equal(f.candidate,"");
 assert.equal(f.semanticConflictWithinField,1);
 assert.equal(f.sources.length,2);
 assert.match(f.reasons.join(" "),/اختلاف لفظي بيداغوجي/);
});
test("M5.14: distinct dimensions must NEVER be treated as contradiction merely due to opposite sentiment",()=>{
 const x=analyzePedagogicalRelations([
  field("g1","التنظيم","أحسن الأستاذ تنظيم الحصة"),
  {key:"lesson:g2",title:"الإنجاز",sources:[
   {seat_code:"member2",seat_label:"العضو الثاني",revision:1,
    text:"لم يستكمل الأستاذ النشاط التطبيقي"}
  ]}
 ]);
 assert.equal(x.conflicts.length,0);
 assert.ok(x.relations.some(x=>x.id==="organization::completion"));
});
test("M5.14: thematic proximity does not become a claim of consensus or shared rating",()=>{
 const x=analyzePedagogicalRelations([field("g1","الحصة",
  "وزع الأستاذ الوقت بصورة مناسبة",
  "لم يحسن الأستاذ استثمار الزمن")]);
 assert.ok(x.groups.some(g=>g.id==="time"));
 assert.match(x.groups[0].explanation,/تشابه الموضوع لا يعني اتفاق التقدير/);
 assert.equal(x.groups[0].evidence.length,2);
 assert.ok(!("consensus" in x));
});
test("M5.14: contrasting claims from the same member are not treated as member-to-member dispute",()=>{
 const x=analyzePedagogicalRelations([{
  key:"field:general",title:"التقدير",sources:[
   {seat_code:"member1",seat_label:"العضو الأول",revision:1,
    text:"استكمل الأنشطة؛ لم يستكمل النشاط الأخير"}
  ]
 }]);
 assert.equal(x.conflicts.length,0);
});
test("M5.14: explicit negation stays negative with positive verb form",()=>{
 const x=analyzePedagogicalRelations([field("g1","الوقت",
  "تمكن الأستاذ من استثمار الوقت",
  "لم يتمكن الأستاذ من استثمار الوقت")]);
 assert.equal(x.conflicts.length,1);
 assert.equal(x.conflicts[0].first.stance,"positive");
 assert.equal(x.conflicts[0].second.stance,"negative");
});
test("M5.14: no unrelated semantic inference from unrecognized text",()=>{
 const x=analyzePedagogicalRelations([field("g1","الحصة",
  "التقرير واضح في صياغته",
  "القسم مرتب وهادئ")]);
 assert.equal(x.groups.length,0);
 assert.equal(x.conflicts.length,0);
 assert.equal(x.relations.length,0);
 assert.equal(x.totalFindings,0);
});
test("M5.14: evidence preserved with seat, field, revision and verbatim clause",()=>{
 const x=analyzePedagogicalRelations([{
  key:"field:general",title:"التقدير العام",
  sources:[
   {seat_code:"member1",seat_label:"العضو الأول",revision:4,
    text:"استخدم الوقت بطريقة جيدة"},
   {seat_code:"member2",seat_label:"العضو الثاني",revision:7,
    text:"استثمر الزمن بصورة ملائمة"}
  ]
 }]);
 const group=x.groups.find(g=>g.id==="time");
 assert.ok(group);
 assert.equal(group.evidence[0].fieldKey,"field:general");
 assert.equal(group.evidence[0].fieldTitle,"التقدير العام");
 assert.equal(group.evidence[0].revision,4);
 assert.equal(group.evidence[0].text,"استخدم الوقت بطريقة جيدة");
 assert.equal(group.evidence[1].revision,7);
});
test("M5.14: bounded analysis is explicit about excerpts not processed",()=>{
 const long=new Array(250).fill("استثمار الوقت جيد").join("؛ ");
 const x=analyzePedagogicalRelations([{
  key:"field:general",title:"التقدير العام",
  sources:[{seat_code:"member1",text:long,revision:1}]
 }]);
 assert.equal(x.evidenceCount,240);
 assert.ok(x.omittedCount>0);
});
test("M5.14: sources are annotations, not exported to report or editable committee scores",()=>{
 const src=caseSource({general:"أحسن توزيع وقت الحصة"},
  {general:"لم يستكمل النشاط التطبيقي"});
 const r=synthesizeInspectorNotes(src);
 assert.ok(r.semantic);
 assert.equal(r.semantic.method,"local-pedagogical-lexicon-v1");
 assert.ok(r.semantic.relations.some(x=>x.id==="time::completion"));
 assert.equal(r.fields.length,1,"no new synthetic grading row added");
 assert.match(r.fields[0].candidate,/أحسن توزيع وقت الحصة/);
 assert.match(r.fields[0].candidate,/لم يستكمل النشاط التطبيقي/);
});
test("M5.14: owner-only entry, no member or prod endpoint exposure",()=>{
 const ui=read("prototypes/titularisation-committee/inspector-synthesis-ui.mjs");
 const engine=read("prototypes/titularisation-committee/inspector-synthesis.mjs");
 const member=read("committee-member/app.mjs");
 const bridge=read("prototypes/titularisation-committee/committee-cloud-bridge.mjs");
 const edge=read("supabase/functions/titularisation-access/index.ts");
 assert.match(ui,/renderSemanticReview\(root,proposal.semantic\)/);
 assert.match(ui,/خريطة العلاقات الدلالية البيداغوجية/);
 assert.match(engine,/analyzePedagogicalRelations\(fields\)/);
 assert.match(bridge,/loadInspectorSynthesisSources/);
 assert.match(edge,/if\(action==="synthesis_sources"\)/);
 assert.match(edge,/requireOwner\(token,missionId\)/);
 assert.doesNotMatch(member,/inspector-semantic-review|semantic-overview|synthesis_sources/);
 assert.doesNotMatch(ui,/fetch\(|openai|llm|service_role/i);
 for(const path of [
  "prototypes/titularisation-committee/inspector-semantic-review.mjs",
  "prototypes/titularisation-committee/inspector-synthesis.mjs",
  "prototypes/titularisation-committee/inspector-synthesis-ui.mjs"
 ])assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path],{stdio:"pipe"}));
});
