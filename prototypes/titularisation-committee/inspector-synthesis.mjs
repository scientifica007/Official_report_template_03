// M5.12 — conservative, deterministic Arabic prose organizer.
// This module NEVER contacts a model or network, changes scores, or claims
// agreement. Every proposed clause comes from an actual submitted text.
// Source identities are retained in the inspector review ONLY.
import {RUBRICS,GROUPS,TEN,DISCUSSION} from "../titularisation-workbench/engine.mjs";
import {composeGroundedProse} from "./inspector-prose-quality.mjs";

const PROSE=[
 ["lessonSummary","التقدير العام للحصة"],
 ["discussionSummary","التقدير العام للمناقشة"],
 ["general","التقدير العام"],
 ["recommendations","التوصيات"]
];
const SEAT_LABELS=Object.freeze({
 member1:"العضو الأول",member2:"العضو الثاني",member3:"العضو الثالث"
});
const INVALID_ATTRIBUTION=/(?:العضو\s+(?:الأول|الثاني|الثالث)|رئيس\s+اللجنة|ورد\s+في\s+تقديرات|لاحظ\s+أحد\s+الأعضاء|اتفق\s+أعضاء\s+اللجنة)/u;
const NEGATIONS=/\b(?:لم|لن|ليس|ليست|غير|دون|عدم|لا)\b/u;
const NEGATIVE=/(?:ضعيف|ضعف|قصور|نقص|عجز|فشل|تعثر|صعوبة|غير\s+مناسب|غير\s+جيد|لم\s+يتمكن|لم\s+يحسن)/u;
const POSITIVE=/(?:جيد|مناسب|محكم|واضح|نجح|تمكن|أحسن|متقن|فعّال|فعال|منظم|سليم)/u;
const STOP=new Set(["من","في","على","إلى","الى","عن","مع","كان","كانت","هو","هي","هذا","هذه",
 "لدى","وقد","كما","أن","إن","تم","فيما","خلال","الأستاذ","الاستاذ","الحصة","المناقشة","بصورة",
 "بشكل","جدا","ذلك","أثناء","بين","و","لا","لم","غير","دون","ليس","ليست","عدم","هناك"]);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=o=>!!o&&typeof o==="object"&&!Array.isArray(o);
const normalize=s=>String(s).normalize("NFKC")
 .replace(/[\u064b-\u065f\u0670\u0640]/gu,"")
 .replace(/[إأآٱ]/gu,"ا").replace(/ى/gu,"ي").replace(/ؤ/gu,"و").replace(/ئ/gu,"ي")
 .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/gu," ");
const lex=s=>normalize(s).toLowerCase().split(/\s+/u).filter(t=>t.length>1&&!STOP.has(t));
const set=x=>new Set(lex(x));
const common=(a,b)=>[...a].filter(t=>b.has(t)).length;
function sourceText(raw){
 if(typeof raw!=="string"||raw.length>4000)throw Error("تقدير كتابي غير صالح أو أطول من المسموح.");
 let s=raw.trim().replace(/\s+/gu," ");
 // Strip only the exact generated synthetic attribution wrapper.
 s=s.replace(/^بيانات\s+تجريبية\s*—\s*(?:رئيس\s+اللجنة(?:\s*\(المفتش\))?|العضو\s+(?:الأول|الثاني|الثالث))(?:\s*—\s*[^:]{1,120})?\s*:\s*/u,"");
 s=s.replace(/^اقتراح\s+تجريبي\s*:\s*/u,"");
 return s.replace(/^[؛،.\s]+|[؛،.\s]+$/gu,"").trim();
}
const marker=s=>{
 const pos=POSITIVE.test(s),neg=NEGATIVE.test(s),deny=NEGATIONS.test(s);
 // "لم يحسن" and "غير جيد" must not be merged with an affirmative.
 return neg||deny?"negative":pos?"positive":"unspecified";
};
const tokenSimilarity=(a,b)=>{
 const aa=set(a),bb=set(b),share=common(aa,bb);
 return {share,jaccard:share/Math.max(1,new Set([...aa,...bb]).size),
  coverage:share/Math.max(1,Math.min(aa.size,bb.size))};
};
function duplicate(a,b){
 const x=normalize(a),y=normalize(b);
 if(x===y)return true;
 if(marker(a)!==marker(b))return false;
 const sim=tokenSimilarity(a,b);
 return x.length>25&&y.length>25&&sim.share>=4&&sim.jaccard>=0.94;
}
function possibleContradiction(a,b){
 const left=marker(a),right=marker(b);
 if(!((left==="positive"&&right==="negative")||
   (right==="positive"&&left==="negative")))return false;
 const sim=tokenSimilarity(a,b);
 // A deliberately cautious signal for inspector review, not a factual verdict.
 return sim.share>=2&&sim.coverage>=0.42;
}
function labelRows(rubricId){
 const key=Object.keys(RUBRICS).find(k=>RUBRICS[k].id===rubricId);
 if(!key)throw Error("شبكة تنقيط غير مدعومة في التركيب.");
 const lesson=key==="grouped5"?GROUPS:key==="inspector10"?TEN:
  GROUPS.flatMap(g=>g.items);
 return [
  ...lesson.map(i=>({field:"lesson",itemId:i.id,title:"الحصة — "+i.label})),
  ...DISCUSSION.map(i=>({field:"discussion",itemId:i.id,title:"المناقشة — "+i.label})),
  ...PROSE.map(([field,title])=>({field,itemId:null,title}))
 ];
}
export function sourceFingerprint(source){
 // Includes text and revision, so a post-preview member correction revokes
 // the previous proposal even when seat count stays unchanged.
 return JSON.stringify([source.mission_id,source.rubric_id,(source.rows||[])
  .map(row=>[row.seat_code,row.revision,row.submitted_at,row.notes])]);
}
export function synthesizeInspectorNotes(source){
 if(!plain(source)||source.owner_only!==true||source.qa_only!==true||
  typeof source.mission_id!=="string"||!Array.isArray(source.rows)||
  source.rows.length>3)throw Error("مصادر التركيب لم تجتز تحقق المفتش.");
 const definitions=labelRows(source.rubric_id);
 const seats=new Set();
 for(const row of source.rows){
  if(!plain(row)||!own(SEAT_LABELS,row.seat_code)||seats.has(row.seat_code)||
   !plain(row.notes)||!plain(row.notes.lesson)||!plain(row.notes.discussion))
   throw Error("مساهمة غير معروفة أو مكررة.");
  seats.add(row.seat_code);
 }
 const fields=[];
 for(const definition of definitions){
  const sources=[];
  for(const row of source.rows){
   const value=definition.itemId?
    row.notes[definition.field][definition.itemId]:row.notes[definition.field];
   const clean=sourceText(value??"");
   if(clean)sources.push({seat_code:row.seat_code,
    seat_label:SEAT_LABELS[row.seat_code],text:clean,
    original:value,revision:row.revision});
  }
  if(!sources.length)continue;
  const groups=[];
  for(const entry of sources){
   const match=groups.find(group=>duplicate(group.text,entry.text));
   if(match)match.sources.push(entry);
   else groups.push({text:entry.text,sources:[entry]});
  }
  const collisions=[];
  const conflicted=new Set();
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
   if(possibleContradiction(groups[i].text,groups[j].text)){
    conflicted.add(i);conflicted.add(j);
    collisions.push({first:groups[i].sources,second:groups[j].sources});
   }
  }
  const unsafe=groups.some(g=>INVALID_ATTRIBUTION.test(g.text));
  const nonconflicting=groups.filter((g,i)=>!conflicted.has(i));
  // M5.13: retain each original source and remove duplicated *clauses*,
  // including when members wrote several observations in one text field.
  const quality=composeGroundedProse(nonconflicting.map(g=>g.text));
  const proposed=quality.candidate;
  const tooLong=proposed.length>3900;
  const blocked=collisions.length>0||unsafe||tooLong;
  fields.push({
   key:definition.itemId?definition.field+":"+definition.itemId:"field:"+definition.field,
   field:definition.field,itemId:definition.itemId,title:definition.title,
   candidate:blocked?"":proposed,
   blocked,
   reasons:[
    ...(collisions.length?["توجد عبارات قد تكون متعارضة؛ راجع المصادر واحسمها قبل التحرير."]:[]),
    ...(unsafe?["تتضمن إحدى العبارات نسبة قول إلى عضو؛ يلزم تحريرها بصوت مهني واحد."]:[]),
    ...(tooLong?["النص المقترح أطول من الحد المسموح؛ يلزم اختصاره يدويًا."]:[])
   ],
   sources,
   distinctCount:groups.length,
   duplicateCount:sources.length-groups.length,
   clauseDuplicates:quality.clauseDuplicates,
   clauseCount:quality.clauseCount,
   breakdown:quality.breakdown,
   possibleConflicts:collisions.length
  });
 }
 return {mission_id:source.mission_id,rubric_id:source.rubric_id,seatCount:seats.size,
  fields,sourceFingerprint:sourceFingerprint(source)};
}
