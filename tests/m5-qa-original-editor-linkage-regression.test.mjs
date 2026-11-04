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
 assert.match(html,/bootstrap\.mjs\?v=m512-assistant-entry-20261104/);
 assert.match(bootstrap,/new URLSearchParams\(location\.search\)\.get\("qa"\)==="1"/);
 assert.match(bootstrap,/qaRequested\?"\.\.\/\.\.\/qa-titularisation\/config\.js":"\.\.\/\.\.\/cloud-config\.js"/);
 assert.match(bootstrap,/await import\("\.\/app\.mjs\?v=m512-assistant-entry-20261104"\)/);
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

async function simulateBootstrap(search,withSession){
 const elements=new Map();
 for(const id of [
  "qa-mode-link","local-mode-link","local-mode-description",
  "qa-mode-description","simulated-members-description",
  "qa-members-description","qa-link-status","message"
 ])elements.set(id,{hidden:false,textContent:"",addEventListener(){}});
 const fakeWindow={};
 const imports=[];
 // Replace only module fetching, leaving routing and UI logic intact.
 const source=bootstrap.replaceAll("await import(","await importMock(");
 const execute=new Function("location","document","sessionStorage","window",
  "confirm","importMock","return (async()=>{"+source+"})()");
 await execute({search},
  {getElementById:id=>elements.get(id)||null},
  {getItem:key=>key==="scientifica_committee_qa_session_v1"&&withSession?
   JSON.stringify({access_token:"synthetic",refresh_token:"synthetic",userId:"synthetic"}):null},
  fakeWindow,()=>true,
  async path=>{
   imports.push(path);
   if(path==="../../qa-titularisation/config.js")
    fakeWindow.REPORT03_CLOUD_CONFIG={
     qaOnly:true,temporaryCommitteeEnabled:true,
     supabaseUrl:"https://npxwshvcrowbfoiqyrwx.supabase.co"
    };
   else if(path==="../../cloud-config.js")
    fakeWindow.REPORT03_CLOUD_CONFIG={temporaryCommitteeEnabled:false};
   else assert.match(path,/^\.\/app\.mjs\?v=/);
  }
 );
 return {imports,elements,config:fakeWindow.REPORT03_CLOUD_CONFIG};
}
test("QA legacy repair: bootstrap executes isolated config first in explicit QA mode",async()=>{
 const qa=await simulateBootstrap("?qa=1&mission=00000000-0000-0000-0000-000000000000",true);
 assert.deepEqual(qa.imports,[
  "../../qa-titularisation/config.js","./app.mjs?v=m512-assistant-entry-20261104"
 ]);
 assert.equal(qa.config.qaOnly,true);
 assert.equal(qa.elements.get("qa-mode-link").hidden,true);
 assert.equal(qa.elements.get("local-mode-link").hidden,false);
 assert.equal(qa.elements.get("simulated-members-description").hidden,true);
 assert.equal(qa.elements.get("qa-members-description").hidden,false);
 assert.equal(qa.elements.get("qa-link-status").textContent,"");
});
test("QA legacy repair: default URL uses only production-disabled local mode",async()=>{
 const local=await simulateBootstrap("",false);
 assert.deepEqual(local.imports,[
  "../../cloud-config.js","./app.mjs?v=m512-assistant-entry-20261104"
 ]);
 assert.equal(local.config.temporaryCommitteeEnabled,false);
 assert.equal(local.elements.get("qa-mode-link").hidden,false);
});
test("QA legacy repair: missing same-tab QA session displays explicit guidance",async()=>{
 const qa=await simulateBootstrap("?qa=1",false);
 assert.match(qa.elements.get("qa-link-status").textContent,/لا توجد جلسة مفتش QA/);
});
