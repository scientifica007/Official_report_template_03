import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 voiceComposeDraft,voiceRecognitionError,attachVoiceDictation,
 openVoiceDictation,dismissVoiceDictation,clearVoiceDrafts,pendingVoiceDraftCount
} from "../shared/voice-dictation.mjs";

let recognizers,timers;
class FakeElement{
 constructor(tag){
  this.tagName=tag;this.textContent="";this.value="";this.className="";
  this.children=[];this.after=[];this.events={};this.dataset={};
  this.disabled=false;this.readOnly=false;this.isConnected=true;
 }
 append(...nodes){
  for(const n of nodes){this.children.push(n);n.parent=this;}
 }
 setAttribute(name,value){this[name]=value}
 addEventListener(name,handler){(this.events[name]??=[]).push(handler)}
 dispatchEvent(event){
  for(const f of this.events[event.type]||[])f(event);
  return true;
 }
 click(){for(const f of this.events.click||[])f()}
 insertAdjacentElement(_where,e){this.after.push(e);e.parent=this}
 remove(){this.isConnected=false}
 focus(){}
 select(){}
}
class Recognition{
 constructor(){recognizers.push(this);this.calls=0;this.aborted=false}
 start(){this.calls++}
 stop(){this.onend?.()}
 abort(){this.aborted=true}
}
function setup({supported=true,key="model1|chair|lesson|g1_1"}={}){
 recognizers=[];timers=[];
 globalThis.window={
  ...(supported?{SpeechRecognition:Recognition}:{}),
  setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},
  clearTimeout(_id){}
 };
 globalThis.document={createElement:tag=>new FakeElement(tag)};
 globalThis.navigator={clipboard:{writeText:async()=>{}}};
 globalThis.Event=class{constructor(type){this.type=type}};
 globalThis.confirm=()=>true;
 clearVoiceDrafts();
 const target=new FakeElement("textarea");
 target.dataset.voiceKey=key;
 let changes=0;
 target.addEventListener("change",()=>changes++);
 const root={querySelectorAll:selector=>{
  assert.equal(selector,"textarea[data-voice-key]");
  return [target];
 }};
 const buttons=()=>target.after.filter(e=>e.className==="voice-launch");
 const panel=()=>target.after.filter(e=>e.className==="voice-dictation-panel").at(-1);
 const get=cl=>panel()?.children.flatMap(c=>c.className==="voice-actions"?c.children:[])
  .find(c=>c.className===cl);
 return {target,root,buttons,panel,get,changes:()=>changes};
}
test("B19: passive initialization does not start recording or modify any note",()=>{
 const h=setup();
 assert.equal(attachVoiceDictation(h.root),1);
 assert.equal(recognizers.length,0);
 assert.equal(h.target.value,"");
 assert.equal(h.buttons().length,1);
 assert.equal(h.buttons()[0].textContent,"إملاء صوتي");
 assert.equal(h.changes(),0);
});
test("B19: results are FINAL only, duplicate events ignored; review before insertion",()=>{
 const h=setup();attachVoiceDictation(h.root);h.buttons()[0].click();
 assert.ok(h.panel());
 assert.match(h.panel().children[0].textContent,/مزود التعرف على الكلام|مزوّد التعرف على الكلام/);
 h.get("voice-start").click();
 assert.equal(recognizers.length,1);
 const r=recognizers[0];
 assert.equal(r.lang,"ar-DZ");
 assert.equal(r.continuous,true);
 assert.equal(r.interimResults,false);
 const results=[{isFinal:true,0:{transcript:"تنظيم أنشطة الحصة"}},
  {isFinal:false,0:{transcript:"عبارة مؤقتة"}}];
 r.onresult({resultIndex:0,results});
 r.onresult({resultIndex:0,results});
 assert.equal(h.target.value,"");
 assert.equal(h.changes(),0);
 const box=h.panel().children.find(c=>c.className==="voice-transcript-label").children[0];
 assert.equal(box.value,"تنظيم أنشطة الحصة");
 box.value="تنظيم جيد لأنشطة الحصة";
 box.dispatchEvent(new Event("input"));
 h.get("voice-insert").click();
 assert.equal(h.target.value,"تنظيم جيد لأنشطة الحصة");
 assert.equal(h.changes(),1);
 assert.equal(pendingVoiceDraftCount(),0);
});
test("B19: silence restarts recognition; permanent failure does not loop",()=>{
 const h=setup();attachVoiceDictation(h.root);h.buttons()[0].click();
 h.get("voice-start").click();
 recognizers[0].onend();
 assert.equal(timers.length,1);
 assert.equal(timers[0].ms,400);
 timers[0].fn();
 assert.equal(recognizers.length,2);
 recognizers[1].onerror({error:"network"});
 recognizers[1].onend();
 assert.equal(timers.length,1,"network failure must stop auto restart");
 assert.match(h.panel().children.find(c=>c.className==="voice-status").textContent,/الاتصال/);
});
test("B19: blank recognition sessions stop after six attempts",()=>{
 const h=setup();attachVoiceDictation(h.root);h.buttons()[0].click();
 h.get("voice-start").click();
 for(let i=0;i<6;i++){
  recognizers.at(-1).onend();
  if(i<5)timers.at(-1).fn();
 }
 assert.equal(recognizers.length,6);
 assert.equal(timers.length,5);
 assert.equal(h.get("voice-start").disabled,false);
});
test("B19: partial transcript survives editor rerender, without leaking between members",()=>{
 const h=setup();attachVoiceDictation(h.root);h.buttons()[0].click();
 const box=h.panel().children.find(c=>c.className==="voice-transcript-label").children[0];
 box.value="تقدير غير مُدرج";box.dispatchEvent(new Event("input"));
 assert.ok(pendingVoiceDraftCount()>0);
 dismissVoiceDictation();
 const again=new FakeElement("textarea");
 again.dataset.voiceKey=h.target.dataset.voiceKey;
 assert.equal(openVoiceDictation(again),true);
 const restored=again.after.at(-1).children.find(c=>c.className==="voice-transcript-label").children[0];
 assert.equal(restored.value,"تقدير غير مُدرج");
 dismissVoiceDictation();
 const other=new FakeElement("textarea");other.dataset.voiceKey="model1|member1|lesson|g1_1";
 assert.equal(openVoiceDictation(other),true);
 const separate=other.after.at(-1).children.find(c=>c.className==="voice-transcript-label").children[0];
 assert.equal(separate.value,"");
 clearVoiceDrafts();
 assert.equal(pendingVoiceDraftCount(),0);
});
test("B19: manual stop preserves transcript, cancel asks before deletion",()=>{
 const h=setup();attachVoiceDictation(h.root);h.buttons()[0].click();
 h.get("voice-start").click();
 recognizers[0].onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:"تقدير مسموع"}}]});
 h.get("voice-stop").click();
 assert.equal(h.get("voice-start").disabled,false);
 assert.equal(timers.length,0);
 assert.ok(pendingVoiceDraftCount()>0);
 globalThis.confirm=()=>false;
 h.get("voice-cancel").click();
 assert.ok(pendingVoiceDraftCount()>0);
 globalThis.confirm=()=>true;
 h.get("voice-cancel").click();
 assert.equal(pendingVoiceDraftCount(),0);
});
test("B19: unsupported or disabled inputs stay manual; scopes remain isolated",()=>{
 let h=setup({supported:false});assert.equal(attachVoiceDictation(h.root),0);
 assert.equal(h.buttons().length,0);
 assert.equal(h.target.after[0].className,"voice-unsupported");
 h=setup();h.target.disabled=true;
 assert.equal(attachVoiceDictation(h.root),0);
});
test("B19: shared normalizer and Arabic diagnostics",()=>{
 assert.equal(voiceComposeDraft("أول","ثان"),"أول\nثان");
 assert.equal(voiceComposeDraft("أول\n","ثان"),"أول\nثان");
 assert.equal(voiceComposeDraft("","نص"),"نص");
 assert.match(voiceRecognitionError("not-allowed"),/الميكروفون/);
 assert.match(voiceRecognitionError("network"),/الاتصال/);
});
test("B19: integration is limited to editable notes; accepted print and export sources untouched",()=>{
 const app=readFileSync("prototypes/titularisation-committee/app.mjs","utf8");
 const form=readFileSync("prototypes/titularisation-committee/form-ui.mjs","utf8");
 const css=readFileSync("prototypes/titularisation-committee/style.css","utf8");
 const reference=readFileSync("prototypes/titularisation-committee/print-layout-b5.css","utf8");
 assert.match(app,/attachVoiceDictation\(\$\("editor"\)\)/);
 assert.match(app,/clearVoiceDrafts\(\)/);
 assert.match(form,/note\.dataset\.voiceKey=/);
 assert.match(form,/textarea\.dataset\.voiceKey=/);
 assert.match(css,/@media print\{\.voice-launch,\.voice-dictation-panel,\.voice-unsupported\{display:none!important\}\}/);
 assert.match(reference,/bottom:-26mm!important/);
});
