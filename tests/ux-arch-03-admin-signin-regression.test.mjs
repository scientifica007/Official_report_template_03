import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=(path)=>readFileSync(path,"utf8");
const url=new URL("../prototypes/ux-arch-03/admin/api.mjs",import.meta.url);
const uid="11111111-1111-4111-8111-111111111111";
const adminId="22222222-2222-4222-8222-222222222222";
const SESSION="official_report03_cloud_session_v1";
const ADMIN_SESSION="official_report03_admin_session_v1";
const KEY="sb_publishable_local_test_key";
function memoryStorage(blocked=false){
 const state=new Map();
 return {
  getItem(k){if(blocked)throw Error("Storage blocked");return state.has(k)?state.get(k):null},
  setItem(k,v){if(blocked)throw Error("Storage blocked");state.set(k,String(v))},
  removeItem(k){if(blocked)throw Error("Storage blocked");state.delete(k)},
  raw(k){return state.get(k)||null}
 };
}
const session=(id,access="primary-token")=>({
 access_token:access,refresh_token:"refresh-for-"+id,user:{id},
 expires_at_ms:Date.now()+3_600_000
});
async function setup(t,id,{localBlocked=false,token=null,storedAdmin=null,primaryId=uid}={}){
 const local=memoryStorage(localBlocked),tab=memoryStorage();
 if(token){
  if(localBlocked)tab.setItem(SESSION,JSON.stringify(session(primaryId,token)));
  else local.setItem(SESSION,JSON.stringify(session(primaryId,token)));
 }
 if(storedAdmin)tab.setItem(ADMIN_SESSION,JSON.stringify(session(adminId,storedAdmin)));
 globalThis.window={REPORT03_CLOUD_CONFIG:{
  supabaseUrl:"https://uxtsyzyotnohxvopgcmh.supabase.co",
  publishableKey:KEY
 }};
 globalThis.localStorage=local;
 globalThis.sessionStorage=tab;
 const calls=[];
 globalThis.fetch=async(input,options={})=>{
  const path=String(input);
  const headers=options.headers||{};
  calls.push({path,auth:headers.Authorization,body:options.body});
  if(path.includes("/auth/v1/token?grant_type=password")){
   const body=JSON.parse(options.body);
   if(body.email==="admin@example.test"&&body.password==="correct secret")
    return new Response(JSON.stringify({
     access_token:"admin-password-token",refresh_token:"admin-refresh-token",
     user:{id:adminId},expires_in:3600
    }),{status:200,headers:{"Content-Type":"application/json"}});
   return new Response(JSON.stringify({msg:"invalid credentials"}),{
    status:400,headers:{"Content-Type":"application/json"}
   });
  }
  if(path.includes("/auth/v1/user")){
   const auth=headers.Authorization;
   const id=auth==="Bearer admin-password-token"||
    auth==="Bearer persisted-admin-token"?adminId:primaryId;
   return new Response(JSON.stringify({id}),{status:200,
    headers:{"Content-Type":"application/json"}});
  }
  throw Error("Unexpected request "+path);
 };
 const api=await import(url.href+"?test-case="+encodeURIComponent(id));
 return {api,local,tab,calls};
}
test("UX-ARCH-03: reuse existing main session stored in localStorage",async t=>{
 const {api,local,tab,calls}=await setup(t,"primary-local",{token:"primary-token",primaryId:adminId});
 api.startSession();
 assert.equal(api.sessionId(),adminId);
 await api.getUser();
 assert.equal(calls.at(-1).auth,"Bearer primary-token");
 assert.equal(tab.getItem(ADMIN_SESSION),null);
 assert.ok(local.getItem(SESSION).includes("primary-token"));
});
test("UX-ARCH-03: same-tab sessionStorage fallback works with localStorage unavailable",async t=>{
 const {api,tab,calls}=await setup(t,"primary-tab",{localBlocked:true,token:"tab-only-token",primaryId:adminId});
 api.startSession();
 assert.equal(api.sessionId(),adminId);
 await api.getUser();
 assert.equal(calls.at(-1).auth,"Bearer tab-only-token");
 assert.equal(tab.getItem(ADMIN_SESSION),null);
});
test("UX-ARCH-03: direct Admin sign-in does not overwrite active inspector session",async t=>{
 const {api,local,tab,calls}=await setup(t,"separate-admin",{token:"inspector-token"});
 api.startSession();
 assert.equal(api.sessionId(),uid);
 await api.signInAdmin("admin@example.test","correct secret");
 assert.equal(api.sessionId(),adminId);
 await api.getUser();
 assert.equal(calls.at(-1).auth,"Bearer admin-password-token");
 const primary=JSON.parse(local.getItem(SESSION));
 assert.equal(primary.user.id,uid,"inspector login preserved");
 const admin=JSON.parse(tab.getItem(ADMIN_SESSION));
 assert.equal(admin.user.id,adminId);
 assert.equal(admin.access_token,"admin-password-token");
 assert.doesNotMatch(JSON.stringify(admin),/correct secret|admin@example.test/);
});
test("UX-ARCH-03: direct Admin login works when no shared browser session exists",async t=>{
 const {api,local,tab}=await setup(t,"standalone");
 assert.throws(()=>api.startSession(),/لا توجد جلسة مشتركة/);
 await api.signInAdmin("admin@example.test","correct secret");
 assert.equal(api.sessionId(),adminId);
 assert.equal(local.getItem(SESSION),null);
 assert.ok(tab.getItem(ADMIN_SESSION));
});
test("UX-ARCH-03: failed Admin login never destroys the existing inspector session",async t=>{
 const {api,local,tab}=await setup(t,"failure",{token:"inspector-token"});
 api.startSession();
 await assert.rejects(()=>api.signInAdmin("wrong@example.test","bad password"),/لم يُقبل تسجيل الدخول/);
 assert.equal(api.sessionId(),uid);
 assert.equal(JSON.parse(local.getItem(SESSION)).user.id,uid);
 assert.equal(tab.getItem(ADMIN_SESSION),null);
});
test("UX-ARCH-03: main sidebar only shows Admin management navigation for admins",()=>{
 const portal=source("cloud.js");
 assert.match(portal,/profile\?\.is_admin\?\[[\s\S]*\['site_admin','إدارة الموقع'/);
 assert.match(portal,/if\(page==='site_admin'\)[\s\S]*if\(!profile\?\.is_admin\)return;/);
 assert.match(portal,/window\.location\.assign\('\.\/prototypes\/ux-arch-03\/admin\/'\)/);
 assert.doesNotMatch(portal,/location\.(?:href|assign)\([^)]*access_token/);
 assert.match(source("index.html"),/cloud\.js\?v=p12-create-form-20261107/);
});
test("UX-ARCH-03: direct Admin login UI uses password input and verifies role on server",()=>{
 const admin=source("prototypes/ux-arch-03/admin/app.mjs");
 const api=source("prototypes/ux-arch-03/admin/api.mjs");
 assert.match(admin,/id="admin-auth-form"/);
 assert.match(admin,/type="password"/);
 assert.match(admin,/await signInAdmin/);
 assert.match(admin,/await verifyAdmin\(\)/);
 assert.match(admin,/!p\?\.is_admin\|\|!p\.approved\|\|p\.account_status!=="approved"/);
 assert.match(api,/token\?grant_type=password/);
 assert.match(api,/sessionStorage\.setItem\(ADMIN_SESSION/);
 assert.match(source("prototypes/ux-arch-03/admin/index.html"),/app\.mjs\?v=uxarch03-admin-auth-1/);
});
