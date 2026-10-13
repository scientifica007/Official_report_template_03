import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const cloud=readFileSync('cloud.js','utf8');
const sql=readFileSync('supabase/migrations/003_shared_inspection_missions.sql','utf8');
const A='3adbe93f-3755-4cb0-b246-90fabd0ef6fa';
const B='4b0e6d35-81c2-4fbe-b88e-c2ebf1595a91';
const C='5bc409e2-18d3-46da-a7c8-dd53ae51af1b';
const I='966acf35-fc0f-45fa-9123-9c68fc272d82';
const M='aa019a82-4ed3-4d64-b0e1-d8941e140012';
const people=[
 {id:A,email:'a@example.dz',first_name:'حاتم',last_name:'زريبي',profession:'IFEP',district:'12',approved:true,account_status:'approved'},
 {id:B,email:'b@example.dz',first_name:'مفتش',last_name:'ثان',profession:'IAF',district:'13',approved:true,account_status:'approved'},
 {id:C,email:'c@example.dz',first_name:'غير',last_name:'معتمد',profession:'ITP',district:'15',approved:false,account_status:'pending'}
];
const institution={id:I,name:'مركز تبسة',code:'1201',wilaya:'تبسة',version:1,
 institution_data:{name:'مركز تبسة',code:'1201',wilaya:'تبسة'},director_data:{fullName:'الرئيس'}};
function db(){return {missions:[],members:[],notifications:[],contributions:[],fields:[],assessments:[],available:true,requests:[],calls:0}}
function makeClient(database,uid){
 const handlers={root:{},document:{},report:{}},elements={
  'cloud-shell':{hidden:false},'cloud-content':{innerHTML:'',addEventListener(n,f){handlers.root[n]=f}},
  'cloud-unread':{textContent:''},'report-session-controls':{hidden:true},
  'report-user-name':{textContent:''},'report-logout':{disabled:false,addEventListener(n,f){handlers.report[n]=f}},
  'mission-peer':{value:B}
 };
 const doc={getElementById:id=>elements[id]||null,addEventListener(n,f){handlers.document[n]=f},hidden:false};
 const ses={access_token:'token',refresh_token:'refresh',user:{id:uid,email:uid+'@example.dz'},expires_at_ms:Date.now()+900000};
 const storage={getItem:()=>JSON.stringify(ses),setItem(){},removeItem(){}};
 const fetch=async(url,opts)=>{
  const u=new URL(url),table=u.pathname.split('/').at(-1);
  const method=opts.method||'GET',body=opts.body?JSON.parse(opts.body):null;
  database.requests.push({uid,table,method,body});
  if(!database.available&&table.startsWith('inspection_')){
   return {ok:false,status:404,text:async()=>JSON.stringify({message:'relation does not exist'})};
  }
  let response=[],status=200;
  if(table==='inspector_profiles')response=u.searchParams.has('id')?[people.find(p=>p.id===uid)]:people;
  else if(table==='shared_institutions')response=[institution];
  else if(table==='inspection_missions'){
   response=database.missions.filter(m=>database.members.some(mem=>
    mem.mission_id===m.id&&mem.inspector_id===uid&&mem.membership_status==='accepted'));
  }else if(table==='inspection_mission_members'){
   response=database.members.filter(m=>m.inspector_id===uid||database.members.some(x=>
    x.mission_id===m.mission_id&&x.inspector_id===uid&&x.membership_status==='accepted'));
  }else if(table==='inspection_mission_notifications'){
   if(method==='PATCH'){
    response=database.notifications.filter(n=>n.recipient_id===uid&&n.id===u.searchParams.get('id')?.replace('eq.',''));
    for(const n of response)n.read_at=body.read_at;
   }else response=database.notifications.filter(n=>n.recipient_id===uid);
  }else if(table==='inspection_contributions'){
   const mission=u.searchParams.get('mission_id')?.replace(/^eq\./,'');
   const allowed=database.members.some(m=>m.mission_id===mission&&m.inspector_id===uid&&m.membership_status==='accepted');
   response=allowed?database.contributions.filter(r=>r.mission_id===mission):[];
  }else if(table==='inspection_report_field_events'){
   response=database.fields.filter(e=>database.members.some(m=>
     m.mission_id===e.mission_id&&m.inspector_id===uid&&m.membership_status==='accepted'));
  }else if(table==='inspection_assessment_events'){
   response=database.assessments.filter(e=>database.members.some(m=>
     m.mission_id===e.mission_id&&m.inspector_id===uid&&m.membership_status==='accepted'));
  }else if(table==='set_inspection_report_field'||table==='set_inspection_assessment'){
   database.calls++;
   const id='8bbd3eee-8aa1-4b55-8f4f-'+String(database.calls).padStart(12,'0');
   const destination=table==='set_inspection_report_field'?database.fields:database.assessments;
   const row=table==='set_inspection_report_field'?
    {id,mission_id:body.p_mission_id,field_group:body.p_group,field_key:body.p_key,
     field_value:body.p_value,author_id:uid,created_at:new Date().toISOString()}:
    {id,mission_id:body.p_mission_id,item_id:body.p_item_id,
     assessment:body.p_assessment,author_id:uid,created_at:new Date().toISOString()};
   destination.push(row);response=id;
  }else if(table==='append_inspection_contribution'){
   const allowed=database.members.some(m=>m.mission_id===body.p_mission_id&&m.inspector_id===uid&&m.membership_status==='accepted');
   if(!allowed)return {ok:false,status:403,text:async()=>JSON.stringify({message:'Membership required'})};
   const parent=database.contributions.find(x=>x.id===body.p_parent_id);
   if(body.p_parent_id&&(!parent||parent.mission_id!==body.p_mission_id||parent.item_id!==body.p_item_id||
      (body.p_kind==='correction'&&parent.author_id!==uid))){
    return {ok:false,status:403,text:async()=>JSON.stringify({message:'Invalid parent'})};
   }
   const previous=database.contributions.find(r=>r.author_id===uid&&r.mission_id===body.p_mission_id&&
     r.client_request_id===body.p_client_request_id);
   if(previous)response=previous.id;
   else {
    database.calls++;
    const id='ff3d44b0-9833-4442-bcde-'+String(database.calls).padStart(12,'0');
    database.contributions.push({id,mission_id:body.p_mission_id,item_id:body.p_item_id,
     kind:body.p_kind,body:body.p_body,author_id:uid,parent_id:body.p_parent_id,
     client_request_id:body.p_client_request_id,created_at:new Date().toISOString()});
    response=id;
    if(database.failAfterAppendOnce){
     database.failAfterAppendOnce=false;
     throw Error('Network connection lost after commit');
    }
   }
  }else if(table==='create_inspection_mission'){
   if(uid===C)return {ok:false,status:403,text:async()=>JSON.stringify({message:'Approved inspector required'})};
   database.missions.push({id:M,title:body.p_title,purpose:body.p_purpose,
    institution_id:I,institution_snapshot:institution.institution_data,director_snapshot:institution.director_data,
    visit_start:body.p_visit_start,visit_end:body.p_visit_end,status:'draft',created_by:uid,created_at:new Date().toISOString()});
   database.members.push({mission_id:M,inspector_id:uid,invited_by:uid,membership_status:'accepted'});
   response=M;
  }else if(table==='invite_inspection_member'){
   database.members.push({mission_id:M,inspector_id:body.p_inspector_id,invited_by:uid,membership_status:'invited'});
   database.notifications.push({id:'14b67d88-07a5-466b-aa32-703e6dd9d012',
    mission_id:M,recipient_id:body.p_inspector_id,actor_id:uid,event_type:'invited',
    description:'دعوة لمهمة: '+database.missions[0].title,read_at:null,created_at:new Date().toISOString()});
  }else if(table==='respond_inspection_invitation'){
   const member=database.members.find(m=>m.mission_id===M&&m.inspector_id===uid);
   member.membership_status=body.p_accept?'accepted':'declined';
   for(const n of database.notifications.filter(n=>n.mission_id===M&&n.recipient_id===uid))n.read_at=new Date().toISOString();
  }
  return {ok:status<400,status,text:async()=>JSON.stringify(response)};
 };
 let uuidCount=0;
 const context={window:{REPORT03_CLOUD_CONFIG:{supabaseUrl:'https://sample.supabase.co',publishableKey:'sb_publishable_1234567890123456'},
  Report03CloudBridge:{canOpenSharedMission:()=>true,enterSharedMission(payload){this.snapshot=payload;return true},
   applySharedReportData(payload){this.snapshot=payload;return true},
   exitSharedMission:()=>true,rerenderShared(){},
   listSharedCatalogTargets:()=>[
   {id:'III-01-I001',section:'III',label:'المهام القانونية — القانون الأساسي'},
   {id:'II-MAIN-I001',section:'II',label:'المظهر العام — نوعية البنايات'}]}},
 document:doc,fetch,sessionStorage:storage,crypto:{randomUUID(){uuidCount++;return 'ed62dd4c-8c04-4748-bcba-'+String(uuidCount).padStart(12,'0')}} ,
 location:{hash:'',pathname:'/Official_report_template_03/',search:'',origin:'https://scientifica007.github.io'},
 history:{replaceState(){}},URL,URLSearchParams,Date,setInterval(){return 1},console};
 vm.runInNewContext(cloud,context,{timeout:10000});
 const event=(action,extras={})=>handlers.root.click({target:{closest(){return {dataset:{cloudAction:action,...extras},disabled:false}}}});
 return {handlers,elements,context,
  async init(){await handlers.document.DOMContentLoaded()},
  async nav(page){await event('nav',{page})},
  async action(action,extra){await event(action,extra)},
  async type(field,value){await handlers.root.input({target:{dataset:{missionField:field},value}})},
  async contribute(field,value){await handlers.root.input({target:{dataset:{contribField:field},value}})},
  choose(id){elements['mission-peer'].value=id},
  async selectMission(value){await handlers.root.change({target:{id:'mission-select',value}})},
  async embedded(action,itemId,parentId){
   await handlers.document.click({target:{closest(selector){
    return selector==='[data-shared-action]'?{dataset:{sharedAction:action,itemId,parentId},disabled:false}:null;
   }}});
  },
  async sharedText(itemId,value){await handlers.document.input({target:{dataset:{sharedBody:itemId},value}});},
  snapshot(){return context.window.Report03CloudBridge.snapshot},
  inline(itemId){return context.window.Report03CloudUI.renderSharedEntry(itemId)}

 };
}
test('M3.0 migration uses non-destructive, RLS-protected tables and only RPC writes',()=>{
 assert.match(sql,/begin;[\s\S]*commit;/i);
 for(const table of ['inspection_missions','inspection_mission_members','inspection_mission_notifications',
  'inspection_contributions','inspection_proposals']){
  assert.match(sql,new RegExp('create table if not exists public\\.'+table+' \\('));
  assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security;'));
  assert.match(sql,new RegExp('revoke all on public\\.'+table+' from public,anon,authenticated;'));
 }
 assert.match(sql,/grant update\(read_at\) on public\.inspection_mission_notifications to authenticated/);
 assert.doesNotMatch(sql,/grant (insert|delete|update) on public\.inspection_contributions to authenticated/i);
 assert.doesNotMatch(sql,/grant (insert|delete|update) on public\.inspection_missions to authenticated/i);
 for(const rpc of ['create_inspection_mission','invite_inspection_member','respond_inspection_invitation']){
  assert.match(sql,new RegExp('create or replace function public\\.'+rpc+'\\('));
  assert.match(sql,new RegExp('grant execute on function public\\.'+rpc+'\\('));
 }
 assert.match(sql,/security definer set search_path=''/);
 assert.match(sql,/public\.is_accepted_mission_member\(id\)/);
 assert.match(sql,/author_id uuid not null/);
 assert.match(sql,/unique \(mission_id,author_id,client_request_id\)/);
 assert.doesNotMatch(sql,/drop table|truncate table|delete from public\.shared_institutions/i);
});
test('M3.1: all sections keep working before SQL migration, without showing phantom shared tasks',async()=>{
 const database=db();database.available=false;const client=makeClient(database,A);await client.init();
 await client.nav('missions');
 assert.match(client.elements['cloud-content'].innerHTML,/الخدمة غير مفعّلة/);
 assert.match(client.elements['cloud-content'].innerHTML,/الترحيل 003/);
 await client.nav('institutions');
 assert.match(client.elements['cloud-content'].innerHTML,/مركز تبسة/);
 assert.ok(!database.missions.length);
});
test('M3.1: inspector A creates task and safely invites B, without uploading local report entries',async()=>{
 const database=db(),a=makeClient(database,A);await a.init();await a.nav('missions');
 await a.type('institutionId',I);
 await a.type('title','تفتيش معمق لمركز تبسة');
 await a.type('purpose','تقييم التسيير البيداغوجي');
 await a.type('visitStart','2026-10-15');
 await a.type('visitEnd','2026-10-16');
 await a.action('mission-create');
 assert.equal(database.missions.length,1);
 assert.equal(database.missions[0].created_by,A);
 assert.equal(database.missions[0].title,'تفتيش معمق لمركز تبسة');
 assert.equal(database.members[0].membership_status,'accepted');
 assert.match(a.elements['cloud-content'].innerHTML,/تفتيش معمق لمركز تبسة/);
 a.choose(B);await a.action('mission-invite');
 assert.equal(database.members.length,2);
 assert.equal(database.members[1].inspector_id,B);
 assert.equal(database.members[1].membership_status,'invited');
 assert.equal(database.notifications.length,1);
 assert.equal(database.notifications[0].recipient_id,B);
 assert.ok(database.requests.filter(x=>x.table==='inspection_contributions').every(x=>x.method==='GET')); // read-only
 assert.ok(!database.requests.some(x=>x.table==='inspection_contributions'&&x.method!=='GET'));
});
test('M3.1: second inspector accepts and sees membership, while A sees the accepted team after refresh',async()=>{
 const database=db(),a=makeClient(database,A);await a.init();await a.nav('missions');
 await a.type('institutionId',I);await a.type('title','تفتيش مشترك للمؤسسة');
 await a.action('mission-create');a.choose(B);await a.action('mission-invite');
 const b=makeClient(database,B);await b.init();await b.nav('missions');
 assert.match(b.elements['cloud-content'].innerHTML,/الدعوات الواردة \(1\)/);
 assert.doesNotMatch(b.elements['cloud-content'].innerHTML,/لم يحدد الهدف/);
 await b.action('mission-respond',{missionId:M,accept:'true'});
 assert.match(b.elements['cloud-content'].innerHTML,/قُبلت الدعوة/);
 assert.match(b.elements['cloud-content'].innerHTML,/تفتيش مشترك للمؤسسة/);
 await a.action('mission-refresh');
 assert.match(a.elements['cloud-content'].innerHTML,/مفتش ثان — مشارك/);
 assert.equal(database.members[1].membership_status,'accepted');
});
test('M3.1: invite rejection prevents invitation from appearing as an accepted shared mission',async()=>{
 const database=db(),a=makeClient(database,A);await a.init();await a.nav('missions');
 await a.type('institutionId',I);await a.type('title','مهمة تدريبية مشتركة');
 await a.action('mission-create');a.choose(B);await a.action('mission-invite');
 const b=makeClient(database,B);await b.init();await b.nav('missions');
 await b.action('mission-respond',{missionId:M,accept:'false'});
 assert.equal(database.members[1].membership_status,'declined');
 assert.match(b.elements['cloud-content'].innerHTML,/رُفضت الدعوة/);
 assert.match(b.elements['cloud-content'].innerHTML,/المهام التي تشارك فيها \(0\)/);
});
test('M3.1: invalid dates and institutions are rejected locally before any RPC request',async()=>{
 const database=db(),a=makeClient(database,A);await a.init();await a.nav('missions');
 await a.type('title','المهمة');
 await a.action('mission-create');
 assert.equal(database.requests.filter(r=>r.table==='create_inspection_mission').length,0);
 assert.match(a.elements['cloud-content'].innerHTML,/اختر مؤسسة/);
 await a.type('institutionId',I);await a.type('visitStart','2026-12-31');await a.type('visitEnd','2026-01-01');
 await a.action('mission-create');
 assert.equal(database.requests.filter(r=>r.table==='create_inspection_mission').length,0);
 assert.match(a.elements['cloud-content'].innerHTML,/تاريخ النهاية/);
});
test('M3.1: only account itself may respond to invitations; client sends no author overrides',()=>{
 assert.match(cloud,/respondMissionInvite\(button\.dataset\.missionId,accept\)/);
 assert.match(cloud,/missionMembers\.some\(x=>x\.mission_id===id&&x\.inspector_id===session\.user\.id&&x\.membership_status==='invited'\)/);
 assert.doesNotMatch(cloud,/p_actor_id|p_created_by|p_invited_by/);
 execFileSync(process.execPath,['--check','cloud.js']);
});


test('M3.2: SQL limits writes to RPC and validates actor, exact catalog target and parent',()=>{
 const sql4=readFileSync('supabase/migrations/004_append_only_inspection_contributions.sql','utf8');
 const catalog=JSON.parse(readFileSync('catalog.json','utf8'));
 const allIds=catalog.sections.flatMap(section=>section.domains.length?
  section.domains.flatMap(domain=>[domain.id,...domain.indicators.map(i=>i.id)]):
  ['X','XI'].includes(section.id)?[section.id]:[]);
 assert.equal(allIds.length,217);
 for(const id of allIds)assert.ok(sql4.includes("('"+id+"')"),'Missing official item '+id);
 assert.match(sql4,/create or replace function public\.append_inspection_contribution\(/);
 assert.match(sql4,/v_actor uuid := \(select auth\.uid\(\)\)/);
 assert.match(sql4,/public\.is_accepted_mission_member\(p_mission_id\)/);
 assert.match(sql4,/from public\.inspection_missions[\s\S]{0,100}status='draft' for share/);
 assert.match(sql4,/public\.inspection_catalog_targets where item_id=v_item/);
 assert.match(sql4,/v_parent\.author_id<>v_actor/);
 assert.match(sql4,/on conflict \(mission_id,author_id,client_request_id\) do nothing/);
 assert.match(sql4,/v_existing\.parent_id is distinct from p_parent_id/);
 assert.match(sql4,/grant execute on function public\.append_inspection_contribution/);
 assert.match(sql4,/revoke insert,update,delete on public\.inspection_contributions from public,anon,authenticated/);
 assert.doesNotMatch(sql4,/drop table|truncate table|delete from public\.inspection_contributions/i);
});
async function twoAccounts(){
 const data=db(),a=makeClient(data,A);await a.init();await a.nav('missions');
 await a.type('institutionId',I);await a.type('title','مهمة تفتيش مشتركة قابلة للتحرير');
 await a.action('mission-create');a.choose(B);await a.action('mission-invite');
 const b=makeClient(data,B);await b.init();await b.nav('missions');
 await b.action('mission-respond',{missionId:M,accept:'true'});
 await a.action('mission-refresh');
 return {data,a,b};
}
test('M3.2: account A adds finding and B sees it after refresh, then B adds recommendation',async()=>{
 const {data,a,b}=await twoAccounts();
 await a.contribute('itemId','III-01-I001');
 await a.contribute('kind','finding');
 await a.contribute('body','معاينة أولى تخص ممارسة المهام القانونية للمؤسسة');
 await a.action('contribution-add');
 assert.equal(data.contributions.length,1);
 assert.equal(data.contributions[0].author_id,A);
 assert.equal(data.contributions[0].item_id,'III-01-I001');
 assert.match(a.elements['cloud-content'].innerHTML,/حُفظت المساهمة المشتركة باسمك/);
 await b.action('contribution-refresh');
 await b.action('open-mission-report');
 assert.match(b.inline('III-01-I001'),/معاينة أولى تخص ممارسة المهام القانونية/);
 assert.match(b.inline('III-01-I001'),/حاتم زريبي/);
 await b.contribute('itemId','III-01-I001');
 await b.contribute('kind','recommendation');
 await b.contribute('body','توصية ثانية من المفتش الإداري والمالي');
 await b.action('contribution-add');
 assert.equal(data.contributions.length,2);
 assert.equal(data.contributions[1].author_id,B);
 assert.equal(data.contributions[1].kind,'recommendation');
 await a.action('contribution-refresh');
 await a.action('open-mission-report');
 assert.match(a.inline('III-01-I001'),/توصية ثانية من المفتش الإداري والمالي/);
 assert.ok(!data.requests.some(x=>x.table==='inspection_contributions'&&x.method!=='GET'));
 assert.equal(data.requests.filter(x=>x.table==='append_inspection_contribution').length,2);
});
test('M3.2: other inspector may reply, but cannot correct author original; author may correct',async()=>{
 const {data,a,b}=await twoAccounts();
 await a.contribute('itemId','II-MAIN-I001');await a.contribute('body','نص المعاينة الأصلية');
 await a.action('contribution-add');
 const original=data.contributions[0];
 await b.action('contribution-refresh');
 await b.action('contribution-reply',{contributionId:original.id});
 await b.contribute('body','إضافة زميل بخصوص نفس العنصر');
 await b.action('contribution-add');
 assert.equal(data.contributions.length,2);
 assert.equal(data.contributions[1].parent_id,original.id);
 assert.equal(data.contributions[1].kind,'reply');
 await b.action('contribution-correct',{contributionId:original.id});
 assert.equal(data.contributions.length,2);
 assert.match(b.elements['cloud-content'].innerHTML,/التصحيح خاص بصاحب النص/);
 await a.action('contribution-correct',{contributionId:original.id});
 await a.contribute('body','تصحيح موثق من مؤلف المعاينة');
 await a.action('contribution-add');
 assert.equal(data.contributions.length,3);
 assert.equal(data.contributions[0].body,'نص المعاينة الأصلية');
 assert.equal(data.contributions[2].kind,'correction');
 assert.equal(data.contributions[2].author_id,A);
 await b.action('contribution-refresh');
 await b.action('open-mission-report');
 assert.match(b.inline('II-MAIN-I001'),/إضافة زميل بخصوص نفس العنصر/);
 assert.match(b.inline('II-MAIN-I001'),/تصحيح موثق من مؤلف المعاينة/);
});
test('M3.2: pending invitation cannot read or write contributions until accepted',async()=>{
 const data=db(),a=makeClient(data,A);await a.init();await a.nav('missions');
 await a.type('institutionId',I);await a.type('title','فحص عضوية المهمة');
 await a.action('mission-create');a.choose(B);await a.action('mission-invite');
 const b=makeClient(data,B);await b.init();await b.nav('missions');
 assert.doesNotMatch(b.elements['cloud-content'].innerHTML,/نص المعاينة/);
 const reqs=data.requests.filter(x=>x.uid===B&&x.table==='inspection_contributions');
 assert.equal(reqs.length,0);
 assert.equal(data.contributions.length,0);
 assert.match(b.elements['cloud-content'].innerHTML,/قبول المشاركة/);
});
test('M3.2: closing mission and missing catalog selection prevent saves',async()=>{
 const {data,a}=await twoAccounts();
 await a.contribute('body','نص بدون مؤشر');
 await a.action('contribution-add');
 assert.equal(data.contributions.length,0);
 assert.match(a.elements['cloud-content'].innerHTML,/اختر عنصرًا رسميًا/);
 data.missions[0].status='closed';
 await a.action('mission-refresh');
 assert.equal(data.contributions.length,0);
});
test('M3.2: report bridge exposes stable IDs; individual editor remains tab-local and removable',()=>{
 const app=readFileSync('app.js','utf8');
 assert.match(app,/listSharedCatalogTargets\(\)\{/);
 assert.match(app,/rows\.push\(\{id:indicator\.id,label:/);
 assert.match(app,/window\.Report03CloudBridge=/);
 assert.match(app,/function exportSnapshot\(\)/);
 assert.doesNotMatch(app,/append_inspection_contribution|inspection_contributions/);
 assert.match(cloud,/data-contrib-field="body"/);
 assert.match(cloud,/contributionLoadedFor===selectedMissionId/);
 assert.match(cloud,/if\(currentPage==='missions'&&document\.activeElement\?\.matches\?\.\('\[data-contrib-field\]'\)\)return/);
 execFileSync(process.execPath,['--check','app.js']);
 execFileSync(process.execPath,['--check','cloud.js']);
});


test('M3.2: ambiguous network loss retries same UUID and never duplicates a contribution',async()=>{
 const {data,a}=await twoAccounts();
 await a.contribute('itemId','III-01-I001');
 await a.contribute('body','معاينة ينبغي عدم تكرارها');
 data.failAfterAppendOnce=true;
 await a.action('contribution-add');
 assert.equal(data.contributions.length,1);
 assert.match(a.elements['cloud-content'].innerHTML,/تعذر تنفيذ العملية/);
 await a.action('contribution-add');
 assert.equal(data.contributions.length,1);
 const calls=data.requests.filter(x=>x.table==='append_inspection_contribution');
 assert.equal(calls.length,2);
 assert.equal(calls[0].body.p_client_request_id,calls[1].body.p_client_request_id);
 assert.match(a.elements['cloud-content'].innerHTML,/حُفظت المساهمة المشتركة باسمك/);
});
test('M3.2: pending text is stored in client draft rather than auto-submitted by background refresh',async()=>{
 const {data,a}=await twoAccounts();
 await a.contribute('itemId','II-MAIN-I001');
 await a.contribute('body','مسودة لم يتم الضغط على حفظها');
 await a.action('mission-refresh');
 assert.equal(data.contributions.length,0);
 assert.equal(data.contributions.length,0);
 assert.ok(!data.requests.some(x=>x.table==='append_inspection_contribution'));
 assert.ok(!data.requests.some(x=>x.table==='append_inspection_contribution'));
 assert.match(cloud,/توجد مساهمات مشتركة مكتوبة ولم تُحفظ بعد/);
});


test('M3.3: mission launch opens unified editor, shared finding appears across two accounts',async()=>{
 const {data,a,b}=await twoAccounts();
 await a.action('open-mission-report');
 assert.equal(a.snapshot().missionId,M);
 assert.equal(a.snapshot().institution.name,'مركز تبسة');
 assert.equal(a.snapshot().director.fullName,'الرئيس');
 assert.equal(a.snapshot().inspectors.length,2);
 assert.match(a.inline('III-01-I001'),/المعاينات والتوصيات \(0\)/);
 await a.sharedText('III-01-I001','معاينة حقيقية من محرر التقرير الرسمي');
 await a.embedded('save','III-01-I001');
 assert.equal(data.contributions.length,1);
 assert.equal(data.contributions[0].author_id,A);
 assert.equal(data.contributions[0].item_id,'III-01-I001');
 await b.action('open-mission-report');
 assert.match(b.inline('III-01-I001'),/معاينة حقيقية من محرر التقرير الرسمي/);
 const output=await b.context.window.Report03CloudUI.prepareSharedExport();
 assert.equal(output.entries['III-01-I001'].findings.length,1);
 assert.equal(output.entries['III-01-I001'].findings[0].authorName,'حاتم زريبي');
 assert.equal(output.entries['III-01-I001'].findings[0].text,'معاينة حقيقية من محرر التقرير الرسمي');
 assert.equal(data.requests.filter(x=>x.table==='append_inspection_contribution').length,1);
});
test('M3.3: peer correction is restricted; author correction is reflected in unified export and full audit',async()=>{
 const {data,a,b}=await twoAccounts();
 await a.action('open-mission-report');
 await a.sharedText('III-01-I001','صياغة أصلية للتفتيش');
 await a.embedded('save','III-01-I001');
 const original=data.contributions[0];
 await b.action('open-mission-report');
 await b.embedded('correct','III-01-I001',original.id);
 assert.equal(data.contributions.length,1);
 await b.embedded('reply','III-01-I001',original.id);
 await b.sharedText('III-01-I001','تعقيب المفتش الثاني');
 await b.embedded('save','III-01-I001');
 await a.context.window.Report03CloudUI.refreshSharedReport();
 await a.embedded('correct','III-01-I001',original.id);
 await a.sharedText('III-01-I001','الصياغة المصححة من صاحبها');
 await a.embedded('save','III-01-I001');
 await b.context.window.Report03CloudUI.refreshSharedReport();
 const output=await b.context.window.Report03CloudUI.prepareSharedExport();
 assert.equal(output.entries['III-01-I001'].findings[0].text,'الصياغة المصححة من صاحبها');
 assert.equal(output.entries['III-01-I001'].findings[0].originalText,'صياغة أصلية للتفتيش');
 assert.equal(output.provenance.length,3);
 assert.equal(output.provenance.filter(x=>x.kind==='reply').length,1);
 assert.ok(!output.entries['III-01-I001'].findings.some(x=>x.text==='تعقيب المفتش الثاني'));
});
test('M3.3: optional assessments and report summary fields synchronize and appear in unified snapshot',async()=>{
 const {data,a,b}=await twoAccounts();
 await a.action('open-mission-report');
 const assess={dataset:{assessment:'III-01-I001'},value:'not_applicable',disabled:false};
 await a.handlers.document.change({target:assess});
 const field={dataset:{group:'summary',field:'generalAssessment'},value:'تقدير جماعي تجريبي',disabled:false};
 await a.handlers.document.change({target:field});
 assert.equal(data.assessments.length,1);
 assert.equal(data.fields.length,1);
 await b.action('open-mission-report');
 const output=await b.context.window.Report03CloudUI.prepareSharedExport();
 assert.equal(output.entries['III-01-I001'].assessment,'not_applicable');
 assert.equal(output.summary.generalAssessment,'تقدير جماعي تجريبي');
 assert.equal(data.assessments[0].author_id,A);
 assert.equal(data.fields[0].author_id,A);
});
test('M3.3: pending unsaved text blocks unified export without uploading anything',async()=>{
 const {data,a}=await twoAccounts();
 await a.action('open-mission-report');
 await a.sharedText('III-01-I001','نص لم يتم حفظه');
 await assert.rejects(()=>a.context.window.Report03CloudUI.prepareSharedExport(),/لم تحفظها بعد/);
 assert.equal(data.contributions.length,0);
 assert.match(a.inline('III-01-I001'),/نص لم يتم حفظه/);
});
