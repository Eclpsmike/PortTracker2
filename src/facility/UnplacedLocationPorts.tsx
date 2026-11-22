import type { Project } from '../project';
import type { FloorPlan } from './model';
import { unplacedLocationPorts } from './portLocations';

export function UnplacedLocationPorts({project,plan,name}:{project:Project;plan:FloorPlan;name:string}){
  const ports=unplacedLocationPorts(project,plan,name);
  return <section className="floor-unplaced-objects" aria-label="Unplaced objects">
    <h4>Unplaced objects <span>{ports.length}</span></h4>
    <p className="floor-hint">Rack ports assigned to {name} that are not linked to an item on this map.</p>
    {ports.length?<div className="floor-unplaced-scroll"><table aria-label="Unplaced ports"><thead><tr><th>Port</th><th>Equipment</th></tr></thead><tbody>{ports.map(row=><tr key={row.key}><th scope="row">{row.label}</th><td>{row.frame.name}<small>{row.rack.label||row.rack.id} · {row.equipment.label||row.equipment.id}</small>{row.details.notes&&<small>{row.details.notes}</small>}</td></tr>)}</tbody></table></div>:<p className="floor-hint">No unplaced ports in this location.</p>}
  </section>;
}
