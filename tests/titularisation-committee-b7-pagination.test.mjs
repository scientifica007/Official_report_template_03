import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee,changeMode,editMeta,editNote,submit,stringifyCommittee} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {buildReferenceDocuments,printableAssessmentText} from "../prototypes/titularisation-committee/document-model.mjs";
import {reportFooter} from "../prototypes/titularisation-committee/document-rules.mjs";
import {createCommitteeDocx,committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";
const files=bytes=>{
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),dec=new TextDecoder();
 const out={};let p=0;
 while(p+30<bytes.length&&v.getUint32(p,true)===0x04034b50){
  const nameLen=v.getUint16(p+26,true),extra=v.getUint16(p+28,true),size=v.getUint32(p+18,true);
  const name=dec.decode(bytes.subarray(p+30,p+30+nameLen)),start=p+30+nameLen+extra;
  out[name]=dec.decode(bytes.subarray(start,start+size));p=start+size;
 }
 return out;
};
test("footer reflects actual report page count without counting separate minutes",()=>{
 const m={candidate:"مترشح تجريبي",institution:"معهد افتراضي",date:"14 نوفمبر 2026"};
 assert.match(reportFooter(m,1),/الصفحة 1 من 5$/);
 assert.match(reportFooter(m,6,7),/الصفحة 6 من 7$/);
 assert.match(reportFooter(m,7,7),/الصفحة 7 من 7$/);
 assert.throws(()=>reportFooter(m,8,7),/صفحة تقرير/);
 assert.throws(()=>reportFooter(m,6),/صفحة تقرير/);
});
test("Word uses PAGE and PAGEREF of last report sheet, with field refresh on opening",()=>{
 const f=files(createCommitteeDocx(freshCommittee()));
 assert.match(f["word/document.xml"],/w:bookmarkStart w:id="31" w:name="ReportLastPage"/);
 assert.match(f["word/footer1.xml"],/ PAGEREF ReportLastPage /);
 assert.match(f["word/footer1.xml"],/ PAGE /);
 assert.doesNotMatch(f["word/footer1.xml"],/SECTIONPAGES|NUMPAGES/);
 assert.match(f["word/settings.xml"],/updateFields w:val="true"/);
 assert.doesNotMatch(f["word/footer2.xml"],/تقرير عملية/);
});
test("collective print strips system-applied writer labels, not original contribution records",()=>{
 let s=changeMode(freshCommittee(),"individual");
 s=editMeta(s,"member1Name","اسم المساهم");
 s=editNote(s,"member1","lesson","ملاحظة بيداغوجية مكتوبة","g1");
 s=submit(s,"member1");
 const original=stringifyCommittee(s);
 const data=buildReferenceDocuments(s);
 assert.equal(data.memberObservations.lesson[0].author.includes("اسم المساهم"),true);
 const out=committeeDocumentXml(s);
 assert.match(out,/ملاحظة بيداغوجية مكتوبة/);
 assert.doesNotMatch(out,/العضو الأول — اسم المساهم — التنشيط/);
 assert.equal(stringifyCommittee(s),original);
});
test("only artificial test labels embedded in demonstration notes are removed in document display",()=>{
 assert.equal(printableAssessmentText("بيانات تجريبية — العضو الأول — التنشيط: تقييم عملي"),"تقييم عملي");
 assert.equal(printableAssessmentText("تقييم عملي"),"تقييم عملي");
});
test("PDF paginator splits lesson/discussion prose before numbering, with bottom footer and independent minutes",()=>{
 const base="prototypes/titularisation-committee/";
 const paginate=readFileSync(base+"print-pagination.mjs","utf8");
 const css=readFileSync(base+"print-layout-b5.css","utf8");
 const app=readFileSync(base+"app.mjs","utf8");
 assert.match(paginate,/splitAssessment\(report\.querySelector\("\.reference-lesson"\)/);
 assert.match(paginate,/splitAssessment\(report\.querySelector\("\.reference-discussion"\)/);
 assert.match(paginate,/pageFooter\(page,d,i\+1,pages\.length\)/);
 assert.match(css,/bottom:-18mm!important/);
 assert.match(css,/#paper > \.screen-only\{display:none!important\}/);
 assert.match(css,/#paper \.reference-minutes\{/);
 assert.match(app,/preparePrintPagination\(\$\("paper"\),state\)/);
});
