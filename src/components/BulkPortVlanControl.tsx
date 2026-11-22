import { useState } from 'react';
import { type Endpoint, type Layout, type Vlan, portVlan, isNetworkPort, resolveEndpoint } from '../model';

export function BulkPortVlanControl({ layout, endpoints, vlans, onApply }: {
  layout: Layout; endpoints: readonly Endpoint[]; vlans: readonly Vlan[];
  onApply: (vlan: number | null) => void;
}) {
  const [target, setTarget] = useState('');
  const switchPorts = endpoints.filter(endpoint => resolveEndpoint(layout, endpoint).equipment.kind === 'switch' && isNetworkPort(layout, endpoint));
  if (!switchPorts.length) return null;
  const assignments = new Set(switchPorts.map(endpoint => portVlan(layout, endpoint)));
  const current = assignments.values().next().value;
  const validTarget = target === 'clear' || vlans.some(v => String(v.id) === target);
  return <section className="port-vlan-control bulk-port-vlan" aria-label="Bulk port VLAN assignment">
    <p className="bulk-current-vlan">{!endpoints.length ? 'Select ports above to assign a VLAN.' : assignments.size > 1 ? 'Current VLANs: mixed assignments' : current === null ? 'Current VLAN: unassigned' : `Current VLAN: ${current} — ${vlans.find(v => v.id === current)?.name}`}</p>
    {switchPorts.length > 0 && <><label>VLAN for selected ports<select value={validTarget ? target : ''} onChange={event => setTarget(event.target.value)}>
      <option value="" disabled>Choose a VLAN…</option>
      <option value="clear">Unassigned — clear VLAN</option>
      {vlans.map(v => <option key={v.id} value={v.id}>{v.id} — {v.name}</option>)}
    </select></label>
    <button className="primary-button full-width" disabled={!validTarget} onClick={() => onApply(target === 'clear' ? null : Number(target))}>Apply to {switchPorts.length} selected {switchPorts.length === endpoints.length ? '' : 'switch '}{switchPorts.length === 1 ? 'port' : 'ports'}</button></>}
    {switchPorts.length < endpoints.length && <p className="note">Only Ethernet switch ports are changed. Patch panels inherit VLANs; serial console ports have no VLAN.</p>}
    {switchPorts.length > 0 && <p className="note">Changes selected switch ports and updates the VLAN shown on their connected patch-panel ports.</p>}
    {!!switchPorts.length && !vlans.length && <a href="#/configuration/vlans">Configure a VLAN to assign</a>}
  </section>;
}
