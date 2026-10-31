/* B9: independent fallback for Word section-page-count field.
 * Word's SECTIONPAGES is authoritative when a reader recalculates fields.
 * Some DOCX importers only show cached field results. This conservative
 * browser-only estimate is for that cached result; it NEVER counts minutes.
 * No changes to grading, authored prose, member sources or PDF pagination. */
import {buildReferenceDocuments} from "./document-model.mjs";
const CONTENT_PT=740;
function paragraphPt(value){
 const text=String(value??"").trim();
 if(!text)return 0;
 const lines=text.split("\n").reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/160)),0);
 return lines*17+11;
}
function phasePages(items,summary,baselinePt){
 const notes=items.reduce((n,item)=>n+paragraphPt(item.criterion+": "+item.text),0);
 const body=baselinePt+notes+paragraphPt(summary);
 return Math.max(1,Math.ceil(body/CONTENT_PT));
}
export function estimateDocxReportPages(state){
 const d=buildReferenceDocuments(state);
 const lesson=phasePages(d.memberObservations.lesson,d.prose.lesson,370);
 const discussion=phasePages(d.memberObservations.discussion,d.prose.discussion,390);
 const extraCandidate=d.candidateFields.filter(([,value])=>String(value||"").length>110).length;
 const candidate=1+Math.floor(extraCandidate/7);
 const results=1+Math.floor(Math.max(0,paragraphPt(d.displayedAppreciation)-190)/CONTENT_PT);
 return Math.min(500,1+candidate+lesson+discussion+results);
}
