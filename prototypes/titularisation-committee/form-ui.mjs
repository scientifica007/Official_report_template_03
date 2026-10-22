import {RUBRICS,GROUPS,DISCUSSION,lessonItems,totals} from "../titularisation-workbench/engine.mjs";
import {SEATS,assistance,proposedFinal,selectRounding,resetFinalNote,editScore,editNote,submit,reopen,fillDemoMember,hasMemberContent} from "./committee-engine.mjs";
import {node,clear,action,textValue} from "./dom.mjs";
import {suggestedAppreciation} from "./document-rules.mjs";
const labels={lessonSummary:"تقدير الحصة",discussionSummary:"تقدير المناقشة",general:"التقدير العام",recommendations:"التوصيات"};
const show=x=>x==null?"—":String(Number(x.toFixed(3)));
function itemRow(container,state,who,phase,item,commit){
 const final=who==="final";
 const c=final?proposedFinal(state):state.members[who];
 const box=node("div","","criterion"),row=node("div","","criterion-row");
 row.append(node("strong",item.label+" / "+item.cap));
 if(item.cap>0){
  const field=node("input");field.type="number";field.min="0";field.max=String(item.cap);
  field.step="0.5";field.inputMode="decimal";field.value=c.grading.scores[phase][item.id]??"";
  field.disabled=c.submitted&&who!=="final";
  field.setAttribute("aria-label","علامة "+item.label);
  field.addEventListener("change",()=>commit(()=>editScore(state,who,phase,item.id,field.value)));
  row.append(field);
 }else row.append(node("span","وزنه صفر — غير منقّط"));
 box.append(row);
 if(final&&state.mode==="individual"){
  const ref=assistance(state).means[phase][item.id];
  if(ref){
   const block=node("div","","member-grades");
   block.append(node("strong","علامات أعضاء اللجنة (عدد "+ref.count+")، المتوسط: "+show(ref.sum)+" ÷ "+ref.count+" = "+show(ref.mean)));
   const list=node("ul","","source-marks");
   for(const e of ref.entries)list.append(node("li",e.label+": "+show(e.value)));
   block.append(list);
   if(!Object.hasOwn(state.final.grading.scores[phase],item.id))
    block.append(node("p","العلامة المعروضة مقترح آلي بالتقريب إلى أقرب نصف نقطة؛ يمكن اختيار الأعلى أو الأسفل وتعديلها يدويًا.","hint"));
   if(Math.abs(ref.mean*2-Math.round(ref.mean*2))>1e-9){
    const choices=node("div","","rounding-actions");
    const down=Math.floor(ref.mean*2)/2,up=Math.ceil(ref.mean*2)/2;
    action(choices,"تقريب للأسفل: "+show(down),
     ()=>commit(()=>selectRounding(state,phase,item.id,"down")));
    action(choices,"تقريب للأعلى: "+show(up),
     ()=>commit(()=>selectRounding(state,phase,item.id,"up")));
    block.append(choices);
   }
   box.append(block);
  }
 }
 const details=node("details");details.append(node("summary","تقدير كتابي لهذا البند"));
 const note=node("textarea");note.rows=3;note.value=c.notes[phase][item.id]||"";
 note.disabled=c.submitted&&who!=="final";
 note.addEventListener("change",()=>commit(()=>editNote(state,who,phase,note.value,item.id)));
 details.append(note);
 if(final&&state.mode==="individual"&&c.source.notes[phase][item.id]){
  details.open=true;
  details.append(node("p","هذا تجميع مبدئي من كتابات الأعضاء، ويمكن حذفه أو إعادة صياغته.","hint"));
 }
 if(final&&state.mode==="individual"&&
    state.finalNoteEdits.includes(phase+":"+item.id))
  action(details,"استعادة نصوص الأعضاء لهذا البند",
   ()=>commit(()=>resetFinalNote(state,phase,item.id)));
 box.append(details);container.append(box);
}
export function renderForm(container,state,who,commit){
 clear(container);
 const isFinal=who==="final",person=isFinal?proposedFinal(state):state.members[who];
 container.append(node("h2",isFinal?"المفتش — تحرير نتيجة المداولة":
  "محاكاة "+SEATS.find(x=>x.id===who)?.label));
 if(state.rubricId===RUBRICS.analytical14.id&&!person.grading.profile.frozen){
  container.append(node("p","يرجى تثبيت أوزان المؤشرات أولًا.","warning"));return;
 }
 container.append(node("p",isFinal?
  (state.mode==="individual"?
  "تظهر مقترحات العلامات والنصوص مباشرة من مساهمات الأعضاء المرسلة. يمكنك تعديل أي درجة أو صياغة؛ ولا تستبدل التحديثاتُ تعديلاتك السابقة.":
  "العلامة النهائية والنصوص قابلة للتعديل ولا يلزم تطابقها مع المتوسط."):
  "هذه محاكاة محلية للمقعد وليست مصادقة أو توقيعًا."));
 if(!isFinal&&!person.submitted){
  const tools=node("div","","demo-fill-zone");
  const fill=action(tools,"ملء بيانات تجريبية لهذا العضو",()=>{
   if(hasMemberContent(state,who)&&!confirm(
    "سيُستبدل التنقيط والتقديرات الحالية لهذا العضو فقط ببيانات اصطناعية مختلفة عن بقية الأعضاء. هل تريد المتابعة؟"))return;
   commit(()=>fillDemoMember(state,who));
  });
  fill.className="demo-fill-button";
  tools.append(node("p","يملأ جميع علامات الحصة والمناقشة وتقديرات بنودهما والتقديرات العامة. راجع النتيجة ثم اضغط «إرسال مساهمتي» بنفسك.","muted"));
  container.append(tools);
 }
 for(const phase of ["lesson","discussion"]){
  container.append(node("h3",phase==="lesson"?"الحصة /40":"المناقشة /20"));
  for(const item of phase==="lesson"?lessonItems(person.grading):DISCUSSION){
   itemRow(container,state,who,phase,item,commit);
   if(phase==="lesson"&&state.rubricId===RUBRICS.grouped5.id){
    const g=GROUPS.find(x=>x.id===item.id);
    container.append(node("p","للتذكير: "+g.items.map(x=>x.label).join(" • "),"muted"));
   }
  }
 }
 container.append(node("h3","التقديرات الكتابية"));
 for(const [key,title] of Object.entries(labels)){
  const textarea=textValue(container,title,person.notes[key],v=>commit(()=>editNote(state,who,key,v)));
  textarea.disabled=person.submitted&&!isFinal;
  if(isFinal&&key==="general"){
   const score=totals(person.grading).total60;
   const proposal=score===null?"":suggestedAppreciation(score/3);
   if(proposal)container.append(node("p","التقدير المقترح حسب العلامة على 20: "+proposal+". يمكن للمفتش تغيير التقدير مباشرة في الحقل أعلاه.","hint"));
  }
  if(isFinal&&state.mode==="individual"&&person.source.notes[key]){
   container.append(node("p","نص تجميعي مقترح من الأعضاء؛ عدله مباشرة لصياغة خلاصة اللجنة.","hint"));
  }
  if(isFinal&&state.mode==="individual"&&state.finalNoteEdits.includes("field:"+key))
   action(container,"استعادة مقترحات الأعضاء: "+title,
    ()=>commit(()=>resetFinalNote(state,key)));
 }
 const t=totals(person.grading);
 container.append(node("p","الحصة "+show(t.lesson.total)+"/40 — المناقشة "+
  show(t.discussion.total)+"/20 — المجموع "+show(t.total60)+"/60","good"));
 if(!isFinal)action(container,person.submitted?"إعادة فتح مساهمتي":"إرسال مساهمتي",
  ()=>commit(()=>person.submitted?reopen(state,who):submit(state,who)));
}
