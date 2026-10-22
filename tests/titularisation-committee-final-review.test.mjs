import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 freshCommittee,changeMode,editScore,editNote,submit,proposedFinal,
 selectRounding,documentData,restoreCommittee,stringifyCommittee
} from "../prototypes/titularisation-committee/committee-engine.mjs";
const individual=()=>changeMode(freshCommittee(),"individual");
test("the accepted editing surface has no extra digital approval or adoption step",()=>{
 const form=readFileSync("prototypes/titularisation-committee/form-ui.mjs","utf8");
 assert.doesNotMatch(form,/اعتماد العلامات المقترحة|finalReviewOverview|adoptSuggestedScores|final-review-zone/);
 assert.match(form,/editScore\(state,who,phase,item\.id,field\.value\)/);
 assert.match(form,/selectRounding\(state,phase,item\.id,"down"\)/);
 assert.match(form,/selectRounding\(state,phase,item\.id,"up"\)/);
});
test("the inspector may edit, revise, and edit again with zero/half-point preserved",()=>{
 let s=individual();
 s=editScore(s,"member1","lesson","g1",2);
 s=editNote(s,"member1","general","ملاحظة العضو الأصلية");
 s=submit(s,"member1");
 const original=structuredClone(s.members.member1);
 assert.equal(proposedFinal(s).grading.scores.lesson.g1,2);
 s=editScore(s,"final","lesson","g1",0);
 assert.equal(documentData(s).finalGrades.lesson.g1,0);
 s=editScore(s,"final","lesson","g1",5.5);
 s=editScore(s,"final","lesson","g1",7.5);
 assert.equal(documentData(s).finalGrades.lesson.g1,7.5);
 s=editNote(s,"final","general","صياغة أولى");
 s=editNote(s,"final","general","صياغة مراجعة ثانية");
 assert.equal(documentData(s).finalNotes.general,"صياغة مراجعة ثانية");
 assert.deepEqual(s.members.member1,original,"editing never overwrites authored submissions");
});
test("printing preview data is not approval and never closes editing",()=>{
 let s=individual();
 s=editScore(s,"member1","discussion","d1",1.5);
 s=submit(s,"member1");
 const printedDraft=documentData(s);
 assert.equal(printedDraft.finalGrades.discussion.d1,1.5);
 s=selectRounding(s,"discussion","d1","up");
 s=editScore(s,"final","discussion","d1",2.5);
 assert.equal(documentData(s).finalGrades.discussion.d1,2.5);
 assert.equal(printedDraft.finalGrades.discussion.d1,1.5,"earlier render payload is not retroactively changed");
 const restored=restoreCommittee(JSON.parse(stringifyCommittee(s)));
 restored.final.grading.scores.discussion.d1=2;
 assert.equal(s.final.grading.scores.discussion.d1,2.5);
});
test("new submissions do not replace manually edited final marks or words",()=>{
 let s=individual();
 s=editScore(s,"member1","lesson","g1",2);
 s=submit(s,"member1");
 s=editScore(s,"final","lesson","g1",8.5);
 s=editNote(s,"final","general","خلاصة مستقلة للمفتش");
 s=editScore(s,"member2","lesson","g1",4);
 s=submit(s,"member2");
 assert.equal(documentData(s).finalGrades.lesson.g1,8.5);
 assert.equal(documentData(s).finalNotes.general,"خلاصة مستقلة للمفتش");
 assert.equal(proposedFinal(s).grading.scores.lesson.g1,8.5);
});
