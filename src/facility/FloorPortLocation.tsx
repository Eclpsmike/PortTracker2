import type { Project } from '../project';
import { effectiveLocationId, type FloorObject, type FloorPlan, type FloorPort } from './model';
import { rackPortIndex, resolveFloorPort, sameLocation } from './portLocations';

export function FloorPortLocation({project,plan,object,port}:{project:Project;plan:FloorPlan;object:FloorObject;port:FloorPort}){
  if(!port.idfId||port.patchPanelPort===undefined)return null;
  const row=resolveFloorPort(port,rackPortIndex(project));
  if(!row)return <p className="floor-hint">No unique patch-panel match. Choose the linked patch-panel port under Termination &amp; VLAN.</p>;
  const room=plan.objects.find(o=>o.id===effectiveLocationId(plan,object));
  const rackLocation=row.details.facilityLocation;
  return <div className="floor-port-location"><span className="floor-hint" title="The item's map location updates this linked patch-panel port's rack location.">Rack location: <strong>{rackLocation||'Unassigned'}</strong></span>{room&&rackLocation&&!sameLocation(room.name,rackLocation)&&<p className="floor-warning">Location mismatch: this item is in {room.name} on the map, but its rack port is assigned to {rackLocation}. Check for another map item linked to the same port.</p>}</div>;
}
