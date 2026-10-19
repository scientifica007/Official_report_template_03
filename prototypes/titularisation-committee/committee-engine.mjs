/* ARCH-01D2 — local-only committee drafting laboratory.
 * This is NOT authentication, a legal approval service, or an official document.
 * It reuses the accepted scoring engine without altering its existing interface. */
import {
 SCHEMA as SCORE_SCHEMA, RUBRICS, DISCUSSION, GROUPS, newDraft, lessonItems,
 withScore, withWeight, withSuggestions, freezeWeights, validateWeights,
 validateImport as importScores, totals
} from "../titularisation-workbench/engine.mjs";

export const COMMITTEE_SCHEMA="titularisation-committee-lab-v1";
export const SEATS=Object.freeze([
 {id:"chair",label:"رئيس اللجنة (المفتش)"},
 {id:"member1",label:"العضو الأول"},
 {id:"member2",label:"العضو الثاني"},
 {id:"member3",label:"العضو الثالث"}
]);
export const MODES=Object.freeze({unified:"تقييم موحد من المفتش",individual:"مساهمات فردية اختيارية"});
const has=Object.hasOwn;
const ids=new Set(SEATS.map(x=>x.id));
const clone=x=>JSON.parse(JSON.stringify(x));
const own=(o,k)=>has(o,k);
const plain=o=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
const fields=new Set(["lessonSummary","discussionSummary","general","recommendations"]);
const metaKeys=new Set(["candidate","institution","rank","date","location","session"]);
const maxNote=4000;
const cleanString=(v,max=maxNote)=>{
 if(typeof v!=="string"||v.length>max)throw Error("نص غير صالح أو طويل جدًا");
 return v;
};
const notes=()=>({lesson:{},discussion:{},lessonSummary:"",discussionSummary:"",general:"",recommendations:""});
const contributor=key=>({grading:newDraft(key),notes:notes(),submitted:false});
const keyFor=rubricId=>Object.keys(RUBRICS).find(k=>RUBRICS[k].id===rubricId||k===rubricId);
export function freshCommittee(mode="unified",rubric="grouped5"){
 if(!own(MODES,mode))throw Error("وضع تقييم غير معروف");
 const key=keyFor(rubric);
 if(!key)throw Error("شبكة غير معروفة");
 const members={};
 for(const {id} of SEATS)members[id]=contributor(key);
 return {schema:COMMITTEE_SCHEMA,revision:1,mode,rubricId:RUBRICS[key].id,
  meta:{candidate:"",institution:"",rank:"",date:"",location:"",session:""},
  final:contributor(key),members,serial:1};
}
export function editMeta(state,field,value){
 if(!metaKeys.has(field))throw Error("حقل تعريف غير معروف");
 const s=clone(state);s.meta[field]=cleanString(value,300);s.serial++;return s;
}
export function changeMode(state,mode){
 if(!own(MODES,mode))throw Error("وضع تقييم غير معروف");
 const s=clone(state);
 s.mode=mode;s.serial++;return s;
}
export function configureWeight(state,id,value){
 if(state.rubricId!==RUBRICS.analytical14.id)throw Error("شبكة الأوزان ليست تحليلية");
 const s=clone(state);
 s.final.grading=withWeight(s.final.grading,id,value);
 for(const seat of SEATS)s.members[seat.id].grading.profile=clone(s.final.grading.profile);
 s.serial++;return s;
}
export function applySuggestedWeights(state){
 if(state.rubricId!==RUBRICS.analytical14.id)throw Error("لا توجد أوزان قابلة للضبط");
 const s=clone(state);
 s.final.grading=withSuggestions(s.final.grading);
 for(const seat of SEATS)s.members[seat.id].grading.profile=clone(s.final.grading.profile);
 s.serial++;return s;
}
export function finalizeWeights(state){
 if(state.rubricId!==RUBRICS.analytical14.id)throw Error("لا توجد أوزان قابلة للضبط");
 const s=clone(state);
 s.final.grading=freezeWeights(s.final.grading);
 for(const seat of SEATS)s.members[seat.id].grading.profile=clone(s.final.grading.profile);
 s.serial++;return s;
}
function contribution(s,who){
 if(who==="final")return s.final;
 if(!ids.has(who))throw Error("مقعد غير معروف");
 if(s.mode!=="individual")throw Error("المساهمات الفردية غير مفعلة");
 return s.members[who];
}
export function editScore(state,who,phase,id,value){
 const s=clone(state),c=contribution(s,who);
 if(c.submitted&&who!=="final")throw Error("المساهمة أرسلت؛ افتحها أولًا");
 c.grading=withScore(c.grading,phase,id,value);s.serial++;return s;
}
export function editNote(state,who,field,value,itemId=null){
 const s=clone(state),c=contribution(s,who);
 if(c.submitted&&who!=="final")throw Error("المساهمة أرسلت؛ افتحها أولًا");
 const text=cleanString(value);
 if(field==="lesson"||field==="discussion"){
  const ids=new Set((field==="lesson"?lessonItems(c.grading):DISCUSSION).map(x=>x.id));
  if(!ids.has(itemId))throw Error("عنصر تقدير غير معروف");
  c.notes[field][itemId]=text;
 }else if(fields.has(field)){c.notes[field]=text}
 else throw Error("حقل تقدير غير معروف");
 s.serial++;return s;
}
export function submit(state,who){
 if(!ids.has(who)||state.mode!=="individual")throw Error("ليس هناك عضو لإرسال مساهمته");
 const s=clone(state);s.members[who].submitted=true;s.serial++;return s;
}
export function reopen(state,who){
 if(!ids.has(who)||state.mode!=="individual")throw Error("مساهمة غير معروفة");
 const s=clone(state);s.members[who].submitted=false;s.serial++;return s;
}
export function memberStatus(state){
 return SEATS.map(seat=>{
  const c=state.members[seat.id],t=totals(c.grading);
  return {...seat,submitted:c.submitted,complete:t.complete,lesson:t.lesson.total,discussion:t.discussion.total};
 });
}
export function assistance(state){
 const items=lessonItems(state.final.grading);
 if(state.mode!=="individual")return {count:0,means:{lesson:{},discussion:{}},members:[],total60:null};
 const submitted=SEATS.filter(seat=>state.members[seat.id].submitted);
 const means={lesson:{},discussion:{}};
 for(const [phase,rows] of [["lesson",items],["discussion",DISCUSSION]]){
  for(const item of rows){
   if(item.cap===0)continue;
   const values=submitted.map(seat=>state.members[seat.id].grading.scores[phase][item.id])
      .filter(x=>typeof x==="number"&&Number.isFinite(x));
   means[phase][item.id]=values.length?{mean:values.reduce((a,b)=>a+b,0)/values.length,count:values.length}:null;
  }
 }
 const totalsOf=submitted.map(seat=>totals(state.members[seat.id].grading).total60)
  .filter(v=>v!==null);
 return {count:submitted.length,means,members:submitted.map(x=>x.id),
  total60:totalsOf.length?totalsOf.reduce((a,b)=>a+b,0)/totalsOf.length:null,
  fullCommittee:submitted.length===SEATS.length};
}
export function documentData(state){
 const result=totals(state.final.grading);
 return {meta:clone(state.meta),mode:state.mode,rubricId:state.rubricId,
  finalGrades:clone(state.final.grading.scores),finalNotes:clone(state.final.notes),
  result,reference:assistance(state),serial:state.serial,
  isDraft:!result.complete};
}
function validNotes(g,grading){
 if(!plain(g))throw Error("تقديرات غير صالحة");
 if(!plain(g.lesson)||!plain(g.discussion))throw Error("تقديرات المعايير غير صالحة");
 for(const phase of ["lesson","discussion"]){
  const allowed=new Set((phase==="lesson"?lessonItems(grading):DISCUSSION).map(x=>x.id));
  for(const [id,value] of Object.entries(g[phase])){
   if(!allowed.has(id))throw Error("معرف تقدير غير معروف");
   cleanString(value);
  }
 }
 for(const key of fields)cleanString(g[key]);
 for(const key of Object.keys(g))if(!fields.has(key)&&key!=="lesson"&&key!=="discussion")throw Error("حقل إضافي غير معروف");
}
function checkContribution(raw,expectedRubric,lockedProfile,allowSubmitted){
 if(!plain(raw)||!plain(raw.notes))throw Error("مساهمة غير صالحة");
 const grading=importScores(raw.grading);
 if(grading.schema!==SCORE_SCHEMA||grading.rubricId!==expectedRubric)throw Error("شبكة تقييم مختلفة");
 if(lockedProfile!==null&&JSON.stringify(grading.profile)!==JSON.stringify(lockedProfile))
   throw Error("ملف أوزان غير موحد بين المساهمين");
 validNotes(raw.notes,grading);
 if(typeof raw.submitted!=="boolean"||(!allowSubmitted&&raw.submitted))throw Error("حالة إرسال غير صالحة");
 return {grading,notes:clone(raw.notes),submitted:raw.submitted};
}
export function restoreCommittee(raw){
 if(!plain(raw)||raw.schema!==COMMITTEE_SCHEMA||raw.revision!==1||!own(MODES,raw.mode))
   throw Error("إصدار مسودة لجنة غير مدعوم");
 const blank=freshCommittee(raw.mode,raw.rubricId);
 if(!plain(raw.meta)||!plain(raw.members)||!Number.isSafeInteger(raw.serial)||raw.serial<1)
   throw Error("بيانات مسودة غير صالحة");
 for(const key of metaKeys)blank.meta[key]=cleanString(raw.meta[key],300);
 for(const key of Object.keys(raw.meta))if(!metaKeys.has(key))throw Error("حقل تعريف غير معروف");
 blank.final=checkContribution(raw.final,blank.rubricId,null,false);
 for(const {id} of SEATS){
  if(!own(raw.members,id))throw Error("مساهمة مفقودة");
  blank.members[id]=checkContribution(raw.members[id],blank.rubricId,blank.final.grading.profile,true);
 }
 for(const key of Object.keys(raw.members))if(!ids.has(key))throw Error("مقعد إضافي غير معروف");
 blank.serial=raw.serial;
 return blank;
}
export function stringifyCommittee(state){return JSON.stringify(restoreCommittee(state),null,2)}
