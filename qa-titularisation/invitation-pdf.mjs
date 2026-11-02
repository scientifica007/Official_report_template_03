// Local QR + Arabic invitation PDF, no external generator.
export function qrCanvas(link,size=410){
 const QR=globalThis.qrcodegen?.QrCode;
 if(!QR)throw Error("مكتبة QR المحلية غير محملة.");
 const qr=QR.encodeText(link,QR.Ecc.MEDIUM),margin=4;
 const canvas=document.createElement("canvas");canvas.width=canvas.height=size;
 const ctx=canvas.getContext("2d");
 if(!ctx)throw Error("المتصفح لا يدعم رسم QR.");
 ctx.fillStyle="#fff";ctx.fillRect(0,0,size,size);
 const cell=size/(qr.size+2*margin);ctx.fillStyle="#132533";
 for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y)){
  const left=Math.round((x+margin)*cell),top=Math.round((y+margin)*cell);
  ctx.fillRect(left,top,Math.round((x+margin+1)*cell)-left,Math.round((y+margin+1)*cell)-top);
 }
 return canvas;
}
const encode=s=>new TextEncoder().encode(s);
const bytesFromBase64=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
const merge=chunks=>{
 const length=chunks.reduce((n,a)=>n+a.length,0),result=new Uint8Array(length);
 let at=0;for(const c of chunks){result.set(c,at);at+=c.length}return result;
};
const escapePdf=s=>s.replace(/[\\()]/g,m=>"\\"+m);
export function buildInvitationPdf({url,title,seat,expiresAt}){
 if(!url.startsWith("https://scientifica007.github.io/Official_report_template_03/"))
  throw Error("رابط الدعوة ليس ضمن المنصة المعتمدة.");
 const canvas=document.createElement("canvas");canvas.width=1190;canvas.height=1684;
 const ctx=canvas.getContext("2d");
 if(!ctx)throw Error("لا يدعم المتصفح إنشاء البطاقة.");
 ctx.fillStyle="#fff";ctx.fillRect(0,0,1190,1684);
 ctx.fillStyle="#153f58";ctx.fillRect(0,0,1190,170);
 ctx.fillStyle="#fff";ctx.direction="rtl";ctx.textAlign="center";
 ctx.font="bold 49px Tahoma,Arial";ctx.fillText("دعوة للمشاركة في لجنة الترسيم",595,108);
 ctx.fillStyle="#183647";ctx.font="bold 34px Tahoma,Arial";ctx.fillText(seat,595,250);
 ctx.font="28px Tahoma,Arial";ctx.fillText((title||"مهمة لجنة الترسيم").slice(0,54),595,319);
 ctx.drawImage(qrCanvas(url,700),245,390,700,700);
 ctx.font="bold 31px Tahoma,Arial";ctx.fillText("امسح رمز QR لفتح مساهمتك مباشرة",595,1160);
 ctx.font="22px Tahoma,Arial";
 ctx.fillText("تنتهي الصلاحية: "+(expiresAt?new Date(expiresAt).toLocaleString("ar-DZ"):"عند إغلاق المهمة"),595,1280);
 ctx.fillStyle="#1b5e86";ctx.fillRect(93,1340,1004,130);
 ctx.fillStyle="#fff";ctx.font="bold 27px Tahoma,Arial";ctx.fillText("اضغط هنا للدخول إلى مساهمتك",595,1421);
 ctx.fillStyle="#815924";ctx.font="21px Tahoma,Arial";ctx.fillText("الرابط خاص بك؛ لا تعِد إرساله. يمكن لرئيس اللجنة إلغاءه.",595,1530);
 const image=bytesFromBase64(canvas.toDataURL("image/jpeg",.92).split(",")[1]);
 const chunks=[],offsets=[0];let total=0;
 function add(data){const a=typeof data==="string"?encode(data):data;chunks.push(a);total+=a.length}
 function obj(n,source){offsets[n]=total;add(n+" 0 obj\n");add(source);add("\nendobj\n")}
 add("%PDF-1.4\n");
 obj(1,"<</Type /Catalog /Pages 2 0 R>>");
 obj(2,"<</Type /Pages /Kids [3 0 R] /Count 1>>");
 obj(3,"<</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources <</XObject <</Im1 5 0 R>>>> /Contents 4 0 R /Annots [6 0 R]>>");
 const commands="q 595 0 0 842 0 0 cm /Im1 Do Q\n";
 obj(4,"<</Length "+encode(commands).length+">>\nstream\n"+commands+"endstream");
 offsets[5]=total;add("5 0 obj\n<</Type /XObject /Subtype /Image /Width 1190 /Height 1684 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "+image.length+">>\nstream\n");
 add(image);add("\nendstream\nendobj\n");
 obj(6,"<</Type /Annot /Subtype /Link /Rect [46 107 549 173] /Border [0 0 0] /A <</S /URI /URI ("+escapePdf(url)+")>>>>");
 const xref=total;add("xref\n0 7\n0000000000 65535 f \n");
 for(let n=1;n<=6;n++)add(String(offsets[n]).padStart(10,"0")+" 00000 n \n");
 add("trailer\n<</Size 7 /Root 1 0 R>>\nstartxref\n"+xref+"\n%%EOF\n");
 return new Blob([merge(chunks)],{type:"application/pdf"});
}
export function downloadInvitationPdf(input){
 const blob=buildInvitationPdf(input),object=URL.createObjectURL(blob);
 const link=document.createElement("a");link.href=object;
 link.download="committee-invitation-"+(input.seat==="العضو الأول"?"1":input.seat==="العضو الثاني"?"2":"3")+".pdf";
 document.body.append(link);link.click();link.remove();
 window.setTimeout(()=>URL.revokeObjectURL(object),20000);
}
