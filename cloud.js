/* M2.1 — Optional shared institution register, entirely separate from report content.
 * No remote requests unless a public Supabase project is explicitly configured.
 * Only institution/director metadata and account information cross the network.
 */
(function(){
'use strict';
const shell=document.getElementById('cloud-shell'),root=document.getElementById('cloud-content');
if(!shell||!root)return;
const cfg=window.REPORT03_CLOUD_CONFIG||{};
const base=String(cfg.supabaseUrl||'').replace(/\/+$/,'');
const key=String(cfg.publishableKey||'');
const configured=/^https:\/\//.test(base)&&base.length<300&&key.length>20&&!key.toLowerCase().includes('service_role')&&!key.startsWith('sb_secret_');
const SESSION_KEY='official_report03_cloud_session_v1';
let session=null,profile=null,shared=[],profiles=[],notifications=[],changes=[],accountDecisions=[],myDecisions=[],mode='login';
let selectedSharedId='',editingVersion=null,feedback='',busy=false,currentPage='dashboard';
let missions=[],missionMembers=[],missionNotifications=[],missionEnabled=false,missionError='';
let selectedMissionId='',missionDraft={institutionId:'',title:'',purpose:'',visitStart:'',visitEnd:''};
let missionContributions=[],contributionLoadedFor='',contributionError='',contributionBusy=false;
let contributionDrafts=Object.create(null);
let embeddedDrafts=Object.create(null),activeReportMissionId='';
let sharedFieldEvents=[],sharedAssessmentEvents=[],sharedDataLoadedFor='',sharedDataError='';
let sharedReportBusy=false,pendingFieldSaves=0;
let institutionDraft={institution:{},director:{}};
const elt=val=>String(val==null?'':val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const text=val=>String(val==null?'':val).trim();
const verifiedUser=()=>profile&&profile.approved;
const title=role=>({IFEP:'مفتش التكوين والتعليم المهنيين',ITP:'مفتش تقني وبيداغوجي',IAF:'مفتش إداري ومالي'})[role]||role||'';
const now=()=>new Date().toISOString();
function status(message){feedback=String(message||'');const o=document.getElementById('cloud-message');if(o)o.textContent=feedback}
function storageSet(value){
 try{if(value)sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));else sessionStorage.removeItem(SESSION_KEY)}catch(e){status('تعذر تخزين جلسة تسجيل الدخول في هذا التبويب: '+e.message)}
}
function loadStoredSession(){
 try{const x=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
 if(x&&x.access_token&&x.refresh_token&&x.user&&x.user.id)session=x;
 }catch(e){session=null}
}
function validateEndpoint(){
 if(!configured)return false;
 try{const x=new URL(base);return x.protocol==='https:'&&!x.username&&!x.password&&x.pathname==='/'&&!!x.hostname}catch(e){return false}
}
async function raw(method,path,body,authRequired){
 if(!validateEndpoint())throw Error('الخدمة المركزية غير مهيأة بعد.');
 if(authRequired)await refreshSession();
 const headers={'apikey':key,'Accept':'application/json'};
 if(body!==undefined)headers['Content-Type']='application/json';
 if(authRequired){if(!session?.access_token)throw Error('سجّل الدخول أولًا');headers.Authorization='Bearer '+session.access_token}
 const result=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 const responseText=await result.text();
 let data;try{data=responseText?JSON.parse(responseText):null}catch(e){data={message:responseText.slice(0,200)}}
 if(!result.ok){const message=data?.message||data?.msg||data?.error_description||data?.details||data?.error||'تعذر تنفيذ الطلب';
  const error=new Error(String(message));error.httpStatus=result.status;throw error}
 return data;
}
async function refreshSession(){
 if(!session)return;
 if(Date.now()<(session.expires_at_ms||0)-60000)return;
 const response=await raw('POST','/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token},false);
 if(!response?.access_token||!response?.refresh_token){session=null;storageSet(null);throw Error('انتهت الجلسة؛ يرجى تسجيل الدخول مجددًا')}
 rememberSession(response);
}
function rememberSession(data){
 session={access_token:data.access_token,refresh_token:data.refresh_token,
 user:data.user||session?.user,expires_at_ms:Date.now()+1000*(Number(data.expires_in)||3600)};
 storageSet(session);
}
async function restoreUrlCredentials(){
 const hash=new URLSearchParams(location.hash.replace(/^#/,'')),token=hash.get('access_token'),refresh=hash.get('refresh_token');
 if(token&&refresh){
  session={access_token:token,refresh_token:refresh,user:{id:''},expires_at_ms:Date.now()+3600000};
  const user=await raw('GET','/auth/v1/user',undefined,true);
  session.user={id:user.id,email:user.email};storageSet(session);
  history.replaceState(null,'',location.pathname+location.search);
  status('تم تأكيد البريد الإلكتروني. جارٍ التحقق من الاعتماد المهني.');
 }
}
function apiPath(table,params){
 const q=new URLSearchParams(params||{});
 return '/rest/v1/'+table+(q.toString()?'?'+q.toString():'');
}
async function get(table,params){return raw('GET',apiPath(table,params),undefined,true)}
async function submit(table,data,params,method){
 await refreshSession();
 if(!session?.access_token)throw Error('سجل الدخول أولًا');
 const path=apiPath(table,params);
 const headers={'apikey':key,'Authorization':'Bearer '+session.access_token,
  'Content-Type':'application/json','Accept':'application/json','Prefer':'return=representation'};
 const res=await fetch(base+path,{method:method||'POST',headers,body:JSON.stringify(data),cache:'no-store'});
 const rawText=await res.text();let result;try{result=rawText?JSON.parse(rawText):[]}catch(e){result=[]}
 if(!res.ok){const ex=new Error(String(result?.message||result?.details||'فشل الحفظ المشترك'));ex.httpStatus=res.status;throw ex}
 return result;
}
async function loadProfile(){
 const rows=await get('inspector_profiles',{select:'id,email,first_name,last_name,profession,district,approved,is_admin,account_status',id:'eq.'+session.user.id});
 profile=Array.isArray(rows)?rows[0]||null:null;
 if(!profile)throw Error('تعذر العثور على ملف المفتش. تحقق من تنفيذ مخطط قاعدة البيانات.');
 myDecisions=await get('inspector_account_decisions',{select:'previous_status,new_status,reason,decided_at',inspector_id:'eq.'+session.user.id,order:'decided_at.desc',limit:'1'});
}
async function loadShared(){
 if(!verifiedUser()){shared=[];notifications=[];changes=[];profiles=[];accountDecisions=[];return}
 const [institutions,people,pings,decisionRows]=await Promise.all([
  get('shared_institutions',{select:'id,name,wilaya,code,institution_data,director_data,version,updated_at,updated_by',order:'name.asc',limit:'500'}),
  get('inspector_profiles',{select:'id,email,first_name,last_name,profession,district,approved,is_admin,account_status',order:'first_name.asc'}),
  get('institution_notifications',{select:'id,change_id,read_at,created_at',recipient_id:'eq.'+session.user.id,order:'created_at.desc',limit:'40'}),
 profile.is_admin?get('inspector_account_decisions',{select:'id,inspector_id,decided_by,previous_status,new_status,reason,decided_at',order:'decided_at.desc',limit:'60'}):Promise.resolve([])
 ]);
 shared=institutions||[];profiles=people||[];notifications=pings||[];accountDecisions=decisionRows||[];
 const ids=notifications.map(x=>x.change_id).filter(Boolean);
 changes=ids.length?await get('institution_changes',{select:'id,institution_id,actor_id,action,changes,created_at',id:'in.('+ids.join(',')+')'}):[];
}
async function loadMissions(){
 if(!verifiedUser()){
  missions=[];missionMembers=[];missionNotifications=[];missionEnabled=false;missionError='';return;
 }
 try{
  const [m,mm,n]=await Promise.all([
   get('inspection_missions',{select:'id,title,purpose,institution_id,institution_snapshot,director_snapshot,visit_start,visit_end,status,created_at,created_by',order:'created_at.desc',limit:'100'}),
   get('inspection_mission_members',{select:'mission_id,inspector_id,invited_by,membership_status,created_at,responded_at',order:'created_at.desc',limit:'500'}),
   get('inspection_mission_notifications',{select:'id,mission_id,recipient_id,actor_id,event_type,description,read_at,created_at',
    recipient_id:'eq.'+session.user.id,order:'created_at.desc',limit:'100'})
  ]);
  missions=Array.isArray(m)?m:[];missionMembers=Array.isArray(mm)?mm:[];
  missionNotifications=Array.isArray(n)?n:[];missionEnabled=true;missionError='';
 }catch(err){
  missions=[];missionMembers=[];missionNotifications=[];missionEnabled=false;
  missionError=err.httpStatus===404||err.httpStatus===400
   ?'لم تُفعّل جداول المهام المشتركة في Supabase بعد. يحتاج مسؤول المنصة إلى تشغيل الترحيل 003.'
   :'تعذّر تحميل بيانات المهام: '+err.message;
 }
 if(selectedMissionId&&!missions.some(m=>m.id===selectedMissionId)){
  selectedMissionId='';
  if(activeReportMissionId){activeReportMissionId='';window.Report03CloudBridge?.exitSharedMission?.(true);}
 }
 await loadMissionContributions();
 await loadSharedReportExtras();
 notifyReportEditor(false);
}

function selectedMission(){
 return missions.find(m=>m.id===selectedMissionId&&m.status==='draft')||null;
}

function reportActive(){return Boolean(verifiedUser()&&activeReportMissionId&&activeReportMissionId===selectedMissionId&&missions.some(m=>m.id===activeReportMissionId&&m.status==='draft'))}
function eventLatest(rows,keyFn){
 const result=new Map();
 for(const row of rows){
  const k=keyFn(row),old=result.get(k);
  if(!old||row.created_at>old.created_at||row.created_at===old.created_at&&row.id>old.id)result.set(k,row);
 }
 return result;
}
async function loadSharedReportExtras(){
 const id=selectedMissionId;
 if(!verifiedUser()||!missionEnabled||!id||!missions.some(m=>m.id===id)){
  sharedFieldEvents=[];sharedAssessmentEvents=[];sharedDataLoadedFor='';sharedDataError='';return;
 }
 try{
  async function fetchEvents(table,columns){
   const rows=[];
   for(let offset=0;offset<5000;offset+=250){
    const batch=await get(table,{select:columns,mission_id:'eq.'+id,order:'created_at.asc',
     limit:'250',offset:String(offset)});
    if(!Array.isArray(batch))throw Error('تعذر قراءة سجل أحداث المهمة.');
    rows.push(...batch);
    if(batch.length<250)return rows;
   }
   throw Error('سجل المهمة تجاوز 5000 حدث، يلزم التصفح على دفعات.');
  }
  const [fields,assessments]=await Promise.all([
   fetchEvents('inspection_report_field_events','id,mission_id,field_group,field_key,field_value,author_id,created_at'),
   fetchEvents('inspection_assessment_events','id,mission_id,item_id,assessment,author_id,created_at')
  ]);
  if(selectedMissionId!==id)return;
  sharedFieldEvents=fields;sharedAssessmentEvents=assessments;sharedDataLoadedFor=id;sharedDataError='';
 }catch(err){
  if(selectedMissionId!==id)return;
  sharedDataLoadedFor='';sharedDataError='مزامنة حقول التقرير وتقييماته تتطلب تشغيل SQL رقم 005: '+err.message;
 }
}
function effectiveSharedReport(){
 if(!reportActive()||contributionLoadedFor!==selectedMissionId||sharedDataLoadedFor!==selectedMissionId||
    contributionError||sharedDataError)return null;
 const m=missions.find(x=>x.id===selectedMissionId);
 const accepted=missionMembers.filter(x=>x.mission_id===m.id&&x.membership_status==='accepted');
 const record=shared.find(x=>x.id===m.institution_id);
 const fieldMap=eventLatest(sharedFieldEvents,x=>x.field_group+'.'+x.field_key);
 const assessmentMap=eventLatest(sharedAssessmentEvents,x=>x.item_id);
 const mission={
  purpose:m.purpose,period:fieldMap.get('mission.period')?.field_value||'',
  previousReports:fieldMap.get('mission.previousReports')?.field_value||'',
  monthYear:fieldMap.get('mission.monthYear')?.field_value||'',
  visitDates:[m.visit_start,m.visit_end].filter(Boolean).join(' — ')
 };
 const summary={
  generalAssessment:fieldMap.get('summary.generalAssessment')?.field_value||'',
  generalRecommendations:fieldMap.get('summary.generalRecommendations')?.field_value||''
 };
 const inspectors=accepted.map((mem,i)=>{
  const person=profiles.find(p=>p.id===mem.inspector_id);
  return {id:mem.inspector_id,profileId:mem.inspector_id,
   name:person?text(person.first_name+' '+person.last_name):'مفتش مشارك',
   role:person?.profession||'IFEP',district:person?.district||''};
 });
 const corrections=new Map();
 for(const row of missionContributions)if(row.kind==='correction'){
  const list=corrections.get(row.parent_id)||[];list.push(row);corrections.set(row.parent_id,list);
 }
 const entries={};
 for(const row of missionContributions){
  if(row.kind!=='finding'&&row.kind!=='recommendation')continue;
  const additions=corrections.get(row.id)||[];
  const revision=additions[additions.length-1];
  const val={id:row.id,text:revision?.body||row.body,
   originalText:row.body,authorId:row.author_id,authorName:contributionName(row.author_id),
   createdAt:row.created_at,correctionIds:additions.map(x=>x.id)};
  if(!entries[row.item_id])entries[row.item_id]={assessment:null,findings:[],recommendations:[]};
  entries[row.item_id][row.kind==='finding'?'findings':'recommendations'].push(val);
 }
 for(const [item,row] of assessmentMap){
  if(!entries[item])entries[item]={assessment:null,findings:[],recommendations:[]};
  entries[item].assessment=row.assessment||null;
 }
 // A report is a snapshot of its mission, not of live institution records.
 return {missionId:m.id,title:m.title,mission,institution:m.institution_snapshot||record?.institution_data||{},
  director:m.director_snapshot||{},summary,inspectors,entries,
  provenance:missionContributions.map(x=>({...x,authorName:contributionName(x.author_id)})),
  assessments:sharedAssessmentEvents.map(x=>({...x,authorName:contributionName(x.author_id)})),
  fieldHistory:sharedFieldEvents.map(x=>({...x,authorName:contributionName(x.author_id)}))};
}
function notifyReportEditor(force=false){
 if(!reportActive())return;
 const payload=effectiveSharedReport();
 if(payload&&window.Report03CloudBridge?.applySharedReportData){
  if(force||!document.activeElement?.matches?.('[data-group],[data-shared-body],[data-assessment]'))
   window.Report03CloudBridge.applySharedReportData(payload);
 }
}
async function loadSharedReportAll(){
 await loadMissionContributions();
 await loadSharedReportExtras();
 if(contributionError||sharedDataError)throw Error([contributionError,sharedDataError].filter(Boolean).join(' | '));
 notifyReportEditor(true);
}
async function enterMissionReport(){
 if(!verifiedUser()||!selectedMission())throw Error('اختر مهمة مشتركة مفتوحة ومقبولة أولًا.');
 // Reset the remote context only after the old report draft explicitly approves the switch.
 const id=selectedMissionId;
 const canOpen=window.Report03CloudBridge?.canOpenSharedMission?.(id);
 if(canOpen===false)return;
 activeReportMissionId=id;
 try{
  await loadSharedReportAll();
  const payload=effectiveSharedReport();
  if(!payload)throw Error('لم تكتمل بيانات المهمة.');
  if(window.Report03CloudBridge?.enterSharedMission?.(payload)===false){
   activeReportMissionId='';return;
  }
  currentPage='report';feedback='فُتح محرر التقرير المشترك. جميع إضافاتك محفوظة في المهمة.';
 }catch(e){activeReportMissionId='';throw e}
}
function sharedDraft(itemId){
 const key=activeReportMissionId+':'+itemId;
 return embeddedDrafts[key]||(embeddedDrafts[key]={itemId,kind:'finding',body:'',parentId:null,requestId:''});
}
function sharedEditorFor(itemId){
 if(!reportActive())return '';
 const draft=sharedDraft(itemId);
 const originals=missionContributions.filter(x=>x.item_id===itemId&&['finding','recommendation'].includes(x.kind));
 const children=missionContributions.filter(x=>x.item_id===itemId&&['reply','correction'].includes(x.kind));
 return '<div class="shared-inline-editor">'+
 '<div class="shared-editor-header"><strong>مساهمات المفتشين ('+originals.length+')</strong>'+
 '<button type="button" class="btn subtle" data-shared-action="refresh">تحديث</button></div>'+
 (originals.length?originals.map(x=>{
   const notes=children.filter(child=>child.parent_id===x.id);
   return '<div class="shared-inline-item"><div><strong>'+elt(contributionKinds(x.kind))+
    ' — '+elt(contributionName(x.author_id))+'</strong></div>'+
    '<details><summary>عرض نص المساهمة'+(notes.length?' وتعقيباتها ('+notes.length+')':'')+'</summary>'+
    '<p class="shared-inline-text">'+elt(x.body)+'</p>'+
    notes.map(note=>'<div class="shared-inline-reply"><strong>'+elt(contributionKinds(note.kind))+
     ' — '+elt(contributionName(note.author_id))+'</strong><p>'+elt(note.body)+'</p></div>').join('')+
    '</details><div class="portal-actions">'+
    '<button type="button" class="btn subtle" data-shared-action="reply" data-item-id="'+elt(itemId)+
    '" data-parent-id="'+elt(x.id)+'">إضافة تعقيب</button>'+
    (x.author_id===session.user.id?'<button type="button" class="btn subtle" data-shared-action="correct" data-item-id="'+elt(itemId)+
    '" data-parent-id="'+elt(x.id)+'">إضافة تصحيح</button>':'')+'</div></div>';
 }).join(''):'<p class="empty">لا توجد مساهمات محفوظة لهذا العنصر.</p>')+
 '<label>نوع الإضافة<select data-shared-kind="'+elt(itemId)+'">'+
 [['finding','معاينة'],['recommendation','توصية'],['reply','تعقيب'],['correction','تصحيح']].map(([value,name])=>
 '<option value="'+value+'"'+(value===draft.kind?' selected':'')+
 (!draft.parentId&&['reply','correction'].includes(value)?' disabled':'')+'>'+name+'</option>').join('')+
 '</select></label>'+
 (draft.parentId?'<p class="cloud-tip">الإضافة مرتبطة بالنص الأصلي: '+elt(draft.parentId)+
 ' <button type="button" class="btn subtle" data-shared-action="cancel" data-item-id="'+elt(itemId)+'">إلغاء</button></p>':'')+
 '<textarea data-shared-body="'+elt(itemId)+'" rows="3" maxlength="30000" placeholder="اكتب هنا. لا يتم الحفظ إلا بعد الضغط على الزر.">'+elt(draft.body)+'</textarea>'+
 '<button type="button" class="add-button" data-shared-action="save" data-item-id="'+elt(itemId)+'">حفظ الإضافة في المهمة</button>'+
 '</div>';
}
async function saveEmbedded(itemId){
 if(!reportActive()||contributionLoadedFor!==activeReportMissionId||contributionError)
  throw Error('يلزم تحديث المهمة المشتركة أولًا.');
 if(!catalogTargets().some(x=>x.id===itemId))throw Error('المؤشر غير معروف في الفهرس الرسمي.');
 const d=sharedDraft(itemId),body=text(d.body);
 if(!body||body.length>30000)throw Error('اكتب نصًا صالحًا للحفظ.');
 if(!d.requestId)d.requestId=crypto.randomUUID();
 const id=await raw('POST','/rest/v1/rpc/append_inspection_contribution',{
  p_mission_id:activeReportMissionId,p_item_id:itemId,p_kind:d.kind,
  p_body:body,p_parent_id:d.parentId||null,p_client_request_id:d.requestId
 },true);
 if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('لم تُؤكد قاعدة البيانات الحفظ.');
 const key=activeReportMissionId+':'+itemId;
 if(d.body===body)embeddedDrafts[key]={itemId,kind:'finding',body:'',parentId:null,requestId:''};
 else d.requestId='';
 await loadMissionContributions();
 if(contributionError)throw Error('حُفظ النص لكن تعذر تحديث عرضه؛ حاول التحديث.');
 notifyReportEditor(true);
}
async function saveSharedField(group,key,value){
 if(!reportActive()||sharedDataLoadedFor!==activeReportMissionId)throw Error('بيانات المهمة غير متزامنة.');
 if(!((group==='mission'&&['period','previousReports','monthYear'].includes(key))||
      (group==='summary'&&['generalAssessment','generalRecommendations'].includes(key))))
  throw Error('هذا الحقل غير قابل للتعديل في المهمة المشتركة.');
 const before=eventLatest(sharedFieldEvents,x=>x.field_group+'.'+x.field_key).get(group+'.'+key)?.id||null;
 pendingFieldSaves++;
 try{
  await raw('POST','/rest/v1/rpc/set_inspection_report_field',{
   p_mission_id:activeReportMissionId,p_group:group,p_key:key,p_value:value,
   p_expected_event_id:before,p_request_id:crypto.randomUUID()
  },true);
  await loadSharedReportExtras();
  if(sharedDataError)throw Error(sharedDataError);
  notifyReportEditor(false);
 }finally{pendingFieldSaves--}
}
async function saveSharedAssessment(itemId,value){
 if(!reportActive()||sharedDataLoadedFor!==activeReportMissionId)throw Error('بيانات المهمة غير متزامنة.');
 if(!catalogTargets().some(x=>x.id===itemId))throw Error('المؤشر غير معروف.');
 const previous=eventLatest(sharedAssessmentEvents,x=>x.item_id).get(itemId)?.id||null;
 pendingFieldSaves++;
 try{
  await raw('POST','/rest/v1/rpc/set_inspection_assessment',{
   p_mission_id:activeReportMissionId,p_item_id:itemId,p_assessment:value,
   p_expected_event_id:previous,p_request_id:crypto.randomUUID()
  },true);
  await loadSharedReportExtras();
  if(sharedDataError)throw Error(sharedDataError);
  notifyReportEditor(false);
 }finally{pendingFieldSaves--}
}
async function prepareSharedExport(){
 if(!reportActive())return null;
 if(pendingFieldSaves)throw Error('انتظر اكتمال حفظ الحقول والتقييمات.');
 if(Object.entries(embeddedDrafts).some(([key,d])=>key.startsWith(activeReportMissionId+':')&&text(d.body)))
  throw Error('توجد مساهمة مكتوبة لم تحفظها بعد؛ احفظها أو امح النص قبل التصدير.');
 await loadSharedReportAll();
 return effectiveSharedReport();
}

function contributionDraft(){
 if(!selectedMissionId)return null;
 return contributionDrafts[selectedMissionId]||(
  contributionDrafts[selectedMissionId]={itemId:'',kind:'finding',body:'',parentId:null,requestId:''}
 );
}
function catalogTargets(){return window.Report03CloudBridge?.listSharedCatalogTargets?.()||[]}
function catalogLabel(itemId){
 return catalogTargets().find(x=>x.id===itemId)?.label||itemId;
}
async function loadMissionContributions(){
 const id=selectedMissionId;
 if(!verifiedUser()||!missionEnabled||!id||!missions.some(m=>m.id===id)){
  missionContributions=[];contributionLoadedFor='';contributionError='';return;
 }
 const all=[];
 try{
  // Paged fetch avoids silently dropping rows at PostgREST's default 1000-row limit.
  for(let offset=0;offset<5000;offset+=250){
   const batch=await get('inspection_contributions',{
    select:'id,mission_id,item_id,kind,body,author_id,parent_id,client_request_id,created_at',
    mission_id:'eq.'+id,order:'created_at.asc',limit:'250',offset:String(offset)
   });
   if(!Array.isArray(batch))throw Error('تعذر قراءة سجل المساهمات.');
   all.push(...batch);
   if(batch.length<250)break;
   if(offset>=4750)throw Error('سجل المهمة تجاوز حد 5000 مساهمة؛ يلزم التصفح على دفعات قبل متابعة الإدخال.');
  }
  // Ignore stale network results when switching mission during the request.
  if(selectedMissionId!==id)return;
  missionContributions=all;contributionLoadedFor=id;contributionError='';
 }catch(err){
  if(selectedMissionId!==id)return;
  // Stale previously loaded entries are visible but never presented as up-to-date.
  if(contributionLoadedFor!==id){missionContributions=[];contributionLoadedFor=''}
  contributionError='تعذر تحديث مساهمات المهمة: '+err.message;
 }
}
function contributionName(authorId){
 return missionMemberName(authorId);
}
function contributionKinds(kind){
 return {finding:'معاينة',recommendation:'توصية',reply:'تعقيب',correction:'تصحيح من صاحب النص'}[kind]||kind;
}
function sharedContributionRows(){
 if(contributionLoadedFor!==selectedMissionId)return '<p>جارٍ تحميل مساهمات المهمة أو لم يتم تحميلها بعد.</p>';
 const originals=missionContributions.filter(x=>x.kind==='finding'||x.kind==='recommendation');
 if(!originals.length)return '<p>لا توجد معاينات أو توصيات مشتركة محفوظة حتى الآن.</p>';
 const byParent=new Map();
 for(const item of missionContributions){
  if(!item.parent_id)continue;
  const children=byParent.get(item.parent_id)||[];children.push(item);byParent.set(item.parent_id,children);
 }
 return originals.map(item=>{
  const children=byParent.get(item.id)||[];
  const controls='<div class="portal-actions">'+
   '<button type="button" class="btn subtle" data-cloud-action="contribution-reply" data-contribution-id="'+elt(item.id)+'">إضافة تعقيب</button>'+
   (item.author_id===session.user.id?'<button type="button" class="btn subtle" data-cloud-action="contribution-correct" data-contribution-id="'+elt(item.id)+'">إضافة تصحيح</button>':'')+
   '</div>';
  return '<article class="mission-contribution"><div class="mission-contribution-title"><strong>'+
   elt(contributionKinds(item.kind))+' — '+elt(catalogLabel(item.item_id))+'</strong>'+
   '<span>'+elt(contributionName(item.author_id))+' — '+elt((item.created_at||'').replace('T',' ').slice(0,16))+'</span></div>'+
   '<p class="mission-contribution-body">'+elt(item.body)+'</p>'+controls+
   (children.length?'<div class="mission-contribution-replies">'+children.map(reply=>
    '<article><strong>'+elt(contributionKinds(reply.kind))+' — '+elt(contributionName(reply.author_id))+
    '</strong><small>'+elt((reply.created_at||'').replace('T',' ').slice(0,16))+'</small>'+
    '<p>'+elt(reply.body)+'</p></article>').join('')+'</div>':'')+
   '</article>';
 }).join('');
}
function sharedContributionEditor(){
 const mission=selectedMission();
 if(!mission)return '';
 const draft=contributionDraft();
 const options=catalogTargets();
 return '<div class="mission-collaboration"><h3>المعاينات والتوصيات المشتركة</h3>'+
 '<p class="cloud-tip">تُحفظ كل إضافة باسم صاحب حسابها وتظهر لأعضاء المهمة عند تحديثها. لا يمكن محو النص الأصلي أو استبداله؛ يمكن التعقيب عليه، ويصححه صاحبه بإضافة مستقلة. لا تنتقل هذه الإدخالات تلقائيًا إلى مطبوع النموذج 03 حتى مرحلة الدمج M3.3.</p>'+
 (contributionError?'<p class="mission-sync-error" role="alert">'+elt(contributionError)+'</p>':'')+
 '<div class="portal-actions"><button type="button" class="btn subtle" data-cloud-action="contribution-refresh">تحديث مساهمات الزملاء</button>'+
 '<small>'+(contributionLoadedFor===selectedMissionId?'المساهمات المحمّلة: '+missionContributions.length:'سجل المساهمات غير محمّل')+'</small></div>'+
 '<div class="mission-new-entry"><h4>إضافة مساهمة موثقة</h4>'+
 '<label class="portal-field">المجال أو المؤشر الرسمي<select data-contrib-field="itemId" id="contribution-item">'+
 '<option value="">— اختر مجالًا أو مؤشرًا —</option>'+
 options.map(row=>'<option value="'+elt(row.id)+'" '+(draft.itemId===row.id?'selected':'')+'>'+elt(row.label)+'</option>').join('')+'</select></label>'+
 '<label class="portal-field">نوع المساهمة<select data-contrib-field="kind" id="contribution-kind">'+
 [['finding','معاينة'],['recommendation','توصية'],['reply','تعقيب'],['correction','تصحيح من صاحب النص']].map(([code,label])=>
 '<option value="'+code+'" '+(draft.kind===code?'selected':'')+' '+(draft.parentId?'':code==='reply'||code==='correction'?'disabled':'')+'>'+label+'</option>').join('')+
 '</select></label>'+
 (draft.parentId?'<div class="mission-parent-note">مرتبطة بالمساهمة: '+elt(draft.parentId)+
 ' <button type="button" class="btn subtle" data-cloud-action="contribution-cancel-parent">إلغاء الربط</button></div>':'')+
 '<label class="portal-field">نص المساهمة<textarea data-contrib-field="body" id="contribution-body" maxlength="30000" rows="5" placeholder="اكتب المعاينة أو التوصية أو التعقيب؛ لا تُرسل حتى الضغط على حفظ المساهمة">'+elt(draft.body)+'</textarea></label>'+
 '<div class="portal-actions"><button type="button" class="btn primary" data-cloud-action="contribution-add" '+
 ((!options.length||contributionBusy)?'disabled':'')+'>حفظ المساهمة المشتركة</button>'+
 '<small>تظهر رسالة نجاح فقط بعد إقرار قاعدة البيانات بالحفظ.</small></div></div>'+
 '<h4>المساهمات المحفوظة</h4>'+sharedContributionRows()+'</div>';
}
function setContributionParent(id,kind){
 const parent=missionContributions.find(row=>row.id===id&&
  (row.kind==='finding'||row.kind==='recommendation'));
 if(!parent)throw Error('المساهمة الأصلية غير متاحة؛ حدّث القائمة.');
 if(kind==='correction'&&parent.author_id!==session.user.id)
  throw Error('التصحيح خاص بصاحب النص؛ استخدم التعقيب للإضافة على كلام زميلك.');
 const d=contributionDraft();
 d.itemId=parent.item_id;d.kind=kind;d.parentId=parent.id;d.body='';d.requestId='';
}
async function appendContribution(){
 const mission=selectedMission(),draft=contributionDraft();
 if(!verifiedUser()||!mission)throw Error('يلزم الانضمام إلى مهمة مفتوحة بحساب مفتش معتمد.');
 if(contributionLoadedFor!==mission.id||contributionError)throw Error('حدّث سجل المساهمات بنجاح أولًا.');
 if(!catalogTargets().some(x=>x.id===draft.itemId))throw Error('اختر عنصرًا رسميًا صالحًا من الفهرس.');
 if(!['finding','recommendation','reply','correction'].includes(draft.kind))throw Error('نوع المساهمة غير صالح.');
 if(['reply','correction'].includes(draft.kind)!==Boolean(draft.parentId))
  throw Error('التعقيب والتصحيح يتطلبان اختيار المساهمة الأصلية.');
 const body=text(draft.body);
 if(body.length<1||body.length>30000)throw Error('اكتب نص المساهمة (حد أقصى 30000 حرف).');
 if(draft.parentId){
  const parent=missionContributions.find(x=>x.id===draft.parentId&&
   x.item_id===draft.itemId&&(x.kind==='finding'||x.kind==='recommendation'));
  if(!parent)throw Error('المساهمة الأصلية غير متاحة.');
  if(draft.kind==='correction'&&parent.author_id!==session.user.id)
   throw Error('التصحيح لصاحب المساهمة الأصلية فقط.');
 }
 if(!draft.requestId){
  if(!globalThis.crypto?.randomUUID)throw Error('يتطلب الحفظ متصفحًا يدعم إنشاء معرّفات طلب آمنة.');
  draft.requestId=globalThis.crypto.randomUUID();
 }
 const requestId=draft.requestId;
 const id=await raw('POST','/rest/v1/rpc/append_inspection_contribution',{
  p_mission_id:mission.id,p_item_id:draft.itemId,p_kind:draft.kind,
  p_body:body,p_parent_id:draft.parentId||null,p_client_request_id:requestId
 },true);
 if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('لم تؤكد قاعدة البيانات حفظ المساهمة.');
 // Only clear unchanged draft. If the author edited while the request was in
 // flight, preserve the newer text as a new pending entry.
 if(draft.requestId===requestId&&draft.body===body){
  contributionDrafts[mission.id]={itemId:draft.itemId,kind:'finding',body:'',parentId:null,requestId:''};
 }else if(draft.requestId===requestId)draft.requestId='';
 await loadMissionContributions();
 feedback=contributionError?
  'حُفظت المساهمة بنجاح، لكن تعذر تحديث العرض. حدّث سجل المساهمات.':
  'حُفظت المساهمة المشتركة باسمك؛ يمكن لبقية الأعضاء مشاهدتها عند التحديث.';
}

async function fetchAll(){
 if(!session)return;
 await loadProfile();
 await loadShared();
 await loadMissions();
 render();
}
function fieldName(key){
 const lookup={
  name:'التسمية',wilaya:'الولاية',code:'رمز المؤسسة',decree:'مرسوم الإنشاء',
  decreeDate:'تاريخ المرسوم',startDate:'بداية النشاط',address:'العنوان',
  phone:'الهاتف',fax:'الفاكس',email:'البريد الإلكتروني',website:'الموقع الإلكتروني',
  speciality:'اختصاص المؤسسة',distance:'البعد عن الولاية',mapUrl:'الموقع الجغرافي',
  fullName:'اسم رئيس المؤسسة',job:'وظيفة رئيس المؤسسة',rank:'الرتبة',
  installedAt:'تاريخ التنصيب',firstAppointedAt:'تاريخ أول تعيين'
 };
 return lookup[key.replace(/^(institution|director)\./,'')]||key;
}
function changeCell(value){
 if(value==null)return 'غير مدخل';
 const label=typeof value==='object'?JSON.stringify(value):String(value);
 return elt(label.slice(0,400));
}
function noticeCard(entry){
 const change=changes.find(c=>c.id===entry.change_id);if(!change)return '';
 const institution=shared.find(i=>i.id===change.institution_id);
 const author=profiles.find(p=>p.id===change.actor_id);
 const who=author?text(author.first_name+' '+author.last_name):'مفتش مسجّل';
 const fieldRows=Object.entries(change.changes||{}).slice(0,40).map(([name,v])=>
  '<tr><th>'+elt(fieldName(name))+'</th><td>'+changeCell(v?.old)+'</td><td>'+changeCell(v?.new)+'</td></tr>').join('');
 return '<article class="cloud-notice '+(entry.read_at?'is-read':'')+'"><p><strong>'+elt(institution?.name||'مؤسسة')+
 '</strong> — '+(change.action==='created'?'إضافة مؤسسة':'تعديل بيانات')+'</p><p>بواسطة '+elt(who)+
 ' — '+elt(new Date(change.created_at).toLocaleString('ar-DZ'))+'</p>'+
 (change.action==='updated'?'<table><thead><tr><th>الحقل</th><th>القيمة السابقة</th><th>القيمة الجديدة</th></tr></thead><tbody>'+fieldRows+'</tbody></table>':'')+
 (entry.read_at?'':'<button type="button" class="add-button" data-cloud-action="read" data-notification-id="'+elt(entry.id)+'">تعليم كمقروء</button>')+'</article>';
}

const ACCOUNT_STATUS_TEXT=Object.freeze({
 pending:'قيد الانتظار',approved:'معتمد',rejected:'مرفوض',suspended:'معلّق'
});
const ACCOUNT_TRANSITIONS=Object.freeze({
 pending:[['approved','اعتماد'],['rejected','رفض']],
 approved:[['suspended','تعليق']],
 rejected:[['approved','اعتماد بعد الرفض']],
 suspended:[['approved','إعادة تفعيل']]
});
function accountStatusLabel(status){return ACCOUNT_STATUS_TEXT[status]||'حالة غير معروفة'}
function accountActionCard(p){
 const status=p.account_status||'pending';
 const actions=p.id!==session.user.id&&!p.is_admin?(ACCOUNT_TRANSITIONS[status]||[]):[];
 const inputs=actions.length?'<label class="cloud-reason-label">سبب القرار (اختياري؛ حد أقصى 1000 حرف)'+
 '<input type="text" maxlength="1000" data-decision-reason="'+elt(p.id)+'" placeholder="يمكن تركه فارغًا"></label>':'';
 const buttons=actions.map(([next,label])=>
 '<button type="button" class="add-button" data-cloud-action="set-status" data-user-id="'+elt(p.id)+
 '" data-new-status="'+elt(next)+'">'+elt(label)+'</button>').join('');
 return '<div class="cloud-account-row"><div><strong>'+elt(text(p.first_name+' '+p.last_name)||'مفتش')+
 '</strong><p>'+elt(p.email)+' — '+elt(title(p.profession))+' — '+elt(accountStatusLabel(status))+
 (p.is_admin?' — مسؤول المنصة':'')+'</p></div>'+inputs+
 '<div class="cloud-account-actions">'+(buttons||'<span class="cloud-tip">للاطلاع فقط</span>')+'</div></div>';
}
function renderAccountAudit(){
 if(!accountDecisions.length)return '<p>لم تُسجّل قرارات بعد تنفيذ تحديث M2.1.1.</p>';
 const rows=accountDecisions.map(d=>{
  const target=profiles.find(p=>p.id===d.inspector_id),actor=profiles.find(p=>p.id===d.decided_by);
  const name=p=>p?text(p.first_name+' '+p.last_name)||p.email:'حساب غير ظاهر';
  return '<tr><td>'+elt(name(target))+'</td><td>'+
   elt(accountStatusLabel(d.previous_status))+' ← '+elt(accountStatusLabel(d.new_status))+
   '</td><td>'+elt(name(actor))+'</td><td>'+elt(new Date(d.decided_at).toLocaleString('ar-DZ'))+
   '</td><td>'+elt(d.reason||'—')+'</td></tr>';
 }).join('');
 return '<div class="cloud-table-scroller"><table class="cloud-audit-table"><thead><tr><th>المفتش</th><th>القرار</th><th>صاحب القرار</th><th>التاريخ</th><th>السبب</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderAccountsManagement(){
 const groups=[
  ['pending','طلبات تنتظر البت'],
  ['approved','المفتشون المعتمدون'],
  ['rejected','الطلبات المرفوضة'],
  ['suspended','الحسابات المعلّقة']
 ];
 let html='<section class="cloud-approvals"><h4>إدارة حسابات المفتشين</h4>'+
  '<p>يمكن للمسؤول اعتماد الطلب أو رفضه أو تعليق حساب معتمد أو إعادة تفعيله. جميع القرارات موثقة، ولا يمكن تعديل الحساب الشخصي من هنا.</p>';
 for(const [status,label] of groups){
  const people=profiles.filter(p=>(p.account_status||'pending')===status);
  html+='<details class="cloud-account-group" '+(status==='pending'?'open':'')+'><summary>'+elt(label)+' ('+people.length+')</summary>'+
   (people.length?people.map(accountActionCard).join(''):'<p>لا توجد حسابات في هذه الحالة.</p>')+'</details>';
 }
 html+='<details class="cloud-audit"><summary>سجل قرارات الحسابات ('+accountDecisions.length+' معروض)</summary>'+
 renderAccountAudit()+'</details></section>';
 return html;
}

function unauthenticatedView(){
 return '<div class="cloud-header"><h3>الحساب المهني</h3><p>يُقبل حساب المفتش بعد التحقق من البريد الإلكتروني واعتماده من مسؤول المنصة.</p></div>'+
 '<div class="cloud-modes"><button type="button" data-cloud-action="mode-login" '+(mode==='login'?'aria-current="true"':'')+'>دخول</button>'+
 '<button type="button" data-cloud-action="mode-signup" '+(mode==='signup'?'aria-current="true"':'')+'>إنشاء حساب</button></div>'+
 '<form id="cloud-auth-form"><label>البريد الإلكتروني<input name="email" type="email" autocomplete="email" required></label>'+
 '<label>كلمة المرور<input name="password" type="password" minlength="8" autocomplete="'+(mode==='login'?'current-password':'new-password')+'" required></label>'+
 (mode==='signup'?'<div class="cloud-two"><label>الاسم<input name="first_name" maxlength="120" required></label>'+
 '<label>اللقب<input name="last_name" maxlength="120" required></label></div>'+
 '<div class="cloud-two"><label>الصفة المهنية<select name="profession"><option value="IFEP">مفتش التكوين والتعليم المهنيين</option>'+
 '<option value="ITP">مفتش تقني وبيداغوجي</option><option value="IAF">مفتش إداري ومالي</option></select></label>'+
 '<label>المقاطعة<input name="district" maxlength="120"></label></div>':'')+
 '<button type="submit" class="btn primary">'+(mode==='login'?'تسجيل الدخول':'تسجيل الحساب')+'</button></form>';
}

const INSTITUTION_EDITOR_FIELDS=[
 ['institution','name','اسم المؤسسة'],['institution','code','رمز المؤسسة'],
 ['institution','wilaya','الولاية'],['institution','address','العنوان'],
 ['institution','phone','الهاتف'],['institution','fax','الفاكس'],
 ['institution','email','البريد الإلكتروني'],['institution','website','الموقع الإلكتروني'],
 ['institution','decree','مرسوم الإنشاء'],['institution','decreeDate','تاريخ المرسوم'],
 ['institution','startDate','تاريخ بداية النشاط'],['institution','speciality','اختصاص المؤسسة'],
 ['institution','distance','البعد عن مقر الولاية'],['institution','mapUrl','الموقع الجغرافي (رابط خرائط Google)'],
 ['director','fullName','اسم ولقب رئيس المؤسسة'],['director','job','الوظيفة'],
 ['director','rank','الرتبة'],['director','installedAt','تاريخ التنصيب'],
 ['director','firstAppointedAt','تاريخ أول تعيين']
];
function useSharedInstitution(id){
 const record=shared.find(x=>x.id===id);
 selectedSharedId=record?.id||'';
 editingVersion=record?.version??null;
 institutionDraft={
  institution:record?{...record.institution_data}: {},
  director:record?{...record.director_data}:{}
 };
}
const NAV_ITEMS=[
 ['dashboard','لوحة القيادة','▦'],
 ['institutions','المؤسسات','▤'],
 ['colleagues','المفتشون الزملاء','♙'],
 ['missions','مهام التفتيش','◷'],
 ['calendar','الرزنامة','▦'],
 ['teams','فرق التفتيش','♧'],
 ['messages','المراسلات','✉'],
 ['notifications','الإشعارات','♧'],
 ['report','محرر التقرير 03','✎'],
 ['account','حسابي','◉']
];
function portalNavigation(){
 const visible=[...NAV_ITEMS,...(profile?.is_admin?[['admin','إدارة الحسابات','⚙']]:[])];
 return '<nav class="portal-navigation" aria-label="أقسام المنصة">'+visible.map(([id,name,ico])=>
 '<button type="button" class="portal-nav-btn'+(currentPage===id?' selected':'')+
 '" data-cloud-action="nav" data-page="'+id+'" aria-current="'+(currentPage===id?'page':'false')+'">'+
 '<span aria-hidden="true">'+ico+'</span><span>'+name+'</span>'+
 (id==='notifications'&&(notifications.some(x=>!x.read_at)||missionNotifications.some(x=>!x.read_at))?
 '<b>'+(notifications.filter(x=>!x.read_at).length+missionNotifications.filter(x=>!x.read_at).length)+'</b>':
 id==='missions'&&missionMembers.some(x=>x.inspector_id===session.user.id&&x.membership_status==='invited')?
 '<b>'+missionMembers.filter(x=>x.inspector_id===session.user.id&&x.membership_status==='invited').length+'</b>':'')+'</button>').join('')+'</nav>';
}
function dashboardCard(label,value,description,target){
 return '<button type="button" class="portal-metric" data-cloud-action="nav" data-page="'+target+'">'+
 '<strong>'+elt(value)+'</strong><span>'+elt(label)+'</span><small>'+elt(description)+'</small></button>';
}
function dashboardView(){
 const colleagues=profiles.filter(p=>p.approved).length;
 const unread=notifications.filter(x=>!x.read_at).length+missionNotifications.filter(x=>!x.read_at).length;
 return '<div class="portal-page-heading"><h2>لوحة القيادة</h2><p>مرحبًا '+elt(profile.first_name)+
 '، هذه البيانات المتاحة حاليًا في السجل المركزي.</p></div>'+
 '<div class="portal-metrics">'+dashboardCard('المؤسسات المشتركة',shared.length,'عرض المؤسسات وتحرير بياناتها','institutions')+
 dashboardCard('المفتشون المعتمدون',colleagues,'الزملاء المسجلون في المنصة','colleagues')+
 dashboardCard('إشعارات غير مقروءة',unread,'تحديثات المؤسسات','notifications')+
 dashboardCard('إعداد التقرير','النموذج 03','إصدار PDF أو DOCX أو JSON','report')+'</div>'+
 '<div class="portal-widgets"><section class="portal-widget"><h3>آخر المؤسسات المسجلة</h3>'+
 (shared.length?'<ul>'+shared.slice(0,6).map(x=>'<li><button data-cloud-action="open-institution" data-institution-id="'+elt(x.id)+'">'+elt(x.name)+' — '+elt(x.wilaya)+'</button></li>').join('')+'</ul>':'<p>لم تُسجل أي مؤسسة مشتركة بعد. يمكنك إضافة أول مؤسسة في قسم «المؤسسات».</p>')+
 '</section><section class="portal-widget"><h3>مهام التفتيش المشتركة</h3>'+
 (missionEnabled?'<p>مهام تشارك فيها: '+missions.length+' — دعوات تنتظر ردك: '+
 missionMembers.filter(x=>x.inspector_id===session.user.id&&x.membership_status==='invited').length+'</p>':
 '<p>خدمة المهام المشتركة لم تُفعّل بعد.</p>')+
 '<button class="btn subtle" data-cloud-action="nav" data-page="missions">فتح مهام التفتيش</button></section></div>';
}
function institutionEditor(){
 const options=shared.map(x=>'<option value="'+elt(x.id)+'" '+(selectedSharedId===x.id?'selected':'')+'>'+
 elt(x.name+' — '+x.wilaya+(x.code?' ('+x.code+')':''))+'</option>').join('');
 const fields=INSTITUTION_EDITOR_FIELDS.map(([group,key,label])=>
 '<label class="portal-field">'+elt(label)+'<input type="'+(key==='email'?'email':'text')+
 '" data-cloud-field-group="'+group+'" data-cloud-field-key="'+key+'" value="'+elt(institutionDraft[group]?.[key]||'')+
 '" maxlength="'+(key==='name'?'300':'500')+'"></label>').join('');
 return '<div class="portal-page-heading"><h2>المؤسسات المشتركة</h2>'+
 '<p>يمكن لجميع المفتشين المعتمدين إضافة المؤسسات وتعديلها. يُسجل اسم معدّل البيانات وتفاصيل التغيير في السجل المركزي.</p></div>'+
 '<section class="portal-widget"><label class="portal-field">اختيار مؤسسة'+
 '<select id="cloud-select"><option value="">+ مؤسسة جديدة</option>'+options+'</select></label>'+
 '<div class="portal-actions"><button class="btn subtle" data-cloud-action="new-institution">مؤسسة جديدة</button>'+
 '<button class="btn subtle" data-cloud-action="refresh">تحديث البيانات</button></div></section>'+
 '<section class="portal-widget"><h3>'+(selectedSharedId?'تعديل بيانات المؤسسة ورئيسها':'إضافة مؤسسة جديدة')+'</h3>'+
 '<div class="portal-form-grid">'+fields+'</div>'+
 '<div class="portal-actions"><button class="btn primary" data-cloud-action="save">'+
 (selectedSharedId?'حفظ تعديلات المؤسسة':'إضافة المؤسسة إلى السجل المركزي')+'</button>'+
 (selectedSharedId?'<button class="btn subtle" data-cloud-action="load">فتح المؤسسة داخل محرر التقرير</button>':'')+
 '</div><p class="cloud-tip">لا يؤدي حفظ المؤسسة إلى حفظ أي مهمة تفتيش أو معاينات أو توصيات.</p></section>';
}
function colleaguesView(){
 const colleagues=profiles.filter(p=>p.approved);
 return '<div class="portal-page-heading"><h2>المفتشون الزملاء</h2><p>دليل مهني للمفتشين المعتمدين فقط.</p></div>'+
 '<div class="portal-directory">'+(colleagues.length?colleagues.map(p=>
 '<article class="portal-widget"><h3>'+elt(text(p.first_name+' '+p.last_name))+'</h3><p>'+
 elt(title(p.profession))+'</p><p>'+elt(p.email)+'</p>'+
 '<small>'+(p.id===session.user.id?'حسابي':'المراسلة المباشرة ستضاف في مرحلة لاحقة')+'</small></article>').join(''):'<p>لا يوجد زملاء معتمدون حاليًا.</p>')+'</div>';
}
function accountView(){
 return '<div class="portal-page-heading"><h2>حسابي</h2><p>بيانات الحساب المهني وحالته.</p></div>'+
 '<section class="portal-widget portal-profile">'+
 '<dl><dt>الاسم</dt><dd>'+elt(profile.first_name)+'</dd><dt>اللقب</dt><dd>'+elt(profile.last_name)+
 '</dd><dt>البريد الإلكتروني</dt><dd>'+elt(profile.email)+'</dd><dt>الصفة المهنية</dt><dd>'+elt(title(profile.profession))+
 '</dd><dt>المقاطعة</dt><dd>'+elt(profile.district||'غير محددة')+'</dd><dt>حالة الحساب</dt><dd>'+
 elt(accountStatusLabel(profile.account_status||'pending'))+'</dd><dt>إدارة المنصة</dt><dd>'+
 (profile.is_admin?'مسؤول الحسابات':'مفتش معتمد')+'</dd></dl>'+
 '<p class="cloud-tip">تعديل بيانات الملف المهني وكلمة المرور سيضاف في إصدار مستقل بعد تحديد قواعد تحديث الهوية والصفة.</p>'+
 '<div class="portal-actions"><button class="btn subtle" data-cloud-action="logout">تسجيل الخروج</button></div></section>';
}

function missionMemberName(id){
 const peer=profiles.find(p=>p.id===id);
 return peer?text(peer.first_name+' '+peer.last_name):'مفتش معتمد';
}
function missionStatusName(status){
 return {invited:'بانتظار الموافقة',accepted:'مشارك',declined:'اعتذر عن المشاركة'}[status]||status;
}
function missionsView(){
 const invited=missionMembers.filter(m=>m.inspector_id===session.user.id&&m.membership_status==='invited');
 const accepted=missions;
 const mission=accepted.find(m=>m.id===selectedMissionId);
 const availablePeers=profiles.filter(p=>p.approved===true&&p.account_status==='approved'&&
    p.id!==session.user.id&&(!mission||!missionMembers.some(m=>m.mission_id===mission.id&&m.inspector_id===p.id)));
 return '<div class="portal-page-heading"><h2>مهام التفتيش المشتركة</h2>'+
 '<p>أنشئ مهمة أو اختر مهمة قائمة، ثم افتح محرر التقرير 03 لإدخال المعاينات والتوصيات في مواضعها الرسمية.</p></div>'+
 (!missionEnabled?'<section class="portal-widget"><h3>الخدمة غير مفعّلة</h3><p>'+elt(missionError||'يجب تشغيل ترحيل SQL رقم 003 في Supabase.')+'</p>'+
 '<p>يمكنك الاستمرار في إعداد التقرير الفردي دون أي تغيير.</p></section>':
 '<div class="portal-widgets"><section class="portal-widget"><h3>إنشاء مهمة جديدة</h3>'+
 '<p class="helper">تُحفظ بيانات المهمة وأسماء المشاركين في Supabase. لا تُنقل إليها معاينات تقريرك المحلي.</p>'+
 '<div class="portal-fields">'+
 '<label class="portal-field">المؤسسة<select data-mission-field="institutionId"><option value="">— اختر مؤسسة مشتركة —</option>'+
 shared.map(i=>'<option value="'+elt(i.id)+'" '+(missionDraft.institutionId===i.id?'selected':'')+'>'+elt(i.name+' ('+i.code+')')+'</option>').join('')+
 '</select></label>'+
 '<label class="portal-field">عنوان المهمة<input data-mission-field="title" maxlength="200" value="'+elt(missionDraft.title)+'" placeholder="مثال: التفتيش المعمق لمؤسسة..."></label>'+
 '<label class="portal-field">الهدف<textarea data-mission-field="purpose" maxlength="3000" rows="3">'+elt(missionDraft.purpose)+'</textarea></label>'+
 '<label class="portal-field">تاريخ البداية<input type="date" data-mission-field="visitStart" value="'+elt(missionDraft.visitStart)+'"></label>'+
 '<label class="portal-field">تاريخ النهاية<input type="date" data-mission-field="visitEnd" value="'+elt(missionDraft.visitEnd)+'"></label></div>'+
 '<button type="button" class="btn primary" data-cloud-action="mission-create">إنشاء مهمة مشتركة</button></section>'+
 '<section class="portal-widget"><h3>الدعوات الواردة ('+invited.length+')</h3>'+
 (invited.length?invited.map(member=>{
  const event=missionNotifications.find(n=>n.mission_id===member.mission_id&&n.event_type==='invited');
  return '<article class="mission-invite"><strong>'+elt(event?.description||'دعوة إلى مهمة تفتيش')+'</strong>'+
   '<p>وصلتك دعوة من '+elt(missionMemberName(member.invited_by))+'</p>'+
   '<div class="portal-actions"><button class="btn primary" data-cloud-action="mission-respond" data-mission-id="'+elt(member.mission_id)+'" data-accept="true">قبول المشاركة</button>'+
   '<button class="btn subtle" data-cloud-action="mission-respond" data-mission-id="'+elt(member.mission_id)+'" data-accept="false">رفض الدعوة</button></div></article>';
 }).join(''):'<p>لا توجد دعوات تنتظر ردك.</p>')+'</section></div>'+
 '<section class="portal-widget"><h3>المهام التي تشارك فيها ('+accepted.length+')</h3>'+
 '<button type="button" class="btn subtle" data-cloud-action="mission-refresh">تحديث المهام والدعوات</button>'+
 (accepted.length?'<label class="portal-field">اختر مهمة<select id="mission-select"><option value="">— اختر مهمة —</option>'+
 accepted.map(m=>'<option value="'+elt(m.id)+'" '+(selectedMissionId===m.id?'selected':'')+'>'+elt(m.title+' — '+(m.institution_snapshot?.name||''))+'</option>').join('')+
 '</select></label>':'<p>لم تشارك في أي مهمة بعد.</p>')+
 (mission?'<div class="mission-detail"><h3>'+elt(mission.title)+'</h3><p>'+elt(mission.institution_snapshot?.name||'')+'</p>'+
 '<p>'+elt(mission.purpose||'لم يحدد الهدف')+'</p>'+
 '<p>الفترة: '+elt(mission.visit_start||'غير محددة')+' — '+elt(mission.visit_end||'غير محددة')+'</p>'+
 '<h4>أعضاء المهمة</h4><ul>'+missionMembers.filter(m=>m.mission_id===mission.id).map(m=>
  '<li>'+elt(missionMemberName(m.inspector_id))+' — '+elt(missionStatusName(m.membership_status))+'</li>').join('')+'</ul>'+
 '<label class="portal-field">دعوة مفتش معتمد آخر<select id="mission-peer"><option value="">— اختر الزميل —</option>'+
 availablePeers.map(p=>'<option value="'+elt(p.id)+'">'+elt(text(p.first_name+' '+p.last_name)+' — '+title(p.profession))+'</option>').join('')+'</select></label>'+
 '<button type="button" class="btn subtle" data-cloud-action="mission-invite" '+(!availablePeers.length?'disabled':'')+
 '>إرسال الدعوة</button>'+
 '<p class="cloud-tip">عضوية المهمة متساوية بين المفتشين. يتم تحرير المعاينات والتوصيات داخل المحرر الرسمي 03، وليس هنا.</p>'+
 '<button type="button" class="btn primary" data-cloud-action="open-mission-report">فتح المهمة في محرر التقرير 03</button></div>':'')+
 '</section>');
}
async function createMission(){
 if(!verifiedUser()||!missionEnabled)throw Error('خدمة المهام المشتركة غير جاهزة.');
 const d=missionDraft;
 if(!shared.some(x=>x.id===d.institutionId))throw Error('اختر مؤسسة موجودة في السجل المركزي.');
 if(text(d.title).length<3||text(d.title).length>200)throw Error('عنوان المهمة يجب أن يتكون من 3 إلى 200 حرف.');
 if(text(d.purpose).length>3000)throw Error('الهدف يتجاوز 3000 حرف.');
 if(d.visitStart&&d.visitEnd&&d.visitEnd<d.visitStart)throw Error('تاريخ النهاية يسبق تاريخ البداية.');
 const id=await raw('POST','/rest/v1/rpc/create_inspection_mission',{
  p_institution_id:d.institutionId,p_title:text(d.title),p_purpose:text(d.purpose),
  p_visit_start:d.visitStart||null,p_visit_end:d.visitEnd||null
 },true);
 if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('لم تُعد قاعدة البيانات معرّف مهمة صالحًا.');
 missionDraft={institutionId:'',title:'',purpose:'',visitStart:'',visitEnd:''};
 await loadMissions();
 selectedMissionId=id;
 await loadMissionContributions();
 feedback='أُنشئت المهمة. يمكنك الآن دعوة المفتشين المعتمدين.';
}
async function inviteMissionPeer(){
 if(!missionEnabled||!verifiedUser())throw Error('الحساب غير معتمد أو الخدمة غير مفعلة.');
 const m=missions.find(x=>x.id===selectedMissionId);
 if(!m||m.status!=='draft')throw Error('اختر مهمة مفتوحة تشارك فيها.');
 const id=text(document.getElementById('mission-peer')?.value);
 if(!profiles.some(x=>x.id===id&&x.approved===true&&x.account_status==='approved'&&x.id!==session.user.id))
  throw Error('اختر زميلًا معتمدًا من الدليل.');
 if(missionMembers.some(x=>x.mission_id===m.id&&x.inspector_id===id))
  throw Error('هذا المفتش مدعو أو مشارك سابقًا.');
 await raw('POST','/rest/v1/rpc/invite_inspection_member',{p_mission_id:m.id,p_inspector_id:id},true);
 await loadMissions();
 feedback='أُرسلت الدعوة إلى حساب الزميل؛ يتعين عليه قبولها قبل مشاهدة المهمة.';
}
async function respondMissionInvite(id,accept){
 if(!missionEnabled||!verifiedUser())throw Error('خدمة الدعوات غير متاحة.');
 if(!missionMembers.some(x=>x.mission_id===id&&x.inspector_id===session.user.id&&x.membership_status==='invited'))
  throw Error('لا توجد دعوة معلقة لهذا الحساب.');
 await raw('POST','/rest/v1/rpc/respond_inspection_invitation',{p_mission_id:id,p_accept:accept},true);
 await loadMissions();
 if(accept){selectedMissionId=id;await loadMissionContributions();}
 feedback=accept?'قُبلت الدعوة وأصبحت عضوًا في المهمة.':'رُفضت الدعوة.';
}
async function readMissionNotification(id){
 const n=missionNotifications.find(x=>x.id===id);
 if(!n||n.recipient_id!==session.user.id)throw Error('الإشعار غير موجود.');
 await submit('inspection_mission_notifications',{read_at:now()},
  {id:'eq.'+id,recipient_id:'eq.'+session.user.id,select:'id'},'PATCH');
 await loadMissions();
 feedback='تم تعليم إشعار المهمة كمقروء.';
}

function reservedView(page){
 const content={
 missions:['مهام التفتيش','سنضيف إنشاء المهام وربطها بالمؤسسات والمفتشين، وتحديد حالتها وتواريخها في مرحلة مستقلة.'],
 calendar:['الرزنامة الزمنية','ستعرض تواريخ المهام التي تُنشأ لاحقًا، دون إنشاء مواعيد افتراضية أو ادعاء وجود مهام محفوظة.'],
 teams:['فرق التفتيش','ستدعم مشاركة مفتشين متساوين في المهمة، مع توزيع المجالات والاقتراحات المتبادلة واعتمادها.'],
 messages:['المراسلات','تستلزم المراسلة والدردشة جداول رسائل وصلاحيات خاصة، ولم تفعّل بعد.']
 };
 const [name,explanation]=content[page]||['قيد التطوير','هذه الوظيفة غير متاحة بعد.'];
 return '<div class="portal-page-heading"><h2>'+name+'</h2></div><section class="portal-widget"><h3>قيد التطوير</h3><p>'+explanation+
 '</p><p>لم تُنشأ أي بيانات تجريبية باسم مفتش أو مهمة.</p></section>';
}
function notificationsView(){
 const unread=notifications.filter(x=>!x.read_at).length+missionNotifications.filter(x=>!x.read_at).length;
 return '<div class="portal-page-heading"><h2>الإشعارات</h2><p>'+unread+' غير مقروء</p></div>'+
 '<section class="portal-widget"><button class="btn subtle" data-cloud-action="refresh">تحديث الإشعارات</button>'+
 (notifications.length?notifications.slice(0,25).map(noticeCard).join(''):'<p>لا توجد إشعارات مؤسسات حاليًا.</p>')+
 '<h3>إشعارات المهام المشتركة</h3>'+
 (missionNotifications.length?missionNotifications.slice(0,40).map(n=>
 '<article class="portal-notice"><strong>'+elt(n.description)+'</strong><small>'+elt(n.created_at?.slice(0,10)||'')+'</small>'+
 (!n.read_at?'<button type="button" class="btn subtle" data-cloud-action="mission-read" data-notification-id="'+elt(n.id)+'">تعليم كمقروء</button>':'')+'</article>').join(''):
 '<p>لا توجد إشعارات مهام.</p>')+'</section>';
}
function guardedView(){
 const label=accountStatusLabel(profile?.account_status||'pending'),status=profile?.account_status||'pending';
 const msg=status==='rejected'?'تم رفض طلب التسجيل؛ لا يمكنك استعمال المنصة.':
  status==='suspended'?'تم تعليق هذا الحساب؛ لم يعد الوصول إلى المنصة مسموحًا.':
  'حسابك مسجل، ولكنه ينتظر اعتماد المسؤول قبل استخدام المنصة.';
 const reason=myDecisions?.[0]?.reason;
 return '<div class="portal-access-card"><div class="portal-page-heading"><h2>حالة الحساب: '+label+'</h2><p>'+
 elt(text(profile?.first_name+' '+profile?.last_name))+' — '+elt(profile?.email||'')+'</p></div>'+
 '<p class="cloud-warning">'+msg+'</p>'+(reason?'<p>سبب آخر قرار: '+elt(reason)+'</p>':'')+
 '<div class="portal-actions"><button class="btn subtle" data-cloud-action="refresh">التحقق من الحالة</button>'+
 '<button class="btn subtle" data-cloud-action="logout">تسجيل الخروج</button></div></div>';
}
function portalView(){
 const content=currentPage==='dashboard'?dashboardView():
  currentPage==='institutions'?institutionEditor():
  currentPage==='colleagues'?colleaguesView():
  currentPage==='missions'?missionsView():
  currentPage==='notifications'?notificationsView():
  currentPage==='account'?accountView():
  currentPage==='admin'&&profile.is_admin?renderAccountsManagement():
  reservedView(currentPage);
 return '<header class="portal-topbar"><div><strong>منصة التفتيش المعمق</strong>'+
 '<small>النموذج 03 — فضاء المفتشين المعتمدين</small></div>'+
 '<div class="session-controls portal-session-controls"><span class="session-name">'+elt(text(profile.first_name+' '+profile.last_name))+
 '</span><button type="button" class="btn session-logout" data-cloud-action="logout" aria-label="تسجيل الخروج من حساب المفتش">تسجيل الخروج</button></div>'+
 '</header><div class="portal-body">'+portalNavigation()+
 '<main class="portal-main" id="portal-main" tabindex="-1">'+content+
 '<p id="cloud-message" class="cloud-message" role="status" aria-live="polite">'+elt(feedback)+'</p></main></div>';
}
function render(){
 const app=document.getElementById('app');
 const approved=Boolean(session?.access_token&&verifiedUser());
 const report=approved&&currentPage==='report';
 if(app)app.hidden=!report;
 shell.hidden=report;
 // The report editor renders independently from the async Supabase login.
 // Refresh just its shared select options after sign-in/refresh/navigation,
 // never the entire report (which may contain unsaved field edits).
 // Only an approved Supabase profile may prefill the report's lead inspector.
 // The report editor guards imported and manually edited collaborator lists.
 if(approved)window.Report03CloudBridge?.prefillAccountInspector?.({
  first_name:profile.first_name,last_name:profile.last_name,
  profession:profile.profession,district:profile.district
 });
 if(report){window.Report03CloudBridge?.syncSharedInstitutionOptions?.();window.Report03CloudBridge?.syncReportColleagueOptions?.();}
 const reportUser=document.getElementById('report-user-name');
 const reportControls=document.getElementById('report-session-controls');
 if(reportControls)reportControls.hidden=!report;
 if(reportUser)reportUser.textContent=report?text(profile.first_name+' '+profile.last_name):'';
 const unreadEl=document.getElementById('cloud-unread');
 if(unreadEl)unreadEl.textContent=approved?String(notifications.filter(x=>!x.read_at).length+missionNotifications.filter(x=>!x.read_at).length):'';
 if(!configured){
  root.innerHTML='<div class="portal-access-card"><h2>تهيئة المنصة مطلوبة</h2><p>لا يمكن استعمال محرر التقارير دون حساب معتمد واتصال مصادقة. اتصل بمسؤول المنصة لإتمام إعداد الخدمة.</p></div>';
  return;
 }
 if(!session?.access_token){
  root.innerHTML='<div class="portal-auth-wrapper"><header><span class="portal-logo">03</span><h1>منصة التفتيش المعمق</h1><p>سجّل الدخول بحساب مفتش معتمد أو أرسل طلب تسجيل جديد.</p></header>'+
  '<div class="portal-auth-card">'+unauthenticatedView()+
  '<div id="cloud-message" class="cloud-message" role="status" aria-live="polite">'+elt(feedback)+'</div></div></div>';
  return;
 }
 if(!verifiedUser()){
  root.innerHTML=guardedView()+'<div id="cloud-message" class="cloud-message" role="status">'+elt(feedback)+'</div>';
  return;
 }
 root.innerHTML=portalView();
}
async function onAuthSubmit(event){
 event.preventDefault();if(busy)return;busy=true;
 const f=new FormData(event.target);const email=text(f.get('email')),password=String(f.get('password')||'');
 try{
  if(mode==='signup'){
   const first_name=text(f.get('first_name')),last_name=text(f.get('last_name'));
   const profession=text(f.get('profession'))||'IFEP',district=text(f.get('district'));
   if(!first_name||!last_name||!email||password.length<8)throw Error('أدخل البيانات المطلوبة وكلمة مرور من 8 رموز على الأقل.');
   const redirect=encodeURIComponent(location.origin+location.pathname);
   const result=await raw('POST','/auth/v1/signup?redirect_to='+redirect,
      {email,password,data:{first_name,last_name,profession,district}},false);
   if(result?.access_token){rememberSession(result);await fetchAll();feedback='تم إنشاء الحساب. تأكد من حالة الاعتماد المهني.'}
   else{feedback='تم طلب إنشاء الحساب. افتح بريدك الإلكتروني وأكد العنوان، ثم سجّل الدخول.';mode='login'}
  }else{
   const result=await raw('POST','/auth/v1/token?grant_type=password',{email,password},false);
   if(!result?.access_token)throw Error('لم تُرجع خدمة الحسابات جلسة صالحة');
   rememberSession(result);await fetchAll();feedback='تم تسجيل الدخول بنجاح.';
  }
 }catch(err){feedback='تعذر تنفيذ العملية: '+err.message}
 finally{busy=false;render()}
}
async function saveShared(){
 if(!verifiedUser())throw Error('الحساب غير معتمد');
 const data=institutionDraft;
 const i={},director={};
 for(const [group,field] of INSTITUTION_EDITOR_FIELDS){
  const dst=group==='institution'?i:director;
  dst[field]=text(data[group]?.[field]);
 }
 if(!text(i.name))throw Error('أدخل اسم المؤسسة قبل الحفظ المشترك');
 const baseRecord={name:text(i.name),wilaya:text(i.wilaya),code:text(i.code),
  institution_data:i,director_data:director,updated_by:session.user.id};
 let updated;
 if(selectedSharedId){
  const previous=shared.find(x=>x.id===selectedSharedId);if(!previous)throw Error('المؤسسة المحددة غير موجودة');
  if(editingVersion===null)throw Error('رقم نسخة المؤسسة غير معروف. أعد اختيار المؤسسة قبل الحفظ.');
  updated=await submit('shared_institutions',{...baseRecord,version:editingVersion+1},
   {id:'eq.'+previous.id,version:'eq.'+editingVersion,select:'id,name,version'},'PATCH');
  if(!updated.length)throw Error('تغيرت بيانات المؤسسة من طرف مفتش آخر. راجع أحدث نسخة قبل إعادة الحفظ؛ لم نمحُ كتابتك الحالية.');
 }else{
  updated=await submit('shared_institutions',{...baseRecord,created_by:session.user.id,version:1},
   {select:'id,name,version'},'POST');
 }
 await loadShared();
 useSharedInstitution(updated[0].id);
 feedback='حُفظت بيانات المؤسسة ورئيسها في السجل المشترك مع توثيق التغيير وإشعار المفتشين الآخرين.';
}
async function loadSelected(){
 const current=shared.find(x=>x.id===selectedSharedId);
 if(!current)throw Error('اختر مؤسسة محفوظة أولًا');
 const bridge=window.Report03CloudBridge;
 if(!bridge?.applyIdentity)throw Error('محرر المؤسسة غير متاح');
 const result=bridge.applyIdentity(current.institution_data,current.director_data,{sharedInstitutionId:current.id});
 if(!result?.ok)throw Error(result?.message||'تعذر تحميل المؤسسة الحالية');
 currentPage='report';
 feedback='حُمّلت المؤسسة ورئيسها إلى التقرير. لن تُغيَّر المعاينات الموجودة.';
}
async function markRead(id){
 await submit('institution_notifications',{read_at:now()},{id:'eq.'+id,recipient_id:'eq.'+session.user.id,select:'id'},'PATCH');
 await loadShared();feedback='تم تعليم الإشعار كمقروء.';
}
async function changeInspectorStatus(id,newStatus){
 if(!profile?.is_admin||!verifiedUser())throw Error('ليس لديك صلاحية إدارة الحسابات.');
 const person=profiles.find(p=>p.id===id);
 if(!person)throw Error('تعذر العثور على الحساب؛ حدّث القائمة.');
 const old=person.account_status||'pending';
 if(id===session.user.id||person.is_admin)throw Error('لا يمكن تغيير حالة الحساب الإداري من هذه الواجهة.');
 if(!(ACCOUNT_TRANSITIONS[old]||[]).some(([status])=>status===newStatus))throw Error('هذا الانتقال غير مسموح من الحالة الحالية.');
 const reasons=[...root.querySelectorAll('[data-decision-reason]')];
 const reason=text(reasons.find(x=>x.dataset.decisionReason===id)?.value||'');
 if(reason.length>1000)throw Error('سبب القرار يتجاوز 1000 حرف.');
 if(!confirm('تأكيد تغيير حالة حساب '+text(person.first_name+' '+person.last_name)+' من «'+accountStatusLabel(old)+'» إلى «'+accountStatusLabel(newStatus)+'»؟'))return;
 await raw('POST','/rest/v1/rpc/set_inspector_account_status',{
  p_user_id:id,p_new_status:newStatus,p_reason:reason||null
 },true);
 await fetchAll();
 feedback='تم تنفيذ القرار وتسجيل صاحبه وتاريخه في السجل.';
}
async function signOut(){
 if(Object.values(contributionDrafts).some(d=>text(d.body))&&
    !confirm('توجد مساهمات مشتركة مكتوبة ولم تُحفظ بعد. هل تريد تسجيل الخروج والتخلي عن هذه النصوص؟'))return;
 if(window.Report03CloudBridge?.prepareLogout?.()===false)return;
 try{await raw('POST','/auth/v1/logout',{},true)}catch(e){}
 session=null;profile=null;shared=[];notifications=[];profiles=[];changes=[];accountDecisions=[];myDecisions=[];activeReportMissionId='';sharedFieldEvents=[];sharedAssessmentEvents=[];sharedDataLoadedFor='';embeddedDrafts=Object.create(null);missions=[];missionMembers=[];missionNotifications=[];missionEnabled=false;missionError='';selectedMissionId='';missionContributions=[];contributionLoadedFor='';contributionError='';contributionDrafts=Object.create(null);selectedSharedId='';editingVersion=null;
 storageSet(null);currentPage='dashboard';institutionDraft={institution:{},director:{}};
 feedback='تم تسجيل الخروج، ومُسحت مسودة التقرير من ذاكرة التبويب. سجل المؤسسات المركزي محفوظ.';
}
// Report editor is outside the portal root: bind its header control to the
// exact same logout path and unsaved-report confirmation as the account page.

document.addEventListener('input',e=>{
 const itemId=e.target?.dataset?.sharedBody;
 if(itemId&&reportActive()){
  const d=sharedDraft(itemId);
  if(d.body!==e.target.value){d.body=e.target.value;d.requestId='';}
 }
});
document.addEventListener('change',async e=>{
 if(!reportActive())return;
 const kindItem=e.target?.dataset?.sharedKind;
 if(kindItem){const d=sharedDraft(kindItem);d.kind=e.target.value;d.requestId='';return;}
 const group=e.target?.dataset?.group,key=e.target?.dataset?.field;
 const assessment=e.target?.dataset?.assessment;
 if((group&&key)||assessment){
  if(group&&key&&!((group==='mission'&&['period','previousReports','monthYear'].includes(key))||
           (group==='summary'&&['generalAssessment','generalRecommendations'].includes(key))))return;
  const input=e.target;
  input.disabled=true;
  try{
   if(assessment)await saveSharedAssessment(assessment,input.value);
   else await saveSharedField(group,key,input.value);
   status('تم حفظ التعديل في المهمة المشتركة.');
  }catch(err){
   status('تعذر حفظ التعديل: '+err.message+'. حدّث المهمة وأعد المحاولة.');
   await loadSharedReportExtras();notifyReportEditor(true);
  }finally{input.disabled=false;}
 }
});
document.addEventListener('click',async e=>{
 const button=e.target?.closest?.('[data-shared-action]');
 if(!button||!reportActive()||sharedReportBusy)return;
 const action=button.dataset.sharedAction,id=button.dataset.itemId,parentId=button.dataset.parentId;
 if(action==='refresh'){
  sharedReportBusy=true;try{await loadSharedReportAll();status('تم تحديث مساهمات المهمة.');}
  catch(err){status('تعذر التحديث: '+err.message)}
  finally{sharedReportBusy=false}return;
 }
 if(action==='exit'){
  if(window.Report03CloudBridge?.exitSharedMission?.()){
   activeReportMissionId='';selectedMissionId='';currentPage='missions';render();
  }return;
 }
 if(!id||!catalogTargets().some(x=>x.id===id))return;
 const d=sharedDraft(id);
 if(action==='cancel'){d.kind='finding';d.parentId=null;d.requestId='';window.Report03CloudBridge?.rerenderShared?.();return;}
 if(action==='reply'||action==='correct'){
  const parent=missionContributions.find(x=>x.id===parentId&&x.item_id===id&&['finding','recommendation'].includes(x.kind));
  if(!parent){status('المساهمة الأصلية غير متاحة.');return;}
  if(action==='correct'&&parent.author_id!==session.user.id){status('لا يمكن تصحيح نص زميلك. استخدم التعقيب.');return;}
  d.kind=action==='reply'?'reply':'correction';d.parentId=parent.id;d.body='';d.requestId='';
  window.Report03CloudBridge?.rerenderShared?.();return;
 }
 if(action==='save'){
  sharedReportBusy=true;button.disabled=true;
  try{await saveEmbedded(id);status('حُفظت المساهمة باسمك في المهمة المشتركة.');}
  catch(err){status('فشل الحفظ: '+err.message)}
  finally{sharedReportBusy=false;button.disabled=false;}
 }
});

const reportLogout=document.getElementById('report-logout');
if(reportLogout)reportLogout.addEventListener('click',async()=>{
 if(busy||!verifiedUser())return;
 busy=true;reportLogout.disabled=true;
 try{await signOut()}
 catch(err){feedback='تعذر تسجيل الخروج: '+err.message}
 finally{busy=false;reportLogout.disabled=false;render()}
});
root.addEventListener('submit',e=>{if(e.target.id==='cloud-auth-form')onAuthSubmit(e)});
root.addEventListener('input',e=>{
 const contribField=e.target.dataset?.contribField;
 if(contribField&&['itemId','kind','body'].includes(contribField)){
  const d=contributionDraft();
  if(d&&d[contribField]!==e.target.value){
   if(d.parentId&&contribField==='itemId')return;
   d[contribField]=e.target.value;d.requestId='';
  }
 }
 const missionField=e.target.dataset?.missionField;
 if(missionField&&Object.hasOwn(missionDraft,missionField))missionDraft[missionField]=e.target.value;
 const group=e.target.dataset?.cloudFieldGroup,key=e.target.dataset?.cloudFieldKey;
 if(group&&key&&institutionDraft[group])institutionDraft[group][key]=e.target.value;
});
root.addEventListener('change',async e=>{
 if(e.target.id==='cloud-select'){useSharedInstitution(e.target.value);render();return}
 if(e.target.id==='mission-select'){
  selectedMissionId=missions.some(x=>x.id===e.target.value)?e.target.value:'';
  missionContributions=[];contributionLoadedFor='';contributionError='';
  // Preserve any unsent draft for the prior mission separately.
  await loadMissionContributions();render();return;
 }
 const contrib=e.target.dataset?.contribField;
 if(contrib&&['itemId','kind','body'].includes(contrib)){
  const d=contributionDraft();
  if(d&&d[contrib]!==e.target.value){
   if(d.parentId&&contrib==='itemId'){render();return}
   d[contrib]=e.target.value;d.requestId='';
  }
  if(contrib==='kind'&&!d.parentId&&['reply','correction'].includes(d.kind)){
   d.kind='finding';render();return;
  }
 }
 const field=e.target.dataset?.missionField;
 if(field&&Object.hasOwn(missionDraft,field))missionDraft[field]=e.target.value;
});
root.addEventListener('click',async e=>{
 const button=e.target.closest('[data-cloud-action]');if(!button||busy)return;
 const action=button.dataset.cloudAction;
 if(action==='mode-login'||action==='mode-signup'){mode=action==='mode-login'?'login':'signup';feedback='';render();return}
 if(action==='nav'){
  const page=button.dataset.page;
  if(page==='report'&&activeReportMissionId){
   if(!window.Report03CloudBridge?.exitSharedMission?.())return;
   activeReportMissionId='';
  }
  if(page==='admin'&&!profile?.is_admin)return;
  if(!verifiedUser())return;
  currentPage=page;feedback='';render();return;
 }
 if(action==='open-institution'){useSharedInstitution(button.dataset.institutionId);currentPage='institutions';feedback='';render();return}
 if(action==='new-institution'){useSharedInstitution('');feedback='';render();return}
 busy=true;button.disabled=true;
 try{
  if(action==='logout')await signOut();
  else if(action==='save')await saveShared();
  else if(action==='load')await loadSelected();
  else if(action==='refresh'){await fetchAll();feedback='القائمة والإشعارات محدثة.'}
  else if(action==='read')await markRead(button.dataset.notificationId);
  else if(action==='mission-create')await createMission();
  else if(action==='mission-invite')await inviteMissionPeer();
  else if(action==='mission-respond'){
   const accept=button.dataset.accept==='true';
   await respondMissionInvite(button.dataset.missionId,accept);
  }
  else if(action==='mission-refresh'){await loadMissions();feedback='المهام والدعوات محدّثة.'}
  else if(action==='mission-read')await readMissionNotification(button.dataset.notificationId);
  else if(action==='contribution-refresh'){await loadMissionContributions();feedback=contributionError?contributionError:'المساهمات المشتركة محدّثة.'}
  else if(action==='contribution-reply'){setContributionParent(button.dataset.contributionId,'reply');feedback='أضف تعقيبك ثم اضغط حفظ المساهمة.'}
  else if(action==='contribution-correct'){setContributionParent(button.dataset.contributionId,'correction');feedback='أدخل التصحيح الملحق بالمساهمة الأصلية.'}
  else if(action==='contribution-cancel-parent'){
   const d=contributionDraft();d.parentId=null;d.kind='finding';d.requestId='';
  }
  else if(action==='contribution-add')await appendContribution();
  else if(action==='open-mission-report')await enterMissionReport();
  else if(action==='set-status')await changeInspectorStatus(button.dataset.userId,button.dataset.newStatus);
 }catch(err){feedback='تعذر تنفيذ العملية: '+err.message}
 finally{busy=false;render()}
});
window.Report03CloudUI={
 activeSharedMissionId(){return reportActive()?activeReportMissionId:''},
 hasUnsentSharedDrafts(){return Object.entries(embeddedDrafts).some(([key,d])=>
  key.startsWith(activeReportMissionId+':')&&Boolean(text(d.body)));},
 getSharedReportPayload(){return effectiveSharedReport()},
 renderSharedEntry(id){return sharedEditorFor(id)},
 async prepareSharedExport(){return prepareSharedExport()},
 async refreshSharedReport(){await loadSharedReportAll();return effectiveSharedReport()},
 async exitSharedReport(){
  if(!reportActive())return true;
  const ok=window.Report03CloudBridge?.exitSharedMission?.();
  if(ok){activeReportMissionId='';currentPage='missions';render();}
  return Boolean(ok);
 },
 resetSelection(){
  selectedSharedId='';editingVersion=null;institutionDraft={institution:{},director:{}};
  if(verifiedUser())render();
 },
 showView(page){if(verifiedUser()){currentPage=page;render()}},
 getReportOwner(){
  if(!verifiedUser())return null;
  return {id:profile.id,first_name:profile.first_name,last_name:profile.last_name,
   profession:profile.profession,district:profile.district};
 },
 listReportColleagues(){
  if(!verifiedUser())return [];
  return profiles.filter(p=>p.approved===true&&p.id!==session?.user?.id)
   .map(p=>({id:p.id,first_name:p.first_name,last_name:p.last_name,
    profession:p.profession,district:p.district||''}));
 },
 findReportColleague(id){
  if(!verifiedUser())return null;
  const colleague=profiles.find(p=>p.id===id&&p.approved===true&&p.id!==session?.user?.id);
  return colleague?{id:colleague.id,first_name:colleague.first_name,last_name:colleague.last_name,
   profession:colleague.profession,district:colleague.district||''}:null;
 },
 listReportInstitutions(){
  if(!verifiedUser())return [];
  return shared.map(record=>({id:record.id,name:record.name,wilaya:record.wilaya,code:record.code}));
 },
 selectForReport(id){
  if(!verifiedUser())return {ok:false,message:'يلزم تسجيل الدخول بحساب مفتش معتمد.'};
  const record=shared.find(x=>x.id===id);
  if(!record)return {ok:false,message:'المؤسسة غير موجودة في القائمة الحالية؛ حدّث المؤسسات المشتركة.'};
  const bridge=window.Report03CloudBridge;
  if(!bridge?.applyIdentity)return {ok:false,message:'محرر التقرير غير جاهز.'};
  const result=bridge.applyIdentity(record.institution_data,record.director_data,{sharedInstitutionId:record.id});
  if(result?.ok)useSharedInstitution(record.id);
  return result||{ok:false,message:'تعذر تحميل بيانات المؤسسة.'};
 }
};
async function init(){
 render();if(!configured)return;
 try{
  loadStoredSession();
  await restoreUrlCredentials();
  if(session)await fetchAll();
 }catch(err){feedback='تعذر استعادة الجلسة: '+err.message}
 render();
}
document.addEventListener('DOMContentLoaded',init);
setInterval(async()=>{if(!verifiedUser()||busy||document?.hidden||pendingFieldSaves||sharedReportBusy)return;
 // Do not steal focus while a collaborator is typing an unsubmitted finding.
 if(currentPage==='missions'&&document.activeElement?.matches?.('[data-contrib-field]'))return;
 if(reportActive()&&document.activeElement?.matches?.('[data-shared-body],[data-group],[data-assessment]'))return;
 try{await fetchAll();render()}catch(e){status('تعذر تحديث الحساب والإشعارات مؤقتًا: '+e.message)}
},120000);
})();
