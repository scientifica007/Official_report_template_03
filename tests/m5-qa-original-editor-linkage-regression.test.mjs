import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
const read=p=>readFileSync(p,"utf8");
const html=read("prototypes/titularisation-committee/index.html");
const bootstrap=read("prototypes/titularisation-committee/bootstrap.mjs");
const editor=read("prototypes/titularisation-committee/app.mjs");
const bridge=read("prototypes/titularisation-committee/committee-cloud-bridge.mjs");
const dashboard=read("qa-titularisation/app.mjs");
const qaConfig=read("qa-titularisation/config.js");
const prodConfig=read("cloud-config.js");
const qaReport=read("qa-titularisation/report/index.html");

test("QA legacy repair: original URL stays local unless the user explicitly selects ?qa=1",()=>{
 assert.match(html,/href="\?qa=1"/);
 assert.match(html,/id="qa-mode-link"/);
 assert.match(html,/id="local-mode-link"/);
 assert.match(html,/bootstrap\.mjs\?v=qa-link-20261104/);
 assert.match(bootstrap,/new URLSearchParams\(location\.search\)\.get\("qa"\)==="1"/);
 assert.match(bootstrap,/qaRequested\?"\.\.\/\.\.\/qa-titularisation\/config\.js":"\.\.\/\.\.\/cloud-config\.js"/);
 assert.match(bootstrap,/await import\("\.\/app\.mjs\?v=qa-link-20261104"\)/);
 assert.doesNotMatch(html,/src="\.\.\/\.\.\/qa-titularisation\/config\.js"/);
 assert.doesNotMatch(html,/src="\.\.\/\.\.\/cloud-config\.js"/);
 assert.match(bootstrap,/if\(!confirm\(/);
 assert.match(html,/صدّر|تصدير مسودة JSON/);
});

test("QA legacy repair: QA-only route never loads production credentials or member data implicitly",()=>{
 assert.match(bootstrap,/config\?\.qaOnly/);
 assert.match(bootstrap,/config\?\.temporaryCommitteeEnabled!==true/);
 assert.match(bootstrap,/npxwshvcrowbfoiqyrwx\.supabase\.co/);
 assert.match(qaConfig,/qaOnly:true/);
 assert.match(qaConfig,/temporaryCommitteeEnabled:true/);
 assert.match(prodConfig,/temporaryCommitteeEnabled: false/);
 assert.match(bridge,/sessionStorage\.getItem\(QA_SESSION\)/);
 assert.match(bridge,/scientifica_committee_qa_session_v1/);
 assert.match(editor,/const qaReport=.*qaOnly===true/);
 assert.match(editor,/if\(committeeCloudEnabled\(\)\)/);
 assert.match(editor,/loadCloudCommitteeSubmissions\(linked\)/);
 assert.match(editor,/mergeSubmittedCloudMembers\(input,mission,rows\)/);
});

test("QA legacy repair: mission dashboard can open original editor with selected mission in the SAME tab",()=>{
 assert.match(dashboard,/legacyLinked\.href="\.\.\/prototypes\/titularisation-committee\/\?qa=1&mission="\+encodeURIComponent\(selected\)/);
 assert.match(dashboard,/choose\.append\(legacyLinked\)/);
 assert.doesNotMatch(dashboard,/legacyLinked\.target="_blank"/);
 assert.match(bootstrap,/sessionStorage\.getItem\("scientifica_committee_qa_session_v1"\)/);
 assert.match(html,/href="\.\.\/\.\.\/qa-titularisation\/"/);
 assert.match(qaReport,/src="\.\.\/config\.js"/);
 assert.match(dashboard,/report\.href="\.\/report\/\?mission="/);
});

test("QA legacy repair: syntax checks for bootstrap and existing editor/bridge",()=>{
 for(const path of [
 "prototypes/titularisation-committee/bootstrap.mjs",
 "prototypes/titularisation-committee/app.mjs",
 "prototypes/titularisation-committee/committee-cloud-bridge.mjs",
 "qa-titularisation/app.mjs"
 ])assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",path],{stdio:"pipe"}));
});
