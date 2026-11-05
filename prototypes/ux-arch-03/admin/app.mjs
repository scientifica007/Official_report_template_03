import {startSession,getUser,read,rpc,sessionId,isId} from "./api.mjs?v=uxarch03a";
import {esc,viewDistricts,viewInspectors,viewInstitutions,viewRequests} from "./views.mjs?v=uxarch03a";
const $=id=>document.getElementById(id);
let profile=null,page="districts",busy=false,db={
 districts:[],profiles:[],resources:[],assignments:[],legacy:[],requests:[]
};
const pageTitles={
 districts:"المقاطعات والرموز",inspectors:"حسابات المفتشين",
 institutions:"المؤسسات وتوزيعها",requests:"طلبات نشر المؤسسات"
};
function message(value,error=false){
 const el=$("notice");el.textContent=value||"";
 el.classList.toggle("error",error);
}
async function verifyAdmin(){
 const auth=await getUser();
 if(!auth?.id||auth.id!==sessionId())throw Error("جلسة المستخدم غير مطابقة.");
 const profiles=await read("inspector_profiles",{
  select:"id,first_name,last_name,approved,account_status,is_admin",
  id:"eq."+auth.id,limit:1
 });
 const p=profiles?.[0];
 if(!p?.is_admin||!p.approved||p.account_status!=="approved")
  throw Error("هذا الفضاء لحساب Admin المعتمد فقط. سجّل الدخول بحساب إدارة الموقع، وليس حساب المفتش.");
 profile=p;
 $("signed-in").textContent="Admin — "+[p.first_name,p.last_name].filter(Boolean).join(" ");
}
async function load(){
 const results=await Promise.all([
  read("work_districts",{select:"id,code,label,active",order:"label.asc"}),
  read("inspector_profiles",{select:
   "id,first_name,last_name,profession,district,work_district_id,approved,account_status,is_admin",
   order:"last_name.asc"}),
  read("district_published_resources",{select:
   "id,title,code,wilaya,publication_status,legacy_institution_id",order:"title.asc"}),
  read("district_resource_assignments",{select:"resource_id,work_district_id"}),
  read("shared_institutions",{select:"id,name,code,wilaya",order:"name.asc"}),
  read("district_publication_requests",{select:
   "id,author_id,status,proposed_payload,decision_reason,submitted_at",order:"submitted_at.desc"})
 ]);
 [db.districts,db.profiles,db.resources,db.assignments,db.legacy,db.requests]=results;
}
function draw(){
 $("page-heading").textContent=pageTitles[page];
 document.querySelectorAll("[data-page]").forEach(b=>{
  b.classList.toggle("active",b.dataset.page===page);
  b.setAttribute("aria-current",b.dataset.page===page?"page":"false");
 });
 $("content").innerHTML=({
  districts:viewDistricts,inspectors:viewInspectors,
  institutions:viewInstitutions,requests:viewRequests
 }[page]||viewDistricts)(db);
}
async function transact(operation){
 if(busy)return;
 busy=true;
 const buttons=$("content").querySelectorAll("button");
 buttons.forEach(b=>b.disabled=true);
 try{
  const feedback=await operation();
  await load();
  draw();
  message(feedback||"حُفظ التغيير في قاعدة البيانات.");
 }catch(e){
  message(e.message||"تعذر إتمام العملية.",true);
 }finally{
  busy=false;
  $("content").querySelectorAll("button").forEach(b=>b.disabled=false);
 }
}
function requireText(value,name,max){
 const t=String(value||"").trim();
 if(!t||t.length>max)throw Error(name+" مطلوب وبحد أقصى "+max+" حرفًا.");
 if(/[\u0000-\u001F\u007F]/u.test(t))throw Error(name+" يحتوي محارف تحكم غير مقبولة.");
 return t;
}
function chosenUuid(form,name){
 const s=form.elements[name]?.value;
 if(!isId(s))throw Error("اختر "+name+" صالحًا من القائمة.");
 return s;
}
document.querySelectorAll("[data-page]").forEach(b=>
 b.addEventListener("click",()=>{
  if(busy)return;
  page=b.dataset.page;message("");draw();
 }));
$("content").addEventListener("submit",event=>{
 event.preventDefault();
 const form=event.target;
 const kind=form.dataset.operation;
 if(!kind)return;
 const data=Object.fromEntries(new FormData(form).entries());
 transact(async()=>{
  if(kind==="district-create"){
   await rpc("ux_admin_create_work_district",{
    p_code:requireText(data.p_code,"رمز المقاطعة",100),
    p_label:requireText(data.p_label,"اسم المقاطعة",200)
   });
   return "أنشئت المقاطعة بالاسم والرمز اللذين اخترتهما.";
  }
  if(kind==="district-edit"){
   if(!isId(form.dataset.id))throw Error("تعذر تحديد المقاطعة.");
   await rpc("ux_admin_update_work_district",{
    p_district:form.dataset.id,
    p_code:requireText(data.p_code,"رمز المقاطعة",100),
    p_label:requireText(data.p_label,"اسم المقاطعة",200)
   });
   return "عُدّل الاسم والرمز دون تغيير انتماء أي مفتش أو مؤسسة.";
  }
  if(kind==="inspector-assign"){
   await rpc("ux_admin_assign_work_district",{
    p_inspector:chosenUuid(form,"p_inspector"),
    p_district:chosenUuid(form,"p_district"),
    p_reason:String(data.p_reason||"").trim().slice(0,500)
   });
   return "حُفظت مقاطعة عمل المفتش.";
  }
  if(kind==="institution-create"){
   await rpc("ux_admin_create_institution",{
    p_title:requireText(data.p_title,"اسم المؤسسة",250),
    p_code:String(data.p_code||"").trim().slice(0,80),
    p_wilaya:String(data.p_wilaya||"").trim().slice(0,120),
    p_initial_district:form.elements.p_initial_district.value?chosenUuid(form,"p_initial_district"):null
   });
   return "أنشئت مؤسسة واحدة. تستطيع الآن ربطها بمقاطعات إضافية.";
  }
  if(kind==="institution-import"){
   await rpc("ux_admin_import_legacy_institution",{
    p_legacy_id:chosenUuid(form,"p_legacy_id"),
    p_initial_district:form.elements.p_initial_district.value?chosenUuid(form,"p_initial_district"):null
   });
   return "أُدرجت المؤسسة القديمة في السجل المنشور مع الاحتفاظ بأصلها.";
  }
  if(kind==="institution-assign"){
   const ids=new FormData(form).getAll("p_districts");
   if(!ids.every(isId))throw Error("اختيار غير صالح للمقاطعات.");
   if(ids.length===0&&!confirm(
    "هل تريد إلغاء إتاحة هذه المؤسسة في جميع المقاطعات؟ لن تُحذف المؤسسة نفسها."))
    return "لم تتغير علاقات المؤسسة.";
   await rpc("ux_admin_set_institution_districts",{
    p_resource:form.dataset.id,p_districts:ids
   });
   return "حُفظت مقاطعات المؤسسة دون تكرار سجلها.";
  }
  throw Error("عملية غير مدعومة.");
 });
});
$("content").addEventListener("click",event=>{
 const b=event.target.closest?.("[data-action]");
 if(!b||!["approve","reject"].includes(b.dataset.action))return;
 const approving=b.dataset.action==="approve";
 const id=b.dataset.id;
 if(!isId(id))return message("تعذر تحديد طلب النشر.",true);
 const reason=prompt(approving?"ملاحظة الموافقة (اختيارية):":"ملاحظة الرفض (اختيارية):");
 if(reason===null)return;
 transact(async()=>{
  await rpc("ux_review_institution_request",{
   p_request:id,p_approve:approving,p_reason:reason.trim().slice(0,500)
  });
  return approving?"اعتمدت المؤسسة وأُتيحت في مقاطعة صاحب الطلب. يمكنك توزيعها لاحقًا.":"رُفض طلب النشر، مع الاحتفاظ بسجل المفتش الخاص.";
 });
});
async function start(){
 try{
  startSession();
  await verifyAdmin();
  await load();
  draw();
 }catch(e){
  $("page-heading").textContent="تعذر فتح الإدارة";
  document.querySelectorAll("[data-page]").forEach(b=>b.disabled=true);
  $("content").innerHTML='<section class="card"><h2>الوصول محصور بإدارة الموقع</h2><p>'+
   esc(e.message)+'</p><p><a href="../../../">تسجيل الدخول من المنصة الرئيسية</a></p></section>';
 }
}
start();
