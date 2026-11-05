// UX-ARCH-03. The browser is only a UI. Every admin mutation must be
// rechecked by an authenticated, server-side SECURITY DEFINER RPC.
const cfg=window.REPORT03_CLOUD_CONFIG||{};
const ORIGIN="https://uxtsyzyotnohxvopgcmh.supabase.co";
const SESSION="official_report03_cloud_session_v1";
const ADMIN_SESSION="official_report03_admin_session_v1";
if(cfg.supabaseUrl!==ORIGIN||!/^sb_publishable_/.test(cfg.publishableKey||""))
 throw Error("تهيئة قاعدة الإنتاج غير مطابقة.");
let auth=null,sessionSource="primary";
// UUID has FIVE groups (8-4-4-4-12); omitting the fourth group rejected every real session.
const validId=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x||"");
const validSession=x=>Boolean(x?.access_token&&x?.refresh_token&&validId(x?.user?.id));
function saved(store,key){
 try{const value=JSON.parse(store.getItem(key)||"null");return validSession(value)?value:null}
 catch{return null}
}
function saveActiveSession(){
 const value=JSON.stringify(auth);
 if(sessionSource==="admin"){
  try{sessionStorage.setItem(ADMIN_SESSION,value)}catch{}
  return;
 }
 // The main portal uses this same key. Keep same-tab sessionStorage as fallback.
 let persisted=false;
 try{localStorage.setItem(SESSION,value);persisted=true}catch{}
 if(!persisted){try{sessionStorage.setItem(SESSION,value)}catch{}}
}
export function clearAdminSession(){
 if(sessionSource==="admin")auth=null;
 try{sessionStorage.removeItem(ADMIN_SESSION)}catch{}
}
export function startSession(){
 // A dedicated administrator login should not overwrite an inspector's
 // independent main-portal login in another tab.
 const admin=saved(sessionStorage,ADMIN_SESSION);
 if(admin){auth=admin;sessionSource="admin";return}
 const primary=saved(localStorage,SESSION)||saved(sessionStorage,SESSION);
 if(primary){auth=primary;sessionSource="primary";return}
 throw Error("لا توجد جلسة مشتركة في هذا اللسان. يمكنك الدخول بحساب Admin الموجود مباشرة هنا، دون إنشاء حساب جديد.");
}
export async function signInAdmin(email,password){
 const address=String(email||"").trim();
 if(!address||!password)throw Error("أدخل البريد الإلكتروني وكلمة مرور حساب Admin.");
 const response=await fetch(ORIGIN+"/auth/v1/token?grant_type=password",{
  method:"POST",headers:{apikey:cfg.publishableKey,"Content-Type":"application/json",
   Accept:"application/json"},body:JSON.stringify({email:address,password}),
  cache:"no-store"});
 const payload=await response.json().catch(()=>null);
 if(!response.ok||!payload?.access_token||!payload?.refresh_token||
    !validId(payload?.user?.id))
  throw Error("لم يُقبل تسجيل الدخول. تحقق من بيانات حساب Admin الموجود.");
 auth={access_token:payload.access_token,refresh_token:payload.refresh_token,
  user:payload.user,expires_at_ms:Date.now()+1000*Number(payload.expires_in||3600)};
 sessionSource="admin";
 saveActiveSession();
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
 saveActiveSession();
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
