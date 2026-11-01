import {RUBRICS} from "../titularisation-workbench/engine.mjs";
import {SEATS,MODES,METADATA_GROUPS,freshCommittee,editMeta,changeMode,restoreCommittee,stringifyCommittee} from "./committee-engine.mjs";
import {DECISIONS} from "./document-model.mjs";
import {MINUTES_SCOPES} from "./document-language.mjs";
import {renderWeights} from "./weights-ui.mjs";
import {renderForm} from "./form-ui.mjs";
import {renderMembers} from "./members-ui.mjs";
import {renderDocuments} from "./preview.mjs";
import {node,clear,labelValue} from "./dom.mjs";
import {createCommitteeDocx} from "./docx-export.mjs";
import {estimateDocxReportPages} from "./docx-pagination.mjs";
import {fitPrintPages} from "./print-fit.mjs";
import {preparePrintPagination} from "./print-pagination.mjs";
import {stringifyPortableCommittee} from "./document-export-contract.mjs";
import {attachVoiceDictation,dismissVoiceDictation,clearVoiceDrafts} from "../../shared/voice-dictation.mjs";
import {committeeCloudEnabled,listCloudCommitteeMissions,loadCloudCommitteeSubmissions,mergeSubmittedCloudMembers} from "./committee-cloud-bridge.mjs";
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
 // Keep unfinished speech text in the tab while rebuilding the editor.
 dismissVoiceDictation();
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
   if(key==="minutesScopeMode"){
    const wrap=node("label","","field"),select=node("select");
    wrap.append(node("span",label));
    for(const [id,wording] of Object.entries(MINUTES_SCOPES)){
     const opt=node("option",id==="custom"?"صياغة حرة — أكتب النص بنفسي":wording);
     opt.value=id;select.append(opt);
    }
    select.value=state.meta.minutesScopeMode;
    select.addEventListener("change",()=>commit(()=>editMeta(state,key,select.value)));
    wrap.append(select);grid.append(wrap);
   }else if(key==="minutesScopeCustom"){
    if(state.meta.minutesScopeMode==="custom")
     labelValue(grid,label,state.meta[key],value=>commit(()=>editMeta(state,key,value)));
   }else if(key==="decision"){
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
 attachVoiceDictation($("editor"));
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
 clearVoiceDrafts();
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
  clearVoiceDrafts();
  state=next;who="final";render();message("استُعيد ملف المسودة بعد التحقق.");
 }catch(err){message(err.message)}
});
// Optional M5.1: only authorized, submitted seats can be imported.
// Never import stale draft contributions, nor change chair's scores or notes.
if(committeeCloudEnabled()){
 const panel=$("committee-cloud-bridge"),picker=$("committee-cloud-mission");
 if(panel&&picker){
  panel.hidden=false;
  const info=v=>{$("committee-cloud-status").textContent=v;};
  $("committee-cloud-refresh").addEventListener("click",async()=>{
   info("جارٍ تحميل مهام الترسيم من حساب المفتش...");
   try{
    const missions=await listCloudCommitteeMissions();
    clear(picker);
    const opt=node("option","— اختر مهمة —");opt.value="";picker.append(opt);
    for(const m of missions){
     const item=node("option",m.title+" — "+(m.status==="draft"?"جارية":"مغلقة"));
     item.value=m.id;picker.append(item);
    }
    info("تم تحميل "+missions.length+" مهمة. اختر المهمة المطابقة لشبكة التقييم الحالية.");
   }catch(err){info(err.message)}
  });
  $("committee-cloud-import").addEventListener("click",async()=>{
   const id=picker.value;
   if(!id){info("اختر المهمة أولًا.");return;}
   info("جارٍ قراءة المساهمات المرسلة والتحقق منها...");
   try{
    const {mission,rows}=await loadCloudCommitteeSubmissions(id);
    const next=mergeSubmittedCloudMembers(state,mission,rows);
    const labels=next.seats.join("، ");
    if(!confirm("استيراد مساهمات "+labels+" سيستبدل محتوى هذه المقاعد في المسودة الحالية. لن يتغير تحرير المفتش النهائي. صدّر ملف JSON احتياطيًا أولًا. موافق؟")){
     info("لم تتغير المسودة.");return;
    }
    clearVoiceDrafts();
    state=next.state;who="final";render();
    info("استُوردت "+next.seats.length+" مساهمة مرسلة بعد التحقق. بقيت بيانات المفتش النهائية كما هي.");
   }catch(err){info(err.message)}
  });
 }
}
// PDF keeps the browser's native print/save-as-PDF workflow; selection applies
// solely to the paper print surface. Both drafts remain visible in the editor.
function choosePrintDocument(kind){
 document.body.setAttribute("data-print-target",kind);
 if(kind==="report")preparePrintPagination($("paper"),state);
 window.print();
}
if(typeof window!=="undefined"){
 window.addEventListener?.("beforeprint",()=>{
  if(document.body.getAttribute?.("data-print-target")!=="minutes")
   preparePrintPagination($("paper"),state);
 });
 window.addEventListener?.("afterprint",()=>{
  document.body.removeAttribute?.("data-print-target");
  // Restore both preview drafts without changing any saved committee input.
  renderDocuments($("paper"),state);fitPrintPages($("paper"));
 });
}
$("print").addEventListener("click",()=>choosePrintDocument("report"));
$("print-minutes")?.addEventListener("click",()=>choosePrintDocument("minutes"));
function downloadWord(kind){
 try{
  const reportPageCount=kind==="report"?estimateDocxReportPages(state):5;
  const bytes=createCommitteeDocx(state,{kind,reportPageCount});
  const url=URL.createObjectURL(new Blob([bytes],
   {type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}));
  const link=node("a");
  link.href=url;
  link.download=kind==="report"?"titularisation-report-draft.docx":"titularisation-minutes-draft.docx";
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  message(kind==="report"?
   "نُزّل التقرير وحده DOCX، مع تذييل يحسب صفحات التقرير دون المحضر.":
   "نُزّل المحضر وحده DOCX، دون تذييل التقرير.");
 }catch(err){message("تعذّر إنشاء DOCX: "+err.message)}
}
$("docx").addEventListener("click",()=>downloadWord("report"));
$("docx-minutes")?.addEventListener("click",()=>downloadWord("minutes"));
render();
