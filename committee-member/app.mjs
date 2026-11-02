// M5.1 — separate, seat-scoped inspector-committee contributor interface.
// Public HTML is not an authorization boundary; Supabase RLS and authenticated
// RPC enforce the permission for EACH contribution and read.
import {RUBRICS,DISCUSSION,newDraft,lessonItems,withScore} from "../prototypes/titularisation-workbench/engine.mjs";
import {attachVoiceDictation,dismissVoiceDictation,clearVoiceDrafts} from "../shared/voice-dictation.mjs";
const cfg=window.REPORT03_CLOUD_CONFIG||{};
const base=String(cfg.supabaseUrl||"").replace(/\/+$/,"");
const key=String(cfg.publishableKey||"");
const shell=document.getElementById("member-app");
const params=new URLSearchParams(location.search);
const requestedMission=params.get("mission")||"";
const requestedSeat=params.get("seat")||"";
const allowedSeats=new Set(["member1","member2","member3"]);
const storageKey="titularisation_member_session_v1_"+(base.match(/^https:\/\/([^.]+)/)?.[1]||"unconfigured");
let session=null,mission=null,seat=null,payload=null,submitted=false,dirty=false,busy=false;
const el=(tag,content="")=>{const e=document.createElement(tag);e.textContent=content;return e};
const label=(title,node)=>{const wrap=el("label");wrap.append(el("span",title),node);return wrap};
const statusText=(message)=>{
 const node=document.getElementById("member-status");
 if(node)node.textContent=message;
};
function configured(){
 return cfg.temporaryCommitteeEnabled===true&&/^https:\/\//.test(base)&&key.length>20&&
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
  if(raw?.access_token&&raw?.refresh_token&&raw.mission_id===requestedMission&&
   raw.seat_code===requestedSeat)session=raw;
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
 const n=el("p",text);n.className=alert?"alert":"notice";n.id="member-status";
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
function addScoreField(area,phase,item){
 const row=el("div");row.className="assessment";
 const score=el("input");score.type="number";score.min="0";score.max=String(item.cap);
 score.step="0.5";score.inputMode="decimal";
 score.value=payload.grading.scores[phase][item.id]??"";
 score.setAttribute("aria-label","علامة: "+item.label);
 const note=el("textarea");note.rows=3;note.maxLength=5000;
 note.placeholder="تقدير مختصر يتعلق بهذا المؤشر";
 note.dataset.voiceKey=[requestedMission,requestedSeat,phase,item.id].join("|");
 note.value=payload.notes[phase][item.id]||"";
 score.addEventListener("change",()=>{
  try{
   payload.grading=withScore(payload.grading,phase,item.id,score.value);
   dirty=true;statusText("توجد تعديلات غير محفوظة.");
   score.setCustomValidity("");
  }catch(error){score.setCustomValidity(error.message);score.reportValidity()}
 });
 note.addEventListener("change",()=>{
  payload.notes[phase][item.id]=note.value;dirty=true;
  statusText("توجد تعديلات غير محفوظة.");
 });
 row.append(el("strong",item.label+" (من "+item.cap+")"),label("العلامة",score),
  label("الملاحظة",note));
 area.append(row);
}
function renderEditor(){
 dismissVoiceDictation();
 shell.replaceChildren(header());
 const card=el("section");card.className="card";
 card.append(el("h2","تقدير الأداء المهني"),
  el("p","هذه مساهمتك أنت فقط. يستطيع رئيس اللجنة الاطلاع عليها بعد حفظها. لا تتغير مساهمات بقية الأعضاء."));
 if(submitted){
  card.append(message("أُرسلت مساهمتك بنجاح. النص والعلامات للقراءة فقط، ولا يمكنك تعديلها من هذا الحساب."));
 }
 for(const [phase,title,rows] of [
  ["lesson","تقييم الحصة التدريسية",lessonItems(payload.grading)],
  ["discussion","تقييم المناقشة",DISCUSSION]]){
  const group=el("details");group.open=true;
  group.append(el("summary",title));
  const grid=el("div");grid.className="assessments";
  for(const item of rows)addScoreField(grid,phase,item);
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
 const send=el("button","إرسال المساهمة نهائيًا");send.type="button";
 send.className="primary";
 const logout=el("button","تسجيل الخروج");logout.type="button";
 bar.append(save,send,logout);
 card.append(bar,message("احتفظ بمسودتك محفوظة قبل مغادرة الصفحة."));
 shell.append(card);
 for(const area of shell.querySelectorAll("textarea")){
  if(submitted)area.disabled=true;
 }
 for(const input of shell.querySelectorAll('input[type="number"]'))if(submitted)input.disabled=true;
 save.disabled=submitted;send.disabled=submitted;
 attachVoiceDictation(card);
 save.addEventListener("click",()=>persist(false));
 send.addEventListener("click",()=>{
  if(confirm("هل تؤكد إرسال المساهمة نهائيًا؟ لن تتمكن من تعديلها بعد ذلك."))persist(true);
 });
 logout.addEventListener("click",()=>{
  if(dirty&&!confirm("توجد تعديلات لم تُحفظ. هل تريد تسجيل الخروج؟"))return;
  clearVoiceDrafts();saveSession(null);mission=null;seat=null;payload=null;
  renderLogin();
 });
}
async function persist(finalize){
 if(busy||submitted)return;
 busy=true;statusText("جارٍ الحفظ على الخادم...");
 try{
  // Re-check native input range validation before requesting the RPC.
  const fields=[...shell.querySelectorAll('input[type="number"]')];
  if(fields.some(x=>!x.checkValidity()))throw Error("تحقق من صحة العلامات وحدودها.");
  await rpc("save_titularisation_member_contribution",{
   p_mission_id:requestedMission,p_seat_code:requestedSeat,
   p_payload:payload,p_submit:finalize
  });
  dirty=false;submitted=finalize;
  if(finalize)renderEditor();
  else statusText("حُفظت مساهمتك على الخادم.");
 }catch(error){statusText("فشل الحفظ: "+error.message)}
 finally{busy=false}
}
async function load(){
 const [missions,seats,submissions]=await Promise.all([
  list("titularisation_missions",{id:"eq."+requestedMission},"id,title,rubric_id,status,expires_at"),
  list("titularisation_seats",{mission_id:"eq."+requestedMission,seat_code:"eq."+requestedSeat},
   "seat_code,display_name,status,expires_at"),
  list("titularisation_contributions",{mission_id:"eq."+requestedMission,seat_code:"eq."+requestedSeat},
   "payload,status,revision,submitted_at")
 ]);
 mission=missions?.[0]||null;seat=seats?.[0]||null;
 if(!mission||!seat||mission.status!=="draft"||seat.status!=="active")
  throw Error("لا توجد مهمة نشطة أو انتهت صلاحية الحساب.");
 const saved=submissions?.[0]||null;
 payload=saved?.payload||{grading:newDraft(mission.rubric_id),notes:newNotes()};
 submitted=saved?.status==="submitted";dirty=false;
 renderEditor();
}
window.addEventListener("beforeunload",e=>{
 if(dirty){e.preventDefault();e.returnValue="";}
});
if(!configured()){
 shell.replaceChildren(message("الرابط أو إعدادات خدمة اللجنة غير صحيحة. اتصل برئيس اللجنة.",true));
}else{
 restoreSession();
 if(session)load().catch(error=>{
  saveSession(null);renderLogin();statusText(error.message);
 });
 else renderLogin();
}
