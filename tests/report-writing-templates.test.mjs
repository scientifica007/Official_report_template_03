import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('app.js','utf8');
const css=readFileSync('style.css','utf8');
const cloud=readFileSync('cloud.js','utf8');
const start=app.indexOf('/* UX-05 — generic, opt-in professional writing scaffolds.');
const end=app.indexOf('function renderNav(){',start);
assert.ok(start>=0&&end>start,'UX-05 helpers should be isolated');
const source=app.slice(start,end);

function node(tag='div'){
 const listeners={};
 return {tag,children:[],listeners,textContent:'',value:'',dataset:{},disabled:false,
  readOnly:false,isConnected:true,removed:false,maxLength:-1,attributes:{},
  appendChild(other){this.children.push(other);if(this.tag==='select'&&!this.value)this.value=other.value;return other},
  append(...items){this.children.push(...items)},
  remove(){this.removed=true;this.isConnected=false},
  setAttribute(name,value){this.attributes[name]=value},
  addEventListener(name,fn){listeners[name]=fn},
  click(){listeners.click?.()},
  change(){listeners.change?.()},
  insertAdjacentElement(position,element){this.inserted.push(element)},
  dispatchEvent(event){this.events.push({type:event.type,bubbles:event.bubbles})},
  focus(){this.focused=true},
  inserted:[],events:[]
 };
}
function harness(){
 const alerts=[],created=[],context={
  document:{createElement(tag){const result=node(tag);created.push(result);return result}},
  Event:class Event{constructor(type,options){this.type=type;this.bubbles=options?.bubbles}},
  alert:msg=>alerts.push(msg)
 };
 vm.createContext(context);
 vm.runInContext(source+'\nthis.api={editorTemplateChoices,editorTemplateKind,editorTemplateCompose,openEditorTemplatePanel,attachEditorTemplates,dismissEditorTemplatePanel};',context);
 function local(kind='findings'){const input=node('textarea');input.dataset={inputTarget:'II-DOMAIN',inputKind:kind};return input}
 function shared(value='finding'){
  const input=node('textarea');input.dataset={sharedBody:'III-ITEM'};
  const selector=node('select');selector.value=value;
  input.closest=()=>({querySelector:()=>selector});
  return {input,selector};
 }
 function open(type='findings'){
  const input=local(type);
  assert.equal(context.api.openEditorTemplatePanel(input),true);
  const panel=input.inserted.at(-1);
  const selectors=panel.children.find(child=>child.tag==='label');
  const dropdown=selectors.children.find(child=>child.tag==='select');
  const preview=panel.children.find(child=>child.tag==='pre');
  const actions=panel.children.find(child=>child.className==='editor-template-actions');
  const [insert,cancel]=actions.children;
  return {input,panel,dropdown,preview,insert,cancel};
 }
 return {context,created,alerts,local,shared,open};
}
function js(items){return JSON.parse(JSON.stringify(items))}
test('six neutral editing templates have explicit verification placeholders and stable labels',()=>{
 const h=harness();
 const findings=js(h.context.api.editorTemplateChoices('findings'));
 const recommendations=js(h.context.api.editorTemplateChoices('recommendations'));
 assert.equal(findings.length,3);
 assert.equal(recommendations.length,3);
 assert.equal(new Set([...findings,...recommendations].map(t=>t.id)).size,6);
 assert.ok([...findings,...recommendations].every(t=>t.body.includes('[')&&t.body.includes(']')));
 assert.ok([...findings,...recommendations].every(t=>t.title.length>5&&t.body.length>60));
 assert.equal(h.context.api.editorTemplateChoices('reply').length,0);
});
test('local report only gets a draft template after explicit choice and click',()=>{
 const h=harness(),ui=h.open('findings');
 ui.input.value='معاينة أدخلها المفتش';
 assert.equal(ui.input.events.length,0);
 assert.match(ui.preview.textContent,/الوقائع المتثبت منها/);
 assert.match(ui.panel.children[0].textContent,/ليست معاينات أو أحكامًا جاهزة/);
 ui.insert.click();
 assert.ok(ui.input.value.startsWith('معاينة أدخلها المفتش\n'));
 assert.match(ui.input.value,/موضوع المعاينة: \[/);
 assert.equal(ui.input.events.length,1);
 assert.equal(ui.input.events[0].type,'input');
 assert.equal(ui.input.events[0].bubbles,true);
 assert.equal(ui.input.focused,true);
 assert.equal(ui.panel.removed,true);
});
test('cancel leaves the original report draft and state unchanged',()=>{
 const h=harness(),ui=h.open('recommendations');
 const savedReport={entries:{id:{findings:[{text:'saved'}]}}};
 const before=JSON.stringify(savedReport);
 ui.input.value='كتابة موجودة';
 ui.cancel.click();
 assert.equal(ui.input.value,'كتابة موجودة');
 assert.equal(ui.input.events.length,0);
 assert.equal(JSON.stringify(savedReport),before);
 assert.equal(ui.panel.removed,true);
});
test('shared mission templates follow the actual selected contribution kind',()=>{
 const h=harness(),{input,selector}=h.shared('recommendation');
 assert.equal(h.context.api.editorTemplateKind(input),'recommendations');
 assert.equal(h.context.api.openEditorTemplatePanel(input),true);
 const panel=input.inserted.at(-1);
 const preview=panel.children.find(c=>c.tag==='pre');
 assert.match(preview.textContent,/الإجراء المقترح/);
 selector.value='reply';
 const actions=panel.children.find(c=>c.className==='editor-template-actions');
 actions.children[0].click();
 assert.equal(input.value,'');
 assert.equal(input.events.length,0);
 assert.match(panel.children.find(c=>c.className==='editor-template-feedback').textContent,/تغير نوع المساهمة/);
});
test('replies and corrections cannot be silently populated with inspection templates',()=>{
 const h=harness();
 for(const kind of ['reply','correction']){
  const {input}=h.shared(kind);
  assert.equal(h.context.api.editorTemplateKind(input),null);
  assert.equal(h.context.api.openEditorTemplatePanel(input),false);
  assert.equal(input.inserted.length,0);
 }
});
test('template list can switch categories without generating or saving text',()=>{
 const h=harness(),ui=h.open('recommendations');
 const templates=js(h.context.api.editorTemplateChoices('recommendations'));
 ui.dropdown.value=templates[1].id;
 ui.dropdown.change();
 assert.equal(ui.preview.textContent,templates[1].body);
 assert.equal(ui.input.value,'');
 assert.equal(ui.input.events.length,0);
});
test('a long report draft is not truncated or altered when scaffold exceeds limit',()=>{
 const h=harness(),ui=h.open();
 ui.input.maxLength=100;
 ui.input.value='ن'.repeat(98);
 ui.insert.click();
 assert.equal(ui.input.value,'ن'.repeat(98));
 assert.equal(ui.input.events.length,0);
 assert.match(ui.panel.children.find(c=>c.className==='editor-template-feedback').textContent,/لا تكفي المساحة/);
});
test('draft composition preserves the original text and whitespace exactly',()=>{
 const h=harness();
 assert.equal(h.context.api.editorTemplateCompose('سابق  ','لاحق'),'سابق  \nلاحق');
 assert.equal(h.context.api.editorTemplateCompose('سابق\n','لاحق'),'سابق\nلاحق');
 assert.equal(h.context.api.editorTemplateCompose('','  بند  '),'  بند  ');
 assert.equal(h.context.api.editorTemplateCompose('','  '),null);
 assert.equal(h.context.api.editorTemplateCompose('a'.repeat(10),'b'.repeat(10),15),null);
});
test('controls attach to local and shared draft fields without changing their values',()=>{
 const h=harness(),local=h.local(),{input:shared}=h.shared(),readOnly=h.local();
 readOnly.readOnly=true;
 h.context.api.attachEditorTemplates({querySelectorAll:()=>[local,shared,readOnly]});
 assert.equal(local.inserted.length,1);
 assert.equal(shared.inserted.length,1);
 assert.equal(readOnly.inserted.length,0);
 assert.equal(local.value,'');
 assert.equal(shared.value,'');
 assert.equal(local.inserted[0].textContent,'قوالب صياغة');
 assert.equal(local.events.length,0);
});
test('template UI is editor-only and cannot affect cloud permissions or output engines',()=>{
 assert.match(app,/attachEditorTemplates\(root\)/);
 assert.match(css,/@media print\{\.editor-template-panel,\.editor-template-launch\{display:none!important\}\}/);
 assert.match(cloud,/data-shared-body/);
 assert.match(cloud,/data-shared-action="save"/);
 assert.doesNotMatch(source,/fetch\(|localStorage\.setItem|sessionStorage\.setItem|commitPendingEntries\(|saveEmbedded\(/);
 assert.doesNotMatch(source,/innerHTML\s*=/);
});
