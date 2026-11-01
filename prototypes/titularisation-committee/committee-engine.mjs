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
export const MODES=Object.freeze({unified:"تقييم موحد من المفتش",individual:"مساهمات فردية"});
const has=Object.hasOwn;
const ids=new Set(SEATS.map(x=>x.id));
const clone=x=>JSON.parse(JSON.stringify(x));
const own=(o,k)=>has(o,k);
const plain=o=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
const fields=new Set(["lessonSummary","discussionSummary","general","recommendations"]);
// Supplementary *report fields*, grounded in the supplied six-page
// titularisation template. The original six fields and v1 JSON remain valid.
export const METADATA_GROUPS=Object.freeze([
 {label:"بيانات المفتش والمقاطعة",fields:[
  ["inspectorDistrict","المقاطعة التقنية والبيداغوجية"],
  ["inspectorSeat","مقر المفتش"],["inspectorPhone","هاتف المفتش"],
  ["inspectorEmail","البريد الإلكتروني للمفتش"],["chairName","اسم ولقب رئيس اللجنة"]]},
 {label:"بيانات الأستاذ المترشح",fields:[
  ["familyName","اللقب"],["givenName","الاسم"],["birth","تاريخ الميلاد"],["birthPlace","مكان الميلاد"],
  ["installationDate","تاريخ التنصيب"],["assignmentDate","تاريخ التعيين"],
  ["assignmentInstitution","مؤسسة التعيين"],["examCenter","مركز الامتحان"],
  ["certificate","الشهادة"],["specialty","الاختصاص"],
  ["subjects","المواد المُدرّسة"],["workplace","مكان العمل"],
  ["internshipInstitution","مؤسسة التربص البيداغوجي"],
  ["internshipFrom","بداية التربص البيداغوجي"],["internshipTo","نهاية التربص البيداغوجي"],
  ["priorDeferral","هل وقع التأجيل من قبل؟"],["priorDeferralDate","تاريخ التأجيل السابق إن وجد"]]},
 {label:"ظروف إجراء امتحان الترسيم",fields:[
  ["occupationalBranch","الشعبة المهنية"],["examSpecialty","اختصاص الامتحان"],
  ["qualificationLevel","مستوى التأهيل"],["module","المقياس"],
  ["lessonTopic","موضوع الحصة التدريسية"],["discussionTopic","موضوع المناقشة"],
  ["wilaya","الولاية"]]},
 {label:"المداولة والوثيقة الورقية",fields:[
  ["member1Name","اسم ولقب العضو الأول"],["member1Role","وظيفة العضو الأول"],
  ["member2Name","اسم ولقب العضو الثاني"],["member2Role","وظيفة العضو الثاني"],
  ["member3Name","اسم ولقب العضو الثالث"],["member3Role","وظيفة العضو الثالث"],
  ["decision","قرار اللجنة"],["decisionPlace","مكان تحرير المحضر"],
  ["decisionDate","تاريخ تحرير المحضر"]]}
 ,
 {label:"صياغة محضر الترسيم",fields:[
  ["minutesScopeMode","فئة الأساتذة في المحضر"],
  ["minutesScopeCustom","صياغة الفئة الحرة للمحضر"]
 ]}
]);
// Keep the B16 birthDate key as a hidden compatibility alias for previously saved JSON.
const baseMetaKeys=["candidate","institution","rank","date","location","session","birthDate"];
const metaKeys=new Set([...baseMetaKeys,...METADATA_GROUPS.flatMap(g=>g.fields.map(f=>f[0]))]);
const emptyMeta=()=>({...Object.fromEntries([...metaKeys].map(k=>[k,""])),minutesScopeMode:"specialist"});
const validDecisions=new Set(["","success","first","second"]);
const validMinutesScopes=new Set(["specialist","rehabilitation","general","custom"]);
const maxNote=4000;
const proseFields=["lessonSummary","discussionSummary","general","recommendations"];
const editKey=(field,id)=>["lesson","discussion"].includes(field)?field+":"+id:"field:"+field;
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
  meta:emptyMeta(),
  final:contributor(key),members,finalNoteEdits:[],serial:1};
}
export function editMeta(state,field,value){
 if(!metaKeys.has(field))throw Error("حقل تعريف غير معروف");
 if(field==="decision"&&!validDecisions.has(value))throw Error("قرار لجنة غير معروف");
 if(field==="minutesScopeMode"&&!validMinutesScopes.has(value))throw Error("صياغة فئة المحضر غير معروفة");
 const s=clone(state);s.meta[field]=cleanString(value,300);
 // The single visible date field updates the legacy B16 minutes alias as well.
 if(field==="birth")s.meta.birthDate=s.meta.birth;
 s.serial++;return s;
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
 if(who==="final"){
  const key=editKey(field,itemId);
  if(!s.finalNoteEdits.includes(key))s.finalNoteEdits.push(key);
 }
 s.serial++;return s;
}
// Repeatable synthetic examples for UI testing only. Do not fill candidate,
// institution, final chair results, or another committee seat. Every generated
// note visibly identifies itself as fictional and identifies its simulated seat.
const DEMO_OBSERVATIONS=Object.freeze([
 "أظهر تنظيمًا مناسبًا مع إمكانية تحسين توزيع وقت الحصة",
 "استخدم أمثلة واضحة، ويُستحسن تنويع طرائق إشراك المتكونين",
 "وظّف الوسائل المتاحة بفعالية، مع حاجة إلى تدقيق صياغة بعض الأسئلة",
 "أدار النشاط تدريجيًا، ويُنصح بتوسيع فرص المناقشة والتطبيق"
]);
const DEMO_LESSON=Object.freeze([
 "أظهرت الحصة تنظيمًا مقبولًا، مع توصية بتحسين الربط بين مراحل الدرس.",
 "لاحظت مشاركة متفاوتة للمتكونين، ويمكن إثراء النشاط بأسئلة متنوعة.",
 "استُعملت الوسائل البيداغوجية بصورة جيدة، مع مجال لتحسين التقويم المرحلي.",
 "تحققت معظم الأهداف التجريبية، ويُقترح تخصيص وقت أطول للتطبيق."
]);
const DEMO_DISCUSSION=Object.freeze([
 "كانت الإجابات مفهومة بوجه عام، وتحتاج بعض النقاط إلى أمثلة أدق.",
 "اتسمت المناقشة بالتفاعل، مع أهمية دعم بعض الاستنتاجات بالشواهد.",
 "برز تحكم مناسب في المفاهيم الأساسية، مع توصية بتنظيم عرض الحجج.",
 "أظهرت المناقشة قدرة على التحليل، ويُستحسن مزيد من الاختصار والدقة."
]);
const DEMO_GENERAL=Object.freeze([
 "تقدير تجريبي: أداء قابل للتحسين في التخطيط والتنشيط والمتابعة.",
 "تقدير تجريبي: أداء مشجع مع حاجة إلى تنويع أساليب التقويم.",
 "تقدير تجريبي: أداء متوازن، ويُنصح بتعزيز الجانب التطبيقي.",
 "تقدير تجريبي: أداء مناسب مع فرص لتطوير التواصل البيداغوجي."
]);
const DEMO_RECOMMENDATIONS=Object.freeze([
 "اقتراح تجريبي: إعداد بطاقة متابعة للأنشطة البيداغوجية.",
 "اقتراح تجريبي: إثراء الحصة بتمارين تطبيقية متدرجة.",
 "اقتراح تجريبي: اعتماد تقويم تكويني خلال مراحل الدرس.",
 "اقتراح تجريبي: تحسين توزيع الوقت وإتاحة نقاش ختامي."
]);
export function hasMemberContent(state,who){
 if(state.mode!=="individual"||!ids.has(who))throw Error("اختر عضو لجنة في وضع المساهمات الفردية");
 const c=state.members[who];
 return ["lesson","discussion"].some(phase=>Object.keys(c.grading.scores[phase]).length>0)||
  ["lesson","discussion"].some(phase=>Object.values(c.notes[phase]).some(x=>x.trim()))||
  proseFields.some(key=>c.notes[key].trim());
}
export function fillDemoMember(state,who){
 if(state.mode!=="individual"||!ids.has(who))
  throw Error("التعبئة التجريبية متاحة فقط لمقاعد المساهمات الفردية");
 const source=state.members[who];
 if(source.submitted)throw Error("المساهمة مرسلة؛ أعد فتحها قبل تعبئتها تجريبيًا");
 if(state.rubricId===RUBRICS.analytical14.id&&!source.grading.profile.frozen)
  throw Error("ثبّت أوزان المؤشرات الأربعة عشر قبل ملء البيانات التجريبية");
 const idx=SEATS.findIndex(seat=>seat.id===who),seat=SEATS[idx];
 const s=clone(state),c=s.members[who];
 // Reset only this member's draft, using the frozen rubric profile already
 // configured for the mission. Submitted members and chair text stay intact.
 c.grading.scores={lesson:{},discussion:{}};
 c.notes=notes();
 for(const [phase,rows] of [["lesson",lessonItems(c.grading)],["discussion",DISCUSSION]]){
  rows.forEach((item,i)=>{
   const caption="بيانات تجريبية — "+seat.label+" — "+item.label+": ";
   c.notes[phase][item.id]=caption+DEMO_OBSERVATIONS[(idx+i+(phase==="discussion"?1:0))%4]+".";
   if(item.cap===0)return; // Weight zero has a written note but no score.
   if(item.cap===null)throw Error("وزن مؤشر غير مضبوط");
   const units=item.cap*2;
   const base=Math.max(0,Math.min(units-3,Math.floor(units*0.4)+(i%3)-1));
   const attainable=Math.min(units,Math.max(0,base+idx));
   c.grading=withScore(c.grading,phase,item.id,attainable/2);
  });
 }
 c.notes.lessonSummary="بيانات تجريبية — "+seat.label+": "+DEMO_LESSON[idx];
 c.notes.discussionSummary="بيانات تجريبية — "+seat.label+": "+DEMO_DISCUSSION[idx];
 c.notes.general="بيانات تجريبية — "+seat.label+": "+DEMO_GENERAL[idx];
 c.notes.recommendations="بيانات تجريبية — "+seat.label+": "+DEMO_RECOMMENDATIONS[idx];
 s.serial++;
 return s;
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
   const entries=submitted.flatMap(seat=>{
    const value=state.members[seat.id].grading.scores[phase][item.id];
    return typeof value==="number"&&Number.isFinite(value)?
      [{id:seat.id,label:seat.label,value}]:[];
   });
   means[phase][item.id]=values.length?
    {mean:values.reduce((a,b)=>a+b,0)/values.length,sum:values.reduce((a,b)=>a+b,0),count:values.length,entries}:null;
  }
 }
 const totalsOf=submitted.map(seat=>totals(state.members[seat.id].grading).total60)
  .filter(v=>v!==null);
 return {count:submitted.length,means,members:submitted.map(x=>x.id),
  total60:totalsOf.length?totalsOf.reduce((a,b)=>a+b,0)/totalsOf.length:null,
  fullCommittee:submitted.length===SEATS.length};
}
// Input remains in 0.5 increments. Arithmetic means (e.g. 2.375) remain
// exact in the reference; the editable proposal is rounded to the closest
// half point, with explicit upward/downward alternatives in the editor.
export function rounding(mean,cap){
 if(typeof mean!=="number"||!Number.isFinite(mean))throw Error("متوسط غير صالح");
 const down=Math.max(0,Math.min(cap,Math.floor(mean*2+1e-9)/2));
 const up=Math.max(0,Math.min(cap,Math.ceil(mean*2-1e-9)/2));
 return {down,up,nearest:Math.round(mean*2)/2};
}
function aggregateText(state,field,itemId){
 const entries=SEATS.filter(seat=>state.members[seat.id].submitted)
  .map(seat=>({seat,text:(["lesson","discussion"].includes(field)?
   state.members[seat.id].notes[field][itemId]:
   state.members[seat.id].notes[field])||""}))
  .filter(x=>x.text.trim());
 if(!entries.length)return "";
 return "مسودة من تقديرات الأعضاء — للمراجعة والتحرير:\n"+
  entries.map(x=>x.seat.label+": "+x.text.trim()).join("\n");
}
// Derived suggestions never mutate or overwrite chair-authored grades/prose.
// A selected upward/downward rounding becomes an explicit chair override.
export function proposedFinal(state){
 const grading=clone(state.final.grading),text=clone(state.final.notes);
 const source={lesson:{},discussion:{},notes:{lesson:{},discussion:{}}};
 if(state.mode!=="individual")return {grading,notes:text,source};
 const a=assistance(state);
 for(const phase of ["lesson","discussion"]){
  const rows=phase==="lesson"?lessonItems(grading):DISCUSSION;
  for(const item of rows){
   if(item.cap===0||item.cap===null)continue;
   const ref=a.means[phase][item.id];
   if(ref&&!own(grading.scores[phase],item.id)){
    grading.scores[phase][item.id]=rounding(ref.mean,item.cap).nearest;
    source[phase][item.id]="مقترح آلي قابل للتعديل";
   }
   if(!state.finalNoteEdits.includes(editKey(phase,item.id))&&!text[phase][item.id]){
    const suggested=aggregateText(state,phase,item.id);
    if(suggested){text[phase][item.id]=suggested;source.notes[phase][item.id]="تجميع قابل للتحرير";}
   }
  }
 }
 for(const field of proseFields){
  if(!state.finalNoteEdits.includes(editKey(field))&&!text[field]){
   const suggested=aggregateText(state,field);
   if(suggested){text[field]=suggested;source.notes[field]="تجميع قابل للتحرير";}
  }
 }
 return {grading,notes:text,source};
}
export function selectRounding(state,phase,id,direction){
 if(state.mode!=="individual"||!["up","down"].includes(direction))
  throw Error("اختيار تقريب غير صالح");
 const item=(phase==="lesson"?lessonItems(state.final.grading):phase==="discussion"?DISCUSSION:[])
  .find(x=>x.id===id);
 if(!item||item.cap===0||item.cap===null)throw Error("بند غير قابل للتنقيط");
 const ref=assistance(state).means[phase][id];
 if(!ref)throw Error("لا توجد مساهمات لهذا البند");
 return editScore(state,"final",phase,id,rounding(ref.mean,item.cap)[direction]);
}
export function resetFinalNote(state,field,itemId=null){
 const key=editKey(field,itemId);
 const valid=["lesson","discussion"].includes(field)?
  (field==="lesson"?lessonItems(state.final.grading):DISCUSSION).some(x=>x.id===itemId):
  fields.has(field);
 if(!valid)throw Error("تقدير غير معروف");
 const s=clone(state);
 s.finalNoteEdits=s.finalNoteEdits.filter(x=>x!==key);
 if(["lesson","discussion"].includes(field))delete s.final.notes[field][itemId];
 else s.final.notes[field]="";
 s.serial++;return s;
}
export function documentData(state){
 const resolved=proposedFinal(state),result=totals(resolved.grading);
 return {meta:clone(state.meta),mode:state.mode,rubricId:state.rubricId,
  finalGrades:clone(resolved.grading.scores),finalNotes:clone(resolved.notes),
  proposedSources:resolved.source,
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
 for(const key of metaKeys)
  blank.meta[key]=cleanString(raw.meta[key]??(key==="minutesScopeMode"?"specialist":""),300);
 if(!validMinutesScopes.has(blank.meta.minutesScopeMode))throw Error("صياغة فئة المحضر غير معروفة");
 if(!validDecisions.has(blank.meta.decision))throw Error("قرار لجنة غير معروف");
 for(const key of Object.keys(raw.meta))if(!metaKeys.has(key))throw Error("حقل تعريف غير معروف");
 blank.final=checkContribution(raw.final,blank.rubricId,null,false);
 for(const {id} of SEATS){
  if(!own(raw.members,id))throw Error("مساهمة مفقودة");
  blank.members[id]=checkContribution(raw.members[id],blank.rubricId,blank.final.grading.profile,true);
 }
 for(const key of Object.keys(raw.members))if(!ids.has(key))throw Error("مقعد إضافي غير معروف");
 const edits=raw.finalNoteEdits;
 if(edits!==undefined){
  if(!Array.isArray(edits)||edits.some(x=>typeof x!=="string")||new Set(edits).size!==edits.length)
   throw Error("تعديلات نصوص المفتش غير صالحة");
  const allowed=new Set([
   ...proseFields.map(x=>editKey(x)),
   ...lessonItems(blank.final.grading).map(x=>editKey("lesson",x.id)),
   ...DISCUSSION.map(x=>editKey("discussion",x.id))
  ]);
  if(edits.some(x=>!allowed.has(x)))throw Error("معرف تعديل نصي غير معروف");
  blank.finalNoteEdits=[...edits];
 }else{
  // Legacy ARCH-01D2-P1 files remain importable; their authored text wins.
  blank.finalNoteEdits=[
   ...proseFields.filter(x=>blank.final.notes[x]).map(x=>editKey(x)),
   ...["lesson","discussion"].flatMap(phase=>Object.entries(blank.final.notes[phase])
    .filter(([,v])=>v).map(([id])=>editKey(phase,id)))
  ];
 }
 blank.serial=raw.serial;
 return blank;
}
export function stringifyCommittee(state){return JSON.stringify(restoreCommittee(state),null,2)}
