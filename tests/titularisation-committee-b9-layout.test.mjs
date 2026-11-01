import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee,editMeta,changeMode,fillDemoMember,submit} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {estimateDocxReportPages} from "../prototypes/titularisation-committee/docx-pagination.mjs";
import {committeeDocumentXml,createCommitteeDocx} from "../prototypes/titularisation-committee/docx-export.mjs";
import {renderDocuments} from "../prototypes/titularisation-committee/preview.mjs";
class El{
 constructor(tag){this.tag=tag;this.children=[];this.className="";this.textContent="";}
 append(...items){this.children.push(...items)}
 replaceChildren(){this.children=[]}
}
globalThis.document={createElement:tag=>new El(tag)};
function all(e,tag){return (e.tag===tag?[e]:[]).concat(e.children.flatMap(child=>all(child,tag)));}
function words(e){return (e.textContent||"")+" "+e.children.map(words).join(" ");}
const unpack=bytes=>{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decode=new TextDecoder();
 const files={};let at=0;
 while(at+30<bytes.length&&view.getUint32(at,true)===0x04034b50){
  const nl=view.getUint16(at+26,true),el=view.getUint16(at+28,true),size=view.getUint32(at+18,true);
  const name=decode.decode(bytes.subarray(at+30,at+30+nl)),start=at+30+nl+el;
  files[name]=decode.decode(bytes.subarray(start,start+size));at=start+size;
 }
 return files;
};
test("candidate examination table in PDF contains only five label-value rows, without a heading row",()=>{
 let s=freshCommittee();
 s=editMeta(s,"occupationalBranch","الصيانة الصناعية");
 const root=new El("main");renderDocuments(root,s);
 const candidate=all(root,"section").find(x=>x.className.includes("reference-candidate"));
 const exam=all(candidate,"table").find(x=>x.className.includes("reference-exam-info"));
 assert.ok(exam);
 assert.equal(all(exam,"thead").length,0);
 assert.equal(all(exam,"tr").length,5);
 assert.equal(all(exam,"td").length,10);
 assert.doesNotMatch(words(exam),/البيان|المعلومة/);
 assert.match(words(exam),/الصيانة الصناعية/);
});
test("Word candidate key-value table has no header row and does not bold values including first data row",()=>{
 let s=freshCommittee();s=editMeta(s,"occupationalBranch","الصيانة الصناعية");
 s=editMeta(s,"examSpecialty","هندسة الميكانيك");
 const xml=committeeDocumentXml(s);
 const start=xml.indexOf("ظروف إجراء امتحان التثبيت");
 const end=xml.indexOf("إجراء الامتحان",start);
 assert.ok(start>=0&&end>start);
 const part=xml.slice(start,end);
 const first=part.indexOf("<w:tbl>"),last=part.indexOf("</w:tbl>",first);
 const table=part.slice(first,last+8);
 assert.equal((table.match(/<w:tr>/g)||[]).length,5);
 assert.doesNotMatch(table,/البيان|المعلومة/);
 const firstRow=table.slice(table.indexOf("<w:tr>"),table.indexOf("</w:tr>")+7);
 const cells=firstRow.split("<w:tc>").slice(1);
 assert.equal(cells.length,2);
 assert.match(cells[0],/<w:b\/>/);
 assert.doesNotMatch(cells[1],/<w:b\/>/);
 assert.match(cells[1],/الصيانة الصناعية/);
});
test("Word folio denominator is section-specific and does not use NUMPAGES or unsupported PAGEREF",()=>{
 const f=unpack(createCommitteeDocx(freshCommittee(),{reportPageCount:8}));
 assert.match(f["word/footer1.xml"],/SECTIONPAGES/);
 assert.match(f["word/footer1.xml"],/w:dirty="true"/);
 assert.doesNotMatch(f["word/footer1.xml"],/PAGEREF|NUMPAGES/);
 assert.match(f["word/footer1.xml"],/ PAGE /);
 assert.match(f["word/document.xml"],/rIdReportFooter/);
 assert.match(f["word/document.xml"],/rIdEmptyFooter/);
 assert.doesNotMatch(f["word/footer2.xml"],/SECTIONPAGES|تقرير عملية/);
});
test("PDF redistributes only results-page flow without altering accepted footer location",()=>{
 const css=readFileSync("prototypes/titularisation-committee/print-layout-b5.css","utf8");
 assert.match(css,/reference-results\{/);
 assert.match(css,/flex-direction:column!important/);
 assert.match(css,/justify-content:space-between!important/);
 assert.match(css,/bottom:-28mm!important/);
});
test("Word candidate/results line spacing is expanded conservatively and minutes opening has a separate top gap",()=>{
 const xml=committeeDocumentXml(freshCommittee());
 assert.match(xml,/<w:trHeight w:val="620" w:hRule="atLeast"\/>/);
 assert.match(xml,/<w:trHeight w:val="1400" w:hRule="atLeast"\/>/);
 assert.match(xml,/<w:spacing w:before="950" w:after="130"\/>/);
});

test("Word estimate uses its own report structure and excludes the independent minutes",()=>{
 let s=freshCommittee();
 assert.equal(estimateDocxReportPages(s),5);
 s=changeMode(s,"individual");
 for(const seat of ["chair","member1","member2","member3"]){
  s=fillDemoMember(s,seat);
  s=submit(s,seat);
 }
 assert.equal(estimateDocxReportPages(s),7);
 const zip=unpack(createCommitteeDocx(s,{reportPageCount:estimateDocxReportPages(s)}));
 assert.match(zip["word/footer1.xml"],/ SECTIONPAGES /);
 assert.match(zip["word/footer1.xml"],/<w:t xml:space="preserve">7<\/w:t>/);
});
