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
let session=null,profile=null,shared=[],profiles=[],notifications=[],changes=[],mode='login';
let selectedSharedId='',feedback='',busy=false;
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
 const path=apiPath(table,params);
 const headers={'apikey':key,'Authorization':'Bearer '+session.access_token,
  'Content-Type':'application/json','Accept':'application/json','Prefer':'return=representation'};
 const res=await fetch(base+path,{method:method||'POST',headers,body:JSON.stringify(data),cache:'no-store'});
 const rawText=await res.text();let result;try{result=rawText?JSON.parse(rawText):[]}catch(e){result=[]}
 if(!res.ok){const ex=new Error(String(result?.message||result?.details||'فشل الحفظ المشترك'));ex.httpStatus=res.status;throw ex}
 return result;
}
async function loadProfile(){
 const rows=await get('inspector_profiles',{select:'id,email,first_name,last_name,profession,district,approved,is_admin',id:'eq.'+session.user.id});
 profile=Array.isArray(rows)?rows[0]||null:null;
 if(!profile)throw Error('تعذر العثور على ملف المفتش. تحقق من تنفيذ مخطط قاعدة البيانات.');
}
async function loadShared(){
 if(!verifiedUser()){shared=[];notifications=[];changes=[];profiles=[];return}
 const [institutions,people,pings]=await Promise.all([
  get('shared_institutions',{select:'id,name,wilaya,code,institution_data,director_data,version,updated_at,updated_by',order:'name.asc',limit:'500'}),
  get('inspector_profiles',{select:'id,email,first_name,last_name,profession,approved,is_admin',order:'first_name.asc'}),
  get('institution_notifications',{select:'id,change_id,read_at,created_at',recipient_id:'eq.'+session.user.id,order:'created_at.desc',limit:'40'})
 ]);
 shared=institutions||[];profiles=people||[];notifications=pings||[];
 const ids=notifications.map(x=>x.change_id).filter(Boolean);
 changes=ids.length?await get('institution_changes',{select:'id,institution_id,actor_id,action,changes,created_at',id:'in.('+ids.join(',')+')'}):[];
}
async function fetchAll(){
 if(!session)return;
 await loadProfile();
 await loadShared();
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
function authenticatedView(){
 const fullName=text(profile?.first_name+' '+profile?.last_name);
 let html='<div class="cloud-header"><h3>'+elt(fullName||'حساب مفتش')+'</h3><p>'+elt(profile?.email||'')+
 ' — '+elt(title(profile?.profession))+' — '+(verifiedUser()?'حساب مهني معتمد':'بانتظار اعتماد الحساب')+'</p>'+
 '<button type="button" class="btn subtle" data-cloud-action="logout">تسجيل الخروج</button></div>';
 if(!verifiedUser())return html+'<p class="cloud-warning">البريد الإلكتروني مؤكد، لكن الوصول المشترك غير متاح قبل اعتماد الحساب من مسؤول المنصة.</p>';
 const choices=shared.map(x=>'<option value="'+elt(x.id)+'" '+(selectedSharedId===x.id?'selected':'')+'>'+
 elt(x.name+' — '+x.wilaya+(x.code?' ('+x.code+')':''))+'</option>').join('');
 html+='<div class="cloud-directory"><h4>المؤسسات المشتركة ('+shared.length+')</h4>'+
 '<p>كل المفتشين المعتمدين يرون هذه المؤسسات ويستطيعون تعديلها، ويُسجل كل تغيير باسمه.</p>'+
 '<select id="cloud-select" aria-label="اختيار مؤسسة مشتركة"><option value="">+ مؤسسة مشتركة جديدة</option>'+choices+'</select>'+
 '<div class="cloud-actions"><button type="button" class="btn subtle" data-cloud-action="load">تحميل المؤسسة المختارة إلى التقرير</button>'+
 '<button type="button" class="btn primary" data-cloud-action="save">'+(selectedSharedId?'حفظ تعديل المؤسسة المشتركة':'حفظ المؤسسة الحالية في السجل المشترك')+'</button>'+
 '<button type="button" class="btn subtle" data-cloud-action="refresh">تحديث القائمة والإشعارات</button></div>'+
 '<p class="cloud-tip">الحفظ المشترك يشمل المؤسسة ورئيسها فقط. لا تُرفع بيانات التقرير أو معايناته أو توصياته.</p></div>';
 const unread=notifications.filter(x=>!x.read_at).length;
 html+='<section class="cloud-alerts"><h4>إشعارات تحديث المؤسسات ('+unread+' غير مقروء)</h4>'+
 (notifications.length?notifications.slice(0,15).map(noticeCard).join(''):'<p>لا توجد إشعارات بعد.</p>')+'</section>';
 if(profile.is_admin){
  const pending=profiles.filter(p=>!p.approved);
  html+='<section class="cloud-approvals"><h4>اعتماد المفتشين ('+pending.length+')</h4>'+
 (pending.length?pending.map(p=>'<div class="cloud-pending">'+elt(p.first_name+' '+p.last_name)+' — '+elt(p.email)+
 ' <button type="button" class="add-button" data-cloud-action="approve" data-user-id="'+elt(p.id)+'">اعتماد</button></div>').join(''):'<p>لا توجد حسابات تنتظر الاعتماد.</p>')+'</section>';
 }
 return html;
}
function render(){
 if(!configured){root.innerHTML='<p>السجل المركزي والحسابات قيد التفعيل. يستمر السجل المحلي ومحرر التقرير بالعمل بصورة طبيعية.</p>'+
 '<p>يحتاج المسؤول إلى إنشاء قاعدة Supabase وتفعيل ملف إعداد الاتصال العام. لا تضع أي مفتاح سري في الموقع.</p>';return}
 root.innerHTML=(session?authenticatedView():unauthenticatedView())+
 '<div id="cloud-message" class="cloud-message" role="status" aria-live="polite">'+elt(feedback)+'</div>';
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
 const bridge=window.Report03CloudBridge;
 if(!bridge?.getIdentity)throw Error('محرر بيانات المؤسسة لم يجهز بعد');
 const data=bridge.getIdentity(),i=data.institution||{},director=data.director||{};
 if(!text(i.name))throw Error('أدخل اسم المؤسسة قبل الحفظ المشترك');
 const baseRecord={name:text(i.name),wilaya:text(i.wilaya),code:text(i.code),
  institution_data:i,director_data:director,updated_by:session.user.id};
 let updated;
 if(selectedSharedId){
  const previous=shared.find(x=>x.id===selectedSharedId);if(!previous)throw Error('المؤسسة المحددة غير موجودة');
  updated=await submit('shared_institutions',{...baseRecord,version:previous.version+1},
   {id:'eq.'+previous.id,version:'eq.'+previous.version,select:'id,name,version'},'PATCH');
  if(!updated.length)throw Error('تغيرت بيانات المؤسسة من طرف مفتش آخر. راجع أحدث نسخة قبل إعادة الحفظ؛ لم نمحُ كتابتك الحالية.');
 }else{
  updated=await submit('shared_institutions',{...baseRecord,created_by:session.user.id,version:1},
   {select:'id,name,version'},'POST');
 }
 selectedSharedId=updated[0].id;
 await loadShared();
 feedback='حُفظت بيانات المؤسسة ورئيسها في السجل المشترك مع توثيق التغيير وإشعار المفتشين الآخرين.';
}
async function loadSelected(){
 const current=shared.find(x=>x.id===selectedSharedId);
 if(!current)throw Error('اختر مؤسسة محفوظة أولًا');
 const bridge=window.Report03CloudBridge;
 if(!bridge?.applyIdentity)throw Error('محرر المؤسسة غير متاح');
 const result=bridge.applyIdentity(current.institution_data,current.director_data);
 if(!result?.ok)throw Error(result?.message||'تعذر تحميل المؤسسة الحالية');
 feedback='حُمّلت المؤسسة ورئيسها إلى التقرير. لن تُغيَّر المعاينات الموجودة.';
}
async function markRead(id){
 await submit('institution_notifications',{read_at:now()},{id:'eq.'+id,recipient_id:'eq.'+session.user.id,select:'id'},'PATCH');
 await loadShared();feedback='تم تعليم الإشعار كمقروء.';
}
async function approve(id){
 await raw('POST','/rest/v1/rpc/approve_inspector',{p_user_id:id,p_approved:true},true);
 await loadShared();feedback='تم اعتماد حساب المفتش، ويمكنه الآن استخدام السجل المشترك.';
}
async function signOut(){
 try{await raw('POST','/auth/v1/logout',{},true)}catch(e){}
 session=null;profile=null;shared=[];notifications=[];profiles=[];changes=[];selectedSharedId='';
 storageSet(null);feedback='تم تسجيل الخروج. تظل بيانات التقرير المحلية كما هي.';
}
root.addEventListener('submit',e=>{if(e.target.id==='cloud-auth-form')onAuthSubmit(e)});
root.addEventListener('change',e=>{if(e.target.id==='cloud-select')selectedSharedId=e.target.value});
root.addEventListener('click',async e=>{
 const button=e.target.closest('[data-cloud-action]');if(!button||busy)return;
 const action=button.dataset.cloudAction;
 if(action==='mode-login'||action==='mode-signup'){mode=action==='mode-login'?'login':'signup';feedback='';render();return}
 busy=true;button.disabled=true;
 try{
  if(action==='logout')await signOut();
  else if(action==='save')await saveShared();
  else if(action==='load')await loadSelected();
  else if(action==='refresh'){await fetchAll();feedback='القائمة والإشعارات محدثة.'}
  else if(action==='read')await markRead(button.dataset.notificationId);
  else if(action==='approve')await approve(button.dataset.userId);
 }catch(err){feedback='تعذر تنفيذ العملية: '+err.message}
 finally{busy=false;render()}
});
window.Report03CloudUI={resetSelection(){selectedSharedId='';if(verifiedUser())render()}};
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
setInterval(async()=>{if(!verifiedUser()||busy||!shell.open)return;
 try{await loadShared();render()}catch(e){status('تعذر تحديث الإشعارات مؤقتًا: '+e.message)}
},120000);
})();
