/* ARCH-01D2-P4-B — document projection only.
 * The inspector's editable committee state remains the sole source of data.
 * This is a draft adaptation of the six-page reference for specialized ranks,
 * never evidence of legal template approval or a committee signature. */
import {documentData,SEATS} from "./committee-engine.mjs";
import {minutesScopeText} from "./document-language.mjs";
import {dateInArabicWords,reportFooter,reportMonthYear,suggestedAppreciation,struckChoices} from "./document-rules.mjs";
import {RUBRICS,GROUPS,DISCUSSION,lessonItems} from "../titularisation-workbench/engine.mjs";
export const REFERENCE_ID="specialist-reference-2015-draft-v1";
export const DECISIONS=Object.freeze([
 ["","— لم يُحدد بعد —"],["success","ناجح(ة)"],
 ["first","التأجيل الأول"],["second","التأجيل الثاني"]
]);
const has=Object.hasOwn;
// Printed numerical notation: leading zero and two decimals. Never mutate grades.
const mark=v=>typeof v==="number"&&Number.isFinite(v)?
 v.toFixed(2).padStart(5,"0"):"—";
export {mark};
/** Remove only automatically generated test-attribution prefixes in print. */
export function printableAssessmentText(value){
 return String(value??"").replace(
  /^بيانات تجريبية\s*—\s*(?:رئيس اللجنة(?:\s*\(المفتش\))?|العضو الأول|العضو الثاني|العضو الثالث)(?:\s*—\s*[^:]{1,120})?:\s*/u,""
 );
}
const val=x=>typeof x==="string"?x.trim():"";
const metaValue=(m,key)=>val(m[key])||"................................................";
const note=x=>val(x)||"";
function scoredGroup(g,grades,profile){
 const rows=g.items.map(item=>{
  const cap=profile?.weights?.[item.id]??null;
  return {id:item.id,label:item.label,cap,score:grades[item.id]};
 });
 const active=rows.filter(x=>x.cap!==0);
 const complete=active.every(x=>typeof x.score==="number");
 return {id:g.id,label:g.label,cap:g.cap,
  indicators:rows.map(x=>x.label),score:complete?active.reduce((n,x)=>n+x.score,0):null};
}
function memberPhaseObservations(state,phase){
 if(state.mode!=="individual")return [];
 const grading=state.final.grading;
 const labels=Object.fromEntries((phase==="lesson"?
  lessonItems(grading):DISCUSSION).map(item=>[item.id,item.label]));
 const results=[];
 for(const seat of SEATS){
  const c=state.members[seat.id];
  if(!c?.submitted)continue;
  const source=val(state.meta[seat.id+"Name"])||seat.label;
  const summary=val(c.notes[phase==="lesson"?"lessonSummary":"discussionSummary"]);
  if(summary)results.push({author:seat.label+" — "+source,criterion:"تقدير عام",text:summary});
  for(const [id,value] of Object.entries(c.notes[phase]||{})){
   const text=val(value);
   if(text)results.push({author:seat.label+" — "+source,
    criterion:labels[id]||id,text});
  }
 }
 return results;
}
export function buildReferenceDocuments(state){
 const data=documentData(state),m=data.meta,r=data.result;
 const rubric=Object.values(RUBRICS).find(x=>x.id===state.rubricId);
 if(!rubric)throw Error("شبكة تنقيط غير معروفة");
 const isSpecialist=/متخصص/.test(val(m.rank));
 const professionalTitle=isSpecialist?
  "تقرير التفتيش قصد ترسيم الأساتذة المتخصصين في التكوين والتعليم المهنيين":
  "تقرير التفتيش قصد ترسيم أساتذة التكوين المهني — مسودة غير معتمدة لهذه الرتبة";
 const rows=state.rubricId===RUBRICS.analytical14.id?
  GROUPS.map(g=>scoredGroup(g,data.finalGrades.lesson,state.final.grading.profile)):
  state.rubricId===RUBRICS.grouped5.id?
  GROUPS.map(g=>({id:g.id,label:g.label,cap:g.cap,
   score:data.finalGrades.lesson[g.id],indicators:g.items.map(x=>x.label)})):
  lessonItems(state.final.grading).map(row=>({id:row.id,label:row.label,
   cap:row.cap,score:data.finalGrades.lesson[row.id],indicators:[]}));
 const conversation=DISCUSSION.map(row=>({
  ...row,score:data.finalGrades.discussion[row.id]
 }));
 const suggestedScores=Object.values(data.proposedSources.lesson).length+
  Object.values(data.proposedSources.discussion).length;
 const pendingTexts=Object.values(data.proposedSources.notes.lesson).length+
  Object.values(data.proposedSources.notes.discussion).length+
  ["lessonSummary","discussionSummary","general","recommendations"]
    .filter(k=>data.proposedSources.notes[k]).length;
 const signers=[
  {label:"العضو الأول",name:metaValue(m,"member1Name"),role:metaValue(m,"member1Role")},
  {label:"العضو الثاني",name:metaValue(m,"member2Name"),role:metaValue(m,"member2Role")},
  {label:"العضو الثالث",name:metaValue(m,"member3Name"),role:metaValue(m,"member3Role")},
  {label:"رئيس اللجنة (المفتش)",name:metaValue(m,"chairName"),role:
   isSpecialist?"مفتش التكوين والتعليم المهنيين":"صفة الرئيس بحسب التنظيم المعمول به"}
 ];
 const grade20=typeof r.total60==="number"?r.total60/3:null;
 return {
  referenceId:REFERENCE_ID,meta:m,rubricId:state.rubricId,rubricLabel:rubric.label,
  minutesScope:minutesScopeText(m),
  dateInWords:dateInArabicWords(m.date),monthYear:reportMonthYear(m.date),
  examVenue:val(m.location)||val(m.examCenter),
  reportFooter:(page,total=5)=>reportFooter(m,page,total),
  decisionChoices:struckChoices(m.decision),
  proposedAppreciation:suggestedAppreciation(grade20),
  displayedAppreciation:note(state.final.notes.general)||suggestedAppreciation(grade20),
  appreciationIsSuggestion:!note(state.final.notes.general)&&!!suggestedAppreciation(grade20),
  specialistReferenceApplicable:isSpecialist,
  referenceScopeWarning:isSpecialist?"":
   "القالب المرجعي الذي قُدم يخص الأساتذة المتخصصين؛ يلزم التحقق من نموذج هذه الرتبة قبل اعتماده.",
  sourceWarning:"نسخة عمل قابلة للتحرير مستندة إلى نموذج مرجعي؛ ليست وثيقة رسمية موقعة.",
  scoreWarning:suggestedScores?
   "تتضمن العلامات "+suggestedScores+" اقتراحًا حسابيًا لم يُحرره المفتش يدويًا. يمكن تعديلها دون اعتماد إلكتروني.":"",
  textWarning:pendingTexts?
   "توجد "+pendingTexts+" مسودة نصية مجمعة للمراجعة داخل المحرر؛ لا تُنسب تلقائيًا إلى اللجنة في التقرير.":"",
  candidate:val(m.candidate)||[m.familyName,m.givenName].filter(Boolean).join(" "),
  candidateBirthDate:val(m.birthDate),candidateBirthPlace:val(m.birthPlace),
  reportTitle:professionalTitle,
  candidateFields:[
   ["اللقب",metaValue(m,"familyName")],["الاسم",metaValue(m,"givenName")],
   ["تاريخ ومكان الميلاد",([val(m.birthDate)||val(m.birth),val(m.birthPlace)].filter(Boolean).join("، ")||metaValue(m,"birth"))],["الرتبة",metaValue(m,"rank")],
   ["تاريخ التنصيب",metaValue(m,"installationDate")],
   ["تاريخ التعيين",metaValue(m,"assignmentDate")],
   ["مؤسسة التعيين",metaValue(m,"assignmentInstitution")],
   ["مركز الامتحان",metaValue(m,"examCenter")],
   ["الشهادة",metaValue(m,"certificate")],["الاختصاص",metaValue(m,"specialty")],
   ["المواد المُدرّسة",metaValue(m,"subjects")],["مكان العمل",metaValue(m,"workplace")],
   ["التربص البيداغوجي: مؤسسة التكوين",metaValue(m,"internshipInstitution")],
   ["فترة التربص: من",metaValue(m,"internshipFrom")],
   ["إلى",metaValue(m,"internshipTo")],
   ["هل تم تأجيل المترشح من قبل؟",metaValue(m,"priorDeferral")],
   ["تاريخ التأجيل السابق",metaValue(m,"priorDeferralDate")]
  ],
  examFields:[
   ["الشعبة المهنية",metaValue(m,"occupationalBranch")],
   ["الاختصاص",metaValue(m,"examSpecialty")],
   ["مستوى التأهيل",metaValue(m,"qualificationLevel")],
   ["المقياس",metaValue(m,"module")],
   ["الموضوع",metaValue(m,"lessonTopic")]
  ],
  discussionTopic:val(m.discussionTopic),
  memberObservations:{
   lesson:memberPhaseObservations(state,"lesson"),
   discussion:memberPhaseObservations(state,"discussion")
  },
  marks:{lesson:r.lesson.total,discussion:r.discussion.total,total60:r.total60,total20:grade20,
   complete:r.complete},
  lessonRows:rows,discussionRows:conversation,
  // The printed report uses *inspector-authored* prose only. The lengthy
  // member-source compilation remains in the existing editor as assistance.
  prose:{
   lesson:note(state.final.notes.lessonSummary),
   discussion:note(state.final.notes.discussionSummary),
   general:note(state.final.notes.general),
   recommendations:note(state.final.notes.recommendations)
  },
  decision:DECISIONS.find(x=>x[0]===m.decision)?.[1]||DECISIONS[0][1],
  decisionCode:m.decision||"",
  signers,
  metaValue:key=>metaValue(m,key)
 };
}