/* M2.1 — Optional shared institution register, entirely separate from report content.
 * No remote requests unless a public Supabase project is explicitly configured.
 * Only institution/director metadata and account information cross the network.
 */
(function(){
'use strict';
const shell=document.getElementById('cloud-shell'),root=document.getElementById('cloud-content');
if(!shell||!root)return;
const cfg=window.REPORT03_CLOUD_CONFIG||{};
const base=String(cfg.supabaseUrl||'').replace(/\/+$/,'');
const key=String(cfg.publishableKey||'');
const configured=/^https:\/\//.test(base)&&base.length<300&&key.length>20&&!key.toLowerCase().includes('service_role')&&!key.startsWith('sb_secret_');
const SESSION_KEY='official_report03_cloud_session_v1';
let session=null,profile=null,shared=[],profiles=[],notifications=[],changes=[],accountDecisions=[],myDecisions=[],mode='login';
let selectedSharedId='',editingVersion=null,feedback='',busy=false,currentPage='dashboard';
let missions=[],missionMembers=[],missionNotifications=[],missionEnabled=false,missionError='';
let selectedMissionId='',missionDraft={institutionId:'',title:'',purpose:'',visitStart:'',visitEnd:''};
let institutionDraft={institution:{},director:{}};
const elt=val=>String(val==null?'':val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const text=val=>String(val==null?'':val).trim();
const verifiedUser=()=>profile&&profile.approved;
const title=role=>({IFEP:'مفتش التكوين والتعليم المهنيين',ITP:'مفتش تقني وبيداغوجي',IAF:'مفتش إداري ومالي'})[role]||role||'';
const now=()=>new Date().toISOString();
function status(message){feedback=String(message||'');const o=document.getElementById('cloud-message');if(o)o.textContent=feedback}
function storageSet(value){
 try{if(value)sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));else sessionStorage.removeItem(SESSION_KEY)}catch(e){status('تعذر تخزين جلسة تسجيل الدخول في هذا التبويب: '+e.message)}
}
function loadStoredSession(){
 try{const x=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
 if(x&&x.access_token&&x.refresh_token&&x.user&&x.user.id)session=x;
 }catch(e){session=null}
}
function validateEndpoint(){
 if(!configured)return false;
 try{const x=new URL(base);return x.protocol==='https:'&&!x.username&&!x.password&&x.pathname==='/'&&!!x.hostname}catch(e){return false}
}
async function raw(method,path,body,authRequired){
 if(!validateEndpoint())throw Error('الخدمة المركزية غير مهيأة بعد.');
 if(authRequired)await refreshSession();
 const headers={'apikey':key,'Accept':'application/json'};
 if(body!==undefined)headers['Content-Type']='application/json';
 if(authRequired){if(!session?.access_token)throw Error('سجّل الدخول أولًا');headers.Authorization='Bearer '+session.access_token}
 const result=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const responseText=await result.text();
 let data;try{data=responseText?JSON.parse(responseText):null}catch(e){data={message:responseText.slice(0,200)}}
 if(!result.ok){const message=data?.message||data?.msg||data?.error_description||data?.details||data?.error||'تعذر تنفيذ الطلب';
  const error=new Error(String(message));error.httpStatus=result.status;throw error}
 return data;
}
async function refreshSession(){
 if(!session)return;
 if(Date.now()<(session.expires_at_ms||0)-60000)return;
 const response=await raw('POST','/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token},false);
 if(!response?.access_token||!response?.refresh_token){session=null;storageSet(null);throw Error('انتهت الجلسة؛ يرجى تسجيل الدخول مجددًا')}
 rememberSession(response);
}
function rememberSession(data){
 session={access_token:data.access_token,refresh_token:data.refresh_token,
 user:data.user||session?.user,expires_at_ms:Date.now()+1000*(Number(data.expires_in)||3600)};
 storageSet(session);
}
async function restoreUrlCredentials(){
 const hash=new URLSearchParams(location.hash.replace(/^#/,'')),token=hash.get('access_token'),refresh=hash.get('refresh_token');
 if(token&&refresh){
  session={access_token:token,refresh_token:refresh,user:{id:''},expires_at_ms:Date.now()+3600000};
  const user=await raw('GET','/auth/v1/user',undefined,true);
  session.user={id:user.id,email:user.email};storageSet(session);
  history.replaceState(null,'',location.pathname+location.search);
  status('تم تأكيد البريد الإلكتروني. جارٍ التحقق من الاعتماد المهني.');
 }
}
function apiPath(table,params){
 const q=new URLSearchParams(params||{});
 return '/rest/v1/'+table+(q.toString()?'?'+q.toString():'');
}
async function get(table,params){return raw('GET',apiPath(table,params),undefined,true)}
async function submit(table,data,params,method){
 await refreshSession();
 if(!session?.access_token)throw Error('سجل الدخول أولًا');
 const path=apiPath(table,params);
 const headers={'apikey':key,'Authorization':'Bearer '+session.access_token,
  'Content-Type':'application/json','Accept':'application/json','Prefer':'return=representation'};
 const res=await fetch(base+path,{method:method||'POST',headers,body:JSON.stringify(data),cache:'no-store'});
 const rawText=await res.text();let result;try{result=rawText?JSON.parse(rawText):[]}catch(e){result=[]}
 if(!res.ok){const ex=new Error(String(result?.message||result?.details||'فشل الحفظ المشترك'));ex.httpStatus=res.status;throw ex}
 return result;
}
async function loadProfile(){
 const rows=await get('inspector_profiles',{select:'id,email,first_name,last_name,profession,district,approved,is_admin,account_status',id:'eq.'+session.user.id});
 profile=Array.isArray(rows)?rows[0]||null:null;
 if(!profile)throw Error('تعذر العثور على ملف المفتش. تحقق من تنفيذ مخطط قاعدة البيانات.');
 myDecisions=await get('inspector_account_decisions',{select:'previous_status,new_status,reason,decided_at',inspector_id:'eq.'+session.user.id,order:'decided_at.desc',limit:'1'});
}
async function loadShared(){
 if(!verifiedUser()){shared=[];notifications=[];changes=[];profiles=[];accountDecisions=[];return}
 const [institutions,people,pings,decisionRows]=await Promise.all([
  get('shared_institutions',{select:'id,name,wilaya,code,institution_data,director_data,version,updated_at,updated_by',order:'name.asc',limit:'500'}),
  get('inspector_profiles',{select:'id,email,first_name,last_name,profession,district,approved,is_admin,account_status',order:'first_name.asc'}),
  get('institution_notifications',{select:'id,change_id,read_at,created_at',recipient_id:'eq.'+session.user.id,order:'created_at.desc',limit:'40'}),
 profile.is_admin?get('inspector_account_decisions',{select:'id,inspector_id,decided_by,previous_status,new_status,reason,decided_at',order:'decided_at.desc',limit:'60'}):Promise.resolve([])
 ]);
 shared=institutions||[];profiles=people||[];notifications=pings||[];accountDecisions=decisionRows||[];
 const ids=notifications.map(x=>x.change_id).filter(Boolean);
 changes=ids.length?await get('institution_changes',{select:'id,institution_id,actor_id,action,changes,created_at',id:'in.('+ids.join(',')+')'}):[];
}
async function loadMissions(){
 if(!verifiedUser()){
  missions=[];missionMembers=[];missionNotifications=[];missionEnabled=false;missionError='';return;
 }
 try{
  const [m,mm,n]=await Promise.all([
   get('inspection_missions',{select:'id,title,purpose,institution_id,institution_snapshot,visit_start,visit_end,status,created_at,created_by',order:'created_at.desc',limit:'100'}),
   get('inspection_mission_members',{select:'mission_id,inspector_id,invited_by,membership_status,created_at,responded_at',order:'created_at.desc',limit:'500'}),
   get('inspection_mission_notifications',{select:'id,mission_id,recipient_id,actor_id,event_type,description,read_at,created_at',
    recipient_id:'eq.'+session.user.id,order:'created_at.desc',limit:'100'})
  ]);
  missions=Array.isArray(m)?m:[];missionMembers=Array.isArray(mm)?mm:[];
  missionNotifications=Array.isArray(n)?n:[];missionEnabled=true;missionError='';
 }catch(err){
  missions=[];missionMembers=[];missionNotifications=[];missionEnabled=false;
  missionError=err.httpStatus===404||err.httpStatus===400
   ?'لم تُفعّل جداول المهام المشتركة في Supabase بعد. يحتاج مسؤول المنصة إلى تشغيل الترحيل 003.'
   :'تعذّر تحميل بيانات المهام: '+err.message;
 }
 if(selectedMissionId&&!missions.some(m=>m.id===selectedMissionId))selectedMissionId='';
}
async function fetchAll(){
 if(!session)return;
 await loadProfile();
 await loadShared();
 await loadMissions();
 render();
}
function fieldName(key){
 const lookup={
  name:'التسمية',wilaya:'الولاية',code:'رمز المؤسسة',decree:'مرسوم الإنشاء',
  decreeDate:'تاريخ المرسوم',startDate:'بداية النشاط',address:'العنوان',
  phone:'الهاتف',fax:'الفاكس',email:'البريد الإلكتروني',website:'الموقع الإلكتروني',
  speciality:'اختصاص المؤسسة',distance:'البعد عن الولاية',mapUrl:'الموقع الجغرافي',
  fullName:'اسم رئيس المؤسسة',job:'وظيفة رئيس المؤسسة',rank:'الرتبة',
  installedAt:'تاريخ التنصيب',firstAppointedAt:'تاريخ أول تعيين'
 };
 return lookup[key.replace(/^(institution|director)\./,'')]||key;
}
function changeCell(value){
 if(value==null)return 'غير مدخل';
 const label=typeof value==='object'?JSON.stringify(value):String(value);
 return elt(label.slice(0,400));
}
function noticeCard(entry){
 const change=changes.find(c=>c.id===entry.change_id);if(!change)return '';
 const institution=shared.find(i=>i.id===change.institution_id);
 const author=profiles.find(p=>p.id===change.actor_id);
 const who=author?text(author.first_name+' '+author.last_name):'مفتش مسجّل';
 const fieldRows=Object.entries(change.changes||{}).slice(0,40).map(([name,v])=>
  '<tr><th>'+elt(fieldName(name))+'</th><td>'+changeCell(v?.old)+'</td><td>'+changeCell(v?.new)+'</td></tr>').join('');
 return '<article class="cloud-notice '+(entry.read_at?'is-read':'')+'"><p><strong>'+elt(institution?.name||'مؤسسة')+
 '</strong> — '+(change.action==='created'?'إضافة مؤسسة':'تعديل بيانات')+'</p><p>بواسطة '+elt(who)+
 ' — '+elt(new Date(change.created_at).toLocaleString('ar-DZ'))+'</p>'+
 (change.action==='updated'?'<table><thead><tr><th>الحقل</th><th>القيمة السابقة</th><th>القيمة الجديدة</th></tr></thead><tbody>'+fieldRows+'</tbody></table>':'')+
 (entry.read_at?'':'<button type="button" class="add-button" data-cloud-action="read" data-notification-id="'+elt(entry.id)+'">تعليم كمقروء</button>')+'</article>';
}

const ACCOUNT_STATUS_TEXT=Object.freeze({
 pending:'قيد الانتظار',approved:'معتمد',rejected:'مرفوض',suspended:'معلّق'
});
const ACCOUNT_TRANSITIONS=Object.freeze({
 pending:[['approved','اعتماد'],['rejected','رفض']],
 approved:[['suspended','تعليق']],
 rejected:[['approved','اعتماد بعد الرفض']],
 suspended:[['approved','إعادة تفعيل']]
});
function accountStatusLabel(status){return ACCOUNT_STATUS_TEXT[status]||'حالة غير معروفة'}
function accountActionCard(p){
 const status=p.account_status||'pending';
 const actions=p.id!==session.user.id&&!p.is_admin?(ACCOUNT_TRANSITIONS[status]||[]):[];
 const inputs=actions.length?'<label class="cloud-reason-label">سبب القرار (اختياري؛ حد أقصى 1000 حرف)'+
 '<input type="text" maxlength="1000" data-decision-reason="'+elt(p.id)+'" placeholder="يمكن تركه فارغًا"></label>':'';
 const buttons=actions.map(([next,label])=>
 '<button type="button" class="add-button" data-cloud-action="set-status" data-user-id="'+elt(p.id)+
 '" data-new-status="'+elt(next)+'">'+elt(label)+'</button>').join('');
 return '<div class="cloud-account-row"><div><strong>'+elt(text(p.first_name+' '+p.last_name)||'مفتش')+
 '</strong><p>'+elt(p.email)+' — '+elt(title(p.profession))+' — '+elt(accountStatusLabel(status))+
 (p.is_admin?' — مسؤول المنصة':'')+'</p></div>'+inputs+
 '<div class="cloud-account-actions">'+(buttons||'<span class="cloud-tip">للاطلاع فقط</span>')+'</div></div>';
}
function renderAccountAudit(){
 if(!accountDecisions.length)return '<p>لم تُسجّل قرارات بعد تنفيذ تحديث M2.1.1.</p>';
 const rows=accountDecisions.map(d=>{
  const target=profiles.find(p=>p.id===d.inspector_id),actor=profiles.find(p=>p.id===d.decided_by);
  const name=p=>p?text(p.first_name+' '+p.last_name)||p.email:'حساب غير ظاهر';
  return '<tr><td>'+elt(name(target))+'</td><td>'+
   elt(accountStatusLabel(d.previous_status))+' ← '+elt(accountStatusLabel(d.new_status))+
   '</td><td>'+elt(name(actor))+'</td><td>'+elt(new Date(d.decided_at).toLocaleString('ar-DZ'))+
   '</td><td>'+elt(d.reason||'—')+'</td></tr>';
 }).join('');
 return '<div class="cloud-table-scroller"><table class="cloud-audit-table"><thead><tr><th>المفتش</th><th>القرار</th><th>صاحب القرار</th><th>التاريخ</th><th>السبب</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderAccountsManagement(){
 const groups=[
  ['pending','طلبات تنتظر البت'],
  ['approved','المفتشون المعتمدون'],
  ['rejected','الطلبات المرفوضة'],
  ['suspended','الحسابات المعلّقة']
 ];
 let html='<section class="cloud-approvals"><h4>إدارة حسابات المفتشين</h4>'+
  '<p>يمكن للمسؤول اعتماد الطلب أو رفضه أو تعليق حساب معتمد أو إعادة تفعيله. جميع القرارات موثقة، ولا يمكن تعديل الحساب الشخصي من هنا.</p>';
 for(const [status,label] of groups){
  const people=profiles.filter(p=>(p.account_status||'pending')===status);
  html+='<details class="cloud-account-group" '+(status==='pending'?'open':'')+'><summary>'+elt(label)+' ('+people.length+')</summary>'+
   (people.length?people.map(accountActionCard).join(''):'<p>لا توجد حسابات في هذه الحالة.</p>')+'</details>';
 }
 html+='<details class="cloud-audit"><summary>سجل قرارات الحسابات ('+accountDecisions.length+' معروض)</summary>'+
 renderAccountAudit()+'</details></section>';
 return html;
}

function unauthenticatedView(){
 return '<div class="cloud-header"><h3>الحساب المهني</h3><p>يُقبل حساب المفتش بعد التحقق من البريد الإلكتروني واعتماده من مسؤول المنصة.</p></div>'+
 '<div class="cloud-modes"><button type="button" data-cloud-action="mode-login" '+(mode==='login'?'aria-current="true"':'')+'>دخول</button>'+
 '<button type="button" data-cloud-action="mode-signup" '+(mode==='signup'?'aria-current="true"':'')+'>إنشاء حساب</button></div>'+
 '<form id="cloud-auth-form"><label>البريد الإلكتروني<input name="email" type="email" autocomplete="email" required></label>'+
 '<label>كلمة المرور<input name="password" type="password" minlength="8" autocomplete="'+(mode==='login'?'current-password':'new-password')+'" required></label>'+
 (mode==='signup'?'<div class="cloud-two"><label>الاسم<input name="first_name" maxlength="120" required></label>'+
 '<label>اللقب<input name="last_name" maxlength="120" required></label></div>'+
 '<div class="cloud-two"><label>الصفة المهنية<select name="profession"><option value="IFEP">مفتش التكوين والتعليم المهنيين</option>'+
 '<option value="ITP">مفتش تقني وبيداغوجي</option><option value="IAF">مفتش إداري ومالي</option></select></label>'+
 '<label>المقاطعة<input name="district" maxlength="120"></label></div>':'')+
 '<button type="submit" class="btn primary">'+(mode==='login'?'تسجيل الدخول':'تسجيل الحساب')+'</button></form>';
}

const INSTITUTION_EDITOR_FIELDS=[
 ['institution','name','اسم المؤسسة'],['institution','code','رمز المؤسسة'],
 ['institution','wilaya','الولاية'],['institution','address','العنوان'],
 ['institution','phone','الهاتف'],['institution','fax','الفاكس'],
 ['institution','email','البريد الإلكتروني'],['institution','website','الموقع الإلكتروني'],
 ['institution','decree','مرسوم الإنشاء'],['institution','decreeDate','تاريخ المرسوم'],
 ['institution','startDate','تاريخ بداية النشاط'],['institution','speciality','اختصاص المؤسسة'],
 ['institution','distance','البعد عن مقر الولاية'],['institution','mapUrl','الموقع الجغرافي (رابط خرائط Google)'],
 ['director','fullName','اسم ولقب رئيس المؤسسة'],['director','job','الوظيفة'],
 ['director','rank','الرتبة'],['director','installedAt','تاريخ التنصيب'],
 ['director','firstAppointedAt','تاريخ أول تعيين']
];
function useSharedInstitution(id){
 const record=shared.find(x=>x.id===id);
 selectedSharedId=record?.id||'';
 editingVersion=record?.version??null;
 institutionDraft={
  institution:record?{...record.institution_data}: {},
  director:record?{...record.director_data}:{}
 };
}
const NAV_ITEMS=[
 ['dashboard','لوحة القيادة','▦'],
 ['institutions','المؤسسات','▤'],
 ['colleagues','المفتشون الزملاء','♙'],
 ['missions','مهام التفتيش','◷'],
 ['calendar','الرزنامة','▦'],
 ['teams','فرق التفتيش','♧'],
 ['messages','المراسلات','✉'],
 ['notifications','الإشعارات','♧'],
 ['report','محرر التقرير 03','✎'],
 ['account','حسابي','◉']
];
function portalNavigation(){
 const visible=[...NAV_ITEMS,...(profile?.is_admin?[['admin','إدارة الحسابات','⚙']]:[])];
 return '<nav class="portal-navigation" aria-label="أقسام المنصة">'+visible.map(([id,name,ico])=>
 '<button type="button" class="portal-nav-btn'+(currentPage===id?' selected':'')+
 '" data-cloud-action="nav" data-page="'+id+'" aria-current="'+(currentPage===id?'page':'false')+'">'+
 '<span aria-hidden="true">'+ico+'</span><span>'+name+'</span>'+
 (id==='notifications'&&(notifications.some(x=>!x.read_at)||missionNotifications.some(x=>!x.read_at))?
 '<b>'+(notifications.filter(x=>!x.read_at).length+missionNotifications.filter(x=>!x.read_at).length)+'</b>':
 id==='missions'&&missionMembers.some(x=>x.inspector_id===session.user.id&&x.membership_status==='invited')?
 '<b>'+missionMembers.filter(x=>x.inspector_id===session.user.id&&x.membership_status==='invited').length+'</b>':'')+'</button>').join('')+'</nav>';
}
function dashboardCard(label,value,description,target){
 return '<button type="button" class="portal-metric" data-cloud-action="nav" data-page="'+target+'">'+
 '<strong>'+elt(value)+'</strong><span>'+elt(label)+'</span><small>'+elt(description)+'</small></button>';
}
function dashboardView(){
 const colleagues=profiles.filter(p=>p.approved).length;
 const unread=notifications.filter(x=>!x.read_at).length+missionNotifications.filter(x=>!x.read_at).length;
 return '<div class="portal-page-heading"><h2>لوحة القيادة</h2><p>مرحبًا '+elt(profile.first_name)+
 '، هذه البيانات المتاحة حاليًا في السجل المركزي.</p></div>'+
 '<div class="portal-metrics">'+dashboardCard('المؤسسات المشتركة',shared.length,'عرض المؤسسات وتحرير بياناتها','institutions')+
 dashboardCard('المفتشون المعتمدون',colleagues,'الزملاء المسجلون في المنصة','colleagues')+
 dashboardCard('إشعارات غير مقروءة',unread,'تحديثات المؤسسات','notifications')+
 dashboardCard('إعداد التقرير','النموذج 03','إصدار PDF أو DOCX أو JSON','report')+'</div>'+
 '<div class="portal-widgets"><section class="portal-widget"><h3>آخر المؤسسات المسجلة</h3>'+
 (shared.length?'<ul>'+shared.slice(0,6).map(x=>'<li><button data-cloud-action="open-institution" data-institution-id="'+elt(x.id)+'">'+elt(x.name)+' — '+elt(x.wilaya)+'</button></li>').join('')+'</ul>':'<p>لم تُسجل أي مؤسسة مشتركة بعد. يمكنك إضافة أول مؤسسة في قسم «المؤسسات».</p>')+
 '</section><section class="portal-widget"><h3>مهام التفتيش المشتركة</h3>'+
 (missionEnabled?'<p>مهام تشارك فيها: '+missions.length+' — دعوات تنتظر ردك: '+
 missionMembers.filter(x=>x.inspector_id===session.user.id&&x.membership_status==='invited').length+'</p>':
 '<p>خدمة المهام المشتركة لم تُفعّل بعد.</p>')+
 '<button class="btn subtle" data-cloud-action="nav" data-page="missions">فتح مهام التفتيش</button></section></div>';
}
function institutionEditor(){
 const options=shared.map(x=>'<option value="'+elt(x.id)+'" '+(selectedSharedId===x.id?'selected':'')+'>'+
 elt(x.name+' — '+x.wilaya+(x.code?' ('+x.code+')':''))+'</option>').join('');
 const fields=INSTITUTION_EDITOR_FIELDS.map(([group,key,label])=>
 '<label class="portal-field">'+elt(label)+'<input type="'+(key==='email'?'email':'text')+
 '" data-cloud-field-group="'+group+'" data-cloud-field-key="'+key+'" value="'+elt(institutionDraft[group]?.[key]||'')+
 '" maxlength="'+(key==='name'?'300':'500')+'"></label>').join('');
 return '<div class="portal-page-heading"><h2>المؤسسات المشتركة</h2>'+
 '<p>يمكن لجميع المفتشين المعتمدين إضافة المؤسسات وتعديلها. يُسجل اسم معدّل البيانات وتفاصيل التغيير في السجل المركزي.</p></div>'+
 '<section class="portal-widget"><label class="portal-field">اختيار مؤسسة'+
 '<select id="cloud-select"><option value="">+ مؤسسة جديدة</option>'+options+'</select></label>'+
 '<div class="portal-actions"><button class="btn subtle" data-cloud-action="new-institution">مؤسسة جديدة</button>'+
 '<button class="btn subtle" data-cloud-action="refresh">تحديث البيانات</button></div></section>'+
 '<section class="portal-widget"><h3>'+(selectedSharedId?'تعديل بيانات المؤسسة ورئيسها':'إضافة مؤسسة جديدة')+'</h3>'+
 '<div class="portal-form-grid">'+fields+'</div>'+
 '<div class="portal-actions"><button class="btn primary" data-cloud-action="save">'+
 (selectedSharedId?'حفظ تعديلات المؤسسة':'إضافة المؤسسة إلى السجل المركزي')+'</button>'+
 (selectedSharedId?'<button class="btn subtle" data-cloud-action="load">فتح المؤسسة داخل محرر التقرير</button>':'')+
 '</div><p class="cloud-tip">لا يؤدي حفظ المؤسسة إلى حفظ أي مهمة تفتيش أو معاينات أو توصيات.</p></section>';
}
function colleaguesView(){
 const colleagues=profiles.filter(p=>p.approved);
 return '<div class="portal-page-heading"><h2>المفتشون الزملاء</h2><p>دليل مهني للمفتشين المعتمدين فقط.</p></div>'+
 '<div class="portal-directory">'+(colleagues.length?colleagues.map(p=>
 '<article class="portal-widget"><h3>'+elt(text(p.first_name+' '+p.last_name))+'</h3><p>'+
 elt(title(p.profession))+'</p><p>'+elt(p.email)+'</p>'+
 '<small>'+(p.id===session.user.id?'حسابي':'المراسلة المباشرة ستضاف في مرحلة لاحقة')+'</small></article>').join(''):'<p>لا يوجد زملاء معتمدون حاليًا.</p>')+'</div>';
}
function accountView(){
 return '<div class="portal-page-heading"><h2>حسابي</h2><p>بيانات الحساب المهني وحالته.</p></div>'+
 '<section class="portal-widget portal-profile">'+
 '<dl><dt>الاسم</dt><dd>'+elt(profile.first_name)+'</dd><dt>اللقب</dt><dd>'+elt(profile.last_name)+
 '</dd><dt>البريد الإلكتروني</dt><dd>'+elt(profile.email)+'</dd><dt>الصفة المهنية</dt><dd>'+elt(title(profile.profession))+
 '</dd><dt>المقاطعة</dt><dd>'+elt(profile.district||'غير محددة')+'</dd><dt>حالة الحساب</dt><dd>'+
 elt(accountStatusLabel(profile.account_status||'pending'))+'</dd><dt>إدارة المنصة</dt><dd>'+
 (profile.is_admin?'مسؤول الحسابات':'مفتش معتمد')+'</dd></dl>'+
 '<p class="cloud-tip">تعديل بيانات الملف المهني وكلمة المرور سيضاف في إصدار مستقل بعد تحديد قواعد تحديث الهوية والصفة.</p>'+
 '<div class="portal-actions"><button class="btn subtle" data-cloud-action="logout">تسجيل الخروج</button></div></section>';
}

function missionMemberName(id){
 const peer=profiles.find(p=>p.id===id);
 return peer?text(peer.first_name+' '+peer.last_name):'مفتش معتمد';
}
function missionStatusName(status){
 return {invited:'بانتظار الموافقة',accepted:'مشارك',declined:'اعتذر عن المشاركة'}[status]||status;
}
function missionsView(){
 const invited=missionMembers.filter(m=>m.inspector_id===session.user.id&&m.membership_status==='invited');
 const accepted=missions;
 const mission=accepted.find(m=>m.id===selectedMissionId);
 const availablePeers=profiles.filter(p=>p.approved===true&&p.account_status==='approved'&&
    p.id!==session.user.id&&(!mission||!missionMembers.some(m=>m.mission_id===mission.id&&m.inspector_id===p.id)));
 return '<div class="portal-page-heading"><h2>مهام التفتيش المشتركة</h2>'+
 '<p>يمكن للمفتشين المعتمدين إنشاء مهمة ودعوة زملائهم. لا يبدأ التحرير المشترك للمعاينات والتوصيات إلا في المرحلة M3.2.</p></div>'+
 (!missionEnabled?'<section class="portal-widget"><h3>الخدمة غير مفعّلة</h3><p>'+elt(missionError||'يجب تشغيل ترحيل SQL رقم 003 في Supabase.')+'</p>'+
 '<p>يمكنك الاستمرار في إعداد التقرير الفردي دون أي تغيير.</p></section>':
 '<div class="portal-widgets"><section class="portal-widget"><h3>إنشاء مهمة جديدة</h3>'+
 '<p class="helper">تُحفظ بيانات المهمة وأسماء المشاركين في Supabase. لا تُنقل إليها معاينات تقريرك المحلي.</p>'+
 '<div class="portal-fields">'+
 '<label class="portal-field">المؤسسة<select data-mission-field="institutionId"><option value="">— اختر مؤسسة مشتركة —</option>'+
 shared.map(i=>'<option value="'+elt(i.id)+'" '+(missionDraft.institutionId===i.id?'selected':'')+'>'+elt(i.name+' ('+i.code+')')+'</option>').join('')+
 '</select></label>'+
 '<label class="portal-field">عنوان المهمة<input data-mission-field="title" maxlength="200" value="'+elt(missionDraft.title)+'" placeholder="مثال: التفتيش المعمق لمؤسسة..."></label>'+
 '<label class="portal-field">الهدف<textarea data-mission-field="purpose" maxlength="3000" rows="3">'+elt(missionDraft.purpose)+'</textarea></label>'+
 '<label class="portal-field">تاريخ البداية<input type="date" data-mission-field="visitStart" value="'+elt(missionDraft.visitStart)+'"></label>'+
 '<label class="portal-field">تاريخ النهاية<input type="date" data-mission-field="visitEnd" value="'+elt(missionDraft.visitEnd)+'"></label></div>'+
 '<button type="button" class="btn primary" data-cloud-action="mission-create">إنشاء مهمة مشتركة</button></section>'+
 '<section class="portal-widget"><h3>الدعوات الواردة ('+invited.length+')</h3>'+
 (invited.length?invited.map(member=>{
  const event=missionNotifications.find(n=>n.mission_id===member.mission_id&&n.event_type==='invited');
  return '<article class="mission-invite"><strong>'+elt(event?.description||'دعوة إلى مهمة تفتيش')+'</strong>'+
   '<p>وصلتك دعوة من '+elt(missionMemberName(member.invited_by))+'</p>'+
   '<div class="portal-actions"><button class="btn primary" data-cloud-action="mission-respond" data-mission-id="'+elt(member.mission_id)+'" data-accept="true">قبول المشاركة</button>'+
   '<button class="btn subtle" data-cloud-action="mission-respond" data-mission-id="'+elt(member.mission_id)+'" data-accept="false">رفض الدعوة</button></div></article>';
 }).join(''):'<p>لا توجد دعوات تنتظر ردك.</p>')+'</section></div>'+
 '<section class="portal-widget"><h3>المهام التي تشارك فيها ('+accepted.length+')</h3>'+
 '<button type="button" class="btn subtle" data-cloud-action="mission-refresh">تحديث المهام والدعوات</button>'+
 (accepted.length?'<label class="portal-field">اختر مهمة<select id="mission-select"><option value="">— اختر مهمة —</option>'+
 accepted.map(m=>'<option value="'+elt(m.id)+'" '+(selectedMissionId===m.id?'selected':'')+'>'+elt(m.title+' — '+(m.institution_snapshot?.name||''))+'</option>').join('')+
 '</select></label>':'<p>لم تشارك في أي مهمة بعد.</p>')+
 (mission?'<div class="mission-detail"><h3>'+elt(mission.title)+'</h3><p>'+elt(mission.institution_snapshot?.name||'')+'</p>'+
 '<p>'+elt(mission.purpose||'لم يحدد الهدف')+'</p>'+
 '<p>الفترة: '+elt(mission.visit_start||'غير محددة')+' — '+elt(mission.visit_end||'غير محددة')+'</p>'+
 '<h4>أعضاء المهمة</h4><ul>'+missionMembers.filter(m=>m.mission_id===mission.id).map(m=>
  '<li>'+elt(missionMemberName(m.inspector_id))+' — '+elt(missionStatusName(m.membership_status))+'</li>').join('')+'</ul>'+
 '<label class="portal-field">دعوة مفتش معتمد آخر<select id="mission-peer"><option value="">— اختر الزميل —</option>'+
 availablePeers.map(p=>'<option value="'+elt(p.id)+'">'+elt(text(p.first_name+' '+p.last_name)+' — '+title(p.profession))+'</option>').join('')+'</select></label>'+
 '<button type="button" class="btn subtle" data-cloud-action="mission-invite" '+(!availablePeers.length?'disabled':'')+
 '>إرسال الدعوة</button>'+
 '<p class="cloud-tip">عضوية المهمة متساوية بين المفتشين. المساهمات المشتركة والاقتراحات ستُفعّل بعد اختبار الدعوات والصلاحيات.</p></div>':'')+
 '</section>');
}
async function createMission(){
 if(!verifiedUser()||!missionEnabled)throw Error('خدمة المهام المشتركة غير جاهزة.');
 const d=missionDraft;
 if(!shared.some(x=>x.id===d.institutionId))throw Error('اختر مؤسسة موجودة في السجل المركزي.');
 if(text(d.title).length<3||text(d.title).length>200)throw Error('عنوان المهمة يجب أن يتكون من 3 إلى 200 حرف.');
 if(text(d.purpose).length>3000)throw Error('الهدف يتجاوز 3000 حرف.');
 if(d.visitStart&&d.visitEnd&&d.visitEnd<d.visitStart)throw Error('تاريخ النهاية يسبق تاريخ البداية.');
 const id=await raw('POST','/rest/v1/rpc/create_inspection_mission',{
  p_institution_id:d.institutionId,p_title:text(d.title),p_purpose:text(d.purpose),
  p_visit_start:d.visitStart||null,p_visit_end:d.visitEnd||null
 },true);
 if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('لم تُعد قاعدة البيانات معرّف مهمة صالحًا.');
 missionDraft={institutionId:'',title:'',purpose:'',visitStart:'',visitEnd:''};
 await loadMissions();
 selectedMissionId=id;
 feedback='أُنشئت المهمة. يمكنك الآن دعوة المفتشين المعتمدين.';
}
async function inviteMissionPeer(){
 if(!missionEnabled||!verifiedUser())throw Error('الحساب غير معتمد أو الخدمة غير مفعلة.');
 const m=missions.find(x=>x.id===selectedMissionId);
 if(!m||m.status!=='draft')throw Error('اختر مهمة مفتوحة تشارك فيها.');
 const id=text(document.getElementById('mission-peer')?.value);
 if(!profiles.some(x=>x.id===id&&x.approved===true&&x.account_status==='approved'&&x.id!==session.user.id))
  throw Error('اختر زميلًا معتمدًا من الدليل.');
 if(missionMembers.some(x=>x.mission_id===m.id&&x.inspector_id===id))
  throw Error('هذا المفتش مدعو أو مشارك سابقًا.');
 await raw('POST','/rest/v1/rpc/invite_inspection_member',{p_mission_id:m.id,p_inspector_id:id},true);
 await loadMissions();
 feedback='أُرسلت الدعوة إلى حساب الزميل؛ يتعين عليه قبولها قبل مشاهدة المهمة.';
}
async function respondMissionInvite(id,accept){
 if(!missionEnabled||!verifiedUser())throw Error('خدمة الدعوات غير متاحة.');
 if(!missionMembers.some(x=>x.mission_id===id&&x.inspector_id===session.user.id&&x.membership_status==='invited'))
  throw Error('لا توجد دعوة معلقة لهذا الحساب.');
 await raw('POST','/rest/v1/rpc/respond_inspection_invitation',{p_mission_id:id,p_accept:accept},true);
 await loadMissions();
 if(accept)selectedMissionId=id;
 feedback=accept?'قُبلت الدعوة وأصبحت عضوًا في المهمة.':'رُفضت الدعوة.';
}
async function readMissionNotification(id){
 const n=missionNotifications.find(x=>x.id===id);
 if(!n||n.recipient_id!==session.user.id)throw Error('الإشعار غير موجود.');
 await submit('inspection_mission_notifications',{read_at:now()},
  {id:'eq.'+id,recipient_id:'eq.'+session.user.id,select:'id'},'PATCH');
 await loadMissions();
 feedback='تم تعليم إشعار المهمة كمقروء.';
}

function reservedView(page){
 const content={
 missions:['مهام التفتيش','سنضيف إنشاء المهام وربطها بالمؤسسات والمفتشين، وتحديد حالتها وتواريخها في مرحلة مستقلة.'],
 calendar:['الرزنامة الزمنية','ستعرض تواريخ المهام التي تُنشأ لاحقًا، دون إنشاء مواعيد افتراضية أو ادعاء وجود مهام محفوظة.'],
 teams:['فرق التفتيش','ستدعم مشاركة مفتشين متساوين في المهمة، مع توزيع المجالات والاقتراحات المتبادلة واعتمادها.'],
 messages:['المراسلات','تستلزم المراسلة والدردشة جداول رسائل وصلاحيات خاصة، ولم تفعّل بعد.']
 };
 const [name,explanation]=content[page]||['قيد التطوير','هذه الوظيفة غير متاحة بعد.'];
 return '<div class="portal-page-heading"><h2>'+name+'</h2></div><section class="portal-widget"><h3>قيد التطوير</h3><p>'+explanation+
 '</p><p>لم تُنشأ أي بيانات تجريبية باسم مفتش أو مهمة.</p></section>';
}
function notificationsView(){
 const unread=notifications.filter(x=>!x.read_at).length+missionNotifications.filter(x=>!x.read_at).length;
 return '<div class="portal-page-heading"><h2>الإشعارات</h2><p>'+unread+' غير مقروء</p></div>'+
 '<section class="portal-widget"><button class="btn subtle" data-cloud-action="refresh">تحديث الإشعارات</button>'+
 (notifications.length?notifications.slice(0,25).map(noticeCard).join(''):'<p>لا توجد إشعارات مؤسسات حاليًا.</p>')+
 '<h3>إشعارات المهام المشتركة</h3>'+
 (missionNotifications.length?missionNotifications.slice(0,40).map(n=>
 '<article class="portal-notice"><strong>'+elt(n.description)+'</strong><small>'+elt(n.created_at?.slice(0,10)||'')+'</small>'+
 (!n.read_at?'<button type="button" class="btn subtle" data-cloud-action="mission-read" data-notification-id="'+elt(n.id)+'">تعليم كمقروء</button>':'')+'</article>').join(''):
 '<p>لا توجد إشعارات مهام.</p>')+'</section>';
}
function guardedView(){
 const label=accountStatusLabel(profile?.account_status||'pending'),status=profile?.account_status||'pending';
 const msg=status==='rejected'?'تم رفض طلب التسجيل؛ لا يمكنك استعمال المنصة.':
  status==='suspended'?'تم تعليق هذا الحساب؛ لم يعد الوصول إلى المنصة مسموحًا.':
  'حسابك مسجل، ولكنه ينتظر اعتماد المسؤول قبل استخدام المنصة.';
 const reason=myDecisions?.[0]?.reason;
 return '<div class="portal-access-card"><div class="portal-page-heading"><h2>حالة الحساب: '+label+'</h2><p>'+
 elt(text(profile?.first_name+' '+profile?.last_name))+' — '+elt(profile?.email||'')+'</p></div>'+
 '<p class="cloud-warning">'+msg+'</p>'+(reason?'<p>سبب آخر قرار: '+elt(reason)+'</p>':'')+
 '<div class="portal-actions"><button class="btn subtle" data-cloud-action="refresh">التحقق من الحالة</button>'+
 '<button class="btn subtle" data-cloud-action="logout">تسجيل الخروج</button></div></div>';
}
function portalView(){
 const content=currentPage==='dashboard'?dashboardView():
  currentPage==='institutions'?institutionEditor():
  currentPage==='colleagues'?colleaguesView():
  currentPage==='missions'?missionsView():
  currentPage==='notifications'?notificationsView():
  currentPage==='account'?accountView():
  currentPage==='admin'&&profile.is_admin?renderAccountsManagement():
  reservedView(currentPage);
 return '<header class="portal-topbar"><div><strong>منصة التفتيش المعمق</strong>'+
 '<small>النموذج 03 — فضاء المفتشين المعتمدين</small></div>'+
 '<div class="session-controls portal-session-controls"><span class="session-name">'+elt(text(profile.first_name+' '+profile.last_name))+
 '</span><button type="button" class="btn session-logout" data-cloud-action="logout" aria-label="تسجيل الخروج من حساب المفتش">تسجيل الخروج</button></div>'+
 '</header><div class="portal-body">'+portalNavigation()+
 '<main class="portal-main" id="portal-main" tabindex="-1">'+content+
 '<p id="cloud-message" class="cloud-message" role="status" aria-live="polite">'+elt(feedback)+'</p></main></div>';
}
function render(){
 const app=document.getElementById('app');
 const approved=Boolean(session?.access_token&&verifiedUser());
 const report=approved&&currentPage==='report';
 if(app)app.hidden=!report;
 shell.hidden=report;
 // The report editor renders independently from the async Supabase login.
 // Refresh just its shared select options after sign-in/refresh/navigation,
 // never the entire report (which may contain unsaved field edits).
 // Only an approved Supabase profile may prefill the report's lead inspector.
 // The report editor guards imported and manually edited collaborator lists.
 if(approved)window.Report03CloudBridge?.prefillAccountInspector?.({
  first_name:profile.first_name,last_name:profile.last_name,
  profession:profile.profession,district:profile.district
 });
 if(report){window.Report03CloudBridge?.syncSharedInstitutionOptions?.();window.Report03CloudBridge?.syncReportColleagueOptions?.();}
 const reportUser=document.getElementById('report-user-name');
 const reportControls=document.getElementById('report-session-controls');
 if(reportControls)reportControls.hidden=!report;
 if(reportUser)reportUser.textContent=report?text(profile.first_name+' '+profile.last_name):'';
 const unreadEl=document.getElementById('cloud-unread');
 if(unreadEl)unreadEl.textContent=approved?String(notifications.filter(x=>!x.read_at).length+missionNotifications.filter(x=>!x.read_at).length):'';
 if(!configured){
  root.innerHTML='<div class="portal-access-card"><h2>تهيئة المنصة مطلوبة</h2><p>لا يمكن استعمال محرر التقارير دون حساب معتمد واتصال مصادقة. اتصل بمسؤول المنصة لإتمام إعداد الخدمة.</p></div>';
  return;
 }
 if(!session?.access_token){
  root.innerHTML='<div class="portal-auth-wrapper"><header><span class="portal-logo">03</span><h1>منصة التفتيش المعمق</h1><p>سجّل الدخول بحساب مفتش معتمد أو أرسل طلب تسجيل جديد.</p></header>'+
  '<div class="portal-auth-card">'+unauthenticatedView()+
  '<div id="cloud-message" class="cloud-message" role="status" aria-live="polite">'+elt(feedback)+'</div></div></div>';
  return;
 }
 if(!verifiedUser()){
  root.innerHTML=guardedView()+'<div id="cloud-message" class="cloud-message" role="status">'+elt(feedback)+'</div>';
  return;
 }
 root.innerHTML=portalView();
}
async function onAuthSubmit(event){
 event.preventDefault();if(busy)return;busy=true;
 const f=new FormData(event.target);const email=text(f.get('email')),password=String(f.get('password')||'');
 try{
  if(mode==='signup'){
   const first_name=text(f.get('first_name')),last_name=text(f.get('last_name'));
   const profession=text(f.get('profession'))||'IFEP',district=text(f.get('district'));
   if(!first_name||!last_name||!email||password.length<8)throw Error('أدخل البيانات المطلوبة وكلمة مرور من 8 رموز على الأقل.');
   const redirect=encodeURIComponent(location.origin+location.pathname);
   const result=await raw('POST','/auth/v1/signup?redirect_to='+redirect,
      {email,password,data:{first_name,last_name,profession,district}},false);
   if(result?.access_token){rememberSession(result);await fetchAll();feedback='تم إنشاء الحساب. تأكد من حالة الاعتماد المهني.'}
   else{feedback='تم طلب إنشاء الحساب. افتح بريدك الإلكتروني وأكد العنوان، ثم سجّل الدخول.';mode='login'}
  }else{
   const result=await raw('POST','/auth/v1/token?grant_type=password',{email,password},false);
   if(!result?.access_token)throw Error('لم تُرجع خدمة الحسابات جلسة صالحة');
   rememberSession(result);await fetchAll();feedback='تم تسجيل الدخول بنجاح.';
  }
 }catch(err){feedback='تعذر تنفيذ العملية: '+err.message}
 finally{busy=false;render()}
}
async function saveShared(){
 if(!verifiedUser())throw Error('الحساب غير معتمد');
 const data=institutionDraft;
 const i={},director={};
 for(const [group,field] of INSTITUTION_EDITOR_FIELDS){
  const dst=group==='institution'?i:director;
  dst[field]=text(data[group]?.[field]);
 }
 if(!text(i.name))throw Error('أدخل اسم المؤسسة قبل الحفظ المشترك');
 const baseRecord={name:text(i.name),wilaya:text(i.wilaya),code:text(i.code),
  institution_data:i,director_data:director,updated_by:session.user.id};
 let updated;
 if(selectedSharedId){
  const previous=shared.find(x=>x.id===selectedSharedId);if(!previous)throw Error('المؤسسة المحددة غير موجودة');
  if(editingVersion===null)throw Error('رقم نسخة المؤسسة غير معروف. أعد اختيار المؤسسة قبل الحفظ.');
  updated=await submit('shared_institutions',{...baseRecord,version:editingVersion+1},
   {id:'eq.'+previous.id,version:'eq.'+editingVersion,select:'id,name,version'},'PATCH');
  if(!updated.length)throw Error('تغيرت بيانات المؤسسة من طرف مفتش آخر. راجع أحدث نسخة قبل إعادة الحفظ؛ لم نمحُ كتابتك الحالية.');
 }else{
  updated=await submit('shared_institutions',{...baseRecord,created_by:session.user.id,version:1},
   {select:'id,name,version'},'POST');
 }
 await loadShared();
 useSharedInstitution(updated[0].id);
 feedback='حُفظت بيانات المؤسسة ورئيسها في السجل المشترك مع توثيق التغيير وإشعار المفتشين الآخرين.';
}
async function loadSelected(){
 const current=shared.find(x=>x.id===selectedSharedId);
 if(!current)throw Error('اختر مؤسسة محفوظة أولًا');
 const bridge=window.Report03CloudBridge;
 if(!bridge?.applyIdentity)throw Error('محرر المؤسسة غير متاح');
 const result=bridge.applyIdentity(current.institution_data,current.director_data,{sharedInstitutionId:current.id});
 if(!result?.ok)throw Error(result?.message||'تعذر تحميل المؤسسة الحالية');
 currentPage='report';
 feedback='حُمّلت المؤسسة ورئيسها إلى التقرير. لن تُغيَّر المعاينات الموجودة.';
}
async function markRead(id){
 await submit('institution_notifications',{read_at:now()},{id:'eq.'+id,recipient_id:'eq.'+session.user.id,select:'id'},'PATCH');
 await loadShared();feedback='تم تعليم الإشعار كمقروء.';
}
async function changeInspectorStatus(id,newStatus){
 if(!profile?.is_admin||!verifiedUser())throw Error('ليس لديك صلاحية إدارة الحسابات.');
 const person=profiles.find(p=>p.id===id);
 if(!person)throw Error('تعذر العثور على الحساب؛ حدّث القائمة.');
 const old=person.account_status||'pending';
 if(id===session.user.id||person.is_admin)throw Error('لا يمكن تغيير حالة الحساب الإداري من هذه الواجهة.');
 if(!(ACCOUNT_TRANSITIONS[old]||[]).some(([status])=>status===newStatus))throw Error('هذا الانتقال غير مسموح من الحالة الحالية.');
 const reasons=[...root.querySelectorAll('[data-decision-reason]')];
 const reason=text(reasons.find(x=>x.dataset.decisionReason===id)?.value||'');
 if(reason.length>1000)throw Error('سبب القرار يتجاوز 1000 حرف.');
 if(!confirm('تأكيد تغيير حالة حساب '+text(person.first_name+' '+person.last_name)+' من «'+accountStatusLabel(old)+'» إلى «'+accountStatusLabel(newStatus)+'»؟'))return;
 await raw('POST','/rest/v1/rpc/set_inspector_account_status',{
  p_user_id:id,p_new_status:newStatus,p_reason:reason||null
 },true);
 await fetchAll();
 feedback='تم تنفيذ القرار وتسجيل صاحبه وتاريخه في السجل.';
}
async function signOut(){
 if(window.Report03CloudBridge?.prepareLogout?.()===false)return;
 try{await raw('POST','/auth/v1/logout',{},true)}catch(e){}
 session=null;profile=null;shared=[];notifications=[];profiles=[];changes=[];accountDecisions=[];myDecisions=[];missions=[];missionMembers=[];missionNotifications=[];missionEnabled=false;missionError='';selectedMissionId='';selectedSharedId='';editingVersion=null;
 storageSet(null);currentPage='dashboard';institutionDraft={institution:{},director:{}};
 feedback='تم تسجيل الخروج، ومُسحت مسودة التقرير من ذاكرة التبويب. سجل المؤسسات المركزي محفوظ.';
}
// Report editor is outside the portal root: bind its header control to the
// exact same logout path and unsaved-report confirmation as the account page.
const reportLogout=document.getElementById('report-logout');
if(reportLogout)reportLogout.addEventListener('click',async()=>{
 if(busy||!verifiedUser())return;
 busy=true;reportLogout.disabled=true;
 try{await signOut()}
 catch(err){feedback='تعذر تسجيل الخروج: '+err.message}
 finally{busy=false;reportLogout.disabled=false;render()}
});
root.addEventListener('submit',e=>{if(e.target.id==='cloud-auth-form')onAuthSubmit(e)});
root.addEventListener('input',e=>{
 const missionField=e.target.dataset?.missionField;
 if(missionField&&Object.hasOwn(missionDraft,missionField))missionDraft[missionField]=e.target.value;
 const group=e.target.dataset?.cloudFieldGroup,key=e.target.dataset?.cloudFieldKey;
 if(group&&key&&institutionDraft[group])institutionDraft[group][key]=e.target.value;
});
root.addEventListener('change',e=>{
 if(e.target.id==='cloud-select'){useSharedInstitution(e.target.value);render();return}
 if(e.target.id==='mission-select'){
  selectedMissionId=missions.some(x=>x.id===e.target.value)?e.target.value:'';
  render();return;
 }
 const field=e.target.dataset?.missionField;
 if(field&&Object.hasOwn(missionDraft,field))missionDraft[field]=e.target.value;
});
root.addEventListener('click',async e=>{
 const button=e.target.closest('[data-cloud-action]');if(!button||busy)return;
 const action=button.dataset.cloudAction;
 if(action==='mode-login'||action==='mode-signup'){mode=action==='mode-login'?'login':'signup';feedback='';render();return}
 if(action==='nav'){
  const page=button.dataset.page;
  if(page==='admin'&&!profile?.is_admin)return;
  if(!verifiedUser())return;
  currentPage=page;feedback='';render();return;
 }
 if(action==='open-institution'){useSharedInstitution(button.dataset.institutionId);currentPage='institutions';feedback='';render();return}
 if(action==='new-institution'){useSharedInstitution('');feedback='';render();return}
 busy=true;button.disabled=true;
 try{
  if(action==='logout')await signOut();
  else if(action==='save')await saveShared();
  else if(action==='load')await loadSelected();
  else if(action==='refresh'){await fetchAll();feedback='القائمة والإشعارات محدثة.'}
  else if(action==='read')await markRead(button.dataset.notificationId);
  else if(action==='mission-create')await createMission();
  else if(action==='mission-invite')await inviteMissionPeer();
  else if(action==='mission-respond'){
   const accept=button.dataset.accept==='true';
   await respondMissionInvite(button.dataset.missionId,accept);
  }
  else if(action==='mission-refresh'){await loadMissions();feedback='المهام والدعوات محدّثة.'}
  else if(action==='mission-read')await readMissionNotification(button.dataset.notificationId);
  else if(action==='set-status')await changeInspectorStatus(button.dataset.userId,button.dataset.newStatus);
 }catch(err){feedback='تعذر تنفيذ العملية: '+err.message}
 finally{busy=false;render()}
});
window.Report03CloudUI={
 resetSelection(){
  selectedSharedId='';editingVersion=null;institutionDraft={institution:{},director:{}};
  if(verifiedUser())render();
 },
 showView(page){if(verifiedUser()){currentPage=page;render()}},
 getReportOwner(){
  if(!verifiedUser())return null;
  return {id:profile.id,first_name:profile.first_name,last_name:profile.last_name,
   profession:profile.profession,district:profile.district};
 },
 listReportColleagues(){
  if(!verifiedUser())return [];
  return profiles.filter(p=>p.approved===true&&p.id!==session?.user?.id)
   .map(p=>({id:p.id,first_name:p.first_name,last_name:p.last_name,
    profession:p.profession,district:p.district||''}));
 },
 findReportColleague(id){
  if(!verifiedUser())return null;
  const colleague=profiles.find(p=>p.id===id&&p.approved===true&&p.id!==session?.user?.id);
  return colleague?{id:colleague.id,first_name:colleague.first_name,last_name:colleague.last_name,
   profession:colleague.profession,district:colleague.district||''}:null;
 },
 listReportInstitutions(){
  if(!verifiedUser())return [];
  return shared.map(record=>({id:record.id,name:record.name,wilaya:record.wilaya,code:record.code}));
 },
 selectForReport(id){
  if(!verifiedUser())return {ok:false,message:'يلزم تسجيل الدخول بحساب مفتش معتمد.'};
  const record=shared.find(x=>x.id===id);
  if(!record)return {ok:false,message:'المؤسسة غير موجودة في القائمة الحالية؛ حدّث المؤسسات المشتركة.'};
  const bridge=window.Report03CloudBridge;
  if(!bridge?.applyIdentity)return {ok:false,message:'محرر التقرير غير جاهز.'};
  const result=bridge.applyIdentity(record.institution_data,record.director_data,{sharedInstitutionId:record.id});
  if(result?.ok)useSharedInstitution(record.id);
  return result||{ok:false,message:'تعذر تحميل بيانات المؤسسة.'};
 }
};
async function init(){
 render();if(!configured)return;
 try{
  loadStoredSession();
  await restoreUrlCredentials();
  if(session)await fetchAll();
 }catch(err){feedback='تعذر استعادة الجلسة: '+err.message}
 render();
}
document.addEventListener('DOMContentLoaded',init);
setInterval(async()=>{if(!verifiedUser()||busy||document?.hidden)return;
 try{await fetchAll();render()}catch(e){status('تعذر تحديث الحساب والإشعارات مؤقتًا: '+e.message)}
},120000);
})();
