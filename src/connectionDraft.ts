import { isNetworkPort, getPortMedia, connectionPortVlan, resolveEndpoint, portNumbers, endpointKey, sameEndpoint, cableMediaError, interfaceName, type Cable, type Endpoint, type Layout } from './model';
import { defaultFiber, portMedium } from './media';
import { rackPortLabel } from './rackSearch';

export function deriveConnection(layout: Layout, draft: Cable): Cable {
  const from = getPortMedia(layout, draft.from), to = getPortMedia(layout, draft.to);
  const medium = portMedium(from);
  const { fiber: _fiber, ...rest } = draft;
  const fallback = defaultFiber();
  return { ...rest, medium, vlan: connectionPortVlan(layout, draft), ...(medium === 'fiber' && { fiber: {
    mode: from.mode ?? fallback.mode, strands: from.strands ?? fallback.strands,
    fromConnector: from.connector && from.connector !== 'RJ45' ? from.connector : fallback.fromConnector,
    toConnector: to.connector && to.connector !== 'RJ45' ? to.connector : fallback.toConnector,
  } }) };
}

export function nextConnectionId(layout: Layout): string {
  const ids = new Set(layout.cables.map(cable => cable.id));
  let number = 1;
  while (ids.has(`CBL-${String(number).padStart(4, '0')}`)) number++;
  return `CBL-${String(number).padStart(4, '0')}`;
}

export interface ConnectionPortMatch { endpoint: Endpoint; label: string; description: string; aliases: string[]; occupied: boolean }
export function connectionPortMatches(layout: Layout, query: string, prefix?: string, editingCableId?: string) {
  const term = query.trim().toLowerCase();
  if (!term) return { exact: [] as ConnectionPortMatch[], suggestions: [] as ConnectionPortMatch[] };
  const occupied = new Set(layout.cables.filter(cable => cable.id !== editingCableId).flatMap(cable => [endpointKey(cable.from), endpointKey(cable.to)]));
  const matches: ConnectionPortMatch[] = [];
  for (const rack of layout.racks) for (const equipment of rack.equipment) for (const port of portNumbers(equipment)) {
    const endpoint = { rackId: rack.id, equipmentId: equipment.id, port };
    if (!isNetworkPort(layout, endpoint)) continue;
    const label = rackPortLabel(layout, endpoint, prefix);
    const name = interfaceName(layout, equipment, port);
    const aliases = [...new Set([label.toLowerCase(), name.toLowerCase()].filter(Boolean))];
    if (aliases.some(alias => alias.startsWith(term))) matches.push({ endpoint, label, aliases, description: `${rack.label} · ${equipment.label}`, occupied: occupied.has(endpointKey(endpoint)) });
  }
  const exact = matches.filter(match => match.aliases.includes(term));
  return { exact, suggestions: exact.length ? exact : matches };
}

export function nextConnectionOnEquipment(layout: Layout, previous: Cable): Cable | null {
  const used = new Set(layout.cables.flatMap(cable => [endpointKey(cable.from), endpointKey(cable.to)]));
  function available(endpoint: Endpoint) {
    const ports = portNumbers(resolveEndpoint(layout, endpoint).equipment);
    return [...ports.filter(port => port > endpoint.port), ...ports.filter(port => port <= endpoint.port)]
      .map(port => ({ ...endpoint, port })).filter(endpoint => isNetworkPort(layout, endpoint) && !used.has(endpointKey(endpoint)));
  }
  const id = nextConnectionId(layout);
  for (const from of available(previous.from)) for (const to of available(previous.to)) {
    if (sameEndpoint(from, to)) continue;
    const cable = deriveConnection(layout, { ...previous, id, from, to });
    if (!cableMediaError(layout, cable)) return cable;
  }
  return null;
}
