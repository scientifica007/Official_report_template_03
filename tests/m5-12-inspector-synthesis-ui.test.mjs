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

test("M5.13: inspector edits a candidate before insertion without modifying member source text",async()=>{
 const x=setup();
 await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 const textarea=find(x.controller.panel,e=>e.tag==="textarea");
 const button=find(x.controller.panel,e=>e.textContent==="إدراج هذه الصياغة في تقدير المفتش");
 const origin=find(x.controller.panel,e=>e.textContent==="أحسن الأستاذ تنظيم الحصة");
 assert.ok(textarea);assert.ok(button);
 textarea.value="نظم الأستاذ الحصة بصورة جيدة، مع تحسين تسيير الوقت.";
 await button.emit("click");
 assert.deepEqual(x.applied,[{field:"lesson",item:"g1",text:textarea.value}]);
 assert.equal(textarea.readOnly,true);
 assert.equal(button.disabled,true);
 assert.equal(x.controller.panel.hidden,false);
 // Source is independently stored in the review, not edited in place.
 assert.ok(find(x.controller.panel,e=>e.textContent.includes("أحسن الأستاذ تنظيم الحصة")));
 assert.ok(origin);
});
test("M5.13: restore button resets only the editable proposal, not the inspector report",async()=>{
 const x=setup();await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 const textarea=find(x.controller.panel,e=>e.tag==="textarea");
 textarea.value="صياغة معدّلة";
 const restore=find(x.controller.panel,e=>e.textContent==="استعادة الصياغة الأصلية");
 await restore.emit("click");
 assert.equal(textarea.value,"أحسن الأستاذ تنظيم الحصة.");
 assert.equal(x.applied.length,0);
});
test("M5.13: proposed attribution to a committee member cannot enter final report",async()=>{
 const x=setup();await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 const textarea=find(x.controller.panel,e=>e.tag==="textarea");
 textarea.value="ورد في تقديرات العضو الأول أنه أحسن تنظيم الحصة";
 await find(x.controller.panel,e=>e.textContent==="إدراج هذه الصياغة في تقدير المفتش").emit("click");
 assert.equal(x.applied.length,0);
 assert.match(x.controller.panel.querySelector("#synthesis-status").textContent,/نسبة قول/);
});
test("M5.13: numeric claim not in member observations requires an explicit source warning",async()=>{
 const previous=globalThis.confirm;let confirmation="";
 try{
  globalThis.confirm=message=>{confirmation=message;return false};
  const x=setup();await x.controller.activate(id);
  await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
  const textarea=find(x.controller.panel,e=>e.tag==="textarea");
  textarea.value="أحسن الأستاذ تنظيم الحصة، بنسبة إنجاز 95%.";
  await find(x.controller.panel,e=>e.textContent==="إدراج هذه الصياغة في تقدير المفتش").emit("click");
  assert.match(confirmation,/95%/);
  assert.match(confirmation,/منقّحة بواسطتك/);
  assert.equal(x.applied.length,0);
  assert.equal(x.controller.panel.hidden,false);
 }finally{globalThis.confirm=previous}
});
test("M5.13: empty editorial draft never overwrites a field",async()=>{
 const x=setup();await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 const textarea=find(x.controller.panel,e=>e.tag==="textarea");
 textarea.value="   ";
 await find(x.controller.panel,e=>e.textContent==="إدراج هذه الصياغة في تقدير المفتش").emit("click");
 assert.equal(x.applied.length,0);
 assert.match(x.controller.panel.querySelector("#synthesis-status").textContent,/الصياغة فارغة/);
});

test("M5.14 UI: authenticated inspector sees non-causal map with both original sources",async()=>{
 const src=()=>{
  const s=fixture("لم يحسن الأستاذ توزيع وقت الحصة");
  s.rows.push({seat_code:"member2",revision:2,
   submitted_at:"2026-11-04T22:40:00Z",
   notes:{lesson:{g2:"لم يستكمل الأستاذ النشاط التطبيقي"},discussion:{},
    lessonSummary:"",discussionSummary:"",general:"",recommendations:""}});
  return s;
 };
 const x=setup(async()=>src());
 await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 const panel=find(x.controller.panel,e=>e.className==="semantic-overview");
 assert.ok(panel);
 assert.ok(find(panel,e=>e.textContent.includes("خريطة العلاقات الدلالية البيداغوجية")));
 assert.ok(find(panel,e=>e.textContent.includes("علاقات موضوعية غير سببية")));
 assert.ok(find(panel,e=>e.textContent.includes("لا تثبت الملاحظتان")));
 assert.ok(find(panel,e=>e.textContent==="لم يحسن الأستاذ توزيع وقت الحصة"));
 assert.ok(find(panel,e=>e.textContent==="لم يستكمل الأستاذ النشاط التطبيقي"));
 assert.equal(x.applied.length,0,"semantic review must never write notes by itself");
 assert.ok(find(x.controller.panel,e=>e.textContent==="إدراج هذه الصياغة في تقدير المفتش"));
});
test("M5.14 UI: same-field contradictory judgment keeps original quotes but disables blind insertion",async()=>{
 const x=setup(async()=>{
  const s=fixture("أحسن الأستاذ توزيع الوقت");
  s.rows.push({seat_code:"member2",revision:1,
   notes:{lesson:{g1:"التسيير الزمني ضعيف"},discussion:{},
    lessonSummary:"",discussionSummary:"",general:"",recommendations:""}});
  return s;
 });
 await x.controller.activate(id);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 assert.ok(find(x.controller.panel,e=>e.textContent.includes("اختلاف لفظي بيداغوجي محتمل")));
 assert.ok(find(x.controller.panel,e=>e.textContent==="أحسن الأستاذ توزيع الوقت"));
 assert.ok(find(x.controller.panel,e=>e.textContent==="التسيير الزمني ضعيف"));
 assert.ok(!find(x.controller.panel,e=>e.textContent==="إدراج هذه الصياغة في تقدير المفتش"));
 assert.equal(x.applied.length,0);
});

test("P2 production: owner can generate and insert synthesis without QA marker",async()=>{
 const x=setup(async()=>{
  const verified=fixture("أحسن الأستاذ تنظيم الحصة");
  verified.qa_only=false;
  verified.production_owner=true;
  verified.rows[0].revision=13;
  return verified;
 });
 await x.controller.activate(id);
 assert.equal(x.controller.panel.hidden,false);
 await find(x.controller.panel,e=>e.textContent==="تكوين مقترحات التقديرات").emit("click");
 const insert=find(x.controller.panel,e=>e.textContent==="إدراج هذه الصياغة في تقدير المفتش");
 assert.ok(insert,"production synthesis should generate an editable proposal");
 await insert.emit("click");
 assert.equal(x.applied.length,1,"the production insertion recheck must accept the owner source");
 assert.equal(x.applied[0].field,"lesson");
 assert.equal(x.applied[0].item,"g1");
});

test("P2 production: sources without verified owner remain inaccessible",async()=>{
 const x=setup(async()=>{
  const unverifiable=fixture();
  unverifiable.qa_only=false;
  unverifiable.production_owner=true;
  unverifiable.owner_only=false;
  return unverifiable;
 });
 await assert.rejects(x.controller.activate(id),/صلاحية/);
 assert.equal(x.controller.panel.hidden,true);
 assert.equal(x.applied.length,0);
});
