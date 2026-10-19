import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root="prototypes/titularisation-workbench/";
const source=readFileSync(root+"app.mjs","utf8");
const style=readFileSync(root+"style.css","utf8");

// A browser-like event harness executes the actual app event handlers.
// HTML strings are inspected directly; no production network or DOM dependency.
const listeners={};
const dynamic=new Map();
const totalPanel={outerHTML:""};
const workbench={
 innerHTML:"",
 addEventListener(type,fn){listeners[type]=fn},
 querySelector(sel){return sel==="[data-totals-panel]"?totalPanel:null}
};
const fixed={
 rubric:{value:"grouped5",addEventListener(type,fn){listeners["rubric:"+type]=fn}},
 "rubric-origin":{textContent:""},
 workbench,
 feedback:{textContent:""},
 export:{addEventListener(type,fn){listeners["export:"+type]=fn}},
 import:{addEventListener(type,fn){listeners["import:"+type]=fn}}
};
globalThis.document={
 getElementById(id){
  if(Object.hasOwn(fixed,id))return fixed[id];
  if(!dynamic.has(id))dynamic.set(id,{value:"",disabled:false});
  return dynamic.get(id);
 }
};
globalThis.confirm=()=>true;
await import("../prototypes/titularisation-workbench/app.mjs");

function reset(rubric="grouped5"){
 listeners["rubric:change"]({target:{value:rubric}});
}
function target(kind,phase,id,value,max=12,empty="true"){
 const attrs={},status={textContent:""},css={};
 const el={
  id:kind==="button"?id:undefined,
  dataset:{},
  value,
  max:String(max),
  style:{setProperty(name,val){css[name]=val}},
  setAttribute(name,val){attrs[name]=val},
  closest(selector){
   if(selector===".score-range-wrap")return {querySelector:()=>status};
   if(selector==="[data-range]")return kind==="range"?el:null;
   if(selector==="[data-score]")return kind==="number"?el:null;
   if(selector==="[data-weight]")return kind==="weight"?el:null;
   return null;
  }
 };
 if(kind==="range")Object.assign(el.dataset,{range:phase,scoreId:id,empty});
 if(kind==="number")Object.assign(el.dataset,{score:phase,scoreId:id});
 if(kind==="weight")el.dataset.weight=id;
 return {el,attrs,status,css};
}
function countRe(text,re){return [...text.matchAll(re)].length}

test("the initial five-group view renders paired sliders and 14 reminder points, without scores",()=>{
 reset();
 const h=workbench.innerHTML;
 assert.equal(countRe(h,/data-range="lesson"/g),5);
 assert.equal(countRe(h,/data-range="discussion"/g),7);
 assert.equal(countRe(h,/<li>/g),14);
 assert.match(h,/id="score-lesson-g1"[^>]*step="0.5" value=""/);
 assert.match(h,/type="range"[^>]*max="12" step="0.5" value="0" data-range="lesson" data-score-id="g1" data-empty="true"/);
 assert.match(h,/class="range-scale" dir="ltr" aria-hidden="true"><span>0<\/span><span>6<\/span><span>12<\/span>/);
 assert.match(h,/لم تُسجل علامة بعد/);
 assert.match(h,/data-totals-panel/);
});
test("all three rubrics plus discussion have half-point range controls, including odd caps",()=>{
 for(const [key,count] of [["grouped5",5],["inspector10",10]]){
  reset(key);
  const h=workbench.innerHTML;
  assert.equal(countRe(h,/data-range="lesson"/g),count);
  assert.equal(countRe(h,/data-range="discussion"/g),7);
  assert.equal(countRe(h,/class="score-range"/g),count+7);
 }
 reset("inspector10");
 assert.match(workbench.innerHTML,/max="5" step="0.5"/);
 assert.match(workbench.innerHTML,/class="range-scale" dir="ltr" aria-hidden="true"><span>0<\/span><span>2.5<\/span><span>5<\/span>/);
 reset("analytical14");
 assert.equal(countRe(workbench.innerHTML,/data-range="lesson"/g),0,"lesson scoring blocked before weight freeze");
 assert.equal(countRe(workbench.innerHTML,/data-range="discussion"/g),7);
 assert.match(workbench.innerHTML,/data-range="discussion"[^>]*disabled/);
 listeners.click({target:{id:"suggest",closest:()=>null}});
 listeners.click({target:{id:"freeze",closest:()=>null}});
 assert.equal(countRe(workbench.innerHTML,/data-range="lesson"/g),14);
});
test("range input immediately synchronizes numeric value and progress while retaining the dragged element",()=>{
 reset("grouped5");
 const previous=workbench.innerHTML;
 const t=target("range","lesson","g1","2.5",12);
 listeners.input({target:t.el});
 assert.equal(dynamic.get("score-lesson-g1").value,"2.5");
 assert.equal(t.el.dataset.empty,"false");
 assert.equal(t.attrs["aria-valuetext"],"2.5 من 12");
 assert.equal(t.css["--range-progress"],"20.833333333333336%");
 assert.match(t.status.textContent,/2.5/);
 assert.equal(workbench.innerHTML,previous,"dragging must not destroy the active slider");
 assert.match(totalPanel.outerHTML,/data-totals-panel/);
 listeners.change({target:t.el});
 assert.match(workbench.innerHTML,/id="score-lesson-g1"[^>]*value="2.5"/);
 assert.match(workbench.innerHTML,/max="12" step="0.5" value="2.5" data-range="lesson" data-score-id="g1" data-empty="false"/);
});
test("editing the number updates the slider and clearing restores the empty status",()=>{
 reset("grouped5");
 const number=target("number","lesson","g3","4.5");
 listeners.change({target:number.el});
 assert.match(workbench.innerHTML,/id="score-lesson-g3"[^>]*value="4.5"/);
 assert.match(workbench.innerHTML,/max="8" step="0.5" value="4.5" data-range="lesson" data-score-id="g3" data-empty="false"/);
 const clear=target("number","lesson","g3","");
 listeners.change({target:clear.el});
 assert.match(workbench.innerHTML,/id="score-lesson-g3"[^>]*value=""/);
 assert.match(workbench.innerHTML,/max="8" step="0.5" value="0" data-range="lesson" data-score-id="g3" data-empty="true"/);
});
test("a deliberate click at zero on an empty range saves zero; fresh drafts never do",()=>{
 reset("grouped5");
 assert.match(workbench.innerHTML,/id="score-lesson-g1"[^>]*value=""/);
 const slider=target("range","lesson","g1","0",12);
 listeners.click({target:slider.el});
 assert.match(workbench.innerHTML,/id="score-lesson-g1"[^>]*value="0"/);
 assert.match(workbench.innerHTML,/max="12" step="0.5" value="0" data-range="lesson" data-score-id="g1" data-empty="false"/);
});
test("Home or ArrowLeft from the untouched zero endpoint can explicitly commit zero with keyboard",()=>{
 reset("grouped5");
 const range=target("range","lesson","g1","0",12);
 listeners.keyup({target:range.el,key:"Home"});
 assert.match(workbench.innerHTML,/id="score-lesson-g1"[^>]*value="0"/);
});
test("zero-weight indicators remain visible but get no score slider",()=>{
 reset("analytical14");
 listeners.click({target:{id:"suggest",closest:()=>null}});
 for(const [id,value] of [["g2_1","0"],["g2_2","5"],["g2_3","3"]]){
  listeners.change({target:target("weight",null,id,value).el});
 }
 listeners.click({target:{id:"freeze",closest:()=>null}});
 const h=workbench.innerHTML;
 assert.equal(countRe(h,/data-range="lesson"/g),13);
 assert.equal(countRe(h,/data-range="discussion"/g),7);
 assert.match(h,/غير منقّط \(وزن صفر\)/);
 assert.doesNotMatch(h,/id="score-lesson-g2_1"/);
 assert.match(h,/max="5" step="0.5" value="0" data-range="lesson" data-score-id="g2_2" data-empty="true"/);
});
test("responsive score controls use full-width range tracks, explicit focus and an LTR spatial scale",()=>{
 assert.match(style,/\.score-controls\{/);
 assert.match(style,/\.score-range\{/);
 assert.match(style,/height:44px/);
 assert.match(style,/\.range-scale\{/);
 assert.match(style,/::-moz-range-thumb/);
 assert.match(style,/::-webkit-slider-thumb/);
 assert.match(style,/@media\(max-width:850px\)/);
 assert.match(source,/aria-valuetext/);
 assert.match(source,/data-empty/);
 assert.match(source,/--range-progress/);
});
