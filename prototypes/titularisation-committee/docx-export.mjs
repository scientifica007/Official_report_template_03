/* Self-contained, browser-side DOCX export; independent of Report 03.
 * Uncompressed OOXML ZIP (no third-party runtime or network requests).
 * Print and DOCX share the same reference projection, not separate calculations. */
import {buildReferenceDocuments,mark} from "./document-model.mjs";
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
// Each Word paragraph has RTL reading order; isolated ASCII runs preserve
// dates, numeric grades, addresses, phone numbers and URLs inside Arabic.
const latinToken=/([A-Za-z0-9][A-Za-z0-9._@/+:%-]*[A-Za-z0-9]|[A-Za-z0-9])/g;
function textRun(value,bold,ltr,size=24){
 return '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/>'+
  (bold?'<w:b/>':'')+
  '<w:rtl w:val="'+(ltr?'0':'1')+'"/>'+
  (ltr?'<w:lang w:val="en-US"/>':'<w:lang w:val="ar-DZ" w:bidi="ar-DZ"/>')+
  '<w:sz w:val="'+size+'"/><w:szCs w:val="'+size+'"/></w:rPr>'+
  '<w:t xml:space="preserve">'+esc(value)+'</w:t></w:r>';
}
function run(s,bold=false,size=24){
 return String(s??"").split("\n").map((line,lineIndex)=>{
  const parts=line.split(latinToken);
  return (lineIndex?'<w:r><w:br/></w:r>':'')+
   parts.map((part,i)=>part?textRun(part,bold,i%2===1,size):'').join('');
 }).join('');
}
// Keep the field-accepted direction and mixed-script runs; only tune spacing
// and add source-derived table geometry. Report remains editable throughout.
function p(s,{bold=false,center=false,end=false,page=false,size=0,before=35,after=35}={}){
 return '<w:p><w:pPr><w:bidi w:val="1"/>'+(page?'<w:pageBreakBefore/>':'')+
 '<w:jc w:val="'+(center?'center':end?'end':'start')+'"/><w:spacing w:before="'+before+'" w:after="'+after+'"/>'+
 '</w:pPr>'+run(s,bold,size||22)+'</w:p>';
}
function cell(s,width,fill="",size=20){
 const bg=fill?'<w:shd w:val="clear" w:color="auto" w:fill="'+fill+'"/>':"";
 return '<w:tc><w:tcPr><w:tcW w:w="'+width+'" w:type="dxa"/><w:vAlign w:val="center"/>'+bg+'</w:tcPr>'+
 p(s,{size,before:18,after:18})+'</w:tc>';
}
function table(rows,{widths=null,headerFill="",bandFill={},rowHeights={},size=20}={}){
 const cols=rows[0]?.length||1;
 const widthsUsed=widths||Array(cols).fill(Math.floor(10000/cols));
 if(widthsUsed.length!==cols||rows.some(row=>row.length!==cols))
  throw Error("جدول الوثيقة يحتوي أعمدة غير متطابقة");
 return '<w:tbl><w:tblPr><w:tblW w:w="10000" w:type="dxa"/><w:bidiVisual w:val="1"/>'+
 '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="35" w:type="dxa"/>'+
 '<w:bottom w:w="35" w:type="dxa"/><w:start w:w="65" w:type="dxa"/>'+
 '<w:end w:w="65" w:type="dxa"/></w:tblCellMar>'+
 '<w:tblBorders><w:top w:val="single" w:sz="6"/><w:left w:val="single" w:sz="6"/>'+
 '<w:bottom w:val="single" w:sz="6"/><w:right w:val="single" w:sz="6"/>'+
 '<w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>'+
 '</w:tblPr><w:tblGrid>'+widthsUsed.map(w=>'<w:gridCol w:w="'+w+'"/>').join("")+
 '</w:tblGrid>'+rows.map((row,i)=>{
  const fill=bandFill[i]||(i===0?headerFill:"");
  const minHeight=rowHeights[i]?'<w:trPr><w:trHeight w:val="'+rowHeights[i]+'" w:hRule="atLeast"/></w:trPr>':'';
  return '<w:tr>'+minHeight+row.map((v,j)=>cell(v,widthsUsed[j],fill,size)).join("")+'</w:tr>';
 }).join("")+'</w:tbl>';
}

const placeholder="................................................";
const basis="مرسوم تنفيذي رقم 09-93 مؤرخ في 26 صفر عام 1430، والقرار رقم 03 المؤرخ في 06 جانفي 2015.";
function decisionChoices(d){
 const choices=d.decisionChoices.map(opt=>{
  let markup=run((opt.chosen?"☑ ":"☐ ")+opt.label+"       ",false,21);
  if(opt.struck)markup=markup.replaceAll('<w:rtl w:val=','<w:strike/><w:rtl w:val=');
  return markup;
 }).join("");
 return '<w:p><w:pPr><w:bidi w:val="1"/><w:jc w:val="center"/></w:pPr>'+choices+'</w:p>';
}
function signatures(d){
 const cols=[3334,3333,3333],group=d.signers.slice(0,3),chair=d.signers[3];
 const grid=cols.map(w=>'<w:gridCol w:w="'+w+'"/>').join("");
 const tc=(txt,w,span=1,fill=false)=>'<w:tc><w:tcPr><w:tcW w:w="'+w+'" w:type="dxa"/>'+
 (span>1?'<w:gridSpan w:val="'+span+'"/>':"")+(fill?'<w:shd w:fill="DADADA"/>':"")+
 '</w:tcPr>'+p(txt,{size:18,before:45,after:45})+'</w:tc>';
 const tr=(cells,h)=>'<w:tr><w:trPr><w:trHeight w:val="'+h+'" w:hRule="atLeast"/></w:trPr>'+cells.join("")+'</w:tr>';
 const body=m=>"اللقب والاسم: "+m.name+"\nالوظيفة: "+m.role+"\nالتوقيع: ................................";
 return p("مصادقة أعضاء اللجنة:",{bold:true,before:105})+
 '<w:tbl><w:tblPr><w:tblW w:w="10000" w:type="dxa"/><w:bidiVisual w:val="1"/><w:tblLayout w:type="fixed"/>'+
 '<w:tblBorders>'+["top","bottom","left","right","insideH","insideV"].map(k=>'<w:'+k+' w:val="single" w:sz="6"/>').join("")+
 '</w:tblBorders></w:tblPr><w:tblGrid>'+grid+'</w:tblGrid>'+
 tr(group.map((m,i)=>tc(m.label,cols[i],1,true)),320)+
 tr(group.map((m,i)=>tc(body(m),cols[i])),1350)+
 tr([tc(chair.label,10000,3,true)],300)+
 tr([tc(body(chair),10000,3)],600)+'</w:tbl>';
}
function cover(d){
 let b=p("الجمهورية الجزائرية الديمقراطية الشعبية",{center:true,bold:true,size:23});
 b+=p("وزارة التكوين والتعليم المهنيين",{center:true,bold:true,size:23});
 b+=p("المفتشية العامة",{center:true,bold:true,size:23});
 b+=p("مفتش المقاطعة: "+d.metaValue("chairName"),{before:260});
 b+=p("المقاطعة التقنية والبيداغوجية: "+d.metaValue("inspectorDistrict"));
 b+=p("المقر: "+d.metaValue("inspectorSeat"));
 b+=p("الهاتف: "+d.metaValue("inspectorPhone"));
 b+=p("البريد الإلكتروني: "+d.metaValue("inspectorEmail"));
 b+=p("تقرير التفتيش قصد الترسيم",{center:true,bold:true,size:39,before:540,after:120});
 b+=p(d.referenceScopeWarning||"للأساتذة المتخصصين في التكوين والتعليم المهنيين",
  {center:true,bold:true,size:21});
 b+=p("المراجع: "+basis,{center:true,size:18,before:170});
 b+=p(d.sourceWarning,{center:true,size:17});
 b+=p("إجراء امتحان التثبيت:",{bold:true,before:1300});
 b+=p("المكان: "+d.metaValue("location"),{before:120});
 b+=p("التاريخ: "+d.metaValue("date"),{before:100});
 return b;
}
function candidatePage(d){
 let b=p("معلومات تتعلق بالأستاذ(ة) المترشح(ة)",{page:true,center:true,bold:true,size:24});
 // Candidate fields in the original reference are ordinary labelled lines,
 // not a two-column table; keep the exam circumstances in their own table.
 for(const [label,value] of d.candidateFields)
  b+=p(label+": "+value,{size:20,before:65,after:65});
 b+=p("ظروف إجراء امتحان التثبيت",{center:true,bold:true,before:135});
 b+=table(d.examFields,{widths:[3700,6300],size:19});
 return b;
}
function lessonPage(d){
 let b=p("إجراء الامتحان",{center:true,bold:true,page:true,size:23});
 b+=p("الامتحان الأول: حصة تدريسية",{bold:true,size:23});
 if(d.rubricId!=="lesson_grouped_5_v1")
  b+=p("الشبكة المستخدمة: "+d.rubricLabel+" (شبكة عمل غير مثبت اعتمادها رسميًا)",
    {size:16});
 const records=[];
 const fills={};
 records.push(["الرقم","معايير ومؤشرات التقدير","قاعدة التنقيط","العلامة المحصلة"]);
 d.lessonRows.forEach((item,i)=>{
  records.push([String(i+1),item.label+
   (item.indicators?.length?"\n"+item.indicators.map(x=>"• "+x).join("\n"):""),
    mark(item.cap),mark(item.score)]);
  if(d.lessonRows.length===5){
   fills[records.length]="D9E9D2";
   records.push(["","النقطة الجزئية -"+(i+1)+"-","",""]);
  }
 });
 records.push(["","العلامة المحصلة","40",mark(d.marks.lesson)]);
 const lessonHeights={};
 records.forEach((_,i)=>{
  lessonHeights[i]=i===0?420:i===records.length-1?390:
   (d.lessonRows.length===5&&i%2===0?300:(d.lessonRows.length===5?890:460));
 });
 b+=table(records,{widths:[650,6350,1400,1600],headerFill:"F5E5AB",bandFill:fills,rowHeights:lessonHeights,size:19});
 b+=p("التقدير:",{bold:true,before:90});
 b+=p(d.prose.lesson||placeholder+"\n"+placeholder+"\n"+placeholder+"\n"+placeholder,
  {size:21});
 return b;
}
function discussionPage(d){
 let b=p("الامتحان الثاني: المناقشة",{page:true,center:true,bold:true,size:24});
 b+=p("موضوع المناقشة: "+(d.discussionTopic||placeholder),{before:170,after:140});
 b+=table([["العناصر المقيمة","قاعدة التنقيط","العلامة المحصلة"],
  ...d.discussionRows.map(x=>[x.label,mark(x.cap),mark(x.score)]),
  ["العلامة المحصلة","20",mark(d.marks.discussion)]],
  {widths:[6500,1600,1900],headerFill:"DCEBD5",rowHeights:{0:480,1:710,2:710,3:710,4:710,5:710,6:710,7:710,8:380},size:20});
 b+=p("التقدير:",{bold:true,before:130});
 b+=p(d.prose.discussion||placeholder+"\n"+placeholder+"\n"+placeholder+"\n"+placeholder,
  {size:21});
 return b;
}
function resultsPage(d){
 let b=p("خلاصة النتائج",{page:true,center:true,bold:true,size:25});
 b+=table([["عناصر الكفاءة","قاعدة التنقيط","العلامة المتحصل عليها"],
  ["1 - إلقاء الدرس","40",mark(d.marks.lesson)],
  ["2 - المحادثة","20",mark(d.marks.discussion)],
  ["المجموع","60",mark(d.marks.total60)],
  ["العلامة النهائية","20",mark(d.marks.total20)]],
  {widths:[5500,2000,2500],headerFill:"C8C8C8",rowHeights:{0:450,1:620,2:620,3:620,4:620},size:21});
 b+=p("التقدير العام:",{bold:true,before:150});
 b+=p(d.displayedAppreciation?
  d.displayedAppreciation+(d.appreciationIsSuggestion?" (تقدير مقترح قابل للتغيير)":""):
  placeholder+"\n"+placeholder+"\n"+placeholder,{size:21,after:120});
 b+=p("قرار أعضاء اللجنة:",{bold:true,before:140});
 b+=decisionChoices(d);
 b+=signatures(d);
 return b;
}
function minutes(d){
 let b=p("الجمهورية الجزائرية الديمقراطية الشعبية",
  {center:true,bold:true,size:22});
 b+=p("وزارة التكوين والتعليم المهنيين",{center:true,bold:true,size:22});
 b+=p("المفتشية العامة",{center:true,bold:true,size:22});
 b+=p("محضر التفتيش قصد الترسيم",{center:true,bold:true,size:28,before:190});
 b+=p("للأساتذة المتخصصين في التكوين والتعليم المهنيين، وللأساتذة المتخصصين لإعادة التكييف",
  {center:true,size:18});
 b+=p("المراجع: "+basis,{center:true,size:17});
 b+=p("نحن الموقعين أسفله أعضاء لجنة التفتيش قصد الترسيم، نصرح بأننا شاركنا يوم "+
  d.dateInWords+" بــ: "+(d.examVenue||placeholder)+
  " في سير امتحان التثبيت للسيد(ة): "+(d.candidate||placeholder),
  {before:170});
 b+=p("المعين(ة) في رتبة: "+d.metaValue("rank"));
 b+=p("بمؤسسة: "+d.metaValue("institution")+"، لولاية: "+d.metaValue("wilaya"));
 b+=p("بعد مداولة لجنة الامتحان، النتائج هي:",{before:120});
 b+=p("العلامة النهائية: "+mark(d.marks.total20)+"/20"+
  "      التقدير العام: "+(d.displayedAppreciation||placeholder)+
  (d.appreciationIsSuggestion?" (مقترح)":""));
 b+=p("قرار اللجنة:",{bold:true})+decisionChoices(d);
 b+=p("حُرّر في: "+d.metaValue("decisionPlace"),{before:100});
 b+=p("التاريخ: "+(d.meta.decisionDate||d.meta.date||placeholder),{end:true});
 b+=signatures(d);
 return b;
}
export function committeeDocumentXml(state){
 const d=buildReferenceDocuments(state);
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
 '<w:body>'+cover(d)+candidatePage(d)+lessonPage(d)+discussionPage(d)+resultsPage(d)+
 '<w:p><w:pPr><w:bidi w:val="1"/><w:sectPr><w:type w:val="nextPage"/><w:footerReference w:type="default" r:id="rIdReportFooter"/>'+
 '<w:pgSz w:w="11906" w:h="16838"/>'+
 '<w:pgMar w:top="850" w:right="900" w:bottom="1010" w:left="900" w:header="350" w:footer="340"/>'+
 '</w:sectPr></w:pPr></w:p>'+minutes(d)+
 '<w:sectPr><w:footerReference w:type="default" r:id="rIdEmptyFooter"/>'+
 '<w:pgSz w:w="11906" w:h="16838"/>'+
 '<w:pgMar w:top="850" w:right="900" w:bottom="850" w:left="900" w:header="350" w:footer="350"/>'+
 '</w:sectPr></w:body></w:document>';
}
function crc32(arr){
 let crc=-1;
 for(const value of arr){crc^=value;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0)}
 return (crc^-1)>>>0;
}
function zipFiles(files){
 const enc=new TextEncoder(),blocks=[],central=[];let offset=0;
 const le=(arr,pos,n,bytes)=>{for(let i=0;i<bytes;i++)arr[pos+i]=(n>>>8*i)&255};
 for(const [name,value] of Object.entries(files)){
  const nameBytes=enc.encode(name),data=enc.encode(value),checksum=crc32(data);
  const local=new Uint8Array(30+nameBytes.length);
  le(local,0,0x04034b50,4);le(local,4,20,2);le(local,14,checksum,4);
  le(local,18,data.length,4);le(local,22,data.length,4);le(local,26,nameBytes.length,2);
  local.set(nameBytes,30);blocks.push(local,data);
  const c=new Uint8Array(46+nameBytes.length);
  le(c,0,0x02014b50,4);le(c,4,20,2);le(c,6,20,2);le(c,16,checksum,4);
  le(c,20,data.length,4);le(c,24,data.length,4);le(c,28,nameBytes.length,2);
  le(c,42,offset,4);c.set(nameBytes,46);central.push(c);
  offset+=local.length+data.length;
 }
 const centralSize=central.reduce((n,x)=>n+x.length,0),end=new Uint8Array(22);
 le(end,0,0x06054b50,4);le(end,8,central.length,2);le(end,10,central.length,2);
 le(end,12,centralSize,4);le(end,16,offset,4);
 blocks.push(...central,end);
 const buf=new Uint8Array(blocks.reduce((n,x)=>n+x.length,0));
 let at=0;for(const part of blocks){buf.set(part,at);at+=part.length}
 return buf;
}
function reportFooterXml(d){
 const label=d.reportFooter(1).replace(/الصفحة 1 من 5$/,"الصفحة ");
 const field='<w:r><w:fldChar w:fldCharType="begin"/></w:r>'+
 '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'+
 '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'+
 '<w:r><w:t>1</w:t></w:r>'+
 '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
 return '<?xml version="1.0" encoding="UTF-8"?>'+
 '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
 '<w:p><w:pPr><w:bidi w:val="1"/><w:jc w:val="start"/>'+
 '<w:pBdr><w:top w:val="single" w:sz="5"/></w:pBdr></w:pPr>'+
 run(label,false,14)+field+run(" من 5",false,14)+'</w:p></w:ftr>';
}
export function createCommitteeDocx(state){
 const d=buildReferenceDocuments(state);
 const files={
  "[Content_Types].xml":'<?xml version="1.0" encoding="UTF-8"?>'+
   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
   '<Default Extension="xml" ContentType="application/xml"/>'+
   '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
   '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'+
   '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'+
   '<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'+
   '</Types>',
  "_rels/.rels":'<?xml version="1.0" encoding="UTF-8"?>'+
   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+
   '</Relationships>',
  "word/document.xml":committeeDocumentXml(state),
  "word/footer1.xml":reportFooterXml(d),
  "word/footer2.xml":'<?xml version="1.0" encoding="UTF-8"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:ftr>',
  "word/_rels/document.xml.rels":'<?xml version="1.0" encoding="UTF-8"?>'+
   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
   '<Relationship Id="rIdReportFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'+
   '<Relationship Id="rIdEmptyFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>'+
   '</Relationships>',
  "word/styles.xml":'<?xml version="1.0" encoding="UTF-8"?>'+
   '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
   '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/>'+
   '<w:rtl w:val="1"/><w:lang w:val="ar-DZ" w:bidi="ar-DZ"/>'+
   '<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>'+
   '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>'+
   '<w:pPr><w:bidi w:val="1"/><w:jc w:val="start"/></w:pPr>'+
   '<w:rPr><w:rtl w:val="1"/><w:lang w:val="ar-DZ" w:bidi="ar-DZ"/></w:rPr></w:style></w:styles>'
 };
 return zipFiles(files);
}