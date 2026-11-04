import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {RUBRICS,DISCUSSION,newDraft,lessonItems,suggestedWeights,withScore} from "../prototypes/titularisation-workbench/engine.mjs";
import {createPairedScore} from "../shared/score-range.mjs";
const read=path=>readFileSync(path,"utf8");
class FakeElement{
 constructor(tag){
  this.tag=tag;this.children=[];this.events={};this.attrs={};this.value="";this.disabled=false;
  this.style={props:{},setProperty:(k,v)=>{this.style.props[k]=v}};
 }
 append(...args){this.children.push(...args)}
 setAttribute(k,v){this.attrs[k]=String(v)}
 addEventListener(k,fn){(this.events[k]??=[]).push(fn)}
 emit(k,data={}){for(const fn of this.events[k]||[])fn({target:this,...data})}
 querySelector(selector){
  const name=selector==="small"?"small":selector;
  const find=node=>node.children.find(c=>c.tag===name)||node.children.map(find).find(Boolean);
  return find(this)||null;
 }
}
globalThis.document={createElement:t=>new FakeElement(t)};
const element=(node,pred)=>pred(node)?node:node.children.map(c=>element(c,pred)).find(Boolean);
const numeric=(value="")=>{
 const e=document.createElement("input");e.type="number";e.value=String(value);
 return e;
};
const touch=(enabled=false)=>{
 const handlers={};
 globalThis.window={
  matchMedia:()=>({matches:enabled}),navigator:{maxTouchPoints:enabled?5:0},
  addEventListener:(event,fn)=>{handlers[event]=fn}
 };
 return handlers;
};

test("paired score: empty stays empty and a typed half-mark synchronizes range and filled track",()=>{
 touch(false);
 const n=numeric("");const commits=[];
 const pair=createPairedScore(n,{cap:12,label:"التنشيط",onRangeCommit:x=>commits.push(x)});
 const range=element(pair,x=>x.type==="range");
 assert.equal(range.value,"0");
 assert.equal(range.attrs["data-empty"],"true");
 assert.equal(commits.length,0);
 n.value="6";n.emit("input");
 assert.equal(range.value,"6");
 assert.equal(range.style.props["--range-progress"],"50%");
 assert.equal(range.attrs["aria-valuetext"],"6 من 12");
 n.value="";n.emit("input");
 assert.equal(range.attrs["data-empty"],"true");
 assert.equal(range.value,"0");
 assert.equal(commits.length,0);
 n.value="1.25";n.emit("input");
 assert.match(element(pair,x=>x.className==="range-status").textContent,/غير صالحة/);
 assert.equal(range.value,"0","invalid fractions cannot move the saved range");
});

test("paired score: slider updates visible number and commits only on release",()=>{
 touch(false);
 const n=numeric("");const changes=[],previews=[];
 const pair=createPairedScore(n,{cap:12,label:"التنشيط",
  onRangeInput:x=>previews.push(x),onRangeCommit:x=>changes.push(x)});
 const slider=element(pair,x=>x.type==="range");
 slider.value="2.5";slider.emit("input");
 assert.equal(n.value,"2.5");
 assert.deepEqual(previews,["2.5"]);
 assert.deepEqual(changes,[]);
 slider.emit("change");
 assert.deepEqual(changes,["2.5"]);
 assert.equal(slider.attrs["data-empty"],"false");
});

test("paired score: zero is explicit, not inferred from default range position",()=>{
 touch(false);
 const n=numeric("");const saved=[];
 const pair=createPairedScore(n,{cap:6,label:"مناقشة",onRangeCommit:x=>saved.push(x)});
 const slider=element(pair,x=>x.type==="range");
 assert.equal(saved.length,0);
 slider.emit("click");
 assert.deepEqual(saved,["0"]);
 assert.equal(n.value,"0");
 assert.equal(slider.attrs["data-empty"],"false");
});

test("paired score: coarse-pointer slider requires unlock and relocks after scoring",()=>{
 touch(true);
 const n=numeric("");const saved=[];
 const pair=createPairedScore(n,{cap:6,label:"مناقشة",onRangeCommit:x=>saved.push(x)});
 const slider=element(pair,x=>x.type==="range");
 const button=element(pair,x=>x.className==="range-enable");
 assert.equal(slider.attrs["data-touch-locked"],"true");
 slider.value="5";slider.emit("input");slider.emit("change");
 assert.equal(n.value,"");assert.deepEqual(saved,[]);
 button.emit("click");
 assert.equal(slider.attrs["data-touch-locked"],"false");
 slider.value="3.5";slider.emit("input");slider.emit("change");
 assert.equal(n.value,"3.5");assert.deepEqual(saved,["3.5"]);
 assert.equal(slider.attrs["data-touch-locked"],"true");
 slider.value="5";slider.emit("change");
 assert.deepEqual(saved,["3.5"]);
});

test("three rubrics share half-point controls and zero-weight indicators remain non-scoring",()=>{
 for(const rubric of ["grouped5","inspector10","analytical14"]){
  const d=newDraft(RUBRICS[rubric].id);
  if(rubric==="analytical14"){
   d.profile={frozen:true,weights:suggestedWeights()};
   // A zero-weight indicator is never assigned a range or a fabricated zero.
   d.profile.weights.g1_1=0;d.profile.weights.g1_2+=4;
  }
  const items=[...lessonItems(d),...DISCUSSION];
  for(const i of items){
   if(i.cap===0)continue;
   assert.equal(Number(i.cap)*2%1,0);
   const n=numeric("");
   const pair=createPairedScore(n,{cap:i.cap,label:i.label});
   const slider=element(pair,x=>x.type==="range");
   assert.equal(slider.step,"0.5");
   assert.equal(slider.max,String(i.cap));
  }
  assert.equal(withScore(d,"discussion","d1",0).scores.discussion.d1,0);
 }
});

test("committee, original report, QA and authenticated member serve the same slider CSS",()=>{
 const original=read("prototypes/titularisation-committee/index.html");
 const report=read("qa-titularisation/report/index.html");
 const qa=read("qa-titularisation/member/index.html");
 const member=read("committee-member/index.html");
 for(const page of [original,report,qa,member])
  assert.match(page,/shared\/score-range\.css/);
 const form=read("prototypes/titularisation-committee/form-ui.mjs");
 const memberJS=read("committee-member/app.mjs");
 assert.match(form,/createPairedScore\(field/);
 assert.match(form,/onRangeCommit:raw=>commit/);
 assert.match(memberJS,/createPairedScore\(score/);
 assert.match(memberJS,/onRangeInput:changeGrade,onRangeCommit:changeGrade/);
 assert.match(memberJS,/if\(item\.cap>0\)/);
 assert.match(memberJS,/send\.disabled=missing\.length>0/);
 const css=read("shared/score-range.css");
 assert.match(css,/data-touch-locked=true/);
 assert.match(css,/touch-action:pan-y/);
 assert.match(css,/range-progress/);
 for(const file of [
  "shared/score-range.mjs",
  "prototypes/titularisation-committee/form-ui.mjs",
  "committee-member/app.mjs"
 ])assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",file],{stdio:"pipe"}));
});
