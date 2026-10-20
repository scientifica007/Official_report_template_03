import test from "node:test";
import assert from "node:assert/strict";
import {freshCommittee,changeMode,editNote,editScore,submit,fillDemoMember} from "../prototypes/titularisation-committee/committee-engine.mjs";
class FakeEl{
 constructor(tag){this.tag=tag;this.children=[];this.textContent="";this.value="";this.handlers={};this.className=""}
 append(...items){this.children.push(...items)}
 replaceChildren(){this.children=[]}
 addEventListener(name,fn){this.handlers[name]=fn}
 setAttribute(key,value){this[key]=value}
}
globalThis.document={createElement:tag=>new FakeEl(tag)};
const {renderForm}=await import("../prototypes/titularisation-committee/form-ui.mjs");
const buttons=e=>[...(e.tag==="button"?[e]:[]),...e.children.flatMap(buttons)];
const match=(e,part)=>buttons(e).find(b=>b.textContent.includes(part));
const state=()=>changeMode(freshCommittee(),"individual");
test("one clearly labeled demo button appears in editable member area, never in chair final",()=>{
 let s=state(),target=new FakeEl("section");
 renderForm(target,s,"member1",()=>{});
 assert.ok(match(target,"ملء بيانات تجريبية لهذا العضو"));
 assert.ok(match(target,"إرسال مساهمتي"));
 target=new FakeEl("section");
 renderForm(target,s,"final",()=>{});
 assert.equal(match(target,"ملء بيانات تجريبية لهذا العضو"),undefined);
 target=new FakeEl("section");
 renderForm(target,freshCommittee(),"final",()=>{});
 assert.equal(match(target,"ملء بيانات تجريبية لهذا العضو"),undefined);
});
test("demo click fills chosen member without sending, leaving the send control usable",()=>{
 let s=state(),target=new FakeEl("section");
 const commit=fn=>{s=fn()};
 renderForm(target,s,"member1",commit);
 const button=match(target,"ملء بيانات تجريبية لهذا العضو");
 button.handlers.click();
 assert.equal(s.members.member1.grading.scores.lesson.g1!==undefined,true);
 assert.equal(s.members.member1.notes.general.startsWith("بيانات تجريبية"),true);
 assert.equal(s.members.member1.submitted,false);
 assert.equal(s.members.member2.grading.scores.lesson.g1,undefined);
 target=new FakeEl("section");
 renderForm(target,s,"member1",commit);
 match(target,"إرسال مساهمتي").handlers.click();
 assert.equal(s.members.member1.submitted,true);
 target=new FakeEl("section");
 renderForm(target,s,"member1",commit);
 assert.equal(match(target,"ملء بيانات تجريبية لهذا العضو"),undefined);
});
test("overwriting manually entered score/notes asks confirmation and respects cancellation",()=>{
 let s=state(),target=new FakeEl("section"),calls=0;
 s=editScore(s,"member3","lesson","g1",4);
 s=editNote(s,"member3","general","تقدير كتبته بنفسي");
 const commit=fn=>{s=fn()};
 globalThis.confirm=()=>{calls++;return false};
 renderForm(target,s,"member3",commit);
 match(target,"ملء بيانات تجريبية لهذا العضو").handlers.click();
 assert.equal(calls,1);
 assert.equal(s.members.member3.grading.scores.lesson.g1,4);
 assert.equal(s.members.member3.notes.general,"تقدير كتبته بنفسي");
 globalThis.confirm=()=>{calls++;return true};
 match(target,"ملء بيانات تجريبية لهذا العضو").handlers.click();
 assert.equal(calls,2);
 assert.match(s.members.member3.notes.general,/بيانات تجريبية/);
});
test("14-indicator screen requests frozen weights instead of showing fill button",()=>{
 const s=changeMode(freshCommittee("unified","analytical14"),"individual");
 const target=new FakeEl("section");
 renderForm(target,s,"member2",()=>{});
 assert.equal(match(target,"ملء بيانات تجريبية لهذا العضو"),undefined);
});
