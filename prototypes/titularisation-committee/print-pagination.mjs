/* B7: paginate member assessments before print without mutating committee data. */
import {buildReferenceDocuments} from "./document-model.mjs";
function measurementRules(){
 if(!document.styleSheets)return null;
 const rules=[];
 for(const sheet of document.styleSheets){
  let list;try{list=sheet.cssRules}catch{continue}
  for(const item of list||[]){
   if(item.type===4&&/\bprint\b/i.test(item.conditionText||"")){
    for(const rule of item.cssRules||[])if(rule.type!==6)rules.push(rule.cssText);
   }
  }
 }
 const style=document.createElement("style");
 style.textContent=rules.join("\n")+
  "\n#paper .reference-page{break-after:auto!important;page-break-after:auto!important}";
 document.head.append(style);return style;
}
function contentBottom(page){
 const flow=[...page.children].filter(el=>
  !el.classList?.contains("reference-report-footer")&&
  !el.classList?.contains("screen-only")&&
  getComputedStyle(el).position!=="absolute");
 if(!flow.length)return 0;
 return flow.at(-1).getBoundingClientRect().bottom-page.getBoundingClientRect().top;
}
function fits(page){return contentBottom(page)<=page.getBoundingClientRect().height-24}
function continuation(after,kind){
 const page=document.createElement("section");
 page.className="reference-page reference-"+kind+"-continuation";
 const h=document.createElement("h3");h.className="paper-section-heading";
 h.textContent=kind==="lesson"?"متابعة التقدير — الحصة التدريسية":"متابعة التقدير — المناقشة";
 page.append(h);after.after(page);return page;
}
function notesBlock(page){
 const block=document.createElement("div");
 block.className="reference-original-contributions";page.append(block);return block;
}
function appendSplitText(page,block,source,makeNext){
 const words=source.textContent.match(/\S+\s*|\s+/gu)||[source.textContent];
 let pos=0;
 while(pos<words.length){
  const p=document.createElement("p");p.className="reference-original-contribution";
  block.append(p);
  let lo=1,hi=words.length-pos,accepted=0;
  while(lo<=hi){
   const mid=(lo+hi)>>1;p.textContent=words.slice(pos,pos+mid).join("");
   if(fits(page)){accepted=mid;lo=mid+1}else hi=mid-1;
  }
  if(!accepted){
   const chars=Array.from(words[pos]);lo=1;hi=chars.length;let n=0;
   while(lo<=hi){
    const mid=(lo+hi)>>1;p.textContent=chars.slice(0,mid).join("");
    if(fits(page)){n=mid;lo=mid+1}else hi=mid-1;
   }
   if(!n)throw Error("لا يمكن احتواء سطر التقدير في صفحة A4");
   words[pos]=chars.slice(n).join("");if(!words[pos])pos++;
  }else pos+=accepted;
  if(pos<words.length){const next=makeNext();page=next.page;block=next.block}
 }
 return {page,block};
}
function splitAssessment(originalPage,kind){
 const originalBlock=originalPage.querySelector(".reference-original-contributions");
 if(!originalBlock)return;
 const paragraphs=[...originalBlock.querySelectorAll(".reference-original-contribution")];
 originalBlock.remove();if(!paragraphs.length)return;
 let page=originalPage,block=notesBlock(page);
 const makeNext=()=>{
  page=continuation(page,kind);block=notesBlock(page);return {page,block};
 };
 for(const p of paragraphs){
  block.append(p);if(fits(page))continue;
  p.remove();if(!block.children.length)block.remove();
  makeNext();block.append(p);if(fits(page))continue;
  p.remove();const result=appendSplitText(page,block,p,makeNext);
  page=result.page;block=result.block;
 }
 if(block&&!block.children.length)block.remove();
}
function pageFooter(page,d,index,total){
 let footer=page.querySelector(":scope > .reference-report-footer");
 if(!footer){
  footer=document.createElement("div");footer.className="reference-report-footer";
  const rule=document.createElement("div");rule.className="reference-footer-rule";
  footer.append(rule,document.createElement("p"));page.append(footer);
 }
 footer.querySelector("p").textContent=d.reportFooter(index,total);
 page.dataset.reportPage=index;page.dataset.reportPages=total;
}
export function preparePrintPagination(root,state){
 if(!root?.querySelector||!document?.head)return;
 const report=root.querySelector(".official-report");
 if(!report||report.dataset.paginated==="true")return;
 const measuring=measurementRules();
 try{
  splitAssessment(report.querySelector(".reference-lesson"),"lesson");
  splitAssessment(report.querySelector(".reference-discussion"),"discussion");
  const pages=[...report.querySelectorAll(":scope > .reference-page")];
  const d=buildReferenceDocuments(state);
  pages.forEach((page,i)=>pageFooter(page,d,i+1,pages.length));
  report.dataset.paginated="true";
 }finally{measuring?.remove()}
}
