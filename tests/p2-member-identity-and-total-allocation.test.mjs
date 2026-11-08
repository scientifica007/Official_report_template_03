import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 newDraft,withScore,distributePhaseTotal,totals,lessonItems,DISCUSSION,
 withSuggestions,freezeWeights,validateImport
} from "../prototypes/titularisation-workbench/engine.mjs";
import {freshCommittee,assignPhaseTotal} from "../prototypes/titularisation-committee/committee-engine.mjs";

const rubrics=["grouped5","inspector10","analytical14"];
const draft=kind=>kind==="analytical14"?
 freezeWeights(withSuggestions(newDraft(kind))):newDraft(kind);

test("P2: deterministic bulk phase totals match exact half-points for all rubrics",()=>{
 for(const kind of rubrics)for(const phase of ["lesson","discussion"]){
  const cap=phase==="lesson"?40:20;
  for(let units=0;units<=cap*2;units++){
   const source=draft(kind);
   const result=distributePhaseTotal(source,phase,units/2);
   assert.equal(totals(result)[phase].total,units/2,kind+" "+phase+" "+units);
   assert.equal(totals(result)[phase].complete,true);
   assert.deepEqual(source.scores[phase],{},"allocation must not mutate source");
   for(const row of phase==="lesson"?lessonItems(result):DISCUSSION){
    const mark=result.scores[phase][row.id];
    if(row.cap===0){assert.equal(mark,undefined);continue;}
    assert.ok(Number.isInteger(mark*2)&&mark>=0&&mark<=row.cap);
   }
   assert.deepEqual(validateImport(result),result);
  }
 }
});
test("P2: distribution touches only selected phase and can overwrite by explicit action",()=>{
 let s=draft("analytical14");
 s=withScore(s,"discussion","d1",1.5);
 s=distributePhaseTotal(s,"lesson",23.5);
 assert.equal(totals(s).lesson.total,23.5);
 assert.equal(s.scores.discussion.d1,1.5);
 const existing=s.scores.lesson.g1_1;
 s=distributePhaseTotal(s,"lesson",4);
 assert.equal(totals(s).lesson.total,4);
 assert.equal(s.scores.discussion.d1,1.5);
 assert.equal(typeof existing,"number");
});
test("P2: no fractional or out-of-bound totals and no unfrozen weights",()=>{
 for(const phase of ["lesson","discussion"]){
  for(const v of ["",null,2.25,-1,"NaN",phase==="lesson"?40.5:20.5])
   assert.throws(()=>distributePhaseTotal(draft("analytical14"),phase,v));
 }
 assert.throws(()=>distributePhaseTotal(newDraft("analytical14"),"lesson",20),/الأوزان/);
 assert.throws(()=>distributePhaseTotal(draft("analytical14"),"invalid",20));
});
test("P2: committee chairman can bulk assign a complete phase without changing metadata",()=>{
 const state=freshCommittee("individual","grouped5");
 const next=assignPhaseTotal(state,"final","lesson",31.5);
 assert.equal(totals(next.final.grading).lesson.total,31.5);
 assert.equal(next.final.grading.scores.discussion.d1,undefined);
 assert.equal(state.final.grading.scores.lesson.g1,undefined);
});
test("P2: identity RPC requires scoped 256-bit capability; form and inspector are separate",()=>{
 const sql=readFileSync("supabase/migrations/029_p2_production_member_identity_and_total_allocation.sql","utf8");
 const member=readFileSync("committee-member/app.mjs","utf8");
 const portal=readFileSync("titularisation/production-workspace.mjs","utf8");
 const cloud=readFileSync("cloud.js","utf8");
 const form=readFileSync("prototypes/titularisation-committee/form-ui.mjs","utf8");
 assert.match(sql,/create function public.save_prod_titularisation_member_identity/);
 assert.match(sql,/token_hash is distinct from/);
 assert.match(sql,/extensions\.digest\(p_token,'sha256'\)/);
 assert.match(sql,/and status='draft'/);
 assert.match(sql,/grant execute on function public.save_prod_titularisation_member_identity[\s\S]*to anon,authenticated/);
 assert.match(sql,/create function public.set_prod_titularisation_seat_identity/);
 assert.match(sql,/m.owner_id=uid/);
 assert.match(sql,/given_name.*family_name|family_name.*given_name/s);
 assert.match(member,/حفظ بياناتي الشخصية/);
 assert.match(member,/p_member_role/);
 assert.match(portal,/prod-tit-seat-given-/);
 assert.match(portal,/prod-tit-seat-family-/);
 assert.match(portal,/prod-tit-seat-role-/);
 assert.match(cloud,/prod-tit-save-seat-identity/);
 assert.match(form,/assignPhaseTotal/);
 assert.match(member,/distributePhaseTotal/);
});
