import {SEATS,assistance} from "./committee-engine.mjs";
import {totals} from "../titularisation-workbench/engine.mjs";
import {node,clear} from "./dom.mjs";
export function renderMembers(target,state){
 clear(target);
 if(state.mode!=="individual")return;
 const a=assistance(state);
 target.append(node("h2","مساهمات اللجنة"));
 target.append(node("p","المساهمات المرسلة: "+a.count+"/4؛ المتوسط الاسترشادي: "+(a.total60??"—")+"/60"));
 for(const seat of SEATS){
  const c=state.members[seat.id],t=totals(c.grading);
  const d=node("details");
  d.append(node("summary",seat.label+" — "+(c.submitted?"مرسلة":"مسودة")+" — "+(t.total60??"—")+"/60"));
  for(const field of ["lessonSummary","discussionSummary","general","recommendations"]){
   if(c.submitted&&c.notes[field])d.append(node("p",c.notes[field]));
  }
  if(c.submitted){
   for(const phase of ["lesson","discussion"]){
    for(const [id,value] of Object.entries(c.notes[phase])){
     if(value)d.append(node("p",id+": "+value));
    }
   }
  }
  target.append(d);
 }
}
