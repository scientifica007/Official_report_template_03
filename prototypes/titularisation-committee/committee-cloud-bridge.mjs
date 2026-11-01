// M5.1 — opt-in, RLS-authorized synchronization of submitted committee seats.
// NEVER fetches using service-role keys; the approved inspector's own Supabase
// JWT is required, and the existing JSON/document engine validates all data.
import {restoreCommittee} from "./committee-engine.mjs";
const config=()=>typeof window==='undefined'?{}:(window.REPORT03_CLOUD_CONFIG||{});
export const committeeCloudEnabled=()=>config().temporaryCommitteeEnabled===true;
const token=()=>{
 const stored=localStorage.getItem("official_report03_cloud_session_v1");
 let s;
 try{s=JSON.parse(stored||"null")}catch(_){}
 if(!s?.access_token||!s.user?.id||Date.now()>=(s.expires_at_ms||0)-60000)
  throw Error("سجّل الدخول مجددًا إلى حساب المفتش المعتمد في المنصة الرئيسية قبل الجلب.");
 return s.access_token;
};
async function read(table,params){
 if(!committeeCloudEnabled())throw Error("خدمة الحسابات المؤقتة غير مفعلة.");
 const cfg=config();
 if(!/^https:\/\//.test(cfg.supabaseUrl||"")||!(cfg.publishableKey||""))
  throw Error("إعدادات الخدمة غير صالحة.");
 const query=new URLSearchParams(params);
 const res=await fetch(cfg.supabaseUrl.replace(/\/+$/,"")+
  "/rest/v1/"+table+"?"+query.toString(),{
  headers:{"apikey":cfg.publishableKey,"Authorization":"Bearer "+token(),"Accept":"application/json"},
  cache:"no-store"
 });
 if(!res.ok)throw Error("تعذر جلب مساهمات اللجنة أو انتهت صلاحية الجلسة. ("+res.status+")");
 return res.json();
}
export async function listCloudCommitteeMissions(){
 return read("titularisation_missions",{select:"id,title,rubric_id,status,expires_at",
  order:"created_at.desc",limit:"60"});
}
export async function loadCloudCommitteeSubmissions(id){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw Error("معرّف مهمة غير صالح.");
 const missions=await read("titularisation_missions",{
  select:"id,title,rubric_id",id:"eq."+id});
 if(missions.length!==1)throw Error("هذه المهمة غير متاحة لحسابك.");
 const rows=await read("titularisation_contributions",{
  select:"seat_code,payload,status,revision,submitted_at",
  mission_id:"eq."+id,status:"eq.submitted",order:"seat_code.asc"});
 return {mission:missions[0],rows};
}
export function mergeSubmittedCloudMembers(original,mission,rows){
 if(!mission||mission.rubric_id!==original.rubricId)
  throw Error("شبكة المهمة السحابية تختلف عن الشبكة الحالية. لا يمكن دمج علامات من نظامين.");
 if(!Array.isArray(rows))throw Error("مساهمات غير صالحة.");
 const copy=structuredClone(original);
 copy.mode="individual";
 const applied=new Set();
 for(const row of rows){
  if(!["member1","member2","member3"].includes(row.seat_code)||
   applied.has(row.seat_code)||row.status!=="submitted"||
   !row.payload||typeof row.payload!=="object")throw Error("بيانات مساهمة غير موثوقة.");
  const {grading,notes}=row.payload;
  // Member-submitted notes are isolated. Never touch chair's own draft.
  copy.members[row.seat_code]={grading,notes,submitted:true};
  applied.add(row.seat_code);
 }
 if(!applied.size)throw Error("لا توجد مساهمات مرسلة لاستيرادها.");
 copy.serial+=1;
 return {state:restoreCommittee(copy),seats:[...applied]};
}
