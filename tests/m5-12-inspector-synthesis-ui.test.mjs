import test from "node:test";
import assert from "node:assert/strict";
import {mountInspectorSynthesis} from "../prototypes/titularisation-committee/inspector-synthesis-ui.mjs";
const id="11111111-1111-4111-8111-111111111111";
class Element{
 constructor(tag){
  this.tag=tag;this.children=[];this.events={};this.hidden=false;
  this.textContent="";this.id="";this.className="";
 }
 append(...items){this.children.push(...items)}
 replaceChildren(...items){this.children=[...items]}
 addEventListener(key,handler){(this.events[key]??=[]).push(handler)}
 insertAdjacentElement(where,el){this.adjacent=el;return el}
 setAttribute(key,val){this[key]=String(val)}
 querySelector(selector){
  const key=selector.replace(/^#/,"");
  const find=e=>e.id===key?e:e.children.map(find).find(Boolean);
  return find(this)||null;
 }
 async emit(key){for(const fn of this.events[key]||[])await fn({target:this})}
}
globalThis.document={createElement:tag=>new Element(tag)};
globalThis.confirm=()=>true;
const find=(root,pred)=>{
 if(pred(root))return root;
 for(const child of root.children){const match=find(child,pred);if(match)return match}
 return null;
};
const collect=(root,pred)=>[...(pred(root)?[root]:[]),...root.children.flatMap(x=>collect(x,pred))];
const fixture=(text="أحسن الأستاذ تنظيم الحصة")=>({
 owner_only:true,qa_only:true,mission_id:id,rubric_id:"lesson_grouped_5_v1",
 rows:[{seat_code:"member1",revision:1,submitted_at:"2026-11-04T19:00:00Z",
  notes:{lesson:{g1:text},discussion:{},lessonSummary:"",
   discussionSummary:"",general:"",recommendations:""}}]
});
function setup(loadSources=async()=>fixture()){
 const anchor=new Element("section");
 const state={rubricId:"lesson_grouped_5_v1",serial:1,
  final:{notes:{lesson:{},discussion:{},general:""}}};
 const applied=[];let who="final",mission=id;
 const controller=mountInspectorSynthesis({
  anchor,loadSources,getState:()=>state,getWho:()=>who,
  getMissionId:()=>mission,
  applyNote:(field,item,text)=>{applied.push({field,item,text});state.serial++}
 });
 return {controller,state,applied,anchor,chooseWho:x=>who=x,
  switchMission:x=>mission=x};
}
test("owner-only UI: denial never reveals review panel or member text",async()=>{
 const x=setup(async()=>{throw Error("FORBIDDEN")});
 await assert.rejects(x.controller.activate(id),/FORBIDDEN/);
 assert.equal(x.controller.panel.hidden,true);
 assert.equal(x.controller.panel.children.length,0);
});
test("owner-only UI: no automatic insertion, explicit confirmation changes inspector field only",async()=>{
 const x=setup();await x.controller.activate(id);
 assert.equal(x.controller.panel.hidden,false);
 assert.equal(x.applied.length,0);
 const generate=find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات");
 await generate.emit("click");
 const insert=find(x.controller.panel,e=>e.textContent==="إدراج هذه الصياغة في تقدير المفتش");
 assert.ok(insert,"insertion offered for reviewable result");
 assert.equal(x.applied.length,0,"preview alone must not write into final notes");
 assert.ok(find(x.controller.panel,e=>e.textContent.includes("أحسن الأستاذ تنظيم الحصة")));
 await insert.emit("click");
 assert.equal(x.applied.length,1);
 assert.deepEqual(x.applied[0],{field:"lesson",item:"g1",text:"أحسن الأستاذ تنظيم الحصة."});
});
test("owner-only UI: simulation seat cannot generate or insert inspector syntheses",async()=>{
 const x=setup();await x.controller.activate(id);x.chooseWho("member1");
 const generate=find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات");
 await generate.emit("click");
 assert.equal(x.applied.length,0);
 assert.ok(!find(x.controller.panel,e=>e.textContent==="إدراج هذه الصياغة في تقدير المفتش"));
 assert.match(x.controller.panel.querySelector("#synthesis-status").textContent,/اختر/);
});
test("owner-only UI: changing inspector draft invalidates prior preview",async()=>{
 const x=setup();await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 const insert=find(x.controller.panel,e=>e.textContent==="إدراج هذه الصياغة في تقدير المفتش");
 x.state.serial++;
 await insert.emit("click");
 assert.equal(x.applied.length,0);
 assert.match(x.controller.panel.querySelector("#synthesis-status").textContent,/تغيرت المسودة/);
});
test("owner-only UI: revised member source invalidates the old preview before insertion",async()=>{
 let updated=false;
 const x=setup(async()=>fixture(updated?"تغيرت الملاحظة بعد المراجعة":"أحسن الأستاذ تنظيم الحصة"));
 await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 const insert=find(x.controller.panel,e=>e.textContent==="إدراج هذه الصياغة في تقدير المفتش");
 updated=true;
 await insert.emit("click");
 assert.equal(x.applied.length,0);
 assert.match(x.controller.panel.querySelector("#synthesis-status").textContent,/عُدّلت مساهمات/);
});
test("owner-only UI: mission change resets the whole review with no stale proposal",async()=>{
 const x=setup();await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 x.controller.reset();
 assert.equal(x.controller.panel.hidden,true);
 assert.equal(x.controller.panel.children.length,0);
 assert.equal(x.applied.length,0);
});
