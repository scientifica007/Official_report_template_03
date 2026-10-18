/* ARCH-01D1: Isolated scoring workbench. No Supabase, credentials, or production report writes.
 * Rubric origins are intentionally non-official; score precision and committee
 * decision rules are NOT approved. This module contains deterministic calculations. */
export const SCHEMA = "titularisation-workbench-draft-v1";
export const RUBRICS = Object.freeze({
  grouped5: {id:"lesson_grouped_5_v1", label:"خمسة معايير تجميعية", provenance:"استعمال تاريخي؛ غير معتمد رسميًا"},
  inspector10: {id:"lesson_inspector_10_v1", label:"عشرة عناصر", provenance:"اجتهاد مفتش؛ غير معتمد رسميًا"},
  analytical14: {id:"lesson_derived_indicators_v1", label:"خمسة معايير بمؤشرات مستقلة (14)", provenance:"اشتقاق مهني جديد؛ غير معتمد رسميًا"}
});
export const GROUPS = Object.freeze([
  {id:"g1",label:"التنشيط",cap:12,items:[
    {id:"g1_1",label:"يتبنى المواقف المناسبة"},
    {id:"g1_2",label:"يثير الاهتمام والرغبة في الاندماج"},
    {id:"g1_3",label:"يوجه البحث والتأمل (التفكير)"}
  ]},
  {id:"g2",label:"القدرات المهنية",cap:8,items:[
    {id:"g2_1",label:"إتقان الموضوع المقدم"},
    {id:"g2_2",label:"تحديد الهدف وإبلاغه"},
    {id:"g2_3",label:"الربط بين عناصر المحتوى المدرَّس"}
  ]},
  {id:"g3",label:"السيرورة",cap:8,items:[
    {id:"g3_1",label:"القيام بالتذكير"},
    {id:"g3_2",label:"تقسيم عملية التدريس إلى مراحل تدريجية وبناء تسلسلات"},
    {id:"g3_3",label:"تسليط الضوء على أبرز عناصر الدرس"},
    {id:"g3_4",label:"إجراء عمليات توضيح منهجية دون تسرع"}
  ]},
  {id:"g4",label:"التلخيص والتحكم",cap:6,items:[
    {id:"g4_1",label:"التأكد من متابعة المتكونين للدرس والمشاركة فيه"},
    {id:"g4_2",label:"إجراء عمليات إعادة البناء والربط والتركيب والتلخيص"}
  ]},
  {id:"g5",label:"التحضير لحصص التدريس",cap:6,items:[
    {id:"g5_1",label:"توفر خطة للدرس"},
    {id:"g5_2",label:"توفير التجهيزات والمواد والمساعدات البيداغوجية الضرورية"}
  ]}
]);
export const TEN = Object.freeze([
  ["c1","التحضير الكتابي والمادي",5],
  ["c2","صياغة الأغراض البيداغوجية",4],
  ["c3","الخطوات البيداغوجية",4],
  ["c4","التنشيط (السلوك)",5],
  ["c5","صفة البراهين",5],
  ["c6","التنقيط التحليلي",5],
  ["c7","اختيار واستعمال الوسائل البيداغوجية",4],
  ["c8","تكييف محتويات التكوين وتسيير الوقت",2],
  ["c9","تنظيم التعليم",2],
  ["c10","تقييم الحصة",4]
].map(([id,label,cap])=>({id,label,cap})));
export const DISCUSSION = Object.freeze([
  ["d1","التحكم في الموضوع",3],
  ["d2","قيمة الأفكار وبنيتها",3],
  ["d3","القدرة على التحليل والتركيب",3],
  ["d4","التعبير والتواصل",3],
  ["d5","أهمية الملاحظات",3],
  ["d6","انفتاح الشخصية",3],
  ["d7","استخدام الأدوات والالتزام بالإجراءات",2]
].map(([id,label,cap])=>({id,label,cap})));
export const SUGGESTED_HALF_UNITS=Object.freeze([
  [8,8,8],[6,6,4],[4,4,4,4],[6,6],[6,6]
]); // Non-official examples only; integers = half-points.

const plain=o=>o!==null&&typeof o==="object"&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype;
const rubricKey=id=>Object.keys(RUBRICS).find(k=>RUBRICS[k].id===id||k===id);
const itemGroup=id=>GROUPS.find(g=>g.items.some(i=>i.id===id));
const knownWeights=new Set(GROUPS.flatMap(g=>g.items.map(i=>i.id)));
const knownDiscussion=new Set(DISCUSSION.map(i=>i.id));
const halfUnits=n=>Number.isFinite(n)&&n>=0&&Number.isInteger(n*2)?n*2:null;
const numericInput=raw=>{
 if(typeof raw==="number")return Number.isFinite(raw)?raw:null;
 if(typeof raw!=="string"||!raw.trim()||!/^(?:\d+)(?:\.\d+)?$/.test(raw.trim()))return null;
 const n=Number(raw);
 return Number.isFinite(n)?n:null;
};
export function newDraft(rubricId){
 const key=rubricKey(rubricId);
 if(!key)throw Error("شبكة غير معروفة");
 return {schema:SCHEMA,revision:1,rubricId:RUBRICS[key].id,
  profile:key==="analytical14"?{weights:{},frozen:false}:null,
  scores:{lesson:{},discussion:{}}};
}
export function isAnalytical(draft){return draft.rubricId===RUBRICS.analytical14.id}
export function suggestedWeights(){
 const weights={};
 GROUPS.forEach((g,i)=>g.items.forEach((item,j)=>{weights[item.id]=SUGGESTED_HALF_UNITS[i][j]/2}));
 return weights;
}
export function validateWeights(weights){
 const errors=[],groups=[];
 if(!plain(weights))return {valid:false,errors:["ملف الأوزان غير صالح"],groups:[]};
 for(const id of Object.keys(weights))if(!knownWeights.has(id))errors.push("مؤشر غير معروف: "+id);
 for(const group of GROUPS){
  let units=0;let valid=true;
  for(const item of group.items){
   const raw=weights[item.id],v=numericInput(raw);
   if(raw===null||raw===undefined||raw===""){
    errors.push("وزن غير مدخل: "+item.label);valid=false;continue;
   }
   const hu=halfUnits(v);
   if(hu===null||v>group.cap){
    errors.push("وزن غير صالح أو ليس من مضاعفات 0.5: "+item.label);valid=false;continue;
   }
   units+=hu;
  }
  const capUnits=group.cap*2;
  groups.push({id:group.id,label:group.label,cap:group.cap,total:units/2,difference:(capUnits-units)/2,complete:valid&&units===capUnits});
  if(valid&&units!==capUnits)errors.push("مجموع "+group.label+" يجب أن يساوي "+group.cap);
 }
 return {valid:errors.length===0,errors,groups};
}
const copy=d=>JSON.parse(JSON.stringify(d));
const hasScores=d=>Object.keys(d.scores.lesson||{}).length>0||Object.keys(d.scores.discussion||{}).length>0;
export function withWeight(draft,id,value){
 if(!isAnalytical(draft)||!draft.profile||draft.profile.frozen||hasScores(draft))throw Error("لا يمكن تحرير الأوزان بعد التثبيت أو بدء التنقيط");
 const group=itemGroup(id);if(!group)throw Error("مؤشر غير معروف");
 const next=copy(draft);
 if(value===null||value===""){delete next.profile.weights[id];return next}
 const n=numericInput(value),hu=halfUnits(n);
 if(hu===null||n>group.cap)throw Error("وزن غير صالح: يجب أن يكون صفرًا أو من مضاعفات نصف نقطة ضمن السقف");
 next.profile.weights[id]=n;
 return next;
}
export function withSuggestions(draft){
 if(!isAnalytical(draft)||draft.profile?.frozen||hasScores(draft))throw Error("لا يمكن تغيير الأوزان المثبتة");
 const next=copy(draft);next.profile.weights=suggestedWeights();return next;
}
export function freezeWeights(draft){
 if(!isAnalytical(draft)||!draft.profile||draft.profile.frozen)throw Error("لا توجد أوزان قابلة للتثبيت");
 const check=validateWeights(draft.profile.weights);
 if(!check.valid)throw Error(check.errors.join("؛ "));
 const next=copy(draft);next.profile.frozen=true;return next;
}
export function lessonItems(draft){
 if(draft.rubricId===RUBRICS.grouped5.id)
  return GROUPS.map(g=>({id:g.id,label:g.label,cap:g.cap,groupId:g.id}));
 if(draft.rubricId===RUBRICS.inspector10.id)
  return TEN.map(i=>({...i,groupId:i.id}));
 if(isAnalytical(draft)){
  return GROUPS.flatMap(g=>g.items.map(i=>({id:i.id,label:i.label,cap:draft.profile.weights[i.id]??null,groupId:g.id})));
 }
 throw Error("شبكة غير معروفة");
}
export function withScore(draft,phase,id,raw){
 if(!["lesson","discussion"].includes(phase))throw Error("مرحلة غير معروفة");
 if(isAnalytical(draft)&&!draft.profile?.frozen)throw Error("ثبت ملف الأوزان قبل إدخال العلامات");
 const items=phase==="lesson"?lessonItems(draft):DISCUSSION;
 const item=items.find(i=>i.id===id);
 if(!item||item.cap===null)throw Error("عنصر تنقيط غير صالح");
 if(item.cap===0)throw Error("المؤشر ذو الوزن صفر غير منقّط؛ اترك الدرجة فارغة");
 const next=copy(draft);
 if(raw===null||raw===""){delete next.scores[phase][id];return next}
 const n=numericInput(raw);
 if(n===null||n<0||n>item.cap)throw Error("العلامة خارج المجال 0 إلى "+item.cap);
 // No fractional scoring policy is imposed in this research prototype.
 next.scores[phase][id]=n;
 return next;
}
function phaseTotal(draft,phase,items){
 const marks=draft.scores[phase]||{};
 let sum=0,required=0,entered=0;
 for(const item of items){
  if(item.cap===0)continue; // Neutral, not a fabricated zero score.
  required++;
  if(!Object.hasOwn(marks,item.id))continue;
  const n=marks[item.id];
  if(typeof n!=="number"||!Number.isFinite(n)||n<0||n>item.cap)throw Error("علامة غير صالحة");
  entered++;sum+=n;
 }
 return {complete:entered===required,entered,required,
  total:entered===required?sum:null,
  partial:sum,cap:phase==="lesson"?40:20};
}
export function groupSummaries(draft){
 if(!isAnalytical(draft)||!draft.profile?.frozen)return [];
 const marks=draft.scores.lesson,items=lessonItems(draft);
 return GROUPS.map(group=>{
  let entered=0,required=0,partial=0;
  for(const item of items.filter(item=>item.groupId===group.id)){
   if(item.cap===0)continue;
   required++;
   if(!Object.hasOwn(marks,item.id))continue;
   entered++;partial+=marks[item.id];
  }
  return {id:group.id,label:group.label,cap:group.cap,entered,required,
   complete:entered===required,total:entered===required?partial:null,partial};
 });
}
export function totals(draft){
 const lesson=isAnalytical(draft)&&!draft.profile?.frozen?
  {complete:false,entered:0,required:14,total:null,partial:0,cap:40}:
  phaseTotal(draft,"lesson",lessonItems(draft));
 const discussion=phaseTotal(draft,"discussion",DISCUSSION);
 const complete=lesson.complete&&discussion.complete;
 const total60=complete?lesson.total+discussion.total:null;
 return {lesson,discussion,complete,total60,score20:complete?total60/3:null,
  threshold30:complete?total60>=30:null};
}
export function validateImport(payload){
 if(!plain(payload)||payload.schema!==SCHEMA||payload.revision!==1)throw Error("صيغة ملف مختلفة أو غير مدعومة");
 const draft=newDraft(payload.rubricId);
 if(!plain(payload.scores)||!plain(payload.scores.lesson)||!plain(payload.scores.discussion))
  throw Error("بنية العلامات غير صالحة");
 if(isAnalytical(draft)){
  if(!plain(payload.profile)||!plain(payload.profile.weights))throw Error("ملف الأوزان غير موجود");
  for(const [id,v] of Object.entries(payload.profile.weights))draft.profile=withWeight(draft,id,v).profile;
  if(payload.profile.frozen!==true&&payload.profile.frozen!==false)throw Error("حالة ملف الأوزان غير صالحة");
  if(payload.profile.frozen)draft.profile=freezeWeights(draft).profile;
  else if(hasScores(payload))throw Error("لا يجوز وجود علامات قبل تثبيت الأوزان");
 }else if(payload.profile!==null)throw Error("شبكة غير تحليلية لا تحمل ملف أوزان");
 const validIdsLesson=new Set(lessonItems(draft).map(x=>x.id));
 for(const id of Object.keys(payload.scores.lesson))if(!validIdsLesson.has(id))throw Error("عنصر علامة غير معروف");
 for(const id of Object.keys(payload.scores.discussion))if(!knownDiscussion.has(id))throw Error("عنصر مناقشة غير معروف");
 for(const [id,v] of Object.entries(payload.scores.lesson))Object.assign(draft,withScore(draft,"lesson",id,v));
 for(const [id,v] of Object.entries(payload.scores.discussion))Object.assign(draft,withScore(draft,"discussion",id,v));
 return draft;
}
export function serialize(draft){return JSON.stringify(validateImport(draft),null,2)}
