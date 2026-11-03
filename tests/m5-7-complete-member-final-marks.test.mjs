import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {
 RUBRICS,DISCUSSION,newDraft,lessonItems,withScore,
 suggestedWeights,validateWeights,missingMandatoryScores
} from "../prototypes/titularisation-workbench/engine.mjs";

const sql=readFileSync("supabase/migrations/012_titularisation_require_complete_final_marks.sql","utf8");
const client=readFileSync("committee-member/app.mjs","utf8");

function startDraft(key){
 const d=newDraft(RUBRICS[key].id);
 if(key==="analytical14"){
  d.profile={weights:suggestedWeights(),frozen:true};
 }
 return d;
}
function fullZeroGrade(key){
 let g=startDraft(key);
 for(const item of lessonItems(g))if(item.cap>0)g=withScore(g,"lesson",item.id,0);
 for(const item of DISCUSSION)g=withScore(g,"discussion",item.id,0);
 return g;
}

test("M5.7: all 14+7 grades mandatory for the inspector-approved QA rubric",()=>{
 let d=startDraft("analytical14");
 assert.equal(missingMandatoryScores(d).length,21);
 assert.equal(missingMandatoryScores(d).filter(x=>x.phase==="lesson").length,14);
 assert.equal(missingMandatoryScores(d).filter(x=>x.phase==="discussion").length,7);
 d=withScore(d,"lesson","g1_1",0);
 assert.equal(missingMandatoryScores(d).length,20,"zero is an entered grade");
 d=withScore(d,"discussion","d1",0);
 assert.equal(missingMandatoryScores(d).length,19);
 d=withScore(d,"lesson","g1_1","");
 assert.equal(missingMandatoryScores(d).length,20,"clearing a mark makes it missing again");
 assert.deepEqual(missingMandatoryScores(fullZeroGrade("analytical14")),[]);
});

test("M5.7: fixed grouped-five and inspector-ten rubrics also reject missing marks",()=>{
 for(const [key,required] of [["grouped5",12],["inspector10",17]]){
  let d=startDraft(key);
  assert.equal(missingMandatoryScores(d).length,required);
  const lessonItem=lessonItems(d)[0];
  d=withScore(d,"lesson",lessonItem.id,0);
  assert.equal(missingMandatoryScores(d).length,required-1);
  assert.equal(missingMandatoryScores(fullZeroGrade(key)).length,0);
 }
});

test("M5.7: frozen weight ZERO is non-scoring, but every positive cap is mandatory",()=>{
 const d=startDraft("analytical14");
 d.profile.weights.g1_1=0;
 d.profile.weights.g1_2=8;
 assert.equal(validateWeights(d.profile.weights).valid,true);
 const missing=missingMandatoryScores(d);
 assert.equal(missing.length,20);
 assert.equal(missing.some(x=>x.id==="g1_1"),false);
 assert.equal(missing.some(x=>x.id==="g1_2"),true);
 assert.throws(()=>withScore(d,"lesson","g1_1",0),/صفر/);
 let complete=d;
 for(const item of lessonItems(complete)){
  if(item.cap>0)complete=withScore(complete,"lesson",item.id,0);
 }
 for(const item of DISCUSSION)complete=withScore(complete,"discussion",item.id,0);
 assert.deepEqual(missingMandatoryScores(complete),[]);
});

test("M5.7: UI disables final submission until complete, and keeps prose optional",()=>{
 assert.match(client,/missingMandatoryScores\(payload\.grading\)/);
 assert.match(client,/send\.disabled=missing\.length>0/);
 assert.match(client,/onScoreChange\(\)/);
 assert.match(client,/score\.addEventListener\("input",changeGrade\)/);
 assert.match(client,/score\.addEventListener\("change",changeGrade\)/);
 assert.match(client,/if\(finalize\)\{\s*const missing=missingMandatoryScores/);
 assert.match(client,/الملاحظات النصية اختيارية/);
 assert.match(client,/العلامة 0 مقبولة/);
 assert.match(client,/حفظ مساهمتي/);
 assert.match(client,/await rpc\("save_titularisation_member_contribution"/);
 assert.doesNotMatch(client,/note\.required=true/);
});

test("M5.7: database submission trigger runs on final payload or status changes only",()=>{
 assert.match(sql,/after insert or update of payload,status/);
 assert.match(sql,/when \(new\.status='submitted'\)/);
 assert.match(sql,/new\.status <> 'submitted'/);
 assert.match(sql,/perform public\.validate_titularisation_analytical_payload/);
 assert.match(sql,/perform public\.validate_titularisation_member_payload/);
 assert.match(sql,/v_profile->'weights'/);
 assert.match(sql,/w\.cap::text\)::numeric > 0/);
 assert.match(sql,/not \(\(new\.payload #> '\{grading,scores,lesson\}'\) \? w\.item_id\)/);
 assert.match(sql,/not \(\(new\.payload #> '\{grading,scores,discussion\}'\) \? c\.item_id\)/);
 assert.match(sql,/v_missing_lesson>0 or v_missing_discussion>0/);
 assert.match(sql,/لا يمكن|يجب إكمال جميع العلامات/);
 assert.match(sql,/revoke all on function public\.check_titularisation_final_score_completeness/);
 // Auth Admin later detaches only the author_user_id FK. This must not
 // retroactively revalidate old incomplete submissions or block deletion.
 assert.doesNotMatch(sql,/after insert or update\s+on public\.titularisation_contributions/);
});

test("M5.7: browser scoring modules parse",()=>{
 for(const p of ["committee-member/app.mjs","prototypes/titularisation-workbench/engine.mjs"]){
  assert.doesNotThrow(()=>execFileSync(process.execPath,["--check",p],{stdio:"pipe"}));
 }
});
