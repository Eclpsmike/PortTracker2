import { useState } from 'react';
import { type Endpoint, type Layout, type Vlan, portVlan } from '../model';

export function BulkPortVlanControl({ layout, endpoints, vlans, onApply }: {
  layout: Layout; endpoints: readonly Endpoint[]; vlans: readonly Vlan[];
  onApply: (vlan: number | null) => void;
}) {
  const [target, setTarget] = useState('');
  const assignments = new Set(endpoints.map(endpoint => portVlan(layout, endpoint)));
  const current = assignments.values().next().value;
  const validTarget = target === 'clear' || vlans.some(v => String(v.id) === target);
  return <section className="port-vlan-control bulk-port-vlan" aria-label="Bulk port VLAN assignment">
    <p className="bulk-current-vlan">{!endpoints.length ? 'Select ports above to assign a VLAN.' : assignments.size > 1 ? 'Current VLANs: mixed assignments' : current === null ? 'Current VLAN: unassigned' : `Current VLAN: ${current} — ${vlans.find(v => v.id === current)?.name}`}</p>
    <label>VLAN for selected ports<select value={validTarget ? target : ''} onChange={event => setTarget(event.target.value)}>
      <option value="" disabled>Choose a VLAN…</option>
      <option value="clear">Unassigned — clear VLAN</option>
      {vlans.map(v => <option key={v.id} value={v.id}>{v.id} — {v.name}</option>)}
    </select></label>
    <button className="primary-button full-width" disabled={!endpoints.length || !validTarget} onClick={() => onApply(target === 'clear' ? null : Number(target))}>Apply to {endpoints.length} selected {endpoints.length === 1 ? 'port' : 'ports'}</button>
    <p className="note">Changes port assignments, including connected ports. Cable VLANs stay unchanged. Port assignments are saved with this distribution frame.</p>
    {!vlans.length && <a href="#/configuration/vlans">Configure a VLAN to assign</a>}
  </section>;
}
