import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync('app.js','utf8');
const html=readFileSync('index.html','utf8');
const css=readFileSync('style.css','utf8');
const start=app.indexOf('/* UX-03 — read-only report preview.');
const end=app.indexOf('function collectRecommendations(){',start);
assert.ok(start>=0&&end>start,'UX-03 helpers must be isolated by anchor');
const helpers=app.slice(start,end);

function harness({shared=false,remote=null}={}){
 let active=shared,missionId='mission-1',renderCalls=0,alertMessages=[];
 const printRoot={
  children:[{content:'previous print'}],
  replaceChildren(...items){this.children=items;}
 };
 const previewBody={
  children:[],
  replaceChildren(...items){this.children=items;}
 };
 const button={disabled:false};
 const dialog={open:false,showModal(){this.open=true},close(){this.open=false}};
 const elements={'print-root':printRoot,'report-preview-body':previewBody,
  'btn-preview':button,'report-preview-dialog':dialog};
 const context={
  pendingDrafts:{},sharedReportMissionId:missionId,
  $:id=>elements[id]||null,
  text:value=>String(value??'').trim(),
  isSharedReport:()=>active,
  window:{Report03CloudUI:{
   prepareSharedExport:remote||async()=>({missionId})
  },Report03CloudBridge:{applySharedReportData:()=>true}},
  buildPrint(){
   renderCalls++;
   printRoot.replaceChildren({content:'official report',cloneNode(deep){return {content:'official report clone',deep}}});
  },
  alert:msg=>alertMessages.push(msg)
 };
 vm.createContext(context);
 vm.runInContext(helpers+'\nthis.api={hasUncommittedLocalPreviewDrafts,prepareReportPreview,renderReportPreviewContent,openReportPreview,closeReportPreview,clearReportPreview};',context);
 return {context,elements,get renders(){return renderCalls},alertMessages,
  setMission(id){context.sharedReportMissionId=id},
  setShared(value){active=value}};
}
test('the preview button and accessible modal are part of the report editor',()=>{
 assert.match(html,/id="btn-preview"/);
 assert.match(html,/id="report-preview-dialog"/);
 assert.match(html,/id="report-preview-body"/);
 assert.match(html,/id="close-report-preview"/);
 assert.match(app,/previewButton\.onclick=openReportPreview/);
 assert.match(app,/previewDialog\.addEventListener\('close',clearReportPreview\)/);
});
test('local preview refuses uncommitted findings without silently saving them',async()=>{
 const h=harness();
 h.context.pendingDrafts['II-MAIN']={findings:'ملاحظة غير مضافة'};
 const before=JSON.stringify(h.context.pendingDrafts);
 await assert.rejects(h.context.api.prepareReportPreview(),/توجد معاينة أو توصية محلية/);
 assert.equal(JSON.stringify(h.context.pendingDrafts),before);
 assert.equal(h.renders,0);
});
test('locally recorded material can be previewed without committing anything',async()=>{
 const h=harness();
 assert.equal(await h.context.api.prepareReportPreview(),true);
 assert.equal(h.renders,0);
 assert.deepEqual(h.elements['report-preview-body'].children,[]);
});
test('shared preview always invokes the current server freshness and save gate',async()=>{
 let called=0,applied=0;
 const h=harness({shared:true,remote:async()=>{called++;return {missionId:'mission-1',entries:{}};}});
 h.context.window.Report03CloudBridge.applySharedReportData=payload=>{applied++;return payload.missionId==='mission-1'};
 assert.equal(await h.context.api.prepareReportPreview(),true);
 assert.equal(called,1);
 assert.equal(applied,1);
});
test('unsaved shared report blocks preview instead of showing stale content',async()=>{
 const h=harness({shared:true,remote:async()=>{throw Error('مسودة غير محفوظة')}});
 await assert.rejects(h.context.api.prepareReportPreview(),/مسودة غير محفوظة/);
 assert.equal(h.renders,0);
});
test('mission changed mid-refresh or failed data application blocks preview',async()=>{
 const h=harness({shared:true,remote:async()=>{h.setMission('mission-2');return {missionId:'mission-1'}}});
 await assert.rejects(h.context.api.prepareReportPreview(),/تعذر التحقق/);
 const other=harness({shared:true});
 other.context.window.Report03CloudBridge.applySharedReportData=()=>false;
 await assert.rejects(other.context.api.prepareReportPreview(),/تعذر عرض أحدث/);
});
test('preview clones the existing print renderer markup, then clears hidden print root',()=>{
 const h=harness();
 h.context.api.renderReportPreviewContent();
 assert.equal(h.renders,1);
 assert.equal(h.elements['report-preview-body'].children.length,1);
 assert.equal(h.elements['report-preview-body'].children[0].content,'official report clone');
 assert.equal(h.elements['report-preview-body'].children[0].deep,true);
 assert.equal(h.elements['print-root'].children.length,0);
});
test('open/close is modal and failure cannot leave locked buttons or stale previews',async()=>{
 const h=harness();
 await h.context.api.openReportPreview();
 assert.equal(h.elements['report-preview-dialog'].open,true);
 assert.equal(h.elements['btn-preview'].disabled,false);
 h.context.api.closeReportPreview();
 h.context.api.clearReportPreview();
 assert.equal(h.elements['report-preview-dialog'].open,false);
 assert.equal(h.elements['report-preview-body'].children.length,0);
 const bad=harness({shared:true,remote:async()=>{throw Error('لا اتصال')}});
 await bad.context.api.openReportPreview();
 assert.equal(bad.elements['report-preview-dialog'].open,false);
 assert.equal(bad.elements['btn-preview'].disabled,false);
 assert.match(bad.alertMessages[0],/لا اتصال/);
});
test('preview is screen only; existing report JSON DOCX PDF engines remain untouched',()=>{
 assert.match(css,/@media print\{\.report-preview-dialog\{display:none!important\}\}/);
 assert.match(css,/\.report-preview-body \.print-table-section \.report-four-column-table/);
 assert.match(app,/function buildPrint\(\)/);
 assert.match(app,/function exportPDF\(\)/);
 assert.match(app,/function exportDOCX\(\)/);
 assert.match(app,/function exportJSON\(\)/);
 assert.doesNotMatch(helpers,/commitPendingEntries\(|localStorage\.setItem|\/rest\/v1\/rpc\//);
});
