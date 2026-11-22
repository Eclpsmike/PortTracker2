import { endpointKey, equipmentName, firstPortNumber, equipmentPortLabel, interfaceName, patchPortDetails, portIndex, portNumbers, rackName, resolveEndpoint, type Endpoint, type Layout } from './model';
import { formatPrefixedPortNumber } from './portNumbering';

export function rackPortLabel(layout: Layout, endpoint: Endpoint, portPrefix?: string) {
  const { equipment } = resolveEndpoint(layout, endpoint);
  const name = equipmentPortLabel(layout, equipment, endpoint.port);
  if (equipment.kind === 'switch' && name) {
    return name.replace(/^(?:(?:ge|xe|et|mge)-|FastEthernet|GigabitEthernet|TenGigabitEthernet|TwentyFiveGigE|FortyGigabitEthernet|HundredGigE)(\d+\/\d+\/\d+(?::\d+)?(?:\.\d+)?)$/, '$1');
  }
  const number = equipment.firstNumber && !equipment.portStartOverride && firstPortNumber(equipment) === 1 ? equipment.firstNumber + portIndex(equipment, endpoint.port) : endpoint.port;
  return portPrefix && equipment.kind === 'patch-panel' ? formatPrefixedPortNumber(portPrefix, number) : String(endpoint.port);
}

export type RackSearchTarget =
  | { kind: 'equipment'; rackId: string; equipmentId: string }
  | { kind: 'port'; endpoint: Endpoint }
  | { kind: 'connection'; id: string };
export interface RackSearchResult { key: string; title: string; description: string; target: RackSearchTarget }

export function searchRacks(layout: Layout, query: string, portPrefix?: string): RackSearchResult[] {
  const normalized = query.trim().toLowerCase();
  const terms = normalized.split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const results: (RackSearchResult & { rank: number })[] = [];
  function add(result: RackSearchResult, fields: string[], exact: string[]) {
    const text = [result.title, result.description, ...fields].join(' ').toLowerCase();
    if (terms.every(term => text.includes(term))) results.push({ ...result, rank: exact.some(value => value.toLowerCase() === normalized) ? 0 : 1 });
  }
  for (const rack of layout.racks) for (const equipment of rack.equipment) {
    const identity = [rack.id, rack.label, equipment.id, equipment.label];
    add({ key: `equipment/${rack.id}/${equipment.id}`, title: equipment.label, description: `${rack.label} · ${equipment.kind === 'switch' ? 'Switch' : 'Patch panel'}`, target: { kind: 'equipment', rackId: rack.id, equipmentId: equipment.id } }, identity, [equipment.id, equipment.label]);
    for (const port of portNumbers(equipment)) {
      const endpoint = { rackId: rack.id, equipmentId: equipment.id, port };
      const label = rackPortLabel(layout, endpoint, portPrefix);
      const name = interfaceName(layout, equipment, port);
      const details = patchPortDetails(layout, endpoint);
      add({ key: `port/${endpointKey(endpoint)}`, title: `${equipment.label} / Port ${label}`, description: `${rack.label} · ${details.facilityLocation || 'Unassigned location'}`, target: { kind: 'port', endpoint } }, [...identity, name, String(port), details.notes], [label, name]);
    }
  }
  for (const cable of layout.cables) {
    const endpoints = [cable.from, cable.to];
    const labels = endpoints.map(ep => `${rackName(layout, ep.rackId)} · ${equipmentName(layout, ep)} / ${rackPortLabel(layout, ep, portPrefix)}`);
    const fields = endpoints.flatMap(ep => {
      const details = patchPortDetails(layout, ep);
      return [ep.rackId, ep.equipmentId, details.facilityLocation, details.notes, interfaceName(layout, resolveEndpoint(layout, ep).equipment, ep.port)];
    });
    add({ key: `connection/${cable.id}`, title: cable.id, description: `${labels[0]} → ${labels[1]}`, target: { kind: 'connection', id: cable.id } }, fields, [cable.id]);
  }
  return results.sort((a, b) => a.rank - b.rank);
}
