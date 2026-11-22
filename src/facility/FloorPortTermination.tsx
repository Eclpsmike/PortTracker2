import { interfaceName, portVlan, resolveEndpoint, sameEndpoint } from '../model';
import { projectLayout, type Project } from '../project';
import { rackPortLabel } from '../rackSearch';
import type { FloorPort } from './model';
import { resolveFloorPort, type IndexedRackPort } from './portLocations';

export function FloorPortTermination({project,port,index,onChange}:{project:Project;port:FloorPort;index:IndexedRackPort[];onChange:(patch:Partial<FloorPort>)=>void}) {
  const row=resolveFloorPort(port,index);
  const layout=row?projectLayout(project,row.frame.id):null;
  const cable=row?.frame.layout.cables.find(c=>sameEndpoint(c.from,row.endpoint)||sameEndpoint(c.to,row.endpoint));
  const peer=cable&&row?(sameEndpoint(cable.from,row.endpoint)?cable.to:cable.from):null;
  const equipment=layout&&peer?resolveEndpoint(layout,peer).equipment:null;
  const switchPort=equipment?.kind==='switch'&&peer&&layout
    ?interfaceName(layout,equipment,peer.port)||rackPortLabel(layout,peer):null;
  const vlan=row?portVlan(row.frame.layout,row.endpoint):null;
  const vlanName=project.configuration.vlans.find(v=>v.id===vlan)?.name;
  const fields=[
    ['Rack',row?.rack.label??'Not linked'],
    ['Patch panel',row?.equipment.label??'Not linked'],
    ['Patch panel port',row?.label??'Not linked'],
    ['Switch',equipment?.kind==='switch'?equipment.label:cable?'Not connected to a switch':'Unpatched'],
    ['Switch port',switchPort??'—'],
    ['VLAN',vlan===null?'Unassigned':`${vlan}${vlanName?` — ${vlanName}`:''}`],
  ];
  return <details className="floor-termination">
    <summary>Termination &amp; VLAN <span>From rack</span></summary>
    <dl className="floor-port-rack-details" aria-label="Linked rack details">
      {fields.map(([name,value])=><div key={name}><dt>{name}</dt><dd>{!row&&(name==='Switch'||name==='VLAN')?'Not linked':value}</dd></div>)}
    </dl>
    <details className="floor-port-link-editor" key={port.id} open={!row}>
      <summary>{row?'Change patch-panel link':'Link patch-panel port'}</summary>
      <label>IDF / distribution frame<select aria-label="IDF / distribution frame" value={port.idfId??''} onChange={event=>onChange({idfId:event.target.value||undefined,rackId:undefined,patchPanelId:undefined,switchId:undefined,switchPort:undefined,vlanId:undefined})}>
        <option value="">Select IDF / MDF</option>
        {project.locations.map(frame=><option key={frame.id} value={frame.id}>{frame.name}{frame.portPrefix?` · ${frame.portPrefix}`:''}</option>)}
        {port.idfId&&!project.locations.some(frame=>frame.id===port.idfId)&&<option value={port.idfId}>{port.idfId} · unavailable</option>}
      </select></label>
      <label>Patch-panel port<select aria-label="Linked patch-panel port" value={row?.key??(port.patchPanelPort!==undefined?'__unresolved':'')} disabled={!port.idfId} onChange={event=>{
        const selected=index.find(candidate=>candidate.key===event.target.value);
        onChange({rackId:selected?.rack.id,patchPanelId:selected?.equipment.id,patchPanelPort:selected?.endpoint.port,switchId:undefined,switchPort:undefined,vlanId:undefined});
      }}>
        <option value="">Select patch-panel port</option>
        {!row&&port.patchPanelPort!==undefined&&<option value="__unresolved" disabled>Port {port.patchPanelPort} · no unique match</option>}
        {index.filter(candidate=>candidate.frame.id===port.idfId).map(candidate=><option key={candidate.key} value={candidate.key}>{candidate.label} · {candidate.rack.label} / {candidate.equipment.label}</option>)}
      </select></label>
    </details>
  </details>;
}
