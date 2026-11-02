import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const html=read("qa-titularisation/index.html");
const js=read("qa-titularisation/app.mjs");
const config=read("qa-titularisation/config.js");
const member=read("qa-titularisation/member/index.html");
const sharedMember=read("committee-member/app.mjs");
const production=read("cloud-config.js");

test("M5-QA: standalone test shell does not load production cloud.js or account storage",()=>{
 assert.match(html,/مختبر حسابات لجان الترسيم/);
 assert.match(html,/noindex,nofollow,noarchive/);
 assert.match(html,/script src="\.\/config\.js"/);
 assert.match(html,/script type="module" src="\.\/app\.mjs"/);
 assert.doesNotMatch(html,/\bsrc="(?:\.\.\/)?cloud\.js"/);
 assert.match(js,/scientifica_committee_qa_session_v1/);
 assert.doesNotMatch(js,/official_report03_cloud_session_v1/);
});
test("M5-QA: public config points only at the separate QA Supabase, with default main config still disabled",()=>{
 assert.match(config,/npxwshvcrowbfoiqyrwx\.supabase\.co/);
 assert.match(config,/sb_publishable_/);
 assert.match(config,/temporaryCommitteeEnabled:true/);
 assert.match(config,/qaOnly:true/);
 assert.doesNotMatch(config,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_|uxtsyzyotnohxvopgcmh/i);
 assert.match(production,/uxtsyzyotnohxvopgcmh\.supabase\.co/);
 assert.match(production,/temporaryCommitteeEnabled: false/);
});
test("M5-QA: owner login checks approved professional inspector via JWT and RLS",()=>{
 assert.match(js,/\/auth\/v1\/token\?grant_type=password/);
 assert.match(js,/\/auth\/v1\/token\?grant_type=refresh_token/);
 assert.match(js,/const TOKEN_KEY="scientifica_committee_qa_session_v1"/);
 assert.match(js,/if\(!profile\?\.approved\|\|profile\.account_status!=="approved"\)/);
 assert.match(js,/Authorization="Bearer "/);
 assert.match(js,/auth:true/);
 assert.match(js,/\/rest\/v1\/rpc\/create_titularisation_mission/);
 assert.match(js,/\/functions\/v1\/titularisation-access/);
});
test("M5-QA: three separate seats, no credential tokens in link, secrets only in memory",()=>{
 assert.match(js,/const seats=\["member1","member2","member3"\]/);
 assert.match(js,/issued=await edge\("issue"/);
 assert.match(js,/issued=await edge\("rotate"/);
 assert.match(js,/await edge\("revoke"/);
 assert.match(js,/await rpc\("close_titularisation_mission"/);
 assert.match(js,/URL\("\.\/member\/\?mission="/);
 assert.doesNotMatch(js,/sessionStorage\.setItem\(.*issued/);
 assert.doesNotMatch(js,/localStorage/);
 assert.match(js,/issued=null/);
});
test("M5-QA: member portal loads shared tested voice and contribution code but QA config only",()=>{
 assert.match(member,/src="\.\.\/config\.js"/);
 assert.match(member,/src="\.\.\/\.\.\/committee-member\/app\.mjs"/);
 assert.match(member,/noindex,nofollow,noarchive/);
 assert.match(sharedMember,/titularisation_member_session_v1_/);
 assert.match(sharedMember,/save_titularisation_member_contribution/);
 assert.match(sharedMember,/attachVoiceDictation/);
 assert.match(sharedMember,/committeeEnabled|temporaryCommitteeEnabled/);
});
test("M5-QA: owner UI warns that 14-indicator accepted field rubric is not yet supported",()=>{
 assert.match(js,/14 مؤشرًا/);
 assert.match(js,/لا تستخدم بيانات ترسيم حقيقية/);
 assert.match(html,/بيئة اختبار فقط/);
});
