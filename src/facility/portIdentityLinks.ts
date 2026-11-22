import type { Project } from '../project';
import type { FloorPlan, FloorPort } from './model';
import { rackPortIndex, resolveFloorPort, patchPanelNumber, type IndexedRackPort } from './portLocations';
export const mappedPortId=(row:IndexedRackPort)=>row.equipment.databasePortIds?.[row.endpoint.port-(row.equipment.portStart??1)];
export function followPortReference(port:FloorPort,row:IndexedRackPort):FloorPort {
  return {...port,idfId:row.frame.id,patchPanelPort:port.patchPanelId?row.endpoint.port:patchPanelNumber(row.equipment,row.endpoint.port),
    ...(port.rackId&&{rackId:row.rack.id}),...(port.patchPanelId&&{patchPanelId:row.equipment.id})};
}
export const samePortReference=(a:FloorPort,b:FloorPort)=>a.idfId===b.idfId&&a.rackId===b.rackId&&a.patchPanelId===b.patchPanelId&&a.patchPanelPort===b.patchPanelPort;
export function followFloorPortIdentities(previous:Project,next:Project,floor:FloorPlan|null):FloorPlan|null {
  if(!floor)return floor;
  const oldIndex=rackPortIndex(previous),nextIndex=new Map(rackPortIndex(next).flatMap(row=>{const id=mappedPortId(row);return id?[[id,row] as const]:[];}));
  return {...floor,objects:floor.objects.map(object=>!object.ports?object:{...object,ports:object.ports.map(port=>{
    const old=resolveFloorPort(port,oldIndex),id=old&&mappedPortId(old),row=id?nextIndex.get(id):undefined;
    return row?followPortReference(port,row):port;
  })})};
}
