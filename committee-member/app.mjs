// M5.1 — separate, seat-scoped inspector-committee contributor interface.
// Public HTML is not an authorization boundary; Supabase RLS and authenticated
// RPC enforce the permission for EACH contribution and read.
import {RUBRICS,DISCUSSION,newDraft,lessonItems,withScore,distributePhaseTotal,totals,missingMandatoryScores,sameWeightProfile} from "../prototypes/titularisation-workbench/engine.mjs?v=p2-phase-total-20261108";
import {attachVoiceDictation,dismissVoiceDictation,clearVoiceDrafts} from "../shared/voice-dictation.mjs";
import {createPairedScore} from "../shared/score-range.mjs";
const cfg=window.REPORT03_CLOUD_CONFIG||{};
const base=String(cfg.supabaseUrl||"").replace(/\/+$/,"");
const key=String(cfg.publishableKey||"");
const shell=document.getElementById("member-app");
const params=new URLSearchParams(location.search);
const requestedMission=params.get("mission")||"";
const requestedSeat=params.get("seat")||"";
const productionMember=location.pathname.includes("/titularisation/member/")&&cfg.qaOnly!==true;
let contributionRevision=0;
const allowedSeats=new Set(["member1","member2","member3"]);
const storageKey="titularisation_member_session_v1_"+(base.match(/^https:\/\/([^.]+)/)?.[1]||"unconfigured")+
 (productionMember?"_"+requestedMission+"_"+requestedSeat:"");
let session=null,mission=null,seat=null,payload=null,submitted=false,dirty=false,busy=false;
const el=(tag,content="")=>{const e=document.createElement(tag);e.textContent=content;return e};
const label=(title,node)=>{const wrap=el("label");wrap.append(el("span",title),node);return wrap};
const statusText=(text,kind="notice")=>{
 const node=document.getElementById("member-status");
 if(node){node.textContent=text;node.className=(kind==="error"?"alert":"notice")+" save-feedback";}
};
function configured(){
 return (productionMember?cfg.titularisationCommitteeEnabled===true:cfg.temporaryCommitteeEnabled===true)&&/^https:\/\//.test(base)&&key.length>20&&
  /^[0-9a-f-]{36}$/i.test(requestedMission)&&allowedSeats.has(requestedSeat);
}
function saveSession(value){
 session=value;
 try{
  if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));
  else sessionStorage.removeItem(storageKey);
 }catch(_){}
}
function restoreSession(){
 try{
  const raw=JSON.parse(sessionStorage.getItem(storageKey)||"null");
  if(raw?.mission_id===requestedMission&&raw?.seat_code===requestedSeat&&
   (productionMember?/^[a-f0-9]{64}$/.test(raw.capability||""):
    Boolean(raw.access_token&&raw.refresh_token)))session=raw;
 }catch(_){}
}
async function request(path,options={}){
 const headers={"apikey":key,"Accept":"application/json"};
 if(options.body!==undefined)headers["Content-Type"]="application/json";
 if(options.bearer)headers.Authorization="Bearer "+options.bearer;
 const response=await fetch(base+path,{method:options.method||"GET",
  headers,body:options.body===undefined?undefined:JSON.stringify(options.body),cache:"no-store"});
 const raw=await response.text();let data;
 try{data=raw?JSON.parse(raw):null}catch(_){data=null}
 if(!response.ok)throw Error(String(data?.error||data?.message||"تعذر الاتصال بالخدمة")+" ("+response.status+")");
 return data;
}
async function ensureToken(){
 if(productionMember){
  if(!/^[a-f0-9]{64}$/.test(session?.capability||""))
   throw Error("رابط الدعوة غير متاح؛ اطلب رابطًا جديدًا من رئيس اللجنة.");
  return session.capability;
 }
 if(!session?.refresh_token)throw Error("سجل الدخول أولًا");
 if(Date.now()<(session.expires_at_ms||0)-60000)return session.access_token;
 const result=await request("/auth/v1/token?grant_type=refresh_token",{
  method:"POST",body:{refresh_token:session.refresh_token}
 });
 if(!result?.access_token||!result?.refresh_token)throw Error("انتهت الجلسة المؤقتة");
 saveSession({...session,access_token:result.access_token,
  refresh_token:result.refresh_token,
  expires_at_ms:Date.now()+1000*(Number(result.expires_in)||3600)});
 return session.access_token;
}
async function rpc(name,args){
 const bearer=await ensureToken();
 if(productionMember){
  if(name!=="save_titularisation_member_contribution")
   throw Error("عملية غير متاحة لمقعد الإنتاج.");
  return request("/rest/v1/rpc/save_prod_titularisation_member",{
   method:"POST",body:{p_mission_id:requestedMission,p_seat_code:requestedSeat,
    p_token:bearer,p_payload:args.p_payload,p_expected_revision:contributionRevision,
    p_submit:args.p_submit}});
 }
 return request("/rest/v1/rpc/"+name,{method:"POST",bearer,body:args});
}
async function list(table,filters,columns){
 const bearer=await ensureToken();
 const query=new URLSearchParams({select:columns,...filters});
 return request("/rest/v1/"+table+"?"+query.toString(),{bearer});
}
const newNotes=()=>({lesson:{},discussion:{},lessonSummary:"",discussionSummary:"",
 general:"",recommendations:""});
function message(text,alert=false){
 const n=el("p",text);n.className=alert?"alert":"notice";
 return n;
}
function header(){
 const wrap=el("section");wrap.className="card";
 wrap.append(el("h2","بيانات المشاركة المؤقتة"),
  el("p","المهمة: "+mission.title),
  el("p","المقعد: "+({
    member1:"العضو الأول",member2:"العضو الثاني",member3:"العضو الثالث"
  })[seat.seat_code]+" — "+(seat.display_name||"من دون اسم عرض")),
  el("p","المدة تنتهي: "+new Date(seat.expires_at).toLocaleString("ar-DZ")));
 return wrap;
}
function renderLogin(){
 shell.replaceChildren();
 const box=el("section");box.className="card login";
 if(productionMember){
  const feedback=message("الرابط غير متاح أو انتهت صلاحيته. اطلب من رئيس اللجنة رابطًا مباشرًا جديدًا؛ لا يلزم اسم مستخدم أو كلمة مرور.",true);
  feedback.id="member-status";feedback.setAttribute("role","alert");
  box.append(el("h1","رابط مساهمة لجنة الترسيم"),feedback);
  shell.append(box);return;
 }
 box.append(el("h1","الدخول إلى مساهمة اللجنة"),
  el("p","أدخل اسم المستخدم وكلمة المرور اللذين سلّمهما لك رئيس اللجنة. الرابط وحده لا يمنح حق الدخول."));
 const form=el("form");
 const username=el("input");username.name="username";username.required=true;
 username.autocomplete="username";username.maxLength=40;
 const password=el("input");password.name="password";password.type="password";
 password.required=true;password.autocomplete="current-password";
 const submit=el("button","تسجيل الدخول");submit.type="submit";
 form.append(label("اسم المستخدم",username),label("كلمة المرور",password),submit);
 const feedback=message("لا تضع كلمة المرور في الرابط أو في ملف JSON.");
 feedback.id="member-status";feedback.setAttribute("role","status");
 form.addEventListener("submit",async event=>{
  event.preventDefault();if(busy)return;
  busy=true;submit.disabled=true;feedback.textContent="جارٍ التحقق...";
  try{
   const result=await request("/functions/v1/titularisation-access",{
    method:"POST",body:{action:"login",username:username.value.trim(),password:password.value}
   });
   password.value="";
   if(result.mission_id!==requestedMission||result.seat_code!==requestedSeat)
    throw Error("هذا الحساب مرتبط بمهمة أو مقعد مختلفين.");
   saveSession({...result,expires_at_ms:Date.now()+1000*(Number(result.expires_in)||3600)});
   await load();
  }catch(error){feedback.textContent=error.message;submit.disabled=false}
  finally{busy=false}
 });
 box.append(form,feedback);shell.append(box);
}
function addScoreField(area,phase,item,onScoreChange,scoreFields){
 const row=el("div");row.className="assessment";
 const score=el("input");score.type="number";score.min="0";score.max=String(item.cap);
 score.step="0.5";score.inputMode="decimal";
 score.value=payload.grading.scores[phase][item.id]??"";
 score.setAttribute("aria-label","علامة: "+item.label);
 const hint=el("span","علامة مطلوبة");
 hint.className="score-required-hint";hint.hidden=true;
 hint.id="missing-score-"+phase+"-"+item.id;
 score.setAttribute("aria-describedby",hint.id);
 const gradeLabel=el("div");gradeLabel.className="score-label";
 gradeLabel.append(el("span","العلامة"));
 const note=el("textarea");note.rows=3;note.maxLength=4000;
 note.placeholder="تقدير مختصر يتعلق بهذا المؤشر";
 note.dataset.voiceKey=[requestedMission,requestedSeat,phase,item.id].join("|");
 note.value=payload.notes[phase][item.id]||"";
 if(item.cap===0)score.disabled=true;
 const changeGrade=()=>{
  try{
   payload.grading=withScore(payload.grading,phase,item.id,score.value);
   dirty=true;statusText("توجد تعديلات غير محفوظة.");
   score.setCustomValidity("");
  }catch(error){
   score.setCustomValidity(error.message);
   // An invalid input is never counted as a newly supplied valid score.
  }
  onScoreChange();
 };
 score.addEventListener("input",changeGrade);
 score.addEventListener("change",changeGrade);
 if(item.cap>0){
  gradeLabel.append(createPairedScore(score,{
   cap:item.cap,label:item.label,
   // Member preview updates live; final server submission still validates all marks.
   onRangeInput:changeGrade,onRangeCommit:changeGrade
  }));
 }else{
  gradeLabel.append(score,el("small","وزنه صفر — غير منقّط"));
 }
 gradeLabel.append(hint);
 note.addEventListener("change",()=>{
  payload.notes[phase][item.id]=note.value;dirty=true;
  statusText("توجد تعديلات غير محفوظة.");
 });
 row.append(el("strong",item.label+" (من "+item.cap+")"),gradeLabel,
  label("الملاحظة",note));
 scoreFields.set(phase+":"+item.id,{score,row,hint});
 area.append(row);
}
function renderSeatIdentity(){
 const panel=el("section");panel.className="card member-identity";
 panel.append(el("h2","بيانات عضو اللجنة"),
  el("p","يمكنك إدراج اسمك ولقبك وصفتك المهنية وتصحيحها، ولو سبق لرئيس اللجنة إدخالها. حفظ هذه البيانات مستقل عن تنقيطك."));
 const fields={};
 for(const [key,title,limit] of [
  ["given_name","الاسم",100],["family_name","اللقب",100],
  ["member_role","الصفة المهنية",160]]){
  const input=el("input");input.type="text";input.maxLength=limit;
  input.value=seat[key]||"";
  fields[key]=input;
  panel.append(label(title,input));
 }
 const save=el("button","حفظ بياناتي الشخصية");save.type="button";
 const feedback=message("تستطيع تعديل بياناتك مجددًا ما دامت المهمة مفتوحة.");
 feedback.setAttribute("role","status");feedback.setAttribute("aria-live","polite");
 save.addEventListener("click",async()=>{
  if(busy)return;
  if(!confirm("هل تؤكد حفظ الاسم واللقب والصفة المهنية لهذا المقعد فقط؟"))return;
  busy=true;save.disabled=true;feedback.textContent="جارٍ حفظ بيانات العضو...";
  try{
   const token=await ensureToken();
   const identity={
    p_given_name:fields.given_name.value.trim(),
    p_family_name:fields.family_name.value.trim(),
    p_member_role:fields.member_role.value.trim()
   };
   const success=await request("/rest/v1/rpc/save_prod_titularisation_member_identity",{
    method:"POST",body:{p_mission_id:requestedMission,p_seat_code:requestedSeat,p_token:token,...identity}});
   if(success!==true)throw Error("لم يؤكد الخادم حفظ البيانات");
   seat.given_name=identity.p_given_name;
   seat.family_name=identity.p_family_name;
   seat.member_role=identity.p_member_role;
   seat.display_name=[seat.given_name,seat.family_name].filter(Boolean).join(" ");
   feedback.textContent="تم حفظ الاسم واللقب والصفة على الخادم بنجاح؛ لا تتغير علاماتك أو مراجعات مساهمتك.";
   feedback.className="notice";
  }catch(error){feedback.textContent="فشل الحفظ: "+error.message;feedback.className="alert";}
  finally{busy=false;save.disabled=false;}
 });
 panel.append(save,feedback);return panel;
}
function renderEditor(){
 dismissVoiceDictation();
 shell.replaceChildren(header());
 if(productionMember)shell.append(renderSeatIdentity());
 const card=el("section");card.className="card";
 card.append(el("h2","تقدير الأداء المهني"),
  el("p","هذه مساهمتك أنت فقط. يستطيع رئيس اللجنة الاطلاع عليها بعد حفظها. لا تتغير مساهمات بقية الأعضاء."));
 if(mission.rubric_id===RUBRICS.analytical14.id)
  card.append(message("الشبكة التحليلية: 14 مؤشرًا بأوزان ثبتها رئيس اللجنة، ومجموع الحصة 40 والمناقشة 20."));
 if(submitted){
  card.append(message("مساهمتك مرسلة بالفعل. يمكنك تصحيح العلامات أو التقديرات وإعادة إرسال النسخة المصححة ما دامت المهمة مفتوحة؛ تُحفظ النسخة السابقة في سجل التعديلات."));
 }
 card.append(message("كل علامات الحصة والمناقشة إلزامية عند الإرسال النهائي، أما التقديرات والملاحظات النصية فاختيارية. العلامة 0 مقبولة، والمؤشر ذو الوزن 0 غير منقّط."));
 const progress=el("p");progress.setAttribute("aria-live","polite");
 const jumpToMissing=el("button","الانتقال إلى أول علامة ناقصة");
 jumpToMissing.type="button";
 jumpToMissing.className="jump-to-missing";
 jumpToMissing.hidden=true;
 const scoreFields=new Map();
 card.append(progress,jumpToMissing);
 jumpToMissing.addEventListener("click",()=>{
  const field=[...scoreFields.values()].find(({row})=>
   row.classList.contains("score-needs-attention"))?.score;
  if(field){
   field.scrollIntoView({behavior:"smooth",block:"center"});
   field.focus({preventScroll:true});
  }
 });
 let updateScoreProgress=()=>{};
 for(const [phase,title,rows] of [
  ["lesson","تقييم الحصة التدريسية",lessonItems(payload.grading)],
  ["discussion","تقييم المناقشة",DISCUSSION]]){
  const cap=phase==="lesson"?40:20;
  const allocate=el("section");allocate.className="total-allocation";
  const totalLabel=el("label");
  const totalInput=el("input");totalInput.type="number";totalInput.step="0.5";
  totalInput.min="0";totalInput.max=String(cap);totalInput.inputMode="decimal";
  const existing=totals(payload.grading)[phase];
  totalInput.value=existing.complete?String(existing.total):"";
  totalLabel.append(el("span","العلامة الكلية لل"+(phase==="lesson"?"حصة البيداغوجية":"مناقشة")+" من "+cap),totalInput);
  const applyTotal=el("button","توزيع العلامة الكلية على المؤشرات");
  applyTotal.type="button";
  const allocationFeedback=el("p","توزيع حسابي وفق الأوزان وبخطوة نصف نقطة، قابل للتعديل؛ لا يمثل تقييمًا مباشرًا لكل مؤشر.");
  allocationFeedback.className="notice";
  applyTotal.addEventListener("click",()=>{
   if(!totalInput.checkValidity()||totalInput.value===""){totalInput.reportValidity();return;}
   if(!confirm("ستُستبدل علامات "+(phase==="lesson"?"الحصة":"المناقشة")+
    " الحالية بتوزيع نسبي لأوزان المؤشرات. ستحفظ النتيجة فقط عند الضغط على حفظ/إرسال. هل تؤكد؟"))return;
   try{
    payload.grading=distributePhaseTotal(payload.grading,phase,totalInput.value);
    dirty=true;renderEditor();statusText("وُزعت العلامة الكلية لهذا الامتحان؛ توجد تعديلات غير محفوظة.");
   }catch(error){allocationFeedback.textContent=error.message;allocationFeedback.className="alert";}
  });
  allocate.append(totalLabel,applyTotal,allocationFeedback);
  card.append(allocate);
  const group=el("details");group.open=true;
  group.append(el("summary",title));
  const grid=el("div");grid.className="assessments";
  for(const item of rows)addScoreField(grid,phase,item,()=>updateScoreProgress(),scoreFields);
  group.append(grid);card.append(group);
 }
 for(const [key,title] of [
  ["lessonSummary","خلاصة تقدير الحصة"],
  ["discussionSummary","خلاصة تقدير المناقشة"],
  ["general","التقدير العام"],
  ["recommendations","التوصيات"]]){
  const area=el("textarea");area.rows=4;area.maxLength=10000;
  area.dataset.voiceKey=[requestedMission,requestedSeat,"prose",key].join("|");
  area.value=payload.notes[key]||"";
  area.addEventListener("change",()=>{
   payload.notes[key]=area.value;dirty=true;
   statusText("توجد تعديلات غير محفوظة.");
  });
  card.append(label(title,area));
 }
 const bar=el("div");bar.className="actions";
 const save=el("button","حفظ مساهمتي");save.type="button";
 const send=el("button",submitted?"حفظ التصحيح وإعادة إرساله":"إرسال المساهمة");send.type="button";
 send.className="primary";
 const logout=el("button","تسجيل الخروج");logout.type="button";
 bar.append(save,send,logout);
 const saveFeedback=message(productionMember&&contributionRevision>0?
  "استُعيدت مساهمتك المحفوظة على الخادم — المراجعة "+contributionRevision+".":
  "اضغط «حفظ مساهمتي» لتأكيد حفظ العلامات والملاحظات قبل مغادرة الصفحة.");
 saveFeedback.id="member-status";
 saveFeedback.classList.add("save-feedback");
 saveFeedback.setAttribute("role","status");
 saveFeedback.setAttribute("aria-live","polite");
 saveFeedback.setAttribute("aria-atomic","true");
 card.append(bar,saveFeedback);
 shell.append(card);
 // An already-submitted seat stays editable until mission close; the
 // previous version is archived server-side on each explicit correction.
 save.disabled=submitted;
 updateScoreProgress=()=>{
  const missing=missingMandatoryScores(payload.grading);
  const lessonMissing=missing.filter(x=>x.phase==="lesson");
  const discussionMissing=missing.filter(x=>x.phase==="discussion");
  // An incomplete submitted historic contribution remains inspectable and
  // correctable; it cannot be resubmitted until all grades are present.
  const missingKeys=new Set(missing.map(x=>x.phase+":"+x.id));
  let invalidCount=0;
  for(const [key,{score,row,hint}] of scoreFields){
   // Unscored indicators with a frozen cap of zero are not required.
   const invalid=!score.disabled&&!score.checkValidity();
   const absent=missingKeys.has(key);
   const attention=invalid||absent;
   if(invalid)invalidCount++;
   row.classList.toggle("score-needs-attention",attention);
   score.classList.toggle("score-needs-attention",attention);
   score.setAttribute("aria-invalid",attention?"true":"false");
   hint.hidden=!attention;
   hint.textContent=invalid?"علامة غير صالحة — صحح القيمة":"علامة مطلوبة — أدخل النقطة هنا";
  }
  send.disabled=missing.length>0||invalidCount>0;
  jumpToMissing.hidden=missing.length===0&&invalidCount===0;
  if(missing.length||invalidCount){
   progress.className="alert";
   progress.textContent="لا يمكن الإرسال النهائي بعد. علامات ناقصة: الحصة "+
    lessonMissing.length+"، المناقشة "+discussionMissing.length+
    (invalidCount?", وعلامات غير صالحة: "+invalidCount:"")+
    ". الخانات المعنية ملوّنة، ويمكن الانتقال إليها بالزر أدناه. "+
    "يظل حفظ المسودة الناقصة ممكنًا.";
  }else{
   progress.className="notice";
   progress.textContent="جميع العلامات المطلوبة مكتملة. يمكنك إرسال المساهمة؛ الملاحظات النصية اختيارية.";
  }
 };
 updateScoreProgress();
 attachVoiceDictation(card);
 save.addEventListener("click",()=>persist(false,save));
 send.addEventListener("click",()=>{
  if(confirm(submitted?"سيُسجل هذا كتعديل جديد على المساهمة المرسلة، وستُحفظ النسخة السابقة. هل تؤكد؟":"هل تؤكد إرسال مساهمتك؟ يمكنك تصحيحها لاحقًا قبل إغلاق المهمة."))persist(true,send);
 });
 logout.addEventListener("click",()=>{
  if(dirty&&!confirm("توجد تعديلات لم تُحفظ. هل تريد تسجيل الخروج؟"))return;
  clearVoiceDrafts();saveSession(null);mission=null;seat=null;payload=null;
  renderLogin();
 });
}
async function persist(finalize,button){
 if(busy)return;
 busy=true;
 const originalLabel=button?.textContent;
 if(button){button.disabled=true;button.textContent="جارٍ الحفظ...";}
 statusText("جارٍ الحفظ على الخادم...");
 try{
  // Re-check native input range validation before requesting the RPC.
  const fields=[...shell.querySelectorAll('.assessment input[type="number"]')];
  if(fields.some(x=>!x.checkValidity()))throw Error("تحقق من صحة العلامات وحدودها.");
  // The UI disables send for missing marks, but the check is repeated at the
  // action boundary. The database independently enforces the same invariant.
  if(finalize){
   const missing=missingMandatoryScores(payload.grading);
   if(missing.length)throw Error("لا يمكن الإرسال النهائي: "+
    missing.length+" علامة ناقصة. "+missing.map(x=>x.label).join("، "));
  }
  const next=await rpc("save_titularisation_member_contribution",{
   p_mission_id:requestedMission,p_seat_code:requestedSeat,
   p_payload:payload,p_submit:finalize
  });
  if(productionMember){
   if(!Number.isSafeInteger(next)||next!==contributionRevision+1)
    throw Error("تعذر تأكيد رقم المراجعة. حدّث مساهمتك قبل إعادة الحفظ.");
   contributionRevision=next;
  }
  dirty=false;submitted=finalize;
  if(finalize)renderEditor();
  else statusText("تم حفظ مسودة مساهمتك على الخادم بنجاح"+
   (productionMember?" — المراجعة "+contributionRevision:"")+".");
 }catch(error){statusText("فشل الحفظ: "+error.message,"error")}
 finally{
  busy=false;
  if(button?.isConnected){
   button.textContent=originalLabel;
   button.disabled=!finalize&&submitted;
  }
 }
}
async function load(){
 let saved;
 if(productionMember){
  const token=await ensureToken();
  const data=await request("/rest/v1/rpc/load_prod_titularisation_member",{
   method:"POST",body:{p_mission_id:requestedMission,p_seat_code:requestedSeat,p_token:token}});
  mission=data?.mission||null;seat=data?.seat||null;saved=data?.saved||null;
  contributionRevision=saved?.revision||0;
 }else{
  const [missions,seats,submissions]=await Promise.all([
   list("titularisation_missions",{id:"eq."+requestedMission},"id,title,rubric_id,rubric_profile,status,expires_at"),
   list("titularisation_seats",{mission_id:"eq."+requestedMission,seat_code:"eq."+requestedSeat},
    "seat_code,display_name,status,expires_at"),
   list("titularisation_contributions",{mission_id:"eq."+requestedMission,seat_code:"eq."+requestedSeat},
    "payload,status,revision,submitted_at")
  ]);
  mission=missions?.[0]||null;seat=seats?.[0]||null;
  saved=submissions?.[0]||null;
 }
 if(!mission||!seat||mission.status!=="draft"||seat.status!=="active")
  throw Error("لا توجد مهمة نشطة أو انتهت صلاحية الحساب.");
 if(mission.rubric_id===RUBRICS.analytical14.id&&mission.rubric_profile?.frozen!==true)
  throw Error("رئيس اللجنة لم يثبت أوزان المؤشرات الأربعة عشر بعد.");
 const grading=newDraft(mission.rubric_id);
 if(mission.rubric_id===RUBRICS.analytical14.id)
  grading.profile=structuredClone(mission.rubric_profile);
 payload=saved?.payload||{grading,notes:newNotes()};
 if(mission.rubric_id===RUBRICS.analytical14.id&&
  !sameWeightProfile(payload.grading.profile,mission.rubric_profile))
  throw Error("ملف أوزان المساهمة يختلف عن الملف المثبت للمهمة.");
 submitted=saved?.status==="submitted";dirty=false;
 renderEditor();
}
window.addEventListener("beforeunload",e=>{
 if(dirty){e.preventDefault();e.returnValue="";}
});
// Access key is in a URL fragment, never HTTP query/path/referrer.
// Remove it from visible browser history before any network request.
const fragment=new URLSearchParams(location.hash.replace(/^#/,""));
const inviteKey=fragment.get("access")||"";
if(inviteKey){
 history.replaceState(null,"",location.pathname+location.search);
}
async function begin(){
 if(!configured()){
  shell.replaceChildren(message("الرابط أو إعدادات خدمة اللجنة غير صحيحة. اتصل برئيس اللجنة.",true));
  return;
 }
 restoreSession();
 if(session){
  try{await load();return;}catch(_){saveSession(null)}
 }
 if(inviteKey&&productionMember){
  shell.replaceChildren(message("جارٍ التحقق من رابط اللجنة المباشر..."));
  saveSession({capability:inviteKey,mission_id:requestedMission,seat_code:requestedSeat});
  try{await load();return}
  catch(error){saveSession(null);renderLogin();statusText("تعذر استعمال الرابط: "+error.message);return}
 }
 if(inviteKey){
  shell.replaceChildren(message("جارٍ تسجيل الدخول من رابط الدعوة المباشر..."));
  try{
   const result=await request("/functions/v1/titularisation-access",{
    method:"POST",body:{
     action:"login_link",token:inviteKey,
     mission_id:requestedMission,seat_code:requestedSeat
    }});
   if(result.mission_id!==requestedMission||result.seat_code!==requestedSeat)
    throw Error("رابط الدعوة لا يخص هذا المقعد.");
   saveSession({...result,expires_at_ms:Date.now()+1000*(Number(result.expires_in)||3600)});
   await load();return;
  }catch(error){
   saveSession(null);renderLogin();
   statusText("تعذر الدخول من الرابط المباشر: "+error.message+
    ". اطلب من رئيس اللجنة إصدار رابط جديد أو استخدم بيانات الدخول.");
   return;
  }
 }
 renderLogin();
}
begin();
