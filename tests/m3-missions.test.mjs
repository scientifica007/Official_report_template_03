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
function db(){return {missions:[],members:[],notifications:[],available:true,requests:[],calls:0}}
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
  }else if(table==='create_inspection_mission'){
   if(uid===C)return {ok:false,status:403,text:async()=>JSON.stringify({message:'Approved inspector required'})};
   database.missions.push({id:M,title:body.p_title,purpose:body.p_purpose,
    institution_id:I,institution_snapshot:institution.institution_data,
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
 const context={window:{REPORT03_CLOUD_CONFIG:{supabaseUrl:'https://sample.supabase.co',publishableKey:'sb_publishable_1234567890123456'},Report03CloudBridge:{}},
 document:doc,fetch,sessionStorage:storage,
 location:{hash:'',pathname:'/Official_report_template_03/',search:'',origin:'https://scientifica007.github.io'},
 history:{replaceState(){}},URL,URLSearchParams,Date,setInterval(){return 1},console};
 vm.runInNewContext(cloud,context,{timeout:10000});
 const event=(action,extras={})=>handlers.root.click({target:{closest(){return {dataset:{cloudAction:action,...extras},disabled:false}}}});
 return {handlers,elements,context,
  async init(){await handlers.document.DOMContentLoaded()},
  async nav(page){await event('nav',{page})},
  async action(action,extra){await event(action,extra)},
  async type(field,value){await handlers.root.input({target:{dataset:{missionField:field},value}})},
  choose(id){elements['mission-peer'].value=id},
  async selectMission(value){await handlers.root.change({target:{id:'mission-select',value}})}
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
 assert.equal(database.requests.filter(x=>x.table==='inspection_contributions').length,1); // read only
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
