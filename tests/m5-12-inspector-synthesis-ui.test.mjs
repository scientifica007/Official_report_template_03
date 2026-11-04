import test from "node:test";
import assert from "node:assert/strict";
import {mountInspectorSynthesis} from "../prototypes/titularisation-committee/inspector-synthesis-ui.mjs";
const id="11111111-1111-4111-8111-111111111111";
class Element{
 constructor(tag){
  this.tag=tag;this.children=[];this.events={};this.hidden=false;
  this.textContent="";this.id="";this.className="";this.disabled=false;
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

const multiFixture=(revision=1)=>{
 const source=fixture();
 source.rows[0].revision=revision;
 source.rows[0].notes.lesson={
  g1:"أحسن الأستاذ تنظيم الحصة",
  g2:"وزع الأستاذ الزمن بين الأنشطة"
 };
 source.rows[0].notes.discussion={d1:"قدم الأستاذ توضيحات دقيقة"};
 return source;
};
const insertButtons=panel=>collect(panel,e=>
 e.tag==="button"&&(
  e.textContent==="إدراج هذه الصياغة في تقدير المفتش"||
  e.textContent==="تم إدراج الصياغة في تقدير المفتش"
 ));
test("M5.12 continuous: inspector can insert all three proposals without regenerating or reopening",async()=>{
 let reads=0;
 const x=setup(async()=>{reads++;return multiFixture()});
 await x.controller.activate(id);
 const generate=find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات");
 await generate.emit("click");
 const buttons=insertButtons(x.controller.panel);
 assert.equal(buttons.length,3);
 assert.equal(reads,2,"owner checked at activation and on generation");
 const progress=x.controller.panel.querySelector("#synthesis-progress");
 assert.match(progress.textContent,/0 من 3/);
 await buttons[0].emit("click");
 assert.equal(x.controller.panel.hidden,false);
 assert.equal(buttons[0].disabled,true);
 assert.equal(buttons[1].disabled,false);
 assert.ok(x.controller.panel.querySelector("#synthesis-results").children.length>0);
 assert.match(progress.textContent,/1 من 3/);
 assert.equal(x.applied.length,1);
 await buttons[1].emit("click");
 assert.equal(buttons[1].disabled,true);
 assert.match(progress.textContent,/2 من 3/);
 assert.equal(x.applied.length,2);
 await buttons[2].emit("click");
 assert.equal(buttons[2].disabled,true);
 assert.match(progress.textContent,/3 من 3/);
 assert.equal(x.applied.length,3);
 assert.equal(reads,5,"owner authorization is rechecked for each insertion");
 assert.match(x.controller.panel.querySelector("#synthesis-status").textContent,/جميع الصياغات/);
 assert.equal(x.controller.panel.hidden,false);
 await buttons[0].emit("click");
 assert.equal(x.applied.length,3,"same proposal cannot be inserted twice without regenerating");
});
test("M5.12 continuous: manual editor changes after first insertion still invalidate remaining cached proposals",async()=>{
 const x=setup(async()=>multiFixture());
 await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 const buttons=insertButtons(x.controller.panel);
 await buttons[0].emit("click");
 x.state.serial++;
 await buttons[1].emit("click");
 assert.equal(x.applied.length,1);
 assert.equal(buttons[1].disabled,false);
 assert.match(x.controller.panel.querySelector("#synthesis-status").textContent,/تغيرت المسودة/);
 assert.equal(x.controller.panel.hidden,false);
});
test("M5.12 continuous: corrected member assessment after first insertion blocks later stale fields",async()=>{
 let revision=1;
 const x=setup(async()=>multiFixture(revision));
 await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 const buttons=insertButtons(x.controller.panel);
 await buttons[0].emit("click");
 revision=2;
 await buttons[1].emit("click");
 assert.equal(x.applied.length,1);
 assert.match(x.controller.panel.querySelector("#synthesis-status").textContent,/عُدّلت مساهمات/);
});
test("M5.12 continuous: refusal at an explicit confirmation leaves suggestions and progress intact",async()=>{
 const oldConfirm=globalThis.confirm;
 try{
  globalThis.confirm=()=>false;
  const x=setup(async()=>multiFixture());
  await x.controller.activate(id);
  await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
  const buttons=insertButtons(x.controller.panel);
  await buttons[0].emit("click");
  assert.equal(x.applied.length,0);
  assert.equal(buttons[0].disabled,false);
  assert.match(x.controller.panel.querySelector("#synthesis-progress").textContent,/0 من 3/);
  assert.equal(x.controller.panel.hidden,false);
 }finally{globalThis.confirm=oldConfirm}
});
test("M5.12 continuous: mission reset during async owner check cannot apply stale insertion",async()=>{
 let release;
 let requests=0;
 const x=setup(async()=>{
  requests++;
  if(requests!==3)return multiFixture();
  return new Promise(resolve=>{release=resolve});
 });
 await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 const buttons=insertButtons(x.controller.panel);
 const pending=buttons[0].emit("click");
 x.controller.reset();
 release(multiFixture());
 await pending;
 assert.equal(x.applied.length,0);
 assert.equal(x.controller.panel.hidden,true);
 assert.equal(x.controller.panel.children.length,0);
});
