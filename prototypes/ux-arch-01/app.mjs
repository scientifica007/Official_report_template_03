// UX-ARCH-01: synthetic UI ONLY; no real authorization or Supabase requests.
import {DEMO_USERS,DEMO_DISTRICTS,DEMO_MISSIONS,EXCEPTION_CAPABILITIES,
 initialDemoState,normalizedDemoState,colleaguesFor,institutionsFor,missionsFor,
 personalPreparations,personalRecords,upsertPreparation,addPrivateRecord,
 requestPublication,pendingRequestsFor,decidePublication,grantException,
 revokeException} from "./demo-model.mjs?v=uxarch01";
const $=id=>document.getElementById(id);
const key="UX_ARCH_01_SYNTHETIC_V1";
const escapeText=s=>String(s??"").replace(/[&<>"']/g,x=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
})[x]);
const uid=()=>globalThis.crypto?.randomUUID?.()||
 "demo-"+Date.now()+"-"+Math.random().toString(36).slice(2);
const userBy=id=>DEMO_USERS.find(x=>x.id===id);
const districtLabel=id=>DEMO_DISTRICTS.find(x=>x.id===id)?.label||"لم تُوثق مقاطعة العمل";
let state=initialDemoState();
try{const saved=localStorage.getItem(key);if(saved)state=normalizedDemoState(JSON.parse(saved));}catch{}
let user=DEMO_USERS[1],route="dashboard",activeId=null;
const labels={dashboard:"لوحة القيادة",tasks:"مهامي وتحضير المهام",
 prepare:"التحضير المسبق للمهمة",private:"بياناتي الدائمة",
 institutions:"مؤسسات مقاطعتي",colleagues:"زملاء مقاطعة العمل",
 approvals:"طلبات الاعتماد",exceptions:"استثناءات الإدارة"};
const btn=(name,action,id="",extra="")=>
 '<button type="button" class="btn '+(extra||"")+'" data-action="'+escapeText(action)+
 '" data-id="'+escapeText(id)+'">'+escapeText(name)+'</button>';
const entry=(name,detail,buttons="")=>
 '<article class="list-entry"><strong>'+escapeText(name)+'</strong><small>'+
 escapeText(detail)+'</small><div class="actions">'+buttons+'</div></article>';
function store(){
 try{localStorage.setItem(key,JSON.stringify(state));return true}
 catch{message("تعذر الحفظ المحلي في هذا المتصفح.",true);return false}
}
function message(s="",error=false){
 $("notice").textContent=s;
 $("notice").classList.toggle("is-error",error);
}
function go(target){
 if(target==="exceptions"&&!user.isAdmin)return;
 if(target==="approvals"&&!user.reviewer)return;
 route=labels[target]?target:"dashboard";
 if(route==="prepare"&&!activeId)route="tasks";
 location.hash=route;render();
}
const templateLabel=id=>id==="TITULARISATION"?"التفتيش قصد الترسيم":"التفتيش المعمق — النموذج 03";
const dateLabel=s=>s?s.slice(8,10)+"/"+s.slice(5,7)+"/"+s.slice(0,4):"موعد غير محدد";
function dashboard(){
 const preps=personalPreparations(state,user);
 return '<p class="eyebrow">استأنف العمل انطلاقًا من مهامك، دون البحث عن روابط المختبرات.</p>'+
  '<div class="stats">'+
   '<div class="stat">تحضيرات محفوظة<strong>'+preps.length+'</strong></div>'+
   '<div class="stat">مؤسسات ظاهرة<strong>'+institutionsFor(state,user).length+'</strong></div>'+
   '<div class="stat">زملاء ظاهرون<strong>'+colleaguesFor(state,user).length+'</strong></div></div>'+
  '<div class="grid" style="margin-top:18px">'+
   '<section class="card"><h2>مهامي</h2><p class="card-sub">التحضير والاستئناف في مسار واحد.</p>'+btn("فتح مهامي","tasks")+'</section>'+
   '<section class="card"><h2>بياناتي</h2><p class="card-sub">مراجع شخصية قابلة لطلب الاعتماد.</p>'+btn("فتح بياناتي","private")+'</section>'+
   '<section class="card"><h2>مؤسسات مقاطعتي</h2><p class="card-sub">سجل معتمد ومنشور داخل نطاق العمل.</p>'+btn("عرض المؤسسات","institutions")+'</section>'+
   '<section class="card"><h2>زملائي</h2><p class="card-sub">دليل مقاطعة العمل المعتمدة.</p>'+btn("عرض الزملاء","colleagues")+'</section></div>'+
  '<section class="card"><h2>آخر التحضيرات</h2>'+
    (preps.length?preps.slice(-3).reverse().map(p=>entry(p.title,
     templateLabel(p.templateId)+" | حفظ: "+new Date(p.updatedAt).toLocaleString("ar-DZ"),
     btn("استئناف التحضير","open-preparation",p.id))).join(""):
     '<p class="hint">لا توجد تحضيرات بعد.</p>')+'</section>';
}
function tasks(){
 const list=personalPreparations(state,user);
 return '<div class="actions">'+btn("إنشاء تحضير لمهمة جديدة","new-preparation","","primary")+'</div>'+
 '<section class="card"><h2>تحضيراتي المحفوظة ('+list.length+')</h2>'+
 '<p class="hint">تُحفظ الحقول تلقائيًا داخل المتصفح في هذه المعاينة. استئناف نفس السجل ممكن بعد العودة أو إعادة تحميل الصفحة.</p>'+
 (list.length?list.slice().reverse().map(p=>entry(p.title,templateLabel(p.templateId)+
 " | المؤسسة: "+(p.institution||"غير محددة")+" | "+dateLabel(p.plannedDate)+
 " | مراجعة "+p.revision,btn("فتح التحضير","open-preparation",p.id))).join(""):
 '<p class="hint">أنشئ تحضيرًا لتجربة الاستمرار.</p>')+'</section>'+
 '<section class="card"><h2>مهمات توضيحية مرئية لهذا الحساب</h2>'+
 missionsFor(state,user).map(m=>entry(m.title,"مقاطعة المهمة: "+districtLabel(m.districtId))).join("")+
 '<p class="hint">مهمات اصطناعية للمعاينة؛ ليست مهمات حقيقية في المنصة.</p></section>';
}
function prep(){
 const p=personalPreparations(state,user).find(x=>x.id===activeId);
 if(!p)return '<p class="note warning">لم يتم تحديد تحضير مسموح لهذا الحساب.</p>'+btn("العودة إلى مهامي","tasks");
 const field=(name,label,value,max=250)=>
  '<div class="field"><label for="prep-'+name+'">'+label+'</label><input name="'+name+
  '" id="prep-'+name+'" maxlength="'+max+'" value="'+escapeText(value)+'"></div>';
 const area=(name,label,value)=>
  '<div class="field wide"><label for="prep-'+name+'">'+label+'</label><textarea name="'+name+
  '" id="prep-'+name+'" maxlength="3000">'+escapeText(value)+'</textarea></div>';
 return '<div class="actions">'+btn("العودة إلى مهامي","tasks")+'</div>'+
 '<section class="card"><h2>تحضير المهمة</h2><p class="note">يتم تعديل سجل المهمة نفسه وحفظ حقوله محليًا أثناء الكتابة؛ لا يُنشأ سجل جديد عند العودة إليه.</p>'+
 '<form id="preparation-form"><div class="fields">'+
 field("title","عنوان المهمة",p.title,200)+
 '<div class="field"><label>نوع المهمة</label><select name="templateId">'+
 '<option value="OFFICIAL_REPORT_TEMPLATE_03"'+(p.templateId==="OFFICIAL_REPORT_TEMPLATE_03"?" selected":"")+'>التفتيش المعمق — النموذج 03</option>'+
 '<option value="TITULARISATION"'+(p.templateId==="TITULARISATION"?" selected":"")+'>التفتيش قصد الترسيم</option></select></div>'+
 field("institution","المؤسسة",p.institution)+
 '<div class="field"><label>تاريخ الزيارة المتوقع (اختياري)</label><input type="date" name="plannedDate" value="'+escapeText(p.plannedDate)+'"></div>'+
 field("teacher","الأستاذ المعني (إن وجد)",p.teacher)+
 area("purpose","هدف المهمة",p.purpose)+area("notes","ملاحظات خاصة بالتحضير",p.notes)+
 '</div></form><p class="hint" id="autosave-status">آخر حفظ محلي: '+new Date(p.updatedAt).toLocaleString("ar-DZ")+
 ' — مراجعة '+p.revision+'</p></section>';
}
function privateView(){
 const mine=personalRecords(state,user);
 const requests=state.publicationRequests.filter(x=>x.authorId===user.id);
 return '<section class="card"><h2>إنشاء بيانات خاصة دائمة</h2>'+
 '<p class="hint">بياناتك ملك لك. لا تُنشر تلقائيًا لأي زميل؛ تطلب الاعتماد منفصلًا إذا كانت مؤسسة.</p>'+
 '<form id="private-form"><div class="fields">'+
 '<div class="field"><label>نوع السجل</label><select name="kind"><option value="institution">مؤسسة</option><option value="reference">مرجع شخصي</option></select></div>'+
 '<div class="field"><label>اسم المؤسسة أو عنوان المرجع</label><input name="title" required minlength="3" maxlength="250"></div>'+
 '<div class="field"><label>رمز المؤسسة</label><input name="code" maxlength="80"></div>'+
 '<div class="field"><label>ولاية موقع المؤسسة — بيان وصفي</label><input name="wilaya" maxlength="120"></div>'+
 '<div class="field wide"><label>ملاحظات إضافية</label><textarea name="text" maxlength="3000"></textarea></div>'+
 '</div><div class="actions"><button class="btn primary" type="submit">حفظ في بياناتي الخاصة</button></div></form></section>'+
 '<section class="card"><h2>سجلاتي الخاصة ('+mine.length+')</h2>'+
 (mine.length?mine.map(p=>{
  const req=requests.filter(x=>x.recordId===p.id).slice(-1)[0];
  const desc=(p.kind==="institution"?"مؤسسة":"مرجع")+
    (req?" | آخر طلب: "+({submitted:"بانتظار الاعتماد",approved:"منشور",rejected:"مرفوض"}[req.status]||req.status):
    " | غير منشور");
  return entry(p.title,desc,p.kind==="institution"?btn("طلب اعتماد ونشر","request-publication",p.id):"");
 }).join(""):'<p class="hint">ليس لديك سجلات بعد.</p>')+'</section>';
}
function institutions(){
 const found=institutionsFor(state,user);
 return '<section class="card"><h2>المؤسسات المعتمدة والمنشورة</h2>'+
 '<p class="note">تحدّد مقاطعة العمل المعتمدة نطاق المؤسسات؛ ولا تمنح ولاية السكن أو موقع المؤسسة حق الاطلاع.</p>'+
 (found.length?found.map(x=>entry(x.name,"الرمز: "+(x.code||"—")+
 " | موقع المؤسسة: "+(x.wilaya||"غير محدد")+" | مقاطعة السجل: "+districtLabel(x.districtId))).join(""):
 '<p class="hint">لا توجد مؤسسات معتمدة ظاهرة لهذا الحساب.</p>')+'</section>';
}
function colleagues(){
 const found=colleaguesFor(state,user);
 return '<section class="card"><h2>دليل الزملاء ضمن مقاطعة العمل</h2>'+
 '<p class="hint">لا تظهر أسماء مفتشي المقاطعات الأخرى إلا باستثناء فردي من admin.</p>'+
 (found.length?found.map(x=>entry(x.name,"مقاطعة العمل: "+districtLabel(x.districtId))).join(""):
 '<p class="hint">لا توجد أسماء ظاهرة.</p>')+'</section>';
}
function approvals(){
 const list=pendingRequestsFor(state,user);
 return '<section class="card"><h2>طلبات نشر بيانات المؤسسات</h2>'+
 '<p class="note">يرى المراجع المخوّل طلبات مقاطعته فقط؛ ويبقى سجل المفتش الخاص محفوظًا حتى عند رفض الطلب.</p>'+
 (list.length?list.map(x=>entry(x.proposed.title,"مقدم الطلب: "+
 (userBy(x.authorId)?.name||"—")+" | رمز المؤسسة: "+(x.proposed.code||"—")+
 " | البيانات: "+x.proposed.text,
 btn("اعتماد ونشر","approve",x.id,"primary")+btn("رفض مع السبب","reject",x.id,"danger"))).join(""):
 '<p class="hint">لا توجد طلبات تنتظر المراجعة في مقاطعتك.</p>')+'</section>';
}
function resourceOptions(capability,granteeId){
 const grantee=userBy(granteeId);
 if(!grantee?.districtId)return [];
 if(capability==="view_inspector")return DEMO_USERS.filter(x=>x.approved&&x.districtId&&
  x.districtId!==grantee.districtId).map(x=>({id:x.id,label:x.name}));
 if(capability==="view_institution")return state.institutions.filter(x=>x.status==="published"&&
  x.districtId!==grantee.districtId).map(x=>({id:x.id,label:x.name}));
 if(capability==="collaborate_mission")return DEMO_MISSIONS.filter(x=>x.districtId!==grantee.districtId)
  .map(x=>({id:x.id,label:x.title}));
 return [];
}
function exceptions(){
 const active=state.exceptions.slice().reverse(),now=Date.now();
 const grantees=DEMO_USERS.filter(x=>x.approved&&x.districtId&&x.id!==user.id);
 return '<section class="card"><h2>منح استثناء مقاطعة — admin فقط</h2>'+
 '<p class="note warning">هذا نموذج تجريبي لا يمنح أي صلاحية حقيقية. كل استثناء لمستفيد ومورد وصلاحية محددة ولمدة 30 يومًا كحد أقصى، مع إمكانية السحب وتسجيل الواقعة. لا يشمل البيانات الشخصية.</p>'+
 '<form id="exception-form"><div class="fields">'+
 '<div class="field"><label>المفتش المستفيد</label><select name="granteeId" id="grant-grantee">'+
 grantees.map(x=>'<option value="'+escapeText(x.id)+'">'+escapeText(x.name)+'</option>').join("")+'</select></div>'+
 '<div class="field"><label>نوع الاستثناء</label><select name="capability" id="grant-capability">'+
 Object.entries(EXCEPTION_CAPABILITIES).map(([k,v])=>'<option value="'+escapeText(k)+'">'+
 escapeText(v.label)+'</option>').join("")+'</select></div>'+
 '<div class="field"><label>المورد المحدد</label><select name="resourceId" id="grant-resource"></select></div>'+
 '<div class="field"><label>المدة</label><select name="days"><option value="1">يوم واحد</option>'+
 '<option value="7" selected>7 أيام</option><option value="30">30 يومًا</option></select></div>'+
 '<div class="field wide"><label>سبب مهني موثق (10–500 حرف)</label>'+
 '<textarea name="reason" minlength="10" maxlength="500" required></textarea></div>'+
 '</div><div class="actions"><button class="btn primary" type="submit">منح الاستثناء المحدد</button></div></form></section>'+
 '<section class="card"><h2>الاستثناءات القائمة</h2>'+
 (active.length?active.map(x=>entry(EXCEPTION_CAPABILITIES[x.capability]?.label||x.capability,
 "المستفيد: "+(userBy(x.granteeId)?.name||"—")+
 " | المورد: "+x.resourceId+" | الانتهاء: "+new Date(x.expiresAt).toLocaleDateString("ar-DZ")+
 " | "+(x.revokedAt?"مسحوب":Date.parse(x.expiresAt)>now?"ساري":"منتهي")+
 " | السبب: "+x.reason,
 !x.revokedAt&&Date.parse(x.expiresAt)>now?btn("سحب الاستثناء","revoke",x.id,"danger"):"")).join(""):
 '<p class="hint">لا توجد استثناءات بعد.</p>')+'</section>'+
 '<section class="card"><h2>سجل التدقيق الإلحاقي</h2>'+
 (state.audit.length?state.audit.slice().reverse().map(x=>entry(x.action==="granted"?"منح استثناء":"سحب استثناء",
 "المسؤول: "+(userBy(x.actorId)?.name||"—")+" | "+
 new Date(x.at).toLocaleString("ar-DZ")+" | "+x.grantId)).join(""):
 '<p class="hint">السجل فارغ.</p>')+'</section>';
}
function refillResources(){
 const form=$("exception-form");if(!form)return;
 const data=resourceOptions(form.elements.capability.value,form.elements.granteeId.value);
 form.elements.resourceId.innerHTML=data.length?data.map(x=>'<option value="'+escapeText(x.id)+'">'+
 escapeText(x.label)+'</option>').join(""):'<option value="">لا توجد موارد مؤهلة</option>';
}
function render(){
 const account=$("demo-account");
 if(!account.options.length)account.innerHTML=DEMO_USERS.map(x=>
  '<option value="'+escapeText(x.id)+'">'+escapeText(x.name)+'</option>').join("");
 account.value=user.id;
 $("district-title").textContent="مقاطعة العمل المعتمدة: "+districtLabel(user.districtId);
 $("page-title").textContent=labels[route]||labels.dashboard;
 document.querySelectorAll(".nav [data-route]").forEach(b=>{
  b.hidden=(b.dataset.route==="exceptions"&&!user.isAdmin)||
   (b.dataset.route==="approvals"&&!user.reviewer);
  const active=b.dataset.route===route||(route==="prepare"&&b.dataset.route==="tasks");
  b.classList.toggle("active",active);b.setAttribute("aria-current",active?"page":"false");
 });
 if(!user.approved||!user.districtId){
  $("content").innerHTML='<section class="card"><h2>الحساب غير مؤهل للمشاركة</h2>'+
   '<p>يجب اعتماد الحساب وتوثيق مقاطعة العمل أولًا. لا يُعرض دليل المؤسسات أو الزملاء المشترك.</p></section>';
  return;
 }
 $("content").innerHTML=({dashboard,tasks,prepare:prep,private:privateView,
  institutions,colleagues,approvals,exceptions}[route]||dashboard)();
 if(route==="exceptions")refillResources();
}
$("demo-account").addEventListener("change",event=>{
 user=userBy(event.target.value)||DEMO_USERS[1];route="dashboard";
 activeId=null;message("");location.hash=route;render();
});
document.querySelectorAll(".nav [data-route]").forEach(b=>
 b.addEventListener("click",()=>go(b.dataset.route)));
window.addEventListener("hashchange",()=>{
 const dest=location.hash.replace(/^#/,"");
 if(labels[dest]&&dest!=="prepare"&&dest!==route)go(dest);
});
$("reset-demo").addEventListener("click",()=>{
 if(!confirm("إزالة بيانات التجربة الاصطناعية من هذا المتصفح؟"))return;
 state=initialDemoState();activeId=null;store();message("أعيد ضبط النموذج.");go("dashboard");
});
$("content").addEventListener("change",event=>{
 if(["grant-grantee","grant-capability"].includes(event.target.id))refillResources();
});
$("content").addEventListener("input",event=>{
 const form=event.target.closest?.("#preparation-form");if(!form||!activeId)return;
 try{
  state=upsertPreparation(state,user,Object.fromEntries(new FormData(form).entries()),activeId);
  if(store()){
   const p=personalPreparations(state,user).find(x=>x.id===activeId);
   const label=$("autosave-status");
   if(label)label.textContent="حفظ تلقائي محلي: "+new Date(p.updatedAt).toLocaleString("ar-DZ")+
    " — مراجعة "+p.revision;
  }
 }catch(err){message(err.message,true)}
});
$("content").addEventListener("submit",event=>{
 const form=event.target;
 if(form.id==="private-form"){
  event.preventDefault();
  try{state=addPrivateRecord(state,user,Object.fromEntries(new FormData(form).entries()),uid());
   store();message("حُفظ السجل الخاص؛ لم يُنشر للآخرين.");render();
  }catch(err){message(err.message,true)}
 }
 if(form.id==="exception-form"){
  event.preventDefault();
  try{
   const data=Object.fromEntries(new FormData(form).entries());
   data.expiresAt=new Date(Date.now()+Number(data.days)*86400000).toISOString();
   state=grantException(state,user,data,uid());store();
   message("مُنح الاستثناء المحدد وسُجّل في سجل التدقيق التجريبي.");render();
  }catch(err){message(err.message,true)}
 }
});
$("content").addEventListener("click",event=>{
 const button=event.target.closest?.("[data-action]");
 if(!button)return;
 const action=button.dataset.action,target=button.dataset.id;
 try{
  if(labels[action])return go(action);
  if(action==="new-preparation"){
   const newId=uid();state=upsertPreparation(state,user,{title:"مهمة قيد التحضير"},newId);
   store();activeId=newId;message("تم إنشاء تحضير، ويُحفظ تلقائيًا عند الكتابة.");return go("prepare");
  }
  if(action==="open-preparation"){
   if(!personalPreparations(state,user).some(x=>x.id===target))
    throw Error("هذا التحضير ليس ملكًا لهذا الحساب.");
   activeId=target;message("استُعيد التحضير السابق دون إعادة إدخال البيانات.");return go("prepare");
  }
  if(action==="request-publication"){
   state=requestPublication(state,user,target,uid());store();
   message("أُرسل طلب النشر؛ وبقي السجل الخاص محفوظًا.");return render();
  }
  if(action==="approve"||action==="reject"){
   const approve=action==="approve";
   const reason=prompt(approve?"تعليل الاعتماد (اختياري):":"أدخل سبب الرفض:");
   if(reason===null)return;
   state=decidePublication(state,user,target,approve?"approved":"rejected",reason);
   store();message(approve?"نُشرت المؤسسة ضمن مقاطعة العمل فقط.":"رُفض النشر دون حذف بيانات المفتش.");return render();
  }
  if(action==="revoke"){
   if(!confirm("هل تريد سحب هذا الاستثناء؟"))return;
   state=revokeException(state,user,target);store();
   message("سُحب الاستثناء وسُجلت واقعة السحب.");return render();
  }
 }catch(err){message(err.message,true)}
});
const starting=location.hash.replace(/^#/,"");
if(labels[starting]&&starting!=="prepare"&&starting!=="exceptions"&&starting!=="approvals")route=starting;
render();
