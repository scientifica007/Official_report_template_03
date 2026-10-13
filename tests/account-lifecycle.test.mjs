import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';

const source=readFileSync('cloud.js','utf8');
const sql=readFileSync('supabase/migrations/002_inspector_account_lifecycle.sql','utf8');
const adminId='11111111-1111-4111-8111-111111111111';
const pendingId='22222222-2222-4222-8222-222222222222';
const userId='33333333-3333-4333-8333-333333333333';
const person={id:pendingId,email:'test-inspector@example.dz',first_name:'مفتش',last_name:'تجريبي',
 profession:'IFEP',approved:false,is_admin:false,account_status:'pending'};

function harness({admin=true,accountStatus='approved',confirmation=true}={}){
 const events={},requests=[],confirms=[];
 const state={person:{...person},decisions:[],profile:{
  id:adminId,email:'admin@example.dz',first_name:'مسؤول',last_name:'المنصة',profession:'IFEP',
  approved:accountStatus==='approved',is_admin:admin,account_status:accountStatus}};
 const formValues=new Map();
 const root={open:true,innerHTML:'',addEventListener(name,callback){events[name]=callback},
  querySelectorAll(){return [...formValues].map(([id,value])=>({dataset:{decisionReason:id},value}))}};
 const elements={'cloud-shell':{open:true},'cloud-content':root,'cloud-unread':{textContent:''}};
 const document={getElementById(id){return elements[id]||null},
  addEventListener(name,callback){events['document:'+name]=callback}};
 const session={access_token:'mock-token',refresh_token:'mock-refresh',user:{id:adminId},
  expires_at_ms:Date.now()+600000};
 const response=async(url,opts)=>{
  const parsedUrl=new URL(url);
  requests.push({url,method:opts.method,body:opts.body?JSON.parse(opts.body):null});
  let payload=[];
  if(parsedUrl.pathname.endsWith('/rpc/set_inspector_account_status')){
   const command=JSON.parse(opts.body);
   state.decisions.unshift({id:'record-1',inspector_id:command.p_user_id,decided_by:adminId,
     previous_status:state.person.account_status,new_status:command.p_new_status,reason:command.p_reason,
     decided_at:'2026-10-13T07:00:00Z'});
   state.person.account_status=command.p_new_status;
   state.person.approved=command.p_new_status==='approved';
  }else if(parsedUrl.pathname.endsWith('/inspector_profiles')){
   payload=parsedUrl.searchParams.has('id')?[state.profile]:[state.profile,state.person];
  }else if(parsedUrl.pathname.endsWith('/inspector_account_decisions')){
   payload=parsedUrl.searchParams.has('inspector_id')?[]:state.decisions;
  }
  return {ok:true,status:200,text:async()=>JSON.stringify(payload)};
 };
 const context={
  window:{REPORT03_CLOUD_CONFIG:{supabaseUrl:'https://test-project.supabase.co',
    publishableKey:'sb_publishable_mock_testing_public_only'}},
  document,fetch:response,
  sessionStorage:{getItem(){return JSON.stringify(session)},setItem(){},removeItem(){}},
  location:{hash:'',pathname:'/Official_report_template_03/',search:'',origin:'https://scientifica007.github.io'},
  history:{replaceState(){}},URL,URLSearchParams,Date,console,setInterval(){return 1},
  confirm(message){confirms.push(message);return confirmation}
 };
 vm.runInNewContext(source,context,{timeout:10000});
 return {events,requests,confirms,root,state,formValues,
  async init(){await events['document:DOMContentLoaded']()},
  async command(id,next){
   const button={dataset:{cloudAction:'set-status',userId:id,newStatus:next},disabled:false};
   await events.click({target:{closest(){return button}}});
  }};
}
test('M2.1.1: existing approved administrators remain approved on migration',()=>{
 assert.match(sql,/case when approved then 'approved' else 'pending' end/);
 assert.match(sql,/where account_status is null/);
 assert.match(sql,/approved = \(account_status = 'approved'\)/);
 assert.match(sql,/alter column account_status set default 'pending'/);
 assert.match(sql,/alter column account_status set not null/);
 assert.match(sql,/on delete restrict/);
 assert.doesNotMatch(sql,/delete from public\.inspector_profiles/i);
});
test('M2.1.1: four statuses are separate; approved bool alone cannot indicate rejection',async()=>{
 const h=harness();await h.init();
 for(const label of ['طلبات تنتظر البت','المفتشون المعتمدون','الطلبات المرفوضة','الحسابات المعلّقة'])
  assert.ok(h.root.innerHTML.includes(label));
 assert.match(h.root.innerHTML,/test-inspector@example\.dz/);
 assert.match(h.root.innerHTML,/data-new-status="approved"/);
 assert.match(h.root.innerHTML,/data-new-status="rejected"/);
 assert.match(h.root.innerHTML,/سجل قرارات الحسابات/);
});
test('M2.1.1: rejection is audited and not treated as a pending application',async()=>{
 const h=harness();await h.init();
 h.formValues.set(pendingId,'الحساب غير مرتبط بمفتش معتمد');
 await h.command(pendingId,'rejected');
 const call=h.requests.find(r=>r.url.endsWith('/rpc/set_inspector_account_status'));
 assert.ok(call);
 assert.equal(call.method,'POST');
 assert.equal(call.body.p_new_status,'rejected');
 assert.equal(call.body.p_user_id,pendingId);
 assert.equal(call.body.p_reason,'الحساب غير مرتبط بمفتش معتمد');
 assert.equal(h.state.person.approved,false);
 assert.equal(h.state.person.account_status,'rejected');
 assert.match(h.root.innerHTML,/الطلبات المرفوضة \(1\)/);
 assert.match(h.root.innerHTML,/اعتماد بعد الرفض/);
 assert.match(h.root.innerHTML,/الحساب غير مرتبط بمفتش معتمد/);
 assert.equal(h.confirms.length,1);
});
test('M2.1.1: suspension requires approved state and can later be reactivated',async()=>{
 const h=harness();h.state.person.account_status='approved';h.state.person.approved=true;
 await h.init();await h.command(pendingId,'suspended');
 assert.equal(h.state.person.account_status,'suspended');
 assert.equal(h.state.person.approved,false);
 await h.command(pendingId,'approved');
 assert.equal(h.state.person.account_status,'approved');
 assert.equal(h.state.person.approved,true);
 const transitions=h.requests.filter(r=>r.url.endsWith('/rpc/set_inspector_account_status')).map(r=>r.body.p_new_status);
 assert.deepEqual(transitions,['suspended','approved']);
});
test('M2.1.1: rejected applications can be approved without creating a new account',async()=>{
 const h=harness();h.state.person.account_status='rejected';await h.init();
 await h.command(pendingId,'approved');
 assert.equal(h.state.person.account_status,'approved');
 assert.equal(h.state.person.id,pendingId);
});
test('M2.1.1: account decisions respect confirmation and cannot change own/admin status',async()=>{
 const h=harness({confirmation:false});await h.init();await h.command(pendingId,'rejected');
 assert.equal(h.requests.filter(r=>r.url.endsWith('/rpc/set_inspector_account_status')).length,0);
 const x=harness();await x.init();await x.command(adminId,'suspended');
 assert.equal(x.requests.filter(r=>r.url.endsWith('/rpc/set_inspector_account_status')).length,0);
});
test('M2.1.1: blocked accounts cannot access directory and see their precise status',async()=>{
 for(const name of ['rejected','suspended','pending']){
  const h=harness({admin:false,accountStatus:name});await h.init();
  assert.match(h.root.innerHTML,new RegExp(name==='rejected'?'رُفض طلب':name==='suspended'?'معلّق':'اعتماد'));
  assert.doesNotMatch(h.root.innerHTML,/حفظ المؤسسة الحالية في السجل المشترك/);
 }
});
test('M2.1.1: procedure is admin-only, audited, verifies email, forbids self-action',()=>{
 for(const pattern of [
  /public\.is_admin_inspector\(\)/,/v_actor is null/,/p_user_id = v_actor/,
  /for update of p/,/v_confirmed is null/,/insert into public\.inspector_account_decisions/,
  /inspector_id,decided_by,previous_status,new_status,reason/,
  /account_status=p_new_status/,/approved=\(p_new_status='approved'\)/,
  /create policy account_decisions_visible/,/enable row level security/,
  /revoke all on public\.inspector_account_decisions from public,anon,authenticated/,
  /grant select on public\.inspector_account_decisions to authenticated/,
  /grant execute on function public\.set_inspector_account_status\(uuid,text,text\) to authenticated/
 ])assert.match(sql,pattern);
 assert.doesNotMatch(sql,/grant (insert|update|delete|all) on public\.inspector_account_decisions to authenticated/i);
 assert.doesNotMatch(sql,/grant update on public\.inspector_profiles to authenticated/i);
});
test('M2.1.1: previous cached approval clients remain routed through auditing',()=>{
 assert.match(sql,/create or replace function public\.approve_inspector/);
 assert.match(sql,/perform public\.set_inspector_account_status\(p_user_id,'approved',null\)/);
 assert.match(sql,/Legacy revocation is unsupported/);
});
test('M2.1.1: JavaScript is syntactically valid and sends no report content',()=>{
 execFileSync(process.execPath,['--check','cloud.js']);
 assert.match(source,/accountStatusLabel/);
 assert.match(source,/set_inspector_account_status/);
 assert.match(source,/data-decision-reason/);
 assert.doesNotMatch(source,/reportSnapshot\(\)/);
});
