// Administrative presentation only. All row mutation authority lives in SQL RPCs.
export const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const h=(x)=>esc(x);
const option=(id,label,selected=false)=>'<option value="'+h(id)+'"'+(selected?' selected':'')+'>'+h(label)+'</option>';
const choice=rows=>rows.map(x=>option(x.id,x.code+" — "+x.label)).join("");
const displayName=p=>[p.first_name,p.last_name].filter(Boolean).join(" ")||"حساب دون اسم";
const wrap=(title,body)=>'<section class="card"><h2>'+h(title)+'</h2>'+body+'</section>';
export function viewDistricts(db){
 const entries=db.districts.map(d=>
 '<details><summary>'+h(d.code)+' — '+h(d.label)+'</summary>'+
 '<form data-operation="district-edit" data-id="'+h(d.id)+'"><div class="fields">'+
 '<div class="field"><label>الرمز الذي تختاره</label>'+
 '<input name="p_code" required maxlength="100" value="'+h(d.code)+'"></div>'+
 '<div class="field"><label>الاسم الذي تختاره</label>'+
 '<input name="p_label" required maxlength="200" value="'+h(d.label)+'"></div></div>'+
 '<div class="actions"><button type="submit" class="btn primary">حفظ الاسم والرمز</button></div>'+
 '<p class="hint">تعديل هذه المقاطعة يبقي هويتها الداخلية وروابط المفتشين والمؤسسات كما هي.</p></form></details>').join("");
 return '<p class="note">أنت تحدد رمز مقاطعة العمل واسمها. يمكن أن يكون الرمز 12 أو 12-01 أو 12-أ أو غيرها. لا يُشتق من رمز الولاية ولا يقيّد تعيين المؤسسات.</p>'+
 wrap("المقاطعات الموجودة ("+db.districts.length+")",entries||
 '<p class="hint">لا توجد مقاطعات مسجلة بعد.</p>')+
 wrap("إضافة مقاطعة",'<form data-operation="district-create"><div class="fields">'+
 '<div class="field"><label>رمز المقاطعة، باختيارك</label>'+
 '<input name="p_code" placeholder="12 أو 12-أ أو تبسة-شرق" required maxlength="100"></div>'+
 '<div class="field"><label>اسم المقاطعة، باختيارك</label>'+
 '<input name="p_label" placeholder="مقاطعة تبسة" required maxlength="200"></div></div>'+
 '<div class="actions"><button class="btn primary" type="submit">إنشاء مقاطعة</button></div>'+
 '<p class="hint">يشترط فقط ألا يكون الرمز فارغًا أو مطابقًا لرمز مقاطعة أخرى. لا تُغيّر بيانات المؤسسات أو المفتشين الموجودة.</p></form>');
}
export function viewInspectors(db){
 const users=db.profiles.filter(p=>!p.is_admin);
 const opts=users.map(p=>option(p.id,displayName(p)+" — "+
  (db.districts.find(d=>d.id===p.work_district_id)?.label||"غير مُسند"))).join("");
 const ds=choice(db.districts.filter(d=>d.active));
 return '<p class="note">حساب Admin مستقل عن حساب المفتش. هنا تختار مقاطعة عمل كل مفتش؛ لا يُستخدم عنوان السكن أو الولاية لاشتقاقها.</p>'+
 wrap("المفتشون ("+users.length+")",users.map(p=>
 '<article class="list-entry"><strong>'+h(displayName(p))+'</strong><small>'+
 h(p.profession||"")+' | '+h(db.districts.find(d=>d.id===p.work_district_id)?.label||"لم تُحدَّد مقاطعته")+
 '</small></article>').join(""))+
 wrap("إسناد مقاطعة عمل",'<form data-operation="inspector-assign"><div class="fields">'+
 '<div class="field"><label>حساب المفتش</label><select name="p_inspector" required>'+opts+'</select></div>'+
 '<div class="field"><label>مقاطعة العمل التي تختارها</label><select name="p_district" required>'+ds+'</select></div>'+
 '<div class="field wide"><label>ملاحظة إدارية اختيارية</label>'+
 '<textarea name="p_reason" maxlength="500" placeholder="اختياري"></textarea></div></div>'+
 '<div class="actions"><button type="submit" class="btn primary">حفظ إسناد المفتش</button></div></form>');
}
export function viewInstitutions(db){
 const allowed=db.districts.filter(d=>d.active);
 const options=choice(allowed);
 const availableLegacy=db.legacy.filter(l=>
  !db.resources.some(r=>r.legacy_institution_id===l.id));
 const sections=db.resources.map(r=>{
  const assigned=new Set(db.assignments.filter(a=>a.resource_id===r.id).map(a=>a.work_district_id));
  const checkboxes=allowed.map(d=>
   '<li><label><input name="p_districts" type="checkbox" value="'+h(d.id)+'"'+
   (assigned.has(d.id)?' checked':'')+'> '+h(d.code+' — '+d.label)+'</label></li>').join("");
  return '<details><summary>'+h(r.title)+
    ' — '+h(r.code||"دون رمز")+' ('+assigned.size+' مقاطعة)</summary>'+
   '<form data-operation="institution-assign" data-id="'+h(r.id)+'">'+
   '<p class="hint">يمكن اختيار عدة مقاطعات للمؤسسة الواحدة، أو إلغاء اختيارها جميعًا دون حذف المؤسسة.</p>'+
   '<ul class="district-choices">'+checkboxes+'</ul>'+
   '<button type="submit" class="btn primary">حفظ المقاطعات المحددة</button>'+
   '</form></details>';
 }).join("");
 const create=wrap("إضافة مؤسسة جديدة إلى السجل المشترك",
  '<form data-operation="institution-create"><div class="fields">'+
  '<div class="field"><label>اسم المؤسسة</label><input name="p_title" required maxlength="250"></div>'+
  '<div class="field"><label>رمز المؤسسة (اختياري)</label><input name="p_code" maxlength="80"></div>'+
  '<div class="field"><label>ولاية موقع المؤسسة (بيان وصفي)</label><input name="p_wilaya" maxlength="120"></div>'+
  '<div class="field"><label>المقاطعة الأولى للنشر</label><select name="p_initial_district" required>'+options+'</select></div>'+
  '</div><div class="actions"><button type="submit" class="btn primary">إضافة المؤسسة</button></div>'+
  '<p class="hint">بعد الإضافة يمكنك تحديد مقاطعات إضافية من قائمة المؤسسات، دون إنشاء نسخ منها.</p></form>');
 const importArea=wrap("إدراج مؤسسة موجودة في السجل القديم",
  '<p class="hint">يُربط السجل القديم بسجل المنشورات الجديد مرة واحدة فقط؛ لا نُغير السجل الأصلي.</p>'+
  (availableLegacy.length?'<form data-operation="institution-import"><div class="fields">'+
   '<div class="field"><label>المؤسسة القديمة</label><select name="p_legacy_id">'+
   availableLegacy.map(x=>option(x.id,x.name+" — "+x.code)).join("")+'</select></div>'+
   '<div class="field"><label>مقاطعة النشر الأولى</label>'+
   '<select name="p_initial_district">'+options+'</select></div></div>'+
   '<div class="actions"><button class="btn primary" type="submit">ربط المؤسسة المختارة</button></div></form>':
   '<p class="hint">كل مؤسسات السجل القديم متاحة في السجل الجديد أو لا توجد مؤسسات قديمة.</p>'));
 return '<p class="note">المؤسسة سجل واحد يمكن نشره في عدد غير محدود من المقاطعات التي تنشئها، بغض النظر عن الولاية التي تقع فيها.</p>'+
  wrap("المؤسسات المشتركة ("+db.resources.length+")",sections||
  '<p class="hint">لا توجد مؤسسات منشورة بعد. يمكنك إنشاء مؤسسة أو ربط سجل قديم.</p>')+
  create+importArea;
}
export function viewRequests(db){
 const pending=db.requests.filter(r=>r.status==="submitted");
 const status={submitted:"بانتظار قرارك",approved:"تم قبول النشر",rejected:"رُفض الطلب"};
 return '<p class="note">تعالج طلبات نشر المؤسسات على مستوى إدارة الموقع، دون اشتراط وجود Admin داخل مقاطعة عمل معينة.</p>'+
 wrap("طلبات النشر المعلقة ("+pending.length+")",db.requests.length?
 db.requests.map(r=>{
  const title=r.proposed_payload?.title||"مؤسسة دون اسم";
  const owner=db.profiles.find(p=>p.id===r.author_id);
  return '<article class="list-entry"><strong>'+h(title)+'</strong>'+
   '<small>'+h(status[r.status]||r.status)+' | مقدّم الطلب: '+h(owner?displayName(owner):"غير معروف")+
   '</small>'+ (r.status==="submitted"?
   '<div class="actions"><button type="button" class="btn primary" data-action="approve" data-id="'+h(r.id)+'">الموافقة</button>'+
   '<button type="button" class="btn danger" data-action="reject" data-id="'+h(r.id)+'">الرفض</button></div>':
   '<p class="hint">'+h(r.decision_reason||"")+'</p>')+'</article>';
 }).join(""):'<p class="hint">لا توجد طلبات منشورة للمراجعة.</p>');
}
