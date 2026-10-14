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
function createHarness(configured=true,conflict=false,otherProfiles=[],options={}){
 const events={root:{},document:{},report:{}},requests=[],values=new Map();
 const elements={
 'cloud-shell':{open:true},
 'cloud-content':{innerHTML:'',addEventListener(name,fn){events.root[name]=fn}},
 'cloud-unread':{textContent:''},
 'report-logout':{disabled:false,addEventListener(name,fn){events.report[name]=fn}},
 'report-session-controls':{hidden:true},
 'report-user-name':{textContent:''}
 };
 const document={getElementById(id){return elements[id]||null},addEventListener(name,fn){events.document[name]=fn}};
 const bridge={
  getIdentity(){return {institution:{name:'مركز تبسة 1',wilaya:'تبسة',code:'1201',address:'عنوان جديد'},
                          director:{fullName:'الرئيس الجديد'}}},
  applyIdentity(i,d,metadata){bridge.received={institution:i,director:d,metadata};return {ok:true}}
 };
 const localSession={access_token:'mock-access-token',refresh_token:'mock-refresh-token',user:{id:uid,email:'inspector@example.dz'},expires_at_ms:Date.now()+600000};
 const storage={getItem:()=>options.emptyTabStorage?null:JSON.stringify(localSession),setItem(){},removeItem(){}};
 // Persistent storage is shared between a normal tab and a recreated tab.
 const persistentItems=options.persistentItems||new Map();
 const persistentStorage={
  getItem:k=>persistentItems.get(k)||null,
  setItem:(k,v)=>persistentItems.set(k,v),
  removeItem:k=>persistentItems.delete(k)
 };
 const fetch=async(url,request)=>{
  requests.push({url,method:request.method,body:request.body?JSON.parse(request.body):null});
  const path=new URL(url);
  let data=[];
  if(path.pathname.endsWith('/inspector_profiles')){
   if(path.searchParams.has('id'))data=[{id:uid,email:'inspector@example.dz',first_name:'مفتش',last_name:'تجريبي',profession:'IFEP',district:'تبسة',approved:true,is_admin:false}];
   else data=[{id:uid,email:'inspector@example.dz',first_name:'مفتش',last_name:'تجريبي',profession:'IFEP',district:'تبسة',approved:true,is_admin:false},...otherProfiles];
  }else if(path.pathname.endsWith('/shared_institutions')){
   if(request.method==='PATCH')data=conflict?[]:[{id:institutionId,name:'مركز تبسة 1',version:2}];
   else data=[entry];
  }else if(path.pathname.endsWith('/institution_notifications'))data=[];
  return {ok:true,status:200,text:async()=>JSON.stringify(data)};
 };
 const context={
  window:{REPORT03_CLOUD_CONFIG:configured?{supabaseUrl:'https://project.supabase.co',publishableKey:'sb_publishable_test_1234567890123456'}:{},Report03CloudBridge:bridge},
  document,fetch,sessionStorage:storage,localStorage:persistentStorage,
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
 assert.match(h.elements['cloud-content'].innerHTML,/مهامي الجارية/);
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
 for(const page of ['calendar','teams','messages']){
  await h.navigate(page);
  assert.match(h.elements['cloud-content'].innerHTML,/قيد التطوير/);
 }
});


test('M2.2 shell: selected version remains pinned until successful write, independent of refreshed list',async()=>{
 const h=createHarness();await h.ready();await h.navigate('institutions');
 h.events.root.change({target:{id:'cloud-select',value:institutionId}});
 // A newer server version is now visible; the editor must not blindly write with that version.
 await h.navigate('dashboard');await h.navigate('institutions');
 await h.action('save');
 const patch=h.requests.find(x=>x.method==='PATCH'&&x.url.includes('/shared_institutions'));
 assert.ok(patch);
 assert.equal(new URL(patch.url).searchParams.get('version'),'eq.1');
 assert.equal(patch.body.version,2);
});
test('M2.2 shell: signup and admin commands stay inside the account portal, not within report entry',()=>{
 const html=readFileSync('index.html','utf8');
 assert.ok(html.indexOf('id="cloud-shell"')>html.indexOf('id="workspace"'));
 assert.match(source,/function accountView\(\)/);
 assert.match(source,/function renderAccountsManagement\(\)/);
 assert.match(source,/function portalNavigation\(\)/);
 assert.match(app,/prepareLogout\(\)/);
 assert.match(html,/id="return-dashboard"/);
});


test('M2.2.1: logout and inspector name appear persistently on portal header and report header',async()=>{
 const html=readFileSync('index.html','utf8');
 const styles=readFileSync('style.css','utf8');
 assert.match(html,/id="report-user-name"/);
 assert.match(html,/id="report-logout"/);
 assert.match(source,/data-cloud-action="logout"/);
 assert.match(source,/portal-session-controls/);
 assert.match(styles,/\.portal-topbar\{position:sticky/);
 assert.match(styles,/\.app \.topbar\{position:sticky/);
 assert.match(styles,/\.session-controls\[hidden\]\{display:none!important\}/);
 const h=createHarness();await h.ready();
 assert.match(h.elements['cloud-content'].innerHTML,/portal-session-controls/);
 assert.match(h.elements['cloud-content'].innerHTML,/تسجيل الخروج/);
 await h.navigate('report');
 assert.equal(h.elements['report-session-controls'].hidden,false);
 assert.equal(h.elements['report-user-name'].textContent,'مفتش تجريبي');
 assert.equal(typeof h.events.report.click,'function');
 await h.navigate('dashboard');
 assert.equal(h.elements['report-session-controls'].hidden,true);
});
test('M2.2.1: header logout uses same unsaved-report safeguard and does not sign out if cancelled',async()=>{
 const h=createHarness();await h.ready();await h.navigate('report');
 let calls=0;
 h.bridge.prepareLogout=()=>{calls++;return false};
 await h.events.report.click();
 assert.equal(calls,1);
 assert.equal(h.requests.filter(x=>x.url.endsWith('/auth/v1/logout')).length,0);
 assert.equal(h.elements['report-session-controls'].hidden,false);
 assert.equal(h.elements['report-logout'].disabled,false);
});
test('M2.2.1: report header logout clears session and returns to login, without extra credentials',async()=>{
 const h=createHarness();await h.ready();await h.navigate('report');
 let calls=0;
 h.bridge.prepareLogout=()=>{calls++;return true};
 await h.events.report.click();
 assert.equal(calls,1);
 assert.equal(h.requests.filter(x=>x.url.endsWith('/auth/v1/logout')).length,1);
 assert.equal(h.elements['report-session-controls'].hidden,true);
 assert.match(h.elements['cloud-content'].innerHTML,/تسجيل الدخول/);
 assert.match(h.elements['cloud-content'].innerHTML,/إنشاء حساب/);
 assert.equal(h.elements['report-user-name'].textContent,'');
});
test('M2.2.1: portal header logout works from dashboard without first opening account page',async()=>{
 const h=createHarness();await h.ready();
 h.bridge.prepareLogout=()=>true;
 await h.action('logout');
 assert.equal(h.requests.filter(x=>x.url.endsWith('/auth/v1/logout')).length,1);
 assert.match(h.elements['cloud-content'].innerHTML,/تسجيل الدخول/);
});


test('M2.2.2: report bridge lists all available central institutions after approved sign-in',async()=>{
 const h=createHarness();await h.ready();
 const shared=h.context.window.Report03CloudUI.listReportInstitutions();
 assert.equal(shared.length,1);
 assert.equal(shared[0].name,'مركز تبسة 1');
 assert.equal(shared[0].code,'1201');
 assert.equal(shared[0].id,institutionId);
 assert.equal(Object.hasOwn(shared[0],'institution_data'),false);
 const inactive=createHarness(false);await inactive.ready();
 assert.equal(inactive.context.window.Report03CloudUI.listReportInstitutions().length,0);
});
test('M2.2.2: selecting central institution populates report identity and current director without local saves',async()=>{
 const h=createHarness();await h.ready();
 const result=h.context.window.Report03CloudUI.selectForReport(institutionId);
 assert.equal(result.ok,true);
 assert.equal(h.bridge.received.institution.code,'1201');
 assert.equal(h.bridge.received.director.fullName,'الرئيس القديم');
 assert.equal(h.bridge.received.metadata.sharedInstitutionId,institutionId);
 assert.equal(h.requests.filter(r=>r.method==='POST'&&r.url.includes('/shared_institutions')).length,0);
 assert.equal(h.requests.filter(r=>r.method==='PATCH'&&r.url.includes('/shared_institutions')).length,0);
 const missing=h.context.window.Report03CloudUI.selectForReport('not-a-real-id');
 assert.equal(missing.ok,false);
 assert.match(missing.message,/غير موجودة/);
});
test('M2.2.2: report select renders shared and legacy local institutions in distinct groups',()=>{
 const a=app.indexOf('function renderInstitutionBook(){');
 const b=app.indexOf('\nfunction emptyState(){',a);
 assert.ok(a>=0&&b>a);
 const functionBody=app.slice(a,b);
 const shared=[{id:'central-1214',name:'معهد بن طبال',wilaya:'تبسة',code:'1214'},
               {id:'central-1201',name:'مركز تبسة',wilaya:'تبسة',code:'1201'},
               {id:'central-1224',name:'معهد الشريعة',wilaya:'تبسة',code:'1224'}];
 const local=[{id:'local-test',institution:{name:'مؤسسة تجريبية',wilaya:'تبسة',code:'9999'}}];
 const context={window:{Report03CloudUI:{listReportInstitutions:()=>shared}},
  institutionBook:local,selectedInstitutionId:'',selectedCloudInstitutionId:'',bookError:'',
  safe:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')};
 const rendered=vm.runInNewContext(functionBody+'\nrenderInstitutionBook()',context,{timeout:10000});
 assert.match(rendered,/المؤسسات المشتركة — السجل المركزي \(3\)/);
 assert.match(rendered,/المؤسسات المحلية — هذا الجهاز \(1\)/);
 for(const x of shared)assert.ok(rendered.includes('value="central:'+x.id+'"'));
 assert.match(rendered,/value="local-test"/);
 assert.match(rendered,/التعديل داخل التقرير لا يغيّر بيانات المؤسسة المركزية/);
});
test('M2.2.2: central selection delegates to cloud bridge instead of local storage',()=>{
 const start=app.indexOf('function chooseInstitution(id){');
 const end=app.indexOf('\nfunction saveInstitution(){',start);
 assert.ok(start>=0&&end>start);
 let selected='',saved=0;
 const ctx={window:{Report03CloudUI:{selectForReport(id){selected=id;return {ok:true}},resetSelection(){}}},
  institutionBook:[{id:'local-test'}],safe:s=>s,
  showToast(){},render(){},hasInspectionInput(){return false},
  persistBook(){saved++},state:{institution:{},director:{}},text:s=>String(s||''),
  confirm(){return true},changed:false,selectedInstitutionId:'',selectedCloudInstitutionId:''};
 vm.runInNewContext(app.slice(start,end)+"\nchooseInstitution('central:central-1214')",ctx,{timeout:10000});
 assert.equal(selected,'central-1214');
 assert.equal(saved,0);
 assert.equal(ctx.institutionBook.length,1);
 assert.match(app,/selectedCloudInstitutionId=metadata\.sharedInstitutionId\|\|''/);
});


test('M2.2.3: shared count and options update from 0 to 3 without resetting active report fields',()=>{
 const start=app.indexOf('function syncSharedInstitutionOptions(){');
 const end=app.indexOf('\nfunction emptyState(){',start);
 assert.ok(start>0&&end>start);
 const fn=app.slice(start,end);
 let data=[];
 const editorField={value:'معاينة قيد التحرير'};
 const group={
  label:'المؤسسات المشتركة — السجل المركزي (0)',
  children:[],
  querySelectorAll(){return this.children},
  replaceChildren(...elements){this.children=elements}
 };
 const select={
  value:'local-test',
  querySelector(selector){return selector==='optgroup[data-institution-source="central"]'?group:null},
  get options(){return [{value:''},{value:'local-test'},...group.children]}
 };
 const context={
  window:{Report03CloudUI:{listReportInstitutions(){return data}}},
  document:{createElement(tag){assert.equal(tag,'option');return {value:'',textContent:''}}},
  $(id){return id==='stored-institution'?select:editorField},
  selectedCloudInstitutionId:''
 };
 const sync=vm.runInNewContext(fn+'\nsyncSharedInstitutionOptions',context,{timeout:10000});
 assert.equal(sync(),false);
 assert.equal(group.label,'المؤسسات المشتركة — السجل المركزي (0)');
 data=[
  {id:'i1214',name:'المعهد الوطني',code:'1214',wilaya:'تبسة'},
  {id:'i1201',name:'مركز التكوين',code:'1201',wilaya:'تبسة'},
  {id:'i1224',name:'معهد التعليم',code:'1224',wilaya:'تبسة'}
 ];
 assert.equal(sync(),true);
 assert.equal(group.children.length,3);
 assert.equal(group.label,'المؤسسات المشتركة — السجل المركزي (3)');
 assert.equal(group.children[1].value,'central:i1201');
 assert.equal(select.value,'local-test');
 assert.equal(editorField.value,'معاينة قيد التحرير');
 assert.equal(sync(),false); // No disruptive replacement for unchanged lists
 data=data.map(x=>({...x}));
 data[0].name='المعهد الوطني المتخصص';
 assert.equal(sync(),true);
 assert.equal(group.children[0].textContent,'المعهد الوطني المتخصص — تبسة (1214)');
 assert.equal(editorField.value,'معاينة قيد التحرير');
});
test('M2.2.3: central dropdown preserves a selected central institution on updates',()=>{
 const start=app.indexOf('function syncSharedInstitutionOptions(){');
 const end=app.indexOf('\nfunction emptyState(){',start);
 const fn=app.slice(start,end);
 let data=[{id:'i1214',name:'المعهد',wilaya:'تبسة',code:'1214'}];
 const group={label:'المؤسسات المشتركة — السجل المركزي (0)',children:[],
  querySelectorAll(){return this.children},
  replaceChildren(...nodes){this.children=nodes}};
 const select={value:'central:i1214',
  querySelector(){return group},
  get options(){return [{value:''},...group.children]}};
 const context={window:{Report03CloudUI:{listReportInstitutions:()=>data}},
  document:{createElement:()=>({value:'',textContent:''})},
  $:()=>select,selectedCloudInstitutionId:'i1214'};
 const sync=vm.runInNewContext(fn+'\nsyncSharedInstitutionOptions',context,{timeout:10000});
 assert.equal(sync(),true);
 assert.equal(select.value,'central:i1214');
 data=[{id:'i1214',name:'المعهد بتسمية محدثة',wilaya:'تبسة',code:'1214'}];
 assert.equal(sync(),true);
 assert.equal(select.value,'central:i1214');
});
test('M2.2.3: cloud renders live report dropdown on entry and when remote data is refreshed',async()=>{
 const h=createHarness();let calls=0;
 h.bridge.syncSharedInstitutionOptions=()=>{calls++;return true};
 await h.ready();
 assert.equal(calls,0); // dashboard must not change report internals
 await h.navigate('report');
 assert.equal(calls,1);
 await h.action('refresh');
 assert.ok(calls>=2);
 await h.navigate('dashboard');
 const unchanged=calls;
 await h.action('refresh');
 assert.equal(calls,unchanged);
 assert.match(source,/if\(report\)\{window\.Report03CloudBridge\?\.syncSharedInstitutionOptions\?\.\(\)/);
});


test('M2.2.5: colleague directory exposes approved peers with name, role and district only',async()=>{
 const extra=[
  {id:'818b3f29-a934-45e0-a6ab-4ec731430001',first_name:'فاطمة',last_name:'خالد',profession:'ITP',district:'12',email:'fatima@example.dz',approved:true},
  {id:'818b3f29-a934-45e0-a6ab-4ec731430002',first_name:'خالد',last_name:'علي',profession:'IAF',district:'15',email:'khaled@example.dz',approved:true},
  {id:'818b3f29-a934-45e0-a6ab-4ec731430003',first_name:'معلقة',last_name:'التجربة',profession:'IFEP',district:'99',approved:false,account_status:'suspended'},
  {id:'818b3f29-a934-45e0-a6ab-4ec731430004',first_name:'مرفوض',last_name:'الطلب',profession:'ITP',approved:false,account_status:'rejected'}
 ];
 const h=createHarness(true,false,extra);await h.ready();
 const directory=h.context.window.Report03CloudUI.listReportColleagues();
 assert.equal(directory.length,2);
 assert.deepEqual([...directory.map(p=>p.first_name)],['فاطمة','خالد']);
 assert.equal(directory[0].profession,'ITP');
 assert.equal(directory[0].district,'12');
 assert.equal(directory[1].profession,'IAF');
 assert.ok(!Object.hasOwn(directory[0],'email'));
 assert.equal(h.context.window.Report03CloudUI.findReportColleague(extra[2].id),null);
 assert.equal(h.context.window.Report03CloudUI.findReportColleague(uid),null);
 assert.equal(h.context.window.Report03CloudUI.findReportColleague(extra[1].id).last_name,'علي');
});
test('M2.2.5: directory interface refuses to expose coworkers without approved account',async()=>{
 const h=createHarness();await h.ready();
 assert.deepEqual([...h.context.window.Report03CloudUI.listReportColleagues()],[]);
 assert.equal(h.context.window.Report03CloudUI.findReportColleague(uid),null);
 assert.match(source,/if\(!verifiedUser\(\)\)return \[\];\s*return profiles\.filter/);
 assert.match(source,/if\(!verifiedUser\(\)\)return null;\s*const colleague=profiles\.find/);
 assert.match(source,/select:'id,email,first_name,last_name,profession,district,approved,is_admin,account_status'/);
});
test('M2.2.5: live report directory updates independently on authenticated portal refresh',async()=>{
 const h=createHarness();let calls=0;
 h.bridge.syncReportColleagueOptions=()=>{calls++;return true};
 await h.ready();
 await h.navigate('report');
 assert.equal(calls,1);
 await h.action('refresh');
 assert.ok(calls>=2);
 const unchanged=calls;
 await h.navigate('dashboard');
 await h.action('refresh');
 assert.equal(calls,unchanged);
});

test('M4.2: mobile print tab recreation restores user without a second login',async()=>{
 const persistentItems=new Map();
 const first=createHarness(true,false,[],{persistentItems});
 await first.ready();
 const key='official_report03_cloud_session_v1';
 assert.ok(persistentItems.has(key),'Existing tab-only session is migrated to device storage');
 // Android may dispose sessionStorage during print preview. The new page
 // has only origin-scoped persistent storage, but must open the dashboard.
 const returned=createHarness(true,false,[],{persistentItems,emptyTabStorage:true});
 await returned.ready();
 assert.match(returned.elements['cloud-content'].innerHTML,/لوحة القيادة/);
 assert.match(returned.elements['cloud-content'].innerHTML,/مهامي الجارية/);
 assert.doesNotMatch(returned.elements['cloud-content'].innerHTML,/cloud-auth-form/);
 // Sign-out must revoke and remove both stores: no unwanted auto-sign-in.
 await returned.action('logout');
 assert.equal(persistentItems.has(key),false,'Explicit logout clears persistent credentials');
 const afterLogout=createHarness(true,false,[],{persistentItems,emptyTabStorage:true});
 await afterLogout.ready();
 assert.match(afterLogout.elements['cloud-content'].innerHTML,/cloud-auth-form/);
});

test('M4.2: session persistence never places tokens in a URL and respects storage failures',()=>{
 assert.match(source,/localStorage\.setItem\(SESSION_KEY,serialized\)/);
 assert.match(source,/localStorage\.removeItem\(SESSION_KEY\)/);
 assert.match(source,/sessionStorage\.setItem\(SESSION_KEY,serialized\)/);
 assert.match(source,/if\(legacy\)storageSet\(x\)/);
 assert.doesNotMatch(source,/location\.hash\s*=\s*.*refresh_token/);
});
