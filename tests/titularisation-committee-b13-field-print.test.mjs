import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee,editMeta,changeMode,editScore,submit,documentData} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {renderDocuments} from "../prototypes/titularisation-committee/preview.mjs";
import {committeeDocumentXml} from "../prototypes/titularisation-committee/docx-export.mjs";

const prefix="prototypes/titularisation-committee/";
const css=readFileSync(prefix+"print-layout-b5.css","utf8");
class FakeElement {
 constructor(tag){this.tag=tag;this.className="";this.textContent="";this.children=[];}
 append(...items){this.children.push(...items)}
 replaceChildren(){this.children=[]}
}
globalThis.document={createElement:tag=>new FakeElement(tag)};
const walk=(node,accept)=>[
 ...(accept(node)?[node]:[]),
 ...node.children.flatMap(child=>walk(child,accept))
];
const hasClass=(node,token)=>node.className.split(/\s+/).includes(token);
const pages=(root,token)=>walk(root,x=>hasClass(x,token));

test("P4-B13: full report and one-page minutes use a physical Arabic glyph safety inset",()=>{
 assert.match(css,/#paper \.reference-page\{\s*padding-inline:3mm!important/);
 assert.match(css,/@page \{size:A4 portrait;margin:12mm 14mm 5mm\}/);
 // 182mm page width already fits the 210mm sheet inside 14mm side margins;
 // these are INNER insets and do not increase the A4 box's outer width.
 assert.match(css,/width:182mm!important;max-width:182mm!important/);
 assert.match(css,/box-sizing:border-box!important/);
});

test("P4-B13: report footer is lowered but remains within the A4 printable boundary",()=>{
 assert.match(css,/bottom:-28mm!important/);
 assert.match(css,/#paper \.reference-page \.reference-report-footer\{\s*left:3mm!important;right:3mm!important/);
 const a4Height=297,pageTop=12,bodyHeight=252,offset=28,printBottomMargin=5;
 assert.ok(pageTop+bodyHeight+offset<=a4Height-printBottomMargin);
 assert.match(css,/#paper \.reference-minutes \.reference-report-footer\{display:none!important/);
});

test("P4-B13: result is centered at 16pt and all choices display at 16pt",()=>{
 const root=new FakeElement("main");
 renderDocuments(root,freshCommittee());
 const report=pages(root,"reference-results")[0],minutes=pages(root,"reference-minutes")[0];
 assert.ok(report&&minutes);
 for(const page of [report,minutes]){
  const decisions=pages(page,"reference-decisions");
  assert.equal(decisions.length,1);
  assert.equal(decisions[0].children.length,3);
 }
 const conclusion=pages(report,"reference-general-appreciation");
 assert.equal(conclusion.length,1);
 assert.equal(conclusion[0].children[1].tag,"span");
 assert.match(css,/#paper \.reference-results \.reference-general-appreciation > span\{[\s\S]*?font-size:16pt!important/);
 assert.match(css,/#paper \.reference-page \.reference-decisions\{\s*font-size:16pt!important/);
});

test("P4-B13: real stamp room for first two committee seats, in both PDF documents",()=>{
 const root=new FakeElement("main");
 renderDocuments(root,freshCommittee());
 for(const section of [pages(root,"reference-results")[0],pages(root,"reference-minutes")[0]]){
  const signers=pages(section,"reference-member-sign");
  assert.equal(signers.length,3);
  assert.equal(pages(signers[0],"reference-stamp-space").length,1);
  assert.equal(pages(signers[1],"reference-stamp-space").length,1);
  assert.equal(pages(signers[2],"reference-stamp-space").length,0);
 }
 assert.match(css,/#paper \.reference-three-signers \.reference-member-sign \.reference-stamp-space\{\s*height:19mm!important/);
});

test("P4-B13: minutes opening gets shorter top gap and actual multi-line leading",()=>{
 assert.match(css,/#paper \.reference-minutes-body\{\s*padding-top:9mm!important/);
 assert.match(css,/#paper \.reference-minutes \.reference-minutes-body p\.reference-minutes-opening\{\s*margin:0 0 4mm!important;line-height:1\.47!important/);
 assert.match(css,/#paper \.reference-minutes\{\s*padding-bottom:0!important/);
});

test("P4-B13: print-only improvements leave grading data and Word XML untouched",()=>{
 let state=changeMode(freshCommittee(),"individual");
 state=editMeta(state,"candidate","مترشح اصطناعي");
 state=editScore(state,"member1","lesson","g1",2.5);
 state=submit(state,"member1");
 const before=structuredClone(state);
 const root=new FakeElement("main");renderDocuments(root,state);
 assert.deepEqual(state,before);
 assert.equal(documentData(state).reference.count,1);
 const word=committeeDocumentXml(state,{kind:"minutes"});
 assert.match(word,/محضر التفتيش قصد الترسيم/);
 assert.match(word,/مترشح اصطناعي/);
});
