import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {METADATA_GROUPS,freshCommittee,editMeta,restoreCommittee,stringifyCommittee} from "../prototypes/titularisation-committee/committee-engine.mjs";
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
const walk=(node,predicate)=>[
 ...(predicate(node)?[node]:[]),...node.children.flatMap(child=>walk(child,predicate))
];
const contentOf=node=>(node.textContent||"")+" "+node.children.map(contentOf).join(" ");
const words=xml=>xml.replace(/<[^>]+>/g,"");

test("B17: metadata offers one date of birth and one place of birth, without redundant minutes field",()=>{
 const candidate=METADATA_GROUPS.find(group=>group.label==="بيانات الأستاذ المترشح");
 assert.ok(candidate);
 const fields=candidate.fields.filter(([id])=>["birth","birthDate","birthPlace"].includes(id));
 assert.deepEqual(fields,[["birth","تاريخ الميلاد"],["birthPlace","مكان الميلاد"]]);
 assert.equal(METADATA_GROUPS.flatMap(x=>x.fields).filter(x=>x[0]==="birthDate").length,0);
 const ui=readFileSync("prototypes/titularisation-committee/app.mjs","utf8");
 assert.match(ui,/for\(const \[key,label\] of group.fields\)/);
});

test("B17: the existing date field supplies minutes and appears with the location in report page two",()=>{
 let state=editMeta(freshCommittee(),"birth","12/03/1981");
 state=editMeta(state,"birthPlace","تبسة");
 const d=buildReferenceDocuments(state);
 assert.equal(state.meta.birthDate,"12/03/1981");
 assert.equal(d.candidateBirthDate,"12/03/1981");
 assert.equal(d.candidateBirthPlace,"تبسة");
 assert.deepEqual(d.candidateFields.find(([label])=>label==="تاريخ ومكان الميلاد"),
  ["تاريخ ومكان الميلاد","12/03/1981، تبسة"]);
 assert.ok(minutesOpeningText(d).includes("المولد(ة) في: 12/03/1981 بـ: تبسة"));
 assert.deepEqual(minutesOpeningSegments(d).map(x=>x.bold),[false,true,false]);
 const root=new Fake("main");renderDocuments(root,state);
 const candidatePage=walk(root,x=>x.className==="reference-page reference-candidate")[0];
 assert.ok(contentOf(candidatePage).includes("12/03/1981، تبسة"));
 const minutes=walk(root,x=>x.className.includes("reference-minutes-opening"))[0];
 assert.ok(contentOf(minutes).includes("المولد(ة) في: 12/03/1981 بـ: تبسة"));
 const report=words(committeeDocumentXml(state,{kind:"report"}));
 assert.ok(report.includes("12/03/1981، تبسة"));
 const wordMinutes=words(committeeDocumentXml(state,{kind:"minutes"}));
 assert.ok(wordMinutes.includes("المولد(ة) في: 12/03/1981 بـ: تبسة"));
 const back=restoreCommittee(JSON.parse(stringifyCommittee(state)));
 assert.equal(back.meta.birth,"12/03/1981");
 assert.equal(back.meta.birthDate,"12/03/1981");
 assert.equal(back.meta.birthPlace,"تبسة");
});

test("B17: editing the visible date also replaces stale B16 alias, without changing minutes language",()=>{
 let state=editMeta(freshCommittee(),"birthDate","01/01/1980");
 state=editMeta(state,"birth","03/04/1984");
 state=editMeta(state,"birthPlace","باتنة");
 assert.equal(state.meta.birthDate,"03/04/1984");
 const d=buildReferenceDocuments(state);
 assert.ok(minutesOpeningText(d).includes("المولد(ة) في: 03/04/1984 بـ: باتنة"));
 const minutes=readFileSync("prototypes/titularisation-committee/preview.mjs","utf8");
 const docx=readFileSync("prototypes/titularisation-committee/docx-export.mjs","utf8");
 assert.match(minutes,/minutesOpeningSegments\(d,empty\)/);
 assert.match(docx,/minutesOpeningSegments\(d,placeholder\)/);
});

test("B17: B16 JSON with distinct birthDate retains its accepted minutes date",()=>{
 const legacy=JSON.parse(stringifyCommittee(freshCommittee()));
 legacy.meta.birth="12/03/1981";
 legacy.meta.birthDate="12/03/1981";
 legacy.meta.birthPlace="تبسة";
 const state=restoreCommittee(legacy),d=buildReferenceDocuments(state);
 assert.equal(d.candidateBirthDate,"12/03/1981");
 assert.equal(d.candidateFields.find(([label])=>label==="تاريخ ومكان الميلاد")[1],
  "12/03/1981، تبسة");
 assert.ok(minutesOpeningText(d).includes("المولد(ة) في: 12/03/1981 بـ: تبسة"));
});

test("B17: old combined birth text remains available and is not silently parsed",()=>{
 const legacy=JSON.parse(stringifyCommittee(freshCommittee()));
 legacy.meta.birth="تاريخ ومكان قديمان غير مفصولين";
 delete legacy.meta.birthDate;delete legacy.meta.birthPlace;
 const state=restoreCommittee(legacy),d=buildReferenceDocuments(state);
 assert.equal(state.meta.birth,legacy.meta.birth);
 assert.equal(d.candidateBirthDate,"");
 assert.equal(d.candidateBirthPlace,"");
 assert.equal(d.candidateFields.find(([label])=>label==="تاريخ ومكان الميلاد")[1],
  legacy.meta.birth);
 assert.equal(state.meta.birthDate,"");
});

test("B17: accepted minutes PDF/DOCX layout, footer positioning and evaluation code unchanged",()=>{
 const css=readFileSync("prototypes/titularisation-committee/print-layout-b5.css","utf8");
 assert.match(css,/bottom:-26mm!important/);
 const source=readFileSync("prototypes/titularisation-committee/document-language.mjs","utf8");
 assert.match(source,/أسفرت مداولات لجنة الامتحان عن النتائج الآتية/);
 const state=freshCommittee(),root=new Fake("main");
 renderDocuments(root,state);
 assert.equal(walk(root,x=>x.className==="reference-report-footer").length,5);
 const minute=walk(root,x=>x.className==="reference-page reference-minutes")[0];
 assert.equal(walk(minute,x=>x.className==="reference-report-footer").length,0);
});
