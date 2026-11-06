/* QA-only professional data hydration for a chair's actual report/minutes.
 * Source: the RLS-authenticated inspector profile federated from the main
 * platform. Never replace text the chair already authored or infer absent
 * contact/office information. Do not store any authentication tokens here. */
import {inspectorProfileDefaults} from "./workspace-sources.mjs";
import {editMeta,restoreCommittee} from "../prototypes/titularisation-committee/committee-engine.mjs";

const FIELDS=Object.freeze([
 ["chairName","اسم رئيس اللجنة"],
 ["inspectorDistrict","المقاطعة التقنية والبيداغوجية"],
 ["inspectorEmail","البريد الإلكتروني للمفتش"]
]);
export function hydrateReportInspectorFromVerifiedProfile(report,profile){
 const defaults=inspectorProfileDefaults(profile);
 let result=restoreCommittee(report);
 const filled=[];
 for(const [key,label] of FIELDS){
  const value=typeof defaults[key]==="string"?defaults[key].trim():"";
  if(value&&!String(result.meta[key]||"").trim()){
   result=editMeta(result,key,value);
   filled.push(label);
  }
 }
 return {state:result,filled,sourceAvailable:Object.values(defaults).some(v=>Boolean(v))};
}
