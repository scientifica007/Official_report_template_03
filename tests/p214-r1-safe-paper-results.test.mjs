import test from "node:test";
import assert from "node:assert/strict";
import {
 freshCommittee,changeMode,editScore,editNote,editMeta,submit,
 applySuggestedWeights,finalizeWeights,stringifyCommittee,restoreCommittee
} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {buildReferenceDocuments} from "../prototypes/titularisation-committee/document-model.mjs";
import {committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";
import {renderDocuments} from "../prototypes/titularisation-committee/preview.mjs";
import {DISCUSSION,lessonItems} from "../prototypes/titularisation-workbench/engine.mjs";

class FakeElement {
 constructor(tag){this.tag=tag;this.className="";this.textContent="";this.children=[]}
 append(...items){this.children.push(...items)}
 replaceChildren(){this.children=[]}
}
globalThis.document={createElement:tag=>new FakeElement(tag)};
const fullText=node=>node.textContent+" "+node.children.map(fullText).join(" ");
const find=(node,check)=>[...(check(node)?[node]:[]),...node.children.flatMap(x=>find(x,check))];

function partialCommittee(){
 let s=freshCommittee("individual","analytical14");
 s=applySuggestedWeights(s);s=finalizeWeights(s);
 for(const [id,text,score] of [
  ["member1","الملاحظة الأصلية الأولى",3],
  ["member2","الملاحظة الأصلية الثانية",2.5],
  ["member3","الملاحظة الأصلية الثالثة",2.5]
 ]){
  s=editScore(s,id,"lesson","g1_1",score);
  s=editNote(s,id,"lesson",text,"g1_1");
  s=submit(s,id);
 }
 s=editScore(s,"final","lesson","g1_1",2);
 s=editNote(s,"final","lesson","الصياغة المهنية المحررة للمفتش","g1_1");
 return s;
}
test("P2-14-R1: author's edited indicator note appears in PDF and DOCX alongside separately attributed originals",()=>{
 const s=partialCommittee(),before=JSON.stringify(s);
 const d=buildReferenceDocuments(s);
 assert.match(d.prose.lesson,/الصياغة المهنية المحررة للمفتش/);
 assert.equal(d.memberObservations.lesson.length,3);
 for(const original of ["الملاحظة الأصلية الأولى","الملاحظة الأصلية الثانية","الملاحظة الأصلية الثالثة"]){
  assert.ok(d.memberObservations.lesson.some(x=>x.text===original));
 }
 const root=new FakeElement("main");renderDocuments(root,s);
 const report=find(root,x=>x.className.includes("reference-lesson"))[0];
 const pdfText=fullText(report);
 assert.match(pdfText,/الصياغة المهنية المحررة للمفتش/);
 assert.match(pdfText,/ملاحظات الأعضاء الأصلية/);
 assert.match(pdfText,/الملاحظة الأصلية/);
 const docx=committeeDocumentXml(s,{kind:"report"});
 assert.match(docx,/الصياغة المهنية المحررة للمفتش/);
 assert.match(docx,/ملاحظات الأعضاء الأصلية/);
 assert.match(docx,/الملاحظة الأصلية الثالثة/);
 assert.equal(JSON.stringify(s),before,"rendering does not alter original member grades/notes");
 assert.deepEqual(restoreCommittee(JSON.parse(stringifyCommittee(s))),s);
});
test("P2-14-R1: unfinished assessment must not print derived averages as committee final marks or appreciation",()=>{
 const s=partialCommittee(),d=buildReferenceDocuments(s);
 assert.equal(d.lessonRows[0].score,null);
 assert.equal(d.discussionRows[0].score,null);
 assert.equal(d.marks.lesson,null);
 assert.equal(d.marks.discussion,null);
 assert.equal(d.marks.total60,null);
 assert.equal(d.marks.total20,null);
 assert.equal(d.displayedAppreciation,"");
 assert.equal(d.resultsReady,false);
 assert.match(d.draftResultsWarning,/غير مكتملة/);
 assert.match(d.minutesResultsIntro,/أسفرت مداولات/);
 const root=new FakeElement("main");renderDocuments(root,s);
 const printed=fullText(root);
 assert.match(printed,/مسودة مداولة غير مكتملة/);
 assert.match(printed,/تنبيه:/);
 const report=committeeDocumentXml(s,{kind:"report"});
 const minutes=committeeDocumentXml(s,{kind:"minutes"});
 assert.match(report,/مسودة مداولة غير مكتملة/);
 assert.match(minutes,/أسفرت مداولات/);
 assert.match(minutes,/مسودة مداولة غير مكتملة/);
 assert.doesNotMatch(minutes,/12\\.00\/20/);
});
test("P2-14-R1: fully authored grades without decision remain provisional",()=>{
 let s=freshCommittee("unified","analytical14");
 s=applySuggestedWeights(s);s=finalizeWeights(s);
 for(const item of lessonItems(s.final.grading))if(item.cap>0)s=editScore(s,"final","lesson",item.id,item.cap);
 for(const item of DISCUSSION)s=editScore(s,"final","discussion",item.id,item.cap);
 const before=buildReferenceDocuments(s);
 assert.equal(before.marks.lesson,40);
 assert.equal(before.marks.discussion,20);
 assert.equal(before.marks.total60,60);
 assert.equal(before.marks.total20,null);
 assert.equal(before.displayedAppreciation,"");
 assert.equal(before.resultsReady,false);
 assert.match(before.draftResultsWarning,/قرار اللجنة/);
 s=editMeta(s,"decision","success");
 const approvedForPaper=buildReferenceDocuments(s);
 assert.equal(approvedForPaper.marks.total20,20);
 assert.equal(approvedForPaper.displayedAppreciation,"جيد جدًّا");
 assert.equal(approvedForPaper.resultsReady,true);
 assert.match(approvedForPaper.minutesResultsIntro,/أسفرت مداولات/);
});
test("P2-14-R1: explicit zero is not treated as missing, and human prose is not erased",()=>{
 let s=freshCommittee("unified","analytical14");
 s=applySuggestedWeights(s);s=finalizeWeights(s);
 for(const item of lessonItems(s.final.grading))if(item.cap>0)s=editScore(s,"final","lesson",item.id,0);
 for(const item of DISCUSSION)s=editScore(s,"final","discussion",item.id,0);
 s=editMeta(s,"decision","first");
 s=editNote(s,"final","general","خلاصة كتبها المفتش بنفسه");
 const d=buildReferenceDocuments(s);
 assert.equal(d.marks.total60,0);
 assert.equal(d.marks.total20,0);
 assert.equal(d.displayedAppreciation,"خلاصة كتبها المفتش بنفسه");
 assert.equal(d.appreciationIsSuggestion,false);
});
