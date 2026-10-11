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
  assert.equal(p.indicators[4].label, 'اعداد حصيلة تنفيذه و عرضها على مجلس التوجيه للمصادقة');
  assert.match(app,/oldId==='III-02-I006'\?'III-02-I005'/);
});
test('numbered chapters use a dedicated numbering column in the print layout', () => {
  assert.match(app,/class=\\?"numbered-table/);
  assert.match(app,/class=\\?"number-cell/);
});
