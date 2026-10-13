import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const source=readFileSync('cloud.js','utf8'),app=readFileSync('app.js','utf8');
const sql=readFileSync('supabase/migrations/001_inspectors_institutions.sql','utf8');
const uid='3adbe93f-3755-4cb0-b246-90fabd0ef6fa';
const institutionId='966acf35-fc0f-45fa-9123-9c68fc272d82';
const entry={id:institutionId,name:'مركز تبسة 1',wilaya:'تبسة',code:'1201',
 institution_data:{name:'مركز تبسة 1',wilaya:'تبسة',code:'1201',address:'تبسة'},
 director_data:{fullName:'الرئيس القديم'},version:1,updated_at:'2026-10-13T10:00:00Z',updated_by:uid};
function createHarness(configured=true,conflict=false){
 const events={root:{},document:{}},requests=[],values=new Map();
 const elements={
 'cloud-shell':{open:true},
 'cloud-content':{innerHTML:'',addEventListener(name,fn){events.root[name]=fn}},
 'cloud-unread':{textContent:''}
 };
 const document={getElementById(id){return elements[id]||null},addEventListener(name,fn){events.document[name]=fn}};
 const bridge={
  getIdentity(){return {institution:{name:'مركز تبسة 1',wilaya:'تبسة',code:'1201',address:'عنوان جديد'},
                          director:{fullName:'الرئيس الجديد'}}},
  applyIdentity(i,d){bridge.received={institution:i,director:d};return {ok:true}}
 };
 const localSession={access_token:'mock-access-token',refresh_token:'mock-refresh-token',user:{id:uid,email:'inspector@example.dz'},expires_at_ms:Date.now()+600000};
 const storage={getItem:()=>JSON.stringify(localSession),setItem(){},removeItem(){}};
 const fetch=async(url,request)=>{
  requests.push({url,method:request.method,body:request.body?JSON.parse(request.body):null});
  const path=new URL(url);
  let data=[];
  if(path.pathname.endsWith('/inspector_profiles')){
   if(path.searchParams.has('id'))data=[{id:uid,email:'inspector@example.dz',first_name:'مفتش',last_name:'تجريبي',profession:'IFEP',district:'تبسة',approved:true,is_admin:false}];
   else data=[{id:uid,email:'inspector@example.dz',first_name:'مفتش',last_name:'تجريبي',profession:'IFEP',approved:true,is_admin:false}];
  }else if(path.pathname.endsWith('/shared_institutions')){
   if(request.method==='PATCH')data=conflict?[]:[{id:institutionId,name:'مركز تبسة 1',version:2}];
   else data=[entry];
  }else if(path.pathname.endsWith('/institution_notifications'))data=[];
  return {ok:true,status:200,text:async()=>JSON.stringify(data)};
 };
 const context={
  window:{REPORT03_CLOUD_CONFIG:configured?{supabaseUrl:'https://project.supabase.co',publishableKey:'sb_publishable_test_1234567890123456'}:{},Report03CloudBridge:bridge},
  document,fetch,sessionStorage:storage,
  location:{hash:'',pathname:'/Official_report_template_03/',search:'',origin:'https://scientifica007.github.io'},
  history:{replaceState(){}},URL,URLSearchParams,Date,setInterval(){return 1},console
 };
 vm.runInNewContext(source,context,{timeout:10000});
 return {events,requests,elements,bridge,context,
  async ready(){await events.document.DOMContentLoaded()},
  async navigate(page){await events.root.click({target:{closest(){return {dataset:{cloudAction:'nav',page},disabled:false}}}})},
  async field(group,key,value){await events.root.input({target:{dataset:{cloudFieldGroup:group,cloudFieldKey:key},value}})},
  async action(name){
   const button={dataset:{cloudAction:name},disabled:false};
   await events.root.click({target:{closest(){return button}}});
  }};
}
test('M2.1: no remote requests, accounts or credentials required when central service is unconfigured',async()=>{
 const h=createHarness(false);await h.ready();
 assert.equal(h.requests.length,0);
 assert.match(h.elements['cloud-content'].innerHTML,/تهيئة المنصة/);
 assert.match(app,/function exportDOCX/);
 assert.match(app,/function exportPDF/);
});
test('M2.1: approved inspectors can see same shared institutions and load current director',async()=>{
 const h=createHarness();await h.ready();await h.navigate('institutions');
 assert.match(h.elements['cloud-content'].innerHTML,/مركز تبسة 1/);
 h.events.root.change({target:{id:'cloud-select',value:institutionId}});
 await h.action('load');
 assert.equal(h.bridge.received.institution.code,'1201');
 assert.equal(h.bridge.received.director.fullName,'الرئيس القديم');
});
test('M2.1: shared institution edit sends institution and director only, using compare-and-swap version',async()=>{
 const h=createHarness();await h.ready();await h.navigate('institutions');
 h.events.root.change({target:{id:'cloud-select',value:institutionId}});
 await h.field('institution','address','عنوان جديد');
 await h.field('director','fullName','الرئيس الجديد');
 await h.action('save');
 const patch=h.requests.find(x=>x.method==='PATCH'&&x.url.includes('/shared_institutions'));
 assert.ok(patch);
 const u=new URL(patch.url);
 assert.equal(u.searchParams.get('id'),'eq.'+institutionId);
 assert.equal(u.searchParams.get('version'),'eq.1');
 assert.equal(patch.body.version,2);
 assert.equal(patch.body.director_data.fullName,'الرئيس الجديد');
 assert.equal(patch.body.institution_data.address,'عنوان جديد');
 assert.ok(!('mission' in patch.body));
 assert.ok(!('findings' in patch.body));
 assert.ok(!('inspectors' in patch.body));
});
test('M2.1: simultaneous edits fail without overwriting any active form values',async()=>{
 const h=createHarness(true,true);await h.ready();await h.navigate('institutions');
 h.events.root.change({target:{id:'cloud-select',value:institutionId}});
 await h.action('save');
 assert.match(h.elements['cloud-content'].innerHTML,/تغيرت بيانات المؤسسة/);
 assert.equal(h.bridge.received,undefined);
});
test('M2.1: RLS and database triggers protect approval, shared edits, audit trail and notifications',()=>{
 assert.match(sql,/enable row level security/g);
 assert.equal((sql.match(/enable row level security/g)||[]).length,4);
 assert.match(sql,/create or replace function public\.is_approved_inspector/);
 assert.match(sql,/create or replace function public\.is_admin_inspector/);
 assert.match(sql,/security definer set search_path = ''/);
 assert.match(sql,/create policy institution_insert/);
 assert.match(sql,/create policy institution_update/);
 assert.match(sql,/create trigger trg_audit_shared_institution/);
 assert.match(sql,/jsonb_build_object\('old',oldv,'new',newv\)/);
 assert.match(sql,/where approved=true and id<>new\.updated_by/);
 assert.match(sql,/grant update\(read_at\)/);
 assert.match(sql,/grant execute on function public\.approve_inspector\(uuid,boolean\) to authenticated/);
 assert.doesNotMatch(sql,/grant (?:update|all) on public\.inspector_profiles to authenticated/);
 assert.doesNotMatch(sql,/grant (?:insert|update|delete) on public\.institution_changes to authenticated/);
 assert.doesNotMatch(sql,/grant (?:delete|all) on public\.shared_institutions to authenticated/);
});
test('M2.1: browser JS passes syntax checks and contains no embedded service secret',()=>{
 execFileSync(process.execPath,['--check','cloud.js']);
 execFileSync(process.execPath,['--check','app.js']);
 execFileSync(process.execPath,['--check','cloud-config.js']);
 assert.doesNotMatch(source,/sb_secret_[a-z0-9]{20}/i);
 assert.match(source,/sessionStorage/);
 assert.match(source,/window\.Report03CloudBridge/);
 assert.match(app,/window\.Report03CloudBridge/);
});

test('M2.1: enabled cloud configuration is public-only and targets the project root',()=>{
 const source=readFileSync('cloud-config.js','utf8');
 const context={window:{}};
 vm.runInNewContext(source,context,{timeout:10000});
 const c=context.window.REPORT03_CLOUD_CONFIG;
 assert.equal(c.supabaseUrl,'https://uxtsyzyotnohxvopgcmh.supabase.co');
 assert.ok(c.publishableKey.startsWith('sb_publishable_'));
 assert.ok(c.publishableKey.length>20);
 assert.ok(!c.supabaseUrl.includes('/rest/v1'));
 assert.ok(!source.includes('sb_secret_')&&!source.includes('service_role:'));
 assert.ok(!source.includes('SUPABASE_DB_PASSWORD'));
});


test('M2.2 shell: hidden editor until approved authentication, with public login as first screen',async()=>{
 const h=createHarness();
 h.context.sessionStorage.getItem=()=>null;
 await h.ready();
 assert.match(h.elements['cloud-content'].innerHTML,/تسجيل الدخول/);
 assert.match(h.elements['cloud-content'].innerHTML,/إنشاء حساب/);
 assert.doesNotMatch(h.elements['cloud-content'].innerHTML,/محرر التقرير 03/);
 const html=readFileSync('index.html','utf8');
 assert.match(html,/<div class="app" id="app" hidden>/);
 assert.match(html,/<section id="cloud-shell" class="portal-shell"/);
 assert.ok(html.indexOf('<section id="cloud-shell"')>html.indexOf('</div>\n<section id="cloud-shell"')-3);
});
test('M2.2 shell: approved users land on dashboard, with distinct profile/admin and report views',async()=>{
 const h=createHarness();await h.ready();
 assert.match(h.elements['cloud-content'].innerHTML,/لوحة القيادة/);
 assert.match(h.elements['cloud-content'].innerHTML,/المؤسسات المشتركة/);
 assert.match(h.elements['cloud-content'].innerHTML,/المفتشون الزملاء/);
 assert.match(h.elements['cloud-content'].innerHTML,/قيد التطوير/);
 await h.navigate('account');
 assert.match(h.elements['cloud-content'].innerHTML,/حسابي/);
 assert.match(h.elements['cloud-content'].innerHTML,/inspector@example\.dz/);
 await h.navigate('report');
 assert.equal(h.elements['cloud-shell'].hidden,true);
 await h.navigate('dashboard');
 assert.equal(h.elements['cloud-shell'].hidden,false);
});
test('M2.2 shell: institution can be edited separately from report, without uploading findings',async()=>{
 const h=createHarness();await h.ready();await h.navigate('institutions');
 assert.match(h.elements['cloud-content'].innerHTML,/إضافة مؤسسة جديدة/);
 const reportGetter=h.bridge.getIdentity;
 h.bridge.getIdentity=()=>{throw new Error('report must not be read by institution editor')};
 h.events.root.change({target:{id:'cloud-select',value:institutionId}});
 await h.field('institution','address','عنوان معدل في سجل المؤسسات');
 await h.field('director','fullName','مدير المؤسسة الحالي');
 await h.action('save');
 const call=h.requests.find(x=>x.method==='PATCH'&&x.url.includes('/shared_institutions'));
 assert.ok(call);
 assert.equal(call.body.institution_data.address,'عنوان معدل في سجل المؤسسات');
 assert.equal(call.body.director_data.fullName,'مدير المؤسسة الحالي');
 assert.ok(!('entries' in call.body));
 assert.ok(!('mission' in call.body));
 h.bridge.getIdentity=reportGetter;
});
test('M2.2 shell: reserved teamwork/calendar/messaging sections explicitly disclose missing implementation',async()=>{
 const h=createHarness();await h.ready();
 for(const page of ['missions','calendar','teams','messages']){
  await h.navigate(page);
  assert.match(h.elements['cloud-content'].innerHTML,/قيد التطوير/);
 }
});
