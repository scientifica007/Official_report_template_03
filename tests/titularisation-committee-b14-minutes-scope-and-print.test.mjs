import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 freshCommittee,editMeta,restoreCommittee,stringifyCommittee
} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {MINUTES_SCOPES,MINUTES_RESULTS_INTRO,LEGAL_REFERENCES} from
 "../prototypes/titularisation-committee/document-language.mjs";
import {buildReferenceDocuments} from "../prototypes/titularisation-committee/document-model.mjs";
import {renderDocuments} from "../prototypes/titularisation-committee/preview.mjs";
import {committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";
import {portableCommitteeObject} from "../prototypes/titularisation-committee/document-export-contract.mjs";

const folder="prototypes/titularisation-committee/";
const css=readFileSync(folder+"print-layout-b5.css","utf8");
class Fake{
 constructor(tag){this.tag=tag;this.className="";this.textContent="";this.children=[]}
 append(...items){this.children.push(...items)}
 replaceChildren(){this.children=[]}
}
globalThis.document={createElement:tag=>new Fake(tag)};
const all=(node,predicate)=>[
 ...(predicate(node)?[node]:[]),...node.children.flatMap(x=>all(x,predicate))
];
const printable=node=>node.textContent+" "+node.children.map(printable).join(" ");
const minutesHeader=root=>all(root,e=>e.className==="reference-minutes-header")[0];
const documentText=xml=>xml.replace(/<[^>]*>/g,"");

test("B14: exactly three approved scope sentences and one custom option",()=>{
 const choices=Object.entries(MINUTES_SCOPES);
 assert.equal(choices.length,4);
 assert.deepEqual(choices.map(([k])=>k),["specialist","rehabilitation","general","custom"]);
 assert.equal(MINUTES_SCOPES.specialist,"للأساتذة المتخصصين في التكوين والتعليم المهنيين.");
 assert.equal(MINUTES_SCOPES.rehabilitation,"للأساتذة المتخصصين في التكوين والتعليم المهنيين لإعادة التكييف.");
 assert.equal(MINUTES_SCOPES.general,"لأساتذة التكوين المهني.");
 assert.equal(MINUTES_SCOPES.custom,"");
 const src=readFileSync(folder+"app.mjs","utf8");
 assert.match(src,/key==="minutesScopeMode"/);
 assert.match(src,/key==="minutesScopeCustom"/);
 assert.match(src,/صياغة حرة/);
});

test("B14: scope selection drives both PDF and DOCX, and raw and portable JSON",()=>{
 for(const [option,phrase] of Object.entries(MINUTES_SCOPES)){
  let s=editMeta(freshCommittee(),"minutesScopeMode",option);
  const expected=option==="custom"?"صياغة مهنية تجريبية خاصة":phrase;
  if(option==="custom")s=editMeta(s,"minutesScopeCustom",expected);
  const d=buildReferenceDocuments(s);
  assert.equal(d.minutesScope,expected);
  const root=new Fake("div");renderDocuments(root,s);
  const header=minutesHeader(root);
  const children=all(header,x=>x.className==="reference-subtitle");
  assert.equal(children.length,1);
  assert.equal(children[0].textContent,expected);
  for(const extra of Object.values(MINUTES_SCOPES).filter(x=>x&&x!==expected))
   assert.ok(!printable(header).includes(extra),"Must not print multiple ranks");
  const xml=documentText(committeeDocumentXml(s,{kind:"minutes"}));
  assert.ok(xml.includes(expected),expected);
  assert.equal(portableCommitteeObject(s).documentContract.outputData.minutesScope,expected);
  const back=restoreCommittee(JSON.parse(stringifyCommittee(s)));
  assert.equal(back.meta.minutesScopeMode,option);
  assert.equal(back.meta.minutesScopeCustom,s.meta.minutesScopeCustom);
 }
});

test("B14: custom scope may be blank, but invalid modes cannot be saved or imported",()=>{
 const draft=editMeta(freshCommittee(),"minutesScopeMode","custom");
 assert.equal(buildReferenceDocuments(draft).minutesScope,"");
 const root=new Fake("div");renderDocuments(root,draft);
 assert.equal(all(minutesHeader(root),x=>x.className==="reference-subtitle").length,0);
 assert.throws(()=>editMeta(draft,"minutesScopeMode","invalid"),/غير معروفة/);
 const data=JSON.parse(stringifyCommittee(draft));
 data.meta.minutesScopeMode="invalid";
 assert.throws(()=>restoreCommittee(data),/غير معروفة/);
});

test("B14: old imported JSON without new metadata uses one specialist sentence",()=>{
 const older=JSON.parse(stringifyCommittee(freshCommittee()));
 delete older.meta.minutesScopeMode;
 delete older.meta.minutesScopeCustom;
 const restored=restoreCommittee(older);
 assert.equal(restored.meta.minutesScopeMode,"specialist");
 assert.equal(restored.meta.minutesScopeCustom,"");
 assert.equal(buildReferenceDocuments(restored).minutesScope,MINUTES_SCOPES.specialist);
});

test("B14: minutes use the exact inspector-requested deliberation wording",()=>{
 assert.equal(MINUTES_RESULTS_INTRO,"أسفرت مداولات لجنة الامتحان عن النتائج الآتية:");
 const state=freshCommittee(),root=new Fake("div");renderDocuments(root,state);
 const minute=all(root,x=>x.className.includes("reference-minutes")&&x.tag==="section")[0];
 assert.ok(printable(minute).includes(MINUTES_RESULTS_INTRO));
 assert.ok(documentText(committeeDocumentXml(state,{kind:"minutes"})).includes(MINUTES_RESULTS_INTRO));
});

test("B14: reference text has a single-line printable rule and no-wrap Word cell",()=>{
 assert.match(css,/reference-minutes-header \.reference-minutes-references/);
 assert.match(css,/white-space:nowrap!important/);
 const root=new Fake("div");renderDocuments(root,freshCommittee());
 const header=minutesHeader(root);
 assert.equal(all(header,x=>x.className.includes("reference-minutes-references")).length,1);
 assert.ok(printable(header).includes("المراجع: "+LEGAL_REFERENCES));
 const word=committeeDocumentXml(freshCommittee(),{kind:"minutes"});
 assert.match(word,/<w:noWrap\/>/);
 assert.ok(documentText(word).includes("المراجع: "+LEGAL_REFERENCES));
});

test("B14: PDF labels and Word labels are bold and underlined only in lesson/discussion",()=>{
 assert.match(css,/\.reference-assessment-label strong/);
 assert.match(css,/font-weight:700!important/);
 assert.match(css,/text-decoration:underline!important/);
 const root=new Fake("div");renderDocuments(root,freshCommittee());
 const labels=all(root,x=>x.className.includes("reference-assessment-label"));
 assert.equal(labels.length,2);
 const word=committeeDocumentXml(freshCommittee(),{kind:"report"});
 assert.ok((word.match(/<w:u w:val="single"\/>/g)||[]).length>=2);
 assert.match(word,/التقدير:/);
});

test("B14: footer remains on the report only, at the physical printable limit",()=>{
 assert.match(css,/bottom:-28mm!important/);
 assert.equal(12+252+28,297-5);
 const root=new Fake("div");renderDocuments(root,freshCommittee());
 assert.equal(all(root,x=>x.className.includes("reference-report-footer")).length,5);
 const minutes=all(root,x=>x.className==="reference-page reference-minutes")[0];
 assert.equal(all(minutes,x=>x.className.includes("reference-report-footer")).length,0);
});
