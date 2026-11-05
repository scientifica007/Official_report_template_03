import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {
 loadCloudCommitteeReportDraft,saveCloudCommitteeReportDraft
} from "../prototypes/titularisation-committee/committee-cloud-bridge.mjs";

const read=p=>readFileSync(p,"utf8");
const sql=read("supabase/migrations/024_p0_titularisation_report_draft_qa.sql");
const editor=read("prototypes/titularisation-committee/app.mjs");
const bridge=read("prototypes/titularisation-committee/committee-cloud-bridge.mjs");
const qaReport=read("qa-titularisation/report/index.html");

test("P0.2: report draft belongs to existing committee mission, never a second independent mission",()=>{
 assert.match(sql,/mission_id uuid primary key references public\.titularisation_missions\(id\)/);
 assert.match(sql,/public\.titularisation_report_drafts/);
 assert.match(sql,/owner_id uuid not null references auth\.users\(id\)/);
 assert.match(sql,/alter table public\.titularisation_report_drafts enable row level security/);
 assert.match(sql,/public\.is_titularisation_owner\(mission_id\)/);
 assert.match(sql,/grant select on table public\.titularisation_report_drafts to authenticated/);
 assert.doesNotMatch(sql,/grant (insert|update|delete|all) on table public\.titularisation_report_drafts to authenticated/i);
});

test("P0.2: compare-and-swap protects newer drafts and mission rubric including pinned analytical weights",()=>{
 assert.match(sql,/p_expected_revision bigint/);
 assert.match(sql,/p_expected_revision=0/);
 assert.match(sql,/on conflict \(mission_id\) do nothing returning revision/);
 assert.match(sql,/d\.revision=p_expected_revision/);
 assert.match(sql,/revision=d\.revision\+1/);
 assert.match(sql,/Report draft revision conflict/);
 assert.match(sql,/is_titularisation_owner\(p_mission_id\)/);
 assert.match(sql,/p_payload->>'rubricId' is distinct from v_mission\.rubric_id/);
 assert.match(sql,/is distinct from v_mission\.rubric_profile->'weights'/);
 assert.match(sql,/octet_length\(p_payload::text\)/);
 assert.match(sql,/revoke all on function public\.save_titularisation_report_draft/);
});

test("P0.2: QA editor restores before allowing save, tracks changes and never overwrites a newer version",()=>{
 assert.match(qaReport,/id="cloud-draft-save"/);
 assert.match(qaReport,/id="cloud-draft-status"/);
 assert.match(qaReport,/p02-cloud-draft-20261105/);
 assert.match(editor,/Promise\.all\(\[loadCloudCommitteeSubmissions\(linked\),loadCloudCommitteeReportDraft\(linked\)\]\)/);
 assert.match(editor,/restoreCommittee\(saved\.payload\)/);
 assert.match(editor,/cloudDraftRevision=saved\?\.revision\|\|0/);
 assert.match(editor,/if\(state!==untouched\)/);
 assert.match(editor,/if\(state===snapshot\)/);
 assert.match(editor,/flagCloudDraftDirty\(\)/);
 assert.match(editor,/saveCloudCommitteeReportDraft\(linkedMissionId,payload,expected\)/);
 assert.match(editor,/picker\.disabled=true/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","prototypes/titularisation-committee/app.mjs"]));
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","prototypes/titularisation-committee/committee-cloud-bridge.mjs"]));
});

test("P0.2: QA browser bridge reuses QA-only inspector session and handles revision conflicts",async()=>{
 const url="https://npxwshvcrowbfoiqyrwx.supabase.co";
 const original={window:globalThis.window,sessionStorage:globalThis.sessionStorage,fetch:globalThis.fetch};
 const id="11111111-2222-4333-8444-555555555555";
 const calls=[];
 try{
  globalThis.window={REPORT03_CLOUD_CONFIG:{qaOnly:true,temporaryCommitteeEnabled:true,
   supabaseUrl:url,publishableKey:"sb_publishable_testonly_notasecret"}};
  globalThis.sessionStorage={getItem:key=>key==="scientifica_committee_qa_session_v1"?
   JSON.stringify({access_token:"qa-test-token",refresh_token:"qa-test-refresh",userId:"test-id",
    expiresAt:Date.now()+3600000}):null};
  globalThis.fetch=async(resource,opts={})=>{
   calls.push({resource,opts});
   if(String(resource).includes("titularisation_report_drafts?"))
    return {ok:true,json:async()=>[]};
   const payload=JSON.parse(opts.body);
   if(payload.p_expected_revision===0)return {ok:true,json:async()=>1};
   return {ok:false,status:409,json:async()=>({code:"40001",message:"conflict"})};
  };
  assert.equal(await loadCloudCommitteeReportDraft(id),null);
  const payload={schema:"titularisation-committee-lab-v1",rubricId:"lesson_grouped_5_v1",meta:{},final:{}};
  assert.equal(await saveCloudCommitteeReportDraft(id,payload,0),1);
  await assert.rejects(saveCloudCommitteeReportDraft(id,payload,1),/صفحة أو جهاز آخر/);
  assert.equal(calls.length,3);
  assert.ok(calls.every(c=>c.opts?.headers?.Authorization==="Bearer qa-test-token"));
  assert.ok(calls.every(c=>String(c.resource).startsWith(url+"/rest/v1/")));
  assert.equal(calls[1].opts.method,"POST");
  await assert.rejects(saveCloudCommitteeReportDraft("not-a-uuid",payload,0),/معرّف/);
  assert.equal(calls.length,3);
 }finally{
  globalThis.window=original.window;
  globalThis.sessionStorage=original.sessionStorage;
  globalThis.fetch=original.fetch;
 }
});

test("P0.2: production feature is not silently enabled or mixed with QA identities",()=>{
 assert.match(bridge,/c\.qaOnly!==true\|\|!committeeCloudEnabled\(\)/);
 assert.match(editor,/const qaReport=.*qaOnly===true/);
 assert.match(editor,/const linkedMissionId=qaReport\?/);
 assert.match(bridge,/const QA_SESSION="scientifica_committee_qa_session_v1"/);
 assert.doesNotMatch(sql,/update public\.inspector_profiles|delete from public\.titularisation_missions|truncate/i);
 assert.match(qaReport,/مشروع اختبار Supabase مستقل/);
});
