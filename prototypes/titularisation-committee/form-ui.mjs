import {RUBRICS,GROUPS,DISCUSSION,lessonItems,totals} from "../titularisation-workbench/engine.mjs";
import {SEATS,assistance,editScore,editNote,submit,reopen} from "./committee-engine.mjs";
import {node,clear,action,textValue} from "./dom.mjs";
const labels={lessonSummary:"تقدير الحصة",discussionSummary:"تقدير المناقشة",general:"التقدير العام",recommendations:"التوصيات"};
const show=x=>x==null?"—":String(Number(x.toFixed(3)));
function itemRow(container,state,who,phase,item,commit){
 const c=who==="final"?state.final:state.members[who];
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
 const details=node("details");details.append(node("summary","تقدير كتابي لهذا البند"));
 const note=node("textarea");note.rows=2;note.value=c.notes[phase][item.id]||"";
 note.disabled=c.submitted&&who!=="final";
 note.addEventListener("change",()=>commit(()=>editNote(state,who,phase,note.value,item.id)));
 details.append(note);box.append(details);container.append(box);
 if(who==="final"){
  const mean=assistance(state).means[phase][item.id];
  if(mean)container.append(node("p","متوسط الأعضاء: "+show(mean.mean)+" (عدد "+mean.count+") — للمقارنة فقط","hint"));
 }
}
export function renderForm(container,state,who,commit){
 clear(container);
 const isFinal=who==="final",person=isFinal?state.final:state.members[who];
 container.append(node("h2",isFinal?"المفتش — تحرير نتيجة المداولة":
  "محاكاة "+SEATS.find(x=>x.id===who)?.label));
 if(state.rubricId===RUBRICS.analytical14.id&&!person.grading.profile.frozen){
  container.append(node("p","يرجى تثبيت أوزان المؤشرات أولًا.","warning"));return;
 }
 container.append(node("p",isFinal?"العلامة النهائية والنصوص قابلة للتعديل ولا يلزم تطابقها مع المتوسط.":
  "هذه محاكاة محلية للمقعد وليست مصادقة أو توقيعًا."));
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
 }
 const t=totals(person.grading);
 container.append(node("p","الحصة "+show(t.lesson.total)+"/40 — المناقشة "+
  show(t.discussion.total)+"/20 — المجموع "+show(t.total60)+"/60","good"));
 if(!isFinal)action(container,person.submitted?"إعادة فتح مساهمتي":"إرسال مساهمتي",
  ()=>commit(()=>person.submitted?reopen(state,who):submit(state,who)));
}
