import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {orderQAWorkMissions,inspectorProfileDefaults,
 publishedQAInstitutionChoices,resolveQAInstitutionSelection}
 from "../qa-titularisation/workspace-sources.mjs";
import {MISSION_CONTEXT_FIELDS,applyMissionContextFields}
 from "../qa-titularisation/mission-context.mjs";
import {freshCommittee,editMeta,editScore,restoreCommittee,stringifyCommittee}
 from "../prototypes/titularisation-committee/committee-engine.mjs";
const read=p=>readFileSync(p,"utf8");
const a="11111111-2222-4333-8444-555555555555";
const b="22222222-3333-4444-8555-666666666666";
const profile={first_name:"مفتش",last_name:"اختباري",district:"مقاطعة QA",
 email:"inspector@example.invalid",approved:true,account_status:"approved",is_admin:false};
const rows=[
 {id:a,title:"مؤسسة أ",code:"QA-A",wilaya:"QA",resource_kind:"institution",publication_status:"published"},
 {id:b,title:"مؤسسة ب",code:"QA-B",wilaya:"QA",resource_kind:"institution",publication_status:"draft"},
 {id:"not-a-uuid",title:"Invalid",resource_kind:"institution",publication_status:"published"},
 {id:"33333333-4444-4555-8666-777777777777",title:"مورد آخر",resource_kind:"document",publication_status:"published"}
];
const values=Object.fromEntries(MISSION_CONTEXT_FIELDS.map(({key})=>[key,""]));

test("P0 UX: active missions are shown first, older and closed remain accessible",()=>{
 const original=[
  {id:"old",status:"closed",created_at:"2026-11-05T11:00:00Z"},
  {id:"new",status:"draft",created_at:"2026-11-06T09:00:00Z"},
  {id:"early",status:"draft",created_at:"2026-11-05T09:00:00Z"}
 ];
 assert.deepEqual(orderQAWorkMissions(original).map(x=>x.id),["new","early","old"]);
 assert.equal(original[0].id,"old");
 assert.deepEqual(orderQAWorkMissions([]),[]);
 const qa=read("qa-titularisation/app.mjs");
 assert.match(qa,/const choose=wrapper\("متابعة المهمات الجارية والمحفوظة"\)/);
 assert.match(qa,/root\.append\(choose,create\)/);
 assert.match(qa,/createDisclosure\.open=!missions\.length/);
 assert.match(qa,/createDisclosure\.append\(form\)/);
 assert.match(qa,/selected=selectQAMission\(missions,selected,requestedMissionFromLink\)/);
});

test("P0 inspector profile: verified QA inspector prefill only; Admin and blocked accounts excluded",()=>{
 assert.deepEqual(inspectorProfileDefaults(profile),{
  chairName:"مفتش اختباري",inspectorEmail:"inspector@example.invalid",
  inspectorDistrict:"مقاطعة QA"
 });
 assert.deepEqual(inspectorProfileDefaults({...profile,is_admin:true}),{});
 assert.deepEqual(inspectorProfileDefaults({...profile,approved:false}),{});
 assert.deepEqual(inspectorProfileDefaults({...profile,account_status:"suspended"}),{});
 assert.deepEqual(inspectorProfileDefaults(null),{});
 const fresh=freshCommittee();
 const result=applyMissionContextFields(fresh,{...values,chairName:"مفتش اختباري"},[],profile);
 assert.equal(result.meta.chairName,"مفتش اختباري");
 assert.equal(result.meta.inspectorDistrict,"مقاطعة QA");
 assert.equal(result.meta.inspectorEmail,"inspector@example.invalid");
 assert.equal(result.meta.inspectorSeat,"");
 assert.equal(result.meta.inspectorPhone,"");
 const author=editMeta(editMeta(fresh,"inspectorEmail","بريد حر"),"inspectorDistrict","مقاطعة كتبها المفتش");
 const authored=applyMissionContextFields(author,{...values,chairName:"رئيس مختار"},[],profile);
 assert.equal(authored.meta.inspectorEmail,"بريد حر");
 assert.equal(authored.meta.inspectorDistrict,"مقاطعة كتبها المفتش");
 assert.equal(authored.meta.chairName,"رئيس مختار");
});

test("P0 catalog: only QA published institutions with stable UUIDs are presented",()=>{
 const eligible=publishedQAInstitutionChoices(rows);
 assert.deepEqual(eligible.map(x=>x.id),[a]);
 assert.equal(resolveQAInstitutionSelection(rows,a).title,"مؤسسة أ");
 assert.equal(resolveQAInstitutionSelection(rows,b),null);
 assert.deepEqual(publishedQAInstitutionChoices([]),[]);
});

test("P0 draft: optional institution UUID shares report JSON while preserving original grades",()=>{
 let current=freshCommittee("individual","grouped5");
 current=editScore(current,"final","lesson","g1",2);
 current=editMeta(current,"institution","مؤسسة سابقة");
 const updated=applyMissionContextFields(current,{...values,institution:"مؤسسة أ",institutionResourceId:a},[],profile);
 assert.equal(updated.meta.institution,"مؤسسة أ");
 assert.equal(updated.meta.institutionResourceId,a);
 assert.equal(updated.final.grading.scores.lesson.g1,2);
 assert.equal(restoreCommittee(JSON.parse(stringifyCommittee(updated))).meta.institutionResourceId,a);
 const fallback=applyMissionContextFields(updated,{...values,institution:"مؤسسة تجريبية",institutionResourceId:""},[],profile);
 assert.equal(fallback.meta.institutionResourceId,"");
 assert.equal(fallback.meta.institution,"مؤسسة تجريبية");
 assert.throws(()=>applyMissionContextFields(current,{...values,institutionResourceId:"bogus"},[],profile),/معرّف/);
 assert.deepEqual(restoreCommittee(JSON.parse(stringifyCommittee(current))).meta.institutionResourceId,"");
});

test("P0 authorization: QA draft-save RPC validates selected resource through RLS-aware authority",()=>{
 const sql=read("supabase/migrations/025_p0_qa_published_institution_binding_guard.sql");
 assert.match(sql,/v_institution_ref:=coalesce\(p_payload #>> '\{meta,institutionResourceId\}',\s*''\)/);
 assert.match(sql,/r\.publication_status='published'/);
 assert.match(sql,/r\.resource_kind='institution'/);
 assert.match(sql,/ux_core\.resource_in_my_district\(r\.id\)/);
 assert.match(sql,/ux_core\.has_grant\('view_institution',r\.id\)/);
 assert.match(sql,/r\.title=\(p_payload #>> '\{meta,institution\}'\)/);
 assert.match(sql,/public\.is_titularisation_owner\(p_mission_id\)/);
 assert.match(sql,/p_expected_revision/);
 assert.match(sql,/^--[\s\S]*\nbegin;[\s\S]*\ncommit;\s*$/);
 assert.doesNotMatch(sql,/insert into public\.district_published_resources|update public\.inspector_profiles|drop table/i);
});

test("P0 interface: catalog and profile are read only from QA APIs, production untouched",()=>{
 const qa=read("qa-titularisation/app.mjs");
 const html=read("qa-titularisation/index.html");
 assert.match(qa,/rows\("district_published_resources",\{/);
 assert.match(qa,/rows\("inspector_profiles",\{/);
 assert.match(qa,/institutionCatalogError/);
 assert.match(qa,/sourceSelect\.addEventListener\("change",setSource\)/);
 assert.match(qa,/edits\.institutionResourceId=ref/);
 assert.match(qa,/applyMissionContextFields\(current,edits,seatRows,profile\)/);
 assert.match(qa,/لا توجد مؤسسات منشورة في دليل QA حاليًا/);
 assert.match(html,/p05-qa-task-first-20261106/);
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","qa-titularisation/app.mjs"]));
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","qa-titularisation/mission-context.mjs"]));
 assert.doesNotThrow(()=>execFileSync(process.execPath,["--check","qa-titularisation/workspace-sources.mjs"]));
});
