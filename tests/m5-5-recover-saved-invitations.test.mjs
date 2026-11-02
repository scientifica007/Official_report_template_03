import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const migration=read("supabase/migrations/010_recoverable_encrypted_member_invitations.sql");
const edge=read("supabase/functions/titularisation-access/index.ts");
const qa=read("qa-titularisation/app.mjs");
const production=read("cloud-config.js");
const renderer=read("qa-titularisation/invitation-pdf.mjs");

test("M5.5: reversible invitation storage uses authenticated AES-GCM, never plaintext",()=>{
 assert.match(migration,/add column if not exists sealed_token text/);
 assert.match(migration,/add column if not exists sealed_token_nonce text/);
 assert.match(migration,/sealed_token is null and sealed_token_nonce is null/);
 assert.match(edge,/Deno\.env\.get\("COMMITTEE_LINK_VAULT_SECRET"\)\|\|SERVICE_KEY/);
 assert.match(edge,/name:"HKDF",hash:"SHA-256"/);
 assert.match(edge,/name:"AES-GCM",length:256/);
 assert.match(edge,/randomBytes\(12\)/);
 assert.match(edge,/crypto\.subtle\.encrypt/);
 assert.match(edge,/crypto\.subtle\.decrypt/);
 assert.match(edge,/const sealed=await sealInvite\(secret\)/);
 assert.match(edge,/token_hash:digest/);
 assert.match(edge,/\.\.\.sealed,expires_at:expiry/);
 assert.doesNotMatch(edge,/token_plaintext|password_plaintext/);
});
test("M5.5: an owner retrieves SAME valid link only through JWT-verified Edge action",()=>{
 assert.match(edge,/const \{db,id,mission\}=await requireOwner\(token,missionId\)/);
 assert.match(edge,/if\(action==="get_saved_link"\)return await retrieveLink\(db,mission,seatCode\)/);
 assert.match(edge,/\.select\("token_hash,sealed_token,sealed_token_nonce,expires_at,revoked_at"\)/);
 assert.match(edge,/if\(link\.revoked_at\|\|Date\.parse\(link\.expires_at\)<=Date\.now\(\)\)/);
 assert.match(edge,/seat\.status!=="active"/);
 assert.match(edge,/if\(await hex\(raw\)!==link\.token_hash\)/);
 assert.match(edge,/recovered:true/);
 assert.match(edge,/الرابط القديم محفوظ كبصمة أمنية فقط/);
});
test("M5.5: user can redisplay old links/QR/PDF; reissue remains distinct",()=>{
 assert.match(qa,/عرض رابط الدخول المحفوظ \+ QR \+ PDF/);
 assert.match(qa,/await edge\("get_saved_link"/);
 assert.match(qa,/استُعيد نفس الرابط المحفوظ/);
 assert.match(qa,/توليد رابط مباشر جديد \(يلغي السابق\)/);
 assert.match(qa,/await edge\("issue_link"/);
 assert.match(qa,/qrCanvas\(url,360\)/);
 assert.match(qa,/downloadInvitationPdf/);
 assert.match(renderer,/\/Subtype \/Link/);
 assert.match(qa,/كلمة المرور السابقة لا يمكن استرجاعها/);
 assert.match(qa,/تغيير كلمة المرور/);
});
test("M5.5: does not expose vault fields to REST readers or production",()=>{
 assert.doesNotMatch(qa,/sealed_token|sealed_token_nonce|COMMITTEE_LINK_VAULT_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(production,/temporaryCommitteeEnabled: false/);
 assert.match(edge,/\.eq\("mission_id",mission\.id\)\.eq\("seat_code",seatCode\)/);
 assert.match(edge,/ALLOWED_ORIGIN\+"\/Official_report_template_03\/qa-titularisation\/member\//);
});
