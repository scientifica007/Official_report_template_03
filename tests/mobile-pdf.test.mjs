import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const pdfLib=require('../vendor/pdf-lib-1.17.1.min.js');
const source=readFileSync('mobile-pdf.js','utf8');
function harness(){
 const listeners={};
 const element=(key)=>({
  id:key,addEventListener(name,fn){listeners[key+':'+name]=fn},
  replaceChildren(){},appendChild(){},append(){},textContent:'',dataset:{},disabled:false
 });
 const elements=Object.fromEntries(['mobile-pdf-files','mobile-pdf-file-list','mobile-pdf-merge','mobile-pdf-status'].map(key=>[key,element(key)]));
 const document={
  getElementById(id){return elements[id]||null},
  createElement(){return {appendChild(){},append(){},dataset:{},remove(){},click(){}}},
  head:{appendChild(){throw Error('No CDN or lazy script needed for these tests')}},
  body:{appendChild(){}}
 };
 const win={PDFLib:pdfLib};
 const context={document,window:win,Blob,URL,setTimeout,Uint8Array};
 vm.runInNewContext(source,context,{timeout:8000});
 return {win,elements,listeners};
}
async function file(name,pageLabel){
 const document=await pdfLib.PDFDocument.create();
 const page=document.addPage([pageLabel==='portrait'?595:842,pageLabel==='portrait'?842:595]);
 page.drawText(name);
 const bytes=await document.save();
 return {name,size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
}
test('M4.3: local mobile PDF assembler combines real pages preserving page dimensions and order',async()=>{
 const a=await file('one','portrait'),b=await file('two','landscape'),h=harness();
 const result=await h.win.Report03PdfBatch.mergePdfFiles([a,b],pdfLib);
 const final=await pdfLib.PDFDocument.load(result.bytes);
 assert.equal(result.pages,2);
 assert.equal(final.getPageCount(),2);
 assert.ok(final.getPage(0).getWidth()<final.getPage(0).getHeight(),'portrait retained');
 assert.ok(final.getPage(1).getWidth()>final.getPage(1).getHeight(),'landscape retained');
 assert.ok(result.bytes.length>100);
 assert.equal(String.fromCharCode(...result.bytes.slice(0,5)),'%PDF-');
});
test('M4.3: empty or invalid Android print files cannot silently enter merged output',async()=>{
 const good=await file('valid','portrait'),h=harness();
 const empty={name:'zero.pdf',size:0,arrayBuffer:async()=>new ArrayBuffer(0)};
 await assert.rejects(async()=>h.win.Report03PdfBatch.mergePdfFiles([good,empty],pdfLib),/فارغ/);
 const fake={name:'fake.pdf',size:300,arrayBuffer:async()=>new Uint8Array(300).buffer};
 await assert.rejects(async()=>h.win.Report03PdfBatch.mergePdfFiles([good,fake],pdfLib),/ليس PDF صالح/);
});
test('M4.3: no reports uploaded, no external scripts, desktop print generator unchanged',()=>{
 const html=readFileSync('index.html','utf8');
 const app=readFileSync('app.js','utf8');
 const style=readFileSync('style.css','utf8');
 assert.match(html,/mobile-pdf-merge/);
 assert.match(html,/\.\/mobile-pdf\.js/);
 assert.match(source,/\.\/vendor\/pdf-lib-1\.17\.1\.min\.js/);
 assert.doesNotMatch(source,/https?:\/\//);
 assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|FormData/);
 assert.match(app,/function exportPDF\(\)\{commitPendingEntries\(\);buildPrint\(\);/);
 assert.match(style,/@page inspectionLandscape/);
 assert.match(style,/@page inspectionPortrait/);
});

test('M4.3: old Android file pickers can add PDF batches one file at a time',async()=>{
 const h=harness();
 const f1=await file('batch-1.pdf','portrait');
 h.elements['mobile-pdf-files'].files=[f1];
 h.listeners['mobile-pdf-files:change']();
 assert.equal(h.elements['mobile-pdf-merge'].disabled,true);
 assert.match(h.elements['mobile-pdf-status'].textContent,/1 جزء/);
 const f2=await file('batch-2.pdf','landscape');
 h.elements['mobile-pdf-files'].files=[f2];
 h.listeners['mobile-pdf-files:change']();
 assert.equal(h.elements['mobile-pdf-merge'].disabled,false);
 assert.match(h.elements['mobile-pdf-status'].textContent,/2 جزء/);
 // Re-selecting same file does not duplicate the pages.
 h.elements['mobile-pdf-files'].files=[f1];
 h.listeners['mobile-pdf-files:change']();
 assert.match(h.elements['mobile-pdf-status'].textContent,/2 جزء/);
});
