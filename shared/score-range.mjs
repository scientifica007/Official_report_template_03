// Shared scoring interaction for the committee editor and the authenticated member.
// Does not store marks or alter rubric semantics: callers keep their own grading engine.
// Mirrors the field-tested workbench range/number pair and its coarse-pointer guard.
const make=(tag,cls="",text="")=>{
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(text)e.textContent=text;
 return e;
};
const show=n=>String(Number(n));
const isTouchDevice=()=>typeof window!=="undefined"&&(
 window.matchMedia?.("(any-pointer: coarse)")?.matches===true||
 (window.navigator?.maxTouchPoints??0)>0
);
let unlocked=null,scrollGuardReady=false;
function attachScrollGuard(){
 if(scrollGuardReady||typeof window==="undefined"||!window.addEventListener)return;
 window.addEventListener("scroll",()=>unlocked?.lock(),{passive:true,capture:true});
 scrollGuardReady=true;
}
// A numeric zero is an entered mark; an empty number remains unscored.
const valid=(raw,cap)=>{
 if(raw===""||raw===null||raw===undefined)return false;
 const n=Number(raw);
 return Number.isFinite(n)&&n>=0&&n<=cap&&Number.isInteger(n*2);
};
export function createPairedScore(number,{cap,label,onRangeInput=()=>{},onRangeCommit=()=>{}}){
 if(!Number.isFinite(cap)||cap<=0||!Number.isInteger(cap*2))
  throw Error("سقف علامة غير صالح للشريط.");
 const safeTouch=isTouchDevice();
 const pair=make("div","score-pair");
 const wrap=make("div","score-range-wrap");
 const range=make("input","score-range");
 range.type="range";range.min="0";range.max=String(cap);range.step="0.5";
 range.setAttribute("aria-label","شريط تنقيط "+label+" من صفر إلى "+show(cap));
 const ticks=make("div","range-scale");ticks.dir="ltr";
 ticks.setAttribute("aria-hidden","true");
 for(const value of [0,cap/2,cap])ticks.append(make("span","",show(value)));
 const status=make("small","range-status");
 let recorded=valid(number.value,cap);
 const updateVisual=(raw,has)=>{
  recorded=has;
  range.value=has?String(raw):"0";
  range.setAttribute("data-empty",has?"false":"true");
  const percent=has?Math.max(0,Math.min(100,Number(raw)/cap*100)):0;
  range.style?.setProperty?.("--range-progress",percent+"%");
  range.setAttribute("aria-valuetext",has?show(raw)+" من "+show(cap):"علامة لم تُدخل بعد");
  status.textContent=has?"العلامة المختارة: "+show(raw)+" / "+show(cap):
   "لم تُسجل علامة بعد — حرّك الشريط أو أدخل قيمة";
 };
 updateVisual(number.value,recorded);
 wrap.append(range,ticks,status);
 let guard=null,unlockButton=null;
 const controller={
  lock(){
   if(!safeTouch)return;
   range.setAttribute("data-touch-locked","true");
   range.setAttribute("aria-disabled","true");
   range.tabIndex=-1;
   if(unlockButton){
    unlockButton.setAttribute("aria-pressed","false");
    unlockButton.textContent="تفعيل الشريط للتنقيط";
   }
   if(guard)guard.querySelector?.("small")&&(guard.querySelector("small").textContent=
    "الشريط محمي من لمس التمرير؛ الرقم قابل للتعديل");
   if(unlocked===controller)unlocked=null;
  }
 };
 if(safeTouch){
  guard=make("div","touch-range-guard");
  unlockButton=make("button","range-enable","تفعيل الشريط للتنقيط");
  unlockButton.type="button";
  unlockButton.setAttribute("aria-pressed","false");
  unlockButton.disabled=number.disabled===true;
  const help=make("small","","الشريط محمي من لمس التمرير؛ الرقم قابل للتعديل");
  guard.append(unlockButton,help);wrap.append(guard);
  unlockButton.addEventListener("click",()=>{
   if(number.disabled)return;
   if(unlocked&&unlocked!==controller)unlocked.lock();
   if(unlocked===controller){controller.lock();return}
   unlocked=controller;
   range.setAttribute("data-touch-locked","false");
   range.setAttribute("aria-disabled","false");
   range.tabIndex=0;
   unlockButton.setAttribute("aria-pressed","true");
   unlockButton.textContent="الشريط مفعّل — حرّكه الآن";
   help.textContent="يُقفل بعد اختيار العلامة أو تمرير الصفحة";
  });
  controller.lock();
  attachScrollGuard();
 }
 range.disabled=number.disabled===true;
 const editable=()=>!number.disabled&&(!safeTouch||unlocked===controller);
 const writeVisualFromRange=()=>{
  const raw=range.value;
  number.value=raw;
  updateVisual(raw,true);
  return raw;
 };
 range.addEventListener("input",()=>{
  if(!editable())return;
  const raw=writeVisualFromRange();
  onRangeInput(raw);
 });
 const commitRange=()=>{
  if(!editable())return;
  const raw=writeVisualFromRange();
  onRangeCommit(raw);
  controller.lock();
 };
 range.addEventListener("change",commitRange);
 // At zero, a deliberate click or keyboard Home may generate no change event.
 range.addEventListener("click",()=>{
  if(!recorded)commitRange();
 });
 range.addEventListener("keyup",event=>{
  if(!recorded&&["Home","ArrowLeft","ArrowDown"].includes(event.key))
   commitRange();
 });
 number.addEventListener("input",()=>{
  if(number.value===""||valid(number.value,cap))
   updateVisual(number.value,number.value!=="");
  else status.textContent="علامة غير صالحة؛ أدخل عددًا بين صفر و"+show(cap)+
   " بخطوة نصف نقطة";
 });
 pair.append(number,wrap);
 // Re-enable/disable when the parent later changes its readonly state.
 return pair;
}
