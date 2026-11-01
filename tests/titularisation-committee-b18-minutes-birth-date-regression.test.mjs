import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 freshCommittee,editMeta,restoreCommittee,stringifyCommittee
} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {buildReferenceDocuments} from "../prototypes/titularisation-committee/document-model.mjs";
import {minutesOpeningText,minutesOpeningSegments} from "../prototypes/titularisation-committee/document-language.mjs";
import {renderDocuments} from "../prototypes/titularisation-committee/preview.mjs";
import {committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";

class Fake {
 constructor(tag){this.tag=tag;this.textContent="";this.className="";this.children=[];}
 append(...children){this.children.push(...children);}
 replaceChildren(){this.children=[];}
}
globalThis.document={createElement:tag=>new Fake(tag)};
const walk=(node,fn)=>[...(fn(node)?[node]:[]),...node.children.flatMap(x=>walk(x,fn))];
const textOf=x=>(x.textContent||"")+x.children.map(textOf).join("");
const plainXml=x=>x.replace(/<[^>]*>/g,"");
const line="المولد(ة) في: 13 فيفري 1990 بـ: عنابة";

test("B18: user screenshot reproduction: existing visible date and place, hidden B16 alias blank",()=>{
 const raw=JSON.parse(stringifyCommittee(freshCommittee()));
 raw.meta.birth="13 فيفري 1990";
 raw.meta.birthDate="";
 raw.meta.birthPlace="عنابة";
 raw.meta.familyName="شامي";
 raw.meta.givenName="نزار شامي";
 const loaded=restoreCommittee(raw);
 const d=buildReferenceDocuments(loaded);
 assert.equal(d.candidateBirthDate,"13 فيفري 1990");
 assert.equal(d.candidateBirthPlace,"عنابة");
 assert.ok(minutesOpeningText(d).includes(line));
 assert.deepEqual(minutesOpeningSegments(d).map(x=>x.bold),[false,true,false]);
 assert.deepEqual(d.candidateFields.find(([label])=>label==="تاريخ ومكان الميلاد"),
  ["تاريخ ومكان الميلاد","13 فيفري 1990، عنابة"]);

 const root=new Fake("main");renderDocuments(root,loaded);
 const opening=walk(root,x=>x.className.includes("reference-minutes-opening"))[0];
 assert.ok(opening);
 assert.ok(textOf(opening).includes(line));
 assert.deepEqual(opening.children.map(x=>x.tag),["span","strong","span"]);
 const docx=plainXml(committeeDocumentXml(loaded,{kind:"minutes"}));
 assert.ok(docx.includes(line));
 const report=plainXml(committeeDocumentXml(loaded,{kind:"report"}));
 assert.ok(report.includes("13 فيفري 1990، عنابة"));
});

test("B18: visible birth date overrides stale hidden birthDate without needing reentry",()=>{
 let state=freshCommittee();
 state=editMeta(state,"birth","13 فيفري 1990");
 state=editMeta(state,"birthPlace","عنابة");
 const raw=JSON.parse(stringifyCommittee(state));
 raw.meta.birthDate="01/01/1978"; // stale alias from a previously imported draft
 const imported=restoreCommittee(raw);
 const d=buildReferenceDocuments(imported);
 assert.equal(d.candidateBirthDate,"13 فيفري 1990");
 assert.ok(minutesOpeningText(d).includes(line));
});

test("B18: retain original B16 combined-birth fallback where date had its own value",()=>{
 const raw=JSON.parse(stringifyCommittee(freshCommittee()));
 raw.meta.birth="13 فيفري 1990، عنابة";
 raw.meta.birthDate="13 فيفري 1990";
 raw.meta.birthPlace="عنابة";
 const imported=restoreCommittee(raw),d=buildReferenceDocuments(imported);
 assert.equal(d.candidateBirthDate,"13 فيفري 1990");
 assert.ok(minutesOpeningText(d).includes(line));
});

test("B18: minutes wording and typography remain identical; only date binding changes",()=>{
 const doc=readFileSync("prototypes/titularisation-committee/document-language.mjs","utf8");
 const css=readFileSync("prototypes/titularisation-committee/print-layout-b5.css","utf8");
 const pdf=readFileSync("prototypes/titularisation-committee/preview.mjs","utf8");
 const word=readFileSync("prototypes/titularisation-committee/docx-export.mjs","utf8");
 assert.match(doc,/minutesOpeningSegments/);
 assert.match(doc,/نحن الموقّعون أدناه/);
 assert.match(pdf,/minutesOpeningSegments\(d,empty\)/);
 assert.match(word,/minutesOpeningSegments\(d,placeholder\)/);
 assert.match(css,/bottom:-26mm!important/);
 const selected=METADATA_FIELDS();
 assert.deepEqual(selected,[["birth","تاريخ الميلاد"],["birthPlace","مكان الميلاد"]]);
});
function METADATA_FIELDS(){
 const source=readFileSync("prototypes/titularisation-committee/committee-engine.mjs","utf8");
 const one=source.match(/\["birth","تاريخ الميلاد"\]/g)||[];
 const two=source.match(/\["birthPlace","مكان الميلاد"\]/g)||[];
 assert.equal(one.length,1);
 assert.equal(two.length,1);
 return [["birth","تاريخ الميلاد"],["birthPlace","مكان الميلاد"]];
}
