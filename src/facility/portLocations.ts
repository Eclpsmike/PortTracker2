import { endpointKey, firstPortNumber, patchPortDetails, portIndex, portNumbers, PORT_LOCATION_MAX, type Endpoint, type Equipment } from '../model';
import type { Project } from '../project';
import { formatPrefixedPortNumber } from '../portNumbering';
import { effectiveLocationId, type FloorObject, type FloorPlan, type FloorPort } from './model';

export const patchPanelNumber=(equipment:Equipment,port:number)=>equipment.firstNumber&&!equipment.portStartOverride&&firstPortNumber(equipment)===1?equipment.firstNumber+portIndex(equipment,port):port;
export function rackPortIndex(project:Project){
  return project.locations.flatMap(frame=>frame.layout.racks.flatMap(rack=>rack.equipment.filter(equipment=>equipment.kind==='patch-panel').flatMap(equipment=>portNumbers(equipment).map(port=>{
    const endpoint:Endpoint={rackId:rack.id,equipmentId:equipment.id,port};
    const number=patchPanelNumber(equipment,port);
    return {key:`${frame.id}/${endpointKey(endpoint)}`,frame,rack,equipment,endpoint,number,label:frame.portPrefix?formatPrefixedPortNumber(frame.portPrefix,number):String(number),details:patchPortDetails(frame.layout,endpoint)};
  }))));
}
export type IndexedRackPort=ReturnType<typeof rackPortIndex>[number];
export function resolveFloorPort(port:FloorPort,index:IndexedRackPort[]):IndexedRackPort|null{
  if(!port.idfId||port.patchPanelPort===undefined)return null;
  const candidates=index.filter(row=>row.frame.id===port.idfId&&(!port.rackId||row.rack.id===port.rackId)&&(!port.patchPanelId||row.equipment.id===port.patchPanelId));
  // Explicit panel references use that panel's endpoint numbers. Prefix-only
  // SMB setup uses facility numbering; never guess when several panels match.
  const direct=port.patchPanelId?candidates.filter(row=>row.endpoint.port===port.patchPanelPort):[];
  const matches=direct.length?direct:candidates.filter(row=>row.number===port.patchPanelPort);
  return matches.length===1?matches[0]:null;
}
export const sameLocation=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
export function unplacedLocationPorts(project:Project,plan:FloorPlan,locationName:string):IndexedRackPort[]{
  const index=rackPortIndex(project),placed=new Set(plan.objects.flatMap(object=>(object.ports??[]).flatMap(port=>{const row=resolveFloorPort(port,index);return row?[row.key]:[];})));
  return index.filter(row=>row.details.facilityLocation&&sameLocation(row.details.facilityLocation,locationName)&&!placed.has(row.key));
}

export interface LocationPort {
  key:string;
  linked:IndexedRackPort|null;
  placements:{object:FloorObject;port:FloorPort;number:number}[];
}
export function locationPorts(project:Project,plan:FloorPlan,location:FloorObject):LocationPort[]{
  const index=rackPortIndex(project),rows=new Map<string,LocationPort>(),placed=new Set<string>();
  for(const object of plan.objects){
    const inLocation=effectiveLocationId(plan,object)===location.id;
    for(const [i,port] of (object.ports??[]).entries()){
      const linked=resolveFloorPort(port,index);
      if(linked)placed.add(linked.key);
      if(!inLocation)continue;
      const key=linked?.key??`${object.id}/${port.id}`;
      const row=rows.get(key)??{key,linked,placements:[]};
      row.placements.push({object,port,number:i+1});rows.set(key,row);
    }
  }
  for(const linked of index){
    if(!placed.has(linked.key)&&linked.details.facilityLocation&&sameLocation(linked.details.facilityLocation,location.name)){
      rows.set(linked.key,{key:linked.key,linked,placements:[]});
    }
  }
  return [...rows.values()];
}

export function placedPortLocations(project:Project,plan:FloorPlan){
  const index=rackPortIndex(project),assignments=new Map<string,{row:IndexedRackPort;name:string}|null>();
  for(const object of plan.objects){
    const room=plan.objects.find(o=>o.kind==='location'&&o.id===effectiveLocationId(plan,object));
    const name=room?.name.trim();
    if(!name||name.length>PORT_LOCATION_MAX)continue;
    for(const port of object.ports??[]){
      const row=resolveFloorPort(port,index);if(!row)continue;
      const previous=assignments.get(row.key);
      assignments.set(row.key,previous===null||previous&&!sameLocation(previous.name,name)?null:{row,name});
    }
  }
  return assignments;
}

// A placed endpoint's effective map location is authoritative. Duplicate links
// in different rooms remain unresolved rather than choosing an arbitrary room.
export function syncPlacedPortLocations(project:Project,plan:FloorPlan):Project{
  const assignments=placedPortLocations(project,plan);
  let next=project;
  for(const assignment of assignments.values()){
    if(!assignment)continue;
    const {row,name}=assignment,catalog=next.configuration.facilityLocations??[];
    const canonical=catalog.find(location=>sameLocation(location.name,name));
    if(row.details.facilityLocation===(canonical?.name??name))continue;
    next={...next,configuration:canonical?next.configuration:{...next.configuration,facilityLocations:[...catalog,{name,color:'#159de7'}]},locations:next.locations.map(frame=>frame.id!==row.frame.id?frame:{...frame,layout:{...frame.layout,portDetails:{...frame.layout.portDetails,[endpointKey(row.endpoint)]:{...row.details,facilityLocation:canonical?.name??name}}}})};
  }
  return next;
}
