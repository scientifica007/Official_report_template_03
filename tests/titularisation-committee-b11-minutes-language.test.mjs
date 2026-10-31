import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee,editMeta} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {buildReferenceDocuments} from "../prototypes/titularisation-committee/document-model.mjs";
import {committeeDocumentXml,createCommitteeDocx} from "../prototypes/titularisation-committee/docx-export.mjs";
import {renderDocuments} from "../prototypes/titularisation-committee/preview.mjs";
const expected="الثامن عشر من شهر نوفمبر سنة ألفين وستة وعشرين";
class FakeElement {
 constructor(tag){this.tag=tag;this.textContent="";this.className="";this.children=[]}
 append(...children){this.children.push(...children)}
 replaceChildren(){this.children=[]}
}
globalThis.document={createElement:tag=>new FakeElement(tag)};
const findAll=(el,predicate)=>[
 ...(predicate(el)?[el]:[]),
 ...el.children.flatMap(child=>findAll(child,predicate))
];
const text=el=>(el.textContent||"")+" "+el.children.map(text).join(" ");
test("minutes date wording is identical in PDF preview and standalone DOCX",()=>{
 let s=freshCommittee();
 s=editMeta(s,"date","18 نوفمبر 2026");
 s=editMeta(s,"location","مؤسسة افتراضية");
 const d=buildReferenceDocuments(s);
 assert.equal(d.dateInWords,expected);
 const root=new FakeElement("main");
 renderDocuments(root,s);
 const minutes=findAll(root,el=>el.className.includes("reference-minutes")&&el.tag==="section");
 assert.equal(minutes.length,1);
 assert.match(text(minutes[0]),/سنة ألفين وستة وعشرين/);
 assert.doesNotMatch(text(minutes[0]),/سنة ألفية/);
 const xml=committeeDocumentXml(s,{kind:"minutes"});
 assert.ok(xml.includes(expected));
 assert.ok(!xml.includes("سنة ألفية"));
 const docx=createCommitteeDocx(s,{kind:"minutes"});
 assert.ok(docx.byteLength>1000);
});
test("PDF minutes introduction keeps a larger isolated gap without changing the report footer",()=>{
 const css=readFileSync("prototypes/titularisation-committee/print-layout-b5.css","utf8");
 assert.match(css,/#paper \.reference-minutes-body\{\s*padding-top:22mm!important/);
 assert.match(css,/bottom:-23mm!important/);
 const rules=readFileSync("prototypes/titularisation-committee/document-rules.mjs","utf8");
 assert.doesNotMatch(rules,/ألفية/);
});
