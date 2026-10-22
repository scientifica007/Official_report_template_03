/* ARCH-01D2-P4-B3 — six reference sections (five report + minutes).
 * Browser print and DOCX consume buildReferenceDocuments; never mutate the
 * chair's editable data or present signatures as electronic approvals. */
import {node,add,clear} from "./dom.mjs";
import {buildReferenceDocuments,mark} from "./document-model.mjs";
const empty="................................................";
function textLine(parent,label,value){
 const p=node("p","","paper-line");
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
 const head=node("thead"),tr=node("tr");
 titles.forEach(x=>tr.append(node("th",x)));head.append(tr);t.append(head);
 const body=node("tbody");
 rows.forEach(row=>{
  const tr=node("tr");
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
function signatures(page,d){
 heading(page,"مصادقة أعضاء اللجنة — إمضاءات أعضاء اللجنة على النسخة الورقية");
 const wrap=node("div","","reference-three-signers");
 d.signers.slice(0,3).forEach(x=>{
  const card=node("div","","reference-member-sign");
  add(card,node("strong",x.label),node("p","اللقب والاسم: "+x.name),
   node("p","الوظيفة: "+x.role),node("p","التوقيع: ........................"));
  wrap.append(card);
 });
 page.append(wrap);
 const chair=d.signers[3];
 const full=node("div","","reference-chair-sign");
 add(full,node("strong",chair.label),node("p","اللقب والاسم: "+chair.name),
  node("p","الوظيفة: "+chair.role),node("p","التوقيع: ........................"));
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
 pg.append(node("p","المراجع: مرسوم تنفيذي رقم 09-93 مؤرخ في 26 صفر عام 1430، والقرار رقم 03 المؤرخ في 06 جانفي 2015.","reference-line"));
 pg.append(node("p","معاينة تجريبية غير مطابقة بعد للقالب الرسمي؛ "+d.sourceWarning,"caution"));
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
 heading(pg,"ظروف إجراء امتحان التثبيت");
 table(pg,["البيان","المعلومة"],d.examFields,"reference-exam-info");
}
function lesson(article,d){
 const pg=makePage(article,"reference-lesson");
 heading(pg,"إجراء الامتحان");
 heading(pg,"الامتحان الأول: حصة تدريسية");
 pg.append(node("p","شبكة التنقيط المختارة: "+d.rubricLabel+
  " — شبكة عمل غير مثبت اعتمادها الرسمي.","paper-small"));
 const rows=d.lessonRows.map((x,i)=>[
  String(i+1),x.label+(x.indicators.length?
   "\n"+x.indicators.map(y=>"• "+y).join("\n"):""),mark(x.cap),
  mark(x.score)+" / "+mark(x.cap)
 ]);
 rows.push(["","العلامة المحصلة","40",mark(d.marks.lesson)]);
 table(pg,["الرقم","معايير ومؤشرات التقدير","قاعدة التنقيط","العلامة المحصلة"],
  rows,"reference-lesson-table");
 textLine(pg,"التقدير:",d.prose.lesson||empty+"\n"+empty+"\n"+empty);
}
function discussion(article,d){
 const pg=makePage(article,"reference-discussion");
 heading(pg,"الامتحان الثاني: المناقشة");
 textLine(pg,"موضوع المناقشة:",d.discussionTopic);
 table(pg,["العناصر المقيمة","قاعدة التنقيط","العلامة المحصلة"],[
  ...d.discussionRows.map((x,i)=>[String(i+1)+" - "+x.label,mark(x.cap),mark(x.score)]),
  ["العلامة المحصلة","20",mark(d.marks.discussion)]
 ],"reference-discussion-table");
 textLine(pg,"التقدير:",d.prose.discussion||empty+"\n"+empty+"\n"+empty);
}
function results(article,d,state){
 const pg=makePage(article,"reference-results");
 heading(pg,"خلاصة النتائج");
 table(pg,["عناصر الكفاءة","قاعدة التنقيط","العلامة المتحصل عليها"],[
  ["1 - إلقاء الدرس","40",mark(d.marks.lesson)],
  ["2 - المحادثة","20",mark(d.marks.discussion)],
  ["المجموع","60",mark(d.marks.total60)],
  ["العلامة النهائية","20",mark(d.marks.total20)]
 ],"reference-results-table");
 textLine(pg,"التقدير العام:",d.displayedAppreciation?
  d.displayedAppreciation+(d.appreciationIsSuggestion?" (تقدير مقترح قابل للتغيير)":""):
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
 pg.append(node("h2","محضر التفتيش قصد الترسيم"));
 pg.append(node("p","للأساتذة المتخصصين في التكوين والتعليم المهنيين وإعادة التكييف","reference-subtitle"));
 pg.append(node("p","مرسوم تنفيذي رقم 09-93 مؤرخ في 26 صفر عام 1430، والقرار رقم 03 المؤرخ في 06 جانفي 2015.","reference-line"));
 pg.append(node("p","مسودة للطباعة والإمضاء الورقي، وليست إقرارًا إلكترونيًا.","caution"));
 textLine(pg,"نحن الموقعين أسفله أعضاء لجنة التفتيش قصد الترسيم نصرح بأننا شاركنا يوم:",
  d.dateInWords+" بــ: "+(d.examVenue||empty));
 textLine(pg,"في سير امتحان التثبيت للسيد(ة):",d.candidate);
 textLine(pg,"المعين(ة) في رتبة:",d.metaValue("rank"));
 textLine(pg,"بمؤسسة:",d.metaValue("institution"));
 textLine(pg,"لولاية:",d.metaValue("wilaya"));
 heading(pg,"بعد مداولة لجنة الامتحان، النتائج هي:");
 textLine(pg,"العلامة النهائية:",mark(d.marks.total20)+" /20");
 textLine(pg,"التقدير العام:",d.displayedAppreciation+
  (d.appreciationIsSuggestion?" (مقترح)":""));
 heading(pg,"قرار اللجنة:");
 choices(pg,d);
 textLine(pg,"حُرّر في:",d.metaValue("decisionPlace"));
 const dateBox=node("div","","reference-minutes-date-left");
 textLine(dateBox,"التاريخ:",d.meta.decisionDate||d.meta.date);
 pg.append(dateBox);
 signatures(pg,d);
}
export function renderDocuments(container,state){
 clear(container);
 const d=buildReferenceDocuments(state);
 const report=node("article","","paper official-report");
 cover(report,d);candidate(report,d);lesson(report,d);discussion(report,d);
 results(report,d,state);addReportFooters(report,d);container.append(report);
 const record=node("article","","paper official-minutes");minutes(record,d);
 container.append(record);
}
