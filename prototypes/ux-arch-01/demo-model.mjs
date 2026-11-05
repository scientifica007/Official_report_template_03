// UX-ARCH-01: synthetic, browser-local, testable user-experience model.
// NOT a backend, Auth service, RLS policy or source of production records.
export const DEMO_DISTRICTS=Object.freeze([
 {id:"district-tebessa",label:"مقاطعة تبسة — تجريبية"},
 {id:"district-blida2",label:"مقاطعة البليدة 2 — تجريبية"}
]);
export const DEMO_USERS=Object.freeze([
 {id:"admin-t",name:"مسؤول تجريبي — تبسة",districtId:"district-tebessa",approved:true,isAdmin:true,reviewer:true},
 {id:"inspector-t",name:"مفتش تجريبي — تبسة",districtId:"district-tebessa",approved:true,isAdmin:false,reviewer:false},
 {id:"inspector-b",name:"مفتش تجريبي — البليدة 2",districtId:"district-blida2",approved:true,isAdmin:false,reviewer:true},
 {id:"inspector-u",name:"مفتش بلا مقاطعة عمل موثقة",districtId:null,approved:true,isAdmin:false,reviewer:false},
 {id:"inspector-p",name:"حساب غير معتمد — البليدة 2",districtId:"district-blida2",approved:false,isAdmin:false,reviewer:false}
]);
export const DEMO_INSTITUTIONS=Object.freeze([
 {id:"institution-t",districtId:"district-tebessa",name:"مؤسسة تكوين تجريبية — تبسة",code:"DEMO-TB-001",wilaya:"تبسة",status:"published"},
 {id:"institution-t-pending",districtId:"district-tebessa",name:"مؤسسة قيد مراجعة — تبسة",code:"DEMO-TB-002",wilaya:"تبسة",status:"pending"},
 {id:"institution-b",districtId:"district-blida2",name:"مؤسسة تكوين تجريبية — البليدة",code:"DEMO-BL-001",wilaya:"البليدة",status:"published"}
]);
export const DEMO_MISSIONS=Object.freeze([
 {id:"mission-t",districtId:"district-tebessa",title:"مهمة تفتيش تجريبية — تبسة"},
 {id:"mission-b",districtId:"district-blida2",title:"مهمة تفتيش تجريبية — البليدة 2"}
]);
export const EXCEPTION_CAPABILITIES=Object.freeze({
 view_inspector:{resource:"inspector",label:"رؤية مفتش محدد من مقاطعة أخرى"},
 view_institution:{resource:"institution",label:"رؤية مؤسسة معتمدة محددة خارج المقاطعة"},
 collaborate_mission:{resource:"mission",label:"التعاون في مهمة محددة خارج المقاطعة"}
});
const MIN_REASON=10,MAX_REASON=500,MAX_GRANT_MS=30*24*3600*1000;
const str=(x,n=2000)=>String(x??"").trim().slice(0,n);
const clone=o=>JSON.parse(JSON.stringify(o));
const must=(condition,msg)=>{if(!condition)throw Error(msg)};
const userCanAct=user=>Boolean(user?.approved&&user?.districtId);
const nowISO=now=>new Date(now).toISOString();
export function initialDemoState(){
 return {version:1,preparations:[],privateRecords:[],publicationRequests:[],
  institutions:clone(DEMO_INSTITUTIONS),exceptions:[],audit:[]};
}
export function normalizedDemoState(obj){
 const blank=initialDemoState();
 if(!obj||obj.version!==1)return blank;
 for(const name of ["preparations","privateRecords","publicationRequests","institutions","exceptions","audit"])
  if(!Array.isArray(obj[name]))return blank;
 return clone(obj);
}
const activeGrant=(state,user,capability,resourceId,now)=>{
 if(!userCanAct(user))return false;
 return state.exceptions.some(g=>g.granteeId===user.id&&
  g.granteeDistrictId===user.districtId&&g.capability===capability&&
  g.resourceId===resourceId&&g.revokedAt===null&&
  Date.parse(g.expiresAt)>now);
};
export function colleaguesFor(state,user,now=Date.now()){
 if(!userCanAct(user))return [];
 return DEMO_USERS.filter(p=>p.id!==user.id&&p.approved&&p.districtId&&
  (p.districtId===user.districtId||
    activeGrant(state,user,"view_inspector",p.id,now)));
}
export function institutionsFor(state,user,now=Date.now()){
 if(!userCanAct(user))return [];
 return state.institutions.filter(p=>p.status==="published"&&
  (p.districtId===user.districtId||
    activeGrant(state,user,"view_institution",p.id,now)));
}
export function missionsFor(state,user,now=Date.now()){
 if(!userCanAct(user))return [];
 return DEMO_MISSIONS.filter(p=>p.districtId===user.districtId||
  activeGrant(state,user,"collaborate_mission",p.id,now));
}
export function personalPreparations(state,user){
 return state.preparations.filter(x=>x.ownerId===user?.id);
}
export function personalRecords(state,user){
 return state.privateRecords.filter(x=>x.ownerId===user?.id);
}
export function upsertPreparation(state,user,data,id,now=Date.now()){
 must(userCanAct(user),"لا يمكن إعداد مهمة قبل اعتماد الحساب ومقاطعة العمل.");
 const old=state.preparations.find(x=>x.id===id);
 must(!old||old.ownerId===user.id,"هذه المهمة ليست ملكًا لك.");
 const row={
  id,ownerId:user.id,workDistrictId:user.districtId,
  templateId:["OFFICIAL_REPORT_TEMPLATE_03","TITULARISATION"].includes(data.templateId)?
   data.templateId:"OFFICIAL_REPORT_TEMPLATE_03",
  title:str(data.title,200)||"مهمة قيد التحضير",
  institution:str(data.institution,250),teacher:str(data.teacher,250),
  purpose:str(data.purpose,3000),plannedDate:str(data.plannedDate,10),
  notes:str(data.notes,3000),stage:"preparation",
  createdAt:old?.createdAt||nowISO(now),
  updatedAt:nowISO(now),revision:(old?.revision||0)+1
 };
 must(!old||old.workDistrictId===user.districtId,"تغيّرت مقاطعة عملك؛ يلزم تسوية المهمة إداريًا.");
 return {...state,preparations:old?
  state.preparations.map(x=>x.id===id?row:x):[...state.preparations,row]};
}
export function addPrivateRecord(state,user,payload,id,now=Date.now()){
 must(userCanAct(user),"لا يمكن إنشاء سجل قبل اعتماد مقاطعة العمل.");
 must(!state.privateRecords.some(x=>x.id===id),"معرّف السجل مستخدم.");
 const title=str(payload.title,250),kind=payload.kind==="institution"?"institution":"reference";
 must(title.length>=3,"أدخل عنوانًا لا يقل عن ثلاثة أحرف.");
 const row={id,ownerId:user.id,workDistrictId:user.districtId,kind,title,
  code:str(payload.code,80),wilaya:str(payload.wilaya,120),
  text:str(payload.text,3000),createdAt:nowISO(now),revision:1};
 return {...state,privateRecords:[...state.privateRecords,row]};
}
export function requestPublication(state,user,recordId,id,now=Date.now()){
 must(userCanAct(user),"مقاطعة العمل غير معتمدة.");
 const record=state.privateRecords.find(x=>x.id===recordId&&x.ownerId===user.id);
 must(record&&record.kind==="institution","يمكن اقتراح نشر مؤسسات خاصة بك فقط.");
 must(record.workDistrictId===user.districtId,"مقاطعة هذا السجل غير مطابقة.");
 must(!state.publicationRequests.some(x=>x.id===id),"معرّف طلب مستخدم.");
 const item={id,authorId:user.id,districtId:user.districtId,
  recordId,proposed:clone(record),status:"submitted",reviewerId:null,reason:"",
  submittedAt:nowISO(now),decidedAt:null};
 return {...state,publicationRequests:[...state.publicationRequests,item]};
}
export function pendingRequestsFor(state,reviewer){
 if(!userCanAct(reviewer)||!reviewer.reviewer)return [];
 return state.publicationRequests.filter(x=>x.districtId===reviewer.districtId&&x.status==="submitted");
}
export function decidePublication(state,reviewer,id,decision,reason="",now=Date.now()){
 must(userCanAct(reviewer)&&reviewer.reviewer,"ليس لك اعتماد نشر البيانات.");
 must(["approved","rejected"].includes(decision),"قرار غير صالح.");
 const request=state.publicationRequests.find(x=>x.id===id);
 must(request&&request.status==="submitted"&&request.districtId===reviewer.districtId,
  "الطلب غير متاح لمراجع هذه المقاطعة.");
 must(request.authorId!==reviewer.id,"لا يجوز اعتماد الشخص طلب نشره بنفسه في هذا النموذج.");
 must(decision!=="rejected"||str(reason,500).length>=6,"يجب توضيح سبب الرفض.");
 const approved=decision==="approved";
 const instId="published-"+id;
 must(!approved||!state.institutions.some(x=>x.id===instId||
   (x.status==="published"&&x.districtId===request.districtId&&x.code&&x.code===request.proposed.code)),
  "المؤسسة منشورة بالفعل في هذه المقاطعة أو لديها رمز مكرر.");
 const row={...request,status:decision,reviewerId:reviewer.id,reason:str(reason,500),
  decidedAt:nowISO(now)};
 return {...state,
  publicationRequests:state.publicationRequests.map(x=>x.id===id?row:x),
  institutions:approved?[...state.institutions,{
   id:instId,districtId:request.districtId,status:"published",
   name:request.proposed.title,code:request.proposed.code,wilaya:request.proposed.wilaya
  }]:state.institutions};
}
function targetOf(capability,resourceId,state){
 if(capability==="view_inspector"){
  const user=DEMO_USERS.find(x=>x.id===resourceId);
  return user?.approved?{id:user.id,districtId:user.districtId}:null;
 }
 if(capability==="view_institution"){
  const institution=state.institutions.find(x=>x.id===resourceId);
  return institution?.status==="published"?institution:null;
 }
 if(capability==="collaborate_mission")
  return DEMO_MISSIONS.find(x=>x.id===resourceId)||null;
 return null;
}
export function grantException(state,admin,grant,id,now=Date.now()){
 must(userCanAct(admin)&&admin.isAdmin===true,"منح الاستثناءات من صلاحيات admin فقط.");
 const grantee=DEMO_USERS.find(x=>x.id===grant.granteeId);
 must(userCanAct(grantee)&&grantee.id!==admin.id,"المستفيد غير معتمد أو غير محدد.");
 must(Object.hasOwn(EXCEPTION_CAPABILITIES,grant.capability),"نوع استثناء غير مسموح.");
 const target=targetOf(grant.capability,grant.resourceId,state);
 must(target&&target.districtId,"المورد غير موجود أو غير منشور/معتمد.");
 must(target.districtId!==grantee.districtId,"لا يُنشأ استثناء لما يدخل في مقاطعة المستفيد.");
 const reason=str(grant.reason,MAX_REASON+1);
 must(reason.length>=MIN_REASON&&reason.length<=MAX_REASON,"سبب الاستثناء من 10 إلى 500 حرف.");
 const expiry=Date.parse(grant.expiresAt);
 must(Number.isFinite(expiry)&&expiry>now&&expiry-now<=MAX_GRANT_MS,
  "مدة الاستثناء يجب أن تكون محددة وألا تتجاوز 30 يومًا.");
 must(!state.exceptions.some(x=>x.id===id),"معرّف استثناء مستخدم.");
 const item={id,granteeId:grantee.id,granteeDistrictId:grantee.districtId,
  adminId:admin.id,capability:grant.capability,resourceId:target.id,
  resourceDistrictId:target.districtId,reason,createdAt:nowISO(now),
  expiresAt:new Date(expiry).toISOString(),revokedAt:null,revokedBy:null};
 const event={id:"event-"+id,action:"granted",grantId:id,actorId:admin.id,
  at:nowISO(now),reason};
 return {...state,exceptions:[...state.exceptions,item],audit:[...state.audit,event]};
}
export function revokeException(state,admin,id,now=Date.now()){
 must(userCanAct(admin)&&admin.isAdmin===true,"سحب الاستثناءات من صلاحيات admin فقط.");
 const row=state.exceptions.find(x=>x.id===id);
 must(row&&row.revokedAt===null,"الاستثناء غير موجود أو ملغى.");
 const at=nowISO(now);
 const event={id:"revocation-"+id+"-"+now,action:"revoked",grantId:id,
  actorId:admin.id,at,reason:"سحب إداري"};
 return {...state,exceptions:state.exceptions.map(x=>x.id===id?{
  ...x,revokedAt:at,revokedBy:admin.id
 }:x),audit:[...state.audit,event]};
}
