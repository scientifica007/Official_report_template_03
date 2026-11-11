import test from "node:test";
import assert from "node:assert/strict";
import {renderForm} from "../prototypes/titularisation-committee/form-ui.mjs";
import {
 freshCommittee,assignPhaseTotal,editNote,editScore,submit,
 applySuggestedWeights,finalizeWeights,stringifyCommittee,restoreCommittee
} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {totals,lessonItems,DISCUSSION} from "../prototypes/titularisation-workbench/engine.mjs";
import {buildReferenceDocuments} from "../prototypes/titularisation-committee/document-model.mjs";

class FakeNode {
 constructor(tag){
  this.tag=tag;this.children=[];this.textContent="";this.value="";
  this.className="";this.events={};this.attributes={};this.style={setProperty(){}};
 }
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=[...nodes]}
 setAttribute(key,value){this.attributes[key]=value}
 addEventListener(key,listener){(this.events[key]??=[]).push(listener)}
 focus(){this.focused=true}
 click(){for(const action of this.events.click??[])action()}
}
globalThis.document={createElement:tag=>new FakeNode(tag)};
const descendants=(root,predicate)=>[
 ...(predicate(root)?[root]:[]),
 ...root.children.flatMap(node=>descendants(node,predicate))
];
function controls(root){
 const blocks=descendants(root,node=>node.className==="phase-total-allocation");
 return blocks.map(block=>({
  block,
  input:descendants(block,node=>node.tag==="input")[0],
  button:descendants(block,node=>node.tag==="button")[0]
 }));
}
function render(state,seat="final",onCommit=()=>{}){
 const root=new FakeNode("section");
 renderForm(root,state,seat,onCommit);
 return {root,sections:controls(root)};
}
function sample(rubric){
 let state=freshCommittee("individual",rubric);
 if(rubric==="analytical14"){
  state=applySuggestedWeights(state);
  state=finalizeWeights(state);
 }
 return state;
}
test("inspector sees two total-allocation controls; simulated members do not",()=>{
 for(const rubric of ["grouped5","inspector10","analytical14"]){
  const state=sample(rubric);
  const {sections}=render(state);
  assert.equal(sections.length,2,rubric+" must show lesson and discussion controls");
  assert.equal(sections[0].input.value,"");
  assert.equal(sections[1].input.value,"");
  assert.equal(sections[0].input.min,"0");
  assert.equal(sections[0].input.max,"40");
  assert.equal(sections[1].input.max,"20");
  assert.equal(sections[0].input.step,"0.5");
  assert.equal(sections[1].input.step,"0.5");
  assert.match(sections[0].button.textContent,/توزيع العلامة الكلية على مؤشرات الحصة/);
  assert.match(sections[1].button.textContent,/توزيع العلامة الكلية على مؤشرات المناقشة/);
  assert.equal(render(state,"member1").sections.length,0);
 }
});

test("inspector can distribute each exam independently, preserving member grades, notes and metadata",()=>{
 for(const rubric of ["grouped5","inspector10","analytical14"]){
  let state=sample(rubric);
  state=editNote(state,"final","lessonSummary","تقدير المفتش الأصلي للحصة");
  state=editNote(state,"final","discussionSummary","تقدير المفتش الأصلي للمناقشة");
  state=editScore(state,"member1","discussion","d1",1.5);
  const memberBefore=JSON.stringify(state.members);
  const notesBefore=JSON.stringify(state.final.notes);
  const {sections}=render(state,"final",fn=>{state=fn()});
  sections[0].input.value="28.5";
  sections[0].button.click();
  assert.equal(totals(state.final.grading).lesson.total,28.5);
  assert.equal(totals(state.final.grading).discussion.total,null);
  const lessonBefore=JSON.stringify(state.final.grading.scores.lesson);
  const second=render(state,"final",fn=>{state=fn()}).sections[1];
  second.input.value="13.5";
  second.button.click();
  const all=totals(state.final.grading);
  assert.equal(all.lesson.total,28.5);
  assert.equal(all.discussion.total,13.5);
  assert.equal(all.total60,42);
  assert.equal(JSON.stringify(state.final.grading.scores.lesson),lessonBefore);
  assert.equal(JSON.stringify(state.members),memberBefore);
  assert.equal(JSON.stringify(state.final.notes),notesBefore);
  for(const phase of ["lesson","discussion"]){
   const rows=phase==="lesson"?lessonItems(state.final.grading):DISCUSSION;
   for(const row of rows){
    const value=state.final.grading.scores[phase][row.id];
    if(row.cap===0){assert.equal(value,undefined);continue}
    assert.ok(Number.isInteger(value*2)&&value>=0&&value<=row.cap);
   }
  }
  assert.equal(buildReferenceDocuments(state).marks.total60,42);
  const restored=restoreCommittee(JSON.parse(stringifyCommittee(state)));
  assert.equal(totals(restored.final.grading).total60,42);
 }
});

test("initial allocation accepts zero and full caps without suggesting them as official approval",()=>{
 let state=sample("grouped5");
 let item=render(state,"final",fn=>{state=fn()}).sections[0];
 item.input.value="0";item.button.click();
 assert.equal(totals(state.final.grading).lesson.total,0);
 assert.equal(totals(state.final.grading).discussion.total,null);
 assert.equal(Object.values(state.final.grading.scores.lesson).every(v=>v===0),true);
 assert.equal(buildReferenceDocuments(state).marks.total20,null);
 item=render(state,"final",fn=>{state=fn()}).sections[1];
 item.input.value="20";item.button.click();
 assert.equal(totals(state.final.grading).total60,20);
 assert.equal(buildReferenceDocuments(state).resultsReady,false,"committee decision is still required");
});

test("previous inspector marks require confirmation, and rejection leaves every score unchanged",()=>{
 let state=sample("grouped5");
 state=editScore(state,"final","lesson","g1",2);
 const oldConfirm=globalThis.confirm;
 try{
  let prompts=0;
  globalThis.confirm=()=>{prompts++;return false};
  let section=render(state,"final",fn=>{state=fn()}).sections[0];
  section.input.value="30";section.button.click();
  assert.equal(prompts,1);
  assert.equal(state.final.grading.scores.lesson.g1,2);
  assert.equal(totals(state.final.grading).lesson.total,null);
  globalThis.confirm=()=>true;
  section=render(state,"final",fn=>{state=fn()}).sections[0];
  section.input.value="30";section.button.click();
  assert.equal(totals(state.final.grading).lesson.total,30);
 }finally{globalThis.confirm=oldConfirm}
});

test("invalid or incomplete totals cannot change final grading",()=>{
 const state=sample("grouped5"),before=JSON.stringify(state);
 let current=state;
 for(const value of ["","-0.5","11.25","40.5","not-a-number"]){
  const {sections}=render(current,"final",fn=>{current=fn()});
  sections[0].input.value=value;
  sections[0].button.click();
  assert.equal(JSON.stringify(current),before,value);
  assert.match(descendants(sections[0].block,node=>node.className==="warning")[0].textContent,/نصف نقطة/);
 }
});

test("member-derived suggestions are never displayed as inspector-entered phase totals",()=>{
 let state=sample("grouped5");
 state=assignPhaseTotal(state,"member1","lesson",27.5);
 state=submit(state,"member1");
 const {sections}=render(state);
 assert.equal(sections[0].input.value,"","no authored inspector marks yet");
 assert.equal(totals(state.final.grading).lesson.total,null);
 const sourceBefore=JSON.stringify(state.members.member1);
 const first=sections[0];let next=state;
 first.input.value="31";first.button.click();
 next=assignPhaseTotal(state,"final","lesson","31");
 assert.equal(totals(next.final.grading).lesson.total,31);
 assert.equal(JSON.stringify(next.members.member1),sourceBefore);
});
