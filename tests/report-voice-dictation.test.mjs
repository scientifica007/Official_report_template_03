import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('app.js','utf8');
const css=readFileSync('style.css','utf8');
const cloud=readFileSync('cloud.js','utf8');
const first=app.indexOf('/* UX-04: opt-in dictation');
const last=app.indexOf('function renderNav(){',first);
assert.ok(first>=0&&last>first,'UX-04 helpers are isolated');
const code=app.slice(first,last);

function control(initial=''){
 const listeners={};
 return {value:initial,textContent:'',disabled:false,
  addEventListener(name,fn){listeners[name]=fn},
  click(){return listeners.click?.()},
  setAttribute(){},focus(){this.focused=true},
  listeners};
}
function harness({speech=true}={}){
 const sessions=[],created=[],inputs=[];
 class Recognition {
  constructor(){sessions.push(this)}
  start(){this.started=true}
  stop(){this.stopped=true;this.onend?.()}
  abort(){this.aborted=true}
 }
 const elements={};
 const doc={
  createElement(tag){
   if(tag==='div'){
    const part={
     removed:false,innerHTML:'',remove(){this.removed=true},
     children:{
      '[data-voice-status]':control(),
      '[data-voice-transcript]':control(),
      '[data-voice-start]':control(),
      '[data-voice-stop]':control(),
      '[data-voice-language]':control('ar-DZ'),
      '[data-voice-insert]':control(),
      '[data-voice-cancel]':control()
     },
     querySelector(sel){return this.children[sel]||null}
    };
    created.push(part);return part;
   }
   const el=control();
   el.type='';
   el.className='';
   created.push(el);
   return el;
  }
 };
 const window=speech?{SpeechRecognition:Recognition}:{};
 const ctx={window,document:doc,Event:class Event{constructor(type,init){this.type=type;this.bubbles=init?.bubbles}}};
 vm.createContext(ctx);
 vm.runInContext(code+'\nthis.api={voiceRecognitionConstructor,voiceComposeDraft,voiceRecognitionError,voiceDismissPanel,voiceOpenPanel,voiceAttachControls};',ctx);
 function textarea(){
  const t={value:'',readOnly:false,disabled:false,isConnected:true,inserted:[],events:[],
   insertAdjacentElement(pos,el){assert.equal(pos,'afterend');this.inserted.push(el)},
   dispatchEvent(e){this.events.push({type:e.type,bubbles:e.bubbles})},
   focus(){this.focused=true}};
  inputs.push(t);return t;
 }
 return {ctx,created,inputs,sessions,textarea,control};
}
test('Arabic dictation starts only through explicit user activation with privacy notice',()=>{
 assert.match(code,/data-voice-start/);
 assert.match(code,/recognition.start\(\)/);
 assert.match(code,/مزوّد خارجي/);
 assert.match(code,/بعد الاطلاع على التنبيه/);
 assert.match(code,/لا تحفظ المنصة الصوت/);
 assert.match(code,/ar-DZ/);
 assert.match(code,/ar-SA/);
});
test('combining recognized text preserves all typed material without auto-save',()=>{
 const h=harness();
 assert.equal(h.ctx.api.voiceComposeDraft('معاينة سابقة  ','ملاحظة جديدة'),'معاينة سابقة\nملاحظة جديدة');
 assert.equal(h.ctx.api.voiceComposeDraft('السطر الموجود',''),'السطر الموجود');
 assert.equal(h.ctx.api.voiceComposeDraft('',' نصّ جديد '),'نصّ جديد');
 assert.equal(h.ctx.api.voiceComposeDraft('السطر الموجود','  '),'السطر الموجود');
});
test('speech errors give usable localized diagnosis',()=>{
 const h=harness();
 for(const key of ['not-allowed','network','language-not-supported','no-speech','audio-capture']){
  assert.ok(h.ctx.api.voiceRecognitionError(key).length>18);
 }
 assert.match(h.ctx.api.voiceRecognitionError('network'),/الاتصال/);
});
test('unsupported browser keeps report editable and displays non-blocking notice',()=>{
 const h=harness({speech:false}),target=h.textarea();
 const root={querySelectorAll:()=>[target]};
 h.ctx.api.voiceAttachControls(root);
 assert.equal(target.inserted.length,1);
 assert.match(target.inserted[0].textContent,/غير متاح/);
 assert.equal(target.value,'');
 assert.equal(h.sessions.length,0);
});
test('supported UI enhances local and shared draft textareas only',()=>{
 const h=harness(),local=h.textarea(),shared=h.textarea(),readonly=h.textarea();
 readonly.readOnly=true;
 h.ctx.api.voiceAttachControls({querySelectorAll:()=>[local,shared,readonly]});
 assert.equal(local.inserted.length,1);
 assert.equal(shared.inserted.length,1);
 assert.equal(readonly.inserted.length,0);
 assert.match(local.inserted[0].textContent,/إملاء صوتي/);
 assert.equal(h.sessions.length,0);
});
test('transcription never enters text field until reviewed and inserted by user',()=>{
 const h=harness(),target=h.textarea();
 target.value='معاينة مكتوبة';
 h.ctx.api.voiceOpenPanel(target);
 const panel=target.inserted[0];
 assert.equal(h.sessions.length,0);
 panel.children['[data-voice-start]'].click();
 assert.equal(h.sessions.length,1);
 assert.equal(h.sessions[0].lang,'ar-DZ');
 assert.equal(h.sessions[0].started,true);
 assert.equal(target.value,'معاينة مكتوبة');
 h.sessions[0].onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'لوحظت حالة جديدة'}}]});
 assert.equal(panel.children['[data-voice-transcript]'].value,'لوحظت حالة جديدة');
 assert.equal(target.value,'معاينة مكتوبة');
 panel.children['[data-voice-transcript]'].value='تم تصحيح العبارة';
 panel.children['[data-voice-insert]'].click();
 assert.equal(target.value,'معاينة مكتوبة\nتم تصحيح العبارة');
 assert.deepEqual(target.events,[{type:'input',bubbles:true}]);
 assert.equal(panel.removed,true);
 assert.equal(target.focused,true);
 assert.equal(h.sessions[0].aborted,true);
});
test('cancel drops recognized text and aborts recognition',()=>{
 const h=harness(),target=h.textarea();
 target.value='محتوى قائم';
 h.ctx.api.voiceOpenPanel(target);
 const panel=target.inserted[0];
 panel.children['[data-voice-start]'].click();
 h.sessions[0].onresult({resultIndex:0,results:[{isFinal:true,0:{transcript:'عبارة'} }]});
 panel.children['[data-voice-cancel]'].click();
 assert.equal(target.value,'محتوى قائم');
 assert.equal(target.events.length,0);
 assert.equal(h.sessions[0].aborted,true);
 assert.equal(panel.removed,true);
});
test('dismissed session cannot affect a later editor field or mission',()=>{
 const h=harness(),a=h.textarea(),b=h.textarea();
 h.ctx.api.voiceOpenPanel(a);
 const oldPanel=a.inserted[0];
 oldPanel.children['[data-voice-start]'].click();
 const oldOnResult=h.sessions[0].onresult;
 h.ctx.api.voiceOpenPanel(b);
 assert.equal(oldPanel.removed,true);
 assert.equal(h.sessions[0].aborted,true);
 oldOnResult({resultIndex:0,results:[{isFinal:true,0:{transcript:'محتوى قديم'}}]});
 assert.equal(a.value,'');
 assert.equal(b.value,'');
});
test('CSS hides voice UI from print; cloud persists only on its own submit action',()=>{
 assert.match(css,/@media print\{\.voice-launch,\.voice-dictation-panel,\.voice-unsupported\{display:none!important\}\}/);
 assert.match(cloud,/data-shared-body/);
 assert.match(cloud,/data-shared-action="save"/);
 assert.match(app,/voiceAttachControls\(root\)/);
 assert.match(app,/voiceDismissPanel\(\);renderNav\(\)/);
 assert.doesNotMatch(code,/localStorage\.setItem|fetch\(|saveEmbedded\(|commitPendingEntries\(/);
});
