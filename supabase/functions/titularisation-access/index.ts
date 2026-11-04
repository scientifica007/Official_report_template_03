// M5.1 — Server-only Supabase Auth Admin account lifecycle for temporary seats.
// IMPORTANT: Deploy ONLY after migration 007 and security integration tests.
// verify_jwt=false in config.toml to allow the username/password login action;
// all privileged actions independently verify Supabase JWT and ownership.
// No service role credential is ever sent to the public browser.
import {createClient} from "npm:@supabase/supabase-js@2.58.0";

const PROJECT_URL=Deno.env.get("SUPABASE_URL")||"";
const IS_DISPOSABLE_QA=PROJECT_URL.replace(/\/+$/,"")==="https://npxwshvcrowbfoiqyrwx.supabase.co";
 // Production public endpoints only; production service keys never cross projects.
 const PRIMARY_URL="https://uxtsyzyotnohxvopgcmh.supabase.co";
 const PRIMARY_PUBLIC_KEY="sb_publishable_hObSzRf1Sf9HTrUppubkXA_BKT5ZMJe";
 const QA_FEDERATION_TTL_MS=12*60*60*1000;
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
 // Federated profiles expire even if a QA JWT is still refreshable.
 const {data:federated,error:fe}=await db.from("qa_federated_inspector_links")
  .select("federation_only,expires_at").eq("qa_user_id",id).maybeSingle();
 if(IS_DISPOSABLE_QA&&(fe||(federated?.federation_only===true&&
    Date.parse(federated.expires_at)<=Date.now())))throw new Error("FORBIDDEN");
 const {data:mission,error:me}=await db.from("titularisation_missions")
  .select("id,owner_id,status,expires_at,rubric_id,rubric_profile")
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
// M5.5 — A recoverable invitation remains a credential. Encrypt the raw
// token on the server; never send the sealed fields to authenticated REST
// clients, the public site, access logs or any downloadable JSON report.
// A dedicated COMMITTEE_LINK_VAULT_SECRET is preferable in production;
// QA falls back to the existing server-only service key. Rotating that
// underlying key without migrating the vault makes old links unrecoverable.
const bytesToBase64=(bytes:Uint8Array)=>
 btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(""));
const base64ToBytes=(value:string)=>
 Uint8Array.from(atob(value),char=>char.charCodeAt(0));
async function inviteVaultKey(){
 const material=Deno.env.get("COMMITTEE_LINK_VAULT_SECRET")||SERVICE_KEY;
 if(material.length<30)throw new Error("VAULT_NOT_CONFIGURED");
 const kdfKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(material),
  "HKDF",false,["deriveKey"]);
 return crypto.subtle.deriveKey({
  name:"HKDF",hash:"SHA-256",
  salt:new TextEncoder().encode("Scientifica titularisation invitation vault v1"),
  info:new TextEncoder().encode("server-only AES-GCM access-link token encryption")
 },kdfKey,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function sealInvite(rawToken:string){
 const nonce=randomBytes(12),key=await inviteVaultKey();
 const sealed=new Uint8Array(await crypto.subtle.encrypt({
  name:"AES-GCM",iv:nonce,
 },key,new TextEncoder().encode(rawToken)));
 return {sealed_token:bytesToBase64(sealed),sealed_token_nonce:bytesToBase64(nonce)};
}
async function unsealInvite(sealed:string,nonce:string){
 const iv=base64ToBytes(nonce),bytes=base64ToBytes(sealed);
 if(iv.length!==12)throw new Error("INVALID_NONCE");
 const result=await crypto.subtle.decrypt({name:"AES-GCM",iv},
  await inviteVaultKey(),bytes);
 return new TextDecoder().decode(result);
}
function seatDirectUrl(missionId:string,seatCode:string,secret:string){
 return ALLOWED_ORIGIN+"/Official_report_template_03/qa-titularisation/member/?mission="+
  encodeURIComponent(missionId)+"&seat="+encodeURIComponent(seatCode)+
  "#access="+encodeURIComponent(secret);
}
async function retrieveLink(db:ReturnType<typeof admin>,mission:{
 id:string;status:string;expires_at:string},seatCode:string){
 if(mission.status!=="draft"||Date.parse(mission.expires_at)<=Date.now())
  return error("المهمة مغلقة؛ روابط الدخول لم تعد صالحة.",409);
 const {data:seat,error:se}=await db.from("titularisation_seats")
  .select("status,expires_at,revoked_at")
  .eq("mission_id",mission.id).eq("seat_code",seatCode).maybeSingle();
 if(se||!seat||seat.status!=="active"||seat.revoked_at||
  Date.parse(seat.expires_at)<=Date.now())
  return error("حساب العضو ملغى أو منتهي الصلاحية.",409);
 const {data:link,error:le}=await db.from("titularisation_member_links")
  .select("token_hash,sealed_token,sealed_token_nonce,expires_at,revoked_at")
  .eq("mission_id",mission.id).eq("seat_code",seatCode).maybeSingle();
 if(le)return error("تعذر قراءة بيانات الدعوة.",503);
 if(!link)return error("لم يُنشأ رابط مباشر لهذا العضو بعد.",404);
 if(link.revoked_at||Date.parse(link.expires_at)<=Date.now())
  return error("انتهت صلاحية الرابط أو أُلغي. أنشئ رابطًا جديدًا.",410);
 if(!link.sealed_token||!link.sealed_token_nonce)
  return error("الرابط القديم محفوظ كبصمة أمنية فقط ولا يمكن استعادته. أنشئ رابطًا جديدًا مرة واحدة.",409);
 try{
  const raw=await unsealInvite(link.sealed_token,link.sealed_token_nonce);
  if(await hex(raw)!==link.token_hash)throw new Error("INTEGRITY");
  return json({
   mission_id:mission.id,seat_code:seatCode,
   link:seatDirectUrl(mission.id,seatCode,raw),
   expires_at:link.expires_at,recovered:true,
   warning:"رابط دخول حساس. لا تشاركه إلا مع العضو المعني."
  });
 }catch(_){
  return error("تعذّر فك تشفير الدعوة. أصدر رابطًا جديدًا؛ لا تتغير مساهمة العضو.",503);
 }
}

async function issueLink(db:ReturnType<typeof admin>,actor:string,
 mission:{id:string;expires_at:string},seatCode:string,validityHours=24){
 const {data:seat,error:e}=await db.from("titularisation_seats")
  .select("status,auth_user_id,username,expires_at")
  .eq("mission_id",mission.id).eq("seat_code",seatCode).maybeSingle();
 if(e||!seat||seat.status!=="active"||!seat.auth_user_id||!seat.username||
  Date.parse(seat.expires_at)<=Date.now())
  return error("لا يوجد حساب عضو نشط وساري الصلاحية لهذا المقعد.",409);
 const secret=freshLinkToken();
 const digest=await hex(secret);
 const sealed=await sealInvite(secret);
 // Ordinary invitations remain 24-hour capabilities. M5.9 may issue 168h
 // ONLY in the isolated QA project, after an owner-authorized renewal.
 if(validityHours!==24&&(!IS_DISPOSABLE_QA||validityHours!==168))
  return error("تجديد السبعة أيام مخصص لمختبر الاختبار.",403);
 const expiry=new Date(Math.min(
  Date.parse(mission.expires_at),Date.now()+validityHours*60*60*1000
 )).toISOString();
 const {error:saveError}=await db.from("titularisation_member_links").upsert({
  mission_id:mission.id,seat_code:seatCode,token_hash:digest,
  ...sealed,expires_at:expiry,revoked_at:null,created_at:new Date().toISOString()
 },{onConflict:"mission_id,seat_code"});
 if(saveError)return error("تعذر إصدار الرابط. راجع إعدادات قاعدة البيانات.",503);
 // Deliberately no password or username in this bearer link. The fragment
 // is stripped by the member browser before contacting the Edge function.
 const link=seatDirectUrl(mission.id,seatCode,secret);
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


 // Separate QA-issued session derived from a freshly verified primary inspector.
 // A production access token is NOT trusted as a QA JWT and is never stored.
 async function federatedInspectorLogin(primaryToken:string){
  if(!IS_DISPOSABLE_QA)return error("هذه الخدمة متاحة في بيئة الاختبار فقط.",403);
  if(typeof primaryToken!=="string"||primaryToken.length<60||primaryToken.length>8192)
   return error("يلزم تسجيل الدخول بحساب مفتش معتمد.",401);
  const main=createClient(PRIMARY_URL,PRIMARY_PUBLIC_KEY,{
   auth:{autoRefreshToken:false,persistSession:false}
  });
  const {data:identity,error:identityError}=await main.auth.getUser(primaryToken);
  const primaryUser=identity.user;
  if(identityError||!primaryUser?.id||!primaryUser.email||
     !primaryUser.email_confirmed_at||primaryUser.is_anonymous)
   return error("تعذّر التحقق من حساب المنصة الرئيسية.",401);

  // Validate role and current approval in the PRODUCTION database under
  // the verified user's own RLS; NEVER accept caller-provided role flags.
  const url=PRIMARY_URL+"/rest/v1/inspector_profiles?"+
   new URLSearchParams({
    select:"id,email,profession,first_name,last_name,district,approved,account_status",
    id:"eq."+primaryUser.id
   }).toString();
  let rows:Record<string,unknown>[];
  try{
   const response=await fetch(url,{
    headers:{apikey:PRIMARY_PUBLIC_KEY,Authorization:"Bearer "+primaryToken,
     Accept:"application/json"},
    cache:"no-store",signal:AbortSignal.timeout(10000)
   });
   if(!response.ok)return error("تعذّر التحقق من اعتماد المفتش.",503);
   rows=await response.json();
  }catch(_){return error("تعذر الاتصال بسجل اعتماد المفتشين.",503)}
  const p=rows?.[0];
  const email=primaryUser.email.toLowerCase().trim();
  if(rows.length!==1||!p||p.id!==primaryUser.id||p.approved!==true||
     p.account_status!=="approved"||
     !["IFEP","ITP"].includes(String(p.profession||""))||
     String(p.email||"").toLowerCase().trim()!==email)
   return error("الدخول متاح للمفتشين البيداغوجيين المعتمدين فقط.",403);

  const db=admin();
  // QA Auth supplies the JWT and refresh token; we do not forge JWTs.
  // Existing QA accounts with this VERIFIED email keep their user ID/missions.
  const {data:magic,error:generateError}=await db.auth.admin.generateLink({
   type:"magiclink",email
  });
  const qaUser=magic?.user,otp=magic?.properties?.hashed_token;
  if(generateError||!qaUser?.id||!otp)
   return error("تعذر تجهيز جلسة المفتش في بيئة QA.",503);
  if(qaUser.app_metadata?.account_type==="titularisation_temporary")
   return error("لا يمكن تحويل حساب عضو مؤقت إلى مفتش.",403);

  const {data:current,error:profileError}=await db.from("inspector_profiles")
   .select("id,approved,account_status,is_admin")
   .eq("id",qaUser.id).maybeSingle();
  if(profileError)return error("تعذر قراءة اعتماد المفتش في QA.",503);
  if(["suspended","rejected"].includes(current?.account_status||""))
   return error("هذا الحساب موقوف في بيئة الاختبار.",403);
  const [qaBinding,prodBinding]=await Promise.all([
   db.from("qa_federated_inspector_links").select("qa_user_id,production_user_id,federation_only")
    .eq("qa_user_id",qaUser.id).maybeSingle(),
   db.from("qa_federated_inspector_links").select("qa_user_id,production_user_id,federation_only")
    .eq("production_user_id",primaryUser.id).maybeSingle()
  ]);
  if(qaBinding.error||prodBinding.error)
   return error("تعذرت قراءة رابطة حساب المفتش.",503);
  if((qaBinding.data&&qaBinding.data.production_user_id!==primaryUser.id)||
     (prodBinding.data&&prodBinding.data.qa_user_id!==qaUser.id))
   return error("حساب المفتش مربوط بهوية مختلفة، يلزم التدخل الإداري.",409);

  const start=new Date();
  const federationOnly=qaBinding.data?.federation_only??!(current?.approved===true);
  const {error:linkError}=await db.from("qa_federated_inspector_links").upsert({
   qa_user_id:qaUser.id,production_user_id:primaryUser.id,
   federation_only:federationOnly,
   expires_at:new Date(start.getTime()+QA_FEDERATION_TTL_MS).toISOString(),
   last_verified_at:start.toISOString()
  },{onConflict:"qa_user_id"});
  if(linkError)return error("تعذر ربط حساب المفتش بصورة آمنة.",503);

  const {error:updateError}=await db.from("inspector_profiles").upsert({
   id:qaUser.id,email,
   first_name:String(p.first_name||"").slice(0,120),
   last_name:String(p.last_name||"").slice(0,120),
   district:String(p.district||"").slice(0,120),
   profession:String(p.profession),approved:true,account_status:"approved",
   is_admin:current?.is_admin===true
  },{onConflict:"id"});
  if(updateError)return error("تعذر تهيئة ملف المفتش.",503);
  const {data:authResult,error:verifyError}=await userClient().auth.verifyOtp({
   token_hash:otp,type:"magiclink"
  });
  if(verifyError||!authResult.session||authResult.user?.id!==qaUser.id)
   return error("تعذر إصدار جلسة الدخول الخاصة بـQA.",503);
  return json({
   access_token:authResult.session.access_token,
   refresh_token:authResult.session.refresh_token,
   expires_in:authResult.session.expires_in,
   user:{id:qaUser.id},
   federated:true,
   federation_valid_until:new Date(start.getTime()+QA_FEDERATION_TTL_MS).toISOString()
  });
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
 if(action==="federated_inspector_login")return federatedInspectorLogin(String(body.production_access_token||""));
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
  if((action==="issue"||action==="rotate"||action==="issue_link"||action==="issue_direct"||action==="renew_week_link")&&
   (mission.status!=="draft"||new Date(mission.expires_at).getTime()<=Date.now()))
   return error("هذه المهمة مغلقة أو انتهت صلاحيتها.",409);
  if((action==="issue"||action==="issue_direct"||action==="issue_link"||action==="rotate"||action==="renew_week_link")&&
    mission.rubric_id==="lesson_derived_indicators_v1"&&mission.rubric_profile?.frozen!==true)
   return error("ثبّت أوزان المؤشرات الأربعة عشر قبل إصدار حساب أو دعوة.",409);
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
  if(action==="get_saved_link")return await retrieveLink(db,mission,seatCode);
  if(action==="issue_link")return await issueLink(db,id,mission,seatCode);
  if(action==="renew_week_link"){
   if(!IS_DISPOSABLE_QA)return error("هذه الوظيفة متاحة في مشروع الاختبار فقط.",403);
   return await issueLink(db,id,mission,seatCode,168);
  }
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
