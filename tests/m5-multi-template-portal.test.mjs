import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const cloud=read("cloud.js");
const portal=read("index.html");
const lab=read("prototypes/titularisation-committee/index.html");
const css=read("style.css");
const repoDoc=read("docs/M5_MULTI_TEMPLATE_PORTAL_AND_TEMP_COMMITTEE_ACCOUNTS.md");

test("M5: model library is available only inside approved-inspector portal route",()=>{
 assert.match(cloud,/\['templates','نماذج التفتيش','▣'\]/);
 assert.match(cloud,/currentPage==='templates'\?templatesView\(\):/);
 assert.match(cloud,/const approved=Boolean\(session\?\.access_token&&verifiedUser\(\)\)/);
 assert.match(cloud,/if\(!verifiedUser\(\)\)\{[\s\S]*?root\.innerHTML=guardedView\(\)/);
 assert.match(cloud,/if\(page==='admin'&&!profile\?\.is_admin\)return;/);
 assert.match(cloud,/if\(!verifiedUser\(\)\)return;/);
});
test("M5: launcher connects both models without changing their editor or storage",()=>{
 assert.match(cloud,/function templatesView\(\)/);
 assert.match(cloud,/تقرير التفتيش المعمق — النموذج 03/);
 assert.match(cloud,/data-cloud-action="nav" data-page="report"/);
 assert.match(cloud,/التفتيش قصد الترسيم — النموذج الأول/);
 assert.match(cloud,/href="\.\/prototypes\/titularisation-committee\/"/);
 assert.match(cloud,/target="_blank" rel="noopener noreferrer"/);
 assert.match(cloud,/لا تُحفظ مسوداته على Supabase/);
 assert.match(cloud,/رابطه العام ليس حسابًا محميًا/);
 assert.match(cloud,/النموذج الشخصي الثاني — مخطط مستقبلًا/);
 assert.match(lab,/href="\.\.\/\.\.\/"/);
 assert.match(lab,/العودة إلى منصة التفتيش والتقويم المهني/);
});
test("M5: portal announces multiple models but report 03 interface remains separately labeled",()=>{
 assert.match(portal,/منصة التفتيش والتقويم المهني \| نماذج التفتيش/);
 assert.match(cloud,/منصة التفتيش والتقويم المهني/);
 assert.match(portal,/وزارة التكوين والتعليم المهنيين — النموذج 03/);
 assert.match(portal,/id="print-root"/);
 assert.match(css,/\.portal-template-grid/);
 assert.match(css,/@media print\{\.portal-template-grid,\.portal-template-shortcut,\.portal-template-future\{display:none!important\}\}/);
});
test("M5: temporary accounts are not represented as active without backend and server-side RLS",()=>{
 assert.match(repoDoc,/حسابات أعضاء اللجنة الموقتة \*\*متطلب موثق ولم تُفعّل بعد\*\*/);
 assert.match(repoDoc,/Supabase Auth Admin API/);
 assert.match(repoDoc,/لا تخزين لكلمات المرور/);
 assert.match(repoDoc,/تُحفظ مساهماته في سجل المهمة/);
 assert.match(repoDoc,/رمز جلسة JWT/);
 assert.match(repoDoc,/ثلاثة مقاعد مستقلة/);
 assert.doesNotMatch(cloud,/sb_secret_[a-zA-Z0-9]{20,}/);
 assert.doesNotMatch(cloud,/["\x27]eyJhbGciOi[a-zA-Z0-9_-]+/);
 assert.doesNotMatch(lab,/data-login-member|password.*member/i);
});
test("M5: approved B19 outputs, footer and data engines remain available",()=>{
 const model=read("prototypes/titularisation-committee/document-model.mjs");
 const word=read("prototypes/titularisation-committee/docx-export.mjs");
 const preview=read("prototypes/titularisation-committee/preview.mjs");
 const styles=read("prototypes/titularisation-committee/print-layout-b5.css");
 assert.match(model,/candidateBirthDate/);
 assert.match(word,/minutesOpeningSegments/);
 assert.match(preview,/minutesOpeningSegments/);
 assert.match(styles,/bottom:-26mm!important/);
 assert.match(lab,/app\.mjs/);
 assert.match(read("prototypes/titularisation-committee/app.mjs"),/attachVoiceDictation/);
});
