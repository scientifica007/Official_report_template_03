import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync('app.js','utf8');
const cloud=readFileSync('cloud.js','utf8');
const begin=source.indexOf('function inspectorRoleFromAccount(');
const end=source.indexOf('function safe(s){',begin);
assert.ok(begin>=0&&end>begin,'Unable to locate isolated inspector prefill helpers');
const helperCode=source.slice(begin,end);
const own={first_name:'حاتم',last_name:'زريبي',profession:'IFEP',district:'12'};
function makeHarness({inspectors=[{id:'draft-first',name:'',role:'IFEP',district:''}],
  currentView='meta',prefill=true,profile=own}={}){
 const fields={};
 let renderCount=0;
 for(const field of ['name','role','district'])fields[field]={value:''};
 const sandbox={
  state:{inspectors:structuredClone(inspectors)},mayPrefillAccountInspector:prefill,
  changed:false,currentView,
  window:{Report03CloudUI:{getReportOwner(){return profile}}},
  document:{querySelector(selector){
    const found=selector.match(/data-prop="([^"]+)"/);
    return found?fields[found[1]]:null;
  }},
  text:s=>String(s??'').trim(),render(){renderCount++}
 };
 vm.createContext(sandbox);
 vm.runInContext(helperCode+';this.testing={prefillAccountInspector,inspectorRoleFromAccount,prefillFromCurrentSession}',sandbox);
 return {sandbox,fields,get renderCount(){return renderCount},
  fill(p=profile){return sandbox.testing.prefillAccountInspector(p)},
  fillSession(){return sandbox.testing.prefillFromCurrentSession()}};
}

test('M2.2.4: authenticated account autofills name, professional role and district without changing inspector ID',()=>{
 const h=makeHarness();
 assert.equal(h.fillSession(),true);
 assert.equal(h.sandbox.state.inspectors.length,1);
 assert.equal(h.sandbox.state.inspectors[0].id,'draft-first');
 assert.equal(h.sandbox.state.inspectors[0].name,'حاتم زريبي');
 assert.equal(h.sandbox.state.inspectors[0].role,'IFEP');
 assert.equal(h.sandbox.state.inspectors[0].district,'12');
 assert.equal(h.fields.name.value,'حاتم زريبي');
 assert.equal(h.fields.role.value,'IFEP');
 assert.equal(h.fields.district.value,'12');
 assert.equal(h.sandbox.changed,true);
 assert.equal(h.renderCount,0); // no rerender to lose unsaved form content
});
test('M2.2.4: role mapping supports all three inspector positions and Arabic professional labels',()=>{
 const h=makeHarness();
 for(const [profession,role] of [
  ['IFEP','IFEP'],['ITP','ITP'],['IAF','IAF'],
  ['مفتش إداري ومالي','IAF'],
  ['مفتش تقني وبيداغوجي للتكوين والتعليم المهنيين','ITP'],
  ['مفتش التكوين والتعليم المهنيين','IFEP']
 ])assert.equal(h.sandbox.testing.inspectorRoleFromAccount(profession),role);
});
test('M2.2.4: repeated sessions and polls never overwrite the initial or later user edits',()=>{
 const h=makeHarness();
 assert.equal(h.fill(),true);
 h.sandbox.state.inspectors[0].name='مفتش محرر';
 assert.equal(h.fill({first_name:'أحمد',last_name:'أمين',profession:'IAF',district:'13'}),false);
 assert.equal(h.sandbox.state.inspectors[0].name,'مفتش محرر');
 assert.equal(h.sandbox.state.inspectors[0].role,'IFEP');
});
test('M2.2.4: imported JSON, manually filled rows and multi-inspector lists remain unchanged',()=>{
 for(const obj of [
  {inspectors:[{id:'imported',name:'مفتش سابق',role:'IAF',district:'13'}]},
  {inspectors:[{id:'manual',name:'',role:'IFEP',district:'12'}]},
  {inspectors:[{id:'a',name:'',role:'IFEP',district:''},{id:'b',name:'زميل آخر',role:'ITP',district:'14'}]},
  {prefill:false}
 ]){
  const h=makeHarness(obj),before=structuredClone(h.sandbox.state.inspectors);
  assert.equal(h.fill(),false);
  assert.deepEqual(JSON.parse(JSON.stringify(h.sandbox.state.inspectors)),before);
  assert.equal(h.renderCount,0);
 }
 assert.match(source,/mayPrefillAccountInspector=false;state=\{\.\.\.emptyState\(\),mission:/);
 assert.match(source,/if\(b\.id==='add-inspector'\)\{mayPrefillAccountInspector=false;state\.inspectors\.push/);
});
test('M2.2.4: late account verification while viewing another chapter updates model only',()=>{
 const h=makeHarness({currentView:'chapter'});
 assert.equal(h.fill(),true);
 assert.equal(h.sandbox.state.inspectors[0].name,'حاتم زريبي');
 assert.equal(h.fields.name.value,'');
 assert.equal(h.renderCount,0);
});
test('M2.2.4: no owner before authentication; partial profile name is supported without assumptions',()=>{
 const h=makeHarness({profile:null});
 assert.equal(h.fillSession(),false);
 assert.equal(h.sandbox.state.inspectors[0].name,'');
 assert.equal(h.fill({first_name:'',last_name:'زريبي',profession:'IFEP',district:null}),true);
 assert.equal(h.sandbox.state.inspectors[0].name,'زريبي');
 assert.equal(h.sandbox.state.inspectors[0].district,'');
});
test('M2.2.4: new report reset reseeds the current owner, but imported report opts out',()=>{
 assert.match(source,/state=emptyState\(\);mayPrefillAccountInspector=true;prefillFromCurrentSession\(\)/);
 assert.match(source,/state=emptyState\(\);mayPrefillAccountInspector=true;selectedInstitutionId=''/);
 assert.match(source,/mayPrefillAccountInspector=false;state=\{\.\.\.emptyState\(\)/);
 assert.match(source,/prefillAccountInspector\(account\)\{return prefillAccountInspector\(account\)\}/);
 assert.match(source,/state\.inspectors\.push\(\{id:makeId\(\),name:'',role:'IFEP',district:''\}\)/);
 assert.match(source,/inspectors:state\.inspectors\.map\(x=>\(\{\.\.\.x\}\)\)/); // export JSON
});
test('M2.2.4: authorization check protects the identity sync interface in cloud layer',()=>{
 assert.match(cloud,/if\(approved\)window\.Report03CloudBridge\?\.prefillAccountInspector\?\.\(/);
 assert.match(cloud,/getReportOwner\(\)\{\s*if\(!verifiedUser\(\)\)return null;/);
 assert.match(cloud,/profession:profile\.profession,district:profile\.district/);
 assert.doesNotMatch(helperCode,/fetch\(|rest\/v1|localStorage|sessionStorage/);
});
