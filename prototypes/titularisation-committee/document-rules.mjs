/* Document-only helpers. Advisory prose never changes inspector-authored data. */
const months=Object.freeze({
 "جانفي":1,"يناير":1,"فيفري":2,"فبراير":2,"مارس":3,"أفريل":4,"ابريل":4,
 "ماي":5,"مايو":5,"جوان":6,"يونيو":6,"جويلية":7,"يوليو":7,"أوت":8,"اغسطس":8,"أغسطس":8,
 "سبتمبر":9,"سبتـمبر":9,"أكتوبر":10,"اكتوبر":10,"نوفمبر":11,"ديسمبر":12
});
const standardMonths=["","جانفي","فيفري","مارس","أفريل","ماي","جوان","جويلية","أوت","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const days=["","الأول","الثاني","الثالث","الرابع","الخامس","السادس","السابع","الثامن","التاسع","العاشر",
 "الحادي عشر","الثاني عشر","الثالث عشر","الرابع عشر","الخامس عشر","السادس عشر","السابع عشر",
 "الثامن عشر","التاسع عشر"];
const units=["","واحد","اثنين","ثلاثة","أربعة","خمسة","ستة","سبعة","ثمانية","تسعة"];
const decades=["","","عشرين","ثلاثين","أربعين","خمسين","ستين","سبعين","ثمانين","تسعين"];
const normalizeDigits=s=>String(s??"").replace(/[٠-٩]/g,ch=>String(ch.charCodeAt(0)-0x660))
 .replace(/[۰-۹]/g,ch=>String(ch.charCodeAt(0)-0x6f0));
const yearWords=year=>{
 if(year===2000)return "ألفية";
 if(year>=2001&&year<=2099){
  const suffix=year-2000;
  if(suffix===100)return "ألفية ومائة";
  if(suffix<10)return "ألفية و"+units[suffix];
  if(suffix===10)return "ألفية وعشرة";
  if(suffix===11)return "ألفية وأحد عشر";
  if(suffix===12)return "ألفية واثني عشر";
  if(suffix<20)return "ألفية و"+["","","","ثلاثة عشر","أربعة عشر","خمسة عشر","ستة عشر","سبعة عشر","ثمانية عشر","تسعة عشر"][suffix-10];
  const ten=Math.floor(suffix/10),unit=suffix%10;
  return "ألفية و"+(unit?units[unit]+" و":"")+decades[ten];
 }
 return String(year);
};
export function parseInspectionDate(raw){
 const input=normalizeDigits(raw).trim().replace(/\s+/g," ");
 let day,month,year;
 const textual=input.match(/^(\d{1,2})\s+([^\d\s]+)\s+(\d{4})$/u);
 const numeric=input.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
 if(textual){day=Number(textual[1]);month=months[textual[2]];year=Number(textual[3]);}
 else if(numeric){day=Number(numeric[1]);month=Number(numeric[2]);year=Number(numeric[3]);}
 else return null;
 if(!month||month>12||!Number.isInteger(year)||year<1900||year>2099)return null;
 const check=new Date(Date.UTC(year,month-1,day));
 if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return null;
 return {day,month,year,monthName:standardMonths[month]};
}
const dayWords=day=>{
 if(day<=19)return days[day];
 if(day===20)return "العشرون";
 if(day===30)return "الثلاثون";
 return ["","الحادي","الثاني","الثالث","الرابع","الخامس","السادس","السابع","الثامن","التاسع"][day%10]+
  (day<30?" والعشرون":" والثلاثون");
};
/** Literal date for the minutes. Keep raw text if input cannot be parsed reliably. */
export function dateInArabicWords(raw){
 const p=parseInspectionDate(raw);
 return p?dayWords(p.day)+" من شهر "+p.monthName+" سنة "+yearWords(p.year):
  String(raw??"").trim()||"................................................";
}
export function reportMonthYear(raw){
 const p=parseInspectionDate(raw);
 return p?p.monthName+" "+p.year:String(raw??"").trim()||"الشهر والسنة";
}
/** Numerics only; committee may replace the proposal freely at any time. */
export function suggestedAppreciation(final20){
 if(typeof final20!=="number"||!Number.isFinite(final20)||final20<0||final20>20)return "";
 if(final20<10)return "ضعيف/غير مقبول";
 if(final20<11)return "مقبول";
 if(final20<13)return "حسن";
 if(final20<15)return "جيد";
 return "جيد جدًّا";
}
export function reportFooter(meta,page,total=5){
 if(!Number.isInteger(page)||!Number.isInteger(total)||page<1||total<1||page>total)
  throw Error("صفحة تقرير غير معروفة");
 const candidate=(meta.candidate||[meta.familyName,meta.givenName].filter(Boolean).join(" ")||"_____").trim();
 const institution=(meta.institution||"_______").trim();
 return "تقرير عملية التفتيش قصد الترسيم للأستاذ المتربص: «"+candidate+
  "» المؤسسة: «"+institution+"»، "+reportMonthYear(meta.date)+"، الصفحة "+page+" من "+total;
}
export function struckChoices(decision){
 const names=[["success","ناجح(ة)"],["first","التأجيل الأول"],["second","التأجيل الثاني"]];
 return names.map(([key,label])=>({key,label,struck:!!decision&&decision!==key,chosen:decision===key}));
}
