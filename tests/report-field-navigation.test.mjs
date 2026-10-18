import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('app.js','utf8');
const css=readFileSync('style.css','utf8');
const catalog=JSON.parse(readFileSync('catalog.json','utf8'));
const start=app.indexOf('/* UX-01 — report editing navigation,');
const end=app.indexOf('function renderNav(){',start);
assert.ok(start>=0&&end>start,'UX-01 helpers should be isolated before renderNav');
const helpers=app.slice(start,end);

function harness(){
 const context={
  catalog,currentView:'meta',currentDomain:null,pendingDrafts:{},
  state:{entries:{},summary:{}},changed:false,
  renderCalls:0,scrollCalls:0,
  render(){context.renderCalls++},
  scrollTop(){context.scrollCalls++},
  valid:()=>true,
  safe:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
 };
 vm.createContext(context);
 vm.runInContext(helpers+'\nthis.api={reportNavStops,reportNavPosition,renderReportNavigator,reportNavigateStep};',context);
 return context;
}
test('navigation uses the official catalog, not hardcoded labels or item indices',()=>{
 const h=harness(),stops=Array.from(h.api.reportNavStops());
 const domains=catalog.sections.flatMap(section=>section.domains||[]);
 assert.equal(stops.length,domains.length+3);
 assert.equal(stops.length,42);
 assert.equal(stops[0].sectionId,'meta');
 assert.equal(stops[1].sectionId,'II');
 assert.equal(stops[1].domainId,domains[0].id);
 assert.equal(stops.at(-2).sectionId,'X');
 assert.equal(stops.at(-1).sectionId,'XI');
 assert.ok(stops.every(stop=>stop.label&&stop.sectionId!=='I'));
});
test('previous/next traverses adjacent domains and chapter boundaries',()=>{
 const h=harness(),stops=h.api.reportNavStops();
 assert.equal(h.api.reportNavigateStep(1),true);
 assert.equal(h.currentView,'II');
 assert.equal(h.currentDomain,stops[1].domainId);
 assert.equal(h.api.reportNavigateStep(1),true);
 assert.equal(h.currentView,'III');
 assert.equal(h.currentDomain,stops[2].domainId);
 const lastIII=Array.from(stops).findLastIndex(x=>x.sectionId==='III');
 h.currentView='III';h.currentDomain=stops[lastIII].domainId;
 assert.equal(h.api.reportNavigateStep(1),true);
 assert.equal(h.currentView,'IV');
 assert.equal(h.currentDomain,stops[lastIII+1].domainId);
 assert.equal(h.api.reportNavigateStep(-1),true);
 assert.equal(h.currentView,'III');
 assert.equal(h.currentDomain,stops[lastIII].domainId);
 assert.equal(h.renderCalls,4);
 assert.equal(h.scrollCalls,4);
});
test('navigation stops at metadata/last chapter boundaries and rejects invalid steps',()=>{
 const h=harness(),stops=h.api.reportNavStops();
 assert.equal(h.api.reportNavigateStep(-1),false);
 assert.equal(h.api.reportNavigateStep(0),false);
 assert.equal(h.api.reportNavigateStep(2),false);
 assert.equal(h.currentView,'meta');
 h.currentView='XI';h.currentDomain=null;
 assert.equal(h.api.reportNavPosition(),stops.length-1);
 assert.equal(h.api.reportNavigateStep(1),false);
 assert.equal(h.renderCalls,0);
});
test('navigation does not discard local drafts or overwrite report state',()=>{
 const h=harness(),stops=h.api.reportNavStops();
 const id=stops[1].domainId;
 h.pendingDrafts[id]={findings:'نص لم يُعتمد بعد',recommendations:'مسودة توصية'};
 h.state.entries[id]={assessment:'non_compliant',findings:[{text:'تم التثبت'}],recommendations:[]};
 const before=JSON.stringify({state:h.state,drafts:h.pendingDrafts,changed:h.changed});
 assert.equal(h.api.reportNavigateStep(1),true);
 assert.equal(h.api.reportNavigateStep(1),true);
 assert.equal(JSON.stringify({state:h.state,drafts:h.pendingDrafts,changed:h.changed}),before);
});
test('buttons include accessible labels, current editing location and boundaries',()=>{
 const h=harness();
 const first=h.api.renderReportNavigator('top');
 assert.match(first,/aria-label="التنقل بين مواضع تحرير التقرير"/);
 assert.match(first,/الموضع 1 من 42/);
 assert.match(first,/data-report-nav-step="-1" disabled/);
 assert.match(first,/data-report-nav-step="1"/);
 h.currentView='XI';
 const last=h.api.renderReportNavigator('bottom');
 assert.match(last,/الموضع 42 من 42/);
 assert.match(last,/data-report-nav-step="1" disabled/);
});
test('navigation remains screen-only, mobile controls are touch-sized',()=>{
 assert.match(app,/renderReportNavigator\('top'\)/);
 assert.match(app,/renderReportNavigator\('bottom'\)/);
 assert.match(app,/data-report-nav-step/);
 assert.match(css,/\.report-workflow-btn\{min-width:70px;min-height:46px/);
 assert.match(css,/@media print\{\.report-workflow-nav\{display:none!important\}\}/);
 assert.doesNotMatch(helpers,/fetch\(|localStorage\.setItem|\.insert\(|\.update\(/);
});
