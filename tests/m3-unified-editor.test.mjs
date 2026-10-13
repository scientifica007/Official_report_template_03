import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const source=readFileSync('app.js','utf8').replace(/\binit\(\);\s*$/,'');
const catalog=JSON.parse(readFileSync('catalog.json','utf8'));
function appHarness(){
 const elements={workspace:{innerHTML:''},'section-nav':{innerHTML:''},
  'report-progress':{textContent:''},'print-root':{innerHTML:''},
  'toast':{textContent:'',classList:{add(){},remove(){}}}};
 const document={
  getElementById(id){return elements[id]||null},
  querySelector(selector){if(selector==='[data-view="meta"]')return {classList:{toggle(){}}};return null}
 };
 const window={Report03CloudUI:{renderSharedEntry(id){return '<span>shared-item:'+id+'</span>'},
  hasUnsentSharedDrafts(){return false}}};
 const context=vm.createContext({document,window,TextEncoder,structuredClone,confirm:()=>true,
  __catalog:catalog,__payload:null,setTimeout(){},clearTimeout(){}});
 vm.runInContext(source,context);
 vm.runInContext('catalog=__catalog;state=emptyState()',context);
 return {context,elements,run(js){return vm.runInContext(js,context,{timeout:10000})}};
}
const payload={
 missionId:'a99b4fce-0e9f-4bbb-85c8-7f6a7a0a0001',
 title:'تفتيش معمق للمؤسسة التجريبية',
 mission:{purpose:'تقييم سير المؤسسة',period:'2024–2026',visitDates:'2026-10-18 — 2026-10-24',
  previousReports:'المحضر السابق',monthYear:'أكتوبر 2026'},
 institution:{name:'المعهد الوطني',wilaya:'تبسة',code:'1214'},
 director:{fullName:'رئيس المؤسسة'},
 summary:{generalAssessment:'التقدير المشترك',generalRecommendations:'توصية عامة معتمدة'},
 inspectors:[
 {id:'a',name:'المفتش البيداغوجي',role:'IFEP',district:'12'},
 {id:'b',name:'المفتش الإداري والمالي',role:'IAF',district:'13'}],
 entries:{
  'III-01-I001':{assessment:'non_compliant',
    findings:[{id:'f1',text:'المعاينة المشتركة بعد تصحيحها',authorId:'a',authorName:'المفتش البيداغوجي',
     originalText:'نص المعاينة الأصلية'}],
    recommendations:[{id:'r1',text:'التوصية المشتركة المعتمدة',authorId:'b',authorName:'المفتش الإداري والمالي'}]}
 },
 provenance:[
  {id:'f1',kind:'finding',body:'نص المعاينة الأصلية',author_id:'a',item_id:'III-01-I001'},
  {id:'c1',kind:'correction',body:'المعاينة المشتركة بعد تصحيحها',author_id:'a',item_id:'III-01-I001',parent_id:'f1'},
  {id:'p1',kind:'reply',body:'تعقيب مستقل غير معتمد كمعاينة',author_id:'b',item_id:'III-01-I001',parent_id:'f1'},
  {id:'r1',kind:'recommendation',body:'التوصية المشتركة المعتمدة',author_id:'b',item_id:'III-01-I001'}
 ],assessments:[],fieldHistory:[]
};
test('M3.3: shared mission opens original official editor with separate local draft retained',()=>{
 const h=appHarness();h.run("state.entries['III-01-I002']={assessment:'compliant',findings:[{id:'local',text:'معاينة محلية'}],recommendations:[]}");
 h.context.__payload=payload;
 assert.equal(h.run('window.Report03CloudBridge.canOpenSharedMission(__payload.missionId)'),true);
 assert.equal(h.run('window.Report03CloudBridge.enterSharedMission(__payload)'),true);
 assert.match(h.elements.workspace.innerHTML,/محرر التقرير المشترك/);
 assert.match(h.elements.workspace.innerHTML,/تفتيش معمق للمؤسسة التجريبية/);
 assert.match(h.elements.workspace.innerHTML,/المفتش الإداري والمالي/);
 assert.doesNotMatch(h.elements.workspace.innerHTML,/معاينة محلية/);
 assert.equal(h.run('sharedReportMissionId'),payload.missionId);
 assert.equal(h.run('window.Report03CloudBridge.exitSharedMission()'),true);
 assert.equal(h.run("getEntry('III-01-I002').findings[0].text"),'معاينة محلية');
 assert.equal(h.run('sharedReportMissionId'),'');
});
test('M3.3: PDF print and DOCX contain unified observations, statuses and attribution',()=>{
 const h=appHarness();h.context.__payload=payload;
 h.run('window.Report03CloudBridge.enterSharedMission(__payload)');
 h.run('buildPrint()');
 const html=h.elements['print-root'].innerHTML,xml=h.run('documentXML()');
 assert.match(html,/المعاينة المشتركة بعد تصحيحها/);
 assert.match(html,/التوصية المشتركة المعتمدة/);
 assert.match(html,/المفتش البيداغوجي/);
 assert.match(html,/المفتش الإداري والمالي/);
 assert.match(html,/غير مطابق/);
 assert.doesNotMatch(html,/تعقيب مستقل غير معتمد كمعاينة/);
 assert.match(xml,/المعاينة المشتركة بعد تصحيحها/);
 assert.match(xml,/التوصية المشتركة المعتمدة/);
 assert.match(xml,/المفتش الإداري والمالي/);
 assert.match(xml,/غير مطابق/);
 assert.doesNotMatch(xml,/تعقيب مستقل غير معتمد كمعاينة/);
 assert.equal((html.match(/class="report-four-column-table"/g)||[]).length,8);
});
test('M3.3: JSON contains immutable authorship and full reply/correction history',()=>{
 const h=appHarness();h.context.__payload=payload;
 h.run('window.Report03CloudBridge.enterSharedMission(__payload)');
 const json=JSON.parse(JSON.stringify(h.run('exportSnapshot()')));
 assert.equal(json.collaboration.missionId,payload.missionId);
 assert.equal(json.collaboration.contributions.length,4);
 assert.equal(json.entries['III-01-I001'].findings[0].id,'f1');
 assert.equal(json.entries['III-01-I001'].findings[0].originalText,'نص المعاينة الأصلية');
 assert.equal(json.entries['III-01-I001'].findings[0].authorName,'المفتش البيداغوجي');
 assert.equal(json.entries['III-01-I001'].assessment,'non_compliant');
 assert.equal(json.inspectors.length,2);
 assert.equal(json.institution.name,'المعهد الوطني');
});
test('M3.3: SQL 005 enforces member access, immutable field events, and CAS on revisions',()=>{
 const sql=readFileSync('supabase/migrations/005_shared_report_fields_and_assessments.sql','utf8');
 for(const t of ['inspection_report_field_events','inspection_assessment_events']){
  assert.match(sql,new RegExp('create table if not exists public\\.'+t));
  assert.match(sql,new RegExp('alter table public\\.'+t+' enable row level security'));
  assert.match(sql,new RegExp('revoke all on public\\.'+t+' from public,anon,authenticated'));
  assert.match(sql,new RegExp('grant select on public\\.'+t+' to authenticated'));
 }
 for(const name of ['set_inspection_report_field','set_inspection_assessment']){
  assert.match(sql,new RegExp('function public\\.'+name+'\\('));
  assert.match(sql,new RegExp('grant execute on function public\\.'+name));
 }
 assert.match(sql,/is_accepted_mission_member\(p_mission_id\)/);
 assert.match(sql,/v_last is distinct from p_expected_event_id/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.doesNotMatch(sql,/drop table|truncate table|delete from public/i);
 execFileSync(process.execPath,['--check','cloud.js']);
 execFileSync(process.execPath,['--check','app.js']);
});
