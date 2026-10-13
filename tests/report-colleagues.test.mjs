import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const app=readFileSync('app.js','utf8'),cloud=readFileSync('cloud.js','utf8');
const start=app.indexOf('function availableReportColleagues(){');
const end=app.indexOf('\nfunction safe(s){',start);
assert.ok(start>0&&end>start,'M2.2.5 directory functions must be present');
const functions=app.slice(start,end);
const roles=app.slice(app.indexOf('function inspectorRoleFromAccount('),app.indexOf('\nfunction prefillAccountInspector('));
const a='f8c30f34-c896-4aa5-b4bb-007322d13a01';
const b='f8c30f34-c896-4aa5-b4bb-007322d13a02';
const owner='f8c30f34-c896-4aa5-b4bb-007322d13a09';
const peers=[
 {id:a,first_name:'آمنة',last_name:'مراد',profession:'ITP',district:'12'},
 {id:b,first_name:'سمير',last_name:'خالد',profession:'IAF',district:'13'}
];
function harness(options={}){
 const state={inspectors:structuredClone(options.inspectors||[
  {id:'report-owner',profileId:owner,name:'مفتش صاحب الحساب',role:'IFEP',district:'12'}])};
 const ui={directory:options.directory||peers,selected:''};
 const elements={};
 const toast=[];
 let draws=0;
 const context={
  state,mayPrefillAccountInspector:false,changed:false,
  text:s=>String(s??'').trim(),
  safe:s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
  window:{Report03CloudUI:{
   listReportColleagues:()=>ui.directory,
   findReportColleague(id){return ui.directory.find(p=>p.id===id)||null}
  }},
  makeId:()=>String(state.inspectors.length+1),
  render(){draws++},
  showToast(message){toast.push(message)},
  $(id){return elements[id]||null},
  document:{createElement:()=>({value:'',textContent:''})}
 };
 vm.createContext(context);
 vm.runInContext(roles+functions+';this.exposed={availableReportColleagues,renderReportColleaguePicker,addDirectoryInspector,syncReportColleagueOptions}',context);
 return {ctx:context,ui,elements,state,toast,get renders(){return draws},
  add(id){return context.exposed.addDirectoryInspector(id)},
  available(){return context.exposed.availableReportColleagues()},
  markup(){return context.exposed.renderReportColleaguePicker()},
  sync(){return context.exposed.syncReportColleagueOptions()}};
}
test('M2.2.5: one click copies selected inspector name, position and district, keeping original owner',()=>{
 const h=harness();
 assert.equal(h.add(a),true);
 assert.equal(h.state.inspectors.length,2);
 assert.deepEqual({...h.state.inspectors[0]},{id:'report-owner',profileId:owner,name:'مفتش صاحب الحساب',role:'IFEP',district:'12'});
 assert.deepEqual({...h.state.inspectors[1]},{id:'2',profileId:a,name:'آمنة مراد',role:'ITP',district:'12'});
 assert.equal(h.ctx.changed,true);
 assert.equal(h.renders,1);
 assert.match(h.toast[0],/أضيف المفتش/);
});
test('M2.2.5: supports multiple distinct directory colleagues, disallows duplicate account',()=>{
 const h=harness();
 assert.equal(h.add(a),true);
 assert.equal(h.add(a),false);
 assert.equal(h.add(b),true);
 assert.equal(h.state.inspectors.length,3);
 assert.equal(h.state.inspectors[2].role,'IAF');
 assert.equal(h.state.inspectors[2].district,'13');
 assert.equal(h.available().length,0);
 assert.match(h.toast[1],/مدرج مسبقًا/);
 assert.match(h.markup(),/لا يوجد زملاء آخرون متاحون/);
 assert.match(h.markup(),/disabled/);
});
test('M2.2.5: directory remains optional, while manual inspector addition is still present',()=>{
 const h=harness({directory:[]});
 assert.match(h.markup(),/لا يوجد زملاء آخرون متاحون/);
 assert.match(app,/id="add-inspector">\\+ إضافة مفتش يدويًا/);
 assert.match(app,/if\(b\.id==='add-inspector'\)/);
 assert.equal(h.state.inspectors.length,1);
});
test('M2.2.5: rendered colleague names are escaped and nothing is selected automatically',()=>{
 const h=harness({directory:[{id:a,first_name:'<script>',last_name:'" اختبار',profession:'ITP',district:'12'}]});
 const markup=h.markup();
 assert.doesNotMatch(markup,/<script>/);
 assert.match(markup,/&lt;script&gt;/);
 assert.match(markup,/&quot;/);
 assert.match(markup,/<option value="">— اختر مفتشًا معتمدًا —<\/option>/);
});
test('M2.2.5: async directory sync updates only picker and preserves its selection and draft data',()=>{
 const h=harness({directory:[]});
 const controls={select:{value:'',options:[{value:'',textContent:'لا يوجد زملاء آخرون متاحون'}],
  replaceChildren(...children){this.options=children}},button:{disabled:true}};
 h.elements['report-colleague-select']=controls.select;
 h.elements['add-directory-inspector']=controls.button;
 const note={text:'معاينة غير محفوظة بعد'};
 h.elements['other-editor-text']=note;
 assert.equal(h.sync(),false);
 h.ui.directory=peers;
 assert.equal(h.sync(),true);
 assert.equal(controls.select.options.length,3);
 assert.equal(controls.button.disabled,false);
 assert.equal(controls.select.options[2].value,b);
 assert.equal(note.text,'معاينة غير محفوظة بعد');
 controls.select.value=b;
 assert.equal(h.sync(),false);
 assert.equal(controls.select.value,b);
 h.ui.directory=[peers[1]];
 assert.equal(h.sync(),true);
 assert.equal(controls.select.value,b);
 assert.equal(h.renders,0);
 assert.equal(note.text,'معاينة غير محفوظة بعد');
});
test('M2.2.5: after selection picker does not reoffer the same approved account',()=>{
 const h=harness();
 assert.equal(h.add(a),true);
 assert.equal(h.available().length,1);
 assert.equal(h.available()[0].id,b);
 assert.doesNotMatch(h.markup(),new RegExp(a));
 assert.match(h.markup(),new RegExp(b));
});
test('M2.2.5: old JSON reports still import; new JSON may retain trusted UUID mapping without accessing cloud',()=>{
 assert.match(app,/inspectors:Array\.isArray\(x\.inspectors\)/);
 assert.match(app,/typeof v\.profileId==='string'/);
 assert.match(app,/inspectors:state\.inspectors\.map\(x=>\(\{\.\.\.x\}\)\)/);
 assert.match(app,/delete inspector\.profileId;mayPrefillAccountInspector=false/);
 assert.match(app,/prefillAccountInspector\(account\)\{return prefillAccountInspector\(account\)\}/);
 assert.match(app,/if\(account\.id\)first\.profileId=String\(account\.id\)/);
});
test('M2.2.5: directory copied values are local-only, without any cloud report or messaging writes',()=>{
 assert.doesNotMatch(functions,/fetch\(|submit\(|raw\(|sessionStorage|localStorage/);
 assert.match(harness().markup(),/لا يمنحه حق الاطلاع أو التحرير المشترك/);
 assert.match(cloud,/listReportColleagues\(\)\{/);
 assert.match(cloud,/findReportColleague\(id\)\{/);
 assert.match(cloud,/if\(report\)\{window\.Report03CloudBridge\?\.syncSharedInstitutionOptions\?\.\(\);window\.Report03CloudBridge\?\.syncReportColleagueOptions\?\.\(\);\}/);
 execFileSync(process.execPath,['--check','app.js']);
 execFileSync(process.execPath,['--check','cloud.js']);
});
