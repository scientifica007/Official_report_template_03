/* Self-contained, browser-side DOCX export; independent of Report 03.
 * Uncompressed OOXML ZIP (no third-party runtime or network requests).
 * Print and DOCX share the same reference projection, not separate calculations. */
import {buildReferenceDocuments,mark} from "./document-model.mjs";
const esc=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const run=(s,bold=false)=>'<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/>'+
 (bold?"<w:b/>":"")+'<w:rtl/><w:sz w:val="24"/><w:szCs w:val="26"/></w:rPr>'+
 String(s??"").split("\n").map((line,i)=>(i?"<w:br/>":"")+'<w:t xml:space="preserve">'+esc(line)+'</w:t>').join("")+'</w:r>';
function p(s,{bold=false,center=false,page=false,size=0}={}){
 return '<w:p><w:pPr><w:bidi/>'+(page?'<w:pageBreakBefore/>':'')+
 '<w:jc w:val="'+(center?'center':'right')+'"/><w:spacing w:before="100" w:after="100"/>'+
 (size?'<w:rPr><w:sz w:val="'+size+'"/><w:szCs w:val="'+size+'"/></w:rPr>':'')+
 '</w:pPr>'+run(s,bold)+'</w:p>';
}
function cell(s){
 return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/><w:vAlign w:val="center"/></w:tcPr>'+
 p(s)+'</w:tc>';
}
function table(rows){
 return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:bidiVisual/>'+
 '<w:tblBorders><w:top w:val="single" w:sz="6"/><w:left w:val="single" w:sz="6"/>'+
 '<w:bottom w:val="single" w:sz="6"/><w:right w:val="single" w:sz="6"/>'+
 '<w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>'+
 '</w:tblPr>'+rows.map(row=>'<w:tr>'+row.map(cell).join("")+'</w:tr>').join("")+'</w:tbl>';
}
function signatureTable(d){
 const rows=[["العضو","اللقب والاسم","الوظيفة","الإمضاء"]];
 for(const x of d.signers)rows.push([x.label,x.name,x.role,".................................."]);
 return p("مصادقة أعضاء اللجنة — الإمضاءات على النسخة الورقية",{bold:true})+table(rows);
}
function header(d,title,page=false){
 let s=p("الجمهورية الجزائرية الديمقراطية الشعبية",{center:true,bold:true,page});
 s+=p("وزارة التكوين والتعليم المهنيين",{center:true,bold:true});
 s+=p("المفتشية العامة",{center:true,bold:true});
 s+=p(title,{center:true,bold:true,size:32});
 s+=p("المرسوم التنفيذي رقم 09-93، والقرار رقم 03 المؤرخ في 06 جانفي 2015",{center:true});
 s+=p(d.sourceWarning,{center:true});
 if(d.referenceScopeWarning)s+=p(d.referenceScopeWarning,{bold:true});
 return s;
}
function report(d){
 let b=header(d,d.reportTitle);
 b+=p("مفتش المقاطعة: "+d.metaValue("chairName"));
 b+=p("المقاطعة التقنية والبيداغوجية: "+d.metaValue("inspectorDistrict"));
 b+=p("المقر: "+d.metaValue("inspectorSeat"));
 b+=p("الهاتف: "+d.metaValue("inspectorPhone")+" — البريد الإلكتروني: "+d.metaValue("inspectorEmail"));
 b+=p("إجراء امتحان التثبيت: المكان "+d.metaValue("location")+" — التاريخ "+d.metaValue("date"));
 b+=p("معلومات تتعلق بالأستاذ(ة) المترشح(ة)",{bold:true});
 b+=table(d.candidateFields.map(x=>x));
 b+=p("ظروف إجراء امتحان التثبيت",{bold:true});
 b+=table(d.examFields.map(x=>x));
 b+=p("الامتحان الأول: حصة تدريسية /40",{bold:true});
 b+=p("شبكة التنقيط المختارة: "+d.rubricLabel+" — شبكة عمل لا يُثبت اعتمادها الرسمي");
 b+=table([["معايير ومؤشرات التقدير","قاعدة التنقيط","العلامة المحصلة"],
  ...d.lessonRows.map(x=>[x.label+
    (x.indicators.length?"\n"+x.indicators.map(z=>"• "+z).join("\n"):""),mark(x.cap),mark(x.score)]),
  ["العلامة المحصلة للحصة","40",mark(d.marks.lesson)]]);
 b+=p("تقدير الحصة: "+(d.prose.lesson||"................................................"));
 b+=p("الامتحان الثاني: المناقشة /20",{bold:true});
 b+=p("موضوع المناقشة: "+(d.discussionTopic||"................................................"));
 b+=table([["العناصر المقيمة","قاعدة التنقيط","العلامة المحصلة"],
  ...d.discussionRows.map(x=>[x.label,mark(x.cap),mark(x.score)]),
  ["العلامة المحصلة للمناقشة","20",mark(d.marks.discussion)]]);
 b+=p("تقدير المناقشة: "+(d.prose.discussion||"................................................"));
 b+=p("خلاصة النتائج",{center:true,bold:true});
 b+=table([["عناصر الكفاءة","قاعدة التنقيط","العلامة المتحصل عليها"],
  ["إلقاء الدرس","40",mark(d.marks.lesson)],
  ["المحادثة","20",mark(d.marks.discussion)],
  ["المجموع","60",mark(d.marks.total60)],
  ["العلامة النهائية","20",mark(d.marks.total20)]]);
 b+=p("التقدير العام: "+(d.prose.general||"................................................"));
 b+=p("قرار أعضاء اللجنة: "+d.decision,{bold:true});
 if(d.prose.recommendations)b+=p("توصيات إضافية (لا يقابلها حقل مستقل في النموذج المرجعي): "+d.prose.recommendations);
 b+=signatureTable(d);
 return b;
}
function minutes(d){
 let b=header(d,"محضر التفتيش قصد الترسيم",true);
 b+=p("نحن الموقعين أسفله أعضاء لجنة التفتيش قصد الترسيم، نصرّح بأننا شاركنا يوم "+
  d.metaValue("date")+" في سير امتحان التثبيت للسيد(ة): "+(d.candidate||"..........................."));
 b+=p("المعين(ة) في رتبة: "+d.metaValue("rank")+
 " بمؤسسة: "+d.metaValue("institution")+" لولاية: "+d.metaValue("wilaya"));
 b+=p("بعد مداولة لجنة الامتحان، النتائج هي:",{bold:true});
 b+=p("العلامة النهائية: "+mark(d.marks.total20)+"/20");
 b+=p("التقدير العام: "+(d.prose.general||"................................................"));
 b+=p("قرار اللجنة: "+d.decision,{bold:true});
 b+=p("حُرّر في: "+d.metaValue("decisionPlace")+
  " بتاريخ: "+(d.meta.decisionDate||d.meta.date||"........................................"));
 b+=signatureTable(d);
 return b;
}
export function committeeDocumentXml(state){
 const d=buildReferenceDocuments(state);
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
 '<w:body>'+report(d)+minutes(d)+
 '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'+
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
export function createCommitteeDocx(state){
 const files={
  "[Content_Types].xml":'<?xml version="1.0" encoding="UTF-8"?>'+
   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
   '<Default Extension="xml" ContentType="application/xml"/>'+
   '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'+
   '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'+
   '</Types>',
  "_rels/.rels":'<?xml version="1.0" encoding="UTF-8"?>'+
   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
   '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+
   '</Relationships>',
  "word/document.xml":committeeDocumentXml(state),
  "word/styles.xml":'<?xml version="1.0" encoding="UTF-8"?>'+
   '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
   '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/>'+
   '<w:sz w:val="24"/><w:szCs w:val="26"/></w:rPr></w:rPrDefault></w:docDefaults>'+
   '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>'+
   '<w:pPr><w:bidi/></w:pPr></w:style></w:styles>'
 };
 return zipFiles(files);
}