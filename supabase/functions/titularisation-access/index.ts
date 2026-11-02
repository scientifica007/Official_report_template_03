// M5.1 — Server-only Supabase Auth Admin account lifecycle for temporary seats.
// IMPORTANT: Deploy ONLY after migration 007 and security integration tests.
// verify_jwt=false in config.toml to allow the username/password login action;
// all privileged actions independently verify Supabase JWT and ownership.
// No service role credential is ever sent to the public browser.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const PROJECT_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PUBLIC_KEY=Deno.env.get("SUPABASE_ANON_KEY")||"";
const DOMAIN=Deno.env.get("COMMITTEE_LOGIN_DOMAIN")||"";
const ALLOWED_ORIGIN=Deno.env.get("COMMITTEE_ALLOWED_ORIGIN")||"https://scientifica007.github.io";
const seats=new Set(["member1","member2","member3"]);
const codePattern=/^cm-[a-z0-9]{12,32}$/;
const randomBytes=(n:number)=>crypto.getRandomValues(new Uint8Array(n));
const alphabet="abcdefghjkmnpqrstuvwxyz23456789";
function randomCode(length:number){
 const bytes=randomBytes(length);return Array.from(bytes,b=>alphabet[b%alphabet.length]).join("");
}
const PASSWORD_ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%+-_";
const password=()=>Array.from(randomBytes(16),b=>
 PASSWORD_ALPHABET[b%PASSWORD_ALPHABET.length]).join("");
function json(value:unknown,status=200,origin=ALLOWED_ORIGIN){
 return new Response(JSON.stringify(value),{
  status,headers:{
   "Content-Type":"application/json;charset=utf-8",
   "Cache-Control":"no-store",
   "Access-Control-Allow-Origin":origin,
   "Vary":"Origin",
   "Access-Control-Allow-Methods":"POST,OPTIONS",
   "Access-Control-Allow-Headers":"authorization,apikey,content-type"
  }
 });
}
function error(message:string,status=400){return json({error:message},status)}
function validSetup(){
 return /^https:\/\/[^/]+\/?$/.test(PROJECT_URL) &&
  SERVICE_KEY.length>30 && PUBLIC_KEY.length>20 &&
  /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(DOMAIN) &&
  DOMAIN!=="example.com"&&DOMAIN!=="example.org"&&
  /^https:\/\/[^/]+$/.test(ALLOWED_ORIGIN);
}
function admin(){
 return createClient(PROJECT_URL,SERVICE_KEY,{
  auth:{autoRefreshToken:false,persistSession:false}
 });
}
function userClient(){
 return createClient(PROJECT_URL,PUBLIC_KEY,{
  auth:{autoRefreshToken:false,persistSession:false}
 });
}
async function requireOwner(token:string,missionId:string){
 const client=userClient();
 const {data:userData,error:userError}=await client.auth.getUser(token);
 const id=userData.user?.id;
 if(userError||!id)throw new Error("AUTH");
 const db=admin();
 const {data:inspector,error:ie}=await db.from("inspector_profiles")
  .select("id,approved,account_status")
  .eq("id",id).maybeSingle();
 if(ie||!inspector?.approved||inspector.account_status!=="approved")throw new Error("FORBIDDEN");
 const {data:mission,error:me}=await db.from("titularisation_missions")
  .select("id,owner_id,status,expires_at,rubric_id")
  .eq("id",missionId).maybeSingle();
 if(me||!mission||mission.owner_id!==id)throw new Error("FORBIDDEN");
 return {db,id,mission};
}
async function record(db:ReturnType<typeof admin>,missionId:string,seat:string|null,
 actor:string,kind:string){
 const {error:e}=await db.from("titularisation_access_events").insert({
  mission_id:missionId,seat_code:seat,actor_id:actor,kind
 });
 if(e)throw new Error("AUDIT");
}
function makeUsername(){return "cm-"+randomCode(12)}
function loginEmail(username:string){return username+"@"+DOMAIN}
function authenticating(req:Request){
 const header=req.headers.get("Authorization")||"";
 return header.startsWith("Bearer ")?header.slice(7):"";
}
async function login(username:string,secret:string){
 if(!codePattern.test(username)||typeof secret!=="string"||secret.length>128)
  return error("بيانات الدخول غير صحيحة.",401);
 const db=admin();
 const {error:throttle}=await db.rpc("guard_titularisation_login",{p_username:username});
 if(throttle)return error("تعذر تسجيل الدخول. أعد المحاولة لاحقًا.",429);
 // Uses Supabase Auth's salted password hashes and token service, never
 // browser-side or database-stored plaintext passwords.
 const auth=userClient();
 const {data,error:loginError}=await auth.auth.signInWithPassword({
  email:loginEmail(username),password:secret
 });
 if(loginError||!data.user||!data.session)
  return error("بيانات الدخول غير صحيحة.",401);
 const {data:seat,error:se}=await db.from("titularisation_seats")
  .select("mission_id,seat_code,status,expires_at,revoked_at,auth_user_id")
  .eq("username",username).eq("auth_user_id",data.user.id).maybeSingle();
 if(se||!seat||seat.status!=="active"||seat.revoked_at||
  new Date(seat.expires_at).getTime()<=Date.now())
  return error("الحساب منتهي أو تم إلغاؤه.",403);
 const {data:mission,error:me}=await db.from("titularisation_missions")
  .select("status,expires_at")
  .eq("id",seat.mission_id).maybeSingle();
 if(me||!mission||mission.status!=="draft"||new Date(mission.expires_at).getTime()<=Date.now())
  return error("انتهت مهمة اللجنة.",403);
 return json({
  access_token:data.session.access_token,
  refresh_token:data.session.refresh_token,
  expires_in:data.session.expires_in,
  mission_id:seat.mission_id,seat_code:seat.seat_code
 });
}
// An invite URL is a short-lived, scoped bearer capability. Only its SHA-256
// digest is stored in the database; the raw token never appears in SQL, logs,
// analytics, an Auth user record, or a conventional query string.
const hex=async (source:string)=>{
 const bytes=new TextEncoder().encode(source);
 return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),
  b=>b.toString(16).padStart(2,"0")).join("");
};
const freshLinkToken=()=>{
 const bytes=randomBytes(32);
 return btoa(String.fromCharCode(...bytes)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
};
async function issueLink(db:ReturnType<typeof admin>,actor:string,
 mission:{id:string;expires_at:string},seatCode:string){
 const {data:seat,error:e}=await db.from("titularisation_seats")
  .select("status,auth_user_id,username,expires_at")
  .eq("mission_id",mission.id).eq("seat_code",seatCode).maybeSingle();
 if(e||!seat||seat.status!=="active"||!seat.auth_user_id||!seat.username)
  return error("يجب إنشاء حساب العضو أولًا.",409);
 const secret=freshLinkToken();
 const digest=await hex(secret);
 const expiry=new Date(Math.min(Date.parse(mission.expires_at),Date.now()+24*60*60*1000)).toISOString();
 const {error:saveError}=await db.from("titularisation_member_links").upsert({
  mission_id:mission.id,seat_code:seatCode,token_hash:digest,
  expires_at:expiry,revoked_at:null,created_at:new Date().toISOString()
 },{onConflict:"mission_id,seat_code"});
 if(saveError)return error("تعذر إصدار الرابط. راجع إعدادات قاعدة البيانات.",503);
 // Deliberately no password or username in this bearer link. The fragment
 // is stripped by the member browser before contacting the Edge function.
 const link=ALLOWED_ORIGIN+"/Official_report_template_03/qa-titularisation/member/?mission="+
  encodeURIComponent(mission.id)+"&seat="+encodeURIComponent(seatCode)+
  "#access="+encodeURIComponent(secret);
 await record(db,mission.id,seatCode,actor,"link_issued");
 return json({mission_id:mission.id,seat_code:seatCode,link,expires_at:expiry,
  warning:"الرابط يمنح وصولًا لمن يحمله حتى انتهاء صلاحيته أو إلغائه. أرسله مباشرة إلى العضو ولا تنشره علنًا."});
}
async function loginLink(raw:string,claimedMission:string,claimedSeat:string){
 if(!/^[A-Za-z0-9_-]{40,48}$/.test(raw)||
   !/^[a-f0-9-]{36}$/i.test(claimedMission)||!seats.has(claimedSeat))
  return error("الرابط غير صالح أو انتهت صلاحيته.",401);
 const db=admin();const digest=await hex(raw);
 const {data:link,error:le}=await db.from("titularisation_member_links")
  .select("mission_id,seat_code,expires_at,revoked_at")
  .eq("token_hash",digest).eq("mission_id",claimedMission)
  .eq("seat_code",claimedSeat).maybeSingle();
 if(le||!link||link.revoked_at||Date.parse(link.expires_at)<=Date.now())
  return error("الرابط غير صالح أو انتهت صلاحيته.",401);
 const {data:seat,error:se}=await db.from("titularisation_seats")
  .select("auth_user_id,username,status,expires_at,revoked_at")
  .eq("mission_id",claimedMission).eq("seat_code",claimedSeat).maybeSingle();
 const {data:mission,error:me}=await db.from("titularisation_missions")
  .select("status,expires_at").eq("id",claimedMission).maybeSingle();
 if(se||me||!seat?.auth_user_id||seat.status!=="active"||seat.revoked_at||
  Date.parse(seat.expires_at)<=Date.now()||mission?.status!=="draft"||
  Date.parse(mission.expires_at)<=Date.now())
  return error("انتهت صلاحية حساب هذا العضو أو المهمة.",403);
 // Mint a standard scoped Supabase Auth session without ever disclosing
 // credentials; RLS verifies the exact seat and mission on every request.
 const {data:magic,error:ge}=await db.auth.admin.generateLink({
  type:"magiclink",email:loginEmail(seat.username)
 });
 const otp=magic?.properties?.hashed_token;
 if(ge||!otp)return error("تعذر تجهيز جلسة دخول العضو.",503);
 const auth=userClient();
 const {data:result,error:ve}=await auth.auth.verifyOtp({
  token_hash:otp,type:"magiclink"
 });
 if(ve||!result.session||result.user?.id!==seat.auth_user_id)
  return error("تعذر استكمال دخول العضو.",503);
 return json({access_token:result.session.access_token,
  refresh_token:result.session.refresh_token,
  expires_in:result.session.expires_in,
  mission_id:claimedMission,seat_code:claimedSeat});
}
async function provision(db:ReturnType<typeof admin>,actor:string,
 mission:{id:string;expires_at:string},seatCode:string,displayName:string){
 const {data:seat,error:se}=await db.from("titularisation_seats")
  .select("mission_id,seat_code,status,auth_user_id").eq("mission_id",mission.id)
  .eq("seat_code",seatCode).single();
 if(se||!seat||seat.status==="active")return error("هذا المقعد مُفعّل بالفعل.",409);
 const {data:submitted,error:submittedError}=await db.from("titularisation_contributions")
  .select("status").eq("mission_id",mission.id).eq("seat_code",seatCode).maybeSingle();
 if(submittedError)return error("تعذر التحقق من المساهمة السابقة.",503);
 if(submitted?.status==="submitted")
  return error("مساهمة هذا المقعد مرسلة نهائيًا؛ لا يمكن إصدار حساب جديد لاستبدالها.",409);
 if(seat.auth_user_id){
  // A previously revoked account must be removed before a replacement can
  // be issued. Its contribution remains attached to the seat, not the login.
  const {error:removeError}=await db.auth.admin.deleteUser(seat.auth_user_id);
  if(removeError)return error("تعذّر تنظيف الحساب السابق. أعِد إلغاءه.",409);
 }
 const username=makeUsername();
 const temporaryPassword=password();
 const {data:created,error:ce}=await db.auth.admin.createUser({
  email:loginEmail(username),password:temporaryPassword,email_confirm:true,
  // Admin-only application metadata separates guests from professional
  // inspectors at the auth.users INSERT trigger; never rely on user_metadata.
  app_metadata:{account_type:"titularisation_temporary"}
 });
 if(ce||!created.user)return error("تعذر إصدار بيانات الدخول.",503);
 const uid=created.user.id;
 // Supabase Auth may run auth.users AFTER INSERT triggers before app_metadata
 // is available to the trigger. Remove any unapproved professional profile
 // inadvertently created by the pre-existing inspector-signup trigger.
 // Never remove or alter an approved/administrative professional profile.
 const {data:unexpected,error:profileCheckError}=await db.from("inspector_profiles")
  .select("id,approved,is_admin").eq("id",uid).maybeSingle();
 if(profileCheckError||unexpected?.approved||unexpected?.is_admin){
  await db.auth.admin.deleteUser(uid);
  return error("تعذر عزل الحساب المؤقت عن حسابات المفتشين.",503);
 }
 if(unexpected){
  const {data:deleted,error:cleanupError}=await db.from("inspector_profiles")
   .delete().eq("id",uid).eq("approved",false).eq("is_admin",false)
   .select("id").maybeSingle();
  if(cleanupError||!deleted){
   await db.auth.admin.deleteUser(uid);
   return error("تعذر تنظيف سجل المفتش غير المقصود للحساب المؤقت.",503);
  }
 }
 const {data:changed,error:ue}=await db.from("titularisation_seats").update({
  username,auth_user_id:uid,display_name:displayName,status:"active",
  activated_at:new Date().toISOString(),revoked_at:null,expires_at:mission.expires_at
 }).eq("mission_id",mission.id).eq("seat_code",seatCode).in("status",["vacant","revoked"])
  .select("seat_code").maybeSingle();
 if(ue||!changed){
  await db.auth.admin.deleteUser(uid);
  return error("تعذر تفعيل المقعد؛ ربما عدّلته جلسة أخرى.",409);
 }
 try{await record(db,mission.id,seatCode,actor,"seat_issued")}
 catch(_){
  await db.from("titularisation_seats").update({
   status:"revoked",revoked_at:new Date().toISOString()
  }).eq("mission_id",mission.id).eq("seat_code",seatCode);
  await db.auth.admin.deleteUser(uid);
  return error("تعذر توثيق إصدار الحساب. أُلغي الوصول.",503);
 }
 return json({
  username,password:temporaryPassword,
  seat_code:seatCode,mission_id:mission.id,
  link:ALLOWED_ORIGIN+"/Official_report_template_03/committee-member/?mission="+encodeURIComponent(mission.id)+
    "&seat="+encodeURIComponent(seatCode),
  warning:"اعرض كلمة المرور مرة واحدة، ولا تدرجها في الرابط أو التقرير أو ملف JSON."
 });
}
async function issueDirect(db:ReturnType<typeof admin>,actor:string,
 mission:{id:string;expires_at:string},seatCode:string,displayName:string){
 const {data:seat,error:e}=await db.from("titularisation_seats")
 .select("status").eq("mission_id",mission.id).eq("seat_code",seatCode).maybeSingle();
 if(e||!seat)return error("لا يوجد هذا المقعد.",404);
 if(seat.status!=="active"){
  const response=await provision(db,actor,mission,seatCode,displayName);
  if(!response.ok)return response;
 }
 return issueLink(db,actor,mission,seatCode);
}
async function rotate(db:ReturnType<typeof admin>,actor:string,missionId:string,seatCode:string){
 const {data:seat,error:se}=await db.from("titularisation_seats")
  .select("status,auth_user_id,username").eq("mission_id",missionId)
  .eq("seat_code",seatCode).maybeSingle();
 if(se||!seat||seat.status!=="active"||!seat.auth_user_id)return error("المقعد غير نشط.",409);
 const next=password();
 const {error:e}=await db.auth.admin.updateUserById(seat.auth_user_id,{password:next});
 if(e)return error("تعذّر تغيير كلمة المرور.",503);
 // A password change may not revoke already issued JWTs; explicit seat
 // revocation is available for immediate DB-enforced access removal.
 await record(db,missionId,seatCode,actor,"password_rotated");
 return json({username:seat.username,password:next,seat_code:seatCode,
  warning:"استخدم «إلغاء الوصول» عند الحاجة إلى سحب الصلاحية فورًا؛ تغيير كلمة المرور لا يلغي جميع JWTs الصادرة."});
}
async function revoke(db:ReturnType<typeof admin>,actor:string,missionId:string,seatCode:string){
 const {data:seat,error:se}=await db.from("titularisation_seats")
  .select("status,auth_user_id").eq("mission_id",missionId)
  .eq("seat_code",seatCode).maybeSingle();
 if(se||!seat||seat.status==="vacant")return error("لا يوجد حساب مفعل لهذا المقعد.",409);
 if(seat.status!=="revoked"){
  const {error:e}=await db.from("titularisation_seats").update({
   status:"revoked",revoked_at:new Date().toISOString()
  }).eq("mission_id",missionId).eq("seat_code",seatCode);
  if(e)return error("تعذر إلغاء الوصول.",503);
  await record(db,missionId,seatCode,actor,"seat_revoked");
 }
 // Discard the invitation capability as well as revoking the seat, even
 // though the seat check alone already rejects attempts to use the link.
 const {error:linkError}=await db.from("titularisation_member_links")
  .update({revoked_at:new Date().toISOString()})
  .eq("mission_id",missionId).eq("seat_code",seatCode)
  .is("revoked_at",null);
 if(linkError)return error("سُحب وصول العضو ولكن تعذر إبطال رابط الدعوة.",503);
 let deleted=true;
 if(seat.auth_user_id){
  const {error:e}=await db.auth.admin.deleteUser(seat.auth_user_id);
  deleted=!e;
  if(deleted)await record(db,missionId,seatCode,actor,"account_deleted");
 }
 return json({revoked:true,account_deleted:deleted,
  message:deleted?"أُلغيت الصلاحية وحُذفت بيانات الدخول، مع حفظ المساهمات.":"أُلغي الوصول فورًا، لكن تنظيف حساب المصادقة لم يكتمل؛ أعد المحاولة."});
}

Deno.serve(async req=>{
 const origin=req.headers.get("Origin")||"";
 if(origin && origin!==ALLOWED_ORIGIN)
  return new Response("Origin not allowed",{status:403});
 if(req.method==="OPTIONS")return json({},200,ALLOWED_ORIGIN);
 if(req.method!=="POST")return error("Method not allowed",405);
 if(!validSetup())return error("خدمة الحسابات غير مهيأة على الخادم.",503);
 let body:Record<string,unknown>;
 try{body=await req.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error("body")}
 catch(_){return error("Invalid JSON",400)}
 const action=String(body.action||"");
 if(action==="login")return login(String(body.username||""),String(body.password||""));
 if(action==="login_link")return loginLink(String(body.token||""),
  String(body.mission_id||""),String(body.seat_code||""));
 const missionId=String(body.mission_id||"");
 const seatCode=String(body.seat_code||"");
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(missionId)||!seats.has(seatCode))
  return error("Invalid mission or seat",400);
 const token=authenticating(req);
 if(!token)return error("Authentication required",401);
 try{
  const {db,id,mission}=await requireOwner(token,missionId);
  if((action==="issue"||action==="rotate"||action==="issue_link"||action==="issue_direct")&&
   (mission.status!=="draft"||new Date(mission.expires_at).getTime()<=Date.now()))
   return error("هذه المهمة مغلقة أو انتهت صلاحيتها.",409);
  // Revocation remains permitted AFTER closure, so the inspector can remove
  // all temporary accounts once the signed paper report has been printed.
  if(action==="issue"){
   const name=String(body.display_name||"").trim();
   if(name.length>160)return error("اسم العرض طويل.",400);
   return await provision(db,id,mission,seatCode,name);
  }
  if(action==="issue_direct"){
   const name=String(body.display_name||"").trim();
   if(name.length>160)return error("اسم العرض طويل.",400);
   return await issueDirect(db,id,mission,seatCode,name);
  }
  if(action==="issue_link")return await issueLink(db,id,mission,seatCode);
  if(action==="rotate")return await rotate(db,id,missionId,seatCode);
  if(action==="revoke")return await revoke(db,id,missionId,seatCode);
  return error("Unsupported action",400);
 }catch(err){
  const code=err instanceof Error?err.message:"";
  if(code==="AUTH")return error("جلسة تسجيل الدخول غير صحيحة.",401);
  if(code==="FORBIDDEN")return error("ليست لديك صلاحية هذه اللجنة.",403);
  if(code==="CLOSED")return error("هذه المهمة مغلقة أو انتهت صلاحيتها.",409);
  // Avoid exposing internal SQL/Auth details to callers.
  return error("تعذر تنفيذ الطلب على الخادم.",503);
 }
});
