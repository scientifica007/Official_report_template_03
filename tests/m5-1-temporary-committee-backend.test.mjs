import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {freshCommittee,editNote,editScore,restoreCommittee} from "../prototypes/titularisation-committee/committee-engine.mjs";
import {mergeSubmittedCloudMembers,committeeCloudEnabled} from "../prototypes/titularisation-committee/committee-cloud-bridge.mjs";
import {RUBRICS,newDraft} from "../prototypes/titularisation-workbench/engine.mjs";

const sql=readFileSync("supabase/migrations/007_titularisation_temporary_committee.sql","utf8");
const edge=readFileSync("supabase/functions/titularisation-access/index.ts","utf8");
const config=readFileSync("supabase/config.toml","utf8");
const portal=readFileSync("cloud.js","utf8");
const member=readFileSync("committee-member/app.mjs","utf8");
const shell=readFileSync("committee-member/index.html","utf8");
const settings=readFileSync("cloud-config.js","utf8");
const lab=readFileSync("prototypes/titularisation-committee/index.html","utf8");
const labApp=readFileSync("prototypes/titularisation-committee/app.mjs","utf8");
const notes=()=>({lesson:{},discussion:{},lessonSummary:"",discussionSummary:"",general:"",recommendations:""});
const sample=(id,score,note)=>{
 let grading=newDraft(id);grading.scores.lesson.g1=score;
 return {seat_code:"member1",status:"submitted",payload:{
  grading,notes:{...notes(),lessonSummary:note}
 }};
};

test("M5.1: three independent account seats, never interchangeable with approved inspectors",()=>{
 assert.match(sql,/create table if not exists public\.titularisation_missions/);
 assert.match(sql,/owner_id uuid not null references auth\.users/);
 assert.match(sql,/check\(seat_code in \('member1','member2','member3'\)\)/);
 assert.match(sql,/values\(v_id,'member1'\),\(v_id,'member2'\),\(v_id,'member3'\)/);
 assert.match(sql,/create table if not exists public\.titularisation_seats/);
 assert.match(sql,/on delete set null/);
 assert.doesNotMatch(sql,/update public\.inspector_profiles set approved=true/);
 assert.match(edge,/app_metadata:\{account_type:"titularisation_temporary"\}/);
 assert.doesNotMatch(edge,/user_metadata:\{account_type:/);
 assert.match(sql,/if new\.raw_app_meta_data->>'account_type' = 'titularisation_temporary' then/);
 assert.match(sql,/create or replace function public\.create_inspector_profile\(\)/);
 assert.match(sql,/revoke all on function public\.create_inspector_profile\(\) from public,anon,authenticated/);
});
test("M5.1: RLS blocks revoked, expired, foreign seats on EVERY call",()=>{
 assert.match(sql,/alter table public\.titularisation_missions enable row level security/);
 assert.match(sql,/alter table public\.titularisation_seats enable row level security/);
 assert.match(sql,/alter table public\.titularisation_contributions enable row level security/);
 assert.match(sql,/is_active_titularisation_seat/);
 assert.match(sql,/s\.auth_user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/s\.status='active'/);
 assert.match(sql,/s\.revoked_at is null and s\.expires_at>now\(\)/);
 assert.match(sql,/m\.status='draft' and m\.expires_at>now\(\)/);
 assert.match(sql,/if not found or not public\.is_active_titularisation_seat\(p_mission_id,p_seat_code\)/);
 assert.match(sql,/for update;\n if not found or not public\.is_active_titularisation_seat/);
 assert.match(sql,/revoke all on public\.titularisation_contributions from public,anon,authenticated/);
 assert.match(sql,/grant select on public\.titularisation_contributions to authenticated/);
 assert.doesNotMatch(sql,/grant (?:insert|update|delete).*public\.titularisation_contributions to authenticated/i);
});
test("M5.1: contributions cannot be modified after submission and survive account cleanup",()=>{
 assert.match(sql,/status='draft'\s+returning revision into v_revision/);
 assert.match(sql,/Contribution already submitted and immutable/);
 assert.match(sql,/foreign key\(mission_id,seat_code\).*on delete restrict/);
 assert.match(sql,/author_user_id uuid references auth\.users\(id\) on delete set null/);
 assert.match(edge,/status:"revoked",revoked_at:new Date\(\)\.toISOString\(\)/);
 assert.match(edge,/db\.auth\.admin\.deleteUser/);
 assert.match(edge,/if\(action==="revoke"\)return await revoke/);
 assert.match(edge,/Revocation remains permitted AFTER closure/);
});
test("M5.1: server enforces half-point scoring, caps and authorized rubric",()=>{
 assert.match(sql,/rubric_id text not null check\(rubric_id in \('lesson_grouped_5_v1','lesson_inspector_10_v1'\)\)/);
 assert.match(sql,/create table if not exists public\.titularisation_score_caps/);
 assert.match(sql,/v_number<0 or v_number>v_cap or mod\(v_number\*2,1\)<>0/);
 assert.match(sql,/jsonb_typeof\(v_value\) is distinct from 'number'/);
 assert.match(sql,/jsonb_typeof\(v_notes\) is distinct from 'object'/);
 assert.match(sql,/v_grading->'revision' is distinct from '1'::jsonb/);
 assert.match(sql,/jsonb_typeof\(v_value\) is distinct from 'string'/);
 assert.match(sql,/Unknown item or invalid note/);
 assert.match(sql,/v_grading->>'rubricId' is distinct from p_rubric/);
 assert.match(sql,/Unexpected unfrozen analytical weights/);
 assert.match(member,/withScore\(payload\.grading,phase,item\.id,score\.value\)/);
});
test("M5.1: no browser stored credentials, server secret remains server only",()=>{
 assert.match(config,/verify_jwt = false/);
 assert.match(edge,/auth\.getUser\(token\)/);
 assert.match(edge,/inspector\.account_status!=="approved"/);
 assert.match(edge,/mission\.owner_id!==id/);
 assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(edge,/SUPABASE_ANON_KEY/);
 assert.match(edge,/COMMITTEE_LOGIN_DOMAIN/);
 assert.match(edge,/guard_titularisation_login/);
 assert.match(sql,/grant execute on function public\.guard_titularisation_login\(text\) to service_role/);
 assert.match(edge,/if\(origin && origin!==ALLOWED_ORIGIN\)/);
 assert.match(edge,/const auth=userClient\(\)/);
 assert.match(edge,/signInWithPassword/);
 assert.match(edge,/password:temporaryPassword/);
 assert.doesNotMatch(portal,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_\w{12,}/);
 assert.doesNotMatch(member,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_\w{12,}/);
 assert.match(member,/sessionStorage\.setItem\(storageKey/);
 assert.doesNotMatch(member,/localStorage\.setItem/);
 assert.match(settings,/temporaryCommitteeEnabled: false/);
});
test("M5.1: owner operations and member login are separated and disabled until backend activation",()=>{
 assert.match(portal,/const committeeEnabled=cfg\.temporaryCommitteeEnabled===true/);
 assert.match(portal,/currentPage==='titularisation'\?committeeView\(\)/);
 assert.match(portal,/function committeeView\(\)/);
 assert.match(portal,/if\(!committeeEnabled\)return intro/);
 assert.match(portal,/committee-create/);
 assert.match(portal,/committee-issue/);
 assert.match(portal,/committee-revoke/);
 assert.match(portal,/committee-close/);
 assert.match(portal,/دون تغيير سلطة رئيسها في تحرير التقرير النهائي/);
 assert.match(shell,/name="referrer" content="no-referrer"/);
 assert.match(member,/save_titularisation_member_contribution/);
 assert.match(member,/p_submit:finalize/);
 assert.match(member,/attachVoiceDictation\(card\)/);
 assert.match(member,/if\(submitted\)/);
 assert.match(lab,/id="committee-cloud-bridge"/);
 assert.match(lab,/committee-cloud-import/);
 assert.match(labApp,/mergeSubmittedCloudMembers/);
});
test("M5.1: cloud merge cannot overwrite the chair's authored grading and prose",()=>{
 let state=freshCommittee("individual","grouped5");
 state=editScore(state,"final","lesson","g1",8);
 state=editNote(state,"final","general","تقدير نهائي مستقل للمفتش");
 const before=JSON.stringify(state.final);
 const member=sample(RUBRICS.grouped5.id,6,"تقدير العضو الأول");
 const {state:merged,seats}=mergeSubmittedCloudMembers(state,{
  rubric_id:RUBRICS.grouped5.id
 },[member]);
 assert.deepEqual(seats,["member1"]);
 assert.equal(JSON.stringify(merged.final),before);
 assert.equal(merged.members.member1.submitted,true);
 assert.equal(merged.members.member1.grading.scores.lesson.g1,6);
 assert.equal(merged.members.member1.notes.lessonSummary,"تقدير العضو الأول");
 assert.equal(state.members.member1.submitted,false);
 assert.deepEqual(restoreCommittee(merged),merged);
});
test("M5.1: mismatched rubric, unsubmitted member and duplicate seats cannot merge",()=>{
 const state=freshCommittee("individual","grouped5");
 const member=sample(RUBRICS.grouped5.id,6,"");
 assert.throws(()=>mergeSubmittedCloudMembers(state,{
  rubric_id:RUBRICS.inspector10.id
 },[member]),/تختلف/);
 assert.throws(()=>mergeSubmittedCloudMembers(state,{
  rubric_id:RUBRICS.grouped5.id
 },[{...member,status:"draft"}]),/غير موثوقة/);
 assert.throws(()=>mergeSubmittedCloudMembers(state,{
  rubric_id:RUBRICS.grouped5.id
 },[member,member]),/غير موثوقة/);
 assert.throws(()=>mergeSubmittedCloudMembers(state,{
  rubric_id:RUBRICS.grouped5.id
 },[]),/لا توجد/);
});
test("M5.1: member portal uses only explicit session tokens and respects current feature gate",()=>{
 assert.equal(typeof committeeCloudEnabled,"function");
 assert.match(member,/requestedMission=params\.get\("mission"\)/);
 assert.match(member,/requestedSeat=params\.get\("seat"\)/);
 assert.match(member,/sessionStorage\.removeItem/);
 assert.match(member,/if\(dirty\)/);
 assert.match(member,/confirm\("هل تؤكد إرسال المساهمة نهائيًا/);
 assert.match(portal,/committeeIssuedOnce=null/);
 assert.match(portal,/لا تُحفظ مسوداته على Supabase/);
});
