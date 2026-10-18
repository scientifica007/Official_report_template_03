import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('style.css','utf8');
const catalog=JSON.parse(readFileSync('catalog.json','utf8'));
const first=app.indexOf('/* UX-02 — descriptive work-state metrics;');
const last=app.indexOf('function updateProgress(){',first);
assert.ok(first>=0&&last>first);
const helpers=app.slice(first,last);
const nodes=catalog.sections.flatMap(s=>s.id==='I'?[]:s.domains.length
 ? s.domains.flatMap(d=>[{id:d.id},...d.indicators.map(i=>({id:i.id}))])
 : [{id:s.id}]);
assert.equal(nodes.length,217);

function harness({shared=false}={}){
 const dom={};
 for(const id of ['report-metric-entries','report-metric-assessed',
  'report-metric-drafts','report-metric-review','report-persistence-status']){
  dom[id]={textContent:'',dataset:{}};
 }
 const context={
  state:{entries:{}},drafts:[],summary:[],nodes,dom,
  $:id=>dom[id]||null,
  isSharedReport:()=>shared,valid:()=>true,
  reportFindTargets:()=>nodes,
  reportFindHasEntries:id=>Boolean((context.state.entries[id]?.findings?.length||0)+
   (context.state.entries[id]?.recommendations?.length||0)),
  reportFindHasAssessment:id=>['compliant','non_compliant','not_applicable']
   .includes(context.state.entries[id]?.assessment),
  reportFindDrafts:()=>context.drafts,
  pendingSharedSummaryFields:()=>context.summary
 };
 vm.createContext(context);
 vm.runInContext(helpers+'\nthis.api={reportWorkState,reportWorkPersistenceMessage,updateWorkMetrics}',context);
 return context;
}
test('coverage counts saved text locations and not review completion',()=>{
 const h=harness();
 h.state.entries[nodes[0].id]={findings:[{text:'نتيجة التحقق'}],recommendations:[]};
 h.state.entries[nodes[1].id]={findings:[],recommendations:[],assessment:'compliant'};
 const data=h.api.reportWorkState();
 assert.equal(data.total,217);
 assert.equal(data.withEntries,1);
 assert.equal(data.assessments,1);
 assert.equal(data.drafts,0);
});
test('draft text stays distinct from recorded coverage',()=>{
 const h=harness();
 h.drafts=[{itemId:nodes[0].id,preview:'لم تُرسل'}];
 const status=h.api.reportWorkState();
 assert.equal(status.withEntries,0);
 assert.equal(status.assessments,0);
 assert.equal(status.drafts,1);
});
test('cloud pending fields are not marked saved before server confirmation',()=>{
 const h=harness({shared:true});
 h.drafts=[{itemId:nodes[0].id}];
 h.summary=[{key:'generalAssessment',status:'saving'}];
 const msg=h.api.reportWorkPersistenceMessage(h.api.reportWorkState());
 assert.equal(msg.tone,'pending');
 assert.match(msg.message,/غير مرسلة/);
 assert.match(msg.message,/قيد التنفيذ/);
});
test('cloud save failure is higher-priority than pending drafts',()=>{
 const h=harness({shared:true});
 h.drafts=[{itemId:nodes[0].id}];
 h.summary=[{key:'generalRecommendations',status:'error'}];
 const message=h.api.reportWorkPersistenceMessage(h.api.reportWorkState());
 assert.equal(message.tone,'error');
 assert.match(message.message,/فشل حفظ/);
});
test('no drafts does not falsely assert that the remote report is saved',()=>{
 const h=harness({shared:true});
 const message=h.api.reportWorkPersistenceMessage(h.api.reportWorkState());
 assert.equal(message.tone,'neutral');
 assert.doesNotMatch(message.message,/تم حفظ التقرير|جميع التعديلات محفوظة/);
 assert.match(message.message,/تأكيد حفظ كل مساهمة/);
});
test('local mode explicitly identifies tab-only storage',()=>{
 const h=harness();
 const message=h.api.reportWorkPersistenceMessage(h.api.reportWorkState());
 assert.equal(message.tone,'local');
 assert.match(message.message,/ليس محفوظًا سحابيًا/);
});
test('rendered indicators display separate values and do not alter report entries',()=>{
 const h=harness({shared:true});
 h.state.entries[nodes[0].id]={findings:[{text:'م'}],recommendations:[]};
 h.drafts=[{itemId:nodes[2].id}];
 const before=JSON.stringify(h.state);
 h.api.updateWorkMetrics();
 assert.equal(h.dom['report-metric-entries'].textContent,'1 / 217');
 assert.equal(h.dom['report-metric-assessed'].textContent,'0');
 assert.equal(h.dom['report-metric-drafts'].textContent,'1');
 assert.equal(h.dom['report-metric-review'].textContent,'لا تُستنتج آليًا');
 assert.equal(h.dom['report-persistence-status'].dataset.tone,'pending');
 assert.equal(JSON.stringify(h.state),before);
});
test('UX-02 is a screen-only read model wired to draft and summary events',()=>{
 assert.match(html,/id="report-work-metrics"|class="report-work-metrics"/);
 assert.match(html,/id="report-persistence-status"/);
 assert.match(html,/id="report-storage-status"/);
 assert.match(css,/@media print\{\.report-work-metrics\{display:none!important\}\}/);
 assert.match(app,/updateSharedDraftStatus\(\)\{[\s\S]*?updateWorkMetrics\(\);/);
 assert.match(app,/function setSharedSummaryStatus\([\s\S]*?updateWorkMetrics\(\);/);
 assert.doesNotMatch(helpers,/fetch\(|localStorage\.setItem|supabase\/migrations/);
});
