import test from "node:test";
import assert from "node:assert/strict";

class FakeElement {
 constructor(tag="div"){this.tag=tag;this.children=[];this.textContent="";this.value="";this.handlers={};this.className="";this.attributes={}}
 append(...items){this.children.push(...items)}
 replaceChildren(){this.children=[]}
 addEventListener(type,fn){this.handlers[type]=fn}
 setAttribute(name,val){this.attributes[name]=val}
}
const ids=new Map();
for(const id of ["mode","rubric","who","meta","weights","editor","members","paper","message","save","load","print"])
 ids.set(id,new FakeElement(id==="mode"||id==="rubric"||id==="who"?"select":"div"));
globalThis.document={
 getElementById:id=>ids.get(id),
 createElement:tag=>new FakeElement(tag),
 body:new FakeElement("body")
};
let confirms=0;
globalThis.confirm=()=>{confirms++;throw Error("Mode switch should never show confirm")};
await import("../prototypes/titularisation-committee/app.mjs");
const $=id=>ids.get(id);
const walk=(root,predicate)=>[...(predicate(root)?[root]:[]),...root.children.flatMap(x=>walk(x,predicate))];
const button=(root,label)=>walk(root,x=>x.tag==="button"&&x.textContent.includes(label))[0];
function changeSelect(id,value){
 const el=$(id);el.value=value;el.handlers.change({target:el});
}
test("default remains unified until changed, then selecting individual stays selected without any browser confirmation",()=>{
 assert.equal($("mode").value,"unified");
 changeSelect("mode","individual");
 assert.equal($("mode").value,"individual");
 assert.equal($("who").value,"chair");
 assert.equal($("who").children.length,5,"final plus four individual seats");
 assert.match($("message").textContent,/تم تفعيل «مساهمات فردية»/);
 assert.equal(confirms,0);
});
test("first simulated member displays demo fill button immediately after mode selection",()=>{
 assert.ok(button($("editor"),"ملء بيانات تجريبية لهذا العضو"));
 assert.ok(button($("editor"),"إرسال مساهمتي"));
});
test("switching back to unified and again to individual preserves saved member submissions",()=>{
 // Populate chair role then send, no modal is required for an empty draft.
 button($("editor"),"ملء بيانات تجريبية لهذا العضو").handlers.click();
 assert.ok(button($("editor"),"إرسال مساهمتي"));
 button($("editor"),"إرسال مساهمتي").handlers.click();
 assert.match($("editor").children.map(x=>x.textContent).join(" "),/محاكاة رئيس اللجنة/);
 // Switch to second seat and exercise its demo fill.
 changeSelect("who","member1");
 button($("editor"),"ملء بيانات تجريبية لهذا العضو").handlers.click();
 button($("editor"),"إرسال مساهمتي").handlers.click();
 assert.match($("members").children.map(x=>x.textContent).join(" "),/مساهمات اللجنة/);
 changeSelect("mode","unified");
 assert.equal($("mode").value,"unified");
 assert.equal($("who").value,"final");
 assert.equal($("who").children.length,1);
 assert.match($("message").textContent,/مساهمات الأعضاء السابقة محفوظة/);
 changeSelect("mode","individual");
 assert.equal($("mode").value,"individual");
 assert.equal($("who").value,"chair");
 assert.equal(button($("editor"),"ملء بيانات تجريبية لهذا العضو"),undefined,"submitted chair remains submitted");
 changeSelect("who","member1");
 assert.equal(button($("editor"),"ملء بيانات تجريبية لهذا العضو"),undefined,"submitted member1 remains submitted");
 assert.ok(button($("editor"),"إعادة فتح مساهمتي"));
 assert.equal(confirms,0);
});
test("a redundant selection does not reset the current member",()=>{
 changeSelect("who","member2");
 changeSelect("mode","individual");
 assert.equal($("who").value,"member2");
 assert.equal(confirms,0);
});
