// RLS-authorized inspector-only import bridge.
// QA sessions remain isolated from production, including after closing and
// deleting all temporary member Auth accounts.
import {restoreCommittee,freshCommittee} from "./committee-engine.mjs";
import {RUBRICS,validateWeights,sameWeightProfile} from "../titularisation-workbench/engine.mjs";
const cfg=()=>typeof window==="undefined"?{}:(window.REPORT03_CLOUD_CONFIG||{});
// Explicitly separate tenant flags. QA member accounts never point to production.
const productionWorkspace=()=>cfg().qaOnly!==true&&cfg().titularisationWorkspaceEnabled===true;
export const committeeCloudEnabled=()=>cfg().temporaryCommitteeEnabled===true||productionWorkspace();
const QA_SESSION="scientifica_committee_qa_session_v1";
let qaRefreshing=null;
async function inspectorToken(){
 if(cfg().qaOnly===true){
  let session;
  try{session=JSON.parse(sessionStorage.getItem(QA_SESSION)||"null")}catch(_){}
  if(!session?.access_token||!session?.refresh_token||!session?.userId)
   throw Error("افتح محرر التقرير من لوحة رئيس اللجنة بعد تسجيل الدخول إلى مشروع الاختبار.");
  if((session.expiresAt||0)>Date.now()+60000)return session.access_token;
  // Only one refresh request at a time. A refreshed token is never stored
  // in localStorage or sent to production.
  if(!qaRefreshing)qaRefreshing=(async()=>{
   const c=cfg();
   const res=await fetch(c.supabaseUrl.replace(/\/+$/,"")+
    "/auth/v1/token?grant_type=refresh_token",{
    method:"POST",headers:{"apikey":c.publishableKey,
    "Content-Type":"application/json"},
    body:JSON.stringify({refresh_token:session.refresh_token}),cache:"no-store"
   });
   const data=await res.json();
   if(!res.ok||!data.access_token||!data.refresh_token)
    throw Error("انتهت جلسة المفتش التجريبية. افتح لوحة رئيس اللجنة وسجل الدخول من جديد.");
   session.access_token=data.access_token;
   session.refresh_token=data.refresh_token;
   session.expiresAt=Date.now()+1000*Number(data.expires_in||3600);
   sessionStorage.setItem(QA_SESSION,JSON.stringify(session));
   return data.access_token;
  })().finally(()=>{qaRefreshing=null});
  return qaRefreshing;
 }
 let raw=null;
 try{raw=localStorage.getItem("official_report03_cloud_session_v1")||
  sessionStorage.getItem("official_report03_cloud_session_v1")}catch(_){}

 let data;try{data=JSON.parse(raw||"null")}catch(_){}
 if(!data?.access_token||!data?.user?.id||Date.now()>=(data.expires_at_ms||0)-60000)
  throw Error("سجل الدخول مجددًا إلى حساب المفتش المعتمد في المنصة الرئيسية.");
 return data.access_token;
}
async function read(table,params){
 if(!committeeCloudEnabled())throw Error("خدمة الحسابات المؤقتة غير مفعلة.");
 const c=cfg();
 if(!/^https:\/\//.test(c.supabaseUrl||"")||!c.publishableKey)
  throw Error("إعدادات الخدمة غير صالحة.");
 const bearer=await inspectorToken();
 const res=await fetch(c.supabaseUrl.replace(/\/+$/,"")+
  "/rest/v1/"+table+"?"+new URLSearchParams(params),{
  headers:{"apikey":c.publishableKey,"Authorization":"Bearer "+bearer,
   "Accept":"application/json"},cache:"no-store"
 });
 if(!res.ok)throw Error("تعذر جلب المساهمات أو لا تملك صلاحية الاطلاع ("+res.status+").");
 return res.json();
}
export async function listCloudCommitteeMissions(){
 return read("titularisation_missions",{
  select:"id,title,rubric_id,rubric_profile,status,expires_at",
  order:"created_at.desc",limit:"60"
 });
}
export async function loadCloudCommitteeSubmissions(id){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw Error("معرّف مهمة غير صالح.");
 const missions=await read("titularisation_missions",{
  select:productionWorkspace()?"id,title,rubric_id,rubric_profile,status,institution_resource_id,institution_name_snapshot":"id,title,rubric_id,rubric_profile,status",id:"eq."+id
 });
 if(missions.length!==1)throw Error("المهمة غير متاحة لحساب المفتش الحالي.");
 // P1 production pilot has no issued committee seats or contribution table.
 // Never read QA contribution records with a production token.
 if(productionWorkspace())return {mission:missions[0],rows:[]};
 const rows=await read("titularisation_contributions",{
  select:"seat_code,payload,status,revision,submitted_at",
  mission_id:"eq."+id,status:"eq.submitted",order:"seat_code.asc"
 });
 return {mission:missions[0],rows};
}
function deepClone(value){return JSON.parse(JSON.stringify(value))}
export function prepareCloudCommitteeDraft(mission){
 const key=Object.keys(RUBRICS).find(k=>RUBRICS[k].id===mission?.rubric_id);
 if(!key)throw Error("شبكة مهمة سحابية غير مدعومة في المحرر.");
 const state=freshCommittee("individual",key);
 if(key==="analytical14"){
  const profile=mission.rubric_profile;
  if(profile?.frozen!==true||!validateWeights(profile.weights).valid)
   throw Error("ملف أوزان المهمة غير مثبت أو غير صالح.");
  state.final.grading.profile=deepClone(profile);
  for(const m of Object.values(state.members))m.grading.profile=deepClone(profile);
 }
 return restoreCommittee(state);
}
export function mergeSubmittedCloudMembers(original,mission,rows){
 if(!mission||mission.rubric_id!==original.rubricId)
  throw Error("شبكة المهمة السحابية تختلف عن الشبكة الحالية.");
 if(!Array.isArray(rows))throw Error("مساهمات غير صالحة.");
 if(original.rubricId===RUBRICS.analytical14.id){
  if(mission.rubric_profile?.frozen!==true||
    !validateWeights(mission.rubric_profile.weights).valid||
    !sameWeightProfile(original.final.grading.profile,mission.rubric_profile))
   throw Error("ملف الأوزان الحالي لا يطابق الملف المثبت في المهمة.");
 }
 const copy=deepClone(original);
 copy.mode="individual";
 const applied=new Set();
 for(const row of rows){
  if(!["member1","member2","member3"].includes(row.seat_code)||
   applied.has(row.seat_code)||row.status!=="submitted"||
   !row.payload||typeof row.payload!=="object")
   throw Error("بيانات مساهمة غير موثوقة أو مكررة.");
  const {grading,notes}=row.payload;
  if(original.rubricId===RUBRICS.analytical14.id&&
   !sameWeightProfile(grading?.profile,mission.rubric_profile))
   throw Error("مساهمة تستخدم أوزانًا مختلفة عن المهمة.");
  // Member contributions do not overwrite chair's authored grades or prose.
  copy.members[row.seat_code]={grading,notes,submitted:true};
  applied.add(row.seat_code);
 }
 if(!applied.size)throw Error("لا توجد مساهمات مرسلة لاستيرادها.");
 copy.serial++;
 return {state:restoreCommittee(copy),seats:[...applied]};
}

/** M5.12: only the QA mission owner may retrieve synthesis source notes.
 * Member and arbitrary browser tokens cannot bypass server-side requireOwner.
 * No AI provider or production project receives the text.
 */
export async function loadInspectorSynthesisSources(missionId){
 const c=cfg();
 if(c.qaOnly!==true||c.temporaryCommitteeEnabled!==true||
    c.supabaseUrl!=="https://npxwshvcrowbfoiqyrwx.supabase.co")
  throw Error("التركيب الذكي متاح للمفتش في QA فقط.");
 if(!/^[0-9a-f-]{36}$/i.test(missionId))throw Error("معرّف المهمة غير صالح.");
 const token=await inspectorToken();
 const response=await fetch(c.supabaseUrl+"/functions/v1/titularisation-access",{
  method:"POST",cache:"no-store",referrerPolicy:"no-referrer",
  headers:{apikey:c.publishableKey,Authorization:"Bearer "+token,
   "Content-Type":"application/json",Accept:"application/json"},
  body:JSON.stringify({action:"synthesis_sources",mission_id:missionId})
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok)
  throw Error(String(data?.error||"ليست لديك صلاحية تركيب تقديرات هذه المهمة.")+
    " ("+response.status+")");
 if(data?.owner_only!==true||data?.qa_only!==true||
    data?.mission_id!==missionId||!Array.isArray(data.rows))
  throw Error("استجابة تركيب التقديرات لم تجتز التحقق.");
 return data;
}

/** P0.2 QA: read the chair's full report/minutes draft attached to this
 * exact titularisation mission. RLS excludes seats and other inspectors. */
export async function loadCloudCommitteeReportDraft(missionId){
 const c=cfg();
 if(!committeeCloudEnabled()||(c.qaOnly!==true&&!productionWorkspace()))
  throw Error("حفظ مسودة مهمة الترسيم غير متاح للحساب الحالي.");
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(missionId))
  throw Error("معرّف مهمة الترسيم غير صالح.");
 const rows=await read("titularisation_report_drafts",{
  select:"mission_id,payload,revision,updated_at",
  mission_id:"eq."+missionId,limit:"1"
 });
 if(!Array.isArray(rows)||rows.length>1)throw Error("استجابة حفظ المسودة غير صالحة.");
 return rows[0]||null;
}

/** Compare-and-swap: rejects stale writes rather than clobbering work
 * saved in another browser or tab. Not callable from production. */
export async function saveCloudCommitteeReportDraft(missionId,payload,revision){
 const c=cfg();
 if(!committeeCloudEnabled()||(c.qaOnly!==true&&!productionWorkspace()))
  throw Error("حفظ مسودة مهمة الترسيم غير متاح للحساب الحالي.");
 if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(missionId)||
   !Number.isSafeInteger(revision)||revision<0||!payload||
   typeof payload!=="object"||Array.isArray(payload))
  throw Error("بيانات حفظ مسودة المهمة غير صالحة.");
 const token=await inspectorToken();
 const response=await fetch(c.supabaseUrl.replace(/\/+$/,"")+
  "/rest/v1/rpc/save_titularisation_report_draft",{
  method:"POST",cache:"no-store",referrerPolicy:"no-referrer",
  headers:{"apikey":c.publishableKey,"Authorization":"Bearer "+token,
   "Content-Type":"application/json","Accept":"application/json"},
  body:JSON.stringify({p_mission_id:missionId,p_payload:payload,
   p_expected_revision:revision})
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok){
  if(result?.code==="40001")
   throw Error("المسودة حُفظت من صفحة أو جهاز آخر. صدّر JSON للاحتفاظ بتعديلاتك، ثم أعد فتح المهمة قبل الكتابة فوق النسخة الجديدة.");
  throw Error(String(result?.message||"لم ينجح حفظ المسودة في المهمة.")+
   " ("+response.status+")");
 }
 if(!Number.isSafeInteger(result)||result<=revision)
  throw Error("لم يؤكد الخادم رقم المراجعة الجديد. صدّر JSON قبل إعادة المحاولة.");
 return result;
}

/** QA-only professional identity for the signed-in inspector, not a member.
 * Read the current QA account by its session user ID with RLS enabled. For
 * federated inspectors the QA profile was refreshed from verified production
 * identity by the dedicated backend, never from browser-provided name fields. */
export async function loadCloudCommitteeInspectorProfile(){
 const c=cfg();
 if(!committeeCloudEnabled()||(c.qaOnly!==true&&!productionWorkspace()))
  throw Error("ملف المفتش المهني غير متاح للحساب الحالي.");
 let session;
 try{session=JSON.parse(cfg().qaOnly===true?
  sessionStorage.getItem(QA_SESSION)||"null":
  localStorage.getItem("official_report03_cloud_session_v1")||
   sessionStorage.getItem("official_report03_cloud_session_v1")||"null")}catch(_){}
 const ownerId=cfg().qaOnly===true?session?.userId:session?.user?.id;
 if(typeof ownerId!=="string"||
   !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(ownerId))
  throw Error("لا توجد جلسة مفتش معتمدة لقراءة بياناته المهنية.");
 const list=await read("inspector_profiles",{
  select:cfg().qaOnly===true?
  "id,first_name,last_name,district,email,approved,account_status,is_admin,federation_required":
  "id,first_name,last_name,district,email,approved,account_status,is_admin,work_district_id",
  id:"eq."+ownerId,limit:"1"
 });
 if(!Array.isArray(list)||list.length!==1||list[0]?.id!==ownerId||
    list[0]?.approved!==true||list[0]?.account_status!=="approved"||
    list[0]?.is_admin===true)
  throw Error("تعذر التحقق من ملف المفتش المهني في QA.");
 const result=list[0];
 if(productionWorkspace()&&result.work_district_id){
  const work=await read("work_districts",{
   select:"id,label,code",id:"eq."+result.work_district_id,limit:"1"
  });
  if(work?.[0]?.id===result.work_district_id)
   result.district=[work[0].label,work[0].code&&"("+work[0].code+")"]
    .filter(Boolean).join(" ");
 }
 return result;
}
