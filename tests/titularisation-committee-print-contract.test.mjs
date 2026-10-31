import test from "node:test";
import assert from "node:assert/strict";
import {freshCommittee,editMeta,editScore,editNote,restoreCommittee,stringifyCommittee} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {buildReferenceDocuments} from "../prototypes/titularisation-committee/document-model.mjs";
import {createCommitteeDocx,committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";
import {dateInArabicWords,reportFooter,suggestedAppreciation,struckChoices} from "../prototypes/titularisation-committee/document-rules.mjs";
import {stringifyPortableCommittee,PORTABLE_CONTRACT_VERSION} from "../prototypes/titularisation-committee/document-export-contract.mjs";
const getFiles=bytes=>{
 const dec=new TextDecoder(),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let pos=0;const found={};
 while(pos+30<bytes.length&&v.getUint32(pos,true)===0x04034b50){
  const size=v.getUint32(pos+18,true),nl=v.getUint16(pos+26,true),el=v.getUint16(pos+28,true);
  const name=dec.decode(bytes.subarray(pos+30,pos+30+nl)),start=pos+30+nl+el;
  found[name]=dec.decode(bytes.subarray(start,start+size));pos=start+size;
 }
 return found;
};
test("date is written literally as requested and invalid days are not invented",()=>{
 assert.equal(dateInArabicWords("14 نوفمبر 2026"),"الرابع عشر من شهر نوفمبر سنة ألفين وستة وعشرين");
 assert.equal(dateInArabicWords("14/11/2026"),"الرابع عشر من شهر نوفمبر سنة ألفين وستة وعشرين");
 assert.equal(dateInArabicWords("22 أكتوبر 2026"),"الثاني والعشرون من شهر أكتوبر سنة ألفين وستة وعشرين");
 assert.equal(dateInArabicWords("18 نوفمبر 2026"),
  "الثامن عشر من شهر نوفمبر سنة ألفين وستة وعشرين");
 assert.equal(dateInArabicWords("01/01/2000"),"الأول من شهر جانفي سنة ألفين");
 assert.equal(dateInArabicWords("01/01/2011"),"الأول من شهر جانفي سنة ألفين وأحد عشر");
 assert.equal(dateInArabicWords("31/02/2026"),"31/02/2026");
});
test("appreciation ranges use the FINAL /20 result only and stay advisory",()=>{
 const checks=[[0,"ضعيف/غير مقبول"],[9.999,"ضعيف/غير مقبول"],
  [10,"مقبول"],[10.99,"مقبول"],[11,"حسن"],[12.99,"حسن"],
  [13,"جيد"],[14.99,"جيد"],[15,"جيد جدًّا"],[20,"جيد جدًّا"]];
 for(const [n,label] of checks)assert.equal(suggestedAppreciation(n),label);
 assert.equal(suggestedAppreciation(null),"");
 assert.equal(suggestedAppreciation(20.01),"");
 let s=freshCommittee();
 assert.equal(buildReferenceDocuments(s).displayedAppreciation,"");
 s=editScore(s,"final","lesson","g1",12);
 assert.equal(buildReferenceDocuments(s).displayedAppreciation,"","partial scores give no forced assessment");
 for(const [phase,keys,value] of [["lesson",["g2","g3","g4","g5"],6],
   ["discussion",["d1","d2","d3","d4","d5","d6","d7"],2]]){
  for(const id of keys)s=editScore(s,"final",phase,id,value);
 }
 assert.ok(buildReferenceDocuments(s).proposedAppreciation);
 const suggestion=buildReferenceDocuments(s).proposedAppreciation;
 s=editNote(s,"final","general","التقدير المكتوب بعد المداولة");
 assert.equal(buildReferenceDocuments(s).displayedAppreciation,"التقدير المكتوب بعد المداولة");
 assert.equal(buildReferenceDocuments(s).proposedAppreciation,suggestion);
});
test("report footer identifies only pages 1–5 with candidate, institution and month",()=>{
 const meta={candidate:"مترشح تجريبي",institution:"مؤسسة افتراضية",date:"14 نوفمبر 2026"};
 for(let page=1;page<=5;page++){
  const text=reportFooter(meta,page);
  assert.match(text,/مترشح تجريبي/);
  assert.match(text,/مؤسسة افتراضية/);
  assert.match(text,/نوفمبر 2026/);
  assert.ok(text.endsWith("الصفحة "+page+" من 5"));
 }
 assert.throws(()=>reportFooter(meta,6),/صفحة تقرير/);
});
test("decision alternatives are struck unless selected; no choice stays unstruck",()=>{
 const chosen=struckChoices("success");
 assert.equal(chosen.filter(x=>x.chosen).length,1);
 assert.equal(chosen.filter(x=>x.struck).length,2);
 assert.equal(struckChoices("").filter(x=>x.struck).length,0);
});
test("DOCX sections have five-page report footer and completely blank minutes footer",()=>{
 let s=freshCommittee();
 s=editMeta(s,"rank","أستاذ متخصص في التكوين والتعليم المهنيين");
 s=editMeta(s,"candidate","مترشح تجريبي");
 s=editMeta(s,"institution","مؤسسة افتراضية");
 s=editMeta(s,"date","14 نوفمبر 2026");
 s=editMeta(s,"location","مركز الامتحان");
 s=editMeta(s,"decision","success");
 const files=getFiles(createCommitteeDocx(s)),xml=files["word/document.xml"];
 assert.ok(files["word/_rels/document.xml.rels"]);
 assert.ok(files["word/footer1.xml"]);
 assert.ok(files["word/footer2.xml"]);
 assert.match(files["word/footer1.xml"],/مترشح تجريبي/);
 assert.match(files["word/footer1.xml"],/مؤسسة افتراضية/);
 assert.match(files["word/footer1.xml"],/PAGE/);
 assert.doesNotMatch(files["word/footer2.xml"],/تقرير عملية التفتيش/);
 assert.match(xml,/rIdReportFooter/);
 assert.match(xml,/rIdEmptyFooter/);
 assert.equal((xml.match(/<w:pageBreakBefore\/>/g)||[]).length,4);
 assert.equal((xml.match(/<w:gridSpan w:val="3"\/>/g)||[]).length,4);
 assert.match(xml,/<w:strike\/>/);
 assert.ok(xml.includes("الرابع عشر من شهر نوفمبر سنة ألفين وستة وعشرين"));
 assert.match(xml,/<w:jc w:val="end"\/>/);
});
test("portable JSON is self-describing and old v1 restoration remains intact",()=>{
 let s=freshCommittee();
 s=editMeta(s,"candidate","اسم اصطناعي");
 s=editMeta(s,"date","14 نوفمبر 2026");
 const before=stringifyCommittee(s);
 const exported=JSON.parse(stringifyPortableCommittee(s));
 assert.equal(exported.schema,s.schema);
 assert.equal(exported.documentContract.version,PORTABLE_CONTRACT_VERSION);
 assert.equal(exported.documentContract.template.reportPages,5);
 assert.equal(exported.documentContract.template.print.minutesHasFooter,false);
 assert.equal(exported.documentContract.outputData.candidate,"اسم اصطناعي");
 assert.equal(exported.documentContract.outputData.minutesDateInWords,
  "الرابع عشر من شهر نوفمبر سنة ألفين وستة وعشرين");
 assert.ok(exported.documentContract.template.printableSource?.includes("preview.mjs")||
  exported.documentContract.template.printableSource===undefined);
 assert.equal(stringifyCommittee(restoreCommittee(exported)),before,
  "portable extension must not corrupt the accepted old JSON importer");
 assert.equal(stringifyCommittee(s),before,"export is read-only");
});
