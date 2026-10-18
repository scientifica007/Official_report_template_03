import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('style.css','utf8');
const catalog=JSON.parse(readFileSync('catalog.json','utf8'));
const start=app.indexOf('/* Presentation-only catalog search.');
const end=app.indexOf('function renderNav(){',start);
assert.ok(start>=0&&end>start,'Catalog search helpers must be identifiable');
const functions=app.slice(start,end);

function harness({shared=false}={}){
 const context={
  catalog,state:{entries:{}},pendingDrafts:{},
  window:{Report03CloudUI:{pendingSharedDrafts:()=>[]},scrollTo(){}},
  document:{querySelector:()=>null,querySelectorAll:()=>[]},
  valid:()=>true,isSharedReport:()=>shared,
  assessmentLabel:s=>({compliant:'مطابق',non_compliant:'غير مطابق',not_applicable:'غير معني'})[s]||'',
  safe:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  text:s=>String(s??'').trim(),
  currentView:'meta',currentDomain:null,renderCount:0,
  render(){context.renderCount++},
 };
 context.getEntry=id=>context.state.entries[id]||{findings:[],recommendations:[],assessment:null};
 context.$=()=>null;
 vm.createContext(context);
 vm.runInContext(functions+'\nthis.api={normalizeReportFind,reportFindTargets,reportFindFiltered,reportFindDrafts,refreshReportFind,goToReportFindTarget};',context);
 return context;
}
function asArray(items){return Array.from(items)}
test('search indexes stable official target ids, including domains and standalone chapters',()=>{
 const h=harness(),nodes=asArray(h.api.reportFindTargets());
 const domains=catalog.sections.flatMap(s=>s.domains||[]);
 const indicators=domains.flatMap(d=>d.indicators||[]);
 assert.equal(domains.length,39);
 assert.equal(indicators.length,176);
 assert.equal(nodes.length,217);
 assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length);
 assert.ok(nodes.some(n=>n.id==='X')&&nodes.some(n=>n.id==='XI'));
 assert.ok(nodes.every(n=>n.sectionId&&n.label));
});
test('Arabic normalization and search find official elements by chapter, domain or criterion',()=>{
 const h=harness(),nodes=h.api.reportFindTargets();
 assert.equal(h.api.normalizeReportFind('إِدَارَةُ الشَّهادات'), 'اداره الشهادات');
 const hits=asArray(h.api.reportFindFiltered(nodes,'الشهادات','all',[]));
 assert.ok(hits.some(n=>n.label.includes('الشهادات')));
 assert.ok(hits.some(n=>n.context.includes('الشهادات')));
 assert.equal(asArray(h.api.reportFindFiltered(nodes,'zxq-unknown-phrase','all',[])).length,0);
});
test('filters distinguish saved contributions, optional assessments and unrecorded targets',()=>{
 const h=harness(),nodes=h.api.reportFindTargets(),first=nodes.find(n=>n.domainId),second=nodes.find(n=>n.domainId&&n.id!==first.id);
 h.state.entries[first.id]={findings:[{text:'معاينة مثبتة'}],recommendations:[],assessment:null};
 h.state.entries[second.id]={findings:[],recommendations:[],assessment:'non_compliant'};
 const hasEntries=asArray(h.api.reportFindFiltered(nodes,'','entries',[]));
 const assessed=asArray(h.api.reportFindFiltered(nodes,'','assessed',[]));
 const unrecorded=asArray(h.api.reportFindFiltered(nodes,'','unrecorded',[]));
 assert.deepEqual(hasEntries.map(x=>x.id),[first.id]);
 assert.deepEqual(assessed.map(x=>x.id),[second.id]);
 assert.ok(!unrecorded.some(x=>x.id===first.id||x.id===second.id));
 assert.equal(unrecorded.length,215);
});
test('unsubmitted drafts are not counted as confirmed findings or assessments',()=>{
 const h=harness(),nodes=h.api.reportFindTargets(),id=nodes.find(n=>n.domainId).id;
 h.pendingDrafts[id]={findings:'نص لم يضف'};
 const drafts=h.api.reportFindDrafts();
 assert.ok(drafts.some(d=>d.itemId===id));
 assert.ok(asArray(h.api.reportFindFiltered(nodes,'','unsaved',drafts)).some(n=>n.id===id));
 assert.ok(!asArray(h.api.reportFindFiltered(nodes,'','entries',drafts)).some(n=>n.id===id));
 assert.ok(asArray(h.api.reportFindFiltered(nodes,'نص لم يضف','all',drafts)).some(n=>n.id===id));
});
test('shared mission drafts use live unsent-draft API without saving',()=>{
 const h=harness({shared:true}),nodes=h.api.reportFindTargets(),id=nodes.find(n=>n.domainId).id;
 h.window.Report03CloudUI.pendingSharedDrafts=()=>[{itemId:id,preview:'غير محفوظ'}];
 assert.deepEqual(asArray(h.api.reportFindFiltered(nodes,'','unsaved',h.api.reportFindDrafts())).map(n=>n.id),[id]);
 assert.equal(Object.keys(h.state.entries).length,0);
});
test('search navigation returns to the exact stable indicator and leaves report content unchanged',()=>{
 const h=harness(),nodes=h.api.reportFindTargets(),target=nodes.find(n=>n.id.endsWith('-I001'));
 h.state.entries[target.id]={assessment:'compliant',findings:[{text:'حقيقة ثابتة'}],recommendations:[]};
 const before=JSON.stringify(h.state);
 assert.equal(h.api.goToReportFindTarget(target.id),true);
 assert.equal(h.currentView,target.sectionId);
 assert.equal(h.currentDomain,target.domainId);
 assert.equal(h.renderCount,1);
 assert.equal(JSON.stringify(h.state),before);
});
test('search controls are opt-in sidebar UI, excluded from print and exports',()=>{
 assert.match(html,/id="report-find-query"/);
 assert.match(html,/id="report-find-filter"/);
 assert.match(html,/id="report-find-results"/);
 assert.match(css,/@media print\{\.report-find-panel\{display:none!important\}\}/);
 assert.match(app,/data-report-target/);
 assert.match(app,/data-find-target/);
 assert.doesNotMatch(functions,/localStorage\.setItem|fetch\(|\/rest\/v1\/rpc\//);
});
