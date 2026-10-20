import test from "node:test";
import assert from "node:assert/strict";
import {GROUPS,DISCUSSION,lessonItems,totals} from "../prototypes/titularisation-workbench/engine.mjs";
import {
 SEATS,MODES,freshCommittee,changeMode,fillDemoMember,hasMemberContent,
 submit,reopen,editScore,editNote,assistance,documentData,
 stringifyCommittee,restoreCommittee,applySuggestedWeights,
 configureWeight,finalizeWeights
} from "../prototypes/titularisation-committee/committee-engine.mjs";

const start=(rubric="grouped5")=>changeMode(freshCommittee("unified",rubric),"individual");
function verifyComplete(draft,seat){
 const c=draft.members[seat];
 const lesson=lessonItems(c.grading).filter(x=>x.cap!==0);
 assert.equal(Object.keys(c.grading.scores.lesson).length,lesson.length);
 assert.equal(Object.keys(c.grading.scores.discussion).length,DISCUSSION.length);
 for(const phase of ["lesson","discussion"]){
  const rows=phase==="lesson"?lessonItems(c.grading):DISCUSSION;
  for(const item of rows){
   assert.match(c.notes[phase][item.id],/بيانات تجريبية/);
   assert.match(c.notes[phase][item.id],new RegExp(SEATS.find(x=>x.id===seat).label));
   if(item.cap===0){assert.equal(c.grading.scores[phase][item.id],undefined);continue;}
   const value=c.grading.scores[phase][item.id];
   assert.ok(value>=0&&value<=item.cap,phase+" "+item.id+" "+value);
   assert.equal(Number.isInteger(value*2),true,phase+" "+item.id+" half step");
  }
 }
 for(const field of ["lessonSummary","discussionSummary","general","recommendations"])
  assert.match(c.notes[field],/بيانات تجريبية/);
 assert.equal(totals(c.grading).complete,true);
 assert.equal(c.submitted,false,"must not send automatically");
}
test("one-click demo fills all scores and written notes for each simulated seat of five groups",()=>{
 let s=start();
 for(const {id} of SEATS){
  s=fillDemoMember(s,id);
  verifyComplete(s,id);
  assert.equal(s.final.grading.scores.lesson.g1,undefined,"final chair draft untouched");
  assert.equal(s.members[id].submitted,false);
 }
 const grades=SEATS.map(x=>s.members[x.id].grading.scores.lesson.g1);
 assert.equal(new Set(grades).size,4,"four unique marks for suitable-cap item");
 assert.equal(new Set(SEATS.map(x=>s.members[x.id].notes.general)).size,4);
 assert.equal(new Set(SEATS.map(x=>s.members[x.id].notes.lesson.g1)).size,4);
 assert.equal(assistance(s).count,0,"explicit send required before averaging");
 for(const {id} of SEATS)s=submit(s,id);
 assert.equal(assistance(s).count,4);
 assert.equal(documentData(s).finalGrades.lesson.g1!==undefined,true);
});
test("a single click never fills another member, chair result, or institution metadata",()=>{
 let s=start();
 s=editScore(s,"member2","lesson","g1",11.5);
 s=editNote(s,"member2","general","تقدير يدوي سابق");
 s=editScore(s,"final","lesson","g1",8);
 s.meta.candidate="اسم اختبار";
 const previous=structuredClone(s.members.member2);
 const other=structuredClone(s.members.member3);
 const chair=structuredClone(s.final);
 const meta=structuredClone(s.meta);
 s=fillDemoMember(s,"member1");
 assert.deepEqual(s.members.member2,previous);
 assert.deepEqual(s.final,chair);
 assert.deepEqual(s.meta,meta);
 assert.deepEqual(s.members.member3,other);
});
test("all ten items and discussion stages are populated with valid marks",()=>{
 const s=fillDemoMember(start("inspector10"),"member3");
 verifyComplete(s,"member3");
 assert.equal(Object.keys(s.members.member3.grading.scores.lesson).length,10);
});
test("14-indicator rubric requires a frozen weight profile and respects zero-weight indicators",()=>{
 let s=start("analytical14");
 assert.throws(()=>fillDemoMember(s,"chair"),/ثبّت أوزان/);
 s=applySuggestedWeights(s);
 s=configureWeight(s,"g2_1",0);
 s=configureWeight(s,"g2_2",5);
 s=configureWeight(s,"g2_3",3);
 s=finalizeWeights(s);
 for(const {id} of SEATS){
  s=fillDemoMember(s,id);
  verifyComplete(s,id);
  assert.equal(s.members[id].grading.scores.lesson.g2_1,undefined);
  assert.match(s.members[id].notes.lesson.g2_1,/بيانات تجريبية/);
 }
 assert.equal(Object.keys(s.members.chair.grading.scores.lesson).length,13);
});
test("demo generation is deterministic and can intentionally replace this seat's draft only",()=>{
 let s=start();
 const once=fillDemoMember(s,"member1");
 const again=fillDemoMember(once,"member1");
 assert.deepEqual(once.members.member1,again.members.member1);
 s=editNote(once,"member1","general","نصي الخاص");
 assert.equal(hasMemberContent(s,"member1"),true);
 const overwritten=fillDemoMember(s,"member1");
 assert.match(overwritten.members.member1.notes.general,/بيانات تجريبية/);
 assert.equal(s.members.member1.notes.general,"نصي الخاص");
});
test("demo fill is disallowed for sent member, final, or unified mode",()=>{
 const original=freshCommittee();
 assert.throws(()=>fillDemoMember(original,"member1"),/المساهمات الفردية/);
 assert.throws(()=>fillDemoMember(start(),"final"),/المساهمات الفردية/);
 assert.throws(()=>fillDemoMember(start(),"unknown"),/المساهمات الفردية/);
 let s=fillDemoMember(start(),"member2");
 s=submit(s,"member2");
 assert.throws(()=>fillDemoMember(s,"member2"),/أعد فتحها/);
 s=reopen(s,"member2");
 s=fillDemoMember(s,"member2");
 assert.equal(s.members.member2.submitted,false);
});
test("demo data is only included in JSON after opt-in and round-trips without changing score rules",()=>{
 let s=fillDemoMember(start(),"member1");
 assert.equal(MODES.individual,"مساهمات فردية");
 const json=stringifyCommittee(s);
 assert.match(json,/بيانات تجريبية/);
 assert.equal(json.includes("password"),false);
 const restored=restoreCommittee(JSON.parse(json));
 assert.deepEqual(restored,s);
 assert.equal(hasMemberContent(restored,"member1"),true);
 assert.equal(hasMemberContent(restored,"member2"),false);
});
test("source text and scores remain distinct between all four members after explicit sends",()=>{
 let s=start("inspector10");
 for(const {id} of SEATS)s=submit(fillDemoMember(s,id),id);
 const allTexts=SEATS.map(({id})=>s.members[id].notes.lessonSummary);
 const allMarks=SEATS.map(({id})=>s.members[id].grading.scores.lesson.c1);
 assert.equal(new Set(allTexts).size,4);
 assert.equal(new Set(allMarks).size,4);
 assert.equal(s.final.grading.scores.lesson.c1,undefined,"proposals are derived rather than overwriting chair storage");
 const review=documentData(s);
 assert.ok(review.finalGrades.lesson.c1>=0);
 assert.equal(review.reference.count,4);
});
