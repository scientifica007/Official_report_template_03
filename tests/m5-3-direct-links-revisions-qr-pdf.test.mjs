import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildInvitationPdf} from "../qa-titularisation/invitation-pdf.mjs";
const read=p=>readFileSync(p,"utf8");
const sql=read("supabase/migrations/008_titularisation_member_links_and_revisions.sql");
const edge=read("supabase/functions/titularisation-access/index.ts");
const member=read("committee-member/app.mjs");
const qa=read("qa-titularisation/app.mjs");
const html=read("qa-titularisation/index.html");
const prod=read("cloud-config.js");
test("M5.3: random opaque link secret is stored hashed, scoped and revocable",()=>{
 assert.match(sql,/create table public\.titularisation_member_links/);
 assert.match(sql,/token_hash text not null unique/);
 assert.match(sql,/expires_at timestamptz not null/);
 assert.match(sql,/revoked_at timestamptz/);
 assert.match(sql,/alter table public\.titularisation_member_links enable row level security/);
 assert.match(sql,/revoke all on public\.titularisation_member_links from public,anon,authenticated/);
 assert.match(edge,/const secret=freshLinkToken\(\)/);
 assert.match(edge,/const digest=await hex\(secret\)/);
 assert.match(edge,/\.eq\("token_hash",digest\)/);
 assert.match(edge,/Math\.min\(Date\.parse\(mission\.expires_at\),Date\.now\(\)\+24\*60\*60\*1000\)/);
 assert.match(edge,/#access=/);
 assert.match(edge,/Date\.parse\(link\.expires_at\)<=Date\.now\(\)/);
 assert.match(edge,/seat\.status!=="active"/);
 assert.match(edge,/mission\?\.status!=="draft"/);
 assert.match(edge,/result\.user\?\.id!==seat\.auth_user_id/);
 assert.match(edge,/auth\.auth\.verifyOtp/);
 assert.match(edge,/auth\.admin\.generateLink/);
 assert.match(edge,/action==="login_link"/);
 assert.match(edge,/action==="issue_direct"/);
 assert.match(edge,/app_metadata:\{account_type:"titularisation_temporary"\}/);
});
test("M5.3: contributor resubmission keeps historical revision and rejects silent draft downgrade",()=>{
 assert.match(sql,/create table public\.titularisation_contribution_revisions/);
 assert.match(sql,/create trigger titularisation_archive_before_update/);
 assert.match(sql,/new\.revision<>old\.revision\+1/);
 assert.match(sql,/old\.mission_id,old\.seat_code,old\.revision,old\.payload/);
 assert.match(sql,/if v_prev_status='submitted' and not p_submit then/);
 assert.match(sql,/revision=public\.titularisation_contributions\.revision\+1/);
 assert.match(sql,/public\.is_active_titularisation_seat\(mission_id,seat_code\)/);
 assert.match(sql,/public\.is_titularisation_owner\(mission_id\)/);
 assert.match(member,/حفظ التصحيح وإعادة إرساله/);
 assert.match(member,/أُرسلت مساهمتك بنجاح|مساهمتك مرسلة بالفعل/);
 assert.doesNotMatch(member,/if\(submitted\)area\.disabled=true/);
 assert.match(member,/p_submit:finalize/);
});
test("M5.3: default invite is password free; optional password shorter",()=>{
 assert.match(edge,/makeUsername\(\)\{return "cm-"\+randomCode\(12\)\}/);
 assert.match(edge,/randomBytes\(16\)/);
 assert.match(qa,/إنشاء رابط مباشر للعضو \(دون كلمة مرور\)/);
 assert.match(qa,/توليد رابط مباشر جديد/);
 assert.match(qa,/إصدار حساب بكلمة مرور \(بديل اختياري\)/);
 assert.match(qa,/await edge\("issue_direct"/);
 assert.match(qa,/await edge\("issue_link"/);
 assert.match(member,/history\.replaceState\(null,"",location\.pathname\+location\.search\)/);
 assert.match(member,/action:"login_link"/);
 assert.match(member,/saveSession\(\{\.\.\.result/);
 assert.match(prod,/temporaryCommitteeEnabled: false/);
});
test("M5.3: QR local, PDF downloaded with a real clickable link annotation",async()=>{
 assert.match(html,/vendor\/qrcodegen\.min\.js/);
 assert.match(qa,/qrCanvas\(url,360\)/);
 assert.match(qa,/downloadInvitationPdf/);
 const oldDocument=globalThis.document,oldQr=globalThis.qrcodegen;
 try{
  globalThis.qrcodegen={QrCode:{
   Ecc:{MEDIUM:{}},encodeText:()=>({size:2,getModule:(x,y)=>x===y})
  }};
  globalThis.document={createElement:tag=>{
   assert.equal(tag,"canvas");
   return {width:0,height:0,getContext(){return {
    fillStyle:"",direction:"rtl",textAlign:"center",font:"",
    fillRect(){},fillText(){},drawImage(){}
   }},toDataURL(){return "data:image/jpeg;base64,"+btoa("fake-jpeg-binary")}}
  }};
  const url="https://scientifica007.github.io/Official_report_template_03/qa-titularisation/member/?mission=test&seat=member1#access=EXAMPLE_FAKE";
  const pdf=buildInvitationPdf({url,title:"تجربة",seat:"العضو الأول",expiresAt:"2026-11-03T10:00:00Z"});
  assert.equal(pdf.type,"application/pdf");
  const pdfString=await pdf.text();
  assert.match(pdfString,/%PDF-1\.4/);
  assert.match(pdfString,/\/Subtype \/Link/);
  assert.match(pdfString,/\/S \/URI/);
  assert.ok(pdfString.includes("#access=EXAMPLE_FAKE"));
  assert.match(pdfString,/\/Subtype \/Image/);
  assert.match(pdfString,/startxref/);
 }finally{
  globalThis.document=oldDocument;globalThis.qrcodegen=oldQr;
 }
});
