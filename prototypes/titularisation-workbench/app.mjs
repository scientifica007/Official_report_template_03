import {
 GROUPS,DISCUSSION,RUBRICS,newDraft,isAnalytical,lessonItems,
 withWeight,withSuggestions,validateWeights,freezeWeights,withScore,totals,groupSummaries,SCORE_STEP,
 validateImport,serialize
} from "./engine.mjs";

// Static research prototype. No production reports, credentials or cloud writes.
let draft=newDraft("grouped5");
let notice="";
// A touch scroll across a slider must never change a saved mark. Coarse
// pointer devices require an explicit one-slider activation before dragging.
const TOUCH_SAFE_MODE=typeof window!=="undefined"&&(
 window.matchMedia?.("(any-pointer: coarse)")?.matches===true||
 (window.navigator?.maxTouchPoints??0)>0
);
let activeTouchRangeKey=null;
const rangeKey=(phase,id)=>phase+":"+id;
const rangeIsEditable=(phase,id)=>!TOUCH_SAFE_MODE||
 activeTouchRangeKey===rangeKey(phase,id);
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
// The range starts visually at zero without storing a score. Only deliberate
// range input/change/click or number-field change writes an attained mark.
function rangeFill(value,cap,recorded){
 return recorded?Math.max(0,Math.min(100,Number(value)/cap*100))+'%':'0%';
}
function scoreControls(phase,item,has,marks){
 const value=has?marks[item.id]:'';
 const disabled=isAnalytical(draft)&&!draft.profile.frozen;
 const data='data-score-id="'+escapeHTML(item.id)+'" ';
 const numberField=input('score-'+phase+'-'+item.id,value,0,item.cap,SCORE_STEP,
  'data-score="'+phase+'" '+data+(disabled?'disabled ':'')+
  'aria-label="علامة '+escapeHTML(item.label)+'"');
 const half=show(item.cap/2);
 const active=rangeIsEditable(phase,item.id)&&!disabled;
 const range='<input type="range" class="score-range" id="range-'+phase+'-'+item.id+
  '" min="0" max="'+item.cap+
  '" step="'+SCORE_STEP+'" value="'+(has?value:0)+'" data-range="'+phase+'" '+data+
  'data-empty="'+(has?'false':'true')+'" '+
  (TOUCH_SAFE_MODE?'data-touch-locked="'+(!active)+'" ':'')+
  (TOUCH_SAFE_MODE&&!active?'tabindex="-1" aria-disabled="true" ':'')+
  (disabled?'disabled ':'')+
  'style="--range-progress:'+rangeFill(value,item.cap,has)+'" '+
  'aria-label="شريط تنقيط '+escapeHTML(item.label)+' من صفر إلى '+item.cap+'" '+
  'aria-valuetext="'+(has?show(value)+' من '+item.cap:'علامة لم تُدخل بعد')+'">';
 const status=has?'العلامة المختارة: '+show(value)+' / '+show(item.cap):
  'لم تُسجل علامة بعد — حرّك الشريط أو أدخل قيمة';
 const touchControl=TOUCH_SAFE_MODE?
  '<div class="touch-range-guard">'+
  '<button type="button" class="range-enable" data-enable-range="'+phase+'" '+
  'data-score-id="'+escapeHTML(item.id)+'" '+(disabled?'disabled ':'')+
  ' aria-pressed="'+active+'">'+(active?'الشريط مفعّل — حرّكه الآن':'تفعيل الشريط للتنقيط')+'</button>'+
  '<small>'+(active?'يُقفل بعد اختيار العلامة أو تمرير الصفحة':
     'الشريط محمي من لمس التمرير؛ الرقم قابل للتعديل')+'</small></div>':'';
 return '<div class="score-controls">'+numberField+
  '<div class="score-range-wrap">'+range+
  '<div class="range-scale" dir="ltr" aria-hidden="true"><span>0</span><span>'+
  half+'</span><span>'+show(item.cap)+'</span></div>'+
  '<small class="range-status">'+status+'</small>'+touchControl+'</div></div>';
}
function scoreRows(phase,items){
 const marks=draft.scores[phase];
 return items.map(item=>{
  const zero=item.cap===0,has=Object.hasOwn(marks,item.id);
  const reminders=phase==='lesson'&&draft.rubricId===RUBRICS.grouped5.id?
   GROUPS.find(group=>group.id===item.id)?.items:null;
  const reminderHTML=reminders?
   '<p class="indicator-intro">المؤشرات التابعة لهذا المعيار (للتذكير فقط):</p><ul class="indicator-reminders">'+
   reminders.map(indicator=>'<li>'+escapeHTML(indicator.label)+'</li>').join('')+'</ul>':'';
  return '<div class="mark-row'+(zero?'':' score-mark-row')+'"><div class="mark-label"><strong>'+escapeHTML(item.label)+
   '</strong>'+reminderHTML+'<span>'+(zero?'الوزن صفر؛ محفوظ ضمن الشبكة دون تنقيط':'الحد الأقصى: '+show(item.cap))+
   '</span></div>'+(zero?'<output class="zero-indicator">غير منقّط (وزن صفر)</output>':
   scoreControls(phase,item,has,marks))+
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
 return '<section class="pane score-summary" data-totals-panel aria-label="نتيجة الحساب"><h2>حالة الحساب التجريبي</h2>'+
  '<div class="metrics">'+metrics+'</div><p class="message">'+escapeHTML(status)+
  '. عتبة 30/60 مرجع عددي في النص التنظيمي، <strong>وليست قرار اللجنة</strong>.</p>'+
  '<p class="muted small">تُعرض نتيجة القسمة استرشاديًا حتى أربع منازل، دون اعتماد سياسة تقريب. أصغر خطوة للعلامة المحصلة هي 0.5 نقطة في الشبكات الثلاث والمناقشة، ويظل تقريب /20 مسألة مستقلة. لا تُولّد هذه الصفحة تقريرًا رسميًا أو محضرًا.</p>'+
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
 activeTouchRangeKey=null;
 draft=newDraft(event.target.value);
 notice='أنشئت مسودة تجريبية جديدة؛ لم تُنقل أي علامات.';render();
});
// During a drag, update the paired number and totals without replacing
// the slider element. Rebuild other counters only when the gesture finishes.
function updateRangeUI(range,value,recorded){
 if(!range)return;
 range.value=recorded?value:0;
 range.dataset.empty=recorded?'false':'true';
 range.style.setProperty('--range-progress',rangeFill(value,range.max,recorded));
 range.setAttribute('aria-valuetext',recorded?show(Number(value))+' من '+range.max:'علامة لم تُدخل بعد');
 const status=range.closest('.score-range-wrap')?.querySelector('.range-status');
 if(status)status.textContent=recorded?'العلامة المختارة: '+show(Number(value))+' / '+range.max:
  'لم تُسجل علامة بعد — حرّك الشريط أو أدخل قيمة';
}
function refreshLiveTotal(){
 const summary=$('workbench').querySelector('[data-totals-panel]');
 if(summary)summary.outerHTML=renderSummary();
}
function commitRange(range,{finish=false}={}){
 const phase=range.dataset.range,id=range.dataset.scoreId;
 if(!rangeIsEditable(phase,id))return;
 draft=withScore(draft,phase,id,range.value);
 updateRangeUI(range,range.value,true);
 const number=$('score-'+phase+'-'+id);
 if(number)number.value=range.value;
 refreshLiveTotal();
 notice='';
 if(finish){
  activeTouchRangeKey=null;
  render();
 }
}
$('workbench').addEventListener('input',event=>{
 const range=event.target.closest('[data-range]');
 if(range){
  try{commitRange(range)}catch(err){feedback(err.message)}
  return;
 }
 const number=event.target.closest('[data-score]');
 if(!number)return;
 // Do not replace the focused number input while the inspector types.
 // Only valid complete values affect the saved draft/paired range. Invalid
 // intermediate text remains visible for correction until change/blur.
 try{
  draft=withScore(draft,number.dataset.score,number.dataset.scoreId,number.value);
  const paired=$('range-'+number.dataset.score+'-'+number.dataset.scoreId);
  updateRangeUI(paired,number.value,number.value!=='');
  refreshLiveTotal();
  notice='';
 }catch{ /* The change event validates and reports any unfinished value. */ }
});
$('workbench').addEventListener('keyup',event=>{
 const range=event.target.closest('[data-range]');
 // Home/left at the unscored zero endpoint may not produce an input event.
 if(range?.dataset.empty==='true'&&['Home','ArrowLeft','ArrowDown'].includes(event.key)){
  try{commitRange(range,{finish:true})}catch(err){feedback(err.message)}
 }
});
$('workbench').addEventListener('change',event=>{
 const weight=event.target.closest('[data-weight]');
 const score=event.target.closest('[data-score]');
 const range=event.target.closest('[data-range]');
 try{
  if(weight){draft=withWeight(draft,weight.dataset.weight,weight.value);notice=''}
  else if(score){draft=withScore(draft,score.dataset.score,score.dataset.scoreId,score.value);notice=''}
  else if(range){commitRange(range,{finish:true});return}
  else return;
  render();
 }catch(err){notice=err.message;render()}
});
if(TOUCH_SAFE_MODE){
 window.addEventListener('scroll',()=>{
  if(activeTouchRangeKey!==null){
   activeTouchRangeKey=null;
   render();
  }
 },{passive:true});
}
$('workbench').addEventListener('click',event=>{
 const unlock=event.target.closest('[data-enable-range]');
 if(unlock&&TOUCH_SAFE_MODE){
  const phase=unlock.dataset.enableRange,id=unlock.dataset.scoreId;
  activeTouchRangeKey=rangeKey(phase,id); // one slider active at a time
  notice='';
  render();
  return;
 }
 const range=event.target.closest('[data-range]');
 // Clicking the zero endpoint while it is still empty may not fire a native
 // input event. Treat that deliberate click as an explicit zero selection.
 if(range?.dataset.empty==='true'&&rangeIsEditable(range.dataset.range,range.dataset.scoreId)){
  try{commitRange(range,{finish:true})}catch(err){feedback(err.message)}
  return;
 }
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
