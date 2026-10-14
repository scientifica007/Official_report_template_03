/* Local PDF batch assembler for low-memory Android print services.
 * This tool NEVER sends report pages to a server. The official PDF desktop
 * print code in app.js is deliberately not changed.
 */
(function(){
 'use strict';
 const input=document.getElementById('mobile-pdf-files');
 const list=document.getElementById('mobile-pdf-file-list');
 const mergeButton=document.getElementById('mobile-pdf-merge');
 const status=document.getElementById('mobile-pdf-status');
 if(!input||!list||!mergeButton||!status)return;
 let files=[],busy=false,libraryPromise=null;
 const PDF_HEADER=[37,80,68,70,45]; // %PDF-
 const escapeText=value=>String(value||'');
 function announce(message,error=false){
  status.textContent=message;
  status.dataset.error=error?'true':'false';
 }
 function validateFiles(selected){
  if(!Array.isArray(selected)||selected.length<2||selected.length>40)
   throw Error('اختر ملفين PDF على الأقل ولا تتجاوز 40 جزءًا.');
  const total=selected.reduce((n,f)=>n+f.size,0);
  if(total>80*1024*1024)throw Error('حجم الأجزاء أكبر من 80 ميغابايت. استخدم الحاسوب لدمج هذا التقرير.');
  for(const f of selected){
   if(!f||typeof f.arrayBuffer!=='function'||f.size<100)
    throw Error('يوجد ملف فارغ أو غير صالح. أعد طباعة هذا الجزء قبل الدمج.');
   if(f.size>20*1024*1024)throw Error('الجزء '+escapeText(f.name)+' كبير جدًا.');
  }
 }
 async function mergePdfFiles(selected,PDFLib){
  validateFiles(selected);
  if(!PDFLib?.PDFDocument?.create||!PDFLib?.PDFDocument?.load)
   throw Error('مكتبة دمج PDF غير جاهزة.');
  const merged=await PDFLib.PDFDocument.create();
  let pages=0;
  for(const file of selected){
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(PDF_HEADER.some((b,i)=>bytes[i]!==b))
    throw Error('الملف '+escapeText(file.name)+' ليس PDF صالحًا. لا تستخدم الملفات بحجم صفر.');
   let original;
   try{original=await PDFLib.PDFDocument.load(bytes,{updateMetadata:false})}
   catch(e){throw Error('تعذر قراءة '+escapeText(file.name)+'؛ أعد طباعة هذا الجزء أو جرّب ملفًا آخر.')}
   const indices=original.getPageIndices();
   if(!indices.length)throw Error('ملف PDF بلا صفحات: '+escapeText(file.name));
   if(pages+indices.length>300)throw Error('عدد الصفحات كبير جدًا للهاتف (300 صفحة كحد أقصى).');
   const copies=await merged.copyPages(original,indices);
   for(const page of copies)merged.addPage(page);
   pages+=indices.length;
  }
  const output=await merged.save({useObjectStreams:false});
  if(output.length<100||PDF_HEADER.some((b,i)=>output[i]!==b))
   throw Error('لم ينجح إنشاء ملف PDF النهائي.');
  return {bytes:output,pages};
 }
 function renderList(){
  list.replaceChildren();
  files.forEach((file,i)=>{
   const line=document.createElement('div');line.className='mobile-pdf-file';
   const label=document.createElement('span');
   label.textContent=(i+1)+'. '+file.name+' ('+Math.ceil(file.size/1024)+' ك.ب)';
   const arrows=document.createElement('span');arrows.className='mobile-pdf-arrows';
   for(const [action,txt,disabled] of [['up','↑',i===0],['down','↓',i===files.length-1]]){
    const b=document.createElement('button');b.type='button';b.textContent=txt;
    b.title=action==='up'?'تقديم الجزء':'تأخير الجزء';b.disabled=disabled||busy;
    b.dataset.pdfMove=action;b.dataset.index=String(i);arrows.appendChild(b);
   }
   line.append(label,arrows);list.appendChild(line);
  });
  mergeButton.disabled=busy||files.length<2;
 }
 function loadLibrary(){
  if(window.PDFLib?.PDFDocument)return Promise.resolve(window.PDFLib);
  if(libraryPromise)return libraryPromise;
  // Self-hosted, pinned and audited dependency: no third-party code is fetched.
  libraryPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='./vendor/pdf-lib-1.17.1.min.js';script.async=true;
   script.onload=()=>window.PDFLib?.PDFDocument?resolve(window.PDFLib):reject(Error('تعذر تشغيل مكتبة دمج PDF.'));
   script.onerror=()=>reject(Error('تعذر تحميل مكتبة دمج PDF المحلية. تحقق من اتصال الإنترنت.'));
   document.head.appendChild(script);
  }).catch(e=>{libraryPromise=null;throw e});
  return libraryPromise;
 }
 function downloadMerged(bytes){
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const a=document.createElement('a');
  a.href=url;a.download='inspection_03_mobile_merged_'+new Date().toISOString().slice(0,10)+'.pdf';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 input.addEventListener('change',()=>{
  const selected=Array.from(input.files||[]);
  try{
   if(selected.length===0){files=[];announce('اختر أجزاء PDF بعد حفظها من نافذة الطباعة.');}
   else {validateFiles(selected);files=selected;announce('تأكد من ترتيب الأجزاء حسب تسلسل الصفحات، ثم اضغط دمج. لا تكرر أي نطاق.');}
  }catch(e){files=[];announce(e.message,true);}
  renderList();
 });
 list.addEventListener('click',event=>{
  const b=event.target.closest('button[data-pdf-move]');
  if(!b||busy)return;
  const i=Number(b.dataset.index),j=i+(b.dataset.pdfMove==='up'?-1:1);
  if(!Number.isInteger(i)||!files[i]||!files[j])return;
  [files[i],files[j]]=[files[j],files[i]];
  renderList();
 });
 mergeButton.addEventListener('click',async()=>{
  if(busy)return;
  busy=true;renderList();announce('جارٍ جمع الأجزاء على جهازك، دون إرسال الملفات إلى الإنترنت…');
  try{
   const pdf=await loadLibrary();
   const combined=await mergePdfFiles(files,pdf);
   downloadMerged(combined.bytes);
   announce('أُنشئ ملف PDF يضم '+combined.pages+' صفحة. تحقق من ترتيبه واتجاه الصفحات بعد فتحه.');
  }catch(e){announce('فشل الدمج: '+e.message,true);}
  finally{busy=false;renderList();}
 });
 window.Report03PdfBatch={mergePdfFiles,validateFiles};
 renderList();
})();
