import {RUBRICS} from "../titularisation-workbench/engine.mjs";
import {SEATS,MODES,METADATA_GROUPS,freshCommittee,editMeta,changeMode,restoreCommittee,stringifyCommittee} from "./committee-engine.mjs";
import {DECISIONS} from "./document-model.mjs";
import {renderWeights} from "./weights-ui.mjs";
import {renderForm} from "./form-ui.mjs";
import {renderMembers} from "./members-ui.mjs";
import {renderDocuments} from "./preview.mjs";
import {node,clear,labelValue} from "./dom.mjs";
import {createCommitteeDocx} from "./docx-export.mjs";
import {fitPrintPages} from "./print-fit.mjs";
import {preparePrintPagination} from "./print-pagination.mjs";
import {stringifyPortableCommittee} from "./document-export-contract.mjs";
let state=freshCommittee(),who="final";
const openedMetaGroups=new Set();
const $=id=>document.getElementById(id);
const labels={institution:"المؤسسة",candidate:"الأستاذ/المترشح",rank:"الرتبة",
 date:"تاريخ المهمة",location:"المكان",session:"بيانات الجلسة"};
function message(v){$("message").textContent=v}
function commit(fn){
 try{state=fn();render()}catch(e){message(e.message)}
}
function render(){
 $("mode").value=state.mode;
 $("rubric").value=Object.keys(RUBRICS).find(k=>RUBRICS[k].id===state.rubricId);
 const seats=clear($("who"));
 for(const [key,label] of [["final","المفتش — الصيغة النهائية"],...(
  state.mode==="individual"?SEATS.map(s=>[s.id,"محاكاة "+s.label]):[]) ]){
  const option=node("option",label);option.value=key;seats.append(option);
 }
 if(state.mode==="unified")who="final";
 seats.value=who;
 const meta=clear($("meta"));
 for(const [id,label] of Object.entries(labels))
  labelValue(meta,label,state.meta[id],value=>commit(()=>editMeta(state,id,value)));
 for(const group of METADATA_GROUPS){
  const details=node("details","","meta-details");
  details.open=openedMetaGroups.has(group.label);
  details.addEventListener("toggle",()=>{
   if(details.open)openedMetaGroups.add(group.label);
   else openedMetaGroups.delete(group.label);
  });
  details.append(node("summary",group.label));
  const grid=node("div","","meta-grid");
  for(const [key,label] of group.fields){
   if(key==="decision"){
    const wrap=node("label","","field"),select=node("select");
    wrap.append(node("span",label));
    for(const [code,name] of DECISIONS){const opt=node("option",name);opt.value=code;select.append(opt)}
    select.value=state.meta.decision;
    select.addEventListener("change",()=>commit(()=>editMeta(state,"decision",select.value)));
    wrap.append(select);grid.append(wrap);
   }else labelValue(grid,label,state.meta[key],value=>commit(()=>editMeta(state,key,value)));
  }
  details.append(grid);meta.append(details);
 }
 renderWeights($("weights"),state,commit);
 renderForm($("editor"),state,who,commit);
 renderMembers($("members"),state);
 renderDocuments($("paper"),state);
 fitPrintPages($("paper"));
 message("");
}
$("who").addEventListener("change",e=>{who=e.target.value;render()});
$("mode").addEventListener("change",e=>{
 // Mode switching is reversible and does not erase either set of inputs.
 // Do not gate this non-destructive operation behind browser confirm():
 // blocked/dismissed dialogs previously caused the selector to revert.
 const chosen=e.target.value;
 if(chosen===state.mode)return;
 try{
  const next=changeMode(state,chosen);
  state=next;
  // Make the selected mode evident immediately: start on first seat
  // when entering individual contributions; return to final in unified.
  who=chosen==="individual"?SEATS[0].id:"final";
  render();
  message(chosen==="individual"?
   "تم تفعيل «مساهمات فردية». اختر العضو واملأ بياناته التجريبية ثم أرسل مساهمته.":
   "تم تفعيل «تقييم موحد». مساهمات الأعضاء السابقة محفوظة في المسودة، ويمكن الرجوع إليها.");
 }catch(err){render();message(err.message)}
});
$("rubric").addEventListener("change",e=>{
 if(!confirm("تغيير الشبكة يبدأ مسودة فارغة؛ صدّر JSON أولًا إن أردت حفظها. موافق؟")){render();return}
 state=freshCommittee(state.mode,e.target.value);who="final";render();
});
$("save").addEventListener("click",()=>{
 try{
  const data=stringifyPortableCommittee(state);
  const url=URL.createObjectURL(new Blob([data],{type:"application/json;charset=utf-8"}));
  const a=node("a");a.href=url;a.download="titularisation-portable-report-draft.json";
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  message("حُفظ JSON منظم مع بيانات النموذج وتعليمات الإخراج، دون إرسال أي معلومات إلى خادم.");
 }catch(e){message(e.message)}
});
$("load").addEventListener("change",async e=>{
 const file=e.target.files?.[0];e.target.value="";if(!file)return;
 if(file.size>1048576){message("حجم الملف يتجاوز 1 ميغابايت.");return}
 try{
  const next=restoreCommittee(JSON.parse(await file.text()));
  if(!confirm("استيراد الملف سيستبدل مسودة الصفحة الحالية. موافق؟"))return;
  state=next;who="final";render();message("استُعيد ملف المسودة بعد التحقق.");
 }catch(err){message(err.message)}
});
if(typeof window!=="undefined")window.addEventListener?.("beforeprint",()=>preparePrintPagination($("paper"),state));
$("print").addEventListener("click",()=>{preparePrintPagination($("paper"),state);window.print()});
$("docx").addEventListener("click",()=>{
 try{
  const bytes=createCommitteeDocx(state);
  const url=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}));
  const a=node("a");a.href=url;a.download="titularisation-report-and-minutes-draft.docx";
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  message("تم إنشاء DOCX قابل للتحرير (مسودة غير معتمدة). يمكن تعديل الأرقام والنصوص قبل الإمضاء الورقي.");
 }catch(err){message("تعذّر إنشاء DOCX: "+err.message)}
});
render();
