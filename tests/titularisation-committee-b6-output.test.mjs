import test from "node:test";
import assert from "node:assert/strict";
import {
 freshCommittee,changeMode,editNote,editMeta,editScore,submit,
 stringifyCommittee,restoreCommittee
} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {buildReferenceDocuments,mark} from "../prototypes/titularisation-committee/document-model.mjs";
import {committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";
import {stringifyPortableCommittee} from "../prototypes/titularisation-committee/document-export-contract.mjs";

test("all printed scores use two decimals and zero-padded integer part, blanks remain blank",()=>{
 for(const [v,display] of [[0,"00.00"],[1.5,"01.50"],[3,"03.00"],[12.8333333,"12.83"],[20,"20.00"],[40,"40.00"]])
  assert.equal(mark(v),display);
 assert.equal(mark(null),"—");
 assert.equal(mark(undefined),"—");
 const s=editScore(freshCommittee(),"final","lesson","g1",0);
 assert.equal(buildReferenceDocuments(s).lessonRows[0].score,0);
 assert.equal(mark(buildReferenceDocuments(s).lessonRows[0].score),"00.00");
});
test("unsubmitted notes are not printed; member originals have author, criterion and original text",()=>{
 let s=changeMode(freshCommittee(),"individual");
 s=editMeta(s,"member1Name","عضو اصطناعي");
 s=editNote(s,"member1","lesson","ملاحظة أصلية خاصة بالتنشيط","g1");
 s=editNote(s,"member1","lessonSummary","ملاحظة ختامية أصلية");
 s=editNote(s,"member2","lesson","مسودة خاصة لم تُرسل","g1");
 assert.equal(buildReferenceDocuments(s).memberObservations.lesson.length,0);
 s=submit(s,"member1");
 const d=buildReferenceDocuments(s);
 assert.equal(d.memberObservations.lesson.length,2);
 assert.ok(d.memberObservations.lesson.some(x=>x.criterion==="التنشيط"&&x.text==="ملاحظة أصلية خاصة بالتنشيط"));
 assert.ok(d.memberObservations.lesson.every(x=>x.author.includes("العضو الأول")));
 assert.ok(!d.memberObservations.lesson.some(x=>x.text.includes("لم تُرسل")));
 assert.match(committeeDocumentXml(s),/ملاحظة أصلية خاصة بالتنشيط/);
 assert.doesNotMatch(committeeDocumentXml(s),/مسودة خاصة لم تُرسل/);
 assert.equal(s.final.notes.lessonSummary,"","member notes never modify inspector prose");
 const portable=JSON.parse(stringifyPortableCommittee(s));
 assert.equal(portable.documentContract.outputData.originalSubmittedMemberObservations.lesson.length,2);
 assert.deepEqual(restoreCommittee(JSON.parse(stringifyCommittee(s))),s);
});
test("Word outputs no partial-grade rows or rubric label and uses distinct strike cells",()=>{
 let s=freshCommittee();
 s=editMeta(s,"decision","success");
 const xml=committeeDocumentXml(s);
 assert.doesNotMatch(xml,/النقطة الجزئية|الشبكة المستخدمة:|تقدير مقترح قابل للتغيير/);
 assert.doesNotMatch(xml,/للأساتذة المتخصصين لإعادة التكييف/);
 assert.match(xml,/والأساتذة المتخصصين في التكوين والتعليم المهنيين لإعادة التكييف/);
 assert.ok((xml.match(/<w:strike\/>/g)||[]).length>=2);
 assert.match(xml,/<w:jc w:val="center"\/>/);
 assert.match(xml,/الختم والتوقيع:/);
 const ctrs=[...xml.matchAll(/<w:jc w:val="center"\/>/g)].length;
 assert.ok(ctrs>15,"numeric cells and headers should use centered paragraphs");
 assert.match(xml,/<w:tblBorders><w:top w:val="nil"\/>/);
});
