import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee,changeMode,editNote,editMeta} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {renderDocuments} from "../prototypes/titularisation-committee/preview.mjs";
import {committeeDocumentXml,createCommitteeDocx} from "../prototypes/titularisation-committee/docx-export.mjs";
import {estimateDocxReportPages} from "../prototypes/titularisation-committee/docx-pagination.mjs";
const root="prototypes/titularisation-committee/";
function unzipStored(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder();
 const files={};let at=0;
 while(at+30<bytes.length&&v.getUint32(at,true)===0x04034b50){
  const nl=v.getUint16(at+26,true),el=v.getUint16(at+28,true),size=v.getUint32(at+18,true);
  const name=decoder.decode(bytes.subarray(at+30,at+30+nl)),start=at+30+nl+el;
  files[name]=decoder.decode(bytes.subarray(start,start+size));at=start+size;
 }
 return files;
}
test("four independent PDF/DOCX controls and two separate document names",()=>{
 const html=readFileSync(root+"index.html","utf8");
 const app=readFileSync(root+"app.mjs","utf8");
 for(const id of ["print","docx","print-minutes","docx-minutes"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/choosePrintDocument\("report"\)/);
 assert.match(app,/choosePrintDocument\("minutes"\)/);
 assert.match(app,/createCommitteeDocx\(state,\{kind,reportPageCount\}\)/);
 assert.match(app,/titularisation-report-draft\.docx/);
 assert.match(app,/titularisation-minutes-draft\.docx/);
 assert.doesNotMatch(html,/طباعة مسودتي التقرير والمحضر/);
});
test("report DOCX has only report content and a report-only NUMPAGES footer",()=>{
 let s=freshCommittee();
 s=editMeta(s,"candidate","مترشح تجريبي");
 const files=unzipStored(createCommitteeDocx(s,{kind:"report",reportPageCount:7}));
 const body=files["word/document.xml"],foot=files["word/footer1.xml"];
 assert.match(body,/تقرير التفتيش قصد الترسيم/);
 assert.match(body,/خلاصة النتائج/);
 assert.doesNotMatch(body,/محضر التفتيش قصد الترسيم/);
 assert.match(body,/rIdReportFooter/);
 assert.doesNotMatch(body,/rIdEmptyFooter/);
 assert.match(foot,/ NUMPAGES /);
 assert.match(foot,/ PAGE /);
 assert.doesNotMatch(foot,/SECTIONPAGES|PAGEREF/);
 assert.match(foot,/مترشح تجريبي/);
 assert.match(foot,/w:dirty="true"/);
 assert.equal(files["word/footer2.xml"],undefined);
 assert.doesNotMatch(files["word/_rels/document.xml.rels"],/rIdEmptyFooter/);
});
test("minutes DOCX has only minutes, no report header, footer, or phantom report page",()=>{
 let s=freshCommittee();
 s=editMeta(s,"candidate","مترشح تجريبي");
 const files=unzipStored(createCommitteeDocx(s,{kind:"minutes"}));
 const body=files["word/document.xml"];
 assert.match(body,/محضر التفتيش قصد الترسيم/);
 assert.match(body,/نحن الموقعين أسفله/);
 assert.doesNotMatch(body,/خلاصة النتائج|تقرير التفتيش قصد الترسيم/);
 assert.doesNotMatch(body,/w:footerReference|w:pageBreakBefore/);
 assert.equal(files["word/footer1.xml"],undefined);
 assert.equal(files["word/footer2.xml"],undefined);
 assert.doesNotMatch(files["word/_rels/document.xml.rels"],/relationships\/footer/);
 assert.doesNotMatch(files["[Content_Types].xml"],/footer[12]\.xml/);
});
test("legacy combined DOCX remains unchanged for backward compatibility",()=>{
 const f=unzipStored(createCommitteeDocx(freshCommittee()));
 assert.match(f["word/document.xml"],/محضر التفتيش قصد الترسيم/);
 assert.match(f["word/document.xml"],/خلاصة النتائج/);
 assert.match(f["word/footer1.xml"],/ SECTIONPAGES /);
 assert.ok(f["word/footer2.xml"]);
 assert.throws(()=>committeeDocumentXml(freshCommittee(),{kind:"invalid"}),/غير صالح/);
 assert.throws(()=>createCommitteeDocx(freshCommittee(),{kind:"invalid"}),/غير صالح/);
});
class E{
 constructor(tag){this.tag=tag;this.textContent="";this.className="";this.children=[];}
 append(...elements){this.children.push(...elements)}
 replaceChildren(){this.children=[]}
}
globalThis.document={createElement:tag=>new E(tag)};
const walk=(root,filter)=>[...(filter(root)?[root]:[]),...root.children.flatMap(child=>walk(child,filter))];
test("no decorative placeholder dots are printed after an empty assessment",()=>{
 let s=freshCommittee();
 const rootNode=new E("main");
 renderDocuments(rootNode,s);
 const empty=walk(rootNode,e=>e.className.includes("reference-empty-appreciation"));
 assert.equal(empty.length,2);
 assert.ok(empty.every(e=>e.textContent==="التقدير:"));
 assert.ok(empty.every(e=>!e.textContent.includes("...")));
 s=editNote(s,"final","lessonSummary","تقدير اللجنة");
 renderDocuments(rootNode,s);
 assert.equal(walk(rootNode,e=>e.className.includes("reference-empty-appreciation")).length,1);
 assert.ok(walk(rootNode,e=>e.className==="paper-line").some(e=>e.children.some(c=>c.textContent==="تقدير اللجنة")));
});
test("PDF print scoping does not change accepted report footer or page numbering CSS",()=>{
 const css=readFileSync(root+"print-layout-b5.css","utf8");
 const preview=readFileSync(root+"preview.mjs","utf8");
 assert.match(css,/body\[data-print-target="report"\] #paper \.official-minutes/);
 assert.match(css,/body\[data-print-target="minutes"\] #paper \.official-report/);
 assert.match(css,/bottom:-23mm!important/);
 assert.match(css,/reference-minutes> \.reference-minutes-opening|reference-minutes>\.reference-minutes-opening/);
 assert.match(preview,/reference-minutes-opening/);
});
test("contribution stress still estimates only report pages, with separate minutes export",()=>{
 let s=changeMode(freshCommittee(),"individual");
 s=editNote(s,"final","lessonSummary","ملاحظة اللجنة");
 const count=estimateDocxReportPages(s);
 assert.ok(count>=5);
 const report=unzipStored(createCommitteeDocx(s,{kind:"report",reportPageCount:count}));
 const minutes=unzipStored(createCommitteeDocx(s,{kind:"minutes"}));
 assert.match(report["word/footer1.xml"],/NUMPAGES/);
 assert.doesNotMatch(minutes["word/document.xml"],/NUMPAGES/);
});
