/* ARCH-01D2-P4-B3 — six reference sections (five report + minutes).
 * Browser print and DOCX consume buildReferenceDocuments; never mutate the
 * chair's editable data or present signatures as electronic approvals. */
import {node,add,clear} from "./dom.mjs";
import {buildReferenceDocuments,mark,printableAssessmentText} from "./document-model.mjs";
import {COMMITTEE_APPROVAL_HEADING,MINUTES_TITLE,MINUTES_SCOPE,LEGAL_REFERENCES,
 MINUTES_RESULTS_INTRO,DISCUSSION_RESULT_TITLE,MINUTES_OPENING_LEAD,minutesOpeningText}
 from "./document-language.mjs";
const empty="................................................";
function textLine(parent,label,value,extraClass=""){
 const p=node("p","","paper-line"+(extraClass?" "+extraClass:""));
 add(p,node("strong",label+" "),node("span",value||empty));parent.append(p);
}
function heading(parent,label){parent.append(node("h3",label,"paper-section-heading"))}
function makePage(parent,id){
 const page=node("section","","reference-page "+id);parent.append(page);return page;
}
function addReportFooters(article,d){
 const pages=[...article.children].filter(el=>el.className?.includes("reference-page"));
 pages.forEach((page,index)=>{
  const footer=node("div","","reference-report-footer");
  footer.append(node("div","","reference-footer-rule"));
  footer.append(node("p",d.reportFooter(index+1)));
  page.append(footer);
 });
}
function table(parent,titles,rows,className=""){
 const t=node("table","","official-table "+className);
 if(titles?.length){
  const head=node("thead"),tr=node("tr");
  titles.forEach(x=>tr.append(node("th",x)));head.append(tr);t.append(head);
 }
 const body=node("tbody");
 rows.forEach(row=>{
  const tr=node("tr");
  if(row.some(value=>typeof value==="string"&&
    /^(?:العلامة المحصلة|المجموع|العلامة النهائية)$/.test(value)))
   tr.className="official-total-row";
  row.forEach(x=>tr.append(node("td",x??"")));
  body.append(tr);
 });
 t.append(body);parent.append(t);return t;
}
function ministry(page){
 const block=node("div","","paper-ministry");
 ["الجمهورية الجزائرية الديمقراطية الشعبية",
 "وزارة التكوين والتعليم المهنيين","المفتشية العامة"].forEach(x=>block.append(node("p",x)));
 page.append(block);
}
function choices(parent,d){
 const wrap=node("div","","reference-decisions");
 [["success","ناجح(ة)"],["first","التأجيل الأول"],["second","التأجيل الثاني"]]
 .forEach(([code,text])=>{
  const opt=d.decisionChoices.find(x=>x.key===code);
  wrap.append(node("span",(opt?.chosen?"☑ ":"☐ ")+text,
   opt?.struck?"reference-decision-struck":""));
 });
 parent.append(wrap);
}
function assessment(page,finalText,observations){
 // Empty inspector text must stay genuinely blank, not become printable dots.
 if(finalText)textLine(page,"التقدير:",finalText);
 else page.append(node("p","التقدير:","paper-line reference-empty-appreciation"));
 if(!observations.length)return;
 const section=node("div","","reference-original-contributions");
 
 for(const item of observations){
  const line=node("p","","reference-original-contribution");
  add(line,node("strong",item.criterion+": "),node("span",printableAssessmentText(item.text)));
  section.append(line);
 }
 page.append(section);
}
function signatures(page,d){
 heading(page,COMMITTEE_APPROVAL_HEADING);
 const wrap=node("div","","reference-three-signers");
 d.signers.slice(0,3).forEach(x=>{
  const card=node("div","","reference-member-sign");
  add(card,node("strong",x.label),node("p","اللقب والاسم: "+x.name),
   node("p","الوظيفة: "+x.role),node("p",(x.label==="العضو الثالث"?"التوقيع: ":"الختم والتوقيع: ")+"........................"));
  wrap.append(card);
 });
 page.append(wrap);
 const chair=d.signers[3];
 const full=node("div","","reference-chair-sign");
 add(full,node("strong",chair.label),node("p","اللقب والاسم: "+chair.name),
  node("p","الوظيفة: "+chair.role),node("p","الختم والتوقيع: ........................"));
 page.append(full);
}
function cover(article,d){
 const pg=makePage(article,"reference-cover");
 ministry(pg);
 textLine(pg,"مفتش المقاطعة:",d.metaValue("chairName"));
 textLine(pg,"المقاطعة التقنية والبيداغوجية:",d.metaValue("inspectorDistrict"));
 textLine(pg,"المقر:",d.metaValue("inspectorSeat"));
 textLine(pg,"الهاتف:",d.metaValue("inspectorPhone"));
 textLine(pg,"البريد الإلكتروني:",d.metaValue("inspectorEmail"));
 pg.append(node("h2","تقرير التفتيش قصد الترسيم","reference-main-title"));
 pg.append(node("p",d.referenceScopeWarning||
  "للأساتذة المتخصصين في التكوين والتعليم المهنيين","reference-subtitle"));
 pg.append(node("p","المراجع: "+LEGAL_REFERENCES,"reference-line"));

 const bottom=node("div","","reference-cover-exam");
 heading(bottom,"إجراء امتحان التثبيت");
 textLine(bottom,"المكان:",d.metaValue("location"));
 textLine(bottom,"التاريخ:",d.metaValue("date"));
 pg.append(bottom);
 if(d.scoreWarning)pg.append(node("p",d.scoreWarning,"paper-warning screen-only"));
 if(d.textWarning)pg.append(node("p",d.textWarning,"paper-warning screen-only"));
}
function candidate(article,d){
 const pg=makePage(article,"reference-candidate");
 heading(pg,"معلومات تتعلق بالأستاذ(ة) المترشح(ة)");
 d.candidateFields.forEach(([label,value])=>textLine(pg,label+":",value));
 const exam=node("div","","reference-candidate-exam");
 heading(exam,"ظروف إجراء امتحان التثبيت");
 table(exam,null,d.examFields,"reference-exam-info");
 pg.append(exam);
}
function lesson(article,d){
 const pg=makePage(article,"reference-lesson");
 heading(pg,"إجراء الامتحان");
 heading(pg,"الامتحان الأول: حصة تدريسية");

 const rows=d.lessonRows.map((x,i)=>[
  String(i+1),x.label+(x.indicators.length?
   "\n"+x.indicators.map(y=>"• "+y).join("\n"):""),mark(x.cap),
  mark(x.score)
 ]);
 rows.push(["","العلامة المحصلة",mark(40),mark(d.marks.lesson)]);
 table(pg,["الرقم","معايير ومؤشرات التقدير","قاعدة التنقيط","العلامة المحصلة"],
  rows,"reference-lesson-table");
 assessment(pg,d.prose.lesson,d.memberObservations.lesson);
}
function discussion(article,d){
 const pg=makePage(article,"reference-discussion");
 heading(pg,"الامتحان الثاني: المناقشة");
 textLine(pg,"موضوع المناقشة:",d.discussionTopic);
 table(pg,["العناصر المقيمة","قاعدة التنقيط","العلامة المحصلة"],[
  ...d.discussionRows.map((x,i)=>[String(i+1)+" - "+x.label,mark(x.cap),mark(x.score)]),
  ["العلامة المحصلة",mark(20),mark(d.marks.discussion)]
 ],"reference-discussion-table");
 assessment(pg,d.prose.discussion,d.memberObservations.discussion);
}
function results(article,d,state){
 const pg=makePage(article,"reference-results");
 heading(pg,"خلاصة النتائج");
 table(pg,["عناصر الكفاءة","قاعدة التنقيط","العلامة المتحصل عليها"],[
  ["1 - إلقاء الدرس",mark(40),mark(d.marks.lesson)],
  [DISCUSSION_RESULT_TITLE,mark(20),mark(d.marks.discussion)],
  ["المجموع",mark(60),mark(d.marks.total60)],
  ["العلامة النهائية",mark(20),mark(d.marks.total20)]
 ],"reference-results-table");
 textLine(pg,"التقدير العام:",d.displayedAppreciation?
  d.displayedAppreciation:
  empty+"\n"+empty);
 heading(pg,"قرار أعضاء اللجنة:");
 choices(pg,d);
 signatures(pg,d);
 if(d.prose.recommendations)textLine(pg,"توصيات إضافية (خارج حقول القالب المرجعي):",d.prose.recommendations);
 // Preserve previously accepted inspector per-item source notes for review.
 // This screen-only reference does not appear in paper or DOCX.
 const detailed=[
  ...Object.entries(state.final.notes.lesson).filter(([,v])=>v?.trim()),
  ...Object.entries(state.final.notes.discussion).filter(([,v])=>v?.trim())
 ];
 if(detailed.length){
  const details=node("details","","internal-editor-notes screen-only");
  details.append(node("summary","ملاحظات تفصيلية للمراجعة داخل المحرر — لا تُطبع"));
  detailed.forEach(([k,v])=>details.append(node("p",k+": "+v)));
  pg.append(details);
 }
}
function minutes(article,d){
 const pg=makePage(article,"reference-minutes");
 ministry(pg);
 // The title, eligible ranks and legal references form one compact heading block.
 const header=node("div","","reference-minutes-header");
 header.append(node("h2",MINUTES_TITLE));
 header.append(node("p",MINUTES_SCOPE,"reference-subtitle"));
 header.append(node("p","المراجع: "+LEGAL_REFERENCES,"reference-line"));
 pg.append(header);

 // The minutes narrative starts as a distinct, clearly separated body.
 const body=node("div","","reference-minutes-body");
 const opening=node("p","","paper-line reference-minutes-opening");
 const full=minutesOpeningText(d,empty);
 add(opening,node("strong",MINUTES_OPENING_LEAD),
  node("span",full.slice(MINUTES_OPENING_LEAD.length)));
 body.append(opening);
 textLine(body,"الرتبة:",d.metaValue("rank"));
 textLine(body,"المؤسسة:",d.metaValue("institution"));
 textLine(body,"الولاية:",d.metaValue("wilaya"));
 pg.append(body);

 heading(pg,MINUTES_RESULTS_INTRO);
 textLine(pg,"العلامة النهائية:",mark(d.marks.total20)+" /20");
 textLine(pg,"التقدير العام:",d.displayedAppreciation);
 heading(pg,"قرار اللجنة:");
 choices(pg,d);
 const dateBox=node("div","","reference-minutes-date-left");
 textLine(dateBox,"حُرّر في:",d.metaValue("decisionPlace"));
 textLine(dateBox,"التاريخ:",d.meta.decisionDate||d.meta.date);
 pg.append(dateBox);
 const signBlock=node("div","","reference-minutes-signatures");
 signatures(signBlock,d);
 pg.append(signBlock);
}
export function renderDocuments(container,state){
 clear(container);
 const d=buildReferenceDocuments(state);
 const rawProse=["lesson","discussion"].flatMap(k=>d.memberObservations[k]);
 const sourceLength=rawProse.reduce((n,item)=>n+item.text.length+item.author.length+item.criterion.length,0);
 if(sourceLength>1800){
  container.append(node("p",
   "تنبيه للإخراج: التقديرات الأصلية المطولة ("+rawProse.length+
   " فقرة) قد تتجاوز صفحات PDF الخمس وتؤثر في التذييل. تبقى النصوص كاملة في JSON وDOCX؛ "+
   "راجع عدد صفحات الطباعة أو اختصر صياغة التقرير بعد المداولة.",
   "paper-warning screen-only"));
 }
 const report=node("article","","paper official-report");
 cover(report,d);candidate(report,d);lesson(report,d);discussion(report,d);
 results(report,d,state);addReportFooters(report,d);container.append(report);
 const record=node("article","","paper official-minutes");minutes(record,d);
 container.append(record);
}
