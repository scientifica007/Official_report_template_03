// P0 — mission-bound navigation between the QA inspector dashboard and
// the report/minutes editor. A mission ID is a locator, NEVER a bearer token.
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function validMissionId(value){
 return typeof value==="string"&&UUID.test(value);
}
export function returnToQAMissionHref(missionId){
 return validMissionId(missionId)?
  "../?mission="+encodeURIComponent(missionId)+"#qa-mission-context":"../";
}
export function selectQAMission(missions,current,requested){
 const exists=id=>validMissionId(id)&&missions.some(m=>m.id===id);
 if(exists(current))return current;
 if(exists(requested))return requested;
 return missions[0]?.id||"";
}
