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
const password=()=>Array.from(randomBytes(32),b=>
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
function makeUsername(){return "cm-"+randomCode(18)}
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
  user_metadata:{account_type:"titularisation_temporary"}
 });
 if(ce||!created.user)return error("تعذر إصدار بيانات الدخول.",503);
 const uid=created.user.id;
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
 const missionId=String(body.mission_id||"");
 const seatCode=String(body.seat_code||"");
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(missionId)||!seats.has(seatCode))
  return error("Invalid mission or seat",400);
 const token=authenticating(req);
 if(!token)return error("Authentication required",401);
 try{
  const {db,id,mission}=await requireOwner(token,missionId);
  if((action==="issue"||action==="rotate")&&
   (mission.status!=="draft"||new Date(mission.expires_at).getTime()<=Date.now()))
   return error("هذه المهمة مغلقة أو انتهت صلاحيتها.",409);
  // Revocation remains permitted AFTER closure, so the inspector can remove
  // all temporary accounts once the signed paper report has been printed.
  if(action==="issue"){
   const name=String(body.display_name||"").trim();
   if(name.length>160)return error("اسم العرض طويل.",400);
   return await provision(db,id,mission,seatCode,name);
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
