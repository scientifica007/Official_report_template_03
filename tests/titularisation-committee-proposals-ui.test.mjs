import test from "node:test";
import assert from "node:assert/strict";
import {freshCommittee,changeMode,editScore,editNote,submit} from "../prototypes/titularisation-committee/committee-engine.mjs";
class El{
 constructor(tag){this.tag=tag;this.children=[];this.textContent="";this.value="";this.handlers={};this.className=""}
 append(...values){this.children.push(...values)}
 replaceChildren(){this.children=[]}
 setAttribute(key,value){this[key]=value}
 addEventListener(name,fn){this.handlers[name]=fn}
}
globalThis.document={createElement:tag=>new El(tag)};
const {renderForm}=await import("../prototypes/titularisation-committee/form-ui.mjs");
const {renderDocuments}=await import("../prototypes/titularisation-committee/preview.mjs");
const all=(node,tag)=>[...(node.tag===tag?[node]:[]),...node.children.flatMap(child=>all(child,tag))];
const text=node=>[node.textContent,...node.children.map(text)].join(" ");
const button=(root,part)=>all(root,"button").find(el=>el.textContent.includes(part));
test("chair editing is prefilled from individual marks and text, with visible authors",()=>{
 let state=changeMode(freshCommittee(),"individual");
 for(const [seat,grade,note] of [["chair",2,"ملاحظة رئيس اللجنة"],["member1",2.5,"ملاحظة العضو الأول"],["member2",3,"ملاحظة العضو الثاني"],["member3",2,"ملاحظة العضو الثالث"]]){
  state=editScore(state,seat,"lesson","g1",grade);
  state=editNote(state,seat,"lesson",note,"g1");
  state=submit(state,seat);
 }
 const ui=new El("main");
 const apply=fn=>{state=fn()};
 renderForm(ui,state,"final",apply);
 const t=text(ui);
 assert.match(t,/العضو الأول: 2.5/);
 assert.match(t,/المتوسط: 9.5 ÷ 4 = 2.375/);
 assert.ok(button(ui,"تقريب للأسفل"));
 assert.ok(button(ui,"تقريب للأعلى"));
 const scores=all(ui,"input");
 assert.equal(scores[0].value,2.5);
 const notes=all(ui,"textarea");
 assert.match(notes[0].value,/ملاحظة رئيس اللجنة/);
 assert.match(notes[0].value,/ملاحظة العضو الثالث/);
 button(ui,"تقريب للأسفل").handlers.click();
 assert.equal(state.final.grading.scores.lesson.g1,2);
 const preview=new El("section");
 renderDocuments(preview,state);
 assert.match(text(preview),/2 \/ 12/);
});
test("subsequent member submissions do not overwrite authored chair fields",()=>{
 let state=changeMode(freshCommittee(),"individual");
 state=editScore(state,"member1","lesson","g1",3);
 state=editNote(state,"member1","general","رأي أول");
 state=submit(state,"member1");
 state=editScore(state,"final","lesson","g1",8);
 state=editNote(state,"final","general","نص المفتش النهائي");
 state=editScore(state,"member2","lesson","g1",1);
 state=editNote(state,"member2","general","رأي إضافي");
 state=submit(state,"member2");
 const ui=new El("main");
 renderForm(ui,state,"final",()=>{});
 assert.equal(all(ui,"input")[0].value,8);
 const content=all(ui,"textarea").map(x=>x.value).join(" ");
 assert.match(content,/نص المفتش النهائي/);
 assert.doesNotMatch(content,/رأي إضافي/);
});
