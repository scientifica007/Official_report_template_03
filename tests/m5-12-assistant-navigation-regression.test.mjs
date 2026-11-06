import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";

const read=path=>readFileSync(path,"utf8");
const qa=read("qa-titularisation/app.mjs");
const inspector=read("prototypes/titularisation-committee/app.mjs");
const qaHtml=read("qa-titularisation/index.html");
const reportHtml=read("qa-titularisation/report/index.html");
const member=read("committee-member/app.mjs");

test("M5.12 discoverability: inspector dashboard exposes an explicit private assistant path",()=>{
 assert.match(qa,/function renderDashboard\(\)/);
 assert.match(qa,/const submittedCount=contributions\.filter\(c=>c\.status==="submitted"\)\.length/);
 assert.match(qa,/if\(submittedCount\)\{/);
 assert.match(qa,/فتح مساعد تركيب التقديرات — للمفتش فقط/);
 assert.match(qa,/assistantLink\.href="\.\/report\/\?mission="\+encodeURIComponent\(selected\)\+"&assistant=1"/);
 assert.match(qa,/لا توجد مساهمات مرسلة نهائيًا/);
 assert.match(qa,/choose\.append\(assistantEntry\)/);
 assert.doesNotMatch(member,/assistant-entry|assistantLink|مساعد المفتش لتركيب/);
});

test("M5.12 discoverability: helper path requires actual import and successful owner check",()=>{
 assert.match(inspector,/const assistantRequested=qaReport&&new URLSearchParams\(location\.search\)\.get\("assistant"\)==="1"/);
 assert.match(inspector,/if\(qaReport\)\{\s*try\{\s*const \{loadInspectorSynthesisSources\}/);
 assert.match(inspector,/await synthesisReview\.activate\(id\)/);
 assert.match(inspector,/if\(!synthesisReview\.panel\.hidden\)\{/);
 assert.match(inspector,/synthesisReview\.panel\.scrollIntoView\?\./);
 assert.match(inspector,/مساعد التركيب متاح لصاحب المهمة فقط/);
 assert.match(inspector,/اضغط «استيراد المساهمات المرسلة»/);
 assert.doesNotMatch(inspector,/const assistantRequested=.*&&.*\|\|true/);
});

test("M5.12 discoverability: QA report links and script revisions remain consistent",()=>{
 assert.match(qaHtml,/app\.mjs\?v=p05-qa-task-first-20261106/);
 assert.match(reportHtml,/app\.mjs\?v=p04-qa-mission-return-20261106/);
 assert.match(read("prototypes/titularisation-committee/index.html"),/bootstrap\.mjs\?v=m514-semantic-20261104/);
 assert.match(read("prototypes/titularisation-committee/bootstrap.mjs"),/app\.mjs\?v=m514-semantic-20261104/);
 for(const path of ["qa-titularisation/app.mjs","prototypes/titularisation-committee/app.mjs"])
  assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path],{stdio:"pipe"}));
});
