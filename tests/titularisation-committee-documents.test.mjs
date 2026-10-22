import test from "node:test";
import assert from "node:assert/strict";
import {
 freshCommittee,editMeta,editScore,editNote,changeMode,submit,
 applySuggestedWeights,finalizeWeights,restoreCommittee,stringifyCommittee
} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {buildReferenceDocuments,mark} from "../prototypes/titularisation-committee/document-model.mjs";
import {committeeDocumentXml,createCommitteeDocx} from "../prototypes/titularisation-committee/docx-export.mjs";

function storedFiles(bytes){
 const decoder=new TextDecoder(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let pos=0;const result={};
 while(pos+30<bytes.length&&view.getUint32(pos,true)===0x04034b50){
  const size=view.getUint32(pos+18,true);
  const nameLength=view.getUint16(pos+26,true),extra=view.getUint16(pos+28,true);
  const name=decoder.decode(bytes.subarray(pos+30,pos+30+nameLength));
  const offset=pos+30+nameLength+extra;
  result[name]=decoder.decode(bytes.subarray(offset,offset+size));
  pos=offset+size;
 }
 return result;
}
test("old six-field v1 JSON remains importable without fake defaults or changed grades",()=>{
 let old=freshCommittee();
 old=editScore(old,"final","lesson","g1",0);
 for(const key of Object.keys(old.meta))
  if(!["candidate","institution","rank","date","location","session"].includes(key))
   delete old.meta[key];
 const restored=restoreCommittee(old);
 assert.equal(restored.final.grading.scores.lesson.g1,0);
 assert.equal(restored.meta.member1Name,"");
 assert.equal(restored.meta.decision,"");
 assert.deepEqual(restoreCommittee(JSON.parse(stringifyCommittee(restored))),restored);
});
test("reference projection includes exact core source sections and manual decision",()=>{
 let s=freshCommittee();
 s=editMeta(s,"rank","أستاذ متخصص في التكوين والتعليم المهنيين من الرتبة الثانية");
 s=editMeta(s,"familyName","مثالي");
 s=editMeta(s,"givenName","تجريبي");
 s=editMeta(s,"candidate","مترشح اصطناعي");
 s=editMeta(s,"occupationalBranch","الكيمياء");
 s=editMeta(s,"member1Name","عضو اصطناعي");
 s=editScore(s,"final","lesson","g1",12);
 s=editScore(s,"final","discussion","d1",3);
 s=editNote(s,"final","general","صياغة المفتش التجريبية");
 const ref=buildReferenceDocuments(s);
 assert.equal(ref.specialistReferenceApplicable,true);
 assert.equal(ref.lessonRows.length,5);
 assert.equal(ref.lessonRows[0].cap,12);
 assert.equal(ref.lessonRows[0].score,12);
 assert.equal(ref.lessonRows[0].indicators.length,3);
 assert.equal(ref.discussionRows.length,7);
 assert.equal(ref.prose.general,"صياغة المفتش التجريبية");
 assert.equal(ref.decisionCode,"","15/60 must not imply an administrative decision");
 s=editMeta(s,"decision","first");
 assert.equal(buildReferenceDocuments(s).decision,"التأجيل الأول");
 assert.throws(()=>editMeta(s,"decision","auto-success"),/قرار لجنة/);
});
test("specialist reference is not falsely labeled as the official report for other ranks",()=>{
 const s=editMeta(freshCommittee(),"rank","أستاذ التكوين المهني");
 const d=buildReferenceDocuments(s);
 assert.equal(d.specialistReferenceApplicable,false);
 assert.match(d.referenceScopeWarning,/يلزم التحقق/);
});
test("14-indicator scores are grouped as five sums without changing the original rubric",()=>{
 let s=freshCommittee("unified","analytical14");
 s=applySuggestedWeights(s);s=finalizeWeights(s);
 // All 14 individual scores remain in the accepted engine.
 for(const [group,score] of [
  ["g1_1",2],["g1_2",3],["g1_3",4],
  ["g2_1",1],["g2_2",2],["g2_3",2],
  ["g3_1",1],["g3_2",1],["g3_3",1],["g3_4",1],
  ["g4_1",2],["g4_2",1],["g5_1",1],["g5_2",2]
 ])s=editScore(s,"final","lesson",group,score);
 const d=buildReferenceDocuments(s);
 assert.equal(d.lessonRows.length,5);
 assert.equal(d.lessonRows[0].score,9);
 assert.equal(d.lessonRows[1].score,5);
 assert.equal(d.lessonRows[2].score,4);
 assert.equal(d.lessonRows[3].score,3);
 assert.equal(d.lessonRows[4].score,3);
 assert.equal(s.final.grading.scores.lesson.g1_1,2);
});
test("individual member prose stays internal until actually authored by inspector",()=>{
 let s=changeMode(freshCommittee(),"individual");
 s=editScore(s,"member1","lesson","g1",2);
 s=editNote(s,"member1","general","مصدر العضو — لا يُنسب إلى رأي اللجنة");
 s=submit(s,"member1");
 const d=buildReferenceDocuments(s);
 assert.equal(d.prose.general,"");
 assert.equal(d.lessonRows[0].score,2);
 assert.match(d.scoreWarning,/اقتراحًا حسابيًا/);
 assert.match(d.textWarning,/للمراجعة/);
 assert.doesNotMatch(committeeDocumentXml(s),/مصدر العضو — لا يُنسب/);
 s=editNote(s,"final","general","خلاصة حررها المفتش");
 assert.match(committeeDocumentXml(s),/خلاصة حررها المفتش/);
});
test("two editable Word documents are contained in one offline OOXML file",()=>{
 let s=freshCommittee();
 s=editMeta(s,"candidate","مترشح افتراضي");
 s=editMeta(s,"decision","success");
 s=editNote(s,"final","general","تقدير متاح للتعديل في Word");
 const bytes=createCommitteeDocx(s);
 assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b);
 const files=storedFiles(bytes);
 assert.ok(files["word/document.xml"]);
 assert.ok(files["word/styles.xml"]);
 assert.ok(files["[Content_Types].xml"]);
 assert.match(files["word/document.xml"],/محضر التفتيش قصد الترسيم/);
 assert.match(files["word/document.xml"],/الامتحان الأول: حصة تدريسية/);
 assert.match(files["word/document.xml"],/تقدير متاح للتعديل في Word/);
 assert.match(files["word/document.xml"],/مترشح افتراضي/);
 assert.match(files["word/document.xml"],/w:pageBreakBefore/);
 assert.match(files["word/document.xml"],/w:bidiVisual/);
 assert.match(files["word/document.xml"],/w:document>/);
 assert.match(files["word/document.xml"],/ناجح/);
 assert.doesNotMatch(files["word/document.xml"],/الاعتماد الإلكتروني|موافقة رقمية/);
 assert.equal(mark(null),"—");
});
test("DOCX rendering cannot change state, and blank remains distinct from zero",()=>{
 const s=freshCommittee();
 const before=JSON.stringify(s);
 const d=buildReferenceDocuments(s);
 assert.equal(d.marks.total60,null);
 assert.equal(d.marks.total20,null);
 assert.equal(mark(d.lessonRows[0].score),"—");
 createCommitteeDocx(s);
 assert.equal(JSON.stringify(s),before);
});
