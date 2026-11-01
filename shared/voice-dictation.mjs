/* Voice dictation shared adapter (UX-04.1 extraction), opt-in and draft-only.
 * This is not a grading, approval, submission, or publication mechanism.
 * Browser speech recognition may send audio to an external provider.
 * No audio or unfinished transcript is uploaded/stored by this module.
 */
const drafts=new Map();
let current=null;

export const voiceComposeDraft=(original,addition)=>{
 const first=String(original??""),second=String(addition??"").trim();
 return second?(first?first+(first.endsWith("\n")?"":"\n")+second:second):first;
};

export function voiceRecognitionError(code){
 return ({
  "not-allowed":"رُفض إذن الميكروفون. تحقق من إعدادات المتصفح.",
  "service-not-allowed":"خدمة التعرف الصوتي غير مسموح بها في هذا المتصفح.",
  "audio-capture":"تعذر الوصول إلى الميكروفون.",
  "no-speech":"لم يُلتقط كلام واضح. سنحاول الاستئناف عند الإمكان.",
  "network":"تعذر الاتصال بخدمة التعرف الصوتي للمتصفح. النص السابق محفوظ مؤقتًا.",
  "language-not-supported":"لغة التعرف غير مدعومة. جرّب خيارًا عربيًا آخر.",
  "aborted":"توقف التعرف الصوتي."
 })[code]||"تعذر التعرف على الكلام. يمكنك إعادة المحاولة أو الكتابة يدويًا.";
}
const ctor=()=>typeof window==="undefined"?null:
 (window.SpeechRecognition||window.webkitSpeechRecognition||null);
const create=(tag,text="",className="")=>{
 const e=document.createElement(tag);
 if(text)e.textContent=text;
 if(className)e.className=className;
 return e;
};
export function pendingVoiceDraftCount(){
 return [...drafts.values()].filter(x=>String(x.text||"").trim()).length+
  (current?.transcript?.value?.trim()&&!drafts.has(current.key)?1:0);
}
function saveDraft(session){
 if(!session?.key)return;
 const text=String(session.transcript?.value??"");
 if(text.trim())drafts.set(session.key,{text,language:session.language?.value||"ar-DZ"});
 else drafts.delete(session.key);
}
export function dismissVoiceDictation(discard=false){
 const s=current;
 current=null;
 if(!s)return;
 if(discard)drafts.delete(s.key);
 else saveDraft(s);
 s.keepListening=false;
 if(s.retryTimer!=null&&typeof window!=="undefined")window.clearTimeout(s.retryTimer);
 s.retryTimer=null;
 if(s.recognizer){
  const r=s.recognizer;
  r.onresult=null;r.onerror=null;r.onend=null;
  try{r.abort()}catch(_){}
  s.recognizer=null;
 }
 s.panel?.remove?.();
}
export function clearVoiceDrafts(){
 dismissVoiceDictation(true);
 drafts.clear();
}
function populateSelect(select){
 for(const [id,title] of [["ar-DZ","العربية — الجزائر"],["ar-SA","العربية — السعودية"],["ar","العربية العامة"]]){
  const option=create("option",title);option.value=id;select.append(option);
 }
 select.value="ar-DZ";
}
export function openVoiceDictation(target){
 if(!target?.isConnected||target.disabled||target.readOnly)return false;
 const Recognition=ctor();if(!Recognition)return false;
 const key=String(target.dataset?.voiceKey||"");
 if(!key)return false;
 dismissVoiceDictation();
 const old=drafts.get(key);
 const panel=create("section","","voice-dictation-panel");
 panel.setAttribute("aria-label","مسودة الإملاء الصوتي");
 panel.append(create("p",
  "الخصوصية: قد يرسل المتصفح الصوت إلى مزوّد التعرف على الكلام. لا تُخزن هذه الأداة الصوت، ويبقى النص المؤقت في ذاكرة التبويب فقط حتى تختار إدراجه. راجع النص قبل الإدراج، وتجنب إملاء بيانات سرية دون التحقق من خدمة المتصفح.",
  "voice-privacy-note"));
 const languageLabel=create("label","لغة التعرف","voice-language-label");
 const language=create("select");populateSelect(language);languageLabel.append(language);
 const status=create("p","لم يبدأ الاستماع.","voice-status");
 status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 const textLabel=create("label","نص الإملاء المؤقت — راجعه وصححه قبل الإدراج","voice-transcript-label");
 const transcript=create("textarea");transcript.rows=5;transcript.placeholder="سيظهر النص هنا، ويمكن تعديله";textLabel.append(transcript);
 const actions=create("div","","voice-actions");
 const start=create("button","بدء الاستماع","voice-start");
 const stop=create("button","إيقاف الاستماع","voice-stop");
 const copy=create("button","نسخ النص","voice-copy");
 const insert=create("button","إدراج النص بعد المراجعة","voice-insert");
 const close=create("button","إغلاق مع الاحتفاظ بالنص المؤقت","voice-close");
 const cancel=create("button","حذف المسودة الصوتية","voice-cancel");
 for(const button of [start,stop,copy,insert,close,cancel]){
  button.type="button";actions.append(button);
 }
 stop.disabled=true;
 panel.append(languageLabel,status,actions,textLabel);
 // Keep transcript before controls in DOM ordering via explicit repositioning.
 panel.append(actions);
 target.insertAdjacentElement("afterend",panel);
 const s={key,target,panel,transcript,language,status,start,stop,recognizer:null,
  keepListening:false,emptyStops:0,retryTimer:null};
 current=s;
 if(old){
  transcript.value=old.text;language.value=old.language;
  status.textContent="استُعيد نص غير مُدرج من ذاكرة التبويب. يمكنك استكماله أو مراجعته.";
 }
 const active=()=>current===s&&target.isConnected;
 const updateStatus=message=>{if(active())status.textContent=message;};
 transcript.addEventListener("input",()=>{if(active())saveDraft(s);});

 function listen(){
  if(!active()||!s.keepListening||s.recognizer)return;
  let r;
  try{r=new Recognition()}catch(_){
   s.keepListening=false;start.disabled=false;stop.disabled=true;
   updateStatus("تعذر تهيئة خدمة التعرف الصوتي. بقي النص المحفوظ متاحًا.");
   return;
  }
  s.recognizer=r;
  const seenFinal=new Set();
  let gotWords=false,failed=false;
  r.lang=language.value||"ar-DZ";
  r.continuous=true;
  r.interimResults=false;
  r.maxAlternatives=1;
  r.onresult=event=>{
   if(!active()||s.recognizer!==r)return;
   const parts=[];
   for(let i=event.resultIndex||0;i<event.results.length;i++){
    const result=event.results[i];
    if(result?.isFinal&&result[0]?.transcript&&!seenFinal.has(i)){
     seenFinal.add(i);parts.push(result[0].transcript.trim());
    }
   }
   if(parts.length){
    gotWords=true;s.emptyStops=0;
    transcript.value=voiceComposeDraft(transcript.value,parts.filter(Boolean).join(" "));
    saveDraft(s);
    updateStatus("أُضيف النص إلى مسودة الإملاء، ويمكن متابعة الحديث أو المراجعة.");
   }
  };
  r.onerror=event=>{
   if(!active()||s.recognizer!==r)return;
   const code=event?.error;
   if(code!=="no-speech"&&code!=="aborted"){
    failed=true;s.keepListening=false;start.disabled=false;stop.disabled=true;
   }
   updateStatus(voiceRecognitionError(code));
  };
  r.onend=()=>{
   if(!active()||s.recognizer!==r)return;
   s.recognizer=null;
   if(!s.keepListening||failed){
    start.disabled=false;stop.disabled=true;return;
   }
   if(!gotWords)s.emptyStops++;
   if(s.emptyStops>=6){
    s.keepListening=false;start.disabled=false;stop.disabled=true;
    start.textContent="استئناف الاستماع";
    updateStatus("توقف الاستماع بعد عدة فترات صمت؛ النص السابق محفوظ مؤقتًا.");
    return;
   }
   updateStatus("انقطع الاستماع مؤقتًا، وستجري محاولة استئناف تلقائي.");
   s.retryTimer=window.setTimeout(()=>{
    s.retryTimer=null;
    if(active()&&s.keepListening)listen();
   },400);
  };
  try{
   r.start();start.disabled=true;stop.disabled=false;
   updateStatus("الاستماع جارٍ. نصك محفوظ مؤقتًا حتى تراجعه وتدرجه.");
  }catch(_){
   s.recognizer=null;s.keepListening=false;
   start.disabled=false;stop.disabled=true;
   updateStatus("تعذر بدء الاستماع. يمكنك المحاولة مجددًا دون فقدان النص.");
  }
 }
 start.addEventListener("click",()=>{
  if(!active()||s.keepListening)return;
  s.keepListening=true;s.emptyStops=0;listen();
 });
 stop.addEventListener("click",()=>{
  if(!active())return;
  s.keepListening=false;
  if(s.retryTimer!=null)window.clearTimeout(s.retryTimer);
  s.retryTimer=null;start.disabled=false;stop.disabled=true;
  if(s.recognizer){try{s.recognizer.stop()}catch(_){}}
  start.textContent="استئناف الاستماع";
  updateStatus("توقف الاستماع. راجع النص أو انسخه أو أدرجه.");
 });
 copy.addEventListener("click",async()=>{
  if(!active())return;
  if(!transcript.value.trim()){updateStatus("لا يوجد نص للنسخ.");return;}
  try{
   if(!navigator.clipboard?.writeText)throw Error("clipboard unavailable");
   await navigator.clipboard.writeText(transcript.value);
   updateStatus("نُسخ النص. لا يزال متاحًا للمراجعة والإدراج.");
  }catch(_){
   transcript.focus();transcript.select?.();
   updateStatus("تعذر النسخ التلقائي؛ حُدد النص لتنسخه يدويًا.");
  }
 });
 insert.addEventListener("click",()=>{
  if(!active())return;
  const text=transcript.value.trim();
  if(!text){updateStatus("لا يوجد نص لإدراجه.");return;}
  const value=voiceComposeDraft(target.value,text);
  dismissVoiceDictation(true);
  target.value=value;
  target.dispatchEvent(new Event("change",{bubbles:true}));
 });
 close.addEventListener("click",()=>{if(active())dismissVoiceDictation();});
 cancel.addEventListener("click",()=>{
  if(!active())return;
  if(transcript.value.trim()&&!confirm("سيُحذف نص الإملاء المؤقت. هل تؤكد الحذف؟"))return;
  dismissVoiceDictation(true);
 });
 return true;
}
export function attachVoiceDictation(root){
 if(!root?.querySelectorAll)return 0;
 const inputs=[...root.querySelectorAll("textarea[data-voice-key]")].filter(
  t=>!t.disabled&&!t.readOnly&&t.dataset?.voiceKey);
 if(!inputs.length)return 0;
 if(!ctor()){
  const msg=create("p","الإملاء الصوتي غير متاح في هذا المتصفح؛ يمكنك متابعة الكتابة يدويًا.","voice-unsupported");
  inputs[0].insertAdjacentElement("afterend",msg);
  return 0;
 }
 for(const textarea of inputs){
  const button=create("button",drafts.has(textarea.dataset.voiceKey)?
   "استعادة نص إملاء مؤقت":"إملاء صوتي","voice-launch");
  button.type="button";
  button.setAttribute("aria-label","إملاء صوتي اختياري مع مراجعة قبل الإدراج");
  button.addEventListener("click",()=>openVoiceDictation(textarea));
  textarea.insertAdjacentElement("afterend",button);
 }
 return inputs.length;
}
