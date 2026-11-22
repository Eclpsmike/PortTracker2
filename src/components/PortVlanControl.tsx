import { type Endpoint, type Layout, type Vlan, portVlan, isNetworkPort, vlanColor, resolveEndpoint } from '../model';
export function PortVlanControl({ layout, endpoint, vlans, onChange }: {
  layout: Layout; endpoint: Endpoint; vlans: readonly Vlan[];
  onChange: (vlan: number | null) => void;
}) {
  const assigned = portVlan(layout, endpoint);
  if (!isNetworkPort(layout, endpoint) || resolveEndpoint(layout, endpoint).equipment.kind === 'patch-panel') return null;
  const vlan = vlans.find(v => v.id === assigned);
  return <section className="port-vlan-control" aria-label="Port VLAN assignment">
    <label>Port VLAN<select value={assigned ?? ''} onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))}>
      <option value="">Unassigned</option>
      {vlans.map(v => <option key={v.id} value={v.id}>{v.id} — {v.name}</option>)}
    </select></label>
    <div className="port-vlan-value"><span className="swatch" style={{ background: vlan ? vlanColor(vlan.id, vlans) : '#d4dfe7' }}/><span>{vlan ? `${vlan.id} · ${vlan.name}` : 'No VLAN assigned to this port'}</span></div>
    <p className="note">Applies to this port with or without a cable. Port assignments are saved with this distribution frame.</p>
    {!vlans.length && <a href="#/configuration/vlans">Configure a VLAN to assign</a>}
  </section>;
}
