import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const source=readFileSync('app.js','utf8').replace(/\binit\(\);\s*$/,'');
const qrSource=readFileSync('vendor/qrcodegen.min.js','utf8');
const catalog=JSON.parse(readFileSync('catalog.json','utf8'));

function createHarness(){
 const printRoot={innerHTML:''};
 const progress={textContent:''};
 const document={getElementById(id){if(id==='print-root')return printRoot;if(id==='report-progress')return progress;return null}};
 const context=vm.createContext({document,__catalog:catalog,TextEncoder,window:{}});
 vm.runInContext(qrSource,context,{timeout:10000});
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

test('generated Word download is a valid OOXML ZIP with four-column RTL tables',()=>{
 const h=createHarness();
 h.run("pendingDrafts['III-07-I002']={findings:'معاينة في ملف Word',recommendations:'توصية في ملف Word'};download=(bytes,type,extension)=>{globalThis.__filebytes=bytes};showToast=()=>{};exportDOCX();");
 const buffer=Buffer.from(h.run('globalThis.__filebytes'));
 const dir=mkdtempSync(join(tmpdir(),'official03-'));
 const filename=join(dir,'report.docx');
 try{
  writeFileSync(filename,buffer);
  const code=`import sys,zipfile,xml.etree.ElementTree as ET
p=sys.argv[1]
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
with zipfile.ZipFile(p) as archive:
 assert archive.testzip() is None
 assert '[Content_Types].xml' in archive.namelist()
 root=ET.fromstring(archive.read('word/document.xml'))
 tables=root.findall('.//w:tbl',ns)
 assert len(tables)==8,len(tables)
 for table in tables:
  for row in table.findall('w:tr',ns):
   assert len(row.findall('w:tc',ns))==4
 page_sizes=root.findall('.//w:pgSz',ns)
 assert any(p.attrib.get('{'+ns['w']+'}orient')=='landscape' for p in page_sizes)
 assert any(p.attrib.get('{'+ns['w']+'}orient')=='portrait' for p in page_sizes)
 texts=[t.text or '' for t in root.findall('.//w:t',ns)]
 assert 'معاينة في ملف Word' in texts
 assert 'توصية في ملف Word' in texts
`;
  execFileSync('python3',['-c',code,filename],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('M1.6: selected assessment states are conspicuous in PDF print and editable DOCX',()=>{
 const h=createHarness();
 h.run(`state.entries['III-01-I001']={assessment:'non_compliant',findings:[],recommendations:[]};
state.entries['III-01-I002']={assessment:'compliant',findings:[],recommendations:[]};
state.entries['III-02-I004']={assessment:'not_applicable',findings:[],recommendations:[]};
buildPrint();`);
 const out=h.printRoot.innerHTML;
 for(const [code,label] of [['non_compliant','غير مطابق'],['compliant','مطابق'],['not_applicable','غير معني']]){
  assert.match(out,new RegExp('print-status-'+code));
  assert.match(out,new RegExp('حالة التقييم:</strong> '+label));
  assert.match(h.run('documentXML()'),new RegExp('حالة التقييم: '+label));
 }
 assert.doesNotMatch(out,/لم يُقيّم بعد/);
 assert.doesNotMatch(out,/<div class="print-draft">[^<]*<\/div><section class="print-section print-intro"/);
});
test('M1.6: CSS explicitly replaces print browser URL, title, timestamp margin boxes',()=>{
 const css=readFileSync('style.css','utf8');
 for(const page of ['inspectionPortrait','inspectionLandscape']){
  // There is an earlier layout rule and a later metadata-suppression rule.
  const start=css.lastIndexOf('@page '+page+' {');
  assert.ok(start>=0,'Missing named page '+page);
  const rule=css.slice(start,start+420);
  for(const slot of ['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right'])
   assert.ok(rule.includes('@'+slot+'{content:""}'),'Missing empty '+slot+' in '+page);
 }
 assert.match(css,/print-status-non_compliant/);
 assert.match(css,/print-color-adjust:exact/);
});


test('M1.7: footer automatically switches singular and plural; QR payload is Arabic offline text',()=>{
 const h=createHarness();
 h.run("state.mission.purpose='فحص سير المؤسسة';state.institution.name='مؤسسة الاختبار';state.mission.visitDates='12/10/2026';state.inspectors=[{name:'مفتش واحد',role:'IFEP'}]");
 assert.equal(h.run('signatureHeading()'),'إمضاء السيد المفتش');
 let payload=h.run('reportQrPayload()');
 for(const term of ['تقرير التفتيش المعمق','فحص سير المؤسسة','مؤسسة الاختبار','12/10/2026','مفتش واحد','مفتش التكوين والتعليم المهنيين'])assert.ok(payload.includes(term),term);
 assert.ok(!payload.includes('scientifica007.github.io'));
 h.run("state.inspectors.push({name:'مفتش ثان',role:'IAF'})");
 assert.equal(h.run('signatureHeading()'),'إمضاء السادة المفتشين');
 payload=h.run('reportQrPayload()');
 assert.match(payload,/مفتش ثان — مفتش إداري ومالي/);
 h.run('buildPrint()');
 const printed=h.printRoot.innerHTML;
 assert.match(printed,/class="print-section print-closing print-signatures"/);
 assert.match(printed,/إمضاء السادة المفتشين/);
 assert.match(printed,/مفتش واحد/);
 assert.match(printed,/مفتش ثان/);
 assert.match(printed,/class="report-qr-svg"/);
 assert.doesNotMatch(printed,/لا يُعد إمضاءً إلكترونيًا[\s\S]*<section/);
});

test('M1.7: QR matrix, SVG and byte-perfect PNG can be read without network access',()=>{
 const h=createHarness();
 h.run("state.mission.purpose='زيارة تفتيش بيداغوجي وإداري';state.institution.name='المعهد الوطني للتكوين المهني';state.mission.visitDates='11/10/2026 إلى 12/10/2026';state.inspectors=[{name:'المفتش أ',role:'IFEP'},{name:'المفتش ب',role:'IAF'}]");
 const q=h.run('reportQrMatrix()');
 assert.ok(q.size>=21&&q.size<=177);
 const svg=h.run('reportQrSvg(reportQrMatrix())');
 assert.match(svg,/shape-rendering="crispEdges"/);
 assert.match(svg,/path fill="#000"/);
 const png=Buffer.from(h.run('qrPng(reportQrMatrix())'));
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const dir=mkdtempSync(join(tmpdir(),'report03-qr-'));
 try{
  const name=join(dir,'report-qr.png');writeFileSync(name,png);
  const script=`import struct,sys,zlib
p=open(sys.argv[1],'rb').read()
assert p[:8]==b'\\x89PNG\\r\\n\\x1a\\n'
offset=8;chunks={}
while offset<len(p):
 size=struct.unpack('>I',p[offset:offset+4])[0]
 name=p[offset+4:offset+8];value=p[offset+8:offset+8+size]
 check=struct.unpack('>I',p[offset+8+size:offset+12+size])[0]
 assert zlib.crc32(name+value)&0xffffffff==check,(name,check)
 chunks[name]=value;offset+=12+size
w,h,depth,mode=struct.unpack('>IIBB',chunks[b'IHDR'][:10])
assert w==h and 100<w<1000 and depth==1 and mode==0,(w,h,depth,mode)
raw=zlib.decompress(chunks[b'IDAT'])
assert len(raw)==h*(1+(w+7)//8)
assert raw[0]==0
`;
  execFileSync('python3',['-c',script,name],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('M1.7: generated DOCX contains actual QR media and drawing relationship',()=>{
 const h=createHarness();
 h.run("state.mission.purpose='فحص ميداني';state.institution.name='المؤسسة';state.mission.visitDates='12/10/2026';state.inspectors=[{name:'الأول',role:'IFEP'},{name:'الثاني',role:'IAF'}];download=(bytes)=>{globalThis.__filebytes=bytes};showToast=()=>{};exportDOCX();");
 const bytes=Buffer.from(h.run('globalThis.__filebytes'));
 const dir=mkdtempSync(join(tmpdir(),'report03-word-'));
 try{
  const name=join(dir,'signed.docx');writeFileSync(name,bytes);
  const script=`import zipfile,sys,xml.etree.ElementTree as ET,zlib,struct
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 image=z.read('word/media/report-qr.png')
 assert image[:8]==b'\\x89PNG\\r\\n\\x1a\\n'
 rel=z.read('word/_rels/document.xml.rels')
 assert b'rIdQr' in rel and b'media/report-qr.png' in rel
 ct=z.read('[Content_Types].xml')
 assert b'image/png' in ct
 root=ET.fromstring(z.read('word/document.xml'))
 ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
     'a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
 assert root.findall('.//w:drawing',ns)
 txt=' '.join(t.text or '' for t in root.findall('.//w:t',ns))
 assert 'إمضاء السادة المفتشين' in txt and 'الأول' in txt and 'الثاني' in txt
`;
  execFileSync('python3',['-c',script,name],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('M1.8: oversized Arabic report metadata does NOT block PDF content or signatures',()=>{
 const h=createHarness();
 h.run(`state.mission.purpose='بيانات تجريبية مطوّلة '.repeat(65);
 state.institution.name='اسم مؤسسة تجريبي طويل '.repeat(65);
 state.mission.visitDates='تاريخ اختبار طويل '.repeat(65);
 state.inspectors=[{name:'مفتش تجريبي',role:'IFEP'}];
 state.entries['III-01-I001']={assessment:'non_compliant',findings:[{id:'f1',text:'معاينة مهمة لا يجوز فقدانها'}],recommendations:[]};`);
 const q=h.run('reportQrForExport()');
 assert.equal(q.matrix,null);
 assert.match(q.warning,/سعة رمز QR/);
 assert.ok(new TextEncoder().encode(h.run('reportQrPayload()')).length>2953);
 assert.doesNotThrow(()=>h.run('buildPrint()'));
 const out=h.printRoot.innerHTML;
 assert.match(out,/class="print-section print-closing print-signatures"/);
 assert.match(out,/تعذر إدراج رمز QR/);
 assert.match(out,/معاينة مهمة لا يجوز فقدانها/);
 assert.match(out,/مفتش تجريبي/);
 assert.match(out,/غير مطابق/);
});

test('M1.8: oversized Arabic report downloads valid DOCX without QR, without losing content',()=>{
 const h=createHarness();
 h.run(`state.mission.purpose='هدف طويل تجريبي '.repeat(70);
 state.institution.name='اسم مؤسسة اختبار مطوّل '.repeat(70);
 state.mission.visitDates='مواعيد اختبار مطوّلة '.repeat(70);
 state.inspectors=[{name:'مفتش الاختبار',role:'IFEP'}];
 state.entries['III-01-I001']={assessment:'non_compliant',findings:[{id:'f1',text:'معاينة محفوظة أثناء فشل رمز QR'}],recommendations:[]};
 download=(bytes)=>{globalThis.__filebytes=bytes};showToast=()=>{};exportDOCX();`);
 const bytes=Buffer.from(h.run('globalThis.__filebytes'));
 assert.ok(bytes.length>1000,'DOCX actually downloaded into buffer');
 const dir=mkdtempSync(join(tmpdir(),'report03-oversize-qr-'));
 try{
  const name=join(dir,'report.docx');writeFileSync(name,bytes);
  const script=`import zipfile,sys,xml.etree.ElementTree as ET
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 assert 'word/media/report-qr.png' not in z.namelist()
 assert 'word/_rels/document.xml.rels' not in z.namelist()
 root=ET.fromstring(z.read('word/document.xml'))
 n={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
 text=' '.join(v.text or '' for v in root.findall('.//w:t',n))
 assert 'معاينة محفوظة أثناء فشل رمز QR' in text
 assert 'إمضاء السيد المفتش' in text
 assert 'تعذر إدراج رمز QR' in text
 assert 'حالة التقييم: غير مطابق' in text
`;
  execFileSync('python3',['-c',script,name],{stdio:'pipe'});
 }finally{rmSync(dir,{recursive:true,force:true})}
});


function bookHarness(){
 const h=createHarness(),storage=new Map();
 h.context.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 h.context.confirm=()=>true;
 h.run('render=()=>{};showToast=()=>{};loadInstitutionBook()');
 return {h,storage};
}
test('M1.9: save institution and director, never report data or team',()=>{
 const {h,storage}=bookHarness();
 h.run("state.institution={name:'معهد تبسة',wilaya:'تبسة',code:'1201'};state.director={fullName:'المدير السابق',rank:'مدير'};state.mission.purpose='زيارة ميدانية';state.inspectors[0].name='المفتش';saveInstitution()");
 const raw=[...storage.values()][0];
 assert.match(raw,/معهد تبسة/);
 assert.match(raw,/المدير السابق/);
 assert.doesNotMatch(raw,/زيارة ميدانية|المفتش/);
 assert.equal(h.run('institutionBook.length'),1);
 assert.equal(h.run("institutionBook[0].director.fullName"),'المدير السابق');
});
test('M1.9: institution president remains until explicit update, then persists across report resets',()=>{
 const {h}=bookHarness();
 h.run("state.institution={name:'المؤسسة أ',wilaya:'تبسة',code:'1201'};state.director={fullName:'المدير أ'};saveInstitution()");
 h.run("state.director.fullName='المدير ب';state=emptyState();selectedInstitutionId='';chooseInstitution(institutionBook[0].id)");
 assert.equal(h.run('state.director.fullName'),'المدير أ');
 h.run("state.director.fullName='المدير ب';saveInstitution();state=emptyState();selectedInstitutionId='';chooseInstitution(institutionBook[0].id)");
 assert.equal(h.run('state.director.fullName'),'المدير ب');
});
test('M1.9: changing institution while findings exist is blocked',()=>{
 const {h}=bookHarness();
 h.run("state.institution={name:'الأولى',code:'1'};state.director={fullName:'مدير 1'};saveInstitution();state.institution={name:'الثانية',code:'2'};state.director={fullName:'مدير 2'};selectedInstitutionId='';saveInstitution()");
 h.run("state.entries['III-01-I001']={assessment:'non_compliant',findings:[{id:'1',text:'معاينة سابقة'}],recommendations:[]};chooseInstitution(institutionBook[0].id)");
 assert.equal(h.run('state.institution.name'),'الثانية');
 assert.equal(h.run("state.entries['III-01-I001'].findings[0].text"),'معاينة سابقة');
});
test('M1.9: duplicate records skipped during import without altering existing director',async()=>{
 const {h}=bookHarness();
 h.run("state.institution={name:'المعهد',wilaya:'تبسة',code:'1201'};state.director={fullName:'المدير أ'};saveInstitution()");
 h.context.__data=JSON.stringify({format:'OFFICIAL_REPORT_03_INSTITUTIONS_V1',institutions:[
 {id:'1',institution:{name:'المعهد',wilaya:'تبسة',code:'1201'},director:{fullName:'شخص مختلف'}},
 {id:'2',institution:{name:'معهد آخر',code:'1202'},director:{fullName:'المدير ب'}}]});
 await h.run("importInstitutions({target:{files:[{size:999,text:()=>Promise.resolve(__data)}],value:''}})");
 assert.equal(h.run('institutionBook.length'),2);
 assert.equal(h.run('institutionBook[0].director.fullName'),'المدير أ');
 assert.equal(h.run('institutionBook[1].director.fullName'),'المدير ب');
});
test('M1.9: report reset does not remove local directory',()=>{
 const {h,storage}=bookHarness();
 h.run("state.institution={name:'مركز الشريعة',code:'1234'};state.director={fullName:'المدير'};saveInstitution()");
 const json=[...storage.values()][0];
 h.run("state=emptyState();selectedInstitutionId='';loadInstitutionBook()");
 assert.equal([...storage.values()][0],json);
 assert.equal(h.run('institutionBook.length'),1);
 assert.equal(h.run('state.institution.name'),undefined);
});
test('M1.9: register controls precede identity fields and QR footer omits unwanted phrase',()=>{
 const {h}=bookHarness();
 const markup=h.run('renderMeta()');
 assert.ok(markup.indexOf('id="stored-institution"')<markup.indexOf('id="institution-name"'));
 assert.match(markup,/حفظ المؤسسة ورئيسها/);
 h.run("state.institution.name='المؤسسة';buildPrint()");
 assert.doesNotMatch(h.printRoot.innerHTML,/ولا يُعد إمضاءً إلكترونيًا/);
 assert.doesNotMatch(h.run('documentXML(true)'),/ولا يُعد إمضاءً إلكترونيًا/);
});
