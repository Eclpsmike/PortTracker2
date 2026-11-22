import { equipmentPortLabel, portVlan, resolveEndpoint, vlanColor, type Cable, type Endpoint, type Layout, type Vlan } from '../model';
import { rackPortLabel } from '../rackSearch';
import { Icon } from './Icon';

export function ConnectionEndpointHeading({ layout, cable, portPrefix }: { layout: Layout; cable: Cable; portPrefix?: string }) {
  function label(endpoint: Endpoint) {
    const { equipment } = resolveEndpoint(layout, endpoint);
    return equipment.kind === 'switch'
      ? equipmentPortLabel(layout, equipment, endpoint.port) || rackPortLabel(layout, endpoint, portPrefix)
      : rackPortLabel(layout, endpoint, portPrefix);
  }
  return <div className="connection-endpoints" aria-label="Connection endpoints">{label(cable.from)}<span className="connection-direction"><span className="sr-only"> ↔ </span><Icon name="bidirectional" size={18}/></span>{label(cable.to)}</div>;
}

export function ConnectionPortVlan({ layout, cable, vlans }: { layout: Layout; cable: Cable; vlans: readonly Vlan[] }) {
  const from = portVlan(layout, cable.from), to = portVlan(layout, cable.to);
  function value(id: number | null) {
    if (id === null) return <span>Unassigned</span>;
    const name = vlans.find(vlan => vlan.id === id)?.name;
    return <span><span className="swatch" style={{ background: vlanColor(id, vlans) }}/>{id}{name ? ` — ${name}` : ''}</span>;
  }
  return from === to ? value(from) : <div className="connection-endpoint-vlans"><div>From: {value(from)}</div><div>To: {value(to)}</div></div>;
}
