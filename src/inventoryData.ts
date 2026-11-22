import { endpointKey, equipmentStack, equipmentUnits, firstPortNumber, portPhysicalLabel, isNetworkPort, interfaceName, patchPortDetails, portNumbers, portVlan, resolveEndpoint, type Endpoint } from './model';
import { equipmentTemplate, templatePort } from './equipmentTemplates';
import { projectLayout, type Project } from './project';

export type InventoryKind = 'racks' | 'ports';
export interface InventoryRow {
  key: string; frameId: string; frame: string; building: string; archived: boolean;
  rackKey: string; rack: string; rackHeight: number; rackUsed: number;
  equipmentKey: string; equipment: string; equipmentKind: string; template: string;
  position: string; heightU: number | null; ports: number | null; portRange: string; connectedPorts: number | null;
  port: number | null; sourceInterface: string; media: string; status: string; peer: string;
  vlanId: number | null; vlan: string; facilityLocation: string; notes: string;
  stackKey: string; stack: string; member: number | null; interfaceName: string;
}
export function inventoryRows(project: Project, kind: InventoryKind): InventoryRow[] {
  return project.locations.flatMap(frame => {
    const layout = projectLayout(project, frame.id);
    const peers = new Map<string, Endpoint>();
    for (const cable of layout.cables) {
      peers.set(endpointKey(cable.from), cable.to);
      peers.set(endpointKey(cable.to), cable.from);
    }
    return layout.racks.flatMap(rack => {
      const base: InventoryRow = {
        key: `${frame.id}/${rack.id}`, frameId: frame.id, frame: frame.name,
        building: project.buildings.find(b => b.id === frame.buildingId)?.name ?? '', archived: frame.archived,
        rackKey: `${frame.id}/${rack.id}`, rack: rack.label, rackHeight: rack.heightU,
        rackUsed: rack.equipment.reduce((sum, e) => sum + e.heightU, 0),
        equipmentKey: '', equipment: '', equipmentKind: '', template: '', position: '', heightU: null, ports: null, portRange: '', connectedPorts: null,
        port: null, sourceInterface: '', media: '', status: '', peer: '', vlanId: null, vlan: '', facilityLocation: '', notes: '',
        stackKey: '', stack: '', member: null, interfaceName: '',
      };
      if (!rack.equipment.length) return kind === 'racks' ? [base] : [];
      return [...rack.equipment].sort((a, b) => b.bottomU - a.bottomU).flatMap(equipment => {
        const numbers = portNumbers(equipment);
        const row: InventoryRow = { ...base, key: `${base.key}/${equipment.id}`, equipmentKey: `${base.key}/${equipment.id}`,
          equipment: equipment.label, equipmentKind: equipment.kind === 'switch' ? 'Switch' : 'Patch panel',
          template: equipmentTemplate(equipment, project.templates)?.name ?? 'Original SVG',
          stackKey: equipment.stack ? `${frame.id}/${equipment.stack.stackId}` : '', stack: equipmentStack(layout, equipment)?.name ?? '', member: equipment.stack?.member ?? null,
          position: equipmentUnits(equipment), heightU: equipment.heightU, ports: equipment.portCount,
          portRange: `${firstPortNumber(equipment)}–${firstPortNumber(equipment) + equipment.portCount - 1}`,
          connectedPorts: numbers.filter(port => peers.has(endpointKey({ rackId: rack.id, equipmentId: equipment.id, port }))).length,
        };
        if (kind === 'racks') return [row];
        return numbers.map(port => {
          const ep = { rackId: rack.id, equipmentId: equipment.id, port }, peer = peers.get(endpointKey(ep));
          const target = peer ? resolveEndpoint(layout, peer) : null;
          const vlanId = portVlan(layout, ep);
          return { ...row, key: `${row.key}/${port}`, port,
            sourceInterface: templatePort(equipment, port, project.templates)?.name ?? '',
            interfaceName: interfaceName(layout, equipment, port),
            media: portPhysicalLabel(layout, ep), status: !isNetworkPort(layout,ep) ? 'Serial console' : peer ? 'Connected' : 'Available',
            peer: target && peer ? `${target.rack.label} / ${target.equipment.label} / Port ${peer.port}` : '',
            vlanId, vlan: !isNetworkPort(layout,ep) ? 'Not applicable' : vlanId === null ? 'Unassigned' : `${vlanId} — ${project.configuration.vlans.find(v => v.id === vlanId)?.name ?? 'Unknown VLAN'}`,
            ...patchPortDetails(layout, ep),
          };
        });
      });
    });
  });
}
