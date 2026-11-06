/* P0.3 QA — one mission, one source of candidate/institution/chair metadata.
 * The persisted value is the existing titularisation_report_drafts.payload,
 * NOT a parallel metadata table or a browser-only copy.
 * All functions are pure; authorization and CAS live in Supabase RPC. */
import {RUBRICS,sameWeightProfile} from "../prototypes/titularisation-workbench/engine.mjs";
import {restoreCommittee,editMeta,stringifyCommittee}
 from "../prototypes/titularisation-committee/committee-engine.mjs";
import {prepareCloudCommitteeDraft}
 from "../prototypes/titularisation-committee/committee-cloud-bridge.mjs";
import {inspectorProfileDefaults,UUID} from "./workspace-sources.mjs";

export const MISSION_CONTEXT_FIELDS=Object.freeze([
 {key:"familyName",label:"لقب الأستاذ المترشح"},
 {key:"givenName",label:"اسم الأستاذ المترشح"},
 {key:"institution",label:"مؤسسة إجراء الترسيم"},
 {key:"rank",label:"الرتبة"},
 {key:"date",label:"تاريخ الترسيم"},
 {key:"location",label:"مكان إجراء الترسيم"},
 {key:"session",label:"بيانات الجلسة"},
 {key:"chairName",label:"اسم رئيس اللجنة"}
]);
const seatMeta=Object.freeze({member1:"member1Name",member2:"member2Name",member3:"member3Name"});

export function missionContextDraft(mission,saved){
 if(!mission?.id||!mission.rubric_id)throw Error("بيانات مهمة الترسيم غير مكتملة.");
 const s=saved?.payload?restoreCommittee(saved.payload):prepareCloudCommitteeDraft(mission);
 if(s.rubricId!==mission.rubric_id||
   (s.rubricId===RUBRICS.analytical14.id&&
    !sameWeightProfile(s.final.grading.profile,mission.rubric_profile)))
  throw Error("مسودة المهمة لا تطابق شبكة التقييم وأوزانها المعتمدة.");
 return s;
}
export function applyMissionContextFields(state,values,seats=[],profile=null){
 if(!values||typeof values!=="object"||Array.isArray(values))throw Error("بيانات المهمة غير صالحة.");
 const allowed=new Set([...MISSION_CONTEXT_FIELDS.map(f=>f.key),"institutionResourceId"]);
 if(Object.keys(values).some(key=>!allowed.has(key)))
  throw Error("حقل إضافي غير صالح في بيانات المهمة.");
 let next=restoreCommittee(state);
 const previous=next.meta;
 for(const {key} of MISSION_CONTEXT_FIELDS){
  const value=values[key];
  if(typeof value!=="string"||value.length>300)
   throw Error("بيانات "+key+" غير صالحة.");
  if(value!==next.meta[key])next=editMeta(next,key,value);
 }
 // Candidate is a compatibility alias for the report/minutes heading; do
 // not guess how to split an older unsplit name. Only rebuild it when a
 // separate given/family name has actually changed.
 if((values.givenName!==previous.givenName||
     values.familyName!==previous.familyName)&&
    (values.givenName.trim()||values.familyName.trim())){
  const full=[values.familyName.trim(),values.givenName.trim()].filter(Boolean).join(" ");
  if(full!==next.meta.candidate)next=editMeta(next,"candidate",full);
 }
 // An optional catalog ID is persisted in the SAME report draft, not in a
 // duplicate institution record. Old JSON files simply have an empty ID.
 if(values.institutionResourceId!==undefined){
  const ref=values.institutionResourceId;
  if(typeof ref!=="string"||(ref!==""&&!UUID.test(ref)))
   throw Error("معرّف المؤسسة المشتركة غير صالح.");
  if(ref!==next.meta.institutionResourceId)
   next=editMeta(next,"institutionResourceId",ref);
 }
 // Profile defaults come only from an approved non-Admin QA inspector profile.
 // Never overwrite an inspector-authored value or infer a district assignment.
 const defaults=inspectorProfileDefaults(profile);
 for(const key of ["inspectorEmail","inspectorDistrict"]){
  if(!next.meta[key]&&defaults[key])
   next=editMeta(next,key,defaults[key]);
 }
 // Seat identity is controlled by the committee invitation, not a second
 // identity editor. Existing chair-authored names must never be erased.
 for(const seat of seats){
  const key=seatMeta[seat?.seat_code];
  const label=typeof seat?.display_name==="string"?seat.display_name.trim():"";
  if(key&&label&&!next.meta[key])next=editMeta(next,key,label);
 }
 return restoreCommittee(next);
}
export function serializeMissionContext(state){
 return JSON.parse(stringifyCommittee(state));
}
