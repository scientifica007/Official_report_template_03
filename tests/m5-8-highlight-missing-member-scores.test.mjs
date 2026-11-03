import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {RUBRICS,DISCUSSION,newDraft,withScore,lessonItems,
 suggestedWeights,missingMandatoryScores} from "../prototypes/titularisation-workbench/engine.mjs";

const app=readFileSync("committee-member/app.mjs","utf8");
const css=readFileSync("committee-member/style.css","utf8");

function analyticalDraft(){
 const draft=newDraft(RUBRICS.analytical14.id);
 draft.profile={weights:suggestedWeights(),frozen:true};
 return draft;
}

test("M5.8: user-visible missing scores identify the exact indicator in all phases",()=>{
 let d=analyticalDraft();
 const absent=missingMandatoryScores(d);
 assert.equal(absent.length,21);
 assert.equal(absent[0].phase,"lesson");
 assert.ok(absent[0].label.length>5);
 assert.equal(absent.filter(x=>x.phase==="discussion").length,7);
 d=withScore(d,"lesson",absent[0].id,0);
 assert.equal(missingMandatoryScores(d).some(x=>x.id===absent[0].id),false);
 d=withScore(d,"lesson",absent[0].id,"");
 assert.equal(missingMandatoryScores(d).some(x=>x.id===absent[0].id),true);
});

test("M5.8: zero-weight indicators stay exempt from coloring and final submission checks",()=>{
 let d=analyticalDraft();
 d.profile.weights.g1_1=0;
 d.profile.weights.g1_2=8;
 const missing=missingMandatoryScores(d);
 assert.equal(missing.length,20);
 assert.equal(missing.some(x=>x.id==="g1_1"),false);
 for(const item of lessonItems(d))if(item.cap>0)d=withScore(d,"lesson",item.id,0);
 for(const item of DISCUSSION)d=withScore(d,"discussion",item.id,0);
 assert.deepEqual(missingMandatoryScores(d),[]);
});

test("M5.8: row and input highlight update on each keystroke, missing field names stay accessible",()=>{
 assert.match(app,/const scoreFields=new Map\(\)/);
 assert.match(app,/scoreFields\.set\(phase\+":"\+item\.id,\{score,row,hint\}\)/);
 assert.match(app,/score\.setAttribute\("aria-describedby",hint\.id\)/);
 assert.match(app,/score\.addEventListener\("input",changeGrade\)/);
 assert.match(app,/score\.addEventListener\("change",changeGrade\)/);
 assert.match(app,/const missingKeys=new Set\(missing\.map\(x=>x\.phase\+":"\+x\.id\)\)/);
 assert.match(app,/row\.classList\.toggle\("score-needs-attention",attention\)/);
 assert.match(app,/score\.classList\.toggle\("score-needs-attention",attention\)/);
 assert.match(app,/score\.setAttribute\("aria-invalid",attention\?"true":"false"\)/);
 assert.match(app,/hint\.hidden=!attention/);
 assert.match(app,/send\.disabled=missing\.length>0\|\|invalidCount>0/);
 assert.match(app,/jumpToMissing\.hidden=missing\.length===0&&invalidCount===0/);
 assert.match(app,/scrollIntoView\(\{behavior:"smooth",block:"center"\}\)/);
 assert.match(app,/field\.focus\(\{preventScroll:true\}\)/);
 assert.match(app,/الملاحظات النصية اختيارية/);
 assert.doesNotMatch(app,/note\.required=true/);
});

test("M5.8: high contrast missing-grade style targets grade cells only",()=>{
 assert.match(css,/\.assessment\.score-needs-attention\s*\{/);
 assert.match(css,/\.assessment input\.score-needs-attention\s*\{/);
 assert.match(css,/\.score-required-hint\s*\{/);
 assert.match(css,/\.score-required-hint\[hidden\]/);
 assert.match(css,/\.jump-to-missing\[hidden\]/);
 assert.doesNotMatch(css,/\.assessment textarea\.score-needs-attention/);
});

test("M5.8: JavaScript parses and no Supabase mutation added to this UI fix",()=>{
 assert.doesNotThrow(()=>execFileSync(process.execPath,
  ["--check","committee-member/app.mjs"],{stdio:"pipe"}));
 assert.match(app,/await rpc\("save_titularisation_member_contribution"/);
 assert.match(app,/p_submit:finalize/);
 assert.match(app,/const missing=missingMandatoryScores\(payload\.grading\)/);
});
