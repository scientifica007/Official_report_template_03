// M5.13 — conservative textual improvement of submitted Arabic observations.
// Every clause is copied from authenticated member sources; no new factual
// predicate, number, evidence or recommendation is invented.
const ATTRIBUTION=/(?:العضو\s+(?:الأول|الثاني|الثالث)|رئيس\s+اللجنة|ورد\s+في\s+تقديرات|لاحظ\s+أحد\s+الأعضاء|اتفق\s+أعضاء\s+اللجنة|بحسب\s+رأي\s+العضو)/u;
const NEGATION=/(?:^|[\s،])(?:لم|لن|ليس|ليست|غير|عدم|دون|لا)(?=\s|$)/u;
const NEEDS=/(?:تحسين|ينبغي|يحتاج|ضرورة|قصور|نقص|صعوبة|ضعف|إعادة|تدارك|تطوير)/u;
const POSITIVE=/(?:أحسن|نجح|تمكن|جيد|جيدة|ملائم|مناسب|منظم|سليم|متقن|فعال|فعّال|واضح|محكم|متوازن|دقيق)/u;
const DIACRITICS=/[\u064b-\u065f\u0670\u0640]/gu;
const normalize=s=>String(s).normalize("NFKC").replace(DIACRITICS,"")
 .replace(/[إأآٱ]/gu,"ا").replace(/ى/gu,"ي").replace(/ؤ/gu,"و").replace(/ئ/gu,"ي")
 .replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/gu," ").trim().toLowerCase();
const clean=s=>s.replace(/\s+/gu," ").replace(/^[،؛;.!؟\s]+|[،؛;.!؟\s]+$/gu,"").trim();
const mark=s=>{
 // Do not classify a negative adjective as positive just because it
 // contains "جيد" in "غير جيد".
 const negative=NEGATION.test(s)||/(?:قصور|نقص|صعوبة|ضعف|تعثر|فشل|عجز)/u.test(s);
 const improvement=negative||NEEDS.test(s);
 const positive=POSITIVE.test(s);
 return improvement?"improvement":positive?"strength":"observation";
};
const split=s=>String(s).split(/(?:[؛;]+|[.!؟](?=\s|$)|\r?\n)+/u)
 .map(clean).filter(Boolean);
export function composeGroundedProse(entries){
 if(!Array.isArray(entries)||entries.length>3||entries.some(x=>typeof x!=="string"||x.length>4000))
  throw Error("العبارات المدخلة غير صالحة للمراجعة المهنية.");
 const originalClauses=entries.flatMap(split);
 // Preserve the first original clause; only identical normalized clauses
 // are removed. Never deduplicate sentences solely by semantic similarity.
 const seen=new Set(),clauses=[];let duplicates=0;
 for(const clause of originalClauses){
  const key=normalize(clause);
  if(seen.has(key)){duplicates++;continue}
  seen.add(key);
  clauses.push({text:clause,category:mark(clause)});
 }
 // Keep the same order of source statements. Reordering alone can alter
 // the professional emphasis and the relation between evidence and finding.
 const candidate=clauses.map(c=>c.text).join("؛ ").replace(/[؛\s]+$/u,"");
 return {
  candidate:candidate?candidate+".":"",
  clauseDuplicates:duplicates,
  clauseCount:clauses.length,
  breakdown:{
   strength:clauses.filter(c=>c.category==="strength").length,
   improvement:clauses.filter(c=>c.category==="improvement").length,
   observation:clauses.filter(c=>c.category==="observation").length
  },
  clauses
 };
}
const numeralTokens=s=>(String(s).match(/[0-9٠-٩۰-۹]+(?:[.,٫][0-9٠-٩۰-۹]+)?%?/gu)||[])
 .map(s=>s.replace(/[٠-٩]/gu,x=>String(x.charCodeAt(0)-1632))
  .replace(/[۰-۹]/gu,x=>String(x.charCodeAt(0)-1776))
  .replace(/٫/gu,"."));
/**
 * Human-edited draft is not described as an AI-authenticated finding.
 * We block contributor attributions and invalid lengths; any newly entered
 * figure receives a warning requiring the inspector's explicit review.
 */
export function auditInspectorDraft(value,sources=[]){
 if(typeof value!=="string")throw Error("صياغة غير صالحة.");
 const text=value.trim().replace(/[ \t]+/gu," ");
 if(!text)throw Error("الصياغة فارغة. راجع النص قبل الإدراج.");
 if(text.length>4000)throw Error("الصياغة أطول من الحد المسموح (4000 حرف).");
 if(ATTRIBUTION.test(text))
  throw Error("تتضمن الصياغة نسبة قول إلى عضو اللجنة. حررها بصوت مهني موحد.");
 const baseline=sources.map(s=>s.original??s.text??"").join(" ");
 const known=new Set(numeralTokens(baseline));
 const introduced=[...new Set(numeralTokens(text).filter(n=>!known.has(n)))];
 return {
  text,
  introducedNumbers:introduced,
  warnings:introduced.length?["أضيفت أرقام غير واردة في تقديرات الأعضاء: "+
   introduced.join("، ")+"؛ تحقق من دليلها قبل الإدراج."]:[],
  requiresHumanReview:introduced.length>0
 };
}
