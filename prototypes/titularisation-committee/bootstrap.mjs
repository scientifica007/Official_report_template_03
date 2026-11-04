// Explicit QA opt-in for the field-approved local committee editor.
// Load exactly one cloud configuration BEFORE the shared editor module.
// Default remains local-only; ?qa=1 uses the isolated QA project.
const qaRequested=new URLSearchParams(location.search).get("qa")==="1";
const qaLink=document.getElementById("qa-mode-link");
const localLink=document.getElementById("local-mode-link");
const localNotice=document.getElementById("local-mode-description");
const qaNotice=document.getElementById("qa-mode-description");
const localSeatNotice=document.getElementById("simulated-members-description");
const qaSeatNotice=document.getElementById("qa-members-description");
if(qaRequested){
 if(qaLink)qaLink.hidden=true;
 if(localLink)localLink.hidden=false;
 if(localNotice)localNotice.hidden=true;
 if(qaNotice)qaNotice.hidden=false;
 if(localSeatNotice)localSeatNotice.hidden=true;
 if(qaSeatNotice)qaSeatNotice.hidden=false;
 const status=document.getElementById("qa-link-status");
 let signedIn=false;
 try{
  const saved=JSON.parse(sessionStorage.getItem("scientifica_committee_qa_session_v1")||"null");
  signedIn=Boolean(saved?.access_token&&saved?.refresh_token&&saved?.userId);
 }catch(_){}
 if(status&&!signedIn)status.textContent=
  "لا توجد جلسة مفتش QA في هذا التبويب. افتح لوحة QA وسجّل الدخول ثم افتح محرر المهمة من لوحتها؛ لا تُنقل جلسة الاختبار إلى تبويب مستقل تلقائيًا.";
}else{
 if(qaLink)qaLink.addEventListener("click",event=>{
  if(!confirm("سيُعاد تحميل المحرر لوضع QA. صدّر مسودتك المحلية بصيغة JSON أولًا؛ لا تنتقل البيانات غير المحفوظة تلقائيًا. متابعة؟"))
   event.preventDefault();
 });
}
try{
 // No production config is loaded in QA mode, and no QA config in local mode.
 await import(qaRequested?"../../qa-titularisation/config.js":"../../cloud-config.js");
 const config=window.REPORT03_CLOUD_CONFIG;
 if(qaRequested&&(!config?.qaOnly||config?.temporaryCommitteeEnabled!==true||
  config?.supabaseUrl!=="https://npxwshvcrowbfoiqyrwx.supabase.co"))
  throw Error("لم تُحمّل إعدادات بيئة QA المعزولة بصورة صحيحة.");
 await import("./app.mjs?v=qa-link-20261104");
}catch(error){
 const output=document.getElementById("message");
 if(output)output.textContent="تعذر تهيئة محرر الترسيم: "+(error?.message||"خطأ غير متوقع")+
  ". يمكنك العودة إلى لوحة QA أو تشغيل المحرر المحلي.";
}
