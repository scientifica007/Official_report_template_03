import {node,add,clear} from "./dom.mjs";
import {SEATS,MODES,documentData} from "./committee-engine.mjs";
import {RUBRICS,DISCUSSION,lessonItems} from "../titularisation-workbench/engine.mjs";
const display=x=>x===null?"—":(Number.isFinite(x)?String(Number(x.toFixed(3))):"—");
function paragraph(parent,label,value){
 const p=node("p");add(p,node("strong",label+" "),node("span",value||"لم يحرر بعد"));parent.append(p);
}
function signatures(parent){
 parent.append(node("h3","إمضاءات أعضاء اللجنة وأختامها على النسخة الورقية"));
 const box=node("div","","signatures");
 for(const seat of SEATS)add(box,node("div",seat.label+" — الإمضاء: __________________"));
 parent.append(box);
}
export function renderDocuments(container,state){
 clear(container);
 const d=documentData(state),m=d.meta,r=d.result;
 const rubric=Object.values(RUBRICS).find(x=>x.id===state.rubricId)?.label;
 for(const type of ["report","minutes"]){
  const sheet=node("article","","paper");
  add(sheet,node("p","معاينة تجريبية غير مطابقة بعد للقالب الرسمي — ليست توقيعًا إلكترونيًا","caution"),
    node("h2",type==="report"?"مسودة تقرير التفتيش قصد الترسيم":"مسودة محضر لجنة الترسيم"));
  paragraph(sheet,"المؤسسة:",m.institution);
  paragraph(sheet,"الأستاذ/المترشح:",m.candidate);
  paragraph(sheet,"الرتبة:",m.rank);
  paragraph(sheet,"التاريخ والمكان:",[m.date,m.location].filter(Boolean).join(" — "));
  paragraph(sheet,"الشبكة:",rubric);
  paragraph(sheet,"طريقة التقييم:",MODES[state.mode]);
  paragraph(sheet,"العلامات:",display(r.lesson.total)+"/40 للحصة؛ "+display(r.discussion.total)+
    "/20 للمناقشة؛ المجموع "+display(r.total60)+"/60");
  if(type==="report"){
   for(const phase of ["lesson","discussion"]){
    sheet.append(node("h3",phase==="lesson"?"معايير الحصة وعلاماتها":"معايير المناقشة وعلاماتها"));
    const table=node("table","","scores-table");
    const head=node("tr");
    for(const title of ["المعيار أو المؤشر","العلامة","التقدير الكتابي"])head.append(node("th",title));
    table.append(head);
    const items=phase==="lesson"?lessonItems(state.final.grading):DISCUSSION;
    for(const item of items){
     const tr=node("tr");
     tr.append(node("td",item.label),node("td",item.cap===0?"غير منقّط":
      display(d.finalGrades[phase][item.id])+" / "+item.cap),
      node("td",d.finalNotes[phase][item.id]||"—"));
     table.append(tr);
    }
    sheet.append(table);
   }
   paragraph(sheet,"تقدير الحصة:",d.finalNotes.lessonSummary);
   paragraph(sheet,"تقدير المناقشة:",d.finalNotes.discussionSummary);
  }else paragraph(sheet,"جلسة المداولة:",m.session);
  paragraph(sheet,"التقدير العام/خلاصة المداولة:",d.finalNotes.general);
  paragraph(sheet,"التوصيات:",d.finalNotes.recommendations);
  signatures(sheet);container.append(sheet);
 }
}
