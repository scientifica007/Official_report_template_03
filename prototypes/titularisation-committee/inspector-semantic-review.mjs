// M5.14: source-traced, rule-based pedagogical relationship analysis.
// "Semantic" here means a transparent, bounded domain lexicon; NOT full NLP,
// causal inference, scoring, or automated committee consensus.
// This module is only imported by the inspector-authorized QA editor.
const DOMAINS=Object.freeze([
 {id:"time",title:"التسيير الزمني",terms:[
  "الوقت","الزمن","زمني","زمنية","التوقيت","التوقيتات","المدة","توزيع الحصص","الوقت المخصص"
 ]},
 {id:"completion",title:"استكمال الأنشطة",terms:[
  "استكمل","يستكمل","تستكمل","استكمال","اكتمال","اكمل","انجاز","انجز","ينجز","اتمام",
  "اتم","انتهاء النشاط","بقي النشاط","بقيت الانشطة","النشاط غير منجز","استوفي","استيفاء"
 ]},
 {id:"organization",title:"تنظيم الحصة وتسلسلها",terms:[
  "تنظيم","تسلسل","تدرج","تخطيط","مراحل الحصة","سير الحصة","هيكلة"
 ]},
 {id:"objectives",title:"أهداف التعلم والكفاءات",terms:[
  "اهداف","الهدف","هدف","الكفاءة","الكفاءات","نواتج التعلم","مكتسبات التعلم"
 ]},
 {id:"assessment",title:"التقويم والتغذية الراجعة",terms:[
  "التقويم","تقويم","تقييم","التغذية الراجعة","الاسئلة التقويمية","قياس التعلمات"
 ]},
 {id:"participation",title:"مشاركة المتربصين",terms:[
  "مشاركة","تفاعل","انخراط","اندماج","تحفيز المتربصين","اسهام المتربصين"
 ]},
 {id:"methods",title:"طرائق التنشيط والتدريس",terms:[
  "طريقة التدريس","طرائق التدريس","طرائق","اسلوب التنشيط","المنهجية","التعلم النشط","المقاربة"
 ]},
 {id:"resources",title:"الوسائل والتجهيزات",terms:[
  "الوسائل","وسيلة","العتاد","التجهيزات","تجهيز","المعدات","الوسائط","جهاز"
 ]},
 {id:"safety",title:"السلامة والوقاية",terms:[
  "السلامة","الوقاية","حماية المتربصين","المخاطر","قواعد الامن"
 ]},
 {id:"practice",title:"التطبيق والممارسة المهنية",terms:[
  "التطبيقي","التطبيقية","التطبيق","التجربة العملية","الممارسة المهنية","الورشة","المناولة"
 ]}
]);
const RELATIONS=Object.freeze([
 {a:"time",b:"completion",why:"التسيير الزمني واستكمال الأنشطة موضوعان مترابطان في مراجعة الحصة؛ لا تثبت الملاحظتان أن أحدهما سبب الآخر."},
 {a:"organization",b:"completion",why:"تنظيم المراحل واستكمال الأنشطة قد يستحقان مراجعة مشتركة؛ لا تُستنتج علاقة سببية من التقارب الموضوعي."},
 {a:"objectives",b:"assessment",why:"أهداف التعلم والتقويم موضوعان قد يتكاملان عند مراجعة الحصة؛ لا يدل ذلك وحده على تحقق الأهداف."},
 {a:"methods",b:"participation",why:"طرائق التنشيط ومشاركة المتربصين مجالان قابلان للمراجعة معًا؛ لا تثبت الملاحظات علاقة تأثير بينهما."},
 {a:"resources",b:"practice",why:"الوسائل والتطبيق العملي قد يرتبطان في المراجعة المهنية؛ لا يُفترض تأثير أحدهما على الآخر دون دليل."}
]);
const norm=s=>String(s).normalize("NFKC")
 .replace(/[\u064b-\u065f\u0670\u0640]/gu,"")
 .replace(/[إأآٱ]/gu,"ا").replace(/ى/gu,"ي")
 .replace(/ؤ/gu,"و").replace(/ئ/gu,"ي")
 .replace(/[^\p{L}\p{N}]+/gu," ").replace(/\s+/gu," ").trim().toLowerCase();
const split=s=>String(s).split(/(?:[؛;.!؟\r\n]+|[،,]\s*(?=(?:لكن|غير ان|الا ان)\s)|\s+(?=لكن\s))/u)
 .map(x=>x.trim().replace(/^[،؛.!؟\s]+|[،؛.!؟\s]+$/gu,"")).filter(Boolean);
const prefixes=/(?:^|\s)(?:لم|لن|لا|ليس|ليست|غير|عدم|دون)(?=\s)/u;
const deficiencies=/(?:^|\s)(?:ضعف|ضعيف|ضعيفة|سوء|نقص|قصور|تعثر|فشل|عجز|تاخر|صعوبة|اشكال|بقي|تراجع)(?=\s)/u;
const strengths=/(?:^|\s)(?:احسن|نجح|تمكن|استكمل|استكمال|اكمل|اتم|انجز|اتقن|حقق|احترم|استوفي|جيد|جيدة|مناسب|مناسبة|ملائم|ملائمة|سليم|متقن|فعال|واضح|متوازن)(?=\s|$)/u;
const negatedPositive=/(?:^|\s)(?:لم|لن|لا|ليس|ليست|غير|دون)\s+(?:(?:\p{L}+)\s+){0,2}(?:احسن|نجح|تمكن|استكمل|اكمل|اتم|انجز|اتقن|حقق|جيد|مناسب|ملائم|متوازن)(?=\s|$)/u;
const domainIndex=Object.freeze(Object.fromEntries(DOMAINS.map(x=>[x.id,x])));
function stance(raw){
 const t=norm(raw);
 const neg=prefixes.test(t)||deficiencies.test(t);
 const pos=strengths.test(t);
 if(negatedPositive.test(t))return "negative";
 if(neg&&pos)return "mixed";
 if(neg)return "negative";
 if(pos)return "positive";
 return "unclassified";
}
function tag(raw){
 const t=norm(raw);
 return DOMAINS.filter(d=>d.terms.some(term=>t.includes(norm(term)))).map(x=>x.id);
}
function evidence(field,src,raw,ordinal){
 return {
  id:field.key+"|"+src.seat_code+"|"+ordinal,
  fieldKey:field.key,fieldTitle:field.title,
  seatCode:src.seat_code,seatLabel:src.seat_label,
  revision:src.revision,text:raw,topics:tag(raw),stance:stance(raw)
 };
}
const differentMembers=(a,b)=>a.seatCode!==b.seatCode;
const uniqueSources=items=>[...new Set(items.map(x=>x.seatCode))];
const pairId=(a,b)=>[a.id,b.id].sort().join("::");
/**
 * Bounded read-only annotations. Each finding retains exact submitted text,
 * seat code, field and revision. No claims are inserted into the official
 * draft. Avoid "consensus" wording: sharing a theme is not shared judgment.
 */
export function analyzePedagogicalRelations(fields){
 if(!Array.isArray(fields)||fields.some(f=>!f||!Array.isArray(f.sources)))
  throw Error("حقول التركيب الدلالي غير صالحة.");
 const assertions=[];
 const MAX=240;let omitted=0;
 for(const field of fields){
  for(const src of field.sources){
   if(!src||typeof src.text!=="string"||typeof src.seat_code!=="string")
    throw Error("مصدر تقدير غير صالح.");
   for(const [i,clause] of split(src.text).entries()){
    if(assertions.length>=MAX){omitted++;continue}
    const e=evidence(field,src,clause,i);
    if(e.topics.length)assertions.push(e);
   }
  }
 }
 const groups=[];
 for(const domain of DOMAINS){
  const examples=assertions.filter(x=>x.topics.includes(domain.id));
  if(uniqueSources(examples).length>=2){
   groups.push({
    id:domain.id,title:domain.title,
    kind:"thematic_proximity",
    // Do not assert substantive agreement or a vote.
    explanation:"تكررت الإشارة إلى هذا المحور في مصادر أعضاء مختلفين. تشابه الموضوع لا يعني اتفاق التقدير أو صحته.",
    evidence:examples.slice(0,12),count:examples.length
   });
  }
 }
 const conflicts=[],conflictIds=new Set(),fieldConflicts={};
 const pairSeen=new Set();
 for(const domain of DOMAINS){
  const mentions=assertions.filter(x=>x.topics.includes(domain.id));
  for(let i=0;i<mentions.length;i++)for(let j=i+1;j<mentions.length;j++){
   const a=mentions[i],b=mentions[j];
   if(!differentMembers(a,b)||
      !((a.stance==="positive"&&b.stance==="negative")||
        (a.stance==="negative"&&b.stance==="positive")))continue;
   const id=pairId(a,b);
   if(pairSeen.has(id))continue;
   pairSeen.add(id);
   if(conflicts.length>=20)continue;
   conflicts.push({
    id,topic:domain.id,title:domain.title,
    kind:"possible_disagreement",
    explanation:"إشارتان متقابلتان لفظيًا في المحور نفسه، من عضوين مختلفين. قد تختلف زاوية الملاحظة أو سياقها؛ يلزم الرجوع إلى النصين قبل الحكم.",
    first:a,second:b
   });
   conflictIds.add(a.fieldKey);conflictIds.add(b.fieldKey);
   for(const field of [a.fieldKey,b.fieldKey]){
    fieldConflicts[field]=(fieldConflicts[field]||0)+1;
   }
  }
 }
 const relations=[];
 const relationSeen=new Set();
 for(const link of RELATIONS){
  const left=assertions.filter(x=>x.topics.includes(link.a));
  const right=assertions.filter(x=>x.topics.includes(link.b));
  const pair=left.flatMap(a=>right.filter(b=>differentMembers(a,b)&&a.id!==b.id)
    .map(b=>({a,b}))).find(({a,b})=>a.fieldKey!==b.fieldKey||a.text!==b.text);
  if(!pair)continue;
  const key=link.a+"::"+link.b;
  if(relationSeen.has(key))continue;
  relationSeen.add(key);
  relations.push({
   id:key,kind:"thematic_connection",
   firstTopic:domainIndex[link.a].title,secondTopic:domainIndex[link.b].title,
   explanation:link.why,first:pair.a,second:pair.b
  });
 }
 return {
  method:"local-pedagogical-lexicon-v1",
  coverage:"استدلالات لغوية محدودة؛ الملاحظات غير المصنفة لا تُعدّ غائبة عن المصادر.",
  groups,conflicts,relations,
  fieldConflicts,conflictedFields:[...conflictIds],
  evidenceCount:assertions.length,omittedCount:omitted,
  // Never imply a causation or a statistical consensus from these counts.
  totalFindings:groups.length+conflicts.length+relations.length
 };
}
