import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {
 SCHEMA,RUBRICS,GROUPS,TEN,DISCUSSION,SCORE_STEP,newDraft,isAnalytical,
 suggestedWeights,withWeight,validateWeights,withSuggestions,freezeWeights,
 lessonItems,withScore,totals,groupSummaries,validateImport,serialize
} from "../prototypes/titularisation-workbench/engine.mjs";

const folder="prototypes/titularisation-workbench/";
const html=readFileSync(folder+"index.html","utf8");
const app=readFileSync(folder+"app.mjs","utf8");
const css=readFileSync(folder+"style.css","utf8");
const check=(fn,pattern)=>assert.throws(fn,pattern);
const scoreAll=(draft,phase,items,fn=()=>0)=>{
 let next=draft;
 for(const item of items)if(item.cap!==0)next=withScore(next,phase,item.id,fn(item));
 return next;
};

test("standalone module + UI parse as JavaScript without dependencies",()=>{
 execFileSync(process.execPath,["--check",folder+"engine.mjs"]);
 execFileSync(process.execPath,["--check",folder+"app.mjs"]);
 assert.match(html,/lang="ar" dir="rtl"/);
 assert.match(html,/type="module" src="\.\/app\.mjs"/);
 assert.match(html,/لا تُدخل بيانات شخصية حقيقية/);
 assert.doesNotMatch(html+app,/supabase|localStorage|sessionStorage|cookie|fetch\s*\(/i);
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(html,/غير معتمد رسميًا/);
});
test("three distinct rubric identities and provenance are always available",()=>{
 assert.equal(Object.keys(RUBRICS).length,3);
 assert.equal(new Set(Object.values(RUBRICS).map(r=>r.id)).size,3);
 assert.ok(Object.values(RUBRICS).every(r=>/غير معتمد رسميًا/.test(r.provenance)));
 for(const k of Object.keys(RUBRICS))assert.equal(newDraft(k).rubricId,RUBRICS[k].id);
});
test("historical five-group source is 12+8+8+6+6 /40 with exactly 14 source indicators",()=>{
 assert.deepEqual(GROUPS.map(g=>g.cap),[12,8,8,6,6]);
 assert.deepEqual(GROUPS.map(g=>g.items.length),[3,3,4,2,2]);
 assert.equal(GROUPS.flatMap(g=>g.items).length,14);
 assert.equal(new Set(GROUPS.flatMap(g=>g.items.map(i=>i.id))).size,14);
 assert.equal(GROUPS.reduce((s,g)=>s+g.cap,0),40);
});
test("inspector ten-item example respects source-specific score caps and discussion totals",()=>{
 assert.deepEqual(TEN.map(c=>c.cap),[5,4,4,5,5,5,4,2,2,4]);
 assert.deepEqual(DISCUSSION.map(c=>c.cap),[3,3,3,3,3,3,2]);
 assert.equal(TEN.reduce((s,c)=>s+c.cap,0),40);
 assert.equal(DISCUSSION.reduce((s,c)=>s+c.cap,0),20);
});
test("analytical weights start unset; illustrative distribution needs explicit application",()=>{
 const d=newDraft("analytical14");
 assert.deepEqual(d.profile,{weights:{},frozen:false});
 assert.equal(validateWeights(d.profile.weights).valid,false);
 check(()=>freezeWeights(d),/وزن غير مدخل/);
 const proposed=withSuggestions(d);
 assert.deepEqual(d.profile.weights,{});
 assert.equal(validateWeights(proposed.profile.weights).valid,true);
 assert.equal(Object.values(proposed.profile.weights).length,14);
});
test("half-point increments accept zero and do not confuse zero with missing",()=>{
 const base=newDraft("analytical14");
 const a=withWeight(base,"g2_1",0);
 assert.equal(a.profile.weights.g2_1,0);
 assert.equal(validateWeights(a.profile.weights).valid,false); // other fields absent
 const b=withWeight(a,"g2_1","");
 assert.equal(Object.hasOwn(b.profile.weights,"g2_1"),false);
 check(()=>withWeight(base,"g2_1",.25),/مضاعفات نصف نقطة/);
 check(()=>withWeight(base,"g2_1",-1),/مضاعفات نصف نقطة/);
 check(()=>withWeight(base,"g2_1","Infinity"),/مضاعفات نصف نقطة/);
});
test("adjustable same-cap distributions 3+3+2, 3+2.5+2.5, 5+3+0 all freeze",()=>{
 const combinations=[[3,3,2],[3,2.5,2.5],[5,3,0]];
 for(const triple of combinations){
  let d=withSuggestions(newDraft("analytical14"));
  for(let i=0;i<3;i++)d=withWeight(d,"g2_"+(i+1),triple[i]);
  assert.equal(validateWeights(d.profile.weights).valid,true);
  d=freezeWeights(d);
  assert.equal(d.profile.frozen,true);
  assert.deepEqual([1,2,3].map(i=>d.profile.weights["g2_"+i]),triple);
 }
});
test("over- or under-allocation blocks freezing, but editing the draft is allowed",()=>{
 let d=withSuggestions(newDraft("analytical14"));
 d=withWeight(d,"g2_1",4);
 const checkBad=validateWeights(d.profile.weights);
 assert.equal(checkBad.valid,false);
 assert.equal(checkBad.groups.find(g=>g.id==="g2").difference,-1);
 check(()=>freezeWeights(d),/مجموع القدرات المهنية/);
 d=withWeight(d,"g2_2",2);
 assert.equal(validateWeights(d.profile.weights).valid,true);
});
test("weights cannot move a point between groups or exceed own group cap",()=>{
 const d=withSuggestions(newDraft("analytical14"));
 check(()=>withWeight(d,"g2_1",8.5),/سقف/);
 check(()=>withWeight(d,"missing",1),/غير معروف/);
});
test("freeze preserves a score-era snapshot; editing afterwards is blocked",()=>{
 let d=freezeWeights(withSuggestions(newDraft("analytical14")));
 check(()=>withWeight(d,"g2_1",0),/لا يمكن تحرير/);
 check(()=>withSuggestions(d),/لا يمكن تغيير/);
 d=withScore(d,"lesson","g2_1",0);
 check(()=>withWeight(d,"g2_1",0),/لا يمكن تحرير/);
 assert.equal(d.scores.lesson.g2_1,0);
});
test("a zero-weight indicator stays visible and may not receive an invented score",()=>{
 let d=withSuggestions(newDraft("analytical14"));
 d=withWeight(d,"g2_1",0);
 d=withWeight(d,"g2_2",5);
 d=withWeight(d,"g2_3",3);
 d=freezeWeights(d);
 const items=lessonItems(d);
 assert.equal(items.length,14);
 assert.equal(items.find(i=>i.id==="g2_1").cap,0);
 assert.equal(Object.hasOwn(d.scores.lesson,"g2_1"),false);
 check(()=>withScore(d,"lesson","g2_1",0),/غير منقّط/);
 const after=scoreAll(d,"lesson",items);
 assert.equal(Object.hasOwn(after.scores.lesson,"g2_1"),false);
 assert.equal(totals(after).lesson.complete,true);
 assert.equal(totals(after).lesson.required,13);
});
test("score=0 and missing input differ; empty analytical or historical groups are incomplete",()=>{
 let d=newDraft("grouped5");
 assert.equal(totals(d).lesson.complete,false);
 d=withScore(d,"lesson","g1",0);
 assert.equal(d.scores.lesson.g1,0);
 assert.equal(totals(d).lesson.entered,1);
 d=withScore(d,"lesson","g1","");
 assert.equal(Object.hasOwn(d.scores.lesson,"g1"),false);
 assert.equal(totals(d).lesson.entered,0);
});
test("negative, excessive, unknown, malformed scores are rejected",()=>{
 const d=newDraft("inspector10");
 for(const value of [-.5,5.5,"wrong","Infinity",NaN])
  check(()=>withScore(d,"lesson","c1",value),/العلامة خارج المجال/);
 check(()=>withScore(d,"lesson","missing",1),/غير صالح/);
 check(()=>withScore(d,"other","c1",1),/مرحلة غير معروفة/);
});
test("numeric 30/60 threshold is computed but no committee decision is generated",()=>{
 let d=newDraft("grouped5");
 d=scoreAll(d,"lesson",lessonItems(d),()=>6); // 5 groups x 6 = 30, all caps >= 6
 d=scoreAll(d,"discussion",DISCUSSION,()=>0);
 let t=totals(d);
 assert.equal(t.total60,30);assert.equal(t.threshold30,true);
 assert.equal(t.score20,10);
 assert.equal("committeeDecision" in t,false);
 d=withScore(d,"lesson","g1",5.5);
 assert.equal(totals(d).total60,29.5);
 assert.equal(totals(d).threshold30,false);
});
test("60/60, unfinished report, and repeating decimal final20 are represented without official rounding",()=>{
 let full=newDraft("grouped5");
 full=scoreAll(full,"lesson",lessonItems(full),c=>c.cap);
 full=scoreAll(full,"discussion",DISCUSSION,c=>c.cap);
 assert.equal(totals(full).total60,60);
 assert.equal(totals(full).score20,20);
 let unfinished=withScore(full,"discussion","d7","");
 assert.equal(totals(unfinished).total60,null);
 assert.equal(totals(unfinished).threshold30,null);
 let repeating=newDraft("grouped5");
 repeating=scoreAll(repeating,"lesson",lessonItems(repeating),()=>5);
 repeating=scoreAll(repeating,"discussion",DISCUSSION,c=>c.id==="d7"?1:1.5); // 25 + 10 = 35
 assert.equal(totals(repeating).total60,35);
 assert.equal(totals(repeating).score20,35/3);
});
test("identity of different rubrics cannot be interchanged on JSON import",()=>{
 let d=newDraft("grouped5");
 d=withScore(d,"lesson","g1",8);
 const forged={...d,rubricId:RUBRICS.inspector10.id};
 check(()=>validateImport(forged),/عنصر علامة غير معروف/);
 const unknown={...d,rubricId:"not-registered"};
 check(()=>validateImport(unknown),/شبكة غير معروفة/);
});
test("a wrong weight sum or non-half weight in imported frozen profile is rejected",()=>{
 let d=freezeWeights(withSuggestions(newDraft("analytical14")));
 d.profile.weights.g2_1=3.5;
 check(()=>validateImport(d),/مجموع القدرات المهنية/);
 d=freezeWeights(withSuggestions(newDraft("analytical14")));
 d.profile.weights.g2_1=3.25;
 check(()=>validateImport(d),/مضاعفات نصف نقطة/);
});
test("round-trip JSON preserves frozen profile, zero weight, zeros in scores and provenance",()=>{
 let d=withSuggestions(newDraft("analytical14"));
 d=withWeight(d,"g2_1",0);
 d=withWeight(d,"g2_2",5);
 d=withWeight(d,"g2_3",3);
 d=freezeWeights(d);
 d=withScore(d,"lesson","g2_2",0);
 d=withScore(d,"discussion","d1",0);
 const reconstructed=validateImport(JSON.parse(serialize(d)));
 assert.deepEqual(reconstructed,d);
 assert.equal(reconstructed.scores.lesson.g2_2,0);
 assert.equal(Object.hasOwn(reconstructed.scores.lesson,"g2_1"),false);
});
test("malformed import schema, shapes, implicit scoring before frozen profile rejected",()=>{
 const d=newDraft("analytical14");
 check(()=>validateImport({...d,schema:"else"}),/صيغة/);
 check(()=>validateImport({...d,revision:2}),/صيغة/);
 check(()=>validateImport({...d,profile:[]}),/ملف الأوزان/);
 check(()=>validateImport({...d,scores:{lesson:[],discussion:{}}}),/بنية العلامات/);
 check(()=>validateImport({...d,scores:{lesson:{g2_1:0},discussion:{}}}),/قبل تثبيت الأوزان/);
});

test("analytical group totals are null until every positive-weight indicator is explicitly scored",()=>{
 let d=freezeWeights(withSuggestions(newDraft("analytical14")));
 const empty=groupSummaries(d);
 assert.equal(empty.length,5);
 assert.equal(empty[0].total,null);
 d=withScore(d,"lesson","g2_1",3);
 d=withScore(d,"lesson","g2_2",0);
 assert.equal(groupSummaries(d)[1].total,null);
 assert.equal(groupSummaries(d)[1].partial,3);
 d=withScore(d,"lesson","g2_3",2);
 assert.equal(groupSummaries(d)[1].total,5);
 assert.equal(groupSummaries(d)[1].cap,8);
});
test("zero-weight indicator does not count as an unentered group score or fabricate a mark",()=>{
 let d=withSuggestions(newDraft("analytical14"));
 d=withWeight(d,"g2_1",0);
 d=withWeight(d,"g2_2",5);
 d=withWeight(d,"g2_3",3);
 d=freezeWeights(d);
 d=withScore(d,"lesson","g2_2",2);
 d=withScore(d,"lesson","g2_3",1);
 const result=groupSummaries(d)[1];
 assert.equal(result.required,2);
 assert.equal(result.entered,2);
 assert.equal(result.total,3);
 assert.equal(Object.hasOwn(d.scores.lesson,"g2_1"),false);
 assert.deepEqual(groupSummaries(newDraft("grouped5")),[]);
});

test("all three lesson rubrics and the discussion use an attained score increment of 0.5",()=>{
 assert.equal(SCORE_STEP,.5);
 for(const [rubric,id,limit] of [
  ["grouped5","g1",12],["inspector10","c1",5],["analytical14","g1_1",4]
 ]){
  let d=newDraft(rubric);
  if(rubric==="analytical14")d=freezeWeights(withSuggestions(d));
  d=withScore(d,"lesson",id,0);
  assert.equal(d.scores.lesson[id],0,"zero is valid");
  d=withScore(d,"lesson",id,.5);
  assert.equal(d.scores.lesson[id],.5);
  d=withScore(d,"lesson",id,limit-.5);
  assert.equal(d.scores.lesson[id],limit-.5);
  d=withScore(d,"discussion","d1",2.5);
  assert.equal(d.scores.discussion.d1,2.5);
  assert.equal(totals(d).lesson.partial,limit-.5);
  check(()=>withScore(d,"lesson",id,1.25),/خطوة 0.5/);
  check(()=>withScore(d,"discussion","d2",1.75),/خطوة 0.5/);
  check(()=>withScore(d,"lesson",id,-.5),/خارج المجال/);
  check(()=>withScore(d,"lesson",id,limit+.5),/خارج المجال/);
 }
});
test("fractional score validity is preserved during JSON import and export",()=>{
 let d=newDraft("grouped5");
 d=withScore(d,"lesson","g1",6.5);
 d=withScore(d,"discussion","d1",1.5);
 assert.deepEqual(validateImport(JSON.parse(serialize(d))),d);
 const invalid=structuredClone(d);
 invalid.scores.lesson.g1=6.25;
 check(()=>validateImport(invalid),/خطوة 0.5/);
 const invalidDiscussion=structuredClone(d);
 invalidDiscussion.scores.discussion.d1=1.25;
 check(()=>validateImport(invalidDiscussion),/خطوة 0.5/);
});
test("the attached historical grouped-five draft remains valid without changing stored numbers",()=>{
 // Non-identifying score-only regression assembled from the user's test JSON;
 // the uploaded file itself is not copied into the public repository.
 const old={
  schema:SCHEMA,revision:1,rubricId:RUBRICS.grouped5.id,profile:null,
  scores:{
   lesson:{g1:6,g2:5,g3:4,g4:4,g5:4},
   discussion:{d1:2,d2:2,d3:1,d4:1,d5:2,d6:2,d7:2}
  }
 };
 const restored=validateImport(old),result=totals(restored);
 assert.deepEqual(restored,old);
 assert.equal(result.lesson.total,23);
 assert.equal(result.discussion.total,12);
 assert.equal(result.total60,35);
 assert.equal(result.score20,35/3);
 assert.deepEqual(validateImport(JSON.parse(serialize(restored))),old);
});
test("the five grouped criteria display their fourteen original indicators only as reminders",()=>{
 assert.match(app,/GROUPS\.find\(group=>group\.id===item\.id\)\?\.items/);
 assert.match(app,/phase==='lesson'&&draft\.rubricId===RUBRICS\.grouped5\.id/);
 assert.match(app,/المؤشرات التابعة لهذا المعيار \(للتذكير فقط\)/);
 assert.match(app,/class="indicator-reminders"/);
 assert.match(app,/reminders\.map\(indicator=>/);
 assert.match(css,/\.indicator-reminders/);
 assert.equal(GROUPS.reduce((a,g)=>a+g.items.length,0),14);
 assert.equal(lessonItems(newDraft("grouped5")).length,5,"no extra scoring fields added");
 assert.equal(lessonItems(newDraft("inspector10")).length,10);
});
test("input boxes expose step=0.5 instead of any; weights remain independently configurable",()=>{
 assert.match(app,/item\.cap,SCORE_STEP/);
 assert.doesNotMatch(app,/item\.cap,'any'/);
 assert.match(app,/group\.cap,\.5,/); // weight field retains 0.5 increment
 assert.match(app,/data-score=/);
 assert.match(app,/العلامة المحصلة هي 0.5 نقطة/);
});
