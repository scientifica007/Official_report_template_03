import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 freshCommittee,changeMode,editScore,editNote,submit,reopen,assistance,
 documentData,editMeta,restoreCommittee,stringifyCommittee,configureWeight,
 applySuggestedWeights,finalizeWeights,SEATS
} from "../prototypes/titularisation-committee/committee-engine.mjs";
const source=readFileSync("prototypes/titularisation-committee/index.html","utf8");
test("unified by default: four empty seats and editable chair summary",()=>{
 const s=freshCommittee();
 assert.equal(s.mode,"unified");
 assert.equal(SEATS.length,4);
 assert.equal(s.final.grading.scores.lesson.g1,undefined);
 assert.throws(()=>editScore(s,"member1","lesson","g1",1),/غير مفعلة/);
 assert.equal(assistance(s).count,0);
});
test("mode individual lets each seat submit independent grade and written text",()=>{
 let s=changeMode(freshCommittee(),"individual");
 s=editScore(s,"member1","lesson","g1",2.5);
 s=editNote(s,"member1","lesson","ملاحظات الحصة","g1");
 s=editNote(s,"member1","general","ملاحظة مستقلة");
 s=submit(s,"member1");
 assert.equal(s.members.member1.submitted,true);
 assert.equal(s.members.member1.notes.lesson.g1,"ملاحظات الحصة");
 assert.equal(s.members.member2.notes.general,"");
 assert.throws(()=>editNote(s,"member1","general","تغيير"),/أرسلت/);
 s=reopen(s,"member1");
 s=editNote(s,"member1","general","بعد إعادة الفتح");
 assert.equal(s.members.member1.notes.general,"بعد إعادة الفتح");
});
test("averages are advisory: chair can set final grades and prose independently",()=>{
 let s=changeMode(freshCommittee(),"individual");
 s=editScore(s,"member1","lesson","g1",2);
 s=editScore(s,"member2","lesson","g1",2.5);
 s=submit(s,"member1");
 s=submit(s,"member2");
 assert.equal(assistance(s).means.lesson.g1.mean,2.25);
 s=editScore(s,"final","lesson","g1",7);
 s=editNote(s,"final","general","تقدير اللجنة بعد المداولة");
 assert.equal(documentData(s).finalGrades.lesson.g1,7);
 assert.equal(documentData(s).finalNotes.general,"تقدير اللجنة بعد المداولة");
 assert.equal(assistance(s).means.lesson.g1.mean,2.25);
});
test("partial submissions are reviewable without inventing missing scores",()=>{
 let s=changeMode(freshCommittee(),"individual");
 s=submit(s,"member3");
 const a=assistance(s);
 assert.equal(a.count,1);
 assert.equal(a.means.lesson.g1,null);
 assert.equal(a.total60,null);
});
test("rubric-specific half-point and zero-weight rules are inherited",()=>{
 let s=changeMode(freshCommittee("unified","analytical14"),"individual");
 s=applySuggestedWeights(s);
 s=configureWeight(s,"g2_1",0);
 s=configureWeight(s,"g2_2",5);
 s=configureWeight(s,"g2_3",3);
 s=finalizeWeights(s);
 assert.equal(s.members.member1.grading.profile.weights.g2_1,0);
 assert.throws(()=>editScore(s,"member1","lesson","g2_1",0),/غير منقّط/);
 s=editScore(s,"member1","lesson","g2_2",1.5);
 assert.throws(()=>editScore(s,"member1","lesson","g2_2",1.25),/خطوة 0.5/);
 assert.equal(s.members.member1.grading.scores.lesson.g2_2,1.5);
});
test("chair metadata, writing and a saved JSON roundtrip survive",()=>{
 let s=freshCommittee();
 s=editMeta(s,"institution","مؤسسة اختبار اصطناعية");
 s=editNote(s,"final","recommendations","توصية تحريرية");
 s=editScore(s,"final","discussion","d1",2.5);
 const restored=restoreCommittee(JSON.parse(stringifyCommittee(s)));
 assert.deepEqual(restored,s);
 assert.equal(restored.meta.institution,"مؤسسة اختبار اصطناعية");
});
test("invalid restored grade, member and note are rejected",()=>{
 const base=freshCommittee();
 const badGrade=structuredClone(base);
 badGrade.final.grading.scores.lesson.g1=3.25;
 assert.throws(()=>restoreCommittee(badGrade),/خطوة 0.5/);
 const fakeSeat=structuredClone(base);
 fakeSeat.members.intruder=fakeSeat.members.member1;
 assert.throws(()=>restoreCommittee(fakeSeat),/مقعد إضافي/);
 const longNote=structuredClone(base);
 longNote.final.notes.general="x".repeat(4500);
 assert.throws(()=>restoreCommittee(longNote),/طويل/);
});
test("simulated UI is isolated: no network login or official document claim",()=>{
 const ui=readFileSync("prototypes/titularisation-committee/app.mjs","utf8");
 const paper=readFileSync("prototypes/titularisation-committee/preview.mjs","utf8");
 for(const file of [ui,paper])assert.doesNotMatch(file,/supabase|fetch\s*\(|localStorage/i);
 assert.match(source,/بيانات اصطناعية فقط/);
 assert.match(paper,/غير مطابقة بعد للقالب الرسمي/);
 assert.match(ui,/window\.print/);
});
