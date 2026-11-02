/* Isolated synthetic-data QA launcher, NEVER reuse the production session.
 * All access is restricted by Supabase Auth and database RLS.
 * Public publishable key only; no browser service-role key and no password persistence.
 */
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
function renderLogin(){
 const card=wrapper("الدخول بحساب المفتش التجريبي");
 card.append(notice("استخدم البريد وكلمة المرور اللذين أنشأتهما في مشروع Supabase التجريبي فقط. لا تستخدم بيانات المنصة الإنتاجية."));
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
  select:"id,title,rubric_id,status,expires_at,created_at",order:"created_at.desc",limit:"100"
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
 create.append(notice("يختبر هذا الإصدار شبكتي 5 معايير و10 عناصر فقط. الشبكة الميدانية المقبولة ذات 14 مؤشرًا لم تربط بعد بالخادم؛ لا تستخدم بيانات ترسيم حقيقية."));
 const form=element("form"),fields=element("div","","fields");
 const title=input("text","مثال: اختبار لجنة رقم 01");title.required=true;title.minLength=3;title.maxLength=200;
 const rubric=element("select");for(const [value,label] of [
  ["lesson_grouped_5_v1","الخمسة معايير — اختبار تقني"],
  ["lesson_inspector_10_v1","العشرة عناصر — اختبار تقني"]]){
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
  const active=mission.status==="draft"&&new Date(mission.expires_at).getTime()>Date.now();
  if(issued?.mission_id===selected)renderIssued(choose);
  const seatsWrap=element("div","","seats");
  for(const code of seats){
   const data=seatRows.find(s=>s.seat_code===code)||{seat_code:code,status:"vacant"};
   const c=contributions.find(x=>x.seat_code===code);
   const card=element("div","","seat");
   card.append(element("h3",seatNames[code]));
   card.append(notice("الحساب: "+({vacant:"غير مُصدر",active:"نشط",revoked:"ملغى"})[data.status],"status"));
   card.append(element("p","المساهمة: "+(c?.status==="submitted"?"مرسلة نهائيًا":c?.status==="draft"?"مسودة":"غير موجودة")));
   if(data.username)card.append(element("p","اسم المستخدم: "+data.username));
   const actions=element("div","","actions");
   if(active&&data.status!=="active"&&c?.status!=="submitted"){
    const name=input("text","اسم اختباري اختياري");name.maxLength=160;
    card.append(field("اسم العرض",name));
    actions.append(button("إصدار حساب العضو",async()=>{
     issued=await edge("issue",{mission_id:selected,seat_code:code,display_name:name.value.trim()});
     await refreshData();announce("صدرت بيانات دخول "+seatNames[code]+". تظهر مرة واحدة فقط.");
    },"primary"));
   }
   if(active&&data.status==="active"){
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
 box.append(element("strong","بيانات دخول ظهرت مرة واحدة — سلّمها لعضو اللجنة"));
 const code=issued.seat_code;
 box.append(element("p","المقعد: "+(seatNames[code]||code)));
 const username=element("code",issued.username||"","code");
 box.append(element("p","اسم المستخدم: "),username);
 const password=element("code",issued.password||"","code");
 box.append(element("p","كلمة المرور: "),password);
 const url=new URL("./member/?mission="+encodeURIComponent(selected)+"&seat="+encodeURIComponent(code),location.href).href;
 const link=element("a","رابط دخول العضو");link.href=url;link.target="_blank";link.rel="noopener noreferrer";
 box.append(element("p","الرابط: "),link);
 const actions=element("div","","actions");
 actions.append(button("نسخ بيانات الدخول",async()=>{
  const content="رابط العضو: "+url+"\nاسم المستخدم: "+issued.username+"\nكلمة المرور: "+issued.password;
  if(!navigator.clipboard?.writeText)throw Error("النسخ غير مدعوم بهذا المتصفح.");
  await navigator.clipboard.writeText(content);announce("نُسخت بيانات الاختبار. لا تحتفظ بها بعد انتهاء المهمة.");
 }),button("إخفاء كلمة المرور الآن",async()=>{issued=null;announce("أُخفيت بيانات الدخول.");}));
 box.append(actions);parent.append(box);
}
try{
 const saved=JSON.parse(sessionStorage.getItem(TOKEN_KEY)||"null");
 if(saved?.access_token&&saved?.refresh_token&&saved?.userId)session=saved;
}catch(_){}
if(session){
 try{await refreshProfile();if(!profile?.approved||profile.account_status!=="approved")
  throw Error("حساب المفتش غير معتمد في بيئة الاختبار.");
  await refreshData();
 }catch(err){saveSession(null);profile=null;announce("سجل الدخول مجددًا: "+err.message,true)}
}
render();
