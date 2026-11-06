/* P1: Production owner-only titularisation workbench.
 * Imports no QA credentials, member accounts or test data. The PostgreSQL
 * owner policies and catalog-checking RPC are the authority, not this UI. */
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const clean=s=>String(s??"").trim();
const html=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
let tasks=[],institutions=[],selected="",error="";
const requested=new URLSearchParams(location.search).get("titularisation");
export function currentTaskId(){return selected}
export function choose(id){
 selected=tasks.some(t=>t.id===id)?id:"";
}
export async function refresh(get){
 try{
  const [m,r]=await Promise.all([
   get("titularisation_missions",{
    select:"id,title,rubric_id,institution_resource_id,institution_name_snapshot,status,created_at",
    order:"created_at.desc",limit:"150"
   }),
   get("district_published_resources",{
    select:"id,title,code,wilaya,resource_kind,publication_status",
    resource_kind:"eq.institution",publication_status:"eq.published",
    order:"title.asc",limit:"250"
   })
  ]);
  if(!Array.isArray(m)||!Array.isArray(r))throw Error("استجابة غير صالحة");
  tasks=m;
  // The response itself is already filtered by RLS. Never use a broader
  // unscoped institutions list to decide which resource can be bound.
  institutions=r.filter(x=>x.resource_kind==="institution"&&
   x.publication_status==="published"&&UUID.test(x.id));
  if(!tasks.some(t=>t.id===selected)){
   selected=UUID.test(requested||"")&&tasks.some(t=>t.id===requested)?
    requested:tasks[0]?.id||"";
  }
  error="";
 }catch(e){
  error="تعذر تحديث مهمات الترسيم والمؤسسات المتاحة: "+(e?.message||"خطأ اتصال");
  tasks=[];institutions=[];
 }
}
export function render({profile}){
 let output='<div class="portal-page-heading"><h2>ترسيم أستاذ — فضاء المفتش</h2>'+
  '<p>أنشئ المهمة من حسابك الأصلي، واختر مؤسسة متاحة لمقاطعتك، ثم تابع مسودة التقرير والمحضر المرتبطة بالمهمة نفسها.</p></div>';
 if(profile?.is_admin)return output+
  '<p class="cloud-warning">مسار الترسيم مخصص لحساب المفتش المهني، وليس لحساب إدارة الموقع.</p>';
 if(error)output+='<p class="cloud-warning">'+html(error)+'</p>';
 const ordered=[...tasks].sort((a,b)=>(a.status==="draft"?0:1)-
  (b.status==="draft"?0:1)||Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
 const active=tasks.find(t=>t.id===selected);
 output+='<section class="portal-widget"><h3>مهمات الترسيم الجارية والمحفوظة ('+ordered.length+')</h3>'+
  '<p>هذه مهمات إنتاج مرتبطة بحسابك، ولا تختلط بمهمات مختبر QA.</p>';
 if(ordered.length){
  output+='<label>اختر المهمة<select id="prod-tit-select">'+ordered.map(m=>
   '<option value="'+html(m.id)+'"'+(m.id===selected?' selected':'')+'>'+
   html(m.title+' — '+(m.status==="draft"?'جارية':'مغلقة'))+'</option>').join("")+'</select></label>';
  if(active){
   output+='<p>المؤسسة: <strong>'+html(active.institution_name_snapshot)+
    '</strong> · الشبكة: '+html(active.rubric_id)+'</p>';
   if(active.status==="draft")output+='<div class="portal-actions"><button type="button" class="btn primary" data-cloud-action="prod-tit-open" data-mission-id="'+html(active.id)+'">فتح التقرير والمحضر واستئناف المسودة</button></div>';
  }
 }else output+='<p>لا توجد مهمات ترسيم مسجلة في حسابك حتى الآن.</p>';
 output+='<div class="portal-actions"><button type="button" class="btn subtle" data-cloud-action="prod-tit-refresh">تحديث المهمات والمؤسسات</button></div></section>'+
 '<section class="portal-widget"><details '+(!ordered.length?'open':'')+'><summary><strong>إنشاء مهمة ترسيم جديدة</strong></summary>'+
 '<p>تُعرض المؤسسات المنشورة التي تسمح بها مقاطعتك أو منحك المهنية. لا تُنشأ سجلات مؤسسات مكررة.</p>'+
 '<div class="portal-form-grid"><label>عنوان المهمة<input id="prod-tit-title" type="text" maxlength="200" placeholder="ترسيم أستاذ — المؤسسة — التاريخ"></label>'+
 '<label>شبكة التقييم<select id="prod-tit-rubric"><option value="lesson_grouped_5_v1">خمسة معايير</option>'+
 '<option value="lesson_inspector_10_v1">عشرة عناصر</option></select></label>'+
 '<label>المؤسسة<select id="prod-tit-institution"><option value="">— اختر المؤسسة —</option>'+
 institutions.map(r=>'<option value="'+html(r.id)+'">'+
  html(r.title+' ('+r.code+') — '+r.wilaya)+'</option>').join("")+
 '</select></label></div>'+
 (institutions.length?
 '<button type="button" class="btn primary" data-cloud-action="prod-tit-create">إنشاء المهمة وربطها بالمؤسسة</button>':
 '<p class="cloud-warning">لا توجد مؤسسة منشورة متاحة ضمن صلاحيات هذا الحساب. يمكن للمسؤول إدراج مؤسستك أو منحك الوصول إليها.</p>')+
 '</details></section>'+
 '<section class="portal-widget"><h3>خطوات الترسيم ضمن النظام الموحد</h3>'+
 '<p>هذه المرحلة تدعم إنشاء المهمة، اختيار المؤسسة، حفظ واستئناف مسودة التقرير والمحضر وإصدارهما من محرك الوثائق نفسه.</p>'+
 '<p class="portal-template-warning">روابط أعضاء اللجنة والتقييمات التشاركية لا تزال في بيئة QA الاختبارية، ولا يمكن ربطها بمهمة الإنتاج في هذه المرحلة. لا تستخدم بيانات إنتاج في QA.</p>'+
 '</section>';
 return output;
}
export async function create(raw,get,form){
 const title=clean(form.title);
 const rubric=clean(form.rubric);
 const institutionId=clean(form.institutionId);
 if(title.length<3||title.length>200||
  !["lesson_grouped_5_v1","lesson_inspector_10_v1"].includes(rubric)||
  !institutions.some(r=>r.id===institutionId))
  throw Error("أدخل عنوان المهمة واختر الشبكة والمؤسسة المصرح بها.");
 const id=await raw("POST","/rest/v1/rpc/create_titularisation_mission",{
  p_title:title,p_rubric_id:rubric,p_institution_resource_id:institutionId
 },true);
 if(typeof id!=="string"||!UUID.test(id))
  throw Error("لم يؤكد الخادم إنشاء المهمة.");
 selected=id;
 await refresh(get);
 if(!tasks.some(m=>m.id===id))
  throw Error("أُنشئت المهمة لكن لم نتمكن من استرجاعها. حدّث القائمة؛ لا تنشئ نسخة ثانية.");
 return id;
}
export function open(id){
 if(!UUID.test(id)||!tasks.some(t=>t.id===id&&t.status==="draft"))
  throw Error("المهمة غير متاحة لحساب المفتش الحالي.");
 // UUID is a locator, not an access credential. RLS enforces ownership.
 window.location.assign("./titularisation/report/?mission="+encodeURIComponent(id));
}
