import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('app.js','utf8').replace(/\binit\(\);\s*$/,'');
const catalog=JSON.parse(readFileSync('catalog.json','utf8'));

function createHarness(){
 const printRoot={innerHTML:''};
 const progress={textContent:''};
 const document={getElementById(id){if(id==='print-root')return printRoot;if(id==='report-progress')return progress;return null}};
 const context=vm.createContext({document,__catalog:catalog});
 vm.runInContext(source,context,{timeout:10000});
 vm.runInContext('catalog=__catalog;state=emptyState();',context);
 return {context,printRoot,progress,run(code){return vm.runInContext(code,context,{timeout:10000})}};
}

test('typed text survives navigation and is committed once to JSON',()=>{
 const h=createHarness();
 h.run(`pendingDrafts['III-07-I002']={findings:'معاينة ميدانية تجريبية',recommendations:'توصية ميدانية تجريبية'};`);
 h.run('commitPendingEntries();');
 assert.equal(h.run("getEntry('III-07-I002').findings.length"),1);
 assert.equal(h.run("getEntry('III-07-I002').recommendations.length"),1);
 h.run('commitPendingEntries();');
 assert.equal(h.run("getEntry('III-07-I002').findings.length"),1);
 const x=JSON.parse(JSON.stringify(h.run('exportSnapshot()')));
 assert.equal(x.entries['III-07-I002'].findings[0].text,'معاينة ميدانية تجريبية');
 assert.equal(x.entries['III-07-I002'].recommendations[0].text,'توصية ميدانية تجريبية');
});

test('exportSnapshot includes unsubmitted textarea drafts with no extra click',()=>{
 const h=createHarness();
 h.run("pendingDrafts['II-MAIN-I003A']={findings:'معاينة غير مضافة بالزر',recommendations:''}");
 const out=JSON.parse(JSON.stringify(h.run('exportSnapshot()')));
 assert.equal(out.entries['II-MAIN-I003A'].findings[0].text,'معاينة غير مضافة بالزر');
 assert.equal(h.run('Object.keys(pendingDrafts).length'),0);
});

test('print report contains eight four-column tables and notes within same criterion row',()=>{
 const h=createHarness();
 h.run("pendingDrafts['III-07-I002']={findings:'نص معاينة النموذج للاختبار',recommendations:'نص توصية النموذج للاختبار'};commitPendingEntries();buildPrint();");
 const out=h.printRoot.innerHTML;
 assert.equal((out.match(/class="report-four-column-table"/g)||[]).length,8);
 const row=(out.match(/<tr[\s\S]*?<\/tr>/g)||[]).find(x=>x.includes('مراقبة نسب تنفيذ البرامج'));
 assert.ok(row,'indicator must occur in a table row');
 assert.match(row,/<td[^>]*>نص معاينة النموذج للاختبار<\/p><\/td>|<td[^>]*><p[^>]*>نص معاينة النموذج للاختبار<\/p><\/td>/);
 assert.match(row,/نص توصية النموذج للاختبار/);
 assert.match(row,/print-findings-cell/);
 assert.match(row,/print-recommendations-cell/);
 assert.doesNotMatch(row,/لم يُقيّم بعد/);
});

test('DOCX contains four cells per row, observations and recommendations, and landscape section',()=>{
 const h=createHarness();
 h.run("pendingDrafts['III-07-I002']={findings:'معاينة Word للاختبار',recommendations:'توصية Word للاختبار'};commitPendingEntries();");
 const out=h.run('documentXML()');
 assert.equal((out.match(/<w:tblGrid>/g)||[]).length,8);
 assert.equal((out.match(/<w:gridCol\b/g)||[]).length,32);
 assert.match(out,/w:orient="landscape"/);
 assert.match(out,/w:orient="portrait"/);
 const containing=(out.match(/<w:tr>[\s\S]*?<\/w:tr>/g)||[]).find(x=>x.includes('مراقبة نسب تنفيذ البرامج'));
 assert.ok(containing);
 assert.match(containing,/معاينة Word للاختبار/);
 assert.match(containing,/توصية Word للاختبار/);
 assert.equal((containing.match(/<w:tc>/g)||[]).length,4);
});

test('print and DOCX safely escape user-authored text',()=>{
 const h=createHarness();
 h.run("pendingDrafts['III-07-I002']={findings:'<img src=x onerror=alert(1)>',recommendations:'نص آمن'};commitPendingEntries();buildPrint();");
 assert.doesNotMatch(h.printRoot.innerHTML,/<img src=x/);
 assert.match(h.printRoot.innerHTML,/&lt;img src=x/);
 const out=h.run('documentXML()');
 assert.match(out,/&lt;img src=x/);
});

test('clearing state and drafts leaves no finding on future exports',()=>{
 const h=createHarness();
 h.run("pendingDrafts['III-07-I002']={findings:'نص مؤقت',recommendations:''};state=emptyState();pendingDrafts=Object.create(null);");
 const x=JSON.parse(JSON.stringify(h.run('exportSnapshot()')));
 assert.deepEqual(x.entries,{});
});
