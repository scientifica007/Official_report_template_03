/* ARCH-01D2-P4-B — readable paper-oriented *drafts*.
 * Word and print consume the same read-only data model; no changes to grades.
 * Source remarks remain available in the accepted inspector editor, not
 * automatically attributed to the committee in the paper document. */
import {node,add,clear} from "./dom.mjs";
import {buildReferenceDocuments,mark} from "./document-model.mjs";

function line(parent,label,value){
 const el=node("p","","paper-line");
 add(el,node("strong",label+" "),node("span",value||"................................................"));
 parent.append(el);
}
function heading(parent,label){parent.append(node("h3",label,"paper-section-heading"))}
function rowsTable(parent,titles,rows,className=""){
 const t=node("table","","official-table "+className),thead=node("thead"),tr=node("tr");
 for(const x of titles)tr.append(node("th",x));
 thead.append(tr);t.append(thead);
 const tbody=node("tbody");
 for(const row of rows){
  const tr=node("tr");
  for(const v of row)tr.append(node("td",v??""));
  tbody.append(tr);
 }
 t.append(tbody);parent.append(t);
}
function header(parent,title,d){
 const banner=node("div","","paper-ministry");
 for(const text of ["الجمهورية الجزائرية الديمقراطية الشعبية",
  "وزارة التكوين والتعليم المهنيين","المفتشية العامة"])
  banner.append(node("p",text));
 parent.append(banner,node("h2",title),node("p",
  "المراجع: المرسوم التنفيذي رقم 09-93، والقرار رقم 03 المؤرخ في 06 جانفي 2015.","reference-line"));
 parent.append(node("p","نسخة عمل لم يُثبت تطابقها البصري النهائي مع النموذج المرجعي؛ لا تُعد إمضاءً أو ختمًا.","caution"));
 if(d.referenceScopeWarning)parent.append(node("p",d.referenceScopeWarning,"warning"));
 if(d.scoreWarning)parent.append(node("p",d.scoreWarning,"paper-warning"));
 if(d.textWarning)parent.append(node("p",d.textWarning,"paper-warning"));
}
function signatures(parent,d){
 heading(parent,"مصادقة أعضاء اللجنة — الإمضاءات الورقية");
 const wrap=node("div","","official-signatures");
 for(const seat of d.signers){
  const card=node("div","","official-signature");
  add(card,node("strong",seat.label),
   node("p","الاسم واللقب: "+seat.name),
   node("p","الوظيفة: "+seat.role),
   node("p","الإمضاء: .............................."));
  wrap.append(card);
 }
 parent.append(wrap);
}
function report(container,d){
 const paper=node("article","","paper official-report");
 header(paper,d.reportTitle,d);
 line(paper,"مفتش المقاطعة:",d.metaValue("chairName"));
 line(paper,"المقاطعة التقنية والبيداغوجية:",d.metaValue("inspectorDistrict"));
 line(paper,"المقر:",d.metaValue("inspectorSeat"));
 line(paper,"الهاتف:",d.metaValue("inspectorPhone"));
 line(paper,"البريد الإلكتروني:",d.metaValue("inspectorEmail"));
 heading(paper,"إجراء امتحان التثبيت");
 line(paper,"المكان:",d.metaValue("location"));
 line(paper,"التاريخ:",d.metaValue("date"));
 heading(paper,"معلومات تتعلق بالأستاذ(ة) المترشح(ة)");
 rowsTable(paper,["البيان","المعلومة"],d.candidateFields,"paper-info-table");
 heading(paper,"ظروف إجراء امتحان التثبيت");
 rowsTable(paper,["البيان","المعلومة"],d.examFields,"paper-info-table");
 heading(paper,"الامتحان الأول: حصة تدريسية /40");
 paper.append(node("p","شبكة التنقيط المختارة: "+d.rubricLabel+
  " — شبكة عمل غير مثبت اعتمادها الرسمي.","paper-small"));
 rowsTable(paper,["معايير ومؤشرات التقدير","قاعدة التنقيط","العلامة المحصلة"],[
  ...d.lessonRows.map(x=>[
   x.label+(x.indicators.length?"\n"+x.indicators.map(y=>"• "+y).join("\n"):""),
   mark(x.cap),mark(x.score)]),
  ["العلامة المحصلة","40",mark(d.marks.lesson)]
 ],"paper-score-table");
 line(paper,"التقدير:",d.prose.lesson);
 heading(paper,"الامتحان الثاني: المناقشة /20");
 line(paper,"موضوع المناقشة:",d.discussionTopic);
 rowsTable(paper,["العناصر المقيمة","قاعدة التنقيط","العلامة المحصلة"],[
  ...d.discussionRows.map(x=>[x.label,mark(x.cap),mark(x.score)]),
  ["العلامة المحصلة","20",mark(d.marks.discussion)]
 ],"paper-score-table");
 line(paper,"التقدير:",d.prose.discussion);
 heading(paper,"خلاصة النتائج");
 rowsTable(paper,["عناصر الكفاءة","قاعدة التنقيط","العلامة المتحصل عليها"],[
  ["إلقاء الدرس","40",mark(d.marks.lesson)],
  ["المحادثة","20",mark(d.marks.discussion)],
  ["المجموع","60",mark(d.marks.total60)],
  ["العلامة النهائية","20",mark(d.marks.total20)]
 ],"paper-score-table");
 line(paper,"التقدير العام:",d.prose.general);
 line(paper,"قرار أعضاء اللجنة:",d.decision);
 if(d.prose.recommendations)line(paper,
  "توصيات إضافية (خارج الحقول الأصلية للنموذج المرجعي):",d.prose.recommendations);
 signatures(paper,d);
 container.append(paper);
}
function minutes(container,d){
 const paper=node("article","","paper official-minutes");
 header(paper,"محضر التفتيش قصد الترسيم",d);
 line(paper,"نحن الموقعين أسفله أعضاء لجنة التفتيش قصد الترسيم، نصرّح بأننا شاركنا يوم:",
  d.metaValue("date"));
 line(paper,"في سير امتحان التثبيت للسيد(ة):",
  d.candidate||"................................................");
 line(paper,"المعين(ة) في رتبة:",d.metaValue("rank"));
 line(paper,"بمؤسسة:",d.metaValue("institution"));
 line(paper,"لولاية:",d.metaValue("wilaya"));
 heading(paper,"بعد مداولة لجنة الامتحان، النتائج هي:");
 line(paper,"العلامة النهائية:",mark(d.marks.total20)+" /20");
 line(paper,"التقدير العام:",d.prose.general);
 line(paper,"قرار اللجنة:",d.decision);
 line(paper,"حُرّر في:",d.metaValue("decisionPlace"));
 line(paper,"التاريخ:",d.meta.decisionDate||d.meta.date);
 signatures(paper,d);
 container.append(paper);
}
export function renderDocuments(container,state){
 clear(container);
 const d=buildReferenceDocuments(state);
 report(container,d);
 minutes(container,d);
}