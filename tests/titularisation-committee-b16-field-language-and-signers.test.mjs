import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee,editMeta,stringifyCommittee,restoreCommittee} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {minutesOpeningSegments,minutesOpeningText,LEGAL_REFERENCES} from "../prototypes/titularisation-committee/document-language.mjs";
import {buildReferenceDocuments} from "../prototypes/titularisation-committee/document-model.mjs";
import {renderDocuments} from "../prototypes/titularisation-committee/preview.mjs";
import {committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";
import {portableCommitteeObject} from "../prototypes/titularisation-committee/document-export-contract.mjs";
const prefix="prototypes/titularisation-committee/";
class Fake{
 constructor(tag){this.tag=tag;this.className="";this.textContent="";this.children=[]}
 append(...children){this.children.push(...children)}
 replaceChildren(){this.children=[]}
}
globalThis.document={createElement:tag=>new Fake(tag)};
const walk=(x,fn)=>[...(fn(x)?[x]:[]),...x.children.flatMap(y=>walk(y,fn))];
const words=x=>x.textContent+" "+x.children.map(words).join(" ");
const plainXml=xml=>xml.replace(/<[^>]+>/g,"");
function sample(){
 let s=freshCommittee();
 for(const [key,value] of [["candidate","مترشح تجريبي"],["birth","12/03/1981، تبسة"],
  ["birthDate","12/03/1981"],["birthPlace","تبسة"],
  ["location","مركز تجريبي"],["date","18 نوفمبر 2026"]])s=editMeta(s,key,value);
 return s;
}
test("B16: reports and minutes retain legal reference text but omit its former label",()=>{
 const s=sample(),root=new Fake("main");renderDocuments(root,s);
 const report=walk(root,x=>x.className.includes("reference-cover"))[0];
 const minutes=walk(root,x=>x.className.includes("reference-minutes-header"))[0];
 for(const section of [report,minutes]){
  assert.ok(words(section).includes(LEGAL_REFERENCES));
  assert.ok(!words(section).includes("المراجع:"));
 }
 for(const kind of ["report","minutes"]){
  const xml=plainXml(committeeDocumentXml(s,{kind}));
  assert.ok(xml.includes(LEGAL_REFERENCES));
  assert.ok(!xml.includes("المراجع:"));
 }
});
test("B16: shared opening renders ordinary text but the candidate alone is bold in PDF and Word",()=>{
 const s=sample(),d=buildReferenceDocuments(s);
 const seg=minutesOpeningSegments(d);
 assert.equal(seg.length,3);
 assert.deepEqual(seg.map(x=>x.bold),[false,true,false]);
 assert.equal(seg[1].text,"مترشح تجريبي");
 assert.match(minutesOpeningText(d),/المولد\(ة\) في: 12\/03\/1981 بـ: تبسة/);
 const root=new Fake("main");renderDocuments(root,s);
 const opening=walk(root,x=>x.className.includes("reference-minutes-opening"))[0];
 assert.deepEqual(opening.children.map(x=>x.tag),["span","strong","span"]);
 assert.ok(opening.children[0].textContent.includes("نحن الموقّعون أدناه"));
 assert.equal(opening.children[1].textContent,"مترشح تجريبي");
 const word=committeeDocumentXml(s,{kind:"minutes"});
 const runs=[...word.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map(x=>x[1]);
 const lead=runs.find(x=>x.includes("نحن الموقّعون أدناه"));
 const name=runs.find(x=>x.includes("مترشح تجريبي"));
 assert.ok(lead&&name);
 assert.doesNotMatch(lead,/<w:b\/>/);
 assert.match(name,/<w:b\/>/);
 assert.ok(plainXml(word).includes("المولد(ة) في: 12/03/1981 بـ: تبسة"));
});
test("B16/B17: legacy birth-date alias survives JSON, and old combined text is not guessed",()=>{
 const s=sample();
 assert.equal(s.meta.birthDate,"12/03/1981");
 assert.equal(s.meta.birthPlace,"تبسة");
 assert.equal(s.meta.birth,"12/03/1981، تبسة");
 const back=restoreCommittee(JSON.parse(stringifyCommittee(s)));
 assert.deepEqual(back,s);
 const p=portableCommitteeObject(s).documentContract.outputData;
 assert.equal(p.candidateBirthDate,s.meta.birthDate);
 assert.equal(p.candidateBirthPlace,s.meta.birthPlace);
 const old=JSON.parse(stringifyCommittee(freshCommittee()));
 old.meta.birth="تاريخ ومكان قديمان غير مفصولين";
 delete old.meta.birthDate;delete old.meta.birthPlace;
 const restored=restoreCommittee(old),projection=buildReferenceDocuments(restored);
 assert.equal(restored.meta.birth,old.meta.birth);
 assert.equal(projection.candidateBirthDate,"");
 assert.equal(projection.candidateBirthPlace,"");
 assert.ok(minutesOpeningText(projection).includes("المولد(ة) في: "));
 const schema=readFileSync(prefix+"committee-engine.mjs","utf8");
 assert.match(schema,/\["birth","تاريخ الميلاد"\]/);
 assert.match(schema,/\["birthPlace","مكان الميلاد"\]/);
});
test("B16: only final report page enlarges four committee labels",()=>{
 const css=readFileSync(prefix+"print-layout-b5.css","utf8");
 assert.match(css,/\.reference-results \.reference-three-signers \.reference-member-sign > strong/);
 assert.match(css,/\.reference-results \.reference-chair-sign > strong/);
 assert.match(css,/font-size:14pt!important/);
 const source=readFileSync(prefix+"docx-export.mjs","utf8");
 assert.match(source,/size:spacious&&fill\?32:28/);
 const r=new Fake("main");renderDocuments(r,sample());
 const results=walk(r,x=>x.className.includes("reference-results"))[0];
 const signerHeaders=walk(results,x=>x.tag==="strong"&&(
  ["العضو الأول","العضو الثاني","العضو الثالث","رئيس اللجنة (المفتش)"].includes(x.textContent)
 ));
 assert.equal(signerHeaders.length,4);
 for(const label of signerHeaders.map(x=>x.textContent))
  assert.ok(committeeDocumentXml(sample(),{kind:"report"}).includes(label));
});
test("B16: adopted footer, document decisions and scoring code are unchanged",()=>{
 const css=readFileSync(prefix+"print-layout-b5.css","utf8");
 assert.match(css,/bottom:-26mm!important/);
 const source=readFileSync(prefix+"document-language.mjs","utf8");
 assert.match(source,/أسفرت مداولات لجنة الامتحان عن النتائج الآتية/);
 const root=new Fake("main");renderDocuments(root,sample());
 assert.equal(walk(root,x=>x.className.includes("reference-report-footer")).length,5);
 const minutes=walk(root,x=>x.className==="reference-page reference-minutes")[0];
 assert.equal(walk(minutes,x=>x.className.includes("reference-report-footer")).length,0);
});
