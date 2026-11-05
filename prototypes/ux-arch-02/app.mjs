// UX-ARCH-02: real cloud workspace. Uses the main platform's authenticated
// user session, and RLS-protected NEW tables only. No demo or foreign DB access.
const cfg=window.REPORT03_CLOUD_CONFIG||{};
const BASE="https://uxtsyzyotnohxvopgcmh.supabase.co";
if(cfg.supabaseUrl!==BASE||!/^sb_publishable_/.test(cfg.publishableKey||""))
 throw Error("تعذر إثبات اتصال المنصة بقاعدة الإنتاج المعتمدة.");
const KEY=cfg.publishableKey,SESSION_KEY="official_report03_cloud_session_v1";
const $=id=>document.getElementById(id);
const clean=x=>String(x??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const attr=x=>clean(x);
const uid=()=>crypto.randomUUID();
let session=null,profile=null,district=null,route="dashboard",draft=null,dirty=false,
 saveTimer=null,savePromise=null,editSequence=0,busy=false,privateRecords=[],preparations=[],publications=[],
 requests=[],grants=[],districts=[],colleagues=[],pending=[],lastError="",catalogSeq=0;
const validUUID=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x||"");
function inform(msg,error=false){
 const el=$("notice");el.textContent=msg||"";el.classList.toggle("is-error",error);
}
function loadSession(){
 let s=null;
 for(const storage of [localStorage,sessionStorage]){
  try{s=JSON.parse(storage.getItem(SESSION_KEY)||"null");if(s?.access_token&&s?.refresh_token)break;}catch{}
 }
 if(!s?.access_token||!s?.refresh_token||!validUUID(s.user?.id))throw Error(
  "يجب تسجيل الدخول أولًا من الصفحة الرئيسية للمنصة، ثم العودة إلى فضاء العمل.");
 session=s;
}
async function refresh(){
 if(Date.now()<Number(session.expires_at_ms||0)-60000)return;
 const r=await fetch(BASE+"/auth/v1/token?grant_type=refresh_token",{
  method:"POST",headers:{apikey:KEY,"Content-Type":"application/json"},
  body:JSON.stringify({refresh_token:session.refresh_token}),cache:"no-store"});
 const data=await r.json();
 if(!r.ok||!data.access_token||!data.refresh_token)throw Error(
  "انتهت الجلسة. سجّل الدخول مجددًا في المنصة الرئيسية.");
 session={access_token:data.access_token,refresh_token:data.refresh_token,
  user:data.user||session.user,expires_at_ms:Date.now()+1000*(Number(data.expires_in)||3600)};
 try{localStorage.setItem(SESSION_KEY,JSON.stringify(session))}catch{
  try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(session))}catch{}
 }
}
async function call(method,path,body,opts={}){
 await refresh();
 const headers={apikey:KEY,Authorization:"Bearer "+session.access_token,
  Accept:"application/json"};
 if(body!==undefined)headers["Content-Type"]="application/json";
 if(opts.returnRows)headers.Prefer="return=representation";
 const r=await fetch(BASE+path,{method,headers,cache:"no-store",
  body:body===undefined?undefined:JSON.stringify(body)});
 const payload=await r.text();
 let data=null;
 try{data=payload?JSON.parse(payload):null}catch{data=null}
 if(!r.ok){
  const message=String(data?.message||data?.error_description||data?.error||"فشلت العملية على خادم البيانات");
  if(/work_districts_code_check/.test(message))
   throw Error("رمز مقاطعة العمل غير صالح. أدخل رمزًا فريدًا من حرفين إلى 40 حرفًا، مثل 09 أو 09-02.");
  if(/work_districts_code_key/.test(message))
   throw Error("رمز مقاطعة العمل مستخدم سابقًا. اختر رمزًا مختلفًا لكل مقاطعة عمل.");
  if(/work_districts_label_check/.test(message))
   throw Error("اسم مقاطعة العمل يجب أن يكون من 3 إلى 160 حرفًا.");
  throw Error(message+" ("+r.status+")");
 }
 return data;
}
function qs(table,params={}){
 const query=new URLSearchParams(params);
 return "/rest/v1/"+table+"?"+query.toString();
}
const list=(table,options)=>call("GET",qs(table,options));
const rpc=(name,body)=>call("POST","/rest/v1/rpc/"+name,body);
const ownOnly=()=>Boolean(profile?.approved&&profile.account_status==="approved");
function requireDistrict(){
 if(!ownOnly()||!validUUID(profile?.work_district_id))
  throw Error("لم تُوثق مقاطعة عملك من طرف الإدارة بعد. لا يُتاح إنشاء سجلات مشتركة أو تحضيرات جديدة.");
}
async function getProfile(){
 const user=await call("GET","/auth/v1/user");
 if(user?.id!==session.user.id)throw Error("جلسة الحساب ليست مطابقة للمستخدم الموثق.");
 const rows=await list("inspector_profiles",{select:
  "id,first_name,last_name,profession,district,work_district_id,approved,account_status,is_admin",
  id:"eq."+user.id,limit:1});
 profile=rows?.[0];
 if(!profile||!ownOnly())throw Error("الحساب غير معتمد مهنيًا أو تم تعليق اعتماده.");
 district=null;
 if(profile.work_district_id){
  const ds=await list("work_districts",{select:"id,code,label",
   id:"eq."+profile.work_district_id,limit:1});
  district=ds?.[0]||null;
 }
 $("profile-name").textContent=(profile.first_name+" "+profile.last_name).trim()||
  "حساب مفتش معتمد";
 $("district").textContent="مقاطعة العمل الموثقة: "+(district?.label||"غير محددة إداريًا");
 $("admin-nav").hidden=!profile.is_admin;
}
async function reload(){
 privateRecords=[];preparations=[];publications=[];requests=[];grants=[];pending=[];
 if(!district){
  if(profile?.is_admin){
   districts=await list("work_districts",{select:"id,code,label",order:"label.asc"});
   colleagues=await list("inspector_profiles",{select:
    "id,first_name,last_name,profession,district,work_district_id,approved,account_status,is_admin",
    order:"last_name.asc"});
  }
  return;
 }
 const queries=[
  list("inspector_private_records",{select:"id,kind,title,payload,revision,updated_at",
   owner_id:"eq."+profile.id,order:"updated_at.desc"}),
  list("mission_preparations",{select:"*",owner_id:"eq."+profile.id,
   order:"updated_at.desc"}),
  list("district_published_resources",{select:"id,title,code,wilaya,work_district_id,published_at",
   publication_status:"eq.published",order:"title.asc"}),
  list("district_publication_requests",{select:
   "id,private_record_id,status,author_id,work_district_id,proposed_payload,decision_reason,submitted_at",
   order:"submitted_at.desc"})
 ];
 if(profile.is_admin)queries.push(
  list("work_districts",{select:"id,code,label",order:"label.asc"}),
  list("inspector_profiles",{select:
   "id,first_name,last_name,profession,district,work_district_id,approved,account_status,is_admin",
   order:"last_name.asc"}),
  list("district_access_grants",{select:
   "id,grantee_id,capability,resource_id,reason,expires_at,revoked_at",
   order:"created_at.desc"})
 );
 const results=await Promise.all(queries);
 [privateRecords,preparations,publications,requests]=results;
 if(profile.is_admin)[districts,colleagues,grants]=results.slice(4);
}
function panel(title,body){return '<section class="card"><h2>'+clean(title)+
 "</h2>"+body+"</section>";}
function action(label,name,identifier="",cls=""){
 return '<button type="button" class="btn '+cls+'" data-action="'+attr(name)+
 '" data-id="'+attr(identifier)+'">'+clean(label)+"</button>";
}
function record(title,details,buttons=""){
 return '<article class="list-entry"><strong>'+clean(title)+
 '</strong><small>'+clean(details)+'</small><div class="actions">'+buttons+'</div></article>';
}
const dated=x=>x?new Date(x).toLocaleString("ar-DZ"):"غير محدد";
const statusName=s=>({submitted:"في انتظار الاعتماد",approved:"معتمد",rejected:"مرفوض"})[s]||s;
function dashboard(){
 return '<p class="eyebrow">هذا فضاء جديد للبيانات الخاصة والتحضير المحفوظ. المهام والتقارير القديمة لم تُنقل إليه بعد.</p>'+
 '<div class="stats">'+
 '<div class="stat">تحضيراتي المحفوظة<strong>'+preparations.length+'</strong></div>'+
 '<div class="stat">سجلاتي الخاصة<strong>'+privateRecords.length+'</strong></div>'+
 '<div class="stat">مؤسسات مقاطعتي المنشورة<strong>'+publications.length+'</strong></div></div>'+
 panel("استئناف عملي",'<div class="actions">'+action("فتح تحضيراتي","preparations","","primary")+
 action("فتح بياناتي","private")+action("مؤسسات المقاطعة","published")+'</div>'+
 '<p class="note warning">تظل وظائف التقرير 03 ولجنة الترسيم الحالية في مساراتها السابقة. هذه مرحلة إدخال وحفظ بيانات جديدة مستقلة.</p>');
}
function preps(){
 return '<div class="actions">'+action("إنشاء تحضير سحابي جديد","create-prep","","primary")+'</div>'+
 panel("التحضيرات المحفوظة",preparations.length?preparations.map(p=>
 record(p.title,p.template_id+" | "+(p.phase||"preparation")+
 " | مراجعة "+p.revision+" | آخر حفظ: "+dated(p.updated_at),
 action("استئناف نفس التحضير","open-prep",p.id))).join(""):
 '<p class="hint">لا توجد تحضيرات بعد. يمكنك إنشاء تحضير الآن واستئنافه لاحقًا من حسابك.</p>');
}
function prepEditor(){
 if(!draft)return panel("تحرير التحضير","اختر تحضيرًا من قائمة مهامي.");
 const formItem=(n,label,value,max=250)=>
 '<div class="field"><label for="field-'+n+'">'+label+'</label>'+
 '<input id="field-'+n+'" name="'+n+'" maxlength="'+max+'" value="'+attr(value)+'"></div>';
 const area=(n,label,value)=>'<div class="field wide"><label for="field-'+n+'">'+label+
 '</label><textarea id="field-'+n+'" name="'+n+'" maxlength="3000">'+clean(value)+
 '</textarea></div>';
 const f=draft.fields||{};
 return '<div class="actions">'+action("العودة إلى تحضيراتي","preparations")+
 action("حفظ الآن","save-prep","","primary")+'</div>'+
 panel("تحرير التحضير: "+draft.title,
 '<p class="note">المعرف ثابت، وتحديث الحقول يرفع مراجعة السجل. إذا حاول جهاز آخر تعديل المراجعة نفسها، سيُرفض الحفظ المتعارض.</p>'+
 '<form id="prep-form"><div class="fields">'+
 formItem("title","عنوان المهمة",draft.title)+
 '<div class="field"><label>النموذج</label><select name="template_id">'+
 '<option value="OFFICIAL_REPORT_TEMPLATE_03"'+(draft.template_id==="OFFICIAL_REPORT_TEMPLATE_03"?" selected":"")+'>التفتيش المعمق — 03</option>'+
 '<option value="TITULARISATION"'+(draft.template_id==="TITULARISATION"?" selected":"")+'>التفتيش قصد الترسيم</option></select></div>'+
 formItem("institution","المؤسسة",f.institution||"")+
 '<div class="field"><label for="planned_date">تاريخ الزيارة المتوقع</label>'+
 '<input id="planned_date" name="planned_date" type="date" value="'+attr(draft.planned_date||"")+'"></div>'+
 formItem("teacher","الأستاذ المعني",f.teacher||"")+
 area("purpose","الغاية من المهمة",f.purpose||"")+
 area("notes","ملاحظات التحضير الخاصة",f.notes||"")+
 '</div></form><p id="save-status" class="hint">آخر حفظ على الخادم: '+
 dated(draft.updated_at)+" — مراجعة "+draft.revision+"</p>");
}
function privateView(){
 const form=panel("حفظ بيانات خاصة بالمفتش",
 '<p class="hint">لا تنتقل هذه المعلومات إلى سجل المقاطعة إلا بطلب اعتماد مستقل؛ لن تُنشر الملاحظات الخاصة تلقائيًا.</p>'+
 '<form id="private-form"><div class="fields">'+
 '<div class="field"><label>نوع السجل</label><select name="kind">'+
 '<option value="institution">مؤسسة</option><option value="reference">مرجع مهني خاص</option>'+
 '<option value="note">ملاحظة خاصة</option></select></div>'+
 '<div class="field"><label>الاسم/العنوان</label><input name="title" required minlength="3" maxlength="250"></div>'+
 '<div class="field"><label>رمز المؤسسة (اختياري)</label><input name="code" maxlength="80"></div>'+
 '<div class="field"><label>ولاية موقع المؤسسة (وصفي فقط)</label><input name="wilaya" maxlength="120"></div>'+
 '<div class="field wide"><label>الملاحظات الشخصية (لا تُنشر)</label>'+
 '<textarea name="notes" maxlength="3000"></textarea></div></div>'+
 '<div class="actions"><button type="submit" class="btn primary">حفظ خاص على الخادم</button></div></form>');
 return form+panel("بياناتي الخاصة",privateRecords.length?privateRecords.map(x=>{
  const last=requests.find(r=>r.private_record_id===x.id);
  return record(x.title,(x.kind==="institution"?"مؤسسة":"بيان خاص")+
   " | مراجعة "+x.revision+(last?" | طلب النشر: "+statusName(last.status):""),
   x.kind==="institution"?action("طلب نشر في مقاطعتي","submit-publication",x.id):"");
 }).join(""):"<p class='hint'>لا توجد بيانات خاصة محفوظة بعد.</p>");
}
function published(){
 return panel("المؤسسات المنشورة لمقاطعة العمل",
 '<p class="note">هذه قائمة السجلات الجديدة المعتمدة داخل مقاطعة عملك، مع الاستثناءات الفردية السارية. لا تضم تلقائيًا المؤسسات التاريخية غير المصنفة.</p>'+
 (publications.length?publications.map(x=>record(x.title,
 "الرمز: "+(x.code||"—")+" | ولاية المؤسسة: "+(x.wilaya||"غير محددة")+
 " | نُشرت: "+dated(x.published_at))).join(""):
 "<p class='hint'>لا توجد مؤسسات جديدة منشورة ضمن نطاقك الحالي.</p>"));
}
function requestsView(){
 return panel("طلبات نشر بيانات المؤسسات",
 '<p class="hint">المفتش يرى طلباته، والمسؤول يرى طلبات المراجعة ضمن مقاطعة عمله المعتمدة.</p>'+
 (requests.length?requests.map(x=>{
  const title=x.proposed_payload?.title||"مؤسسة";
  const own=x.author_id===profile.id;
  const canReview=profile.is_admin&&!own&&x.status==="submitted"&&
   x.work_district_id===profile.work_district_id;
  return record(title,statusName(x.status)+
   (x.decision_reason?" | سبب القرار: "+x.decision_reason:""),
   canReview?action("اعتماد النشر","approve",x.id,"primary")+
    action("رفض مع السبب","reject",x.id,"danger"):"");
 }).join(""):"<p class='hint'>لا توجد طلبات مرئية.</p>"));
}
function adminView(){
 if(!profile.is_admin)return panel("غير مصرح","الوظيفة للمسؤول فقط.");
 const options=items=>items.map(x=>'<option value="'+attr(x.id)+'">'+
 clean(x.label||((x.first_name+" "+x.last_name).trim()||x.id))+"</option>").join("");
 const grantees=colleagues.filter(x=>x.approved&&x.account_status==="approved"&&x.work_district_id);
 const resourcesNote='<p class="hint">اختر موردًا محددًا من القائمة. لا تُعرض البيانات الخاصة أو المؤسسات غير المنشورة، ويرفض الخادم أي مورد غير مؤهل.</p>';
 return panel("تسجيل مقاطعة عمل رسمية",'<form id="district-create">'+
 '<p class="hint">الرمز هنا معرّف فريد <strong>لمقاطعة العمل</strong>، وليس بالضرورة رمز الولاية. يُقبل الرمز 09 إذا كان مخصصًا لمقاطعة واحدة، أما عند وجود أكثر من مقاطعة داخل الولاية فيجب تمييز كل منها برمز مختلف مثل 09-01 و09-02. لا يُستنتج انتماء أي مفتش من الرمز.</p>'+
 '<div class="fields"><div class="field"><label>رمز مقاطعة العمل (2–40 حرفًا)</label>'+
 '<input name="code" required pattern="[A-Z0-9][A-Z0-9._-]{1,39}" minlength="2" maxlength="40" placeholder="مثال: 09 أو 09-02" title="حرفان على الأقل: أحرف لاتينية كبيرة أو أرقام أو . _ -"></div>'+
 '<div class="field"><label>اسم مقاطعة العمل الإداري الكامل</label><input name="label" required minlength="3" maxlength="160" placeholder="مثال توضيحي: البليدة 2"></div>'+
 '</div><div class="actions"><button class="btn primary" type="submit">إنشاء مقاطعة موثقة</button></div></form>')+
 panel("إسناد مقاطعة العمل إلى مفتش",
 '<p class="note warning">الإسناد إداري، ولا يُشتق من ولاية السكن ولا من تسمية المقاطعة القديمة. راجع السجلات قبل التغيير.</p>'+
 '<form id="assign-form"><div class="fields"><div class="field"><label>المفتش</label>'+
 '<select name="p_inspector" required>'+options(colleagues)+'</select></div>'+
 '<div class="field"><label>المقاطعة المعتمدة</label><select name="p_district" required>'+
 options(districts)+'</select></div>'+
 '<div class="field wide"><label>سبب إداري موثق</label>'+
 '<textarea name="p_reason" required minlength="10" maxlength="500"></textarea></div></div>'+
 '<div class="actions"><button class="btn primary" type="submit">اعتماد مقاطعة العمل</button></div></form>')+
 panel("استثناءات الإدارة",
 resourcesNote+'<form id="grant-form"><div class="fields">'+
 '<div class="field"><label>المفتش المستفيد</label><select name="p_grantee" required>'+
 options(grantees)+'</select></div>'+
 '<div class="field"><label>الصلاحية المحددة</label>'+
 '<select name="p_capability"><option value="view_institution">قراءة مؤسسة منشورة محددة</option>'+
 '<option value="view_inspector">عرض مفتش محدد</option>'+
 '<option value="collaborate_mission">التعاون في مهمة محددة</option></select></div>'+
 '<div class="field"><label>المورد الذي يشمله الاستثناء</label>'+
 '<select name="p_resource" id="grant-resource" required><option value="">جارٍ تحميل الموارد...</option></select></div>'+
 '<div class="field"><label>مدة الاستثناء بالأيام</label><select name="days">'+
 '<option value="1">يوم</option><option value="7">7 أيام</option><option value="30">30 يومًا</option></select></div>'+
 '<div class="field wide"><label>السبب المهني</label>'+
 '<textarea name="p_reason" required minlength="10" maxlength="500"></textarea></div></div>'+
 '<div class="actions"><button class="btn primary" type="submit">منح الاستثناء</button></div></form>'+
 '<h3>الاستثناءات المسجلة</h3>'+
 (grants.length?grants.map(g=>record(g.capability+" — "+g.resource_id,
 "المستفيد: "+g.grantee_id+" | الانتهاء: "+dated(g.expires_at)+
 " | "+(g.revoked_at?"مسحوب":"قائم"),
 !g.revoked_at?action("سحب الاستثناء","revoke",g.id,"danger"):"")).join(""):
 "<p class='hint'>لا توجد استثناءات.</p>"));
}
function render(){
 $("page-title").textContent={
  dashboard:"لوحة القيادة",preparations:"مهامي وتحضيراتي",edit:"تحرير التحضير",
  private:"بياناتي الخاصة",published:"مؤسسات مقاطعتي",
  requests:"طلبات النشر",admin:"إدارة المقاطعات والاستثناءات"
 }[route]||"لوحة القيادة";
 document.querySelectorAll("[data-route]").forEach(el=>{
  el.classList.toggle("active",el.dataset.route===route);
  el.hidden=el.dataset.route==="admin"&&!profile?.is_admin;
 });
 if(!district&&route!=="admin"){
  $("content").innerHTML=panel("مقاطعة العمل غير موثقة بعد",
   "<p>حسابك معتمد، لكن لم تسند الإدارة إليه مقاطعة عمل رسمية. "+
   "لا يمكن إنشاء تحضيرات أو بيانات جديدة أو عرض مؤسسات مشتركة قبل التوثيق.</p>"+
   (profile?.is_admin?action("الانتقال إلى إدارة المقاطعات","admin","","primary"):""));
  return;
 }
 $("content").innerHTML=({
  dashboard,preparations:preps,edit:prepEditor,private:privateView,
  published,requests:requestsView,admin:adminView
 }[route]||dashboard)();
 if(route==="admin")refreshCatalog();
}
async function refreshCatalog(){
 if(!profile?.is_admin||route!=="admin")return;
 const form=$("grant-form");if(!form)return;
 const selected=form.elements.p_resource;
 const grantee=form.elements.p_grantee.value,cap=form.elements.p_capability.value;
 const stamp=++catalogSeq;
 selected.disabled=true;
 selected.innerHTML='<option value="">جارٍ تحميل قائمة الموارد المؤهلة...</option>';
 if(!validUUID(grantee)){
  selected.innerHTML='<option value="">لا يوجد مفتش مؤهل للاستثناء</option>';
  return;
 }
 try{
  const rows=await rpc("ux_admin_list_exception_resources",{
   p_grantee:grantee,p_capability:cap});
  if(stamp!==catalogSeq||route!=="admin"||$("grant-form")!==form)return;
  selected.innerHTML=rows?.length?rows.map(r=>
   '<option value="'+attr(r.resource_id)+'">'+clean(r.resource_label+
    " — "+r.district_label)+'</option>').join(""):
   '<option value="">لا يوجد مورد خارجي معتمد ومؤهل لهذا الاستثناء</option>';
  selected.disabled=!rows?.length;
 }catch(err){
  if(stamp!==catalogSeq||$("grant-form")!==form)return;
  selected.disabled=true;
  selected.innerHTML='<option value="">تعذر تحميل الموارد</option>';
  inform(err.message,true);
 }
}
async function saveDraft(){
 if(savePromise){await savePromise;if(dirty)return saveDraft();return true;}
 if(!draft||!dirty)return true;
 const form=$("prep-form");
 if(!form)return false;
 const data=Object.fromEntries(new FormData(form).entries());
 if(String(data.title||"").trim().length<3)throw Error("عنوان المهمة أقصر من ثلاثة أحرف.");
 const startedAt=editSequence;
 const payload={title:data.title.trim(),template_id:data.template_id,
  planned_date:data.planned_date||null,
  fields:{institution:data.institution||"",teacher:data.teacher||"",
   purpose:data.purpose||"",notes:data.notes||""},revision:draft.revision+1};
 const snapshotId=draft.id;
 savePromise=call("PATCH",qs("mission_preparations",{
  id:"eq."+draft.id,revision:"eq."+draft.revision,select:"*"}),payload,{returnRows:true});
 try{
  const rows=await savePromise;
  if(!Array.isArray(rows)||rows.length!==1)throw Error(
   "تغيرت هذه المهمة على جهاز آخر. أعد تحميلها قبل إعادة المحاولة، مع الاحتفاظ بالنصوص الحالية.");
  if(!draft||draft.id!==snapshotId)throw Error("تغيرت المهمة أثناء الحفظ.");
  draft=rows[0];dirty=(editSequence!==startedAt);
  const status=$("save-status");
  if(status)status.textContent=dirty?
    "أُنجز حفظ سابق؛ توجد تعديلات أحدث يجري حفظها...":
    "حُفظ على الخادم: "+dated(draft.updated_at)+" — مراجعة "+draft.revision;
 }finally{savePromise=null;}
 if(dirty)return saveDraft();
 return true;
}
async function flushDraft(){
 if(saveTimer){clearTimeout(saveTimer);saveTimer=null}
 if(dirty)await saveDraft();
}
async function navigate(next){
 if(busy)return;
 try{
  busy=true;
  if(route==="edit"&&next!=="edit")await flushDraft();
  route=next;render();inform("");
 }catch(e){inform(e.message,true)}
 finally{busy=false}
}
async function perform(action){
 if(busy)return;
 busy=true;
 try{await action();await reload();render();}
 catch(e){inform(e.message,true)}
 finally{busy=false}
}
document.querySelectorAll("[data-route]").forEach(el=>
 el.addEventListener("click",()=>navigate(el.dataset.route)));
$("content").addEventListener("input",event=>{
 if(route!=="edit"||!event.target.closest?.("#prep-form"))return;
 dirty=true;editSequence++;
 if(saveTimer)clearTimeout(saveTimer);
 saveTimer=setTimeout(()=>saveDraft().catch(e=>inform(e.message,true)),800);
 const status=$("save-status");
 if(status)status.textContent="تغييرات غير محفوظة — جارٍ الحفظ...";
});
window.addEventListener("beforeunload",event=>{
 if(dirty){event.preventDefault();event.returnValue="";}
});
$("content").addEventListener("change",event=>{
 if(["grant-grantee","grant-capability"].includes(event.target.id))
  refreshCatalog();
});
$("content").addEventListener("submit",event=>{
 event.preventDefault();
 const form=event.target;
 perform(async()=>{
  const data=Object.fromEntries(new FormData(form).entries());
  if(form.id==="private-form"){
   requireDistrict();
   await call("POST",qs("inspector_private_records",{select:"id"}),{
    id:uid(),owner_id:profile.id,work_district_id:profile.work_district_id,
    kind:data.kind,title:data.title.trim(),payload:{
     code:data.code||"",wilaya:data.wilaya||"",private_notes:data.notes||""
    }},{returnRows:true});
   inform("حُفظت البيانات الخاصة في حسابك.");
  }else if(form.id==="district-create"){
   const code=String(data.code||"").trim().toUpperCase();
   const label=String(data.label||"").trim();
   if(!/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(code))
    throw Error("رمز مقاطعة العمل يجب أن يتكون من حرفين إلى 40 حرفًا من الأحرف اللاتينية الكبيرة والأرقام و. _ -");
   if(label.length<3)throw Error("أدخل الاسم الإداري الكامل لمقاطعة العمل.");
   await rpc("ux_admin_create_work_district",{p_code:code,p_label:label});
   await getProfile();
   inform("أُنشئت مقاطعة العمل. الخطوة التالية: اختر المفتش والمقاطعة الصحيحة في قسم «إسناد مقاطعة العمل إلى مفتش».");
  }else if(form.id==="assign-form"){
   await rpc("ux_admin_assign_work_district",data);
   inform("سُجل إسناد مقاطعة العمل في سجل التدقيق.");
   await getProfile();
  }else if(form.id==="grant-form"){
   if(!validUUID(data.p_resource))throw Error("معرّف المورد ليس UUID صالحًا.");
   await rpc("ux_admin_grant_district_access",{
    p_grantee:data.p_grantee,p_capability:data.p_capability,
    p_resource:data.p_resource,p_reason:data.p_reason,
    p_expires_at:new Date(Date.now()+Number(data.days)*86400000).toISOString()
   });
   inform("مُنح استثناء محدد ومؤقت وتم توثيق العملية.");
  }
 });
});
$("content").addEventListener("click",event=>{
 const button=event.target.closest?.("[data-action]");if(!button)return;
 const action=button.dataset.action,identifier=button.dataset.id;
 if(["preparations","private","published","requests","admin","dashboard"].includes(action)){
  navigate(action);return;
 }
 perform(async()=>{
  if(action==="create-prep"){
   requireDistrict();
   const rows=await call("POST",qs("mission_preparations",{select:"*"}),{
    id:uid(),owner_id:profile.id,work_district_id:profile.work_district_id,
    template_id:"OFFICIAL_REPORT_TEMPLATE_03",title:"مهمة قيد التحضير",
    phase:"preparation",fields:{}
   },{returnRows:true});
   draft=rows?.[0];if(!draft)throw Error("لم يؤكد الخادم إنشاء التحضير.");
   route="edit";
  }else if(action==="open-prep"){
   draft=preparations.find(x=>x.id===identifier&&x.owner_id===profile.id);
   if(!draft)throw Error("التحضير غير متاح.");
   route="edit";
  }else if(action==="save-prep"){
   await flushDraft();inform("حُفظت المسودة على الخادم.");
  }else if(action==="submit-publication"){
   await rpc("ux_submit_institution_request",{p_private_record:identifier});
   inform("أُرسل طلب نشر المؤسسة إلى مراجع مقاطعة العمل.");
  }else if(action==="approve"||action==="reject"){
   const approved=action==="approve";
   const reason=prompt(approved?"تعليل القرار (اختياري):":"ما سبب الرفض؟");
   if(reason===null)return;
   await rpc("ux_review_institution_request",{
    p_request:identifier,p_approve:approved,p_reason:reason});
   inform(approved?"نُشر سجل المؤسسة المعتمد في المقاطعة.":"رُفض النشر دون حذف السجل الخاص.");
  }else if(action==="revoke"){
   const reason=prompt("سبب سحب الاستثناء (6 أحرف على الأقل):");
   if(reason===null)return;
   await rpc("ux_admin_revoke_district_access",{p_grant:identifier,p_reason:reason});
   inform("سُحب الاستثناء فورًا.");
  }
 });
});
async function init(){
 try{
  loadSession();await getProfile();await reload();render();
 }catch(e){
  $("content").innerHTML=panel("تعذر فتح فضاء العمل",
   "<p>"+clean(e.message)+"</p><p><a href='../../'>تسجيل الدخول من المنصة الرئيسية</a></p>");
 }
}
init();
