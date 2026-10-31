import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee,editMeta} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {renderDocuments} from "../prototypes/titularisation-committee/preview.mjs";
import {committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";
import {buildReferenceDocuments} from "../prototypes/titularisation-committee/document-model.mjs";
import {
 COMMITTEE_APPROVAL_HEADING,MINUTES_TITLE,MINUTES_SCOPE,LEGAL_REFERENCES,
 MINUTES_RESULTS_INTRO,DISCUSSION_RESULT_TITLE,minutesOpeningText
} from "../prototypes/titularisation-committee/document-language.mjs";
class Fake {
 constructor(tag){this.tag=tag;this.children=[];this.className="";this.textContent="";}
 append(...xs){this.children.push(...xs)}
 replaceChildren(){this.children=[]}
}
globalThis.document={createElement:tag=>new Fake(tag)};
const walk=(e,fn)=>[...(fn(e)?[e]:[]),...e.children.flatMap(x=>walk(x,fn))];
const content=e=>(e.textContent||"")+" "+e.children.map(content).join(" ");
function fixture(){
 let s=freshCommittee();
 for(const [k,v] of [["date","18 نوفمبر 2026"],
  ["candidate","مترشح تجريبي"],["location","مؤسسة تكوينية افتراضية"],
  ["rank","أستاذ متخصص في التكوين والتعليم المهنيين"],
  ["institution","مؤسسة تعيين افتراضية"],["wilaya","تبسة"]])s=editMeta(s,k,v);
 return s;
}
test("shared opening is grammatically sound and preserves candidate/date/venue",()=>{
 const d=buildReferenceDocuments(fixture());
 const prose=minutesOpeningText(d);
 assert.match(prose,/نحن الموقّعون أدناه، أعضاء لجنة التفتيش قصد الترسيم، نصرّح/);
 assert.match(prose,/الثامن عشر من شهر نوفمبر سنة ألفين وستة وعشرين/);
 assert.match(prose,/بمقرّ: مؤسسة تكوينية افتراضية/);
 assert.match(prose,/في إجراء امتحان التثبيت للمترشح\(ة\): مترشح تجريبي/);
 assert.doesNotMatch(prose,/نحن الموقعين أسفله|في سير امتحان التثبيت/);
});
test("PDF title/scope/references are one compact heading followed by separately styled body",()=>{
 const root=new Fake("main");renderDocuments(root,fixture());
 const minutes=walk(root,e=>e.tag==="section"&&e.className.includes("reference-minutes"))[0];
 const header=walk(minutes,e=>e.className==="reference-minutes-header");
 const body=walk(minutes,e=>e.className==="reference-minutes-body");
 const signature=walk(minutes,e=>e.className==="reference-minutes-signatures");
 assert.equal(header.length,1);assert.equal(body.length,1);assert.equal(signature.length,1);
 assert.equal(header[0].children.length,3);
 assert.match(content(header[0]),new RegExp(MINUTES_TITLE));
 assert.ok(content(header[0]).includes(MINUTES_SCOPE));
 assert.ok(content(header[0]).includes("المراجع: "+LEGAL_REFERENCES));
 assert.match(content(body[0]),/نحن الموقّعون أدناه/);
 assert.match(content(minutes),/المعيَّن\(ة\) في رتبة/);
 assert.match(content(minutes),/بمؤسسة/);
 assert.match(content(minutes),/الولاية/);
 assert.ok(content(minutes).includes(MINUTES_RESULTS_INTRO));
 assert.doesNotMatch(content(minutes),/— إمضاءات أعضاء اللجنة على النسخة الورقية/);
 const headings=walk(root,e=>e.tag==="h3").map(e=>e.textContent);
 assert.equal(headings.filter(h=>h===COMMITTEE_APPROVAL_HEADING).length,2);
 assert.ok(content(root).includes(DISCUSSION_RESULT_TITLE));
});
test("DOCX report and minutes use the same proofread administrative headings",()=>{
 const report=committeeDocumentXml(fixture(),{kind:"report"});
 const minutes=committeeDocumentXml(fixture(),{kind:"minutes"});
 const readableMinutes=minutes.replace(/<[^>]*>/g,"");
 for(const token of [MINUTES_TITLE,MINUTES_SCOPE,LEGAL_REFERENCES,
  COMMITTEE_APPROVAL_HEADING,MINUTES_RESULTS_INTRO,"نحن الموقّعون أدناه",
  "في إجراء امتحان التثبيت للمترشح(ة): مترشح تجريبي"]){
  assert.ok(readableMinutes.includes(token),token);
 }
 assert.ok(report.includes(DISCUSSION_RESULT_TITLE));
 assert.ok(report.includes(COMMITTEE_APPROVAL_HEADING));
 assert.doesNotMatch(report,/إمضاءات أعضاء اللجنة على النسخة الورقية/);
 assert.doesNotMatch(minutes,/نحن الموقعين أسفله|في سير امتحان التثبيت/);
});
test("PDF header is tightly spaced while the body starts lower, without changing report layout",()=>{
 const css=readFileSync("prototypes/titularisation-committee/print-layout-b5.css","utf8");
 assert.match(css,/\.reference-minutes-header\{/);
 assert.match(css,/\.reference-minutes-header h2\{/);
 assert.match(css,/\.reference-minutes-header \.reference-subtitle/);
 assert.match(css,/\.reference-minutes-body\{\s*padding-top:22mm!important/);
 assert.match(css,/\.reference-minutes-signatures\{\s*margin-top:auto!important/);
 assert.match(css,/bottom:-23mm!important/);
});
