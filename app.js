/* Official Report 03: report stays in memory; institution and director records use browser storage. */
'use strict';
let catalog = null;
let state = emptyState();
// Automatic account identity is applied once to a new blank draft only.
// Importing a JSON report or manually editing the inspector list opts out.
let mayPrefillAccountInspector = true;
let currentView = 'meta';
let currentDomain = null;
let changed = false;
/* Text typed into a field is retained in tab memory even before pressing Add. */
let pendingDrafts = Object.create(null);
let sharedReportMissionId='',individualReportContext=null,sharedProvenance=null;
// Presentation-only toggle; soft highlights are the default, no effect on Supabase data.
let useStrongDraftHighlight=false;
// Visible persistence status for the two collaborative report-summary textareas.
let sharedSummaryStatus=Object.create(null),sharedSummaryCommitted=Object.create(null);
const SUMMARY_KEYS=['generalAssessment','generalRecommendations'];
const summaryLabel=key=>key==='generalAssessment'?'التقدير العام حول سير المؤسسة والاختلالات':'التوصيات العامة الإضافية';
function pendingSharedSummaryFields(){
 if(!isSharedReport())return [];
 return SUMMARY_KEYS.filter(key=>['editing','saving','error'].includes(sharedSummaryStatus[key])).map(key=>({key,label:summaryLabel(key),status:sharedSummaryStatus[key]}));
}
function sharedSummaryText(key){
 return ({editing:'تعديل غير محفوظ — يُحفظ عند مغادرة الحقل أو بالضغط على «حفظ»',
 saving:'جارٍ حفظ التعديل في المهمة المشتركة…',
 saved:'حُفظ التعديل في المهمة المشتركة',
 error:'تعذر حفظ التعديل. النص ما زال هنا؛ حاول الحفظ مرة أخرى.'})[sharedSummaryStatus[key]]||'';
}
function setSharedSummaryStatus(key,status,value){
 if(!isSharedReport()||!SUMMARY_KEYS.includes(key))return false;
 if(status==='saved'){
  sharedSummaryCommitted[key]=String(value??'');
  if(state.summary[key]!==sharedSummaryCommitted[key])status='editing';
 }else if(status==='editing'&&String(value??'')===String(sharedSummaryCommitted[key]??''))status=sharedSummaryStatus[key]==='saved'?'saved':'';
 sharedSummaryStatus[key]=status;
 const input=document.getElementById('summary-'+key);
 const wrap=input?.closest?.('.shared-summary-field');
 if(wrap)wrap.dataset.saveState=status;
 const line=document.querySelector?.('[data-summary-status="'+key+'"]');
 if(line)line.textContent=sharedSummaryText(key);
 return true;
}
function focusSharedSummary(key){
 if(!isSharedReport()||!SUMMARY_KEYS.includes(key))return false;
 if(currentView!=='meta'){currentView='meta';render();}
 const input=document.getElementById('summary-'+key);
 input?.scrollIntoView?.({behavior:'smooth',block:'center'});
 input?.focus?.({preventScroll:true});
 return Boolean(input);
}
const isSharedReport=()=>Boolean(sharedReportMissionId);
function sharedReportHasInputs(){
 return Object.values(pendingDrafts).some(d=>d&&Object.values(d).some(x=>text(x)))||
  Object.values(state.entries||{}).some(e=>(e?.findings?.length||0)+(e?.recommendations?.length||0)>0)||
  Object.values(state.summary||{}).some(x=>text(x))||
  Object.values(state.mission||{}).some(x=>text(x));
}
function sharedDraftReview(){
 const drafts=window.Report03CloudUI?.pendingSharedDrafts?.()||[];
 if(!drafts.length)return '<span class="shared-draft-clean">لا توجد مساهمات معلّقة للحفظ في هذا التبويب.</span>';
 return '<strong>تنبيه: '+drafts.length+' مسودة غير محفوظة قد تمنع التصدير.</strong>'+
 '<span>اختر الموضع، ثم احفظ المساهمة أو امح نصها إذا كنت لا تريد إدراجها:</span>'+
 '<div class="shared-draft-links">'+drafts.map((draft,i)=>
 '<button type="button" class="shared-draft-link" data-shared-action="goto" data-item-id="'+safe(draft.itemId)+'"'+
 ' title="'+safe(draft.label)+'">'+(i+1)+'. '+safe(draft.label)+'</button>').join('')+'</div>';
}
function sharedMissionBanner(){
 return '<div class="shared-report-banner" role="status"><strong>محرر التقرير المشترك — '+safe(sharedProvenance?.title||'مهمة تفتيش')+
 '</strong><span>كل معاينة وتوصية تُحفظ في المهمة باسم صاحبها، وتظهر لزملائه عند التحديث.</span>'+ '<span id="shared-report-status" role="status" aria-live="polite" class="shared-report-status"></span>'+
 '<button type="button" class="btn subtle draft-tone-toggle" data-draft-contrast aria-pressed="'+String(useStrongDraftHighlight)+'">'+
 (useStrongDraftHighlight?'تمييز المسودات: قوي — تغيير إلى هادئ':'تمييز المسودات: هادئ — تغيير إلى قوي')+'</button>'+
 '<button type="button" class="btn subtle" data-shared-action="refresh">تحديث المساهمات</button>'+
 '<button type="button" class="btn subtle" data-shared-action="exit">العودة إلى مهام التفتيش</button>'+
 '<div id="shared-draft-review" class="shared-draft-review'+((window.Report03CloudUI?.pendingSharedDrafts?.()||[]).length?' has-unsent':'')+'" role="status" aria-live="polite">'+sharedDraftReview()+'</div></div>';
}
const $ = id => document.getElementById(id);
const FIELDSETS = [
 {id:'mission',label:'بيانات مهمة التفتيش',fields:[['purpose','الهدف من المهمة','textarea'],['period','الفترة المرجعية للفحص (مثل ثلاث سنوات)','text'],['visitDates','تواريخ إجراء مهمة التفتيش','text'],['previousReports','تقارير التفتيش السابقة التي تم الاطلاع عليها','textarea'],['monthYear','الشهر / السنة','text']]},
 {id:'institution',label:'التعريف بالمؤسسة',fields:[['name','التسمية','text'],['wilaya','الولاية','text'],['code','الرمز','text'],['decree','مرسوم الإنشاء','text'],['decreeDate','تاريخ مرسوم الإنشاء','text'],['startDate','تاريخ بداية النشاط','text'],['address','العنوان','text'],['phone','الهاتف','text'],['fax','الفاكس','text'],['email','البريد الإلكتروني','text'],['website','الموقع الإلكتروني','text'],['speciality','اختصاص المؤسسة','text'],['distance','البعد عن مقر الولاية','text'],['mapUrl','الموقع الجغرافي للمؤسسة (رابط خرائط Google)','text']]},
 {id:'director',label:'معلومات رئيس المؤسسة',fields:[['fullName','الاسم واللقب','text'],['job','الوظيفة','text'],['rank','الرتبة','text'],['installedAt','تاريخ التنصيب بالمؤسسة','text'],['firstAppointedAt','تاريخ أول تعيين كمدير','text']]},
 {id:'summary',label:'خلاصة التقرير',fields:[['generalAssessment','التقدير العام حول سير المؤسسة والاختلالات','textarea'],['generalRecommendations','التوصيات العامة الإضافية (كل توصية في سطر)','textarea']]}
];

/* Separate browser-local institution/director register. No reports or findings are persisted. */
const BOOK_KEY='official_report_03_institutions_v1',BOOK_FORMAT='OFFICIAL_REPORT_03_INSTITUTIONS_V1';
const INST_KEYS=FIELDSETS.find(x=>x.id==='institution').fields.map(x=>x[0]);
const HEAD_KEYS=FIELDSETS.find(x=>x.id==='director').fields.map(x=>x[0]);
let institutionBook=[],selectedInstitutionId='',selectedCloudInstitutionId='',bookError='';
function fieldsOnly(data,keys){const o={};for(const k of keys)o[k]=typeof data?.[k]==='string'?data[k].trim():'';return o}
function bookData(x){return {institution:fieldsOnly(x.institution,INST_KEYS),director:fieldsOnly(x.director,HEAD_KEYS)}}
function bookNorm(x){return text(x).normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('ar')}
function sameInstitution(a,b){return Boolean((a.code&&b.code&&bookNorm(a.code)===bookNorm(b.code))||(a.name&&b.name&&bookNorm(a.name)===bookNorm(b.name)&&bookNorm(a.wilaya)===bookNorm(b.wilaya)))}
function bookRecord(x){
 if(!x||typeof x!=='object'||Array.isArray(x))return null;
 const data=bookData(x);
 if(!data.institution.name||data.institution.name.length>300||[...Object.values(data.institution),...Object.values(data.director)].some(s=>s.length>5000))return null;
 return {id:typeof x.id==='string'&&x.id&&x.id.length<100?x.id:makeId(),...data,
 createdAt:typeof x.createdAt==='string'?x.createdAt.slice(0,60):'',
 updatedAt:typeof x.updatedAt==='string'?x.updatedAt.slice(0,60):''}
}
function loadInstitutionBook(){
 try{const raw=localStorage.getItem(BOOK_KEY);
 if(!raw){institutionBook=[];bookError='';return}
 const x=JSON.parse(raw);
 if(x?.format!==BOOK_FORMAT||!Array.isArray(x.institutions)||x.institutions.length>500)throw Error('صيغة السجل غير صالحة');
 const entries=x.institutions.map(bookRecord);
 if(entries.some(x=>!x)||new Set(entries.map(x=>x.id)).size!==entries.length)throw Error('بيانات السجل غير صالحة');
 institutionBook=entries;bookError='';
 }catch(e){institutionBook=[];bookError='تعذرت قراءة سجل المؤسسات في هذا المتصفح: '+e.message+'. لم تُستبدل البيانات السابقة.'}
}
function persistBook(records){
 if(bookError){showToast('تعذر تعديل سجل المؤسسات قبل إصلاح مشكلة قراءته.');return false}
 try{if(records.length>500)throw Error('بلغ السجل الحد الأقصى البالغ 500 مؤسسة');
 localStorage.setItem(BOOK_KEY,JSON.stringify({format:BOOK_FORMAT,institutions:records}));
 institutionBook=records;return true
 }catch(e){showToast('تعذر حفظ المؤسسات محليًا: '+e.message);return false}
}
function hasInspectionInput(){return Object.values(state.entries).some(e=>e&&((e.findings||[]).length||(e.recommendations||[]).length||assessmentLabel(e.assessment)))||
 Object.values(pendingDrafts).some(e=>e&&(text(e.findings)||text(e.recommendations)))}
function chooseInstitution(id){
 if(id.startsWith('central:')){
  const result=window.Report03CloudUI?.selectForReport?.(id.slice('central:'.length));
  if(!result?.ok){showToast(result?.message||'تعذر تحميل المؤسسة المشتركة. حدّث قائمة المؤسسات ثم حاول مجددًا.');render()}
  else showToast('حُمّلت بيانات المؤسسة المشتركة ورئيسها إلى التقرير دون نسخها إلى السجل المحلي.');
  return;
 }
 const record=institutionBook.find(x=>x.id===id);
 if(id&&!record){showToast('المؤسسة غير موجودة.');render();return}
 if(hasInspectionInput()){showToast('لا يمكن تغيير المؤسسة مع وجود معاينات أو تقييمات. صدّر التقرير ثم امحُ بيانات التقرير أولًا.');render();return}
 if([...Object.values(state.institution),...Object.values(state.director)].some(text)&&
 !confirm('استبدال بيانات المؤسسة ورئيسها بمعلومات المؤسسة المختارة؟ لن تُحذف بيانات المهمة أو المفتشين.')){render();return}
 state.institution=record?{...record.institution}:{};
 state.director=record?{...record.director}:{};
 selectedInstitutionId=record?.id||'';selectedCloudInstitutionId='';window.Report03CloudUI?.resetSelection?.();changed=true;render();
 showToast(record?'استُرجعت المؤسسة ورئيسها. اضغط «حفظ المؤسسة» لتثبيت أي تعديل.':'أدخل بيانات مؤسسة ورئيسها الجديد ثم احفظهما.');
}
function saveInstitution(){
 const data=bookData(state),i=data.institution;
 if(!i.name){showToast('أدخل تسمية المؤسسة أولًا.');return}
 if(i.name.length>300||[...Object.values(i),...Object.values(data.director)].some(s=>s.length>5000)){showToast('بعض الحقول طويلة جدًا.');return}
 if(institutionBook.some(x=>x.id!==selectedInstitutionId&&sameInstitution(x.institution,i))){showToast('المؤسسة محفوظة مسبقًا؛ اخترها من القائمة بدل إنشاء نسخة مكررة.');return}
 const old=institutionBook.find(x=>x.id===selectedInstitutionId),now=new Date().toISOString();
 const record={id:old?.id||makeId(),...data,createdAt:old?.createdAt||now,updatedAt:now};
 const next=old?institutionBook.map(x=>x.id===old.id?record:x):[...institutionBook,record];
 if(!persistBook(next))return;
 state.institution={...record.institution};state.director={...record.director};
 selectedInstitutionId=record.id;selectedCloudInstitutionId='';window.Report03CloudUI?.resetSelection?.();render();
 showToast(old?'حُفظت تعديلات المؤسسة ورئيسها.':'حُفظت المؤسسة ورئيسها في المتصفح.');
}
function deleteInstitution(){
 const old=institutionBook.find(x=>x.id===selectedInstitutionId);if(!old)return;
 if(!confirm('حذف «'+old.institution.name+'» من سجل المؤسسات؟ لن يُحذف تقريرك الحالي.'))return;
 if(!persistBook(institutionBook.filter(x=>x.id!==old.id)))return;
 selectedInstitutionId='';selectedCloudInstitutionId='';render();showToast('حُذفت المؤسسة من السجل فقط.');
}
function exportInstitutions(){
 const payload={format:BOOK_FORMAT,exportedAt:new Date().toISOString(),institutions:institutionBook};
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='official_report_03_institutions_'+new Date().toISOString().slice(0,10)+'.json';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 showToast('تم تنزيل نسخة احتياطية من المؤسسات ورؤسائها.');
}
async function importInstitutions(event){
 const file=event.target.files?.[0];event.target.value='';if(!file)return;
 try{if(file.size>3000000)throw Error('ملف كبير جدًا');
 const x=JSON.parse(await file.text());
 if(x?.format!==BOOK_FORMAT||!Array.isArray(x.institutions)||x.institutions.length>500)throw Error('ليست صيغة سجل المؤسسات');
 const incoming=x.institutions.map(bookRecord);
 if(incoming.some(x=>!x))throw Error('توجد مؤسسة ببيانات غير صالحة');
 const next=[...institutionBook];let added=0,skipped=0;
 for(const row of incoming){if(next.some(x=>sameInstitution(x.institution,row.institution))){skipped++;continue}
 next.push({...row,id:makeId()});added++}
 if(!persistBook(next))return;
 render();showToast('استوردت '+added+' مؤسسة، وتجاوزت '+skipped+' مؤسسة موجودة دون تغييرها.');
 }catch(e){showToast('تعذر استيراد سجل المؤسسات: '+e.message)}
}
function renderInstitutionBook(){
 const central=window.Report03CloudUI?.listReportInstitutions?.()||[];
 const centralOptions=central.map(x=>
  '<option value="central:'+safe(x.id)+'" '+(selectedCloudInstitutionId===x.id?'selected':'')+'>'+
  safe(x.name+(x.wilaya?' — '+x.wilaya:'')+(x.code?' ('+x.code+')':''))+'</option>').join('');
 const localOptions=[...institutionBook].sort((a,b)=>a.institution.name.localeCompare(b.institution.name,'ar')).map(x=>
  '<option value="'+safe(x.id)+'" '+(selectedInstitutionId===x.id?'selected':'')+'>'+
  safe(x.institution.name+(x.institution.wilaya?' — '+x.institution.wilaya:'')+(x.institution.code?' ('+x.institution.code+')':''))+'</option>').join('');
 return '<div class="institution-book"><h3>اختيار المؤسسة</h3>'+
 '<p class="helper">اختر مؤسسة من السجل المركزي المشترك لاسترجاع بياناتها ورئيسها مباشرة إلى التقرير. المؤسسات المحلية القديمة متاحة بصورة منفصلة.</p>'+
 (bookError?'<p class="institution-book-error">'+safe(bookError)+'</p>':'')+
 '<label for="stored-institution">اختيار مؤسسة مشتركة أو محلية، أو إنشاء مؤسسة جديدة</label>'+
 '<select id="stored-institution" data-stored-institution="true">'+
 '<option value="" '+(!selectedInstitutionId&&!selectedCloudInstitutionId?'selected':'')+'>+ مؤسسة جديدة</option>'+
 '<optgroup data-institution-source="central" label="المؤسسات المشتركة — السجل المركزي ('+central.length+')">'+centralOptions+'</optgroup>'+
 '<optgroup label="المؤسسات المحلية — هذا الجهاز ('+institutionBook.length+')">'+localOptions+'</optgroup>'+
 '</select>'+
 '<div class="institution-actions"><button type="button" class="add-button" data-save-institution="true">حفظ المؤسسة ورئيسها محليًا</button>'+
 '<button type="button" class="btn subtle" data-export-institutions="true">تصدير المؤسسات المحلية JSON</button>'+
 '<button type="button" class="btn subtle" data-import-institutions="true">استيراد المؤسسات المحلية JSON</button>'+
 (selectedInstitutionId?'<button type="button" class="btn danger-outline" data-delete-institution="true">حذف من السجل المحلي</button>':'')+
 '<input id="institutions-file" type="file" accept=".json,application/json" hidden></div>'+
 '<p class="helper">التعديل داخل التقرير لا يغيّر بيانات المؤسسة المركزية. لتعديل السجل المشترك استخدم قسم «المؤسسات» في لوحة القيادة. لا تُرفع معاينات التقرير أو توصياته إلى السحابة.</p></div>';
}


/* Only update the central options when Supabase finishes loading or changes.
 * Never call render() here: it replaces editable form fields, potentially
 * discarding in-progress typing, textarea selections and open dropdowns.
 */
function syncSharedInstitutionOptions(){
 const select=$('stored-institution');
 const group=select?.querySelector?.('optgroup[data-institution-source="central"]');
 if(!group)return false;
 const shared=window.Report03CloudUI?.listReportInstitutions?.()||[];
 const desired=shared.map(record=>({
  value:'central:'+record.id,
  label:record.name+(record.wilaya?' — '+record.wilaya:'')+(record.code?' ('+record.code+')':'')
 }));
 const existing=Array.from(group.querySelectorAll('option')).map(x=>({value:x.value,label:x.textContent}));
 const newLabel='المؤسسات المشتركة — السجل المركزي ('+desired.length+')';
 if(group.label===newLabel&&existing.length===desired.length&&
    existing.every((item,i)=>item.value===desired[i].value&&item.label===desired[i].label))return false;
 const selected=select.value;
 const elements=desired.map(row=>{
  const option=document.createElement('option');
  option.value=row.value;
  option.textContent=row.label;
  return option;
 });
 group.replaceChildren(...elements);
 group.label=newLabel;
 const options=Array.from(select.options||[]);
 if(options.some(option=>option.value===selected))select.value=selected;
 else if(selectedCloudInstitutionId&&desired.some(option=>option.value==='central:'+selectedCloudInstitutionId))
  select.value='central:'+selectedCloudInstitutionId;
 else select.value='';
 return true;
}

function emptyState(){return {templateId:'OFFICIAL_REPORT_TEMPLATE_03',catalogVersion:'M1.4-UX-ATOMIC-2026-10-12',status:'draft',mission:{},institution:{},director:{},summary:{},inspectors:[{id:makeId(),name:'',role:'IFEP',district:''}],entries:{},legacyAssessments:[]}}
function makeId(){return 'e'+Math.random().toString(36).slice(2,10)+Date.now().toString(36)}

function inspectorRoleFromAccount(value){
 const code=text(value).toUpperCase();
 if(['IFEP','ITP','IAF'].includes(code))return code;
 if(/إداري|مالي|ADMINISTRATIF|FINANCIER/i.test(code))return 'IAF';
 if(/تقني|بيداغوجي|TECHNIQUE|PÉDAGOGIQUE|PEDAGOGIQUE/i.test(code))return 'ITP';
 return 'IFEP';
}
function prefillAccountInspector(account){
 if(!mayPrefillAccountInspector||!account||!Array.isArray(state.inspectors))return false;
 const name=[text(account.first_name),text(account.last_name)].filter(Boolean).join(' ');
 if(!name)return false;
 if(state.inspectors.length!==1)return false;
 const first=state.inspectors[0];
 // Never override a previously typed or imported professional identity.
 if(!first||text(first.name)||text(first.district)||!['','IFEP'].includes(text(first.role))){
  mayPrefillAccountInspector=false;
  return false;
 }
 first.name=name;
 if(account.id)first.profileId=String(account.id);
 first.role=inspectorRoleFromAccount(account.profession);
 first.district=text(account.district).slice(0,100);
 mayPrefillAccountInspector=false;
 changed=true;
 // Supabase may load after catalog and editor render. Update ONLY the three
 // visible inspector inputs; a full render would discard active text drafts.
 if(currentView==='meta'){
  for(const key of ['name','role','district']){
   const control=document.querySelector('[data-inspector="0"][data-prop="'+key+'"]');
   if(control)control.value=first[key];
  }
 }
 return true;
}
function prefillFromCurrentSession(){
 const account=window.Report03CloudUI?.getReportOwner?.();
 if(account)return prefillAccountInspector(account);
 return false;
}


/* The directory is a read-only list of already approved peers. Selecting one
 * copies identity fields only; it does not invite anyone to share a report. */
function availableReportColleagues(){
 const list=window.Report03CloudUI?.listReportColleagues?.()||[];
 const used=new Set(state.inspectors.map(p=>p.profileId).filter(Boolean));
 return list.filter(p=>p.id&&!used.has(p.id));
}
function colleagueLabel(p){
 const name=[text(p.first_name),text(p.last_name)].filter(Boolean).join(' ');
 const profession=({IFEP:'مفتش التكوين والتعليم المهنيين',
  ITP:'مفتش تقني وبيداغوجي',IAF:'مفتش إداري ومالي'})[p.profession]||p.profession||'';
 return [name,profession,text(p.district)?'المقاطعة '+text(p.district):''].filter(Boolean).join(' — ');
}
function renderReportColleaguePicker(){
 const people=availableReportColleagues();
 return '<div class="report-colleague-picker">'+
 '<label for="report-colleague-select">اختيار مفتش إضافي من دليل الزملاء المعتمدين</label>'+
 '<div class="report-colleague-controls"><select id="report-colleague-select" aria-label="المفتش المشارك من الدليل">'+
 '<option value="">'+(people.length?'— اختر مفتشًا معتمدًا —':'لا يوجد زملاء آخرون متاحون')+'</option>'+
 people.map(p=>'<option value="'+safe(p.id)+'">'+safe(colleagueLabel(p))+'</option>').join('')+
 '</select><button type="button" class="add-button" id="add-directory-inspector" '+(!people.length?'disabled':'')+
 '>+ إضافة من الدليل</button></div>'+
 '<p class="helper">يُنسخ الاسم والصفة والمقاطعة فقط إلى التقرير. اختيار الزميل لا يمنحه حق الاطلاع أو التحرير المشترك. يمكنك أيضًا إضافة مفتش يدويًا.</p></div>';
}
function addDirectoryInspector(id){
 const person=window.Report03CloudUI?.findReportColleague?.(id);
 if(!person){showToast('المفتش غير متاح أو لم يعد معتمدًا؛ حدّث دليل الزملاء.');return false}
 if(state.inspectors.some(p=>p.profileId===person.id)){
  showToast('هذا المفتش مدرج مسبقًا ضمن المشاركين.');return false;
 }
 const name=[text(person.first_name),text(person.last_name)].filter(Boolean).join(' ');
 if(!name){showToast('لا تتوفر بيانات اسم صحيحة لهذا المفتش.');return false}
 state.inspectors.push({id:makeId(),profileId:person.id,name:name.slice(0,200),
  role:inspectorRoleFromAccount(person.profession),district:text(person.district).slice(0,100)});
 mayPrefillAccountInspector=false;changed=true;render();showToast('أضيف المفتش من الدليل إلى التقرير.');
 return true;
}
function syncReportColleagueOptions(){
 const select=$('report-colleague-select');
 const button=$('add-directory-inspector');
 if(!select)return false;
 const people=availableReportColleagues();
 const rows=people.map(p=>({value:p.id,label:colleagueLabel(p)}));
 const current=Array.from(select.options||[]).slice(1).map(p=>({value:p.value,label:p.textContent}));
 const placeholder=rows.length?'— اختر مفتشًا معتمدًا —':'لا يوجد زملاء آخرون متاحون';
 const first=select.options?.[0]?.textContent;
 if(first===placeholder&&current.length===rows.length&&
    current.every((v,i)=>v.value===rows[i].value&&v.label===rows[i].label)){
  if(button)button.disabled=!rows.length;
  return false;
 }
 const selected=select.value;
 const placeholderOption=document.createElement('option');
 placeholderOption.value='';placeholderOption.textContent=placeholder;
 const options=rows.map(row=>{
  const option=document.createElement('option');
  option.value=row.value;option.textContent=row.label;
  return option;
 });
 select.replaceChildren(placeholderOption,...options);
 select.value=rows.some(x=>x.value===selected)?selected:'';
 if(button)button.disabled=!rows.length;
 return true;
}

function safe(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function text(v){return String(v??'').trim()}
function googleMapsLink(value){try{const u=new URL(String(value||'').trim());if(u.protocol!=='https:')return null;const h=u.hostname.toLowerCase();if(h==='maps.app.goo.gl'||h==='goo.gl'&&u.pathname.startsWith('/maps/'))return u.href;if(h==='maps.google.com'||h==='maps.google.dz')return u.href;if(['www.google.com','google.com','www.google.dz','google.dz'].includes(h)&&u.pathname.startsWith('/maps'))return u.href;return null}catch{return null}}
function valid(){return !!catalog && Array.isArray(catalog.sections)}
function allDomains(){return catalog.sections.flatMap(s=>s.domains.map(d=>({...d,section:s.id,chapter:s.label})))}
function sectionOf(id){return catalog.sections.find(s=>s.id===id)}
function target(id){for(const s of catalog.sections) for(const d of s.domains){if(d.id===id)return {section:s,domain:d,item:null};for(const i of d.indicators){if(i.id===id)return {section:s,domain:d,item:i}}}return null}
const ASSESSMENTS=Object.freeze({compliant:'مطابق',non_compliant:'غير مطابق',not_applicable:'غير معني'});
function assessmentLabel(code){return ASSESSMENTS[code]||''}
function getEntry(id){return state.entries[id]??{assessment:null,findings:[],recommendations:[]}}
function renderAssessmentControl(id){const e=getEntry(id);return `<div class="assessment-control" data-value="${safe(e.assessment||'')}"><label for="assessment-${safe(id)}">نتيجة الفحص أو التقييم</label><select id="assessment-${safe(id)}" data-assessment="${safe(id)}" aria-label="نتيجة فحص أو تقييم هذا العنصر"><option value="" ${!assessmentLabel(e.assessment)?'selected':''}>لم يُقيّم بعد</option>${Object.entries(ASSESSMENTS).map(([code,label])=>`<option value="${code}" ${e.assessment===code?'selected':''}>${label}</option>`).join('')}</select><span class="assessment-hint">تصنيف اختياري؛ لا يُنشئ معاينة أو توصية تلقائيًا.</span></div>`}

function counts(){let f=0,r=0;for(const e of Object.values(state.entries)){f+=(e.findings||[]).length;r+=(e.recommendations||[]).length}return {f,r}}
function updateProgress(){const {f,r}=counts();const assessed=Object.values(state.entries).filter(e=>assessmentLabel(e.assessment)).length;$('report-progress').textContent=`${f} معاينة — ${r} توصية — ${assessed} عنصرًا مقيّمًا`;}
function showToast(message){const n=$('toast');n.textContent=message;n.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>n.classList.remove('show'),3200)}
function renderNav(){const shell=$('section-nav');shell.innerHTML=catalog.sections.filter(s=>s.id!=='I').map(s=>`<div><button type="button" class="section-btn ${currentView===s.id?'selected':''}" data-chapter="${s.id}"><span><span class="section-index">${s.id}</span> ${safe(s.label)}</span><span>${s.domains.length?'⌄':'›'}</span></button>${currentView===s.id&&s.domains.length?`<div>${s.domains.map(d=>`<button type="button" class="domain-btn ${currentDomain===d.id?'selected':''}" data-domain="${safe(d.id)}"><span>${d.number?`${d.number}. `:''}${safe(d.label)}</span></button>`).join('')}</div>`:''}</div>`).join('');document.querySelector('[data-view="meta"]').classList.toggle('selected',currentView==='meta')}
function render(){if(!valid())return;
 const storageLabel=$('report-storage-label');
 if(storageLabel)storageLabel.textContent=isSharedReport()?'مهمة سحابية — محفوظة في Supabase':'تقرير محلي غير متزامن (وضع قديم)';
 renderNav();updateProgress();const root=$('workspace');root.innerHTML=(isSharedReport()?sharedMissionBanner():'')+(currentView==='meta'?renderMeta():renderChapter());}
function renderMeta(){return `<h2 class="page-title">إعداد بيانات مهمة التفتيش</h2><p class="page-sub">املأ بيانات الغلاف والمقدمة والمؤسسة، ثم انتقل إلى الأبواب الرسمية لإضافة المعاينات والتوصيات. ${isSharedReport()?'مدخلات المهمة المشتركة تُحفظ لدى Supabase وتُعرض لجميع أعضائها.':'تظل بيانات التقرير الفردي في ذاكرة التبويب ويمكن اختيار مؤسسة من السجل المركزي أو سجل المؤسسات المحلي.'}</p><div class="scope-warning">${isSharedReport()?'محرر مهمة مشتركة: أعضاء المهمة المعتمدون متساوون، وتُحفظ المساهمات بأسماء أصحابها. بيانات المؤسسة مثبتة عند إنشاء المهمة.':'للتقرير الفردي: إدراج أسماء مفتشين آخرين على الغلاف لا يُنشئ مهمة مشتركة ولا يمنحهم حق التحرير.'}</div>${state.legacyAssessments.length?`<div class="scope-warning">استُعيد ${state.legacyAssessments.length} تقييم سابق لمؤشر مركّب. حُفظت الحالات الأصلية في JSON للمراجعة، ولم تُنقل تلقائيًا إلى عناصر التقييم المفصّلة.</div>`:''}${FIELDSETS.map(g=>`<section class="card"><h2>${g.label}</h2>${g.id==='institution'&&!isSharedReport()?renderInstitutionBook():''}<div class="field-grid">${g.fields.map(([id,label,type])=>`<div class="field ${type==='textarea'?'wide':''} ${isSharedReport()&&g.id==='summary'?'shared-summary-field':''}" ${isSharedReport()&&g.id==='summary'?`data-save-state="${sharedSummaryStatus[id]||''}"`:''}><label for="${g.id}-${id}">${label}</label>${type==='textarea'?`<textarea id="${g.id}-${id}" data-group="${g.id}" data-field="${id}" rows="3" placeholder="${safe(label)}" ${isSharedReport()&&!(['mission','summary'].includes(g.id)&&!['purpose','visitDates'].includes(id))?'readonly':''}>${safe(state[g.id][id]||'')}</textarea>${isSharedReport()&&g.id==='summary'? `<div class="shared-summary-controls"><span data-summary-status="${id}" class="shared-summary-status" role="status" aria-live="polite">${sharedSummaryText(id)}</span><button type="button" class="btn subtle shared-summary-save" data-save-shared-summary="${id}">حفظ التعديل</button></div>`:''}`:`<input type="text" id="${g.id}-${id}" data-group="${g.id}" data-field="${id}" value="${safe(state[g.id][id]||'')}" placeholder="${safe(label)}" ${isSharedReport()&&!(['mission','summary'].includes(g.id)&&!['purpose','visitDates'].includes(id))?'readonly':''} />`}</div>`).join('')}</div>${g.id==='institution'?`<div class="map-help"><span>ألصق رابط المشاركة من خرائط Google. لا يُفتح الرابط إلا عند ضغطك على الزر.</span><button type="button" class="add-button" data-open-map="true">فتح موقع المؤسسة على Google Maps</button></div>`:''}</section>`).join('')}<section class="card"><h2>المفتشون المشاركون في إعداد التقرير</h2><p class="helper">${isSharedReport()?'أسماء المشاركين المقبولين مستخرجة من عضوية المهمة المشتركة ولا تُعدّل هنا.':'يُدرج المفتش صاحب الحساب تلقائيًا ويمكن إضافة مفتشين للغلاف دون منح صلاحية تحرير مشترك.'}</p><div id="inspector-rows">${isSharedReport()?state.inspectors.map(p=>`<div class="team-row"><strong>${safe(p.name)}</strong><span>${safe(inspectorTitle(p.role))} — ${safe(p.district)}</span></div>`).join(''):state.inspectors.map((p,i)=>`<div class="team-row"><div class="field"><label>الاسم واللقب</label><input value="${safe(p.name)}" data-inspector="${i}" data-prop="name" placeholder="الاسم واللقب" /></div><div class="field"><label>الصفة</label><select data-inspector="${i}" data-prop="role">${[['IFEP','مفتش التكوين والتعليم المهنيين (IFEP)'],['ITP','مفتش تقني وبيداغوجي (ITP)'],['IAF','مفتش إداري ومالي (IAF)']].map(([v,l])=>`<option ${p.role===v?'selected':''} value="${v}">${l}</option>`).join('')}</select></div><div class="field"><label>المقاطعة</label><input data-inspector="${i}" data-prop="district" value="${safe(p.district)}" placeholder="المقاطعة" /></div><button type="button" class="remove-button" data-remove-inspector="${i}" ${state.inspectors.length===1?'disabled title="يلزم وجود مفتش واحد على الأقل"':''}>حذف</button></div>`).join('')}</div>${isSharedReport()?'':renderReportColleaguePicker()+'<button class="add-button" type="button" id="add-inspector">+ إضافة مفتش يدويًا</button>'}</section>`}
function renderChapter(){const s=sectionOf(currentView);if(!s)return '';if(s.id==='I')return renderMeta();if(!s.domains.length){return `<div class="domain-head"><span class="crumb">الباب ${s.id}</span><h2>${safe(s.label)}</h2></div><div class="card"><div class="chapter-empty">${s.id==='X'?'يُحرر التقدير العام في صفحة «بيانات المهمة والمؤسسة»، مع إمكانية إضافة معاينات عامة أدناه.':'تُجمع التوصيات المعتمدة تلقائيًا من المجالات، ويمكن إضافة توصيات عامة في صفحة البيانات.'}</div>${renderEntryEditor(s.id,'هذا الباب')}</div>`}
 const d=s.domains.find(x=>x.id===currentDomain)||s.domains[0];currentDomain=d.id;const items=[{id:d.id,label:'المجال كاملًا (معاينة أو توصية عامة)'},...d.indicators];return `<div class="domain-head"><div class="crumb">${s.id} — ${safe(s.label)}</div><h2>${d.number?`${d.number}. `:''}${safe(d.label)}</h2><p>${d.indicators.length} عناصر فحص أو تقييم واردة في الفهرس الأولي</p></div><div class="scope-warning">المعاينات والتوصيات التي تكتبها تخص العنصر المعروض. تحتفظ الصادرات بالمعرّفات الثابتة للفهرس. يمكن تحديد حالة المجال أو المؤشر اختياريا دون تغيير النص الرسمي أو توليد معاينات تلقائية.</div>${items.map((i,n)=>`<article class="indicator-card"><div class="indicator-header"><span class="indicator-heading">${n===0?'المجال كاملًا':safe(i.label)}</span><span class="pill">${n===0?'مجال':`مؤشر ${n}`}</span></div>${renderAssessmentControl(i.id)}${renderEntryEditor(i.id,n===0?'المجال':'المؤشر')}</article>`).join('')}`}
function renderEntryEditor(id,label){if(isSharedReport())return window.Report03CloudUI?.renderSharedEntry?.(id)||'<p>تعذر تحميل محرر المهمة المشتركة.</p>';const e=getEntry(id);return `<div class="entry-area">${[['findings','المعاينات','المعاينة'],['recommendations','التوصيات','التوصية']].map(([kind,title,placeholder])=>`<div class="entry-box"><h3>${title} <span class="pill count">${(e[kind]||[]).length}</span></h3>${(e[kind]||[]).length?`<ul class="item-list">${e[kind].map(v=>`<li>${safe(v.text)}<button type="button" class="remove-entry" data-remove="${id}" data-kind="${kind}" data-entry="${v.id}" title="حذف">×</button></li>`).join('')}</ul>`:'<p class="empty">لا يوجد إدخال بعد</p>'}<textarea data-input-target="${id}" data-input-kind="${kind}" placeholder="اكتب ${placeholder}؛ سيُضم النص عند التصدير حتى دون الضغط على زر الإضافة">${safe(pendingDrafts[id]?.[kind]||'')}</textarea><button type="button" class="add-button" data-add="${id}" data-kind="${kind}">+ إضافة ${placeholder}</button></div>`).join('')}</div>`}
function commitPendingEntries(){let committed=0;for(const [id,kinds] of Object.entries(pendingDrafts)){if(id!=='X'&&id!=='XI'&&!target(id))continue;for(const kind of ['findings','recommendations']){const content=text(kinds[kind]);if(!content)continue;if(!state.entries[id])state.entries[id]={assessment:null,findings:[],recommendations:[]};state.entries[id][kind].push({id:makeId(),text:content.slice(0,30000)});committed++}}pendingDrafts=Object.create(null);if(committed){changed=true;updateProgress()}return committed}
function bindHandlers(){document.addEventListener('input',e=>{let n=e.target;if(n.dataset.inputTarget&&['findings','recommendations'].includes(n.dataset.inputKind)){const id=n.dataset.inputTarget;if(!pendingDrafts[id])pendingDrafts[id]={};pendingDrafts[id][n.dataset.inputKind]=n.value;changed=true}else if(n.dataset.group&&n.dataset.field){state[n.dataset.group][n.dataset.field]=n.value;changed=true;
 if(isSharedReport()&&n.dataset.group==='summary')setSharedSummaryStatus(n.dataset.field,'editing',n.value);
 }else if(n.dataset.inspector&&n.dataset.prop){{const inspector=state.inspectors[Number(n.dataset.inspector)];
 if(inspector&&inspector[n.dataset.prop]!==n.value){
  inspector[n.dataset.prop]=n.value;
  delete inspector.profileId;mayPrefillAccountInspector=false;changed=true;
 }}}});document.addEventListener('change',e=>{let n=e.target;if(n.dataset.storedInstitution!==undefined){chooseInstitution(n.value);return}if(n.dataset.inspector&&n.dataset.prop){{const inspector=state.inspectors[Number(n.dataset.inspector)];
 if(inspector&&inspector[n.dataset.prop]!==n.value){
  inspector[n.dataset.prop]=n.value;
  delete inspector.profileId;mayPrefillAccountInspector=false;changed=true;
 }}}if(n.matches('select[data-assessment]')){if(isSharedReport())return;const id=n.dataset.assessment;if(!target(id))return;if(!state.entries[id])state.entries[id]={assessment:null,findings:[],recommendations:[]};state.entries[id].assessment=assessmentLabel(n.value)?n.value:null;n.closest('.assessment-control').dataset.value=n.value;changed=true;updateProgress()}});document.addEventListener('click',e=>{let b=e.target.closest('button');if(!b)return;if(b.dataset.draftContrast!==undefined){useStrongDraftHighlight=!useStrongDraftHighlight;document.body.classList.toggle('shared-draft-strong',useStrongDraftHighlight);b.setAttribute('aria-pressed',String(useStrongDraftHighlight));b.textContent=useStrongDraftHighlight?'تمييز المسودات: قوي — تغيير إلى هادئ':'تمييز المسودات: هادئ — تغيير إلى قوي';return}if(b.dataset.saveInstitution!==undefined){saveInstitution();return}if(b.dataset.deleteInstitution!==undefined){deleteInstitution();return}if(b.dataset.exportInstitutions!==undefined){exportInstitutions();return}if(b.dataset.importInstitutions!==undefined){$('institutions-file')?.click();return}if(b.dataset.view==='meta'){currentView='meta';render();scrollTop();return}if(b.dataset.openMap!==undefined){const url=googleMapsLink(state.institution.mapUrl);if(!url){showToast('ألصق أولًا رابطًا صحيحًا للموقع من خرائط Google');return}window.open(url,'_blank','noopener,noreferrer');return}if(b.dataset.chapter){currentView=b.dataset.chapter;currentDomain=sectionOf(currentView)?.domains[0]?.id??null;render();scrollTop();return}if(b.dataset.domain){currentView=target(b.dataset.domain).section.id;currentDomain=b.dataset.domain;render();scrollTop();return}if(b.id==='add-directory-inspector'){const selection=$('report-colleague-select');if(!selection?.value){showToast('اختر مفتشًا من الدليل أولًا');return}addDirectoryInspector(selection.value);return}if(b.id==='add-inspector'){mayPrefillAccountInspector=false;state.inspectors.push({id:makeId(),name:'',role:'IFEP',district:''});changed=true;render();return}if(b.dataset.removeInspector!==undefined){if(state.inspectors.length<=1)return;mayPrefillAccountInspector=false;state.inspectors.splice(Number(b.dataset.removeInspector),1);changed=true;render();return}if(b.dataset.add){if(isSharedReport())return;const id=b.dataset.add,kind=b.dataset.kind;const el=Array.from(document.querySelectorAll('[data-input-target]')).find(n=>n.dataset.inputTarget===id&&n.dataset.inputKind===kind);if(!el||!text(el.value)){showToast('اكتب النص أولًا');return}if(!state.entries[id])state.entries[id]={findings:[],recommendations:[]};state.entries[id][kind].push({id:makeId(),text:text(el.value)});if(pendingDrafts[id]){delete pendingDrafts[id][kind];if(!Object.keys(pendingDrafts[id]).length)delete pendingDrafts[id]}changed=true;render();showToast('أضيفت الفقرة');return}if(b.dataset.remove){if(isSharedReport())return;const {remove:id,kind,entry:entryId}=b.dataset;if(!confirm('حذف هذا الإدخال؟'))return;state.entries[id][kind]=state.entries[id][kind].filter(v=>v.id!==entryId);changed=true;render();return}});
 $('btn-export').addEventListener('click',async()=>{
  const button=$('btn-export');
  button.disabled=true;
  try{
   if(isSharedReport()){
    const payload=await window.Report03CloudUI?.prepareSharedExport?.();
    if(!payload||payload.missionId!==sharedReportMissionId)throw Error('تعذر التحقق من نسخة المهمة المشتركة.');
    if(window.Report03CloudBridge?.applySharedReportData?.(payload)!==true)
     throw Error('تعذر تطبيق أحدث نسخة محفوظة من المهمة المشتركة على محرر التقرير. حدّث المهمة وأعد المحاولة.');
    $('dialog-clear').hidden=true;
   }else{
    const n=commitPendingEntries();if(n)render();
    $('dialog-clear').hidden=false;
   }
   $('export-dialog').showModal();
  }catch(e){alert('لا يمكن إصدار التقرير قبل التحقق من الحفظ المشترك: '+e.message)}
  finally{button.disabled=false}
 });$('close-dialog').onclick=$('dialog-cancel').onclick=()=>$('export-dialog').close();$('do-json').onclick=exportJSON;$('do-docx').onclick=exportDOCX;$('do-pdf').onclick=exportPDF;$('btn-import').onclick=()=>{if(isSharedReport()){showToast('استيراد JSON متاح للتقرير الفردي فقط.');return}$('import-file').click()};$('import-file').addEventListener('change',importJSON);document.addEventListener('change',e=>{if(e.target.id==='institutions-file')importInstitutions(e)});$('btn-clear').onclick=$('dialog-clear').onclick=clearReport;$('menu-toggle').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');window.addEventListener('beforeunload',e=>{
 const pendingShared=isSharedReport()&&(pendingSharedSummaryFields().length>0||
  window.Report03CloudUI?.hasUnsentSharedDrafts?.());
 if(changed||pendingShared){e.preventDefault();e.returnValue=''}
});}
function scrollTop(){document.querySelector('.sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'instant'})}
function download(bytes,type,extension){const a=document.createElement('a');const blob=new Blob([bytes],{type});a.href=URL.createObjectURL(blob);const c=(state.institution.code||'report03').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,40);a.download=`inspection_03_${c}_${new Date().toISOString().slice(0,10)}.${extension}`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000)}
function exportSnapshot(){if(!isSharedReport())commitPendingEntries();const entries={};for(const [key,e] of Object.entries(state.entries)){if(!(e.findings.length||e.recommendations.length||assessmentLabel(e.assessment)))continue;entries[key]={assessment:assessmentLabel(e.assessment)?e.assessment:null,findings:e.findings.map(x=>({...x})),recommendations:e.recommendations.map(x=>({...x}))}}return {templateId:state.templateId,catalogVersion:catalog.catalogVersion,exportVersion:'1.0',status:'draft',issuedAt:new Date().toISOString(),mission:{...state.mission},institution:{...state.institution},director:{...state.director},summary:{...state.summary},inspectors:state.inspectors.map(x=>({...x})),legacyAssessments:state.legacyAssessments.map(x=>({...x})),entries,...(isSharedReport()?{collaboration:structuredClone(sharedProvenance)}:{})}}
function exportJSON(){const out=JSON.stringify(exportSnapshot(),null,2);download(out,'application/json;charset=utf-8','json');changed=false;showToast('تم تنزيل ملف JSON. يمكنك استيراده لاحقًا.')}
async function importJSON(ev){const file=ev.target.files?.[0];ev.target.value='';if(!file)return;try{if(file.size>5_000_000)throw Error('حجم الملف كبير جدًا');const x=JSON.parse(await file.text());if(x.templateId!=='OFFICIAL_REPORT_TEMPLATE_03'||typeof x.entries!=='object'||!x.entries||Array.isArray(x.entries))throw Error('هذا الملف ليس تقريرًا مدعومًا');const validIds=new Set([...[...catalog.sections.map(s=>s.id)],...allDomains().flatMap(d=>[d.id,...d.indicators.map(i=>i.id)])]);pendingDrafts=Object.create(null);const entries={};const legacyAssessments=Array.isArray(x.legacyAssessments)?x.legacyAssessments.slice(0,100).filter(v=>v&&typeof v==='object'&&assessmentLabel(v.assessment)).map(v=>({sourceId:String(v.sourceId||'').slice(0,100),label:String(v.label||'').slice(0,2000),assessment:v.assessment})):[];for(const [oldId,e] of Object.entries(x.entries)){const split=catalog.splitHistory?.find(rule=>rule.legacyId===oldId);const id=split?split.domainId:(oldId==='III-02-I006'?'III-02-I005':oldId);if(!validIds.has(id)||!e||typeof e!=='object')continue;if(!entries[id])entries[id]={assessment:null,findings:[],recommendations:[]};if(assessmentLabel(e.assessment)){if(split){legacyAssessments.push({sourceId:split.legacyId,label:split.legacyLabel,assessment:e.assessment})}else entries[id].assessment=e.assessment}for(const kind of ['findings','recommendations']){if(Array.isArray(e[kind]))entries[id][kind].push(...e[kind].slice(0,500).filter(v=>v&&typeof v.text==='string').map(v=>({id:makeId(),text:v.text.slice(0,30000)})))}}selectedInstitutionId='';selectedCloudInstitutionId='';window.Report03CloudUI?.resetSelection?.();mayPrefillAccountInspector=false;state={...emptyState(),mission:x.mission&&typeof x.mission==='object'?x.mission:{},institution:x.institution&&typeof x.institution==='object'?x.institution:{},director:x.director&&typeof x.director==='object'?x.director:{},summary:x.summary&&typeof x.summary==='object'?x.summary:{},inspectors:Array.isArray(x.inspectors)&&x.inspectors.length?x.inspectors.slice(0,30).map(v=>({id:makeId(),name:String(v.name||'').slice(0,200),role:['IFEP','ITP','IAF'].includes(v.role)?v.role:'IFEP',district:String(v.district||'').slice(0,100),...(typeof v.profileId==='string'&&/^[0-9a-fA-F-]{36}$/.test(v.profileId)?{profileId:v.profileId}:{})})):[{id:makeId(),name:'',role:'IFEP',district:''}],entries,legacyAssessments};currentView='meta';changed=true;render();showToast(legacyAssessments.length?'تم الاستيراد؛ تقييمات المؤشرات المركبة القديمة محفوظة للمراجعة في JSON ولم تُوزّع على عناصر جديدة':'تم استيراد بيانات التقرير إلى ذاكرة التبويب')}catch(err){alert('تعذّر الاستيراد: '+err.message)}}
function clearReport(){if(isSharedReport()){showToast('لا يمكن محو البيانات المركزية من محرر المهمة. ارجع إلى مهام التفتيش.');return}if(!confirm('سيتم محو جميع بيانات التقرير الحالية من ذاكرة هذا التبويب. هل تأكدت من تنزيل ملف JSON أو DOCX أو PDF قبل المتابعة؟'))return;state=emptyState();mayPrefillAccountInspector=true;prefillFromCurrentSession();selectedInstitutionId='';selectedCloudInstitutionId='';window.Report03CloudUI?.resetSelection?.();pendingDrafts=Object.create(null);changed=false;currentView='meta';currentDomain=null;$('print-root').replaceChildren();$('import-file').value='';$('export-dialog').close();render();showToast('تم محو بيانات التقرير من الواجهة')}
function entryHtml(id){const e=getEntry(id);if(!e.findings.length&&!e.recommendations.length&&!assessmentLabel(e.assessment))return '';return `<div class="print-note">${assessmentLabel(e.assessment)?`<div class="print-assessment">نتيجة الفحص أو التقييم: ${safe(assessmentLabel(e.assessment))}</div>`:''}${e.findings.length?`<span class="print-label">المعاينات:</span><ul>${e.findings.map(x=>`<li>${safe(x.text)}</li>`).join('')}</ul>`:''}${e.recommendations.length?`<span class="print-label">التوصيات:</span><ul>${e.recommendations.map(x=>`<li>${safe(x.text)}</li>`).join('')}</ul>`:''}</div>`}

/* Parallel print columns: findings and recommendations always align with their own criterion. */
function printColumn(id,kind){return (getEntry(id)[kind]||[]).map(v=>`<p class="print-cell-line">${safe(v.text)}${isSharedReport()&&v.authorName?`<small class="print-author"> — ${safe(v.authorName)}</small>`:''}</p>`).join('')}
function printCriterionStatus(id){const code=getEntry(id).assessment;const label=assessmentLabel(code);return label?`<div class="print-status print-status-${safe(code)}" aria-label="نتيجة التقييم: ${safe(label)}"><strong>حالة التقييم:</strong> ${safe(label)}</div>`:''}
function printDomainRows(d){const rows=[];const domainEntry=getEntry(d.id);
 const domainTitle=`${d.number?d.number+'. ':''}${safe(d.label)}`;
 if(domainEntry.findings.length||domainEntry.recommendations.length||assessmentLabel(domainEntry.assessment)||!d.indicators.length){
  rows.push(`<tr><td class="print-domain-cell"><strong>${domainTitle}</strong></td><td class="print-indicator-cell">معاينات أو توصيات عامة تخص المجال${printCriterionStatus(d.id)}</td><td>${printColumn(d.id,'findings')}</td><td>${printColumn(d.id,'recommendations')}</td></tr>`);
 }
 for(const indicator of d.indicators){
  rows.push(`<tr><td class="print-domain-cell">${domainTitle}</td><td class="print-indicator-cell">${safe(indicator.label)}${printCriterionStatus(indicator.id)}</td><td class="print-findings-cell">${printColumn(indicator.id,'findings')}</td><td class="print-recommendations-cell">${printColumn(indicator.id,'recommendations')}</td></tr>`);
 }
 return rows.join('');
}
function p(s){return safe(text(s)||'........................................')}
function inspectorTitle(role){return ({IFEP:'مفتش التكوين والتعليم المهنيين (IFEP)',ITP:'مفتش تقني وبيداغوجي للتكوين والتعليم المهنيين (ITP)',IAF:'مفتش إداري ومالي (IAF)'})[role]||role}

/* M1.7: QR carries report metadata verbatim, entirely offline. It is not a digital signature. */
function reportQrPayload(){
 const m=state.mission||{},i=state.institution||{},staff=Array.isArray(state.inspectors)?state.inspectors:[];
 const value=v=>text(v)||'غير مدخل';
 return ['تقرير التفتيش المعمق — النموذج 03',
   'هدف مهمة التفتيش: '+value(m.purpose),
   'المؤسسة المعنية: '+value(i.name),
   'تاريخ/تواريخ التفتيش: '+value(m.visitDates),
   'المفتشون المعنيون:'].concat(staff.length?staff.map((x,k)=>
       (k+1)+'. '+value(x.name)+' — '+inspectorTitle(x.role)):['غير مدخل']).join('\n');
}
function signatureHeading(){return state.inspectors.length>1?'إمضاء السادة المفتشين':'إمضاء السيد المفتش'}
function reportQrMatrix(){
 if(typeof qrcodegen==='undefined'||!qrcodegen.QrCode)throw Error('تعذّر تحميل مكتبة رمز QR المحلية؛ أعد تحديث الصفحة.');
 try{const utf8=Array.from(new TextEncoder().encode(reportQrPayload()));return qrcodegen.QrCode.encodeSegments([qrcodegen.QrSegment.makeEci(26),qrcodegen.QrSegment.makeBytes(utf8)],qrcodegen.QrCode.Ecc.LOW)}
 catch(e){if(e instanceof RangeError)throw Error('المعلومات المطلوبة تتجاوز سعة رمز QR الواحد؛ لن تُختصر بيانات التقرير.');throw e}
}
/* A non-essential QR must never prevent exporting the official report. */
function reportQrForExport(includePng=false){
 try{const matrix=reportQrMatrix();const png=includePng?qrPng(matrix):null;return {matrix,png,warning:''}}
 catch(error){
  const detail=String(error&&error.message||'تعذر توليد الرمز').slice(0,500);
  return {matrix:null,png:null,warning:'تعذر إدراج رمز QR: '+detail+' يمكن إصدار التقرير كاملًا دون الرمز.'};
 }
}
function reportQrSvg(qr){
 const quiet=4,size=qr.size+quiet*2,draw=[];
 for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))
  draw.push('M'+(x+quiet)+' '+(y+quiet)+'h1v1h-1z');
 return '<svg xmlns="http://www.w3.org/2000/svg" class="report-qr-svg" role="img" aria-label="رمز QR لبيانات التقرير" viewBox="0 0 '+size+' '+size+'" shape-rendering="crispEdges"><rect width="'+size+'" height="'+size+'" fill="#fff"/><path fill="#000" d="'+draw.join(' ')+'"/></svg>';
}
function printSignatures(){
 const qr=reportQrForExport();
 const heading=signatureHeading(),people=state.inspectors.map(x=>
 '<div class="signatory"><div class="signatory-name">'+safe(text(x.name)||'اسم المفتش غير مدخل')+
 '</div><div class="signatory-role">'+safe(inspectorTitle(x.role))+
 '</div><div class="signatory-ink">مساحة الإمضاء</div></div>').join('');
 return '<section class="print-section print-closing print-signatures"><h2>'+heading+
 '</h2><div class="signatories">'+people+'</div><div class="report-qr-block">'+
 (qr.matrix?reportQrSvg(qr.matrix):'<p class="qr-warning" role="note">'+safe(qr.warning)+'</p>')+
 (qr.matrix?'<p>رمز QR يتضمن بيانات التعريف بالتقرير والمهمة والمفتشين.</p>':'')+'</div></section>';
}
/* Lossless black-and-white PNG for editable Word, no network or canvas dependency. */
function bytesConcat(parts){const b=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let k=0;for(const p of parts){b.set(p,k);k+=p.length}return b}
function pngU32(bytes,pos,num){bytes[pos]=(num>>>24)&255;bytes[pos+1]=(num>>>16)&255;bytes[pos+2]=(num>>>8)&255;bytes[pos+3]=num&255}
function pngChunk(type,data){
 const label=new TextEncoder().encode(type),body=bytesConcat([label,data]),out=new Uint8Array(12+data.length);
 pngU32(out,0,data.length);out.set(body,4);pngU32(out,8+data.length,crc32(body));return out;
}
function qrPng(qr){
 const quiet=4,scale=Math.max(4,Math.floor(950/(qr.size+quiet*2))),dim=(qr.size+quiet*2)*scale;
 const stride=1+Math.ceil(dim/8),raw=new Uint8Array(stride*dim);
 for(let y=0;y<dim;y++){
  const qy=Math.floor(y/scale)-quiet,offset=y*stride+1;
  for(let x=0;x<dim;x++){
   const qx=Math.floor(x/scale)-quiet;
   if(qx<0||qy<0||qx>=qr.size||qy>=qr.size||!qr.getModule(qx,qy))
    raw[offset+(x>>>3)]|=128>>>(x&7);
  }
 }
 const chunks=Math.ceil(raw.length/65535),z=new Uint8Array(2+raw.length+chunks*5+4);
 z[0]=0x78;z[1]=0x01;let source=0,target=2,a=1,b=0;
 while(source<raw.length){
  const length=Math.min(65535,raw.length-source),last=source+length===raw.length;
  z[target++]=last?1:0;z[target++]=length&255;z[target++]=length>>>8;
  z[target++]=(~length)&255;z[target++]=((~length)>>>8)&255;
  z.set(raw.subarray(source,source+length),target);target+=length;
  for(let p=source;p<source+length;p++){a=(a+raw[p])%65521;b=(b+a)%65521}
  source+=length;
 }
 pngU32(z,target,((b<<16)|a)>>>0);
 const ihdr=new Uint8Array(13);pngU32(ihdr,0,dim);pngU32(ihdr,4,dim);ihdr[8]=1;ihdr[9]=0;
 return bytesConcat([Uint8Array.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',z),pngChunk('IEND',new Uint8Array(0))]);
}
function docxQrDrawing(){
 const e=2520000; // 70 mm square, 1 mm = 36000 EMU
 return '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>'+
 '<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">'+
 '<wp:extent cx="'+e+'" cy="'+e+'"/><wp:docPr id="1" name="QR Code report metadata" descr="رمز QR يتضمن بيانات التقرير والمفتشين"/>'+
 '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'+
 '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="report-qr.png"/><pic:cNvPicPr/></pic:nvPicPr>'+
 '<pic:blipFill><a:blip r:embed="rIdQr"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'+
 '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+e+'" cy="'+e+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'+
 '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}
function docxSignatures(includeQr,qrWarning=''){
 let body=pageBreak()+para(signatureHeading(),{center:true,heading:true});
 for(const inspector of state.inspectors){
  body+=para('الاسم واللقب: '+(text(inspector.name)||'غير مدخل'),{bold:true});
  body+=para('الصفة: '+inspectorTitle(inspector.role));
  body+=para('الإمضاء: ..................................................................');
 }
 if(includeQr)body+=docxQrDrawing()+para('رمز QR يتضمن بيانات التعريف بالتقرير والمهمة والمفتشين.',{center:true});
 else body+=para(qrWarning||'رمز QR غير متاح لهذه النسخة من التقرير.',{center:true});
 return body;
}

function buildPrint(){const m=state.mission,i=state.institution,d=state.director;const team=state.inspectors.map(x=>`<div>السيد/ ${p(x.name)} — ${safe(inspectorTitle(x.role))} ${x.district?`— المقاطعة ${safe(x.district)}`:''}</div>`).join('');let html=`<section class="print-first"><div class="oval">النموذج 03</div><div class="title-box">تقرير التفتيش المعمق<br><small>(Inspection approfondie)</small></div></section><section class="print-cover"><div><strong>الجمهورية الجزائرية الديمقراطية الشعبية</strong><br><strong>وزارة التكوين والتعليم المهنيين</strong><br><strong>المفتشية العامة</strong></div><h2>تقرير التفتيش المعمق</h2><div class="cover-state">المؤسسة / ${p(i.name)}<br>الولاية / ${p(i.wilaya)}</div><div class="cover-team"><u>التقرير من إعداد /</u>${team}</div><div class="cover-date">${p(m.monthYear)}</div></section><section class="print-section print-intro"><div class="print-draft">نسخة عمل تجريبية — لم تُعتمد مهنيًا داخل المنصة — الفهرس قيد المطابقة المرجعية</div><h2>مقدمة:</h2><ul><li>الهدف (الغرض) من إنجاز المهمة: ${p(m.purpose)}</li><li>فترة إنجاز المهمة (ثلاث سنوات) مع ذكر صاحب المهمة (ن – 3): ${p(m.period)}</li><li>الاطلاع على تقارير التفتيش: ${p(m.previousReports)}</li></ul>${m.visitDates?`<div class="print-meta">تواريخ إجراء التفتيش: ${safe(m.visitDates)}</div>`:''}<h2>I. التعريف بالمؤسسة /</h2><h3>معلومات بيانية تتعلق بالمؤسسة:</h3>${[['التسمية',i.name,'الولاية',i.wilaya,'الرمز',i.code],['مرسوم الإنشاء',i.decree,'المؤرخ في',i.decreeDate],['تاريخ بداية النشاط',i.startDate],['العنوان',i.address],['الهاتف',i.phone,'الفاكس',i.fax],['البريد الإلكتروني',i.email,'الموقع الإلكتروني',i.website],['اختصاص المؤسسة',i.speciality],['البعد عن مقر الولاية',i.distance]].map(cells=>`<div class="print-meta-row">${Array.from({length:Math.ceil(cells.length/2)},(_,index)=>`<span class="print-meta-part">${cells[index*2]}: ${p(cells[index*2+1])}</span>`).join('')}</div>`).join('')}<h3>معلومات بيانية تتعلق برئيس المؤسسة:</h3>${[['الاسم واللقب',d.fullName,'الوظيفة',d.job],['الرتبة',d.rank],['تاريخ التنصيب بالمؤسسة',d.installedAt,'تاريخ أول تعيين كمدير',d.firstAppointedAt]].map(cells=>`<div class="print-meta-row">${Array.from({length:Math.ceil(cells.length/2)},(_,index)=>`<span class="print-meta-part">${cells[index*2]}: ${p(cells[index*2+1])}</span>`).join('')}</div>`).join('')}${i.mapUrl?`<div class="print-meta">الموقع الجغرافي للمؤسسة (خرائط Google): ${safe(i.mapUrl)}</div>`:''}</section>`;

 for(const section of catalog.sections.filter(s=>!['I','X','XI'].includes(s.id))){
   html+=`<section class="print-section print-table-section"><h2>${section.id}. ${safe(section.label)} /</h2>
<table class="report-four-column-table"><colgroup><col style="width:20%"><col style="width:27%"><col style="width:26.5%"><col style="width:26.5%"></colgroup>
<thead><tr><th>تعيين المجال</th><th>عناصر الفحص والرقابة</th><th>المعاينات</th><th>التوصيات</th></tr></thead>
<tbody>${section.domains.map(printDomainRows).join('')}</tbody></table>${entryHtml(section.id)}</section>`;
 }

 html+=`<section class="print-section print-closing"><h2>X. التقدير العام /</h2><p class="print-para">${safe(state.summary.generalAssessment||'')}</p>${entryHtml('X')}</section><section class="print-section print-closing"><h2>XI. التوصيات /</h2>${collectRecommendations().map(x=>`<div class="print-rec">• ${safe(x)}</div>`).join('')}${entryHtml('XI')}<p class="print-footer">تقرير التفتيش المعمق — النموذج 03 — نسخة تجريبية</p></section>`;html+=printSignatures();$('print-root').innerHTML=html}
function collectRecommendations(){const out=[];for(const s of catalog.sections){if(s.id==='XI')continue;const ids=[s.id,...s.domains.flatMap(d=>[d.id,...d.indicators.map(x=>x.id)])];for(const id of ids)for(const x of getEntry(id).recommendations)out.push(x.text)}for(const line of String(state.summary.generalRecommendations||'').split('\n').map(s=>s.trim()).filter(Boolean))out.push(line);return [...new Set(out)]}
function exportPDF(){commitPendingEntries();buildPrint();$('export-dialog').close();showToast('للتصدير PDF: الصفحات التمهيدية والخاتمة عمودية، والجداول أفقية. احتفظ بتنسيق الصفحة المحدد في الموقع، وألغِ «الرؤوس والتذييلات» إذا ظهرت.');setTimeout(()=>window.print(),100)}
/* Dependency-free, editable DOCX generation. ZIP entries use STORE; no server is involved. */
function xml(v){return String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]))}
function rXml(v,bold=false){const str=String(v??'');return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/><w:rtl w:val="1"/>${bold?'<w:b/><w:bCs/>':''}</w:rPr>${str.split(/\r?\n/).map((line,n)=>`${n?'<w:br/>':''}<w:t xml:space="preserve">${xml(line)}</w:t>`).join('')}</w:r>`}
function para(v,opts={}){const val=String(v??'');const heading=!!opts.heading;return `<w:p><w:pPr><w:bidi w:val="1"/><w:jc w:val="${opts.center?'center':'right'}"/><w:spacing w:before="${heading?180:0}" w:after="${heading?110:70}"/><w:keepNext w:val="${heading?'1':'0'}"/></w:pPr>${rXml(val,heading||!!opts.bold)}</w:p>`}
function pageBreak(){return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'}
function cell(content,width,bg=''){return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tcBorders>${bg?`<w:shd w:fill="EAEAEA"/>`:''}</w:tcPr>${content||para('')}</w:tc>`}
function table(rows){const widths=[2600,4100,4200,4200];const full=widths.reduce((a,b)=>a+b,0);return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${full}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.map((cells,index)=>`<w:tr><w:trPr>${index===0?'<w:tblHeader w:val="1"/>':''}</w:trPr>${cells.map((value,j)=>cell(value,widths[j],index===0)).join('')}</w:tr>`).join('')}</w:tbl>`}
function docxSectionBreak(orientation){const landscape=orientation==='landscape';return `<w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${landscape?'16838':'11906'}" w:h="${landscape?'11906':'16838'}" w:orient="${orientation}"/><w:pgMar w:top="720" w:right="850" w:bottom="720" w:left="850"/></w:sectPr></w:pPr></w:p>`}
function docxNoteColumn(id,kind){return (getEntry(id)[kind]||[]).map(x=>para(x.text+(isSharedReport()&&x.authorName?' — '+x.authorName:''))).join('')||para('')}
function docxCriterion(id,label){const status=assessmentLabel(getEntry(id).assessment);return para(label)+(status?para('حالة التقييم: '+status,{bold:true}):'')}
function docxDomainRows(domain){const rows=[];const domainLabel=(domain.number?domain.number+'. ':'')+domain.label;const e=getEntry(domain.id);
 if(e.findings.length||e.recommendations.length||assessmentLabel(e.assessment)||!domain.indicators.length)rows.push([para(domainLabel,{bold:true}),docxCriterion(domain.id,'معاينات أو توصيات عامة تخص المجال'),docxNoteColumn(domain.id,'findings'),docxNoteColumn(domain.id,'recommendations')]);
 for(const indicator of domain.indicators)rows.push([para(domainLabel),docxCriterion(indicator.id,indicator.label),docxNoteColumn(indicator.id,'findings'),docxNoteColumn(indicator.id,'recommendations')]);
 return rows;
}
function getEntryParagraphs(id){const e=getEntry(id);return [...(assessmentLabel(e.assessment)?[para(`نتيجة الفحص أو التقييم: ${assessmentLabel(e.assessment)}`)]:[]),...e.findings.map(x=>para(`معاينة: ${x.text}`)),...e.recommendations.map(x=>para(`توصية: ${x.text}`))].join('')}
function documentXML(includeQr=false,qrWarning=''){const m=state.mission,i=state.institution,d=state.director;let b='';b+=para('النموذج 03',{center:true,heading:true})+para('تقرير التفتيش المعمق',{center:true,heading:true})+para('(Inspection approfondie)',{center:true})+pageBreak();b+=para('الجمهورية الجزائرية الديمقراطية الشعبية',{center:true,bold:true})+para('وزارة التكوين والتعليم المهنيين',{center:true,bold:true})+para('المفتشية العامة',{center:true,bold:true})+para('تقرير التفتيش المعمق',{center:true,heading:true});b+=para('المؤسسة / '+(i.name||''))+para('الولاية / '+(i.wilaya||''))+para('التقرير من إعداد /',{heading:true});for(const x of state.inspectors)b+=para(`السيد / ${x.name||'................'} — ${inspectorTitle(x.role)}${x.district?' — المقاطعة '+x.district:''}`);b+=para(m.monthYear||'الشهر / السنة',{center:true})+pageBreak();b+=para('نسخة عمل تجريبية — لم تُعتمد مهنيًا داخل المنصة',{bold:true});b+=para('مقدمة:',{heading:true});b+=para('الهدف (الغرض) من إنجاز المهمة: '+(m.purpose||''))+para('فترة إنجاز المهمة (ثلاث سنوات) مع ذكر صاحب المهمة (ن – 3): '+(m.period||''))+para('الاطلاع على تقارير التفتيش: '+(m.previousReports||''));if(m.visitDates)b+=para('تواريخ إجراء المهمة: '+m.visitDates);b+=para('I. التعريف بالمؤسسة /',{heading:true});b+=para('معلومات بيانية تتعلق بالمؤسسة:',{heading:true});for(const [k,v] of [['التسمية',i.name],['الولاية',i.wilaya],['الرمز',i.code],['مرسوم إنشاء',i.decree],['المؤرخ في',i.decreeDate],['تاريخ بداية النشاط',i.startDate],['العنوان',i.address],['الهاتف',i.phone],['الفاكس',i.fax],['البريد الإلكتروني',i.email],['الموقع الإلكتروني',i.website],['اختصاص المؤسسة',i.speciality],['البعد عن مقر الولاية',i.distance],...(i.mapUrl?[['الموقع الجغرافي (خرائط Google)',i.mapUrl]]:[])])b+=para(`${k}: ${v||'...................'}`);b+=para('معلومات بيانية تتعلق برئيس المؤسسة:',{heading:true});for(const [k,v] of [['الاسم واللقب',d.fullName],['الوظيفة',d.job],['الرتبة',d.rank],['تاريخ التنصيب بالمؤسسة',d.installedAt],['تاريخ أول تعيين كمدير',d.firstAppointedAt]])b+=para(`${k}: ${v||'...................'}`);b+=docxSectionBreak('portrait');for(const sec of catalog.sections.filter(s=>!['I','X','XI'].includes(s.id))){b+=para(sec.id+'. '+sec.label+' /',{heading:true});const rows=[[para('تعيين المجال',{bold:true}),para('عناصر الفحص والرقابة',{bold:true}),para('المعاينات',{bold:true}),para('التوصيات',{bold:true})]];for(const domain of sec.domains)rows.push(...docxDomainRows(domain));b+=table(rows);b+=getEntryParagraphs(sec.id)}b+=docxSectionBreak('landscape');b+=para('X. التقدير العام /',{heading:true})+para(state.summary.generalAssessment||'')+getEntryParagraphs('X');b+=para('XI. التوصيات /',{heading:true});for(const rec of collectRecommendations())b+=para('– '+rec);b+=getEntryParagraphs('XI');b+=docxSignatures(includeQr,qrWarning);return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${b}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="950" w:right="900" w:bottom="950" w:left="900" w:header="400" w:footer="400"/></w:sectPr></w:body></w:document>`}
function crc32(arr){let crc=-1;for(const v of arr){crc^=v;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0)}return (crc^-1)>>>0}
function zipFiles(files){const enc=new TextEncoder(),parts=[],centers=[];let offset=0;const le=(view,pos,x,n)=>{for(let i=0;i<n;i++)view[pos+i]=(x>>>8*i)&255};for(const [name,val] of Object.entries(files)){const nb=enc.encode(name),dat=val instanceof Uint8Array?val:enc.encode(val),crc=crc32(dat),head=new Uint8Array(30+nb.length);le(head,0,0x04034b50,4);le(head,4,20,2);le(head,6,0,2);le(head,8,0,2);le(head,10,0,2);le(head,12,0,2);le(head,14,crc,4);le(head,18,dat.length,4);le(head,22,dat.length,4);le(head,26,nb.length,2);head.set(nb,30);parts.push(head,dat);const cd=new Uint8Array(46+nb.length);le(cd,0,0x02014b50,4);le(cd,4,20,2);le(cd,6,20,2);le(cd,8,0,2);le(cd,10,0,2);le(cd,12,0,2);le(cd,14,0,2);le(cd,16,crc,4);le(cd,20,dat.length,4);le(cd,24,dat.length,4);le(cd,28,nb.length,2);le(cd,42,offset,4);cd.set(nb,46);centers.push(cd);offset+=head.length+dat.length}const centralSize=centers.reduce((a,b)=>a+b.length,0);const end=new Uint8Array(22);le(end,0,0x06054b50,4);le(end,8,centers.length,2);le(end,10,centers.length,2);le(end,12,centralSize,4);le(end,16,offset,4);parts.push(...centers,end);const all=new Uint8Array(parts.reduce((a,b)=>a+b.length,0));let cursor=0;for(const p of parts){all.set(p,cursor);cursor+=p.length}return all}
function exportDOCX(){commitPendingEntries();const qr=reportQrForExport(true),qrPngData=qr.png;const files={'[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>','_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>','word/document.xml':documentXML(Boolean(qrPngData),qr.warning),'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdQr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/report-qr.png"/></Relationships>','word/media/report-qr.png':qrPngData,'word/styles.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/><w:sz w:val="23"/><w:szCs w:val="25"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:bidi/></w:pPr></w:style></w:styles>','docProps/core.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>تقرير التفتيش المعمق — النموذج 03</dc:title><dc:creator>Official Report 03 — Browser</dc:creator></cp:coreProperties>','docProps/app.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Official Report 03</Application></Properties>'};if(!qrPngData){delete files['word/_rels/document.xml.rels'];delete files['word/media/report-qr.png']}
 const bytes=zipFiles(files);download(bytes,'application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx');
 showToast(qr.warning?'تم تنزيل DOCX دون رمز QR: سعة الرمز غير كافية، لكن جميع بيانات التقرير محفوظة.':'تم تنزيل DOCX قابل للتحرير (نسخة تجريبية)')}
/* Strict cross-module boundary: cloud code sees institution/director metadata only.
 * Inspection mission, collaborators, findings and recommendations are never exposed.
 */
window.Report03CloudBridge={
 setSharedFieldStatus(group,key,status,value){
  if(group!=='summary')return false;
  return setSharedSummaryStatus(key,status,value);
 },
 pendingSharedSummaryFields(){return pendingSharedSummaryFields();},
 focusSharedSummaryField(key){return focusSharedSummary(key);},
 updateSharedDraftStatus(){
  if(!isSharedReport())return;
  const list=window.Report03CloudUI?.pendingSharedDrafts?.()||[];
  const alert=document.getElementById('shared-draft-review');
  if(alert){alert.classList.toggle('has-unsent',list.length>0);alert.innerHTML=sharedDraftReview();}
  for(const textarea of document.querySelectorAll('[data-shared-body]')){
   const pending=Boolean(textarea.value.trim());
   textarea.closest('.shared-editor-card')?.classList.toggle('unsaved-draft',pending);
  }
 },
 focusSharedDraft(id){
  if(!isSharedReport())return false;
  const info=target(id);
  if(!info&&id!=='X'&&id!=='XI')return false;
  currentView=info?.section.id||id;
  currentDomain=info?.domain.id||null;
  render();
  const area=[...document.querySelectorAll('[data-shared-body]')].find(node=>node.dataset.sharedBody===id);
  if(!area)return false;
  const wrapper=area.closest('.shared-editor-card');
  if(wrapper)wrapper.open=true;
  area.scrollIntoView?.({behavior:'smooth',block:'center'});
  area.focus?.({preventScroll:true});
  return true;
 },
 canOpenSharedMission(id){
  if(isSharedReport())return sharedReportMissionId===id||this.exitSharedMission();
  if(sharedReportHasInputs()&&
     !confirm('توجد بيانات في التقرير الفردي المفتوح. سنحتفظ بها في ذاكرة التبويب وننتقل إلى المهمة المشتركة. احفظ نسخة JSON احتياطية إن كانت مهمة. هل تتابع؟'))return false;
  return true;
 },
 enterSharedMission(payload){
  if(!payload?.missionId||!Array.isArray(payload.inspectors))return false;
  if(!isSharedReport()){
   individualReportContext={state, pendingDrafts,currentView,currentDomain,changed,
    selectedInstitutionId,selectedCloudInstitutionId,mayPrefillAccountInspector};
   state=emptyState();pendingDrafts=Object.create(null);
  }
  sharedReportMissionId=payload.missionId;
  sharedSummaryStatus=Object.create(null);
  sharedSummaryCommitted=Object.create(null);
  this.applySharedReportData(payload);
  currentView='meta';currentDomain=null;render();
  return true;
 },
 applySharedReportData(payload){
  if(!isSharedReport()||payload?.missionId!==sharedReportMissionId)return false;
  if(pendingSharedSummaryFields().length)return false;
  state.mission={...payload.mission};state.institution={...payload.institution};
  state.director={...payload.director};state.summary={...payload.summary};
  for(const key of SUMMARY_KEYS)sharedSummaryCommitted[key]=String(state.summary[key]??'');
  state.inspectors=payload.inspectors.map(x=>({...x}));
  state.entries=payload.entries||{};
  sharedProvenance={missionId:payload.missionId,title:payload.title,
   contributions:payload.provenance,assessments:payload.assessments,fieldHistory:payload.fieldHistory};
  changed=false;render();return true;
 },
 rerenderShared(){if(isSharedReport())render()},
 exitSharedMission(force=false){
  if(!isSharedReport())return true;
  if(!force&&(window.Report03CloudUI?.hasUnsentSharedDrafts?.()||pendingSharedSummaryFields().length)&&
    !confirm('توجد نصوص أو حقول مشتركة لم يُؤكد حفظها. هل تريد مغادرة محرر المهمة دون حفظها؟'))return false;
  if(individualReportContext){
   ({state,pendingDrafts,currentView,currentDomain,changed,
    selectedInstitutionId,selectedCloudInstitutionId,mayPrefillAccountInspector}=individualReportContext);
  }else{state=emptyState();pendingDrafts=Object.create(null);currentView='meta';currentDomain=null;changed=false;}
  individualReportContext=null;sharedReportMissionId='';sharedProvenance=null;
  sharedSummaryStatus=Object.create(null);sharedSummaryCommitted=Object.create(null);
  render();return true;
 },
 listSharedCatalogTargets(){
  if(!valid())return [];
  const rows=[];
  for(const section of catalog.sections){
   if(section.id==='I')continue;
   if(!section.domains.length){
    if(section.id==='X'||section.id==='XI')rows.push({id:section.id,label:section.label,section:section.id});
    continue;
   }
   for(const domain of section.domains){
    rows.push({id:domain.id,label:section.label+' — '+domain.label+' — المجال كاملًا',section:section.id});
    for(const indicator of domain.indicators){
     rows.push({id:indicator.id,label:section.label+' — '+domain.label+' — '+indicator.label,section:section.id});
    }
   }
  }
  return rows;
 },
 prepareLogout(){
  if(isSharedReport()&&this.exitSharedMission()===false)return false;
  const reportHasData=hasInspectionInput()||
    ['mission','institution','director','summary'].some(group=>
      Object.values(state[group]||{}).some(value=>Boolean(text(value))))||
    (state.inspectors||[]).some(i=>Object.values(i).some(value=>Boolean(text(value))));
  if(reportHasData&&!confirm('سيؤدي تسجيل الخروج إلى محو بيانات التقرير الجاري من ذاكرة التبويب. صدّر JSON أو DOCX أو PDF قبل المتابعة. هل تريد تسجيل الخروج ومحو المسودة؟'))return false;
  state=emptyState();mayPrefillAccountInspector=true;selectedInstitutionId='';selectedCloudInstitutionId='';
  pendingDrafts=Object.create(null);changed=false;currentView='meta';currentDomain=null;
  $('print-root')?.replaceChildren();
  const file=$('import-file');if(file)file.value='';
  const dialog=$('export-dialog');if(dialog?.open)dialog.close();
  render();
  return true;
 },
 getIdentity(){return bookData(state)},
 syncSharedInstitutionOptions(){return syncSharedInstitutionOptions()},
 prefillAccountInspector(account){return prefillAccountInspector(account)},
 syncReportColleagueOptions(){return syncReportColleagueOptions()},
 applyIdentity(institution,director,metadata={}){
  if(isSharedReport())return {ok:false,message:'مؤسسة المهمة المشتركة تثبت عند إنشاء المهمة، ولا يمكن استبدالها من المحرر.'};
  if(!catalog)return {ok:false,message:'انتظر تحميل فهرس النموذج.'};
  if(hasInspectionInput())return {ok:false,message:'توجد معاينات أو تقييمات ضمن التقرير الحالي. صدّره ثم امحُ بياناته قبل تغيير المؤسسة.'};
  if([...Object.values(state.institution),...Object.values(state.director)].some(text)&&
     !confirm('هل تريد استبدال بيانات المؤسسة ورئيسها الحالية بمعلومات السجل المشترك؟'))return {ok:false,message:'لم تُغيَّر بيانات التقرير.'};
  state.institution=fieldsOnly(institution||{},INST_KEYS);
  state.director=fieldsOnly(director||{},HEAD_KEYS);
  selectedInstitutionId='';selectedCloudInstitutionId=metadata.sharedInstitutionId||'';changed=true;render();
  return {ok:true};
 }
};

async function init(){try{const res=await fetch('./catalog.json',{cache:'no-store'});if(!res.ok)throw Error('تعذّر تحميل قائمة المعايير');catalog=await res.json();if(!valid()||catalog.templateId!=='OFFICIAL_REPORT_TEMPLATE_03')throw Error('بيانات النموذج غير صالحة');loadInstitutionBook();bindHandlers();render()}catch(e){$('workspace').innerHTML=`<section class="card"><h2>تعذّر تشغيل التطبيق</h2><p>${safe(e.message)}</p><p>يفترض فتح الموقع عبر خادم ويب (مثل GitHub Pages)، وليس فتح index.html مباشرةً من الملفات.</p></section>`}}
init();