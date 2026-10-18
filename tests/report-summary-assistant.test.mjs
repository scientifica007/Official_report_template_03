import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('style.css','utf8');
const cloud=readFileSync('cloud.js','utf8');
const first=app.indexOf('/* UX-06 — source-based summary assembly,');
const last=app.indexOf('function renderNav(){',first);
assert.ok(first>=0&&last>first,'UX-06 functions must be independently testable');
const helpers=app.slice(first,last);
function element({value='',kind='div'}={}){
 const listeners={};
 return {value,kind,textContent:'',innerHTML:'',disabled:false,readOnly:false,
  dataset:{},listeners,open:false,children:[],isConnected:true,events:[],
  addEventListener(type,fn){listeners[type]=fn},
  dispatchEvent(e){this.events.push(e)},
  replaceChildren(...args){this.children=args;this.innerHTML=''},
  showModal(){this.open=true},
  close(){this.open=false;this.listeners.close?.()},
  focus(){this.focused=true}};
}
function harness({many=0,shared=false}={}){
 const catalog={sections:[
  {id:'I',label:'معلومات أولية',domains:[]},
  {id:'II',label:'المظهر العام',domains:[{id:'D1',label:'المرافق',number:1,indicators:[
   {id:'I1',label:'الفضاءات'}, {id:'I2',label:'الأشغال'}]}]},
  {id:'X',label:'التقدير العام',domains:[]},
  {id:'XI',label:'التوصيات',domains:[]}
 ]};
 const entries={
  D1:{findings:[{text:'معاينة أصلية',authorName:shared?'المفتش الأول':''}],recommendations:[]},
  I1:{findings:[],recommendations:[{text:'توصية أصيلة',authorName:shared?'المفتشة الثانية':''}]},
  I2:{findings:[],recommendations:[]},
  X:{findings:[{text:'ملاحظة ختامية'}],recommendations:[]},
  XI:{findings:[],recommendations:[{text:'توصية عامة'}]}
 };
 for(let i=0;i<many;i++)entries.I2.findings.push({text:'معاينة رقم '+i,authorName:shared?'مساهم '+i:''});
 const els={};
 for(const id of ['report-summary-assistant','summary-assistant-query','summary-assistant-kind',
  'summary-assistant-results','summary-assistant-counter','summary-assistant-preview',
  'summary-assistant-insert','summary-assistant-target','summary-assistant-warning',
  'summary-assistant-feedback','summary-assistant-select-visible','summary-assistant-clear',
  'summary-assistant-close','summary-generalAssessment','summary-generalRecommendations'])
  els[id]=element();
 els['summary-assistant-kind'].value='all';
 const ctx={
  catalog,sharedReportMissionId:shared?'mission-A':'',
  SUMMARY_KEYS:['generalAssessment','generalRecommendations'],
  summaryLabel:key=>key==='generalAssessment'?'التقدير العام':'التوصيات العامة',
  valid:()=>true,getEntry:id=>entries[id]||{findings:[],recommendations:[]},
  normalizeReportFind:x=>String(x||'').toLowerCase(),
  safe:x=>String(x??'').replace(/[<>&"'']/g, k=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[k])),
  $:id=>els[id]||null,
  Event:class Event{constructor(type,opts){this.type=type;this.bubbles=opts?.bubbles}}
 };
 vm.createContext(ctx);
 vm.runInContext(helpers+'\nthis.api={summaryAssistantSources,summaryAssistantCompose,summaryAssistantAppend,summaryAssistantOpen,summaryAssistantVisibleRows,summaryAssistantSelectedRows,summaryAssistantRefresh,summaryAssistantInsert,summaryAssistantClose,bindSummaryAssistant};',ctx);
 return {ctx,els,entries,catalog};
}
function copy(rows){return JSON.parse(JSON.stringify(rows))}
test('source inventory includes all recorded entries in catalog order and does not silently truncate',()=>{
 const h=harness({many:120}),rows=copy(h.ctx.api.summaryAssistantSources());
 assert.equal(rows.length,124);
 assert.equal(rows[0].id,'D1');
 assert.equal(rows[1].id,'I1');
 assert.equal(rows[2].id,'I2');
 assert.equal(rows.at(-2).id,'X');
 assert.equal(rows.at(-1).id,'XI');
 assert.equal(new Set(rows.map(row=>row.key)).size,rows.length);
 assert.equal(rows.filter(r=>r.kind==='findings').length,122);
});
test('unsaved local or shared drafts are not sourced by the assistant',()=>{
 const h=harness();
 h.ctx.pendingDrafts={I1:{findings:'غير محفوظة'}};
 h.ctx.window={Report03CloudUI:{pendingSharedDrafts:()=>[{itemId:'D1',preview:'غير محفوظة'}]}};
 const rows=copy(h.ctx.api.summaryAssistantSources());
 assert.equal(rows.length,4);
 assert.ok(!rows.some(r=>r.text.includes('غير محفوظة')));
});
test('the source record includes exact labels, stable id and contributor attribution',()=>{
 const h=harness({shared:true}),rows=copy(h.ctx.api.summaryAssistantSources());
 assert.match(rows[0].location,/الباب II — المظهر العام/);
 assert.match(rows[0].location,/المرافق/);
 assert.equal(rows[0].author,'المفتش الأول');
 const text=h.ctx.api.summaryAssistantCompose([rows[0],rows[1]]);
 assert.match(text,/صاحب المساهمة: المفتش الأول/);
 assert.match(text,/صاحب المساهمة: المفتشة الثانية/);
 assert.match(text,/\[D1\]/);
 assert.match(text,/معاينة أصلية/);
 assert.match(text,/توصية أصيلة/);
});
test('assist is read only until the inspector explicitly inserts selected sources',()=>{
 const h=harness({shared:true}),summary=h.els['summary-generalAssessment'];
 summary.value='صياغة موجودة';
 const original=JSON.stringify(h.entries);
 assert.equal(h.ctx.api.summaryAssistantOpen('generalAssessment'),true);
 assert.equal(h.els['report-summary-assistant'].open,true);
 assert.equal(summary.value,'صياغة موجودة');
 assert.equal(h.els['summary-assistant-insert'].disabled,true);
 assert.equal(h.els['summary-assistant-preview'].value,'');
 assert.equal(JSON.stringify(h.entries),original);
});
test('selection includes no more and no fewer items than explicitly selected',()=>{
 const h=harness({shared:true});h.ctx.api.summaryAssistantOpen('generalRecommendations');
 const rows=copy(h.ctx.api.summaryAssistantSources());
 h.ctx.api.bindSummaryAssistant();
 const checkbox={dataset:{summarySource:rows[1].key},checked:true,closest(){return this}};
 h.els['report-summary-assistant'].listeners.change({target:checkbox});
 assert.equal(h.els['summary-assistant-insert'].disabled,false);
 assert.match(h.els['summary-assistant-preview'].value,/توصية أصيلة/);
 assert.doesNotMatch(h.els['summary-assistant-preview'].value,/معاينة أصلية/);
 assert.equal(h.ctx.api.summaryAssistantInsert(),true);
 assert.match(h.els['summary-generalRecommendations'].value,/توصية أصيلة/);
 assert.doesNotMatch(h.els['summary-generalRecommendations'].value,/معاينة أصلية/);
 assert.equal(h.els['summary-generalRecommendations'].events.length,1);
 assert.equal(h.els['summary-generalRecommendations'].events[0].type,'input');
});
test('filters and selecting visible items do not erase previously selected hidden items',()=>{
 const h=harness({many:24});h.ctx.api.bindSummaryAssistant();h.ctx.api.summaryAssistantOpen('generalAssessment');
 const all=copy(h.ctx.api.summaryAssistantSources());
 h.els['summary-assistant-kind'].value='findings';
 h.els['summary-assistant-kind'].listeners.change();
 h.els['summary-assistant-select-visible'].listeners.click();
 assert.equal(h.ctx.api.summaryAssistantSelectedRows.length,0); // reference stays a function, no writes
 assert.equal(h.els['summary-assistant-preview'].value.includes('توصية أصيلة'),false);
 h.els['summary-assistant-kind'].value='recommendations';
 h.els['summary-assistant-kind'].listeners.change();
 h.els['summary-assistant-select-visible'].listeners.click();
 assert.equal((h.els['summary-assistant-preview'].value.match(/^\d+\. /gm)||[]).length,all.length);
});
test('search filters include full text and never impose a first-ten limit',()=>{
 const h=harness({many:24});h.ctx.api.summaryAssistantOpen('generalAssessment');
 h.els['summary-assistant-query'].value='رقم 23';
 h.ctx.api.summaryAssistantRefresh();
 assert.match(h.els['summary-assistant-counter'].textContent,/1 معروضة/);
 assert.match(h.els['summary-assistant-results'].innerHTML,/رقم 23/);
 assert.doesNotMatch(h.els['summary-assistant-results'].innerHTML,/رقم 22/);
});
test('existing assessment text is preserved and appended to with explicit source references',()=>{
 const h=harness({shared:true});h.ctx.api.summaryAssistantOpen('generalAssessment');
 const first=copy(h.ctx.api.summaryAssistantSources())[0];
 h.ctx.api.bindSummaryAssistant();
 h.els['report-summary-assistant'].listeners.change({target:{
  dataset:{summarySource:first.key},checked:true,closest(){return this}}});
 h.els['summary-generalAssessment'].value='تقدير محرر سابقًا.';
 assert.equal(h.ctx.api.summaryAssistantInsert(),true);
 assert.ok(h.els['summary-generalAssessment'].value.startsWith('تقدير محرر سابقًا.\n\n'));
 assert.match(h.els['summary-generalAssessment'].value,/المفتش الأول/);
 assert.equal(h.els['report-summary-assistant'].open,false);
 assert.equal(h.els['summary-generalAssessment'].focused,true);
});
test('summary field size limit blocks insertion instead of dropping or truncating sources',()=>{
 const h=harness({many:120});h.ctx.api.bindSummaryAssistant();h.ctx.api.summaryAssistantOpen('generalAssessment');
 h.els['summary-assistant-select-visible'].listeners.click();
 h.els['summary-generalAssessment'].value='ق'.repeat(29900);
 assert.equal(h.ctx.api.summaryAssistantInsert(),false);
 assert.equal(h.els['summary-generalAssessment'].value.length,29900);
 assert.equal(h.els['summary-generalAssessment'].events.length,0);
 assert.match(h.els['summary-assistant-feedback'].textContent,/30000/);
});
test('switching cloud mission blocks insertion from a different mission',()=>{
 const h=harness({shared:true});h.ctx.api.bindSummaryAssistant();h.ctx.api.summaryAssistantOpen('generalAssessment');
 h.els['summary-assistant-select-visible'].listeners.click();
 h.ctx.sharedReportMissionId='mission-B';
 assert.equal(h.ctx.api.summaryAssistantInsert(),false);
 assert.equal(h.els['summary-generalAssessment'].value,'');
});
test('HTML escaping protects contributor names and text when rendering all sources',()=>{
 const h=harness();h.entries.D1.findings=[{text:'<script>bad</script>',authorName:'<b>test</b>'}];
 h.ctx.api.summaryAssistantOpen('generalAssessment');
 assert.match(h.els['summary-assistant-results'].innerHTML,/&lt;script&gt;bad&lt;\/script&gt;/);
 assert.doesNotMatch(h.els['summary-assistant-results'].innerHTML,/<script>/);
 assert.doesNotMatch(h.els['summary-assistant-results'].innerHTML,/<b>test<\/b>/);
});
test('cancel without insertion preserves all report text and attribution',()=>{
 const h=harness({shared:true});h.els['summary-generalAssessment'].value='نص أصلي';
 h.ctx.api.summaryAssistantOpen('generalAssessment');
 h.ctx.api.summaryAssistantClose();
 assert.equal(h.els['summary-generalAssessment'].value,'نص أصلي');
 assert.equal(h.els['summary-generalAssessment'].events.length,0);
 assert.equal(h.els['report-summary-assistant'].open,false);
});
test('assistant actions are screen-only and leave cloud writes and output generators unchanged',()=>{
 assert.match(html,/id="report-summary-assistant"/);
 assert.match(html,/id="summary-assistant-results"/);
 assert.match(app,/data-summary-assist="\$\{id\}"/);
 assert.match(app,/bindSummaryAssistant\(\)/);
 assert.match(css,/@media print\{\.report-summary-assistant,\.summary-assistant-launch\{display:none!important\}\}/);
 assert.match(cloud,/set_inspection_report_field/);
 assert.doesNotMatch(helpers,/fetch\(|localStorage\.setItem|sessionStorage\.setItem|\/rest\/v1\/rpc/);
 assert.doesNotMatch(helpers,/commitPendingEntries\(|saveEmbedded\(|exportDOCX\(|exportPDF\(/);
});
