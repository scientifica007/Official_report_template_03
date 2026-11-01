/* P4-B12 — shared, static Arabic administrative wording for both renderers.
 * Only template language is reviewed here. Committee-authored text and original
 * contribution metadata remain untouched.
 */
export const COMMITTEE_APPROVAL_HEADING="مصادقة أعضاء اللجنة";
export const MINUTES_TITLE="محضر التفتيش قصد الترسيم";
export const MINUTES_SCOPE="للأساتذة المتخصصين في التكوين والتعليم المهنيين.";
export const MINUTES_SCOPES=Object.freeze({
 specialist:MINUTES_SCOPE,
 rehabilitation:"للأساتذة المتخصصين في التكوين والتعليم المهنيين لإعادة التكييف.",
 general:"لأساتذة التكوين المهني.",
 custom:""
});
export function minutesScopeText(meta){
 const choice=meta?.minutesScopeMode||"specialist";
 return choice==="custom"?(meta?.minutesScopeCustom||""):MINUTES_SCOPES[choice]||MINUTES_SCOPE;
}
export const LEGAL_REFERENCES="المرسوم التنفيذي رقم 09-93 المؤرخ في 26 صفر عام 1430، والقرار رقم 03 المؤرخ في 06 جانفي 2015.";
export const MINUTES_RESULTS_INTRO="أسفرت مداولات لجنة الامتحان عن النتائج الآتية:";
export const DISCUSSION_RESULT_TITLE="2 - المناقشة";
export const MINUTES_OPENING_LEAD="نحن الموقّعون أدناه، أعضاء لجنة التفتيش قصد الترسيم، نصرّح بأننا شاركنا يوم ";
export function minutesOpeningText(d,empty="................................................"){
 const date=d.dateInWords||empty;
 const venue=d.examVenue||empty;
 const candidate=d.candidate||empty;
 return MINUTES_OPENING_LEAD+date+"، بمقرّ: "+venue+
  "، في إجراء امتحان التثبيت للمترشح(ة): "+candidate+".";
}
