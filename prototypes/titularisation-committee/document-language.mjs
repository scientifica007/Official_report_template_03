/* P4-B12 — shared, static Arabic administrative wording for both renderers.
 * Only template language is reviewed here. Committee-authored text and original
 * contribution metadata remain untouched.
 */
export const COMMITTEE_APPROVAL_HEADING="مصادقة أعضاء اللجنة";
export const MINUTES_TITLE="محضر التفتيش قصد الترسيم";
export const MINUTES_SCOPE="للأساتذة المتخصصين في التكوين والتعليم المهنيين، والأساتذة المتخصصين في التكوين والتعليم المهنيين لإعادة التكييف";
export const LEGAL_REFERENCES="المرسوم التنفيذي رقم 09-93 المؤرخ في 26 صفر عام 1430، والقرار رقم 03 المؤرخ في 06 جانفي 2015.";
export const MINUTES_RESULTS_INTRO="بعد مداولة لجنة الامتحان، جاءت النتائج كما يأتي:";
export const DISCUSSION_RESULT_TITLE="2 - المناقشة";
export const MINUTES_OPENING_LEAD="نحن الموقّعون أدناه، أعضاء لجنة التفتيش قصد الترسيم، نصرّح بأننا شاركنا يوم ";
export function minutesOpeningText(d,empty="................................................"){
 const date=d.dateInWords||empty;
 const venue=d.examVenue||empty;
 const candidate=d.candidate||empty;
 return MINUTES_OPENING_LEAD+date+"، بمقرّ: "+venue+
  "، في إجراء امتحان التثبيت للمترشح(ة): "+candidate+".";
}
