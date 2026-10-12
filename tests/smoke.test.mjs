import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const catalog = JSON.parse(readFileSync('catalog.json', 'utf8'));
const app = readFileSync('app.js', 'utf8');
test('JavaScript parses', () => {
  execFileSync(process.execPath, ['--check', 'app.js']);
});
test('official chapter skeleton is present', () => {
  assert.equal(catalog.templateId, 'OFFICIAL_REPORT_TEMPLATE_03');
  assert.deepEqual(catalog.sections.map(x=>x.id), ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI']);
  const domains = catalog.sections.flatMap(x=>x.domains);
  assert.equal(domains.filter(x=>x.id !== 'IX-GENERAL').length, 38);
  const ids=domains.flatMap(d=>[d.id,...d.indicators.map(i=>i.id)]);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(catalog.catalogStatus, 'PROVISIONAL_PDF_REVIEW_REQUIRED');
});
test('data are not persisted automatically or sent to a server', () => {
  assert.doesNotMatch(app, /localStorage\s*\.\s*setItem\s*\(/);
  assert.doesNotMatch(app, /indexedDB\s*\.\s*open\s*\(/);
  assert.doesNotMatch(app, /navigator\.sendBeacon\s*\(/);
  assert.match(app,/function clearReport\(/);
  assert.match(app,/function exportJSON\(/);
  assert.match(app,/function importJSON\(/);
  assert.match(app,/function exportDOCX\(/);
  assert.match(app,/function exportPDF\(/);
});
test('site is self-contained', () => {
  const html = readFileSync('index.html','utf8');
  assert.match(html,/lang="ar" dir="rtl"/);
  assert.match(html,/\.\/app\.js/);
  assert.match(html,/\.\/style\.css/);
  assert.match(app,/fetch\('\.\/catalog\.json'/);
});


test('split continuation is a single official evaluation element', () => {
  const p = catalog.sections.find(s=>s.id==='III').domains.find(d=>d.id==='III-02');
  assert.equal(p.indicators.length, 5);
  assert.equal(p.indicators[4].label, 'إعداد حصيلة تنفيذه و عرضها على مجلس التوجيه للمصادقة');
  assert.match(app,/oldId==='III-02-I006'\?'III-02-I005'/);
});
test('numbered chapters use a dedicated numbering column in the print layout', () => {
  assert.match(app,/class=\\?"numbered-table/);
  assert.match(app,/class=\\?"number-cell/);
});

test('assessment controls and status exports preserve the official table columns',()=>{
  assert.match(app,/const ASSESSMENTS=Object\.freeze/);
  for(const code of ['compliant','non_compliant','not_applicable'])assert.match(app,new RegExp(code));
  assert.match(app,/function renderAssessmentControl/);
  assert.match(app,/data-assessment=/);
  assert.match(app,/assessment:assessmentLabel\(e\.assessment\)/);
  assert.match(app,/function entryHtml\(id\)/);
  assert.match(app,/function getEntryParagraphs\(id\)/);
  assert.match(app,/function clearReport\(\)/);
});

test('proofreading preserves original text and stable record identity',()=>{
  const all=catalog.sections.flatMap(s=>s.domains.flatMap(d=>[d,...d.indicators]));
  const ids=all.map(x=>x.id);
  assert.equal(ids.length,new Set(ids).size);
  assert.equal(all.filter(x=>!!x.sourceLabel).length,81);
  const key=all.find(x=>x.id==='III-01-I001');
  assert.equal(key.label,'القانون الأساسي النموذجي');
  assert.equal(key.sourceLabel,'القانون الأساسي النوذجي');
  assert.equal(all.find(x=>x.id==='VII-01-I003').label,'تقييم تسيير المطعم (إجراءات استلام المواد الغذائية)');
  assert.equal(catalog.catalogVersion,'M1.3-PROOFREAD-2026-10-12');
  assert.equal(catalog.catalogStatus,'PROVISIONAL_PDF_REVIEW_REQUIRED');
});
