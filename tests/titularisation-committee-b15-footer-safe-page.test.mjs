import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {renderDocuments} from "../prototypes/titularisation-committee/preview.mjs";

const base="prototypes/titularisation-committee/";
const css=readFileSync(base+"print-layout-b5.css","utf8");
const pagination=readFileSync(base+"print-pagination.mjs","utf8");
const style=readFileSync(base+"style.css","utf8");

test("B15: report footer bottom must not touch or exceed A4 printable boundary",()=>{
 const a4Mm=297,topMarginMm=12,bottomMarginMm=5;
 const safePageHeightMm=252;
 const rule=/@media print\s*\{\s*#paper \.reference-page \.reference-report-footer\s*\{\s*bottom:-(\d+)mm!important/gu;
 const offsets=[...css.matchAll(rule)].map(x=>Number(x[1]));
 assert.ok(offsets.length>=2,"Footer style cascade must be identified");
 const offset=offsets.at(-1);
 assert.equal(offset,26,"Do not move print footer back to the zero-clearance -28mm location");
 const physicalBottom=topMarginMm+safePageHeightMm+offset;
 const maximum=a4Mm-bottomMarginMm;
 assert.ok(physicalBottom<=maximum-2,
  `Footer ends at ${physicalBottom}mm; need a 2mm safety margin inside ${maximum}mm`);
 assert.equal(safePageHeightMm,252);
 assert.match(css,/@page \{size:A4 portrait;margin:12mm 14mm 5mm\}/);
 assert.match(css,/height:252mm!important;min-height:252mm!important/);
});

test("B15: source assigns report footer to each logical report page, never minutes",()=>{
 class Fake {
  constructor(tag){this.tag=tag;this.textContent="";this.className="";this.children=[];}
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
 }
 globalThis.document={createElement:tag=>new Fake(tag)};
 const query=(node,test)=>[
  ...(test(node)?[node]:[]),...node.children.flatMap(x=>query(x,test))
 ];
 const root=new Fake("div");renderDocuments(root,freshCommittee());
 const reports=query(root,x=>x.className.includes("reference-page")&&!x.className.includes("reference-minutes"));
 const minutes=query(root,x=>x.className.includes("reference-page reference-minutes"));
 assert.equal(reports.length,5);
 assert.equal(minutes.length,1);
 for(const page of reports){
  const footers=query(page,x=>x.className==="reference-report-footer");
  assert.equal(footers.length,1);
  assert.equal(footers[0].children.filter(x=>x.className==="reference-footer-rule").length,1);
 }
 assert.equal(query(minutes[0],x=>x.className==="reference-report-footer").length,0);
});

test("B15: dynamic pagination remains intact; print hides unrelated document",()=>{
 assert.match(pagination,/pages\.forEach\(\(page,i\)=>pageFooter\(page,d,i\+1,pages\.length\)\)/);
 assert.match(css,/body\[data-print-target="report"\] #paper \.official-minutes/);
 assert.match(css,/body\[data-print-target="minutes"\] #paper \.official-report/);
 assert.match(css,/break-after:page!important/);
 assert.match(style,/#paper \.reference-report-footer/);
});
