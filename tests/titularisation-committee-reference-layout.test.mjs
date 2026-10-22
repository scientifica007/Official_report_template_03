import test from "node:test";
import assert from "node:assert/strict";
import {
 freshCommittee,changeMode,editMeta,editScore,editNote,submit,
 applySuggestedWeights,finalizeWeights,restoreCommittee,stringifyCommittee
} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {committeeDocumentXml,createCommitteeDocx} from "../prototypes/titularisation-committee/docx-export.mjs";
import {buildReferenceDocuments} from "../prototypes/titularisation-committee/document-model.mjs";
class MockElement {
 constructor(tag){this.tag=tag;this.textContent="";this.children=[];this.value="";this.className="";this.handlers={}}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(){this.children=[]}
 addEventListener(name,callback){this.handlers[name]=callback}
 setAttribute(name,value){this[name]=value}
}
globalThis.document={createElement:tag=>new MockElement(tag)};
const {renderDocuments}=await import("../prototypes/titularisation-committee/preview.mjs");
const collect=(el,tag)=>[...(el.tag===tag?[el]:[]),...el.children.flatMap(child=>collect(child,tag))];
const words=el=>[el.textContent,...el.children.map(words)].join(" ");

test("P4-B3 print has six logical source sections: five report, one minutes",()=>{
 let s=freshCommittee();
 s=editMeta(s,"rank","أستاذ متخصص في التكوين والتعليم المهنيين من الرتبة الثانية");
 s=editMeta(s,"candidate","مترشح اصطناعي");
 const view=new MockElement("div");
 renderDocuments(view,s);
 const papers=collect(view,"article");
 assert.equal(papers.length,2,"report and minutes stay separate");
 const pages=collect(view,"section").filter(x=>x.className.includes("reference-page"));
 assert.equal(pages.length,6);
 assert.deepEqual(pages.map(x=>x.className.split(" ").at(-1)),[
  "reference-cover","reference-candidate","reference-lesson",
  "reference-discussion","reference-results","reference-minutes"]);
 const snapshot=words(view);
 for(const h of ["تقرير التفتيش قصد الترسيم","معلومات تتعلق بالأستاذ(ة) المترشح(ة)",
  "الامتحان الأول: حصة تدريسية","الامتحان الثاني: المناقشة",
  "خلاصة النتائج","محضر التفتيش قصد الترسيم","إمضاءات أعضاء اللجنة"]){
  assert.ok(snapshot.includes(h),"missing section "+h);
 }
});
test("Word has five explicit section starts and source-like 4-column lesson tables",()=>{
 let s=freshCommittee();
 s=editMeta(s,"rank","أستاذ متخصص في التكوين والتعليم المهنيين من الرتبة الثانية");
 const xml=committeeDocumentXml(s);
 assert.equal((xml.match(/<w:pageBreakBefore\/>/g)||[]).length,5);
 assert.equal((xml.match(/<w:bidiVisual w:val="1"\/>/g)||[]).length>=5,true);
 for(const required of ["تقرير التفتيش قصد الترسيم","معايير ومؤشرات التقدير",
  "النقطة الجزئية -1-","العلامة النهائية","قرار أعضاء اللجنة",
  "التأجيل الأول","التأجيل الثاني","محضر التفتيش قصد الترسيم"]){
  assert.ok(xml.includes(required),required);
 }
 assert.match(xml,/<w:tblGrid><w:gridCol w:w="650"\/><w:gridCol w:w="6350"\/>/);
 assert.match(xml,/<w:rtl w:val="0"\/>/,"Latin numbers remain LTR");
});
test("paper decisions remain authored, without locks or inferred outcomes",()=>{
 let s=freshCommittee();
 s=editMeta(s,"candidate","مترشح اصطناعي");
 s=editScore(s,"final","lesson","g1",12);
 const noDecision=committeeDocumentXml(s);
 assert.match(noDecision,/☐/);
 assert.doesNotMatch(noDecision,/☑/);
 s=editMeta(s,"decision","first");
 assert.equal(buildReferenceDocuments(s).decisionCode,"first");
 assert.match(committeeDocumentXml(s),/☑/);
 s=editMeta(s,"decision","success");
 assert.equal(buildReferenceDocuments(s).decisionCode,"success");
 const before=JSON.stringify(s);
 createCommitteeDocx(s);
 assert.equal(JSON.stringify(s),before);
 s=editScore(s,"final","lesson","g1",3);
 assert.equal(buildReferenceDocuments(s).lessonRows[0].score,3);
 assert.deepEqual(restoreCommittee(JSON.parse(stringifyCommittee(s))),s);
});
test("no member source prose is represented as final committee prose on paper",()=>{
 let s=changeMode(freshCommittee(),"individual");
 s=editNote(s,"member1","general","نص أصلي غير معتمد آليًا");
 s=editScore(s,"member1","lesson","g1",2);
 s=submit(s,"member1");
 const xml=committeeDocumentXml(s);
 assert.doesNotMatch(xml,/نص أصلي غير معتمد آليًا/);
 assert.equal(buildReferenceDocuments(s).prose.general,"");
 s=editNote(s,"final","general","خلاصة يحررها المفتش");
 assert.match(committeeDocumentXml(s),/خلاصة يحررها المفتش/);
});
test("reference sections can reflect the accepted 14-indicator and 10-item schemes",()=>{
 let a=freshCommittee("unified","analytical14");
 a=applySuggestedWeights(a);a=finalizeWeights(a);
 const av=new MockElement("div");renderDocuments(av,a);
 assert.equal(collect(av,"section").filter(x=>x.className.includes("reference-page")).length,6);
 assert.equal(buildReferenceDocuments(a).lessonRows.length,5);
 const b=freshCommittee("unified","inspector10");
 assert.equal(buildReferenceDocuments(b).lessonRows.length,10);
 const out=committeeDocumentXml(b);
 assert.match(out,/شبكة عمل غير مثبت اعتمادها رسميًا/);
});
