// UX-ARCH-03. The browser is only a UI. Every admin mutation must be
// rechecked by an authenticated, server-side SECURITY DEFINER RPC.
const cfg=window.REPORT03_CLOUD_CONFIG||{};
const ORIGIN="https://uxtsyzyotnohxvopgcmh.supabase.co";
const SESSION="official_report03_cloud_session_v1";
if(cfg.supabaseUrl!==ORIGIN||!/^sb_publishable_/.test(cfg.publishableKey||""))
 throw Error("تهيئة قاعدة الإنتاج غير مطابقة.");
let auth=null;
const validId=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x||"");
export function startSession(){
 let found=null;
 for(const store of [localStorage,sessionStorage]){
  try{
   const candidate=JSON.parse(store.getItem(SESSION)||"null");
   if(candidate?.access_token&&candidate?.refresh_token&&validId(candidate?.user?.id)){
    found=candidate;break;
   }
  }catch{}
 }
 if(!found)throw Error("يجب تسجيل الدخول بحساب إدارة الموقع من المنصة الرئيسية.");
 auth=found;
}
async function ensureToken(){
 if(!auth)throw Error("جلسة الإدارة غير موجودة.");
 if(Number(auth.expires_at_ms||0)>Date.now()+60000)return;
 const response=await fetch(ORIGIN+"/auth/v1/token?grant_type=refresh_token",{
  method:"POST",headers:{apikey:cfg.publishableKey,"Content-Type":"application/json"},
  body:JSON.stringify({refresh_token:auth.refresh_token}),cache:"no-store"});
 const payload=await response.json();
 if(!response.ok||!payload.access_token||!payload.refresh_token)
  throw Error("انتهت جلسة الإدارة؛ أعد تسجيل الدخول.");
 auth={...auth,access_token:payload.access_token,
  refresh_token:payload.refresh_token,user:payload.user||auth.user,
  expires_at_ms:Date.now()+Number(payload.expires_in||3600)*1000};
 try{localStorage.setItem(SESSION,JSON.stringify(auth))}
 catch{sessionStorage.setItem(SESSION,JSON.stringify(auth))}
}
export async function request(method,path,body){
 await ensureToken();
 const headers={apikey:cfg.publishableKey,Authorization:"Bearer "+auth.access_token,
  Accept:"application/json"};
 if(body!==undefined)headers["Content-Type"]="application/json";
 const res=await fetch(ORIGIN+path,{method,headers,cache:"no-store",
  body:body===undefined?undefined:JSON.stringify(body)});
 const raw=await res.text();
 let payload=null;
 try{payload=raw?JSON.parse(raw):null}catch{}
 if(!res.ok){
  const msg=String(payload?.message||payload?.error_description||
   payload?.error||"تعذر تنفيذ العملية");
  if(payload?.code==="23505")throw Error("يوجد سجل بالرمز أو المؤسسة نفسها. اختر السجل القائم بدل إنشاء نسخة أخرى.");
  throw Error(msg+" ("+res.status+")");
 }
 return payload;
}
export const getUser=()=>request("GET","/auth/v1/user");
export const rpc=(name,args)=>request("POST","/rest/v1/rpc/"+name,args);
export const read=async(table,params={})=>{
 const search=new URLSearchParams(params);
 return await request("GET","/rest/v1/"+table+"?"+search.toString());
};
export const sessionId=()=>auth?.user?.id||null;
export const isId=validId;
