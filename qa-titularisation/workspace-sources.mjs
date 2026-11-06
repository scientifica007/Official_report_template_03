/* P0 — inspector-owned QA workbench.
 * This module is presentation logic only. Database RLS and the draft-save RPC
 * remain authoritative for permissions and published institution IDs. */
export const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function orderQAWorkMissions(missions=[]){
 return [...missions].sort((a,b)=>{
  const rank=m=>m.status==="draft"?0:1;
  if(rank(a)!==rank(b))return rank(a)-rank(b);
  return Date.parse(b.created_at||"1970-01-01")-
    Date.parse(a.created_at||"1970-01-01");
 });
}
export function inspectorProfileDefaults(profile){
 if(!profile||profile.approved!==true||
   profile.account_status!=="approved"||profile.is_admin===true)return {};
 const name=[profile.first_name,profile.last_name]
  .filter(x=>typeof x==="string"&&x.trim())
  .map(x=>x.trim()).join(" ");
 return {
  chairName:name,
  inspectorEmail:typeof profile.email==="string"?profile.email.trim():"",
  // QA's professional district label is informational, not an assignment or
  // a substitute for the admin-managed work_district_id.
  inspectorDistrict:typeof profile.district==="string"?profile.district.trim():""
 };
}
export function publishedQAInstitutionChoices(rows=[]){
 if(!Array.isArray(rows))return [];
 const seen=new Set();
 return rows.filter(r=>{
  if(!r||r.publication_status!=="published"||
    r.resource_kind!=="institution"||
    typeof r.id!=="string"||!UUID.test(r.id)||
    typeof r.title!=="string"||!r.title.trim()||seen.has(r.id))return false;
  seen.add(r.id);return true;
 }).map(r=>({id:r.id,title:r.title,code:r.code||"",wilaya:r.wilaya||""}))
 .sort((a,b)=>a.title.localeCompare(b.title,"ar"));
}
export function resolveQAInstitutionSelection(resources,resourceId){
 if(!resourceId)return null;
 return publishedQAInstitutionChoices(resources)
  .find(r=>r.id===resourceId)||null;
}
