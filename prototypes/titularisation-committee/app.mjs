import {RUBRICS,sameWeightProfile} from "../titularisation-workbench/engine.mjs";
import {SEATS,MODES,METADATA_GROUPS,freshCommittee,editMeta,editNote,changeMode,restoreCommittee,stringifyCommittee} from "./committee-engine.mjs?v=p2-phase-total-20261108";
import {DECISIONS} from "./document-model.mjs";
import {MINUTES_SCOPES} from "./document-language.mjs";
import {renderWeights} from "./weights-ui.mjs";
import {renderForm} from "./form-ui.mjs?v=p2-phase-total-20261108";
import {renderMembers} from "./members-ui.mjs";
import {renderDocuments} from "./preview.mjs";
import {node,clear,labelValue} from "./dom.mjs";
import {createCommitteeDocx} from "./docx-export.mjs";
import {estimateDocxReportPages} from "./docx-pagination.mjs";
import {fitPrintPages} from "./print-fit.mjs";
import {preparePrintPagination} from "./print-pagination.mjs";
import {stringifyPortableCommittee} from "./document-export-contract.mjs";
import {attachVoiceDictation,dismissVoiceDictation,clearVoiceDrafts} from "../../shared/voice-dictation.mjs";
import {committeeCloudEnabled,listCloudCommitteeMissions,loadCloudCommitteeSubmissions,prepareCloudCommitteeDraft,mergeSubmittedCloudMembers,loadCloudCommitteeReportDraft,saveCloudCommitteeReportDraft,loadCloudCommitteeInspectorProfile} from "./committee-cloud-bridge.mjs";
import {hydrateReportInspectorFromVerifiedProfile} from "../../qa-titularisation/report-inspector-prefill.mjs";
import {inspectorProfileDefaults} from "../../qa-titularisation/workspace-sources.mjs";
import {validMissionId,returnToQAMissionHref} from "../../qa-titularisation/mission-navigation.mjs";
let state=freshCommittee(),who="final";
let synthesisReview=null; // Created after owner-authorized mission import (production RLS or QA).
const qaReport=typeof window!=="undefined"&&window.REPORT03_CLOUD_CONFIG?.qaOnly===true;
const prodReport=typeof window!=="undefined"&&
 window.REPORT03_CLOUD_CONFIG?.qaOnly!==true&&
 window.REPORT03_CLOUD_CONFIG?.titularisationWorkspaceEnabled===true&&
 /\/titularisation\/report\/?$/.test(location.pathname);
const missionBoundReport=qaReport||prodReport;
const assistantRequested=qaReport&&new URLSearchParams(location.search).get("assistant")==="1";
const openedMetaGroups=new Set();
const $=id=>document.getElementById(id);
const linkedMissionId=missionBoundReport?new URLSearchParams(location.search).get("mission"):"";
let cloudDraftRevision=0,cloudDraftReady=false,cloudDraftDirty=false,cloudDraftBusy=false;
function connectQAMissionReturn(){
 // A mission UUID is only a locator. Never put the session token in the URL.
 if(!missionBoundReport||!validMissionId(linkedMissionId))return;
 const destination=qaReport?returnToQAMissionHref(linkedMissionId):
  "../../?titularisation="+encodeURIComponent(linkedMissionId);
 for(const id of ["qa-return-to-mission-top","qa-return-to-mission-bottom"]){
  const link=$(id);
  if(!link)continue;
  link.href=destination;link.hidden=false;
  link.addEventListener("click",event=>{
   if(cloudDraftBusy){
    event.preventDefault();
    message("جارٍ حفظ المسودة؛ تحقّق من نجاح الحفظ قبل العودة إلى المهمة.");
   }else if(cloudDraftDirty&&!confirm(
    "توجد تعديلات على التقرير والمحضر لم تُحفظ في المهمة. هل تريد العودة دون حفظ هذه التعديلات؟")){
    event.preventDefault();
   }
  });
 }
 const group=$("qa-return-nav");if(group)group.hidden=false;
}
connectQAMissionReturn();
function showVerifiedInspectorSource(profile){
 if(!missionBoundReport)return;
 const section=$("qa-inspector-profile-source");
 const note=$("qa-inspector-profile-note");
 const useName=$("qa-chair-use-profile-name");
 if(!section||!note||!useName)return;
 section.hidden=false;
 if(profile?.profileError){
  note.textContent="تعذر جلب ملف المفتش المهني: "+profile.profileError+
   ". ستبقى البيانات المحررة سابقًا محفوظة دون تغيير.";
  useName.hidden=true;return;
 }
 const defaults=inspectorProfileDefaults(profile);
 const available=[
  defaults.chairName&&"الاسم واللقب",
  defaults.inspectorDistrict&&"المقاطعة",
  defaults.inspectorEmail&&"البريد الإلكتروني"
 ].filter(Boolean);
 note.textContent=available.length?
  "تم التحقق من ملف المفتش المهني "+
  (prodReport?"الموجود في حساب المفتش الرئيسي":profile.federation_required===true?"المربوط بالحساب الرئيسي":"في QA")+
  ". الحقول المتاحة: "+available.join("، ")+
  ". تُملأ الحقول الفارغة فقط، ولا يُستبدل اسم رئيس اللجنة المكتوب يدويًا.":
  "لا توجد حقول مهنية قابلة للتعبئة في الملف الحالي.";
 if(!defaults.chairName){useName.hidden=true;return}
 useName.hidden=false;
 useName.addEventListener("click",()=>{
  if(!missionBoundReport||!cloudDraftReady)return;
  if(state.meta.chairName===defaults.chairName)return;
  if(state.meta.chairName&&!confirm(
   "سيُستبدل اسم رئيس اللجنة الذي كتبته باسم حساب المفتش الأصلي. هل تريد المتابعة؟"))return;
  commit(()=>editMeta(state,"chairName",defaults.chairName));
  message("استُخدم اسم المفتش رئيسًا للجنة في هذه المسودة. احفظ المسودة في المهمة لتثبيت التعديل.");
 });
}
function cloudDraftStatus(value){
 const status=$("cloud-draft-status");if(status)status.textContent=value;
}
function flagCloudDraftDirty(){
 if(!missionBoundReport||!linkedMissionId||!cloudDraftReady)return;
 cloudDraftDirty=true;
 cloudDraftStatus("توجد تعديلات غير محفوظة في المهمة. استخدم «حفظ مسودة التقرير والمحضر» قبل المغادرة.");
}
const labels={institution:"المؤسسة",candidate:"الأستاذ/المترشح",rank:"الرتبة",
 date:"تاريخ المهمة",location:"المكان",session:"بيانات الجلسة"};
function message(v){$("message").textContent=v}
function commit(fn){
 try{state=fn();flagCloudDraftDirty();render()}catch(e){message(e.message)}
}
function render(){
 // Keep unfinished speech text in the tab while rebuilding the editor.
 dismissVoiceDictation();
 $("mode").value=state.mode;
 $("rubric").value=Object.keys(RUBRICS).find(k=>RUBRICS[k].id===state.rubricId);
 // The mission, not a second independent editor, owns the rubric in QA.
 $("rubric").disabled=missionBoundReport;
 const seats=clear($("who"));
 for(const [key,label] of [["final","المفتش — الصيغة النهائية"],...(
  state.mode==="individual"&&!prodReport?SEATS.map(s=>[s.id,"محاكاة "+s.label]):[]) ]){
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
   }else if(key==="institution"&&prodReport){
    // The mission's resource UUID and official snapshot are fixed by its owner
    // RPC. Prevent a text-only rename that would invalidate the linked draft.
    const index=grid.children.length;
    labelValue(grid,label,state.meta[key],()=>message("المؤسسة مثبتة في المهمة. غيّرها من مسار تعديل المهمة عندما يُتاح ذلك."));
    const control=grid.children[index]?.querySelector("input,textarea");
    if(control){control.readOnly=true;control.title="المؤسسة مرتبطة بمعرّفها في المهمة الإنتاجية";}
   }else labelValue(grid,label,state.meta[key],value=>commit(()=>editMeta(state,key,value)));
  }
  details.append(grid);meta.append(details);
 }
 if(missionBoundReport){
  const weightsBox=clear($("weights"));
  if(state.rubricId===RUBRICS.analytical14.id){
   weightsBox.append(node("h2","أوزان المؤشرات الأربعة عشر"));
   weightsBox.append(node("p",state.final.grading.profile?.frozen?
    "الأوزان مأخوذة تلقائيًا من ملف المهمة المثبت لدى رئيس اللجنة. لا يلزم إدخالها مرة ثانية.":
    "لا تُدخل الأوزان هنا. افتح هذه الصفحة من المهمة السحابية لتحميل الأوزان المثبتة.","good"));
  }
 }else renderWeights($("weights"),state,commit);
 renderForm($("editor"),state,who,commit);
 attachVoiceDictation($("editor"));
 renderMembers($("members"),state);
 if(prodReport)$("members").hidden=true;
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
  state=next;flagCloudDraftDirty();
  synthesisReview?.reset();
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
 state=freshCommittee(state.mode,e.target.value);flagCloudDraftDirty();who="final";synthesisReview?.reset();render();
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
  state=next;flagCloudDraftDirty();who="final";synthesisReview?.reset();render();message("استُعيد ملف المسودة بعد التحقق.");
 }catch(err){message(err.message)}
});
// P0.2: explicit save tied to the SAME QA mission as committee submissions.
if(missionBoundReport&&linkedMissionId){
 const controls=$("cloud-draft-controls"),save=$("cloud-draft-save");
 if(controls&&save){
  controls.hidden=false;
  save.disabled=true;
  cloudDraftStatus("جارٍ تحميل مسودة التقرير والمحضر الخاصة بهذه المهمة...");
  save.addEventListener("click",async()=>{
   if(!cloudDraftReady||cloudDraftBusy)return;
   const snapshot=state,expected=cloudDraftRevision;
   cloudDraftBusy=true;save.disabled=true;
   cloudDraftStatus("جارٍ حفظ المسودة في المهمة...");
   try{
    const payload=JSON.parse(stringifyCommittee(snapshot));
    const revision=await saveCloudCommitteeReportDraft(linkedMissionId,payload,expected);
    cloudDraftRevision=revision;
    if(state===snapshot){
     cloudDraftDirty=false;
     cloudDraftStatus("حُفظت مسودة التقرير والمحضر في المهمة — مراجعة "+revision+".");
    }else{
     cloudDraftDirty=true;
     cloudDraftStatus("حُفظت مراجعة "+revision+"، لكن توجد تعديلات أحدث لم تُحفظ بعد.");
    }
   }catch(err){cloudDraftDirty=true;cloudDraftStatus(err.message);}
   finally{cloudDraftBusy=false;save.disabled=false;}
  });
 }
}
// Optional M5.1: only authorized, submitted seats can be imported.
// Never import stale draft contributions, nor change chair's scores or notes.
if(committeeCloudEnabled()){
 const panel=$("committee-cloud-bridge"),picker=$("committee-cloud-mission");
 if(panel&&picker){
  panel.hidden=false;
  const info=v=>{$("committee-cloud-status").textContent=v;};
  picker.addEventListener("change",()=>synthesisReview?.reset());
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
    const preferred=new URLSearchParams(location.search).get("mission");
    if(missions.some(m=>m.id===preferred))picker.value=preferred;
    info("تم تحميل "+missions.length+" مهمة. يمكنك استيراد المساهمات المرسلة حتى بعد إغلاق المهمة وحذف الحسابات."+
     (assistantRequested?" اختر المهمة ثم اضغط «استيراد المساهمات المرسلة» لإظهار مساعد المفتش.":""));
   }catch(err){info(err.message)}
  });
  $("committee-cloud-import").addEventListener("click",async()=>{
   const id=picker.value;
   if(!id){info("اختر المهمة أولًا.");return;}
   if(missionBoundReport&&linkedMissionId&&id!==linkedMissionId){info("اختر مهمة الترسيم التي فُتح منها هذا المحرر.");return;}
   info("جارٍ قراءة المساهمات المرسلة والتحقق منها...");
   try{
    const {mission,rows}=await loadCloudCommitteeSubmissions(id);
    const matches=state.rubricId===mission.rubric_id &&
     (mission.rubric_id!==RUBRICS.analytical14.id||
      sameWeightProfile(state.final.grading.profile,mission.rubric_profile));
    if(!matches&&!confirm("شبكة المسودة أو أوزانها تختلف عن المهمة. سيُنشأ محرر جديد مطابق للأوزان المثبتة وتضيع تعديلات المسودة الحالية. صدّر JSON احتياطيًا أولًا. هل توافق؟")){
     info("لم تتغير المسودة.");return;
    }
    const input=matches?state:prepareCloudCommitteeDraft(mission);
    const next=mergeSubmittedCloudMembers(input,mission,rows);
    const labels=next.seats.join("، ");
    if(!confirm("استيراد مساهمات "+labels+" المرسلة فقط؟ لن تتغير علامات المفتش النهائية ولا نصوصه المحررة.")){
     info("لم تتغير المسودة.");return;
    }
    clearVoiceDrafts();
    state=next.state;flagCloudDraftDirty();who="final";render();
    info("استُوردت "+next.seats.length+" مساهمة مرسلة بعد التحقق. بقيت بيانات المفتش النهائية كما هي.");
    // The assistant is exposed only after the inspector's OWNER-scoped
    // contribution read succeeds. A bearer member link has no such role.
    if(missionBoundReport){
     try{
      const {loadInspectorSynthesisSources}=await import("./committee-cloud-bridge.mjs");
      const {mountInspectorSynthesis}=await import("./inspector-synthesis-ui.mjs?v=p2-prod-owner-20261108");
      if(!synthesisReview)synthesisReview=mountInspectorSynthesis({
       anchor:panel,loadSources:loadInspectorSynthesisSources,
       getState:()=>state,getWho:()=>who,
       getMissionId:()=>picker.value,
       applyNote:(field,itemId,text)=>{
        state=editNote(state,"final",field,text,itemId);
        flagCloudDraftDirty();who="final";render();
       }
      });
      await synthesisReview.activate(id);
      if(!synthesisReview.panel.hidden){
       info("تم استيراد المساهمات وتفعيل مساعد المفتش. ستجده أسفل هذا القسم مباشرة. اضغط «تكوين مقترحات التقديرات».");
       if(assistantRequested)synthesisReview.panel.scrollIntoView?.({
        behavior:"smooth",block:"start"
       });
      }
     }catch(denied){
      synthesisReview?.reset();
      info("تم استيراد المساهمات؛ مساعد التركيب متاح لصاحب المهمة فقط: "+
       (denied?.message||"تعذر إثبات الصلاحية."));
     }
    }
   }catch(err){info(err.message)}
  });
  if(missionBoundReport){
   $("committee-cloud-refresh").click();
   // When launched from an inspector's mission, make the saved mission
   // the single source of truth even BEFORE the user clicks import. The
   // initial empty grouped-five draft must not ask for duplicate weights.
   // Do not overwrite a local JSON draft or user edits made while loading.
   const linked=new URLSearchParams(location.search).get("mission");
   if(linked){
    const untouched=state;
    Promise.all([
     loadCloudCommitteeSubmissions(linked),loadCloudCommitteeReportDraft(linked),
     loadCloudCommitteeInspectorProfile().catch(error=>({profileError:String(error?.message||error)}))
    ])
    .then(([{mission},saved,inspectorProfile])=>{
     if(state!==untouched){
      cloudDraftStatus("عُدّلت الصفحة قبل انتهاء تحميل المهمة. صدّر JSON ثم أعد فتح المهمة لتجنب فقد التغييرات.");
      return;
     }
     let target=saved?.payload?
      restoreCommittee(saved.payload):prepareCloudCommitteeDraft(mission);
     if(prodReport){
      if(!validMissionId(mission.institution_resource_id)||
         !mission.institution_name_snapshot)
       throw Error("لم يثبت خادم الإنتاج المؤسسة المرجعية للمهمة.");
      if(saved?.payload){
       if(target.meta.institutionResourceId!==mission.institution_resource_id||
          target.meta.institution!==mission.institution_name_snapshot)
        throw Error("المسودة لا تطابق المؤسسة المثبتة في مهمة الترسيم.");
      }else{
       target=editMeta(target,"institution",mission.institution_name_snapshot);
       target=editMeta(target,"institutionResourceId",mission.institution_resource_id);
      }
     }
     if(target.rubricId!==mission.rubric_id||
        (target.rubricId===RUBRICS.analytical14.id&&
         !sameWeightProfile(target.final.grading.profile,mission.rubric_profile)))
      throw Error("المسودة المحفوظة لا تطابق الشبكة أو الأوزان المثبتة في المهمة.");
     // Apply verified inspector details to empty report fields only.
     // The source is the QA inspector profile federated from primary Auth.
     // Do not auto-write or replace the chair's authored evaluation.
     const enriched=inspectorProfile?.profileError?
      {state:target,filled:[],sourceAvailable:false}:
      hydrateReportInspectorFromVerifiedProfile(target,inspectorProfile);
     clearVoiceDrafts();
     state=enriched.state;who="final";render();
     showVerifiedInspectorSource(inspectorProfile);
     cloudDraftRevision=saved?.revision||0;
     cloudDraftReady=true;cloudDraftDirty=enriched.filled.length>0||(!saved&&prodReport);
     $("cloud-draft-save")?.removeAttribute("disabled");
     if(enriched.filled.length){
      cloudDraftStatus("جُلبت بيانات المفتش إلى التقرير تلقائيًا: "+
       enriched.filled.join("، ")+
       ". الإضافات غير محفوظة بعد؛ اضغط «حفظ مسودة التقرير والمحضر في المهمة».");
     }else if(inspectorProfile?.profileError){
      cloudDraftStatus("استُعيدت المسودة، لكن تعذر استجلاب ملف المفتش: "+
       inspectorProfile.profileError+
       ". يمكن متابعة العمل، ولن تُختلق بيانات غير متاحة.");
     }else{
      cloudDraftStatus(saved?
       "استُعيدت مسودة التقرير والمحضر المحفوظة — مراجعة "+cloudDraftRevision+
       ". تم التحقق من ملف المفتش؛ احتُفظ بالبيانات التي كتبها سابقًا.":
       "المهمة جاهزة. تم التحقق من ملف المفتش؛ احفظ مسودة التقرير بعد التحرير.");
     }
     picker.value=linked;picker.disabled=true;
     info((prodReport?"المهمة الإنتاجية المرتبطة بمقاعد أعضاء اللجنة متاحة للمفتش. ":"")+"تم تحميل شبكة المهمة وأوزانها، واستُعيدت مسودة المفتش إن كانت محفوظة. استيراد مساهمات اللجنة يتم دون تغيير العلامات والنصوص النهائية للمفتش."+
      (assistantRequested?" ستظهر لوحة مساعد المفتش بعد الاستيراد.":""));
    }).catch(err=>{
     cloudDraftReady=false;
     cloudDraftStatus("تعذر تحميل مسودة المهمة: "+err.message+"؛ يمكنك تصدير JSON دون الكتابة فوق نسخة سحابية.");
     info("تعذر تحميل المهمة أو مسودتها: "+err.message);
    });
   }
  }
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
