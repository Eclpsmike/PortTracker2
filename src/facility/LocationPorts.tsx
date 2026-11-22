import type { Project } from '../project';
import type { FloorObject, FloorPlan } from './model';
import { facilityPortLabel } from './portLabels';
import { locationPorts } from './portLocations';
import { FloorPortConnectionCells } from './FloorPortConnectionCells';

export function LocationPorts({project,plan,location}:{project:Project;plan:FloorPlan;location:FloorObject}){
  const ports=locationPorts(project,plan,location);
  return <details className="floor-property-accordion floor-location-ports" key={location.id}>
    <summary>Ports <span>{ports.length}</span></summary>
    <div className="floor-location-ports-content">
      {ports.length?<div className="floor-location-ports-scroll"><table className="floor-smb-port-table floor-location-port-table" aria-label="Location ports">
        <thead><tr><th scope="col">Port</th><th scope="col">Label</th><th scope="col">VLAN</th><th scope="col">Patch status</th></tr></thead>
        <tbody>{ports.map((row,i)=>{
          const placement=row.placements[0];
          const label=row.linked?.label??facilityPortLabel(placement.port,project);
          const source=row.placements.length?row.placements.map(p=>`${p.object.name} · Port ${p.number}`).join(', '):`Unplaced · ${row.linked!.frame.name} / ${row.linked!.rack.label} / ${row.linked!.equipment.label}`;
          return <tr key={row.key}>
            <th scope="row">{i+1}</th><td><span>{label}</span><small>{source}</small></td>
            <FloorPortConnectionCells linked={row.linked} vlans={project.configuration.vlans}/>
          </tr>;
        })}</tbody>
      </table></div>:<p className="floor-hint">No ports in this location.</p>}
    </div>
  </details>;
}
