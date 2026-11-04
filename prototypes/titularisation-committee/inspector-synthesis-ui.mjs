// M5.12 inspector-only QA review. Never imported by committee-member/app.mjs.
// This UI is mounted ONLY after an owner-authorized Edge response was verified.
// Never copy source attributions into the proposed report text.
import {node,clear} from "./dom.mjs";
import {synthesizeInspectorNotes,sourceFingerprint} from "./inspector-synthesis.mjs?v=m513-editorial-20261104";
import {auditInspectorDraft} from "./inspector-prose-quality.mjs";

export function mountInspectorSynthesis({
 anchor,loadSources,getState,getWho,getMissionId,applyNote
}){
 if(!anchor||typeof loadSources!=="function"||typeof applyNote!=="function")
  throw Error("إعدادات مراجعة المفتش غير صالحة.");
 const panel=node("section","","panel inspector-synthesis");
 panel.id="inspector-synthesis";panel.hidden=true;
 anchor.insertAdjacentElement("afterend",panel);
 let activeMission="",snapshot=null,generatedSerial=null,sequence=0,busy=false;
 // Only this assistant's confirmed insertions advance the cached editor serial.
 // All other draft changes still require fresh synthesis for safety.
 let appliedKeys=new Set();
 function status(message,error=false){
  const label=panel.querySelector("#synthesis-status");
  if(label){label.textContent=message;label.className=error?"warning":"hint";}
 }
 function reset(){
  sequence++;activeMission="";snapshot=null;generatedSerial=null;busy=false;
  appliedKeys.clear();
  panel.hidden=true;clear(panel);
 }
 function base(){
  clear(panel);
  panel.append(node("h2","مساعد المفتش لتركيب تقديرات أعضاء اللجنة"));
  panel.append(node("p","لرئيس اللجنة صاحب المهمة فقط. ينظم النصوص ويحذف التكرار الكتابي المحافظ، مع إمكانية تنقيح كل اقتراح قبل إدراجه. لا يرسل التقديرات إلى نموذج لغوي، ولا يغير العلامات أو مساهمات الأعضاء.","small"));
  const controls=node("div","","actions");
  const button=node("button","تكوين مقترحات التقديرات");
  button.type="button";button.addEventListener("click",()=>generate());
  controls.append(button);panel.append(controls);
  const info=node("p","لم تُنشأ صياغة بعد.","hint");
  info.id="synthesis-status";info.setAttribute("role","status");
  info.setAttribute("aria-live","polite");panel.append(info);
  const results=node("div");results.id="synthesis-results";
  panel.append(results);
 }
 async function activate(missionId){
  reset();
  if(!missionId||getMissionId()!==missionId)return;
  const stamp=sequence;
  // Owner verification takes place in QA Edge, never from a browser role flag.
  const source=await loadSources(missionId);
  if(stamp!==sequence||getMissionId()!==missionId)return;
  if(source.owner_only!==true||source.qa_only!==true||
     source.mission_id!==missionId)throw Error("لا توجد صلاحية تركيب لهذه المهمة.");
  activeMission=missionId;
  base();panel.hidden=false;
  status(source.rows.length?
   "تم التحقق من صلاحية المفتش. اضغط لتكوين مقترحات من التقديرات المرسلة.":
   "تم التحقق من صلاحية المفتش. لا توجد مساهمات مرسلة بعد.");
 }
 async function generate(){
  if(busy||!activeMission)return;
  const stamp=sequence;
  busy=true;status("جارٍ التحقق من صلاحية المفتش وقراءة أحدث التقديرات...");
  try{
   if(getMissionId()!==activeMission)throw Error("تغيرت المهمة المختارة.");
   if(getWho()!=="final")throw Error("اختر «المفتش — الصيغة النهائية» أولًا.");
   const source=await loadSources(activeMission);
   if(stamp!==sequence||!activeMission||getMissionId()!==activeMission)return;
   if(source.owner_only!==true||source.qa_only!==true||
      source.mission_id!==activeMission)throw Error("انتهت صلاحية الوصول للمهمة.");
   if(getState().rubricId!==source.rubric_id)
    throw Error("شبكة المحرر لا تطابق المهمة؛ أعد استيراد مساهمات المهمة.");
   const proposal=synthesizeInspectorNotes(source);
   appliedKeys.clear();
   snapshot=proposal;generatedSerial=getState().serial;
   showResults(proposal);
   status(proposal.fields.length?
    "هذه صياغات تحفظ النصوص الأصلية وتتجنب الاختلاق. راجع كل بند ومصادره قبل الإدراج.":
    "لا توجد تقديرات كتابية مرسلة قابلة للتركيب.");
  }catch(err){
   if(stamp!==sequence)return;
   snapshot=null;generatedSerial=null;
   clear(panel.querySelector("#synthesis-results"));
   status(err?.message||"تعذر تركيب التقديرات.",true);
  }finally{if(stamp===sequence)busy=false}
 }
 function showResults(proposal){
  const root=clear(panel.querySelector("#synthesis-results"));
  root.append(node("p","مساهمات مرسلة: "+proposal.seatCount+
    " — حقول ذات تقديرات: "+proposal.fields.length,"hint"));
  const progress=node("p","","hint");
  progress.id="synthesis-progress";progress.setAttribute("role","status");
  root.append(progress);
  updateProgress();
  for(const field of proposal.fields){
   const details=node("details","","synthesis-review");
   details.open=["field:general","field:lessonSummary","field:discussionSummary"].includes(field.key);
   const summary=node("summary",field.title+" — "+field.sources.length+" مصدر/مصادر");
   details.append(summary);
   if(field.duplicateCount)
    details.append(node("p","أزيل تكرار "+field.duplicateCount+
     " نص/نصوص متقاربة جدًا دون حذف أي مصدر.","hint"));
   if(field.clauseDuplicates)
    details.append(node("p","أزيل تكرار "+field.clauseDuplicates+
     " عبارة متطابقة داخل التقديرات؛ بقيت جميع النصوص الأصلية محفوظة للمراجعة.","hint"));
   if(field.breakdown)
    details.append(node("p","تحليل لغوي أولي للعبارات: "+
     field.breakdown.strength+" إيجابية، "+
     field.breakdown.improvement+" للتحسين، "+
     field.breakdown.observation+" وصفية. هذا تصنيف تقريبي لا يحل محل تقييم المفتش.","hint"));
   if(field.distinctCount>1)
    details.append(node("p","توجد "+field.distinctCount+
     " صياغات متميزة. لا يعني اختلاف الصياغة وجود اتفاق أو تعارض؛ راجعها.","hint"));
   for(const warning of field.reasons)
    details.append(node("p",warning,"warning"));
   if(!field.blocked&&field.candidate){
    details.append(node("p",field.candidate,"synthesis-candidate"));
    const draftLabel=node("label","","synthesis-draft-label");
    draftLabel.append(node("span","صياغة المفتش المقترحة — راجعها ونقحها هنا قبل الإدراج"));
    const draft=node("textarea","","synthesis-draft");
    draft.value=field.candidate;draft.rows=4;draft.maxLength=4000;draft.dir="rtl";
    draft.setAttribute("aria-label","تنقيح صياغة "+field.title);
    draftLabel.append(draft);details.append(draftLabel);
    const controls=node("div","","actions");
    const restore=node("button","استعادة الصياغة الأصلية");
    restore.type="button";restore.className="secondary";
    restore.addEventListener("click",()=>{
     draft.value=field.candidate;
     status("استُعيد اقتراح المحرك. لم تتغير مسودة التقرير.");
    });
    const control=node("button","إدراج هذه الصياغة في تقدير المفتش");
    control.type="button";
    control.addEventListener("click",()=>insert(field,control,details,draft,restore));
    controls.append(control,restore);details.append(controls);
   }else details.append(node("p",
    "لا يوجد اقتراح إدراج آلي لهذا الحقل؛ حرر خلاصة المفتش يدويًا بعد مراجعة المصادر.","small"));
   const trace=node("details","","synthesis-sources");
   trace.append(node("summary","إظهار النصوص الأصلية ومصادرها (للمفتش فقط)"));
   for(const src of field.sources){
    const record=node("p","","synthesis-source");
    record.append(node("strong",src.seat_label+" (مراجعة "+src.revision+"): "));
    record.append(node("span",src.original));
    trace.append(record);
   }
   details.append(trace);root.append(details);
  }
 }
 function updateProgress(){
  const progress=panel.querySelector("#synthesis-progress");
  if(!progress||!snapshot)return;
  const insertable=snapshot.fields.filter(f=>!f.blocked&&f.candidate);
  const inserted=insertable.filter(f=>appliedKeys.has(f.key)).length;
  progress.textContent="الصياغات المدرجة: "+inserted+" من "+insertable.length+
   " — يمكنك متابعة باقي العناصر دون إغلاق المساعد أو إعادة تكوين المقترحات.";
 }
 async function insert(field,control,details,draft,restore){
  if(busy)return;
  busy=true;
  const stamp=sequence,proposal=snapshot;
  try{
   if(!snapshot||snapshot.mission_id!==activeMission||
      getMissionId()!==activeMission||
      getWho()!=="final"||
      getState().serial!==generatedSerial)
    throw Error("تغيرت المسودة أو المهمة بعد التحليل. أعد تكوين المقترحات.");
   const match=snapshot.fields.find(x=>x.key===field.key);
   if(match!==field||match.blocked||!match.candidate||appliedKeys.has(field.key))
    throw Error("هذا الحقل لا يملك اقتراحًا صالحًا للإدراج.");
   const latest=await loadSources(activeMission);
   if(sequence!==stamp||proposal!==snapshot||getMissionId()!==activeMission)
    throw Error("تغيرت المهمة أثناء التحقق. أعد فتح المساعد من مهمتك.");
   if(latest.owner_only!==true||latest.qa_only!==true||
      sourceFingerprint(latest)!==snapshot.sourceFingerprint)
    throw Error("عُدّلت مساهمات اللجنة بعد التحليل. أعد تكوين المقترحات.");
   if(getState().serial!==generatedSerial)
    throw Error("تغيرت مسودة المفتش. أعد تكوين المقترحات.");
   const audited=auditInspectorDraft(draft.value,field.sources);
   const existing=field.itemId===null?getState().final.notes[field.field]:
    getState().final.notes[field.field][field.itemId];
   const edited=audited.text!==field.candidate.trim();
   const question=(existing?
    "الحقل النهائي يتضمن تقديرًا سبق أن حررته. الإدراج سيستبدله، دون تغيير علامات الأعضاء أو مساهماتهم.\n":
    "سيُدرج هذا النص في حقل المفتش النهائي فقط.\n")+
    (edited?"هذه الصياغة منقّحة بواسطتك؛ تحقق من أمانتها للملاحظات والأدلة الأصلية.\n":"")+
    (audited.warnings.length?audited.warnings.join("\n")+"\n":"")+
    "هل توافق على الإدراج؟";
   if(!confirm(question)){status("لم تتغير مسودة المفتش.");return;}
   applyNote(field.field,field.itemId,audited.text);
   // Keep the authorized proposal and other buttons available. This editor
   // commit was caused by the assistant itself; external draft changes are
   // still detected by the serial guard on the next insertion.
   generatedSerial=getState().serial;
   appliedKeys.add(field.key);
   control.disabled=true;
   draft.readOnly=true;
   restore.disabled=true;
   control.textContent="تم إدراج الصياغة في تقدير المفتش";
   control.setAttribute("aria-disabled","true");
   details.className+=" synthesis-applied";
   updateProgress();
   const remaining=snapshot.fields.filter(f=>!f.blocked&&f.candidate&&
    !appliedKeys.has(f.key)).length;
   status(remaining?
    "أُدرج هذا التقدير بنجاح. يمكنك إدراج "+remaining+
     " صياغة أخرى من القائمة مباشرة، دون إعادة التحليل.":
    "أُدرجت جميع الصياغات القابلة للإدراج. يمكنك تحريرها في تقرير المفتش.");
  }catch(err){if(stamp===sequence)status(err?.message||"تعذر الإدراج.",true)}
  finally{if(stamp===sequence)busy=false}
 }
 return {activate,reset,get panel(){return panel}};
}
