import { rackName, hasVerticalManagement } from '../model';
import { templatePort } from '../equipmentTemplates';
import { type Cable, type Endpoint, type Layout, type Vlan, type Side, cableRoute, equipmentTopU, portIndex, legacyFace, schematicSocket, resolveEndpoint, vlanColor } from '../model';
import { roundedPath } from '../geometry';
export function PathDiagram({ cable, layout, showVlan, tracing, vlans }: { vlans?: readonly Vlan[]; cable: Cable; layout: Layout; showVlan: boolean; tracing: boolean }) {
  const { cross, overhead, sides } = cableRoute(layout, cable);
  const racks = layout.racks.filter(r => r.id === cable.from.rackId || r.id === cable.to.rackId).sort((a, b) => a.positionM - b.positionM);
  const rackLeft = (id: string) => cross ? 84 + racks.findIndex(r => r.id === id) * 68 : 108;
  const endpointPoint = (ep: Endpoint) => {
    const { rack, equipment } = resolveEndpoint(layout, ep);
    const socket = templatePort(equipment, ep.port, layout.templates) ?? (legacyFace(equipment) ? undefined : schematicSocket(equipment, ep.port));
    return {
      x: rackLeft(ep.rackId) + (socket ? 6.8 + socket.x * 54.4 : 12 + (portIndex(equipment, ep.port) % 24) / 23 * 44),
      y: 60 + (rack.heightU - equipmentTopU(equipment) + (socket?.y ?? .5) * equipment.heightU) / rack.heightU * 98,
    };
  };
  const manager = (id: string, side: Side) => rackLeft(id) + (side === 'left' ? 4 : 64);
  const a = endpointPoint(cable.from), b = endpointPoint(cable.to);
  const ax = manager(cable.from.rackId, sides.from), bx = manager(cable.to.rackId, sides.to);
  const points = overhead
    ? [a, { x: ax, y: a.y }, { x: ax, y: 36 }, { x: bx, y: 36 }, { x: bx, y: b.y }, b]
    : [a, { x: ax, y: a.y }, { x: ax, y: b.y }, b];
  const routeLabel = (id: string) => hasVerticalManagement(layout.racks.find(r => r.id === id)!) ? 'manager' : 'rack side';
  const path = roundedPath(points, 5);
  const color = showVlan ? vlanColor(cable.vlan, vlans) : cable.jacket;
  return <svg className="path-diagram" viewBox="0 0 304 180" role="img" aria-label={`${overhead ? 'Overhead' : routeLabel(cable.from.rackId) === 'manager' ? 'Vertical manager' : 'Rack side'} route from ${rackName(layout, cable.from.rackId)} ${sides.from} ${routeLabel(cable.from.rackId)} to ${rackName(layout, cable.to.rackId)} ${sides.to} ${routeLabel(cable.to.rackId)}`}>
    {racks.map(rack => { const x = rackLeft(rack.id); return <g key={rack.id}><svg x={x} y="10" width="68" height="22" overflow="hidden"><title>{rack.label}</title><text x="34" y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill="#224358">{rack.label.length > 12 ? `${rack.label.slice(0, 11)}…` : rack.label}</text></svg><rect x={x} y="55" width="68" height="109" rx="3" fill="#3b5265" stroke="#98adbd" strokeWidth="2"/>{Array.from({ length: 10 }, (_, n) => <g key={n}><rect x={x + 8} y={62 + n * 9} width="52" height="6" fill="#8496a4"/><path d={`M${x + 12} ${65 + n * 9} h44`} stroke="#1c3242" strokeWidth="3" strokeDasharray="3 2"/></g>)}</g>; })}
    <path d={path} stroke="#fff" strokeWidth="6" fill="none"/><path d={path} stroke={color} strokeWidth="3.5" fill="none" strokeLinejoin="round"/>
    {tracing && <path d={path} stroke="#fff" strokeWidth="1.5" strokeDasharray="3 7" fill="none" className="trace-motion"/>}
    {[a, b].map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="5" fill={color} stroke="white" strokeWidth="1.5"/>)}
  </svg>;
}
