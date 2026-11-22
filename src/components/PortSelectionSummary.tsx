import { equipmentName, endpointKey, isNetworkPort, portPhysicalLabel, interfaceName, patchPortDetails, portVlan, rackName, resolveEndpoint, sameEndpoint, PORT_NOTES_MAX, type Endpoint, type Layout, type Vlan } from '../model';
import { rackPortLabel } from '../rackSearch';

interface Props {
  layout: Layout; endpoints: Endpoint[]; vlans: readonly Vlan[]; frameName: string; portPrefix?: string;
  onDeselect: (endpoint: Endpoint) => void;
  onClear: () => void;
  onNotesChange: (endpoint: Endpoint, notes: string) => void;
}
export function PortSelectionSummary({layout, endpoints, vlans, frameName, portPrefix, onDeselect, onClear, onNotesChange}: Props) {
  const rows=endpoints.map(endpoint=>{
    const {equipment}=resolveEndpoint(layout,endpoint);
    const cable=layout.cables.find(c=>sameEndpoint(c.from,endpoint)||sameEndpoint(c.to,endpoint));
    const other=cable?(sameEndpoint(cable.from,endpoint)?cable.to:cable.from):null;
    const assigned=portVlan(layout,endpoint),vlan=vlans.find(v=>v.id===assigned);
    const label=rackPortLabel(layout,endpoint,portPrefix),details=patchPortDetails(layout,endpoint);
    const patchEndpoint=equipment.kind==='patch-panel'?endpoint:other&&resolveEndpoint(layout,other).equipment.kind==='patch-panel'?other:null;
    const patchLocation=patchEndpoint?patchPortDetails(layout,patchEndpoint).facilityLocation:'';
    return {network:isNetworkPort(layout,endpoint),endpoint,label,equipment,cable,other,otherLabel:other?rackPortLabel(layout,other,portPrefix):null,otherIsPanel:!!other&&resolveEndpoint(layout,other).equipment.kind==='patch-panel',patchLocation,assigned,vlan,details,media:portPhysicalLabel(layout,endpoint),interface:interfaceName(layout,equipment,endpoint.port)};
  });
  if(!rows.length)return <p className="note port-selection-empty">Select ports on the rack or use Choose ports below.</p>;
  const mixedDevices=new Set(rows.map(row=>`${row.endpoint.rackId}/${row.endpoint.equipmentId}`)).size>1;
  if(rows.length===1){
    const row=rows[0];
    return <section className="selected-port-info port-inspection-card" aria-label="Selected port details">
      <div className="port-selection-heading"><span className="eyebrow">SELECTED PORT</span><button type="button" className="text-button" onClick={onClear}>Clear selection</button></div>
      <strong>{equipmentName(layout,row.endpoint)} / Port {row.label}</strong>
      {row.equipment.label!==row.equipment.id&&<span>Equipment ID: {row.equipment.id}</span>}
      <span className={`port-inspection-status ${row.cable?'connected':'available'}`}>{!row.network?'Serial console':row.cable?'Connected':'Available'}</span>
      <dl>
        <div><dt>Frame</dt><dd>{frameName}</dd></div>
        <div><dt>Rack</dt><dd>{rackName(layout,row.endpoint.rackId)}</dd></div>
        {row.interface&&<div><dt>Interface</dt><dd>{row.interface}</dd></div>}
        {row.network&&<div><dt>VLAN</dt><dd>{row.assigned===null?'Unassigned':`${row.assigned}${row.vlan?` — ${row.vlan.name}`:''}`}</dd></div>}
        <div><dt>Media</dt><dd>{row.media}</dd></div>
        <div><dt>Patch location</dt><dd>{row.patchLocation||'Unassigned'}</dd></div>
        <div><dt>Connection</dt><dd>{row.cable&&row.other?<>{rackName(layout,row.other.rackId)} · {equipmentName(layout,row.other)} / Port {row.otherLabel}</>:'No cable assigned'}</dd></div>
        <div><dt>Notes</dt><dd className="port-inspection-notes"><textarea key={endpointKey(row.endpoint)} aria-label="Port notes" rows={2} maxLength={PORT_NOTES_MAX} placeholder="Add notes…" title="Saved automatically for this port" value={row.details.notes} onChange={event => onNotesChange(row.endpoint, event.target.value)}/></dd></div>
      </dl>
    </section>;
  }
  return <section className="selected-ports-summary" aria-label="Selected ports">
    <div className="port-selection-heading"><h3 aria-live="polite">{rows.length} selected ports</h3><button type="button" className="text-button" onClick={onClear}>Clear selection</button></div>
    <p>{mixedDevices?`${frameName} · Multiple devices`:`${rackName(layout,rows[0].endpoint.rackId)} · ${equipmentName(layout,rows[0].endpoint)}`}</p>
    <div className="selected-ports-table-scroll" tabIndex={0} role="region" aria-label="Selected ports table">
      <table className="selected-ports-table" aria-label="Selected ports"><thead><tr><th scope="col">Port / connection</th><th scope="col">VLAN</th><th scope="col">Patch location</th><th scope="col"><span className="sr-only">Selection</span></th></tr></thead>
        <tbody>{rows.map(row=><tr key={endpointKey(row.endpoint)} data-selected-port={endpointKey(row.endpoint)}>
          <th scope="row">{mixedDevices&&<small className="selected-port-device">{equipmentName(layout,row.endpoint)}<br/>{rackName(layout,row.endpoint.rackId)}</small>}<strong title={row.interface||undefined}>{row.label}</strong>{row.other&&<small className="port-patch-target" title={`${equipmentName(layout,row.other)} / Port ${row.otherLabel}`}>{row.otherIsPanel?'Patch':'To'} {row.otherLabel}</small>}<small>{!row.network?'Serial console':row.cable?'Connected':'Available'}</small><small>{row.media}</small></th>
          <td title={row.vlan?.name}>{row.assigned??'—'}</td>
          <td>{row.patchLocation||'Unassigned'}</td>
          <td><button type="button" className="text-button" aria-label={`Deselect port ${row.label}${mixedDevices?` on ${equipmentName(layout,row.endpoint)} in ${rackName(layout,row.endpoint.rackId)}`:''}`} onClick={()=>onDeselect(row.endpoint)}>×</button></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
