import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {validMissionId,returnToQAMissionHref,selectQAMission}
 from "../qa-titularisation/mission-navigation.mjs";

const read=p=>readFileSync(p,"utf8");
const qa=read("qa-titularisation/app.mjs");
const editor=read("prototypes/titularisation-committee/app.mjs");
const html=read("qa-titularisation/report/index.html");
const entry=read("qa-titularisation/index.html");
const idA="12345678-1234-4abc-8abc-123456789abc";
const idB="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

test("P0 navigation: returning from the editor points to the exact QA mission, not generic root",()=>{
 assert.equal(validMissionId(idA),true);
 assert.equal(returnToQAMissionHref(idA),"../?mission="+idA+"#qa-mission-context");
 assert.equal(returnToQAMissionHref(idB),"../?mission="+idB+"#qa-mission-context");
 assert.equal(returnToQAMissionHref("invalid"),"../");
 assert.equal(returnToQAMissionHref(idA+"?token=secret"),"../");
 assert.equal(returnToQAMissionHref(null),"../");
});

test("P0 navigation: requested mission is selected only from authenticated inspector's own mission list",()=>{
 const missions=[{id:idB,title:"Other"},{id:idA,title:"My mission"}];
 assert.equal(selectQAMission(missions,"",idA),idA);
 assert.equal(selectQAMission(missions,"",idB),idB);
 assert.equal(selectQAMission(missions,idB,idA),idB);
 assert.equal(selectQAMission(missions,"","ffffffff-ffff-4fff-8fff-ffffffffffff"),idB);
 assert.equal(selectQAMission([],"",idA),"");
 assert.equal(selectQAMission(missions,"malformed",idA),idA);
});

test("P0 navigation: both top header and cloud-save area provide a return control",()=>{
 assert.match(html,/id="qa-return-to-mission-top"/);
 assert.match(html,/id="qa-return-to-mission-bottom"/);
 assert.match(html,/id="qa-return-nav" hidden/);
 assert.match(html,/لوحة مهام لجنة الترسيم QA/);
 assert.match(html,/id="cloud-draft-save"/);
 assert.match(editor,/function connectQAMissionReturn\(\)/);
 assert.match(editor,/returnToQAMissionHref\(linkedMissionId\)/);
 assert.match(editor,/\["qa-return-to-mission-top","qa-return-to-mission-bottom"\]/);
 assert.match(editor,/link\.href=destination;link\.hidden=false/);
 assert.match(editor,/qaReport\|\|!validMissionId\(linkedMissionId\)/);
});

test("P0 navigation: leaving during save is blocked, and unsaved changes prompt confirmation",()=>{
 assert.match(editor,/if\(cloudDraftBusy\)\{[\s\S]*?event\.preventDefault\(\)/);
 assert.match(editor,/cloudDraftDirty&&!confirm\(/);
 assert.match(editor,/توجد تعديلات على التقرير والمحضر لم تُحفظ/);
 assert.match(editor,/if\(state===snapshot\)\{[\s\S]*?cloudDraftDirty=false/);
 assert.match(editor,/cloudDraftDirty=true/);
});

test("P0 navigation: dashboard reselects requested mission and scrolls to its edit panel",()=>{
 assert.match(qa,/requestedMissionFromLink=new URLSearchParams/);
 assert.match(qa,/selectQAMission\(missions,selected,requestedMissionFromLink\)/);
 assert.match(qa,/if\(selected!==id\)return/);
 assert.match(qa,/id="qa-mission-context"|box\.id="qa-mission-context"/);
 assert.match(qa,/location\?\.hash==="#qa-mission-context"/);
 assert.match(qa,/scrollIntoView\?\.\(\{block:"start"\}\)/);
 assert.match(entry,/app\.mjs\?v=p05-qa-task-first-20261106/);
 assert.match(html,/app\.mjs\?v=p04-qa-mission-return-20261106/);
});

test("P0 navigation: production editor, session, and report renderers remain untouched",()=>{
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","qa-titularisation/app.mjs"]));
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","prototypes/titularisation-committee/app.mjs"]));
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","qa-titularisation/mission-navigation.mjs"]));
 assert.match(qa,/official_report03_cloud_session_v1/);
 assert.match(editor,/saveCloudCommitteeReportDraft\(linkedMissionId,payload,expected\)/);
 assert.doesNotMatch(read("qa-titularisation/mission-navigation.mjs"),/access_token|refresh_token|password|credential/);
});
