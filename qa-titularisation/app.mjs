/* Isolated synthetic-data QA launcher, NEVER reuse the production session.
 * All access is restricted by Supabase Auth and database RLS.
 * Public publishable key only; no browser service-role key and no password persistence.
 */
import {qrCanvas,downloadInvitationPdf} from "./invitation-pdf.mjs";
import {GROUPS,suggestedWeights,validateWeights} from "../prototypes/titularisation-workbench/engine.mjs";
const config=window.REPORT03_CLOUD_CONFIG||{};
const base=String(config.supabaseUrl||"").replace(/\/+$/,"");
const publicKey=String(config.publishableKey||"");
const TOKEN_KEY="scientifica_committee_qa_session_v1";
const root=document.getElementById("qa-app");
const seats=["member1","member2","member3"];
const seatNames={member1:"العضو الأول",member2:"العضو الثاني",member3:"العضو الثالث"};
let session=null,profile=null,missions=[],selected="",seatRows=[],contributions=[],issued=null,busy=false;
let flash="",flashError=false;
const element=(tag,text="",cls="")=>{
 const x=document.createElement(tag);if(text)x.textContent=text;if(cls)x.className=cls;return x;
};
const button=(title,handler,cls="")=>{
 const x=element("button",title,cls);x.type="button";x.disabled=busy;
 x.addEventListener("click",()=>run(handler,x));return x;
};
const field=(labelText,input)=>{
 const x=element("label","", "field");x.append(element("span",labelText),input);return x;
};
const input=(type,placeholder="")=>{
 const x=document.createElement("input");x.type=type;x.placeholder=placeholder;return x;
};
const notice=(text,cls="notice")=>element("p",text,cls);
const wrapper=(heading)=>{
 const box=element("section","","card");box.append(element("h2",heading));return box;
};
function announce(text,isError=false){flash=text;flashError=isError}
function saveSession(next){
 session=next;
 try{if(next)sessionStorage.setItem(TOKEN_KEY,JSON.stringify(next));
 else sessionStorage.removeItem(TOKEN_KEY);}catch(_){}
}
async function request(path,{method="GET",body=undefined,auth=false}={}){
 if(!base.startsWith("https://")||!publicKey.startsWith("sb_publishable_")||config.qaOnly!==true)
  throw Error("إعدادات مشروع الاختبار غير مكتملة.");
 const headers={apikey:publicKey,Accept:"application/json"};
 if(body!==undefined)headers["Content-Type"]="application/json";
 if(auth)headers.Authorization="Bearer "+await accessToken();
 const response=await fetch(base+path,{method,headers,
  body:body===undefined?undefined:JSON.stringify(body),cache:"no-store",referrerPolicy:"no-referrer"});
 let data=null;const raw=await response.text();
 try{data=raw?JSON.parse(raw):null}catch(_){}
 if(!response.ok)throw Error(String(data?.error_description||data?.msg||data?.error||data?.message||"فشل اتصال الخادم")+" ("+response.status+")");
 return data;
}
async function accessToken(){
 if(!session?.refresh_token)throw Error("يجب تسجيل الدخول بحساب مفتش الاختبار.");
 if((session.expiresAt||0)>Date.now()+60000)return session.access_token;
 const next=await request("/auth/v1/token?grant_type=refresh_token",{
  method:"POST",body:{refresh_token:session.refresh_token}
 });
 if(!next?.access_token||!next?.refresh_token)throw Error("انتهت صلاحية حساب الاختبار؛ سجل الدخول مجددًا.");
 saveSession({...session,access_token:next.access_token,refresh_token:next.refresh_token,
  expiresAt:Date.now()+1000*Number(next.expires_in||3600)});
 return session.access_token;
}
async function rows(table,filters={}){
 const query=new URLSearchParams(filters);
 return request("/rest/v1/"+table+"?"+query.toString(),{auth:true});
}
async function rpc(name,body){
 return request("/rest/v1/rpc/"+name,{method:"POST",body,auth:true});
}
async function edge(action,body){
 return request("/functions/v1/titularisation-access",{method:"POST",
  body:{action,...body},auth:true});
}
async function run(fn,control){
 if(busy)return;
 busy=true;if(control)control.disabled=true;
 try{await fn()}catch(err){announce(err?.message||"تعذر تنفيذ العملية.",true)}
 finally{busy=false;render()}
}
function render(){
 root.replaceChildren();
 if(flash){root.append(notice(flash,flashError?"notice error":"notice success"));flash="";flashError=false}
 if(!session||!profile){renderLogin();return;}
 renderDashboard();
}
// Main and QA are two separate Auth issuers: a verified primary access token
// is exchanged server-side for an independent, short-lived QA identity/session.
// Never pass the primary refresh token or password to the QA Edge Function.
const MAIN_SESSION_KEY="official_report03_cloud_session_v1";
function activePrimarySession(){
 let stored=null;
 try{stored=localStorage.getItem(MAIN_SESSION_KEY)||
   sessionStorage.getItem(MAIN_SESSION_KEY)}catch(_){}
 try{
  const item=JSON.parse(stored||"null");
  if(item?.access_token&&item?.user?.id&&
    (item.expires_at_ms||0)>Date.now()+60000)return item.access_token;
 }catch(_){}
 return null;
}
async function primaryPasswordToken(email,password){
 const endpoint=config.primarySupabaseUrl;
 const key=config.primaryPublishableKey;
 if(endpoint!=="https://uxtsyzyotnohxvopgcmh.supabase.co"||
    !key?.startsWith("sb_publishable_"))throw Error("إعدادات حساب المنصة الرئيسية غير صالحة.");
 const response=await fetch(endpoint+"/auth/v1/token?grant_type=password",{
  method:"POST",headers:{apikey:key,"Content-Type":"application/json"},
  body:JSON.stringify({email,password}),cache:"no-store",referrerPolicy:"no-referrer"
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.access_token)
  throw Error("تعذر تسجيل الدخول إلى المنصة الرئيسية. تحقق من البريد وكلمة المرور.");
 return result.access_token;
}
async function loginApprovedPrimary(token){
 const result=await request("/functions/v1/titularisation-access",{
  method:"POST",body:{action:"federated_inspector_login",production_access_token:token}
 });
 if(!result?.access_token||!result?.refresh_token||!result?.user?.id)
  throw Error("لم تُصدر QA جلسة مصادقة مستقلة.");
 saveSession({access_token:result.access_token,refresh_token:result.refresh_token,
  expiresAt:Date.now()+Number(result.expires_in||3600)*1000,userId:result.user.id});
 try{
  await refreshProfile();
  if(!profile?.approved||profile.account_status!=="approved")
   throw Error("الحساب غير معتمد في QA.");
  await refreshData();
 }catch(error){saveSession(null);profile=null;throw error}
 announce("تم الدخول بحساب المفتش المعتمد في المنصة الرئيسية؛ بيانات مهام QA مستقلة.");
}
function renderLogin(){
 const primary=wrapper("الدخول بحساب المفتش المعتمد في المنصة الرئيسية");
 primary.append(notice("خاص بمفتش التكوين والتعليم المهنيين أو المفتش التقني والبيداغوجي المعتمد. لا حاجة إلى حساب اختبار ثانٍ، وتظل المهام في QA مستقلة عن الإنتاج."));
 const originalSession=activePrimarySession();
 const oneClick=element("button","دخول مباشر بحسابي المفتوح في المنصة الرئيسية","primary");
 oneClick.type="button";
 oneClick.disabled=!originalSession;
 oneClick.addEventListener("click",()=>run(async()=>{
  const token=activePrimarySession();
  if(!token)throw Error("انتهت جلسة المنصة الرئيسية. سجّل الدخول إليها مجددًا أو استخدم النموذج أدناه.");
  await loginApprovedPrimary(token);
 },oneClick));
 primary.append(oneClick);
 if(!originalSession)primary.append(notice("لا توجد جلسة نشطة للمنصة الرئيسية في هذا المتصفح. يمكنك استخدام بيانات دخولها أدناه أو تسجيل الدخول إليها أولًا.","hint"));
 const primaryForm=element("form");
 const pEmail=input("email","البريد الإلكتروني المسجل في المنصة الرئيسية");
 pEmail.required=true;pEmail.autocomplete="username";pEmail.dir="ltr";
 const pPassword=input("password","كلمة مرور المنصة الرئيسية");
 pPassword.required=true;pPassword.autocomplete="current-password";
 const pSubmit=element("button","التحقق والدخول إلى QA");pSubmit.type="submit";
 primaryForm.append(field("البريد الإلكتروني",pEmail),field("كلمة المرور",pPassword),pSubmit);
 primaryForm.addEventListener("submit",async event=>{
  event.preventDefault();if(busy)return;
  busy=true;pSubmit.disabled=true;
  try{
   const token=await primaryPasswordToken(pEmail.value.trim(),pPassword.value);
   pPassword.value="";
   await loginApprovedPrimary(token);
  }catch(error){
   pPassword.value="";saveSession(null);profile=null;
   announce(error?.message||"فشل الدخول بالحساب المعتمد.",true);
  }finally{busy=false;render()}
 });
 primary.append(primaryForm);
 root.append(primary);
 const card=wrapper("الدخول بالحساب التجريبي السابق (للتوافق)");
 card.append(notice("للاستمرار في المهمة التجريبية القديمة يمكنك استخدام حساب QA السابق. أما الحساب المعتمد من المنصة الرئيسية فله نموذج مستقل أعلاه."));
 const form=element("form");
 const email=input("email","بريد المفتش التجريبي");
 email.required=true;email.autocomplete="username";email.dir="ltr";
 const password=input("password","كلمة مرور حساب الاختبار");
 password.required=true;password.autocomplete="current-password";
 const submit=element("button","تسجيل الدخول","primary");submit.type="submit";
 form.append(field("البريد الإلكتروني التجريبي",email),field("كلمة المرور",password),submit);
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(busy)return;busy=true;submit.disabled=true;
  try{
   const result=await request("/auth/v1/token?grant_type=password",{
    method:"POST",body:{email:email.value.trim(),password:password.value}
   });
   password.value="";
   if(!result?.access_token||!result?.refresh_token||!result?.user?.id)
    throw Error("لم يُرجع الخادم جلسة صالحة.");
   saveSession({access_token:result.access_token,refresh_token:result.refresh_token,
    expiresAt:Date.now()+Number(result.expires_in||3600)*1000,userId:result.user.id});
   await refreshProfile();
   if(!profile?.approved||profile.account_status!=="approved"){
    saveSession(null);profile=null;throw Error("هذا الحساب ليس مفتشًا معتمدًا داخل مشروع الاختبار.");
   }
   await refreshData();
   announce("دخلت إلى مختبر لجنة الترسيم بحساب مفتش معتمد.");
  }catch(err){password.value="";announce(err?.message||"فشل تسجيل الدخول.",true);saveSession(null);profile=null}
  finally{busy=false;render()}
 });
 card.append(form);root.append(card);
}
async function refreshProfile(){
 if(!session?.userId){profile=null;return;}
 const list=await rows("inspector_profiles",{
  select:"id,approved,account_status,is_admin",id:"eq."+session.userId
 });
 profile=list?.[0]||null;
}
async function refreshData(){
 missions=await rows("titularisation_missions",{
  select:"id,title,rubric_id,rubric_profile,status,expires_at,created_at",order:"created_at.desc",limit:"100"
 });
 if(!missions.some(m=>m.id===selected))selected=missions[0]?.id||"";
 await refreshDetails();
}
async function refreshDetails(){
 if(!selected){seatRows=[];contributions=[];return;}
 const [sr,cr]=await Promise.all([
  rows("titularisation_seats",{select:"seat_code,display_name,status,username,expires_at",
   mission_id:"eq."+selected,order:"seat_code.asc"}),
  rows("titularisation_contributions",{
   select:"seat_code,status,revision,submitted_at",
   mission_id:"eq."+selected,order:"seat_code.asc"})
 ]);
 seatRows=sr||[];contributions=cr||[];
}
function renderAnalyticalWeights(parent,mission){
 const card=element("section","","card");
 card.append(element("h3","ملف أوزان المؤشرات الأربعة عشر"));
 if(mission.rubric_profile?.frozen){
  card.append(notice("أوزان المهمة مثبتة نهائيًا قبل إصدار دعوات الأعضاء. تُستخدم هذه الأوزان نفسها للتنقيط والتحقق الخادمي.","notice success"));
  for(const group of GROUPS){
   const weights=group.items.map(i=>i.label+": "+mission.rubric_profile.weights[i.id]).join(" · ");
   card.append(element("p",group.label+" ("+group.cap+" نقاط): "+weights,"hint"));
  }
  parent.append(card);return;
 }
 card.append(notice("ثبت الأوزان مرة واحدة قبل منح أي رابط. مجموع كل مجموعة يجب أن يطابق سقفها (12، 8، 8، 6، 6). الأوزان الافتراضية مقترحة وليست اعتمادًا رسميًا."));
 const defaults=suggestedWeights(),inputs={};
 for(const group of GROUPS){
  const details=element("details");details.open=true;
  details.append(element("summary",group.label+" — المجموع "+group.cap));
  const grid=element("div","","fields");
  for(const item of group.items){
   const fieldInput=input("number");fieldInput.min="0";fieldInput.max=String(group.cap);
   fieldInput.step="0.5";fieldInput.value=String(defaults[item.id]);
   inputs[item.id]=fieldInput;
   grid.append(field(item.label,fieldInput));
  }
  details.append(grid);card.append(details);
 }
 card.append(button("تثبيت أوزان المهمة وفتح إصدار دعوات الأعضاء",async()=>{
  const weights={};for(const [id,inp] of Object.entries(inputs)){
   if(inp.value.trim()==="")throw Error("يجب إدخال وزن لكل مؤشر.");
   weights[id]=Number(inp.value);
  }
  const result=validateWeights(weights);
  if(!result.valid)throw Error(result.errors.join("؛ "));
  if(!confirm("بعد التثبيت لن تتمكن من تغيير الأوزان في هذه المهمة. هل تؤكد؟"))return;
  await rpc("freeze_titularisation_analytical_weights",{
   p_mission_id:mission.id,p_weights:weights
  });
  issued=null;await refreshData();announce("ثُبتت الأوزان على الخادم؛ يمكن الآن إصدار الحسابات.");
 },"primary"));
 parent.append(card);
}
// New invitations are generated only for EXISTING ACTIVE seats: never
// create a new Auth user, never clear grades or modify contributions.
async function refreshExistingSeatInvitations(missionId){
 const activeSeats=seatRows.filter(s=>s.status==="active");
 const successful=[],failed=[];
 for(const seat of activeSeats){
  try{
   await edge("renew_week_link",{mission_id:missionId,seat_code:seat.seat_code});
   successful.push(seat.seat_code);
  }catch(error){
   failed.push({seat:seat.seat_code,error:error?.message||"تعذر إصدار الرابط"});
  }
 }
 return {successful,failed};
}
function renewalSummary(renewal){
 const done=renewal.successful.length,failed=renewal.failed.length;
 if(!failed)return "جُدّدت روابط "+done+" حساب/حسابات نشطة لمدة تصل إلى 7 أيام. افتح بطاقة العضو لعرض الرابط وQR وPDF.";
 return "جُدّدت روابط "+done+"، وتعذّر تجديد روابط "+
  renewal.failed.map(x=>seatNames[x.seat]).join("، ")+
  ". مدة المهمة محفوظة؛ استخدم زر «تجديد روابط الأعضاء فقط» لإعادة المحاولة، دون تمديد إضافي.";
}
function renderDashboard(){
 const greeting=wrapper("رئيس اللجنة — مختبر الحسابات المؤقتة");
 greeting.append(notice("هذه البيئة مستقلة عن قاعدة الإنتاج. العمليات التي تنفذها هنا تخص بيانات اختبار اصطناعية فقط."));
 greeting.append(element("p","تم التحقق من صفة المفتش المعتمد في مشروع الاختبار."));
 const row=element("div","","actions");
 row.append(button("تحديث البيانات",async()=>{issued=null;await refreshData();announce("تم تحديث بيانات المهمة.");}),
 button("تسجيل الخروج",async()=>{
  try{await request("/auth/v1/logout",{method:"POST",auth:true})}catch(_){}
  saveSession(null);profile=null;selected="";missions=[];seatRows=[];contributions=[];issued=null;
  announce("انتهت جلسة المختبر.");
 }));
 greeting.append(row);root.append(greeting);

 const create=wrapper("إنشاء مهمة ترسيم تجريبية");
 create.append(notice("يدعم المختبر شبكات 5 معايير و10 عناصر و14 مؤشرًا. الأوزان للـ14 مؤشرًا يحددها المفتش ويثبتها قبل الدعوات. هذه تجربة تقنية وليست اعتمادًا رسميًا؛ لا تستخدم بيانات ترسيم حقيقية."));
 const form=element("form"),fields=element("div","","fields");
 const title=input("text","مثال: اختبار لجنة رقم 01");title.required=true;title.minLength=3;title.maxLength=200;
 const rubric=element("select");for(const [value,label] of [
  ["lesson_grouped_5_v1","الخمسة معايير — اختبار تقني"],
  ["lesson_inspector_10_v1","العشرة عناصر — اختبار تقني"],
  ["lesson_derived_indicators_v1","المؤشرات الأربعة عشر — ملف أوزان يثبته المفتش"]]){
  const o=element("option",label);o.value=value;rubric.append(o);
 }
 const hours=input("number");hours.min="1";hours.max="720";hours.value="24";hours.required=true;
 fields.append(field("عنوان الاختبار",title),field("شبكة التقييم",rubric),field("مدة الحسابات (ساعة)",hours));
 const submit=element("button","إنشاء المهمة والمقاعد الثلاثة","primary");submit.type="submit";
 form.append(fields,submit);
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(busy)return;busy=true;submit.disabled=true;
  try{
   const data=await rpc("create_titularisation_mission",{
    p_title:title.value.trim(),p_rubric_id:rubric.value,p_expiry_hours:Number(hours.value)
   });
   if(typeof data!=="string"||!data.includes("-"))throw Error("لم يعُد معرّف المهمة من الخادم.");
   selected=data;issued=null;await refreshData();
   announce("أُنشئت مهمة الاختبار مع ثلاثة مقاعد مستقلة.");
  }catch(err){announce(err?.message||"تعذر إنشاء المهمة.",true)}
  finally{busy=false;render()}
 });
 create.append(form);root.append(create);

 const choose=wrapper("متابعة المهمة");
 if(!missions.length){choose.append(notice("لا توجد مهام بعد. أنشئ مهمة اختبار باستخدام النموذج أعلاه."));root.append(choose);return;}
 const select=element("select");
 for(const m of missions){
  const opt=element("option",m.title+" — "+(m.status==="draft"?"جارية":"مغلقة"));
  opt.value=m.id;opt.selected=m.id===selected;select.append(opt);
 }
 select.addEventListener("change",async()=>{
  selected=select.value;issued=null;
  try{await refreshDetails();announce("تم اختيار المهمة.");}catch(e){announce(e.message,true)}
  render();
 });
 choose.append(field("مهمة لجنة الترسيم",select));
 const mission=missions.find(m=>m.id===selected);
 if(mission){
  choose.append(element("p","الحالة: "+(mission.status==="draft"?"جارية":"مغلقة")+
  " · نهاية صلاحية المهمة: "+new Date(mission.expires_at).toLocaleString("ar-DZ")));
  const validUntil=new Date(mission.expires_at);
  const active=mission.status==="draft"&&validUntil.getTime()>Date.now();
  if(mission.status==="draft"){
   if(!active)choose.append(notice("انتهت مدة المهمة، لكن الحسابات والمساهمات ما زالت محفوظة. يمكنك تمديدها 7 أيام من هنا.","notice"));
   const renewActions=element("div","","actions");
   renewActions.append(button("تمديد المهمة 7 أيام وتجديد روابط الأعضاء",async()=>{
    if(!confirm("سيتم تمديد المهمة 7 أيام وتحديث صلاحية حسابات الأعضاء النشطة، ثم استبدال روابط دخولهم القديمة بروابط جديدة. لن تتغير العلامات والملاحظات والمساهمات. هل تؤكد؟"))return;
    const missionId=selected;
    // Server authorizes this under signed inspector ownership, records the
    // renewal, rejects closed missions and caps overall age at 30 days.
    const expiry=await rpc("extend_titularisation_qa_mission_7_days",{
     p_mission_id:missionId
    });
    issued=null;
    const renewal=await refreshExistingSeatInvitations(missionId);
    await refreshData();
    announce("امتدت المهمة حتى "+new Date(expiry).toLocaleString("ar-DZ")+
     ". "+renewalSummary(renewal),renewal.failed.length>0);
   },"primary"));
   if(active&&seatRows.some(s=>s.status==="active")){
    renewActions.append(button("تجديد روابط الأعضاء فقط دون تمديد إضافي",async()=>{
     if(!confirm("سيتم استبدال روابط الدخول السابقة للأعضاء النشطين، مع الاحتفاظ بمساهماتهم. هل تؤكد؟"))return;
     const missionId=selected;
     issued=null;
     const renewal=await refreshExistingSeatInvitations(missionId);
     await refreshData();
     announce(renewalSummary(renewal),renewal.failed.length>0);
    }));
   }
   choose.append(renewActions);
   choose.append(notice("يمكن تمديد المهمة المفتوحة فقط، بحد أقصى 30 يومًا منذ إنشائها. الحسابات الملغاة لا تُفعّل من جديد، والروابط القديمة لا تُستعاد."));
  }
  const ready=mission.rubric_id!=="lesson_derived_indicators_v1"||
    mission.rubric_profile?.frozen===true;
  if(mission.rubric_id==="lesson_derived_indicators_v1")
   renderAnalyticalWeights(choose,mission);
  if(!ready)choose.append(notice("أكمل تثبيت الأوزان أولًا. لن تُنشأ حسابات قبل ذلك.","notice error"));
  const report=element("a","فتح محرر التقرير والمحضر واستيراد المساهمات المحفوظة");
  report.href="./report/?mission="+encodeURIComponent(selected);
  report.className="primary";report.style.cssText="display:inline-block;padding:12px;margin:10px 0";
  choose.append(report);
  // Same accepted editor at its original URL, explicitly opted in to QA.
  // Navigation stays in this tab so the inspector's sessionStorage is available.
  const legacyLinked=element("a","فتح المحرر الأصلي مرتبطًا بهذه المهمة واستدعاء المساهمات");
  legacyLinked.href="../prototypes/titularisation-committee/?qa=1&mission="+encodeURIComponent(selected);
  legacyLinked.style.cssText="display:inline-block;padding:12px;margin:10px 0";
  choose.append(legacyLinked);
  if(issued?.mission_id===selected)renderIssued(choose);
  const seatsWrap=element("div","","seats");
  for(const code of seats){
   const data=seatRows.find(s=>s.seat_code===code)||{seat_code:code,status:"vacant"};
   const c=contributions.find(x=>x.seat_code===code);
   const card=element("div","","seat");
   card.append(element("h3",seatNames[code]));
   card.append(notice("الحساب: "+({vacant:"غير مُصدر",active:"نشط",revoked:"ملغى"})[data.status],"status"));
   card.append(element("p","المساهمة: "+(c?.status==="submitted"?"مرسلة نهائيًا":c?.status==="draft"?"مسودة":"غير موجودة")));
   if(data.username){
    const details=element("details");
    details.append(element("summary","معلومات حساب العضو (بديل اختياري)"),
      element("p","اسم المستخدم: "+data.username),
      element("p","كلمة المرور السابقة لا يمكن استرجاعها لأسباب أمنية؛ استخدم زر تغيير كلمة المرور عند الحاجة."));
    card.append(details);
   }
   const actions=element("div","","actions");
   if(active&&ready&&data.status!=="active"&&c?.status!=="submitted"){
    const name=input("text","اسم اختباري اختياري");name.maxLength=160;
    card.append(field("اسم العرض",name));
    actions.append(button("إنشاء رابط مباشر للعضو (دون كلمة مرور)",async()=>{
     issued=await edge("issue_direct",{mission_id:selected,seat_code:code,display_name:name.value.trim()});
     await refreshData();announce("صدر رابط مباشر للعضو دون اسم مستخدم أو كلمة مرور.");
    },"primary"));
    actions.append(button("إصدار حساب بكلمة مرور (بديل اختياري)",async()=>{
     issued=await edge("issue",{mission_id:selected,seat_code:code,display_name:name.value.trim()});
     await refreshData();announce("صدرت بيانات دخول مختصرة للعضو.");
    }));
   }
   if(active&&ready&&data.status==="active"){
    actions.append(button("عرض رابط الدخول المحفوظ + QR + PDF",async()=>{
     issued=await edge("get_saved_link",{mission_id:selected,seat_code:code});
     await refreshData();
     announce("استُعيد نفس الرابط المحفوظ لهذا العضو دون تغيير كلمة المرور أو إلغاء الرابط السابق.");
    },"primary"));
    actions.append(button("توليد رابط مباشر جديد (يلغي السابق)",async()=>{
     if(!confirm("سيُنشأ رابط مباشر خاص بهذا العضو، ويُلغى تلقائيًا أي رابط مباشر سابق لهذا المقعد. هل تتابع؟"))return;
     issued=await edge("issue_link",{mission_id:selected,seat_code:code});
     await refreshData();announce("أُصدر رابط مباشر قابل للإلغاء للمقعد "+seatNames[code]+".");
    },"primary"));
    actions.append(button("تغيير كلمة المرور",async()=>{
     if(!confirm("هل تؤكد تغيير كلمة مرور هذا العضو؟"))return;
     issued=await edge("rotate",{mission_id:selected,seat_code:code});
     issued.mission_id=selected;
     await refreshData();announce("صدرت كلمة مرور جديدة؛ اعرضها للعضو.");
    }));
   }
   if(data.status==="active"||data.status==="revoked"){
    actions.append(button("إلغاء الحساب وحذفه",async()=>{
     if(!confirm("سيُلغى وصول هذا العضو، مع الاحتفاظ بمساهمته السابقة. متابعة؟"))return;
     const result=await edge("revoke",{mission_id:selected,seat_code:code});
     issued=null;await refreshData();
     announce(result?.account_deleted?"أُلغي الحساب وحُذفت بيانات دخوله، وبقيت المساهمة.":"أُلغي الوصول؛ فحص حذف بيانات الدخول يحتاج متابعة.",!result?.account_deleted);
    },"danger"));
   }
   card.append(actions);seatsWrap.append(card);
  }
  choose.append(seatsWrap);
  if(active)choose.append(button("إغلاق المهمة وإلغاء الوصول إلى المقاعد",async()=>{
   if(!confirm("إغلاق المهمة سيمنع الأعضاء من التعديل. هل تؤكد؟"))return;
   await rpc("close_titularisation_mission",{p_mission_id:selected});
   issued=null;await refreshData();announce("أُغلقت المهمة. يمكن الآن إزالة حسابات الأعضاء.");
  },"danger"));
 }
 root.append(choose);
}
function renderIssued(parent){
 const box=element("div","","secret");box.setAttribute("role","status");
 const code=issued.seat_code,seat=seatNames[code]||code;
 const isDirect=!!issued.link&&!issued.password;
 box.append(element("strong",isDirect?
  (issued.recovered?"رابط الدخول المحفوظ — مستعاد من الخادم":"رابط مباشر خاص بالعضو — لا يحتاج اسم مستخدم أو كلمة مرور"):
  "بيانات دخول تظهر مرة واحدة — سلّمها للعضو"));
 box.append(element("p","المقعد: "+seat));
 let url;
 if(isDirect){
  url=issued.link;
  box.append(notice("من يمتلك هذا الرابط يستطيع فتح المساهمة. أرسله للعضو مباشرة، ولا تنشره علنًا. يمكن إصدار رابط جديد لإبطال القديم، كما يتوقف الوصول عند إلغاء الحساب أو إغلاق المهمة.","notice"));
  box.append(element("p","ينتهي الرابط: "+new Date(issued.expires_at).toLocaleString("ar-DZ")));
 }else{
  url=new URL("./member/?mission="+encodeURIComponent(selected)+"&seat="+encodeURIComponent(code),location.href).href;
  box.append(element("p","اسم المستخدم: "+(issued.username||"")));
  box.append(element("p","كلمة المرور: "+(issued.password||"")));
 }
 const link=element("a","افتح رابط مساهمة العضو");
 link.href=url;link.target="_blank";link.rel="noopener noreferrer";
 box.append(element("p","الرابط المكتوب: "),link);
 if(isDirect){
  const text=element("p",url,"code");text.dir="ltr";box.append(text);
  const qr=qrCanvas(url,360);
  qr.setAttribute("role","img");qr.setAttribute("aria-label","رمز QR للدخول المباشر إلى المقعد");
  qr.style.cssText="display:block;max-width:100%;height:auto;margin:12px auto;background:white;border:8px solid white";
  box.append(qr);
 }
 const actions=element("div","","actions");
 actions.append(button(isDirect?"نسخ الرابط المباشر":"نسخ بيانات الدخول",async()=>{
  const clipboard=isDirect?url:
   "رابط العضو: "+url+"\nاسم المستخدم: "+issued.username+"\nكلمة المرور: "+issued.password;
  if(!navigator.clipboard?.writeText)throw Error("النسخ غير مدعوم.");
  await navigator.clipboard.writeText(clipboard);
  announce("تم نسخ بيانات العضو.");
 }));
 if(isDirect)actions.append(button("تنزيل بطاقة PDF (QR + رابط قابل للنقر)",async()=>{
  const title=missions.find(m=>m.id===selected)?.title||"لجنة الترسيم";
  downloadInvitationPdf({url,title,seat,expiresAt:issued.expires_at});
  announce("تم إعداد بطاقة الدعوة PDF محليًا في متصفحك.");
 },"primary"));
 actions.append(button("إخفاء بيانات الدعوة من الشاشة",async()=>{
  issued=null;announce("أُخفيت بيانات الدعوة من الواجهة.");
 }));
 box.append(actions);parent.append(box);
}

/* M5.3.1 — boot must run after declaring the invitation renderer.
 * A previous edit replaced the tail of this module and accidentally removed
 * session restoration and the initial render(), leaving a permanent
 * "initializing" placeholder with no visible JavaScript exception.
 */
async function startQAPortal(){
 try{
  const saved=JSON.parse(sessionStorage.getItem(TOKEN_KEY)||"null");
  if(saved?.access_token&&saved?.refresh_token&&saved?.userId){
   session=saved;
   try{
    await refreshProfile();
    if(!profile?.approved||profile.account_status!=="approved")
     throw Error("حساب المفتش غير معتمد في بيئة الاختبار.");
    await refreshData();
  }catch(err){
   saveSession(null);profile=null;
   announce("سجل الدخول مجددًا: "+(err?.message||"تعذر استعادة الجلسة."),true);
  }
  }
 }catch(err){
  saveSession(null);profile=null;
  announce("تعذر استعادة جلسة المختبر. سجّل الدخول مجددًا.",true);
 }
 try{
  render();
 }catch(err){
  // Display a recoverable error instead of leaving an inert loading screen.
  root.replaceChildren(notice("تعذر تحميل واجهة المختبر. حدّث الصفحة، وإذا تكرر الخطأ أبلغني به.", "notice error"));
  console.error("QA portal startup failed",err);
 }
}
await startQAPortal();
