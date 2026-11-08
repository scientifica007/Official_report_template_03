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
let committeeSeats=[],committeeContributions=[],committeeError="",issued=null;
const seatCodes=["member1","member2","member3"];
const seatLabels={member1:"العضو الأول",member2:"العضو الثاني",member3:"العضو الثالث"};
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
let scopedInspectorId="";
export function syncInspectorScope(id){
 const next=UUID.test(String(id||""))?String(id):"";
 if(scopedInspectorId===next)return;
 scopedInspectorId=next;
 tasks=[];institutions=[];selected="";error="";committeeSeats=[];committeeContributions=[];issued=null;committeeError="";
 weightDrafts.clear();
 clearMissionForm();
}
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
function committeeSection(mission){
 const ready=mission.status==="draft"&&(!isAnalytical(mission)||weightsPinned(mission));
 let out='<section class="portal-widget" id="prod-tit-committee"><h3>لجنة الترسيم — ثلاثة مقاعد مرتبطة بالمهمة</h3>'+
  '<p>هذه المقاعد والمساهمات تخص المهمة الإنتاجية نفسها. لكل عضو رابط مباشر خاص، صالح سبعة أيام بحد أقصى؛ إعادة إصدار الرابط تلغي السابق دون حذف المساهمات. كل العلامات مطلوبة عند الإرسال النهائي؛ الملاحظات اختيارية، والتصحيحات تحفظ المراجعة السابقة.</p>';
 if(committeeError)out+='<p class="cloud-warning">'+html(committeeError)+'</p>';
 if(!ready)out+='<p class="cloud-warning">ثبّت شبكة المؤشرات أولًا قبل إصدار دعوات أعضاء اللجنة.</p>';
 out+='<div class="portal-form-grid">';
 for(const code of seatCodes){
  const row=committeeSeats.find(x=>x.seat_code===code);
  const contrib=committeeContributions.find(x=>x.seat_code===code);
  const active=row?.status==="active"&&Date.parse(row.expires_at||0)>Date.now();
  const status=contrib?.status==="submitted"?"مرسلة — مراجعة "+contrib.revision:
   contrib?.status==="draft"?"مسودة محفوظة — مراجعة "+contrib.revision:"لم تُحفظ مساهمة بعد";
  out+='<div class="portal-widget" style="margin:0"><h4>'+seatLabels[code]+'</h4>'+
   '<p>حالة الرابط: '+html(active?"نشط حتى "+new Date(row.expires_at).toLocaleString("ar-DZ"):
    row?.status==="revoked"?"ملغى":row?.status==="active"?"منتهي":"لم يُصدر")+
    '</p><p>المساهمة: '+html(status)+'</p>'+
   '<p>اسم العرض الحالي: '+html(row?.display_name||"غير محدد")+'</p>'+
   '<label>الاسم<input id="prod-tit-seat-given-'+code+'" maxlength="100" value="'+html(row?.given_name||"")+'"></label>'+
   '<label>اللقب<input id="prod-tit-seat-family-'+code+'" maxlength="100" value="'+html(row?.family_name||"")+'"></label>'+
   '<label>الصفة المهنية<input id="prod-tit-seat-role-'+code+'" maxlength="160" value="'+html(row?.member_role||"")+'"></label>'+
   '<div class="portal-actions"><button class="btn subtle" type="button" data-cloud-action="prod-tit-save-seat-identity" data-seat="'+code+'" data-mission-id="'+html(mission.id)+'">حفظ بيانات العضو</button></div>'+
   (ready?'<div class="portal-actions"><button class="btn primary" type="button" data-cloud-action="prod-tit-issue-seat" data-seat="'+code+'" data-mission-id="'+html(mission.id)+'">'+
     (active?"إعادة إصدار الرابط":"إصدار رابط العضو")+'</button>'+
     (active?'<button class="btn subtle" type="button" data-cloud-action="prod-tit-revoke-seat" data-seat="'+code+'" data-mission-id="'+html(mission.id)+'">إلغاء الرابط</button>':"")+
     '</div>':"")+'</div>';
 }
 out+='</div>';
 if(issued?.missionId===mission.id){
  out+='<section class="portal-widget"><h4>الرابط الجديد — '+seatLabels[issued.seat]+'</h4>'+
   '<p class="cloud-tip">انسخ الرابط أو اطبع بطاقة الدعوة. الرابط سري ولا يُعرض مجددًا بعد مغادرة الصفحة؛ يمكنك إصدار رابط جديد عند الحاجة دون فقد المساهمات.</p>'+
   '<label>رابط العضو المباشر<input id="prod-tit-issued-url" readonly dir="ltr" value="'+html(issued.url)+'"></label>'+
   '<div class="portal-actions"><button class="btn subtle" type="button" data-cloud-action="prod-tit-copy-link">نسخ الرابط</button>'+
   '<button class="btn subtle" type="button" data-cloud-action="prod-tit-download-invite">تنزيل بطاقة QR وPDF</button></div></section>';
 }
 out+='</section>';return out;
}
export function currentIssuedInvitation(){
 if(!issued||issued.missionId!==selected)return null;
 return {...issued,title:tasks.find(m=>m.id===selected)?.title||"مهمة ترسيم"};
}

const requested=new URLSearchParams(typeof location!=="undefined"?location.search:"").get("titularisation");
export function currentTaskId(){return selected}
export function choose(id){
 const next=tasks.some(t=>t.id===id)?id:"";
 if(next!==selected)issued=null;
 selected=next;
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
  if(issued?.missionId!==selected)issued=null;
  committeeSeats=[];committeeContributions=[];committeeError="";
  if(selected){
   try{
    const [sr,cr]=await Promise.all([
     get("titularisation_seats",{
      select:"mission_id,seat_code,display_name,given_name,family_name,member_role,status,expires_at,revoked_at",
      mission_id:"eq."+selected,order:"seat_code.asc",limit:"3"
     }),
     get("titularisation_contributions",{
      select:"mission_id,seat_code,status,revision,submitted_at",
      mission_id:"eq."+selected,order:"seat_code.asc",limit:"3"
     })
    ]);
    committeeSeats=(Array.isArray(sr)?sr:[]).filter(row=>
     row.mission_id===selected&&seatCodes.includes(row.seat_code));
    committeeContributions=(Array.isArray(cr)?cr:[]).filter(row=>
     row.mission_id===selected&&seatCodes.includes(row.seat_code));
   }catch(e){committeeError="تعذر تحميل مساهمات اللجنة: "+(e?.message||"خطأ اتصال")}
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
 (active?.status==="draft"?committeeSection(active):"")+
 '<section class="portal-widget"><details '+(!ordered.length?'open':'')+'><summary><strong>إنشاء مهمة ترسيم جديدة</strong></summary>'+
 '<p>تُعرض المؤسسات المنشورة التي تسمح بها مقاطعتك أو منحك المهنية. لا تُنشأ سجلات مؤسسات مكررة.</p>'+
 '<div class="portal-form-grid"><label>عنوان المهمة<input id="prod-tit-title" type="text" maxlength="200" value="'+html(missionFormDraft.title)+'" placeholder="ترسيم أستاذ — المؤسسة — التاريخ"></label>'+
 '<label>شبكة التقييم<select id="prod-tit-rubric">'+
 Object.entries(rubricLabels).map(([id,label])=>
 '<option value="'+html(id)+'"'+(id===missionFormDraft.rubric?' selected':'')+'>'+
  html(id===RUBRICS.analytical14.id?'14 مؤشرًا — بأوزان يحددها المفتش':label)+'</option>').join("")+
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
 '<p>تحضير المهمة ← توزيع مقاعد اللجنة وإصدار روابطها ← استلام مساهمات الأعضاء ← مراجعة المفتش وتركيب التقديرات ← حفظ وإصدار التقرير والمحضر في نفس المهمة.</p>'+
 '<p class="portal-template-warning">حسابات وروابط المختبر QA مستقلة تمامًا؛ استخدم روابط الأعضاء التي تصدرها المهمة الإنتاجية هنا فقط.</p>'+
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
export async function saveSeatIdentity(raw,get,missionId,seat,given,family,role){
 if(!seatCodes.includes(seat)||!tasks.some(m=>m.id===missionId&&m.status==="draft"))
  throw Error("المهمة أو المقعد غير متاحين.");
 const first=clean(given),last=clean(family),capacity=clean(role);
 if(first.length>100||last.length>100||capacity.length>160)
  throw Error("تجاوز الاسم أو اللقب أو الصفة الحد المسموح.");
 const confirmed=await raw("POST","/rest/v1/rpc/set_prod_titularisation_seat_identity",{
  p_mission_id:missionId,p_seat_code:seat,p_given_name:first,p_family_name:last,p_member_role:capacity
 },true);
 if(confirmed!==true)throw Error("تعذر تأكيد حفظ بيانات العضو.");
 await refresh(get);
 return true;
}
export async function issueSeat(raw,get,missionId,seat,name){
 if(!seatCodes.includes(seat)||!tasks.some(m=>m.id===missionId&&m.status==="draft"&&
   (!isAnalytical(m)||weightsPinned(m))))throw Error("مقعد أو مهمة غير صالحين.");
 const displayName=clean(name);
 if(displayName.length>160)throw Error("اسم العضو أطول من 160 حرفًا.");
 const result=await raw("POST","/rest/v1/rpc/issue_prod_titularisation_invitation",{
  p_mission_id:missionId,p_seat_code:seat,p_display_name:displayName
 },true);
 if(!/^[a-f0-9]{64}$/.test(result?.token||"")||result.seat_code!==seat||
  !Number.isFinite(Date.parse(result?.expires_at||"")))
  throw Error("لم يؤكد الخادم إصدار رابط العضو.");
 const url=new URL("./titularisation/member/?mission="+encodeURIComponent(missionId)+
  "&seat="+encodeURIComponent(seat),window.location.href);
 url.hash="access="+result.token;
 issued={missionId,seat,url:url.href,expiresAt:result.expires_at};
 await refresh(get);
 return currentIssuedInvitation();
}
export async function revokeSeat(raw,get,missionId,seat){
 if(!seatCodes.includes(seat)||!tasks.some(m=>m.id===missionId))throw Error("مقعد غير معروف.");
 const ok=await raw("POST","/rest/v1/rpc/revoke_prod_titularisation_invitation",{
  p_mission_id:missionId,p_seat_code:seat
 },true);
 if(ok!==true)throw Error("لم يؤكد الخادم إلغاء الرابط.");
 if(issued?.missionId===missionId&&issued.seat===seat)issued=null;
 await refresh(get);
 return true;
}
export function open(id){
 if(!UUID.test(id)||!tasks.some(t=>t.id===id&&t.status==="draft"&&
   (!isAnalytical(t)||weightsPinned(t))))
  throw Error("المهمة غير متاحة لحساب المفتش الحالي.");
 // UUID is a locator, not an access credential. RLS enforces ownership.
 window.location.assign("./titularisation/report/?mission="+encodeURIComponent(id));
}
