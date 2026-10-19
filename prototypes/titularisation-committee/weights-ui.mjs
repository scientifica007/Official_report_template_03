import {RUBRICS,GROUPS} from "../titularisation-workbench/engine.mjs";
import {configureWeight,applySuggestedWeights,finalizeWeights} from "./committee-engine.mjs";
import {node,clear,action,labelValue} from "./dom.mjs";
export function renderWeights(container,state,commit){
 clear(container);
 if(state.rubricId!==RUBRICS.analytical14.id)return;
 const p=state.final.grading.profile;
 container.append(node("h2","أوزان المؤشرات الأربعة عشر"));
 if(p.frozen){container.append(node("p","الأوزان مثبتة لجميع المساهمات.","good"));return}
 container.append(node("p","خطوة الوزن 0.5 ويسمح بالصفر؛ مجموع كل معيار يجب أن يساوي سقفه."));
 action(container,"توزيع إرشادي",()=>commit(()=>applySuggestedWeights(state)));
 action(container,"تثبيت الأوزان",()=>commit(()=>finalizeWeights(state)));
 for(const g of GROUPS){
  const group=node("fieldset");group.append(node("legend",g.label+" / "+g.cap));
  for(const item of g.items){
   const input=labelValue(group,item.label,p.weights[item.id]??"",
    v=>commit(()=>configureWeight(state,item.id,v)),"number");
   input.max=String(g.cap);
  }
  container.append(group);
 }
}
