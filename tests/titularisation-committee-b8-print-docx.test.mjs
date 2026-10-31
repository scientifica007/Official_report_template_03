import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee,editMeta} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {createCommitteeDocx,committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";
import {printableAssessmentText} from "../prototypes/titularisation-committee/document-model.mjs";
const root="prototypes/titularisation-committee/";
const files=bytes=>{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decode=new TextDecoder();
 let at=0;const out={};
 while(at+30<bytes.length&&view.getUint32(at,true)===0x04034b50){
  const count=view.getUint16(at+26,true),extra=view.getUint16(at+28,true),size=view.getUint32(at+18,true);
  const name=decode.decode(bytes.subarray(at+30,at+30+count)),start=at+30+count+extra;
  out[name]=decode.decode(bytes.subarray(start,start+size));at=start+size;
 }
 return out;
};
test("cover and minutes omit the two unwanted printed disclaimers",()=>{
 const xml=committeeDocumentXml(freshCommittee());
 assert.doesNotMatch(xml,/نسخة عمل قابلة للتحرير مستندة إلى نموذج مرجعي/);
 const src=readFileSync(root+"preview.mjs","utf8");
 assert.doesNotMatch(src,/معاينة تجريبية غير مطابقة بعد للقالب الرسمي/);
 assert.doesNotMatch(src,/مسودة للطباعة والإمضاء الورقي، وليست إقرارًا إلكترونيًا/);
});
test("Google Docs footer uses stable export-time denominator and a native PAGE field",()=>{
 const s=freshCommittee();
 for(const total of [5,7,12]){
  const zip=files(createCommitteeDocx(s,{reportPageCount:total}));
  const footer=zip["word/footer1.xml"];
  const visible=[...footer.matchAll(/<w:t(?: xml:space="preserve")?>([^<]*)<\/w:t>/g)]
   .map(m=>m[1]).join("");
  assert.ok(visible.endsWith(" من "+total),visible);
  assert.match(footer,/ PAGE /);
  assert.doesNotMatch(footer,/PAGEREF|SECTIONPAGES|NUMPAGES|ReportLastPage/);
  assert.match(zip["word/settings.xml"],/updateFields/);
 }
 assert.throws(()=>createCommitteeDocx(s,{reportPageCount:4}),/عدد صفحات/);
});
test("Word typography respects 16-point headings, 14-point paragraphs and original decision",()=>{
 const doc=committeeDocumentXml(freshCommittee());
 for(const heading of ["معلومات تتعلق بالأستاذ","إجراء الامتحان","الامتحان الثاني: المناقشة",
  "خلاصة النتائج","محضر التفتيش قصد الترسيم"]){
  assert.ok(doc.includes(heading),heading);
 }
 assert.match(doc,/<w:sz w:val="32"\/>/);
 assert.match(doc,/<w:sz w:val="28"\/>/);
 assert.match(doc,/<w:spacing w:before="120" w:after="120"\/>/);
 assert.match(doc,/<w:jc w:val="end"\/>/);
 assert.match(doc,/<w:shd w:val="clear" w:color="auto" w:fill="E4E7E3"\/>/);
 assert.match(doc,/<w:b\/>/);
});
test("only automatically generated chair-label prefixes are excluded from collective assessments",()=>{
 assert.equal(printableAssessmentText("بيانات تجريبية — رئيس اللجنة (المفتش) — التنشيط: ملاحظة مناسبة"),
 "ملاحظة مناسبة");
 assert.equal(printableAssessmentText("بيانات تجريبية — رئيس اللجنة (المفتش): وصف تطبيقي"),"وصف تطبيقي");
 assert.equal(printableAssessmentText("رئيس اللجنة ناقش إجراءات السلامة بنفسه"),
 "رئيس اللجنة ناقش إجراءات السلامة بنفسه");
});
test("PDF footer is lowered within A4 printable area; colored total rows and minutes spacing are scoped to print",()=>{
 const css=readFileSync(root+"print-layout-b5.css","utf8");
 assert.match(css,/@page \{size:A4 portrait;margin:12mm 14mm 5mm\}/);
 assert.match(css,/bottom:-23mm!important/);
 assert.match(css,/tr\.official-total-row/);
 assert.match(css,/font-weight:700!important/);
 assert.match(css,/reference-minutes\{[\s\S]*?justify-content:space-between!important/);
 const preview=readFileSync(root+"preview.mjs","utf8");
 assert.match(preview,/reference-minutes-date-left/);
 assert.match(preview,/official-total-row/);
 assert.doesNotMatch(preview,/textLine\(pg,"حُرّر في:"/);
 const app=readFileSync(root+"app.mjs","utf8");
 assert.match(app,/createCommitteeDocx\(state,\{reportPageCount\}\)/);
});
