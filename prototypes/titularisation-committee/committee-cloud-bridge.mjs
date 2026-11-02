// RLS-authorized inspector-only import bridge.
// QA sessions remain isolated from production, including after closing and
// deleting all temporary member Auth accounts.
import {restoreCommittee,freshCommittee} from "./committee-engine.mjs";
import {RUBRICS,validateWeights,sameWeightProfile} from "../titularisation-workbench/engine.mjs";
const cfg=()=>typeof window==="undefined"?{}:(window.REPORT03_CLOUD_CONFIG||{});
export const committeeCloudEnabled=()=>cfg().temporaryCommitteeEnabled===true;
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
 const raw=localStorage.getItem("official_report03_cloud_session_v1");
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
  select:"id,title,rubric_id,rubric_profile,status",id:"eq."+id
 });
 if(missions.length!==1)throw Error("المهمة غير متاحة لحساب المفتش الحالي.");
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
