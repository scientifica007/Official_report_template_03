import test from "node:test";
import assert from "node:assert/strict";
import {
 freshCommittee,changeMode,editScore,editNote,submit,reopen,assistance,
 proposedFinal,selectRounding,rounding,resetFinalNote,documentData,
 restoreCommittee,stringifyCommittee,finalizeWeights,applySuggestedWeights,
 configureWeight,SEATS,MODES
} from "../prototypes/titularisation-committee/committee-engine.mjs";

function membersWithMarks(entries,phase="lesson",id="g1"){
 let s=changeMode(freshCommittee(),"individual");
 for(const [seat,value,note] of entries){
  s=editScore(s,seat,phase,id,value);
  if(note)s=editNote(s,seat,phase,note,id);
  s=submit(s,seat);
 }
 return s;
}
test("mode selector label is simply individual contributions",()=>{
 assert.equal(MODES.individual,"مساهمات فردية");
});
test("chair result is populated from submitted scores without modifying stored chair draft",()=>{
 const s=membersWithMarks([["member1",2.5,"الشرح واضح"],["member2",3.5,"تفاعل المتكونين"]]);
 const before=JSON.stringify(s);
 const source=assistance(s).means.lesson.g1;
 assert.deepEqual(source.entries.map(x=>x.value),[2.5,3.5]);
 assert.equal(source.sum,6);
 assert.equal(source.mean,3);
 assert.equal(source.count,2);
 const proposed=proposedFinal(s);
 assert.equal(proposed.grading.scores.lesson.g1,3);
 assert.equal(proposed.source.lesson.g1,"مقترح آلي قابل للتعديل");
 assert.match(proposed.notes.lesson.g1,/العضو الأول: الشرح واضح/);
 assert.match(proposed.notes.lesson.g1,/العضو الثاني: تفاعل المتكونين/);
 assert.equal(s.final.grading.scores.lesson.g1,undefined);
 assert.equal(JSON.stringify(s),before,"derived proposal may not mutate original marks or notes");
 assert.equal(documentData(s).finalGrades.lesson.g1,3);
});
test("show exact average and allow independent upward and downward half-point choices",()=>{
 const s=membersWithMarks([
  ["chair",2],["member1",2.5],["member2",3],["member3",2]
 ]);
 const r=assistance(s).means.lesson.g1;
 assert.equal(r.sum,9.5);
 assert.equal(r.count,4);
 assert.equal(r.mean,2.375);
 assert.deepEqual(rounding(r.mean,12),{down:2,up:2.5,nearest:2.5});
 assert.equal(proposedFinal(s).grading.scores.lesson.g1,2.5);
 const below=selectRounding(s,"lesson","g1","down");
 const above=selectRounding(s,"lesson","g1","up");
 assert.equal(documentData(below).finalGrades.lesson.g1,2);
 assert.equal(documentData(above).finalGrades.lesson.g1,2.5);
 assert.equal(assistance(above).means.lesson.g1.mean,2.375);
 assert.equal(s.final.grading.scores.lesson.g1,undefined);
});
test("manual final mark including zero wins over suggestion after other submissions",()=>{
 let s=membersWithMarks([["member1",4]]);
 s=editScore(s,"final","lesson","g1",0);
 s=editNote(s,"final","general","صياغة المفتش الخاصة");
 s=editScore(s,"member2","lesson","g1",8);
 s=submit(s,"member2");
 assert.equal(assistance(s).means.lesson.g1.mean,6);
 assert.equal(proposedFinal(s).grading.scores.lesson.g1,0);
 assert.equal(proposedFinal(s).notes.general,"صياغة المفتش الخاصة");
 s=editScore(s,"final","lesson","g1","");
 assert.equal(proposedFinal(s).grading.scores.lesson.g1,6,"clearing numeric override restores suggestion");
});
test("authored note is preserved, and intentionally blank note stays blank",()=>{
 let s=membersWithMarks([["member1",2,"نص العضو الأول"]]);
 s=editNote(s,"final","lesson","تقدير مُحرر", "g1");
 s=editNote(s,"final","general","");
 const note=proposedFinal(s).notes;
 assert.equal(note.lesson.g1,"تقدير مُحرر");
 assert.equal(note.general,"");
 s=editNote(s,"member2","lesson","نص عضو جديد","g1");
 s=submit(s,"member2");
 assert.equal(proposedFinal(s).notes.lesson.g1,"تقدير مُحرر");
 s=resetFinalNote(s,"lesson","g1");
 assert.match(proposedFinal(s).notes.lesson.g1,/نص العضو الأول/);
 assert.match(proposedFinal(s).notes.lesson.g1,/نص عضو جديد/);
});
test("automatically collected general and discussion notes can be edited without repeat typing",()=>{
 let s=membersWithMarks([["member1",2.5]]);
 // Member is locked: reopen before writing, then submit updated contribution.
 s=reopen(s,"member1");
 s=editNote(s,"member1","general","تقدير الأستاذ");
 s=editNote(s,"member1","recommendations","توصية اللجنة");
 s=editNote(s,"member1","discussion","نقاش منهجي","d1");
 s=submit(s,"member1");
 const resolved=proposedFinal(s).notes;
 assert.match(resolved.general,/تقدير الأستاذ/);
 assert.match(resolved.recommendations,/توصية اللجنة/);
 assert.match(resolved.discussion.d1,/نقاش منهجي/);
 s=editNote(s,"final","general","صياغة نهائية مع إضافة");
 assert.equal(documentData(s).finalNotes.general,"صياغة نهائية مع إضافة");
});
test("removed or reopened member inputs leave chair overrides intact",()=>{
 let s=membersWithMarks([["member1",2],["member2",4]]);
 assert.equal(assistance(s).means.lesson.g1.mean,3);
 s=editScore(s,"final","lesson","g1",5.5);
 s=reopen(s,"member2");
 assert.equal(assistance(s).means.lesson.g1.mean,2);
 assert.equal(documentData(s).finalGrades.lesson.g1,5.5);
});
test("zero-weight indicators never receive derived or manual marks",()=>{
 let s=changeMode(freshCommittee("unified","analytical14"),"individual");
 s=applySuggestedWeights(s);
 s=configureWeight(s,"g2_1",0);
 s=configureWeight(s,"g2_2",5);
 s=configureWeight(s,"g2_3",3);
 s=finalizeWeights(s);
 s=editScore(s,"member1","lesson","g2_2",3.5);
 s=submit(s,"member1");
 assert.equal(proposedFinal(s).grading.scores.lesson.g2_1,undefined);
 assert.equal(proposedFinal(s).grading.scores.lesson.g2_2,3.5);
 assert.throws(()=>selectRounding(s,"lesson","g2_1","up"),/قابل للتنقيط/);
});
test("save/restore preserves manual grade and text overrides and keeps proposals dynamic",()=>{
 let s=membersWithMarks([["member1",1.5,"تعليق أول"],["member2",2.5,"تعليق ثان"]]);
 s=editScore(s,"final","lesson","g1",2.5);
 s=editNote(s,"final","lesson","", "g1");
 const restored=restoreCommittee(JSON.parse(stringifyCommittee(s)));
 assert.deepEqual(restored,s);
 assert.equal(documentData(restored).finalGrades.lesson.g1,2.5);
 assert.equal(documentData(restored).finalNotes.lesson.g1,"");
 assert.equal(restored.finalNoteEdits.includes("lesson:g1"),true);
});
test("old version-1 JSON without override metadata preserves manually authored notes",()=>{
 let s=membersWithMarks([["member1",1.5,"رأي العضو"]]);
 s=editNote(s,"final","general","نص محفوظ قديم");
 delete s.finalNoteEdits;
 const restored=restoreCommittee(s);
 assert.equal(proposedFinal(restored).notes.general,"نص محفوظ قديم");
 assert.equal(restored.finalNoteEdits.includes("field:general"),true);
});
test("invalid note override identifiers and duplicate keys are rejected",()=>{
 const s=freshCommittee();
 s.finalNoteEdits=["field:unknown"];
 assert.throws(()=>restoreCommittee(s),/معرف تعديل/);
 s.finalNoteEdits=["field:general","field:general"];
 assert.throws(()=>restoreCommittee(s),/تعديلات نصوص/);
});
test("existing unified mode still starts empty, with no imported member proposals",()=>{
 const s=freshCommittee();
 assert.equal(proposedFinal(s).grading.scores.lesson.g1,undefined);
 assert.equal(proposedFinal(s).notes.general,"");
 assert.equal(documentData(s).result.total60,null);
});
