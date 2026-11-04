import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";

const read=p=>readFileSync(p,"utf8");
const sql=read("supabase/migrations/013_qa_mission_7day_extension.sql");
const app=read("qa-titularisation/app.mjs");
const edge=read("supabase/functions/titularisation-access/index.ts");
const qaConfig=read("qa-titularisation/config.js");
const prod=read("cloud-config.js");

test("M5.9: only the approved inspector owning an open mission may extend exactly 7 days",()=>{
 assert.match(sql,/create or replace function public\.extend_titularisation_qa_mission_7_days\(/);
 assert.match(sql,/public\.is_titularisation_owner\(p_mission_id\)/);
 assert.match(sql,/select auth\.uid\(\)/);
 assert.match(sql,/where id=p_mission_id for update/);
 assert.match(sql,/v_mission\.status <> 'draft'/);
 assert.match(sql,/v_mission\.closed_at is not null/);
 assert.match(sql,/greatest\(now\(\),v_mission\.expires_at\)\+interval '7 days'/);
 assert.match(sql,/v_expiry>v_mission\.created_at\+interval '30 days'/);
 assert.match(sql,/grant execute on function public\.extend_titularisation_qa_mission_7_days\(uuid\)\s+to authenticated/);
 assert.match(sql,/revoke all on function public\.extend_titularisation_qa_mission_7_days\(uuid\)\s+from public,anon,authenticated/);
});
test("M5.9: extending existing seat expiry never changes contributions, revoked seats or prior links",()=>{
 assert.match(sql,/update public\.titularisation_seats set expires_at=v_expiry/);
 assert.match(sql,/where mission_id=p_mission_id and status='active' and revoked_at is null/);
 assert.doesNotMatch(sql,/update public\.titularisation_contributions/);
 assert.doesNotMatch(sql,/delete from public\.titularisation_contributions/);
 assert.doesNotMatch(sql,/update public\.titularisation_member_links/);
 assert.match(sql,/kind,description/);
 assert.match(sql,/'mission_extended'/);
 assert.match(sql,/titularisation_access_events_kind_check/);
});
test("M5.9: renewed link action only runs in the disposable QA environment with owner token",()=>{
 assert.match(edge,/IS_DISPOSABLE_QA=PROJECT_URL\.replace/);
 assert.match(edge,/npxwshvcrowbfoiqyrwx\.supabase\.co/);
 assert.match(edge,/if\(action==="renew_week_link"\)/);
 assert.match(edge,/if\(!IS_DISPOSABLE_QA\)return error/);
 assert.match(edge,/return await issueLink\(db,id,mission,seatCode,168\)/);
 assert.match(edge,/if\(validityHours!==24&&\(!IS_DISPOSABLE_QA\|\|validityHours!==168\)\)/);
 assert.match(edge,/await requireOwner\(token,missionId\)/);
 assert.match(edge,/mission\.status!=="draft"/);
 assert.match(edge,/Date\.parse\(seat\.expires_at\)<=Date\.now\(\)/);
 assert.match(edge,/const secret=freshLinkToken\(\)/);
 assert.match(edge,/const sealed=await sealInvite\(secret\)/);
 assert.match(edge,/\.upsert\(\{/);
 assert.match(edge,/await record\(db,mission\.id,seatCode,actor,"link_issued"\)/);
});
test("M5.9: QA UX renews mission and reissues ONLY active member links, with safe retry",()=>{
 assert.match(app,/button\("تمديد المهمة 7 أيام وتجديد روابط الأعضاء"/);
 assert.match(app,/rpc\("extend_titularisation_qa_mission_7_days"/);
 assert.match(app,/p_mission_id:missionId/);
 assert.match(app,/seatRows\.filter\(s=>s\.status==="active"\)/);
 assert.match(app,/edge\("renew_week_link"/);
 assert.match(app,/button\("تجديد روابط الأعضاء فقط دون تمديد إضافي"/);
 assert.match(app,/const renewal=await refreshExistingSeatInvitations\(missionId\)/);
 assert.match(app,/الروابط القديمة لا تُستعاد/);
 assert.match(app,/عرض رابط الدخول المحفوظ \+ QR \+ PDF/);
 assert.match(app,/downloadInvitationPdf/);
 assert.match(app,/mission\.status==="draft"/);
 assert.match(app,/seatNames\[x\.seat\]/);
});
test("M5.9: QA-only service, old renderer and production Supabase config untouched",()=>{
 assert.match(qaConfig,/qaOnly:true/);
 assert.match(qaConfig,/npxwshvcrowbfoiqyrwx\.supabase\.co/);
 assert.match(prod,/temporaryCommitteeEnabled: false/);
 assert.doesNotMatch(app,/SERVICE_KEY|sb_secret_|SUPABASE_SERVICE_ROLE_KEY/);
 for(const file of ["qa-titularisation/app.mjs","qa-titularisation/invitation-pdf.mjs",
 "committee-member/app.mjs"])assert.doesNotThrow(()=>
  execFileSync(process.execPath,["--check",file],{stdio:"pipe"}));
});
