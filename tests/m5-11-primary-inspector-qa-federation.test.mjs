import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const read=p=>readFileSync(p,"utf8");
const qa=read("qa-titularisation/app.mjs");
const html=read("qa-titularisation/index.html");
const config=read("qa-titularisation/config.js");
const edge=read("supabase/functions/titularisation-access/index.ts");
const sql=read("supabase/migrations/014_qa_approved_inspector_federation.sql");
const prod=read("cloud-config.js");

test("M5.11: QA offers direct existing-primary-session sign-in and primary credentials as fallback",()=>{
 assert.match(qa,/MAIN_SESSION_KEY="official_report03_cloud_session_v1"/);
 assert.match(qa,/activePrimarySession\(\)/);
 assert.match(qa,/localStorage\.getItem\(MAIN_SESSION_KEY\)/);
 assert.match(qa,/Date\.now\(\)\+60000/);
 assert.match(qa,/primaryPasswordToken\(email,password\)/);
 assert.match(qa,/auth\/v1\/token\?grant_type=password/);
 assert.match(qa,/federated_inspector_login/);
 assert.match(qa,/production_access_token:token/);
 assert.match(qa,/دخول مباشر بحسابي المفتوح في المنصة الرئيسية/);
 assert.match(qa,/التحقق والدخول إلى QA/);
 assert.match(qa,/الدخول بالحساب التجريبي السابق/);
 assert.match(qa,/password\.value=""/);
 assert.match(qa,/pPassword\.value=""/);
 assert.doesNotMatch(qa,/production_refresh_token/);
 assert.doesNotMatch(qa,/location\.(?:href|search)\s*=.*access_token/);
});

test("M5.11: client stores only its own issued QA session",()=>{
 assert.match(qa,/saveSession\(\{access_token:result\.access_token,refresh_token:result\.refresh_token/);
 assert.match(qa,/refreshProfile\(\)/);
 assert.match(qa,/refreshData\(\)/);
 assert.match(qa,/federation_required===true/);
 assert.match(qa,/qa_federated_inspector_links/);
 assert.match(qa,/Date\.parse\(links\[0\]\.expires_at\)<=Date\.now\(\)/);
 assert.match(qa,/expiresAt:Date\.now\(\)\+Number\(result\.expires_in\|\|3600\)\*1000/);
 assert.doesNotMatch(qa,/localStorage\.setItem\(MAIN_SESSION_KEY/);
});

test("M5.11: server validates authentic primary session, APPROVAL, and only IFEP or ITP",()=>{
 assert.match(edge,/IS_DISPOSABLE_QA/);
 assert.match(edge,/async function federatedInspectorLogin\(primaryToken:string\)/);
 assert.match(edge,/main\.auth\.getUser\(primaryToken\)/);
 assert.match(edge,/primaryUser\.email_confirmed_at/);
 assert.match(edge,/select:"id,email,first_name,last_name,profession,district,work_district_id,is_admin,approved,account_status"/);
 assert.match(edge,/Authorization:"Bearer "\+primaryToken/);
 assert.match(edge,/p\.approved!==true/);
 assert.match(edge,/p\.account_status!=="approved"/);
 assert.match(edge,/!\["IFEP","ITP"\]\.includes/);
 assert.match(edge,/qaUser\.app_metadata\?\.account_type==="titularisation_temporary"/);
 assert.doesNotMatch(edge,/user_metadata\?.*profession/);
 assert.doesNotMatch(edge,/SUPABASE_SERVICE_ROLE_KEY.*PRIMARY_URL/);
 assert.match(edge,/PRIMARY_PUBLIC_KEY="sb_publishable_/);
 assert.match(edge,/const PRIMARY_URL="https:\/\/uxtsyzyotnohxvopgcmh\.supabase\.co"/);
 assert.match(edge,/if\(!IS_DISPOSABLE_QA\)return error/);
});

test("M5.11: verified email reuses existing QA identity, preserving previous missions",()=>{
 assert.match(edge,/db\.auth\.admin\.generateLink\(\{\s*type:"magiclink",email/);
 assert.match(edge,/qaUser=magic\?\.user/);
 assert.match(edge,/db\.from\("qa_federated_inspector_links"\)\.upsert/);
 assert.match(edge,/if\(\(qaBinding\.data&&qaBinding\.data\.production_user_id!==primaryUser\.id\)/);
 assert.match(edge,/db\.from\("inspector_profiles"\)\.upsert/);
 assert.match(edge,/federation_required:federationOnly/);
 assert.match(edge,/userClient\(\)\.auth\.verifyOtp\(\{\s*token_hash:otp,type:"magiclink"/);
 assert.match(edge,/authResult\.user\?\.id!==qaUser\.id/);
 assert.doesNotMatch(edge.slice(edge.indexOf("async function federatedInspectorLogin"),edge.indexOf("Deno.serve")),/db\.auth\.admin\.createUser\(/g);
});

test("M5.11: only QA gains linkage table with fail-closed expiry and strict read policy",()=>{
 assert.match(sql,/QA ONLY/);
 assert.match(sql,/create table if not exists public\.qa_federated_inspector_links/);
 assert.match(sql,/production_user_id uuid not null unique/);
 assert.match(sql,/federation_required boolean not null default false/);
 assert.match(sql,/alter table public\.qa_federated_inspector_links enable row level security/);
 assert.match(sql,/revoke all on table public\.qa_federated_inspector_links from public, anon, authenticated/);
 assert.match(sql,/using \(qa_user_id = \(select auth\.uid\(\)\)\)/);
 assert.match(sql,/p\.federation_required = false/);
 assert.match(sql,/f\.federation_only = true/);
 assert.match(sql,/f\.expires_at > now\(\)/);
 assert.match(edge,/QA_FEDERATION_TTL_MS=12\*60\*60\*1000/);
 assert.match(edge,/inspector\.federation_required===true/);
 assert.match(config,/qaOnly:true/);
 assert.match(config,/npxwshvcrowbfoiqyrwx\.supabase\.co/);
 assert.match(config,/primarySupabaseUrl:"https:\/\/uxtsyzyotnohxvopgcmh\.supabase\.co"/);
 assert.match(prod,/temporaryCommitteeEnabled: false/);
});

test("M5.11: QR, member scoring, documents and official production configuration remain isolated",()=>{
 assert.match(html,/src="\.\/config\.js\?v=m511-primary-inspectors"/);
 assert.match(html,/src="\.\/app\.mjs\?v=p05-qa-task-first-20261106"/);
 assert.doesNotMatch(html,/src="\.\.\/cloud\.js"/);
 assert.match(edge,/if\(action==="federated_inspector_login"\)/);
 assert.doesNotMatch(qa,/document\.cookie\s*=/);
 assert.doesNotMatch(sql,/alter table public\.titularisation_missions/);
 assert.doesNotMatch(sql,/drop table/i);
 for(const path of ["qa-titularisation/app.mjs","qa-titularisation/config.js"])
  assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path],{stdio:"pipe"}));
});
