import type { ReactNode } from 'react';
import { portVlan, sameEndpoint, vlanColor, type Vlan } from '../model';
import type { IndexedRackPort } from './portLocations';

export function FloorPortConnectionCells({linked,vlans,empty=false,actions}:{linked:IndexedRackPort|null;vlans:readonly Vlan[];empty?:boolean;actions?:ReactNode}){
  const patched=!!linked&&linked.frame.layout.cables.some(c=>sameEndpoint(c.from,linked.endpoint)||sameEndpoint(c.to,linked.endpoint));
  const vlan=linked?portVlan(linked.frame.layout,linked.endpoint):null;
  const vlanName=vlans.find(v=>v.id===vlan)?.name;
  return <>
    <td>{!empty&&vlan!==null?<span className="floor-port-vlan" title={`${vlan}${vlanName?` — ${vlanName}`:''}`}><i className="floor-status-dot" style={{background:vlanColor(vlan,vlans)}}/>{vlan}</span>:<span className="floor-port-unused" title={!empty?(linked?'Unassigned VLAN':'No unique patch-panel link'):undefined}>—</span>}</td>
    <td>{empty?<span className="floor-port-unused">—</span>:<div className="floor-port-row-actions"><span className="floor-port-status" title={!linked?'No unique patch-panel match. Configure the IDF and patch-panel port under Termination & VLAN.':patched?'The linked patch-panel port has a rack cable connection.':'The linked patch-panel port has no rack cable connection.'}><i className={`floor-status-dot${patched?' status-verified':''}`}/>{!linked?'Not linked':patched?'Patched':'Unpatched'}</span>{actions}</div>}</td>
  </>;
}
