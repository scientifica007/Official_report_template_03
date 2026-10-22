import test from "node:test";
import assert from "node:assert/strict";
import {
 freshCommittee,changeMode,editScore,editNote,submit,finalReviewOverview,
 adoptSuggestedScores,documentData,restoreCommittee,stringifyCommittee
} from "../prototypes/titularisation-committee/committee-engine.mjs";
const individual=()=>changeMode(freshCommittee(),"individual");
test("review counts only unresolved proposals, without mutating authored data",()=>{
 let s=individual();
 s=editScore(s,"member1","lesson","g1",5.5);
 s=editScore(s,"member1","discussion","d1",2);
 s=editNote(s,"member1","lesson","نص أصلي محفوظ","g1");
 s=editNote(s,"member1","general","ملاحظة مستقلة");
 s=submit(s,"member1");
 const before=JSON.stringify(s);
 assert.deepEqual(finalReviewOverview(s),{scoreSuggestions:2,textSuggestions:2,submittedMembers:1});
 assert.equal(JSON.stringify(s),before);
});
test("bulk adoption is explicit, non-destructive and idempotent",()=>{
 let s=individual();
 s=editScore(s,"final","lesson","g1",0);
 s=editNote(s,"final","general","تقدير المفتش النهائي");
 s=editScore(s,"member1","lesson","g1",8);
 s=editScore(s,"member1","lesson","g2",3);
 s=editScore(s,"member1","discussion","d1",2);
 s=editNote(s,"member1","lesson","نص العضو","g2");
 s=submit(s,"member1");
 const priorMember=structuredClone(s.members);
 assert.deepEqual(finalReviewOverview(s),{scoreSuggestions:2,textSuggestions:1,submittedMembers:1});
 const next=adoptSuggestedScores(s);
 assert.equal(next.final.grading.scores.lesson.g1,0);
 assert.equal(next.final.grading.scores.lesson.g2,3);
 assert.equal(next.final.grading.scores.discussion.d1,2);
 assert.equal(next.final.notes.general,"تقدير المفتش النهائي");
 assert.deepEqual(next.members,priorMember);
 assert.equal(finalReviewOverview(next).scoreSuggestions,0);
 assert.equal(finalReviewOverview(next).textSuggestions,1);
 assert.deepEqual(adoptSuggestedScores(next),next,"no-op must not increment revision");
 assert.deepEqual(restoreCommittee(JSON.parse(stringifyCommittee(next))),next);
});
test("adopted numbers stay fixed when additional members submit, while averages remain advisory",()=>{
 let s=individual();
 s=editScore(s,"member1","lesson","g1",2);
 s=submit(s,"member1");
 s=adoptSuggestedScores(s);
 assert.equal(documentData(s).finalGrades.lesson.g1,2);
 s=editScore(s,"member2","lesson","g1",8);
 s=submit(s,"member2");
 assert.equal(documentData(s).reference.means.lesson.g1.mean,5);
 assert.equal(documentData(s).finalGrades.lesson.g1,2);
 assert.equal(finalReviewOverview(s).scoreSuggestions,0);
});
test("unified mode cannot adopt contributions and has no fake proposals",()=>{
 const s=freshCommittee();
 assert.deepEqual(finalReviewOverview(s),{scoreSuggestions:0,textSuggestions:0,submittedMembers:0});
 assert.throws(()=>adoptSuggestedScores(s),/المساهمات الفردية/);
});
test("a partial submission does not make a missing grade a zero",()=>{
 let s=individual();
 s=editNote(s,"member1","general","نص دون علامة");
 s=submit(s,"member1");
 assert.equal(finalReviewOverview(s).scoreSuggestions,0);
 assert.equal(documentData(s).finalGrades.lesson.g1,undefined);
 assert.equal(documentData(s).result.total60,null);
});
