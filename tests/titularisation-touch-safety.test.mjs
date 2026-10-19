import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync("prototypes/titularisation-workbench/app.mjs","utf8");
const css=readFileSync("prototypes/titularisation-workbench/style.css","utf8");
const events={},winEvents={},dynamic=new Map();
const summary={outerHTML:""};
const workbench={
 innerHTML:"",
 addEventListener(type,fn){events[type]=fn},
 querySelector(sel){return sel==="[data-totals-panel]"?summary:null}
};
const fixed={
 rubric:{value:"grouped5",addEventListener(type,fn){events["rubric:"+type]=fn}},
 "rubric-origin":{textContent:""},
 workbench,
 feedback:{textContent:""},
 export:{addEventListener(type,fn){events["export:"+type]=fn}},
 import:{addEventListener(type,fn){events["import:"+type]=fn}}
};
globalThis.window={
 matchMedia:()=>({matches:true}),
 navigator:{maxTouchPoints:5},
 addEventListener(type,fn){winEvents[type]=fn}
};
globalThis.document={
 getElementById(id){
  if(Object.hasOwn(fixed,id))return fixed[id];
  if(!dynamic.has(id))dynamic.set(id,{value:""});
  return dynamic.get(id);
 }
};
globalThis.confirm=()=>true;
await import("../prototypes/titularisation-workbench/app.mjs");

const count=(text,needle)=>text.split(needle).length-1;
const reset=(key="grouped5")=>events["rubric:change"]({target:{value:key}});
function control(kind,phase,id,value="0",max=12){
 const el={
  dataset:{scoreId:id},
  value,max:String(max),
  attrs:{},css:{},
  style:{setProperty(name,value){el.css[name]=value}},
  setAttribute(name,value){el.attrs[name]=value},
  closest(selector){
   if(selector==="[data-enable-range]")return kind==="unlock"?el:null;
   if(selector==="[data-range]")return kind==="range"?el:null;
   if(selector==="[data-score]")return kind==="number"?el:null;
   if(selector==="[data-weight]")return kind==="weight"?el:null;
   if(selector===".score-range-wrap")return {querySelector:()=>({textContent:""})};
   return null;
  }
 };
 if(kind==="range")Object.assign(el.dataset,{range:phase,empty:"true"});
 if(kind==="unlock")el.dataset.enableRange=phase;
 if(kind==="number")el.dataset.score=phase;
 if(kind==="weight")el.dataset.weight=id;
 return el;
}
function open(phase,id){events.click({target:control("unlock",phase,id)})}

test("coarse-pointer phones start in safe scrolling mode, with every range locked and all numeric inputs enabled",()=>{
 reset("grouped5");
 const h=workbench.innerHTML;
 assert.equal(count(h,'data-range="lesson"'),5);
 assert.equal(count(h,'data-range="discussion"'),7);
 assert.equal(count(h,'data-touch-locked="true"'),12);
 assert.equal(count(h,'data-enable-range='),12);
 assert.equal(count(h,'aria-pressed="false"'),12);
 assert.match(h,/id="score-lesson-g1"[^>]*step="0.5" value=""/);
 assert.match(h,/id="range-lesson-g1"[^>]*data-touch-locked="true" tabindex="-1" aria-disabled="true"/);
 assert.match(h,/الشريط محمي من لمس التمرير/);
});
test("an accidental tap, drag or synthetic range change while locked cannot change saved grades",()=>{
 reset();
 const locked=control("range","lesson","g1","9.5");
 events.input({target:locked});
 events.change({target:locked});
 events.click({target:locked});
 assert.match(workbench.innerHTML,/id="score-lesson-g1"[^>]*value=""/);
 assert.match(workbench.innerHTML,/data-touch-locked="true"/);
 assert.doesNotMatch(workbench.innerHTML,/id="score-lesson-g1"[^>]*value="9.5"/);
});
test("explicit unlock affects only one slider and does not write a score",()=>{
 reset();
 open("lesson","g1");
 const h=workbench.innerHTML;
 assert.equal(count(h,'data-touch-locked="false"'),1);
 assert.equal(count(h,'aria-pressed="true"'),1);
 assert.match(h,/id="range-lesson-g1"[^>]*data-touch-locked="false"/);
 assert.match(h,/id="score-lesson-g1"[^>]*value=""/);
 open("lesson","g2");
 assert.match(workbench.innerHTML,/id="range-lesson-g1"[^>]*data-touch-locked="true"/);
 assert.match(workbench.innerHTML,/id="range-lesson-g2"[^>]*data-touch-locked="false"/);
});
test("moving an unlocked range writes a score in 0.5 steps, then automatically locks it again",()=>{
 reset("inspector10");
 open("lesson","c1");
 const range=control("range","lesson","c1","2.5",5);
 events.input({target:range});
 assert.equal(dynamic.get("score-lesson-c1").value,"2.5");
 events.change({target:range});
 assert.match(workbench.innerHTML,/id="score-lesson-c1"[^>]*value="2.5"/);
 assert.equal(count(workbench.innerHTML,'data-touch-locked="false"'),0);
 const stray=control("range","lesson","c1","4.5",5);
 events.input({target:stray});
 assert.match(workbench.innerHTML,/id="score-lesson-c1"[^>]*value="2.5"/);
});
test("vertical page scrolling automatically relocks an activated range and preserves the existing mark",()=>{
 reset();
 open("lesson","g1");
 const range=control("range","lesson","g1","3.5",12);
 events.change({target:range});
 open("lesson","g1");
 assert.equal(count(workbench.innerHTML,'data-touch-locked="false"'),1);
 winEvents.scroll();
 assert.equal(count(workbench.innerHTML,'data-touch-locked="false"'),0);
 assert.match(workbench.innerHTML,/id="score-lesson-g1"[^>]*value="3.5"/);
 events.input({target:control("range","lesson","g1","10",12)});
 assert.match(workbench.innerHTML,/id="score-lesson-g1"[^>]*value="3.5"/);
});
test("direct number field editing still works even when the range is locked",()=>{
 reset();
 const number=control("number","lesson","g1","4.5");
 events.change({target:number});
 assert.match(workbench.innerHTML,/id="score-lesson-g1"[^>]*value="4.5"/);
 assert.match(workbench.innerHTML,/id="range-lesson-g1"[^>]*value="4.5"/);
 assert.equal(count(workbench.innerHTML,'data-touch-locked="false"'),0);
});
test("touch zero is allowed only after deliberate unlock, never by swiping on a locked track",()=>{
 reset();
 const range=control("range","lesson","g1","0");
 events.click({target:range});
 assert.match(workbench.innerHTML,/id="score-lesson-g1"[^>]*value=""/);
 open("lesson","g1");
 events.click({target:range});
 assert.match(workbench.innerHTML,/id="score-lesson-g1"[^>]*value="0"/);
 assert.equal(count(workbench.innerHTML,'data-touch-locked="false"'),0);
});
test("discussion and analytical rubrics have the same protection, preserving zero-weight behavior",()=>{
 reset("grouped5");
 open("discussion","d1");
 assert.match(workbench.innerHTML,/id="range-discussion-d1"[^>]*data-touch-locked="false"/);
 reset("analytical14");
 assert.equal(count(workbench.innerHTML,'data-range="lesson"'),0);
 events.click({target:{id:"suggest",closest:()=>null}});
 for(const [id,value] of [["g2_1","0"],["g2_2","5"],["g2_3","3"]]){
  events.change({target:control("weight",null,id,value)});
 }
 events.click({target:{id:"freeze",closest:()=>null}});
 assert.equal(count(workbench.innerHTML,'data-range="lesson"'),13);
 assert.equal(count(workbench.innerHTML,'data-enable-range='),13+7);
 assert.match(workbench.innerHTML,/غير منقّط \(وزن صفر\)/);
 open("lesson","g2_2");
 assert.match(workbench.innerHTML,/id="range-lesson-g2_2"[^>]*data-touch-locked="false"/);
});
test("CSS lets vertical touch scroll through a locked slider, with explicit unlock affordance",()=>{
 assert.match(css,/\.score-range\[data-touch-locked="true"\]\{pointer-events:none/);
 assert.match(css,/\.score-range-wrap\{touch-action:pan-y\}/);
 assert.match(css,/button\.range-enable/);
 assert.match(css,/min-height:40px/);
 assert.match(source,/window\.matchMedia\?\./);
 assert.match(source,/window\.addEventListener\('scroll'/);
 assert.match(source,/activeTouchRangeKey=null/);
});
