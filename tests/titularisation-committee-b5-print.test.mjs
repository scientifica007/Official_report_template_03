import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee,editMeta} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";
const root="prototypes/titularisation-committee/";
const css=readFileSync(root+"print-layout-b5.css","utf8");
const html=readFileSync(root+"index.html","utf8");
const preview=readFileSync(root+"preview.mjs","utf8");
test("print stylesheet isolated from accepted editor and explicitly included",()=>{
 assert.match(html,/print-layout-b5\.css" media="print"/);
 assert.match(css,/@media print/);
 assert.match(css,/@page\s*\{\s*size:A4 portrait;\s*margin:12mm 14mm/);
});
test("the printable page has a safety margin below A4 printable height",()=>{
 const height=Number(css.match(/height:(\d+)mm!important;min-height/)[1]);
 assert.ok(height>235 && height<273);
 assert.equal(height,252);
 assert.match(css,/break-after:page!important/);
 assert.match(css,/reference-minutes .reference-page[\s\S]*?break-after:auto!important/);
});
test("footer stays absolutely attached to page; minutes contain no printed footer",()=>{
 assert.match(css,/reference-report-footer\{[\s\S]*?position:absolute!important/);
 assert.match(css,/reference-minutes .reference-report-footer\{display:none!important/);
 assert.match(preview,/addReportFooters\(report,d\)/);
 assert.doesNotMatch(preview,/addReportFooters\(record,d\)/);
});
test("14pt Times New Roman and six-point spacing maintain differentiated cover headings",()=>{
 assert.match(css,/font-size:14pt!important/);
 assert.match(css,/margin-top:6pt!important;margin-bottom:6pt!important/);
 assert.match(css,/font-size:17pt!important/);
 assert.match(css,/font-size:23pt!important/);
 assert.match(css,/font-family:"Times New Roman","Liberation Serif"/);
});
test("candidate table and heading share a bottom anchored grouping",()=>{
 assert.match(preview,/const exam=node\("div","","reference-candidate-exam"\)/);
 assert.match(preview,/heading\(exam,"ظروف إجراء امتحان التثبيت"\)/);
 assert.match(preview,/table\(exam,\["البيان","المعلومة"\],d.examFields/);
 assert.match(css,/reference-candidate-exam\{margin-top:auto!important\}/);
});
test("Word stays independently editable with RTL Times New Roman and 14pt defaults",()=>{
 const s=editMeta(freshCommittee(),"date","14 نوفمبر 2026");
 const xml=committeeDocumentXml(s);
 assert.match(xml,/w:ascii="Times New Roman"/);
 assert.match(xml,/w:cs="Times New Roman"/);
 assert.match(xml,/<w:sz w:val="28"\/>/);
 assert.match(xml,/<w:spacing w:before="120" w:after="120"\/>/);
 assert.equal((xml.match(/<w:pageBreakBefore\/>/g)||[]).length,4);
 assert.match(xml,/w:bidi w:val="1"/);
});
