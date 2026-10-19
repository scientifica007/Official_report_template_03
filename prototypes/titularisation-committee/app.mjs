import {RUBRICS} from "../titularisation-workbench/engine.mjs";
import {SEATS,MODES,freshCommittee,editMeta,changeMode,restoreCommittee,stringifyCommittee} from "./committee-engine.mjs";
import {renderWeights} from "./weights-ui.mjs";
import {renderForm} from "./form-ui.mjs";
import {renderMembers} from "./members-ui.mjs";
import {renderDocuments} from "./preview.mjs";
import {node,clear,labelValue} from "./dom.mjs";
let state=freshCommittee(),who="final";
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
 renderWeights($("weights"),state,commit);
 renderForm($("editor"),state,who,commit);
 renderMembers($("members"),state);
 renderDocuments($("paper"),state);
 message("");
}
$("who").addEventListener("change",e=>{who=e.target.value;render()});
$("mode").addEventListener("change",e=>{
 if(!confirm("تغيير وضع التقييم يعيد ترتيب الواجهة دون إنشاء مساهمات مزيفة. موافق؟")){render();return}
 who="final";commit(()=>changeMode(state,e.target.value));
});
$("rubric").addEventListener("change",e=>{
 if(!confirm("تغيير الشبكة يبدأ مسودة فارغة؛ صدّر JSON أولًا إن أردت حفظها. موافق؟")){render();return}
 state=freshCommittee(state.mode,e.target.value);who="final";render();
});
$("save").addEventListener("click",()=>{
 try{
  const data=stringifyCommittee(state);
  const url=URL.createObjectURL(new Blob([data],{type:"application/json;charset=utf-8"}));
  const a=node("a");a.href=url;a.download="committee-lab-draft.json";
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  message("حُفظ ملف المسودة JSON محليًا.");
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
$("print").addEventListener("click",()=>window.print());
render();
