import {
 GROUPS,DISCUSSION,RUBRICS,newDraft,isAnalytical,lessonItems,
 withWeight,withSuggestions,validateWeights,freezeWeights,withScore,totals,groupSummaries,
 validateImport,serialize
} from "./engine.mjs";

// Static research prototype. No production reports, credentials or cloud writes.
let draft=newDraft("grouped5");
let notice="";
const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value??"").replace(/[&<>"']/g,ch=>
 ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const show=n=>n===null||n===undefined?"—":String(Number.isInteger(n)?n:Number(n.toFixed(4)));
function input(id,value,min,max,step,attributes){
 return '<input type="number" inputmode="decimal" id="'+escapeHTML(id)+'" min="'+min+
  '" max="'+max+'" step="'+step+'" value="'+escapeHTML(value)+'" '+attributes+'>';
}
function chip(value,kind){
 return '<span class="chip '+(kind||'')+'">'+escapeHTML(value)+'</span>';
}
function feedback(message){notice=message;$("feedback").textContent=message}
function scoreRows(phase,items){
 const marks=draft.scores[phase];
 return items.map(item=>{
  const zero=item.cap===0,has=Object.hasOwn(marks,item.id);
  return '<div class="mark-row"><div class="mark-label"><strong>'+escapeHTML(item.label)+
   '</strong><span>'+(zero?'الوزن صفر؛ محفوظ ضمن الشبكة دون تنقيط':'الحد الأقصى: '+show(item.cap))+
   '</span></div>'+(zero?'<output class="zero-indicator">غير منقّط (وزن صفر)</output>':
   input('score-'+phase+'-'+item.id,has?marks[item.id]:'',0,item.cap,'any',
     'data-score="'+phase+'" data-score-id="'+item.id+'" '+
     (isAnalytical(draft)&&!draft.profile.frozen?'disabled ':'')+
     'aria-label="علامة '+escapeHTML(item.label)+'"'))+
   '</div>';
 }).join('');
}
function renderWeights(){
 if(!isAnalytical(draft))return '';
 const profile=draft.profile,check=validateWeights(profile.weights);
 const groups=GROUPS.map(group=>{
  const detail=check.groups.find(x=>x.id===group.id);
  return '<section class="group"><div class="group-header"><h3>'+escapeHTML(group.label)+
   ' <small>/ '+group.cap+'</small></h3>'+
   chip('المجموع: '+show(detail?.total??0)+' / '+group.cap,detail?.complete?'pass':'warn')+
   '</div>'+group.items.map(item=>
     '<div class="mark-row"><div class="mark-label"><strong>'+escapeHTML(item.label)+
     '</strong><span>الوزن صفر مسموح؛ بخطوة 0.5</span></div>'+
     input('weight-'+item.id,profile.weights[item.id]??'',0,group.cap,.5,
     'data-weight="'+item.id+'" '+(profile.frozen?'disabled':'')+' aria-label="وزن '+escapeHTML(item.label)+'"')+
     '</div>').join('')+
     (detail?.complete?'':'<p class="group-hint">المتبقي/الزائد: '+show(detail?.difference??group.cap)+' نقطة</p>')+
   '</section>';
 }).join('');
 return '<section class="pane"><h2>إعداد أوزان الشبكة التحليلية</h2>'+
  '<p>14 مؤشرًا من PDF موزعة على خمسة معايير. يمكن جعل وزن مؤشر صفرًا، لكن مجموع المجموعة يجب أن يساوي سقفها بالضبط.</p>'+
  '<div class="actions"><button type="button" id="suggest" class="outline" '+(profile.frozen?'disabled':'')+
  '>إدراج توزيع إرشادي قابل للتعديل</button>'+
  '<button type="button" id="freeze" '+(profile.frozen||!check.valid?'disabled':'')+
  '>تثبيت الأوزان قبل التنقيط</button>'+
  (profile.frozen?chip('الأوزان مثبتة لهذه المسودة','pass'):'')+'</div>'+
  '<p class="muted small">التوزيع الإرشادي اجتهاد غير رسمي، ولا يُدرج إلا بطلب صريح. بعد تثبيت الأوزان لا تتغير داخل هذه المسودة.</p>'+
  groups+'</section>';
}
function renderMarks(){
 const result=totals(draft),ready=!isAnalytical(draft)||draft.profile.frozen;
 const items=ready?lessonItems(draft):[];
 const subgroupResults=ready&&isAnalytical(draft)?groupSummaries(draft):[];
 const lesson=ready?(isAnalytical(draft)?
  GROUPS.map(group=>'<section class="group"><h3>'+escapeHTML(group.label)+' <small>/ '+group.cap+
  '</small></h3>'+scoreRows('lesson',items.filter(item=>item.groupId===group.id))+
  '<p class="group-hint">مجموع المعيار: '+show(subgroupResults.find(r=>r.id===group.id)?.total)+' / '+group.cap+
  ' (مُدخل '+(subgroupResults.find(r=>r.id===group.id)?.entered??0)+' من '+
  (subgroupResults.find(r=>r.id===group.id)?.required??0)+')</p></section>').join(''):
  scoreRows('lesson',items)):
  '<p class="message">ثبت مجموع أوزان المؤشرات الأربعة عشر أولًا، ثم تصبح حقول علامات الحصة متاحة.</p>';
 return '<section class="pane"><h2>الحصة التدريسية <small>/ 40</small></h2>'+
  chip('أُدخل '+result.lesson.entered+' من '+result.lesson.required+' بنود قابلة للتنقيط',
    result.lesson.complete?'pass':'')+
  lesson+'</section>'+
  '<section class="pane"><h2>المناقشة <small>/ 20</small></h2>'+
  chip('أُدخل '+result.discussion.entered+' من '+result.discussion.required+' عناصر',
  result.discussion.complete?'pass':'')+scoreRows('discussion',DISCUSSION)+'</section>';
}
function renderSummary(){
 const t=totals(draft);
 const status=t.complete?(t.threshold30?'بلغ العتبة العددية أو تجاوزها':'لم يبلغ العتبة العددية'):
  'لم يكتمل التنقيط';
 const metrics=[
  ['الحصة /40',t.lesson.total],['المناقشة /20',t.discussion.total],
  ['المجموع /60',t.total60],['القسمة على 3 (/20)',t.score20]
 ].map(row=>'<div><small>'+row[0]+'</small><strong>'+show(row[1])+'</strong></div>').join('');
 return '<section class="pane" aria-label="نتيجة الحساب"><h2>حالة الحساب التجريبي</h2>'+
  '<div class="metrics">'+metrics+'</div><p class="message">'+escapeHTML(status)+
  '. عتبة 30/60 مرجع عددي في النص التنظيمي، <strong>وليست قرار اللجنة</strong>.</p>'+
  '<p class="muted small">تُعرض نتيجة القسمة استرشاديًا حتى أربع منازل، دون اعتماد سياسة تقريب. دقة إدخال العلامة المحصلة غير محسومة بعد. لا تُولّد هذه الصفحة تقريرًا رسميًا أو محضرًا.</p>'+
  '</section>';
}
function render(){
 $('rubric').value=Object.keys(RUBRICS).find(k=>RUBRICS[k].id===draft.rubricId);
 $('rubric-origin').textContent=Object.values(RUBRICS).find(r=>r.id===draft.rubricId).provenance;
 $('workbench').innerHTML=renderWeights()+renderMarks()+renderSummary();
 $('feedback').textContent=notice;
}
$('rubric').addEventListener('change',event=>{
 if(!confirm('سيبدأ اختيار الشبكة مسودة مستقلة فارغة؛ لن تنتقل العلامات أو الأوزان من الشبكة السابقة. هل تريد المتابعة؟')){render();return}
 draft=newDraft(event.target.value);
 notice='أنشئت مسودة تجريبية جديدة؛ لم تُنقل أي علامات.';render();
});
$('workbench').addEventListener('change',event=>{
 const weight=event.target.closest('[data-weight]'),score=event.target.closest('[data-score]');
 try{
  if(weight){draft=withWeight(draft,weight.dataset.weight,weight.value);notice=''}
  else if(score){draft=withScore(draft,score.dataset.score,score.dataset.scoreId,score.value);notice=''}
  render();
 }catch(err){notice=err.message;render()}
});
$('workbench').addEventListener('click',event=>{
 if(event.target.id==='suggest'){
  if(!confirm('التوزيع مثال غير رسمي؛ سيستبدل الأوزان غير المثبتة في هذه المسودة فقط. متابعة؟'))return;
  try{draft=withSuggestions(draft);notice='عُرض توزيع إرشادي؛ لم يُثبّت بعد.';render()}catch(e){feedback(e.message)}
 }else if(event.target.id==='freeze'){
  if(!confirm('هل تؤكد تثبيت الأوزان لهذه المسودة قبل التنقيط؟'))return;
  try{draft=freezeWeights(draft);notice='ثُبّت ملف الأوزان. يمكن إدخال علامات المؤشرات.';render()}catch(e){feedback(e.message)}
 }
});
$('export').addEventListener('click',()=>{
 try{
  const json=serialize(draft),url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='titularisation-research-draft.json';
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  feedback('صُدّرت مسودة JSON محلية غير رسمية.');
 }catch(e){feedback('تعذر تصدير المسودة: '+e.message)}
});
$('import').addEventListener('change',async event=>{
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 if(file.size>1024*1024){feedback('الملف أكبر من الحد التجريبي (1 ميغابايت).');return}
 try{
  const restored=validateImport(JSON.parse(await file.text()));
  if(!confirm('سيستبدل الاستيراد المسودة الحالية. هل تريد المتابعة؟'))return;
  draft=restored;notice='استُعيدت المسودة بعد التحقق من الشبكة والأوزان والعلامات.';render();
 }catch(err){feedback('لم يُستورد الملف: '+err.message)}
});
render();
