import {GROUPS,RUBRICS,suggestedWeights,validateWeights,sameWeightProfile}
 from "../prototypes/titularisation-workbench/engine.mjs";

/* P1: Production owner-only titularisation workbench.
 * Imports no QA credentials, member accounts or test data. The PostgreSQL
 * owner policies and catalog-checking RPC are the authority, not this UI. */
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const clean=s=>String(s??"").trim();
const html=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
let tasks=[],institutions=[],selected="",error="";
const missionFormDraft={title:"",rubric:RUBRICS.grouped5.id,institutionId:""};
const missionFieldIds=Object.freeze({
 "prod-tit-title":"title",
 "prod-tit-rubric":"rubric",
 "prod-tit-institution":"institutionId"
});
export function rememberMissionFormField(id,value){
 const field=missionFieldIds[id];
 if(field)missionFormDraft[field]=String(value??"");
}
function rememberMissionForm(form){
 for(const field of Object.values(missionFieldIds))
  missionFormDraft[field]=String(form?.[field]??"");
}
function clearMissionForm(){
 missionFormDraft.title="";
 missionFormDraft.rubric=RUBRICS.grouped5.id;
 missionFormDraft.institutionId="";
}
const weightDrafts=new Map();
const rubricLabels={
 [RUBRICS.grouped5.id]:"خمسة معايير",
 [RUBRICS.inspector10.id]:"عشرة عناصر",
 [RUBRICS.analytical14.id]:"14 مؤشرًا ضمن خمسة معايير"
};
function isAnalytical(mission){return mission?.rubric_id===RUBRICS.analytical14.id}
function weightsPinned(mission){
 return isAnalytical(mission)&&mission.rubric_profile?.frozen===true&&
  validateWeights(mission.rubric_profile.weights).valid;
}
function weightForm(mission){
 if(!isAnalytical(mission))return "";
 if(weightsPinned(mission)){
  const lines=GROUPS.map(group=>
   '<details><summary>'+html(group.label+' — '+group.cap+' نقاط')+'</summary>'+
   group.items.map(item=>'<p>'+html(item.label)+': <strong>'+
    html(mission.rubric_profile.weights[item.id])+'</strong></p>').join("")+
   '</details>').join("");
  return '<section class="portal-widget"><h3>ملف أوزان المؤشرات الأربعة عشر</h3>'+
   '<p class="cloud-tip">الأوزان مثبتة على الخادم لهذه المهمة، ولن يغيرها فتح المحرر أو إعادة تحميله.</p>'+
   lines+'</section>';
 }
 const weights=weightDrafts.get(mission.id)||suggestedWeights();
 const groups=GROUPS.map(group=>
  '<details open><summary><strong>'+html(group.label)+' — مجموع '+group.cap+' نقاط</strong></summary>'+
  '<div class="portal-form-grid">'+group.items.map(item=>
   '<label>'+html(item.label)+
   '<input type="number" dir="ltr" inputmode="decimal" min="0" max="'+group.cap+
   '" step="0.5" data-prod-tit-weight="'+html(item.id)+'" value="'+html(weights[item.id]??'')+'"></label>'
  ).join("")+'</div></details>').join("");
 return '<section class="portal-widget" aria-label="توزيع أوزان المؤشرات الأربعة عشر">'+
  '<h3>توزيع أوزان المؤشرات الأربعة عشر</h3>'+
  '<p>حدد الأوزان أولًا قبل فتح محرر التقرير. مجموع المجموعات: 12 و8 و8 و6 و6، والوزن لكل مؤشر غير سالب وبمضاعفات 0.5. القيم المقترحة قابلة للتعديل.</p>'+
  '<p class="portal-template-warning">الأوزان تثبت لهذه المهمة مرة واحدة ولا يمكن تغييرها بعد التأكيد. لا يُنشأ حساب عضو ولا تُصدَر روابط بهذه العملية.</p>'+
  groups+
  '<div class="portal-actions"><button type="button" class="btn primary" data-cloud-action="prod-tit-freeze" data-mission-id="'+html(mission.id)+'">تحقق من الأوزان وثبتها للمهمة</button></div>'+
  '</section>';
}
const requested=new URLSearchParams(typeof location!=="undefined"?location.search:"").get("titularisation");
export function currentTaskId(){return selected}
export function choose(id){
 selected=tasks.some(t=>t.id===id)?id:"";
}
export async function refresh(get){
 try{
  const [m,r]=await Promise.all([
   get("titularisation_missions",{
    select:"id,title,rubric_id,rubric_profile,institution_resource_id,institution_name_snapshot,status,created_at",
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
   html(m.title+' — '+(m.status==="draft"?'جارية':'مغلقة')+
    (isAnalytical(m)&&!weightsPinned(m)?' · الأوزان لم تثبت بعد':''))+'</option>').join("")+'</select></label>';
  if(active){
   output+='<p>المؤسسة: <strong>'+html(active.institution_name_snapshot)+
    '</strong> · الشبكة: '+html(rubricLabels[active.rubric_id]||active.rubric_id)+'</p>';
   if(active.status==="draft"&&(!isAnalytical(active)||weightsPinned(active)))
    output+='<div class="portal-actions"><button type="button" class="btn primary" data-cloud-action="prod-tit-open" data-mission-id="'+html(active.id)+'">فتح التقرير والمحضر واستئناف المسودة</button></div>';
   if(active.status==="draft"&&isAnalytical(active)&&!weightsPinned(active))
    output+='<p class="cloud-warning">هذه المهمة تنتظر تثبيت أوزان المؤشرات الأربعة عشر قبل فتح التقرير والمحضر.</p>';
  }
 }else output+='<p>لا توجد مهمات ترسيم مسجلة في حسابك حتى الآن.</p>';
 output+='<div class="portal-actions"><button type="button" class="btn subtle" data-cloud-action="prod-tit-refresh">تحديث المهمات والمؤسسات</button></div></section>'+
 (active?.status==="draft"&&isAnalytical(active)?weightForm(active):"")+
 '<section class="portal-widget"><details '+(!ordered.length?'open':'')+'><summary><strong>إنشاء مهمة ترسيم جديدة</strong></summary>'+
 '<p>تُعرض المؤسسات المنشورة التي تسمح بها مقاطعتك أو منحك المهنية. لا تُنشأ سجلات مؤسسات مكررة.</p>'+
 '<div class="portal-form-grid"><label>عنوان المهمة<input id="prod-tit-title" type="text" maxlength="200" value="'+html(missionFormDraft.title)+'" placeholder="ترسيم أستاذ — المؤسسة — التاريخ"></label>'+
 '<label>شبكة التقييم<select id="prod-tit-rubric">'+
 Object.entries(rubricLabels).map(([id,label])=>
 '<option value="'+html(id)+'"'+(id===missionFormDraft.rubric?' selected':'')+'>'+
  html(label)+(id===RUBRICS.analytical14.id?' — بأوزان يحددها المفتش':'')+'</option>').join("")+
 '</select></label>'+
 '<label>المؤسسة<select id="prod-tit-institution"><option value="">— اختر المؤسسة —</option>'+
 institutions.map(r=>'<option value="'+html(r.id)+'"'+
  (r.id===missionFormDraft.institutionId?' selected':'')+'>'+
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
 rememberMissionForm(form);
 const title=clean(form?.title);
 const rubric=clean(form?.rubric);
 const institutionId=clean(form?.institutionId);
 if(title.length<3||title.length>200)
  throw Error("عنوان المهمة مطلوب ويجب أن يتكون من 3 إلى 200 حرف.");
 if(!Object.hasOwn(rubricLabels,rubric))
  throw Error("شبكة التقييم غير معروفة؛ اختر إحدى الشبكات الثلاث.");
 // Only syntactic shape is checked in the browser. The server is the single
 // authority for district access and the published-institution relationship.
 // A stale local catalog must not reject a legitimate selected resource UUID.
 if(!UUID.test(institutionId))
  throw Error("لم يُلتقط معرّف المؤسسة المختارة. أعد اختيار المؤسسة من القائمة.");
 const id=await raw("POST","/rest/v1/rpc/create_titularisation_mission",{
  p_title:title,p_rubric_id:rubric,p_institution_resource_id:institutionId
 },true);
 if(typeof id!=="string"||!UUID.test(id))
  throw Error("لم يؤكد الخادم إنشاء المهمة. حدّث قائمة المهمات قبل إعادة المحاولة.");
 selected=id;
 clearMissionForm();
 await refresh(get);
 if(!tasks.some(m=>m.id===id))
  throw Error("أُنشئت المهمة لكن لم نتمكن من استرجاعها. حدّث القائمة؛ لا تنشئ نسخة ثانية.");
 return id;
}
export function rememberWeights(missionId,weights){
 if(tasks.some(t=>t.id===missionId&&isAnalytical(t)&&!weightsPinned(t)))
  weightDrafts.set(missionId,weights);
}
export async function freeze(raw,get,missionId,weights){
 const task=tasks.find(t=>t.id===missionId&&t.status==="draft"&&isAnalytical(t));
 if(!task||weightsPinned(task))throw Error("لا يمكن تعديل ملف الأوزان في هذه المهمة.");
 // Retain the inspector's input if the server rejects it or the user cancels
 // confirmation. The server revalidates all values, caps, and ownership.
 weightDrafts.set(missionId,weights);
 const checked=validateWeights(weights);
 if(!checked.valid)throw Error(checked.errors.join("؛ "));
 const pinned=await raw("POST","/rest/v1/rpc/freeze_titularisation_analytical_weights",{
  p_mission_id:missionId,p_weights:weights
 },true);
 if(!sameWeightProfile(pinned,{weights,frozen:true}))
  throw Error("لم يؤكد الخادم تثبيت ملف الأوزان. حدّث المهمة للتحقق قبل إعادة المحاولة.");
 weightDrafts.delete(missionId);
 await refresh(get);
 if(!tasks.some(t=>t.id===missionId&&weightsPinned(t)))
  throw Error("أكد الخادم التثبيت، لكن تعذّر إعادة قراءة المهمة؛ حدّث القائمة قبل المتابعة.");
 return pinned;
}
export function open(id){
 if(!UUID.test(id)||!tasks.some(t=>t.id===id&&t.status==="draft"&&
   (!isAnalytical(t)||weightsPinned(t))))
  throw Error("المهمة غير متاحة لحساب المفتش الحالي.");
 // UUID is a locator, not an access credential. RLS enforces ownership.
 window.location.assign("./titularisation/report/?mission="+encodeURIComponent(id));
}
