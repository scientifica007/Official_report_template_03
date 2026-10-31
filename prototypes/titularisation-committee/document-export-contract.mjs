/* Portable, self-describing export; preserves the accepted v1 raw state shape.
 * No private data is sent to any model or cloud service: export is local. */
import {stringifyCommittee} from "./committee-engine.mjs";
import {buildReferenceDocuments} from "./document-model.mjs";
export const PORTABLE_CONTRACT_VERSION="titularisation-report-contract-v2";
const templateRoot="https://github.com/scientifica007/Official_report_template_03/blob/main/prototypes/titularisation-committee/";
export function portableCommitteeObject(state){
 const raw=JSON.parse(stringifyCommittee(state));
 const d=buildReferenceDocuments(state);
 return {
  ...raw,
  documentContract:{
   version:PORTABLE_CONTRACT_VERSION,
   locale:"ar-DZ",direction:"rtl",paperSize:"A4",
   template:{
    id:d.referenceId,sourceModel:"تقرير التفتيش قصد ترسيم الأساتذة",
    supportedSourceScope:"الرتب المتخصصة وفق المرجع، ويُراجع باقي الرتب منفردة",
    reportPages:5,reportPagesAreDynamic:true,minutesPages:1,layoutUnit:"millimeter",
    sections:["غلاف التقرير","بيانات المترشح والامتحان","تقويم الحصة /40",
     "تقويم المناقشة /20","النتائج والمداولة والإمضاءات","المحضر المستقل"],
    print:{format:"A4",rtl:true,footerPages:[1,2,3,4,5],minutesHasFooter:false,
     footerPattern:"تقرير عملية التفتيش قصد الترسيم للأستاذ المتربص: {candidate} المؤسسة: {institution}، {monthYear}، الصفحة {page} من {totalReportPages}",
     totalReportPagesCalculatedAfterPagination:true,
     lineAboveFooter:true},
    editableSource:templateRoot+"docx-export.mjs",
    printableSource:templateRoot+"preview.mjs",
    sharedModelSource:templateRoot+"document-model.mjs",
    metadata:"Report has five baseline sections, but additional printed pages are created as needed for long prose. Number report physical pages after pagination; never include the minutes page in the denominator. Formatting fidelity requires the referenced renderer."
   },
   policy:{
    printableDocumentsAreDraftsUntilPaperSignatures:true,
    independentInspectorEditing:true,
    manualDecisionOnly:true,noElectronicApproval:true,
    noImplicitOverwriteOfAuthoredScores:true,
    proposedGradesAreNotCommitteeVerdicts:true,
    generalAppreciationIsOptionalEditableSuggestion:true,
    marksStep:0.5,zeroIsNotMissing:true,
    finalMarkScale20:"total60 / 3; unrounded display is allowed",
    appreciationRanges20:[
     {min:0,maxExclusive:10,label:"ضعيف/غير مقبول"},
     {min:10,maxExclusive:11,label:"مقبول"},
     {min:11,maxExclusive:13,label:"حسن"},
     {min:13,maxExclusive:15,label:"جيد"},
     {min:15,maxInclusive:20,label:"جيد جدًّا"}]
   },
   outputData:{
    candidate:d.candidate,meta:d.meta,reportTitle:d.reportTitle,rankScopeWarning:d.referenceScopeWarning,
    rubricId:d.rubricId,rubricLabel:d.rubricLabel,
    lessonCriteria:d.lessonRows,discussionCriteria:d.discussionRows,
    lessonMarks:d.marks.lesson,discussionMarks:d.marks.discussion,
    total60:d.marks.total60,total20:d.marks.total20,
    proposedAppreciation:d.proposedAppreciation,
    displayedAppreciation:d.displayedAppreciation,
    appreciationIsSuggestion:d.appreciationIsSuggestion,
    finalAuthorText:d.prose,
    originalSubmittedMemberObservations:d.memberObservations,
    printNumberFormat:"00.00 (display only; stored scores remain numeric)",
    committeeDecisionCode:d.decisionCode,committeeDecisionLabel:d.decision,
    reportFooters:[1,2,3,4,5].map(i=>d.reportFooter(i)),
    reportFooterPreviewIsBaselineOnly:true,
    minutesDateInWords:d.dateInWords,
    minutesExamVenue:d.examVenue,
    paperSignatures:d.signers
   },
   attribution:{
    authoredInspectorMarks:raw.final.grading.scores,
    authoredInspectorNotes:raw.final.notes,
    inspectorTextEditKeys:raw.finalNoteEdits,
    memberContributionsRetainedSeparately:"members",
    unresolvedProposalsNotAnApproval:true
   },
   externalAIGuidance:"Edit only the inspector-authored draft fields when instructed, preserve submitted original member contributions, check mark caps and half-point rules, keep decision manually authored. Render via the referenced template code, compare page layout to the official reference, then request inspector review before signatures."
  }
 };
}
export function stringifyPortableCommittee(state){
 return JSON.stringify(portableCommitteeObject(state),null,2);
}
