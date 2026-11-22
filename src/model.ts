import { validPortRange, MAX_PORT_NUMBER } from './portNumbering';
import { type PortMedia, type FiberCable, type FiberStock, validPortMedia, mediaLabel, validFiberCable, portMedium, isSlot, matchingFiberStock } from './media';
import { findEquipmentTemplate, compatibleTemplate, templatePort, portFace, interfacePortLabel, type EquipmentTemplate } from './equipmentTemplates';
export type Side = 'left' | 'right';
export type EquipmentKind = 'patch-panel' | 'switch';
export interface SwitchStack { id: string; name: string; managementAddress: string; interfaceNaming: 'juniper' | 'cisco' | 'template' }
export interface Equipment { id: string; kind: EquipmentKind; label: string; bottomU: number; heightU: number; portCount: number; portStart?: number; portStartOverride?: boolean; firstNumber?: number; templateId?: string; stack?: { stackId: string; member: number } }
export const MAX_RACK_UNITS = 100;
export const firstPortNumber = (equipment: Pick<Equipment, 'portStart'>) => equipment.portStart ?? 1;
export const portIndex = (equipment: Equipment, port: number) => port - firstPortNumber(equipment);
export const portNumbers = (equipment: Equipment) => Array.from({ length: equipment.portCount }, (_, i) => firstPortNumber(equipment) + i);
export interface Rack { id: string; label: string; heightU: number; positionM: number; verticalManagement?: boolean; equipment: Equipment[] }
export interface Endpoint { rackId: string; equipmentId: string; port: number }
export interface Cable { id: string; from: Endpoint; to: Endpoint; jacket: string; vlan: number | null; medium?: 'copper' | 'fiber'; fiber?: FiberCable }
export type PortVlans = Record<string, number>;
export interface PatchPortDetails { facilityLocation: string; notes: string }
export const PORT_LOCATION_MAX = 250;
export const PORT_NOTES_MAX = 2000;
// templates is a runtime catalog supplied by projectLayout, not duplicated in saved locations.
export interface Layout { stacks?: SwitchStack[]; templates?: readonly EquipmentTemplate[]; racks: Rack[]; cables: Cable[]; portVlans?: PortVlans; portDetails?: Record<string, PatchPortDetails>; portMedia?: Record<string, PortMedia> }
export interface Calibration { rackWidthM: number; equipmentWidthM?: number; verticalManagerWidthM?: number; managerOverlapM?: number; trayAboveRackM: number; bendAllowanceM: number; slackM: number; stockedLengthsM: number[]; fiberStock?: FiberStock[] }
export interface Vlan { id: number; name: string; color: string }
export const VLANS: Vlan[] = [
  { id: 10, name: 'Management', color: '#159de7' },
  { id: 20, name: 'Workstations', color: '#31c94a' },
  { id: 30, name: 'Voice', color: '#ff9b19' },
  { id: 40, name: 'Wireless', color: '#b26bf6' },
  { id: 50, name: 'Cameras', color: '#f3cf19' },
  { id: 60, name: 'Printers', color: '#00b8b0' },
  { id: 99, name: 'Servers', color: '#8b9cac' },
];
export const defaultCalibration: Calibration = { rackWidthM: .6, trayAboveRackM: .25, bendAllowanceM: .25, slackM: .5, stockedLengthsM: [.5, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30] };
export const hasVerticalManagement = (rack: Rack) => rack.verticalManagement !== false;
export const managerWidth = (rack: Rack, cal: Calibration) => hasVerticalManagement(rack) ? cal.verticalManagerWidthM ?? 0 : 0;
export const managerExtension = (rack: Rack, cal: Calibration) => hasVerticalManagement(rack) ? managerWidth(rack, cal) - (cal.managerOverlapM ?? 0) : 0;
export const rackFootprint = (rack: Rack, cal: Calibration) => cal.rackWidthM + 2 * managerExtension(rack, cal);
export function calibrationError(cal: Calibration): string | null {
  if ([cal.rackWidthM, cal.equipmentWidthM ?? cal.rackWidthM * .8, cal.verticalManagerWidthM ?? 0, cal.managerOverlapM ?? 0, cal.trayAboveRackM, cal.bendAllowanceM, cal.slackM].some(v => !Number.isFinite(v) || v < 0) || cal.rackWidthM === 0) return 'Calibration values must be finite, nonnegative measurements with a positive rack width.';
  if (cal.equipmentWidthM !== undefined && (cal.equipmentWidthM <= 0 || cal.equipmentWidthM > cal.rackWidthM)) return 'Equipment width must be positive and no wider than the rack frame.';
  if ((cal.managerOverlapM ?? 0) > (cal.verticalManagerWidthM ?? 0)) return 'Manager overlap cannot exceed the manager width.';
  if ((cal.managerOverlapM ?? 0) > (cal.rackWidthM - (cal.equipmentWidthM ?? cal.rackWidthM * .8)) / 2 + 1e-9) return 'Manager overlap must fit on the rack frame beside the equipment.';
  return null;
}
export function positionRacks(racks: Rack[], cal: Calibration, gap: number): Rack[] {
  let positionM = 0;
  return racks.map(rack => { const next = { ...rack, positionM }; positionM += rackFootprint(rack, cal) + gap; return next; });
}
export const rackName = (layout: Layout, id: string) => layout.racks.find(r => r.id === id)?.label ?? 'Unknown rack';
export const endpointKey = (e: Endpoint) => `${e.rackId}/${e.equipmentId}/${e.port}`;
export const sameEndpoint = (a: Endpoint, b: Endpoint) => endpointKey(a) === endpointKey(b);
export const equipmentStack = (layout: Layout, equipment: Equipment) => layout.stacks?.find(stack => stack.id === equipment.stack?.stackId);
export function removeEmptyStacks(layout: Layout): Layout {
  if (!layout.stacks) return layout;
  const used = new Set(layout.racks.flatMap(r => r.equipment.flatMap(e => e.stack ? [e.stack.stackId] : [])));
  return { ...layout, stacks: layout.stacks.filter(stack => used.has(stack.id)) };
}
export function interfaceName(layout: Layout, equipment: Equipment, port: number): string {
  const socket = templatePort(equipment, port, layout.templates);
  const source = socket?.manual ? '' : socket?.name ?? '';
  if (!equipment.stack) return source;
  const naming = equipmentStack(layout, equipment)?.interfaceNaming;
  if (naming === 'juniper') return source.replace(/^((?:ge|xe|et|mge)-)\d+(\/\d+\/\d+(?::\d+)?(?:\.\d+)?)$/, (_match, prefix: string, suffix: string) => `${prefix}${equipment.stack!.member}${suffix}`);
  if (naming === 'cisco') return source.replace(/^((?:FastEthernet|GigabitEthernet|TenGigabitEthernet|TwentyFiveGigE|FortyGigabitEthernet|HundredGigE))\d+(\/\d+\/\d+(?::\d+)?(?:\.\d+)?)$/, (_match, prefix: string, suffix: string) => `${prefix}${equipment.stack!.member}${suffix}`);
  return source;
}
export function equipmentPortLabel(layout: Layout, equipment: Equipment, port: number): string {
  const socket = templatePort(equipment, port, layout.templates);
  return equipment.kind === 'switch' ? socket?.label || interfacePortLabel(socket?.manual ? socket.name ?? '' : interfaceName(layout, equipment, port)) || String(port) : String(port);
}
export const vlanColor = (vlan: number | null, vlans: readonly Vlan[] = VLANS) => vlans.find(v => v.id === vlan)?.color ?? '#91a4b5';
export function makeRack(index: number, heightU = 42): Rack {
  const id = `CAB-A${String(index + 1).padStart(2, '0')}`;
  let ordinal = index + 1, letter = '';
  while (ordinal > 0) { ordinal--; letter = String.fromCharCode(65 + ordinal % 26) + letter; ordinal = Math.floor(ordinal / 26); }
  const equipment: Equipment[] = Array.from({ length: 20 }, (_, i) => ({ id: `PP-${letter}${String(i + 1).padStart(2, '0')}`, label: `PP-${letter}${String(i + 1).padStart(2, '0')}`, kind: 'patch-panel', bottomU: heightU - i, heightU: 1, portCount: 24, firstNumber: i * 24 + 1 }));
  for (let i = 0; i < 5; i++) equipment.push({ id: `SW-${letter}${String(i + 1).padStart(2, '0')}`, label: `SW-${letter}${String(i + 1).padStart(2, '0')}`, kind: 'switch', bottomU: heightU - 20 - i, heightU: 1, portCount: 48 });
  return { id, label: `Rack ${letter}`, heightU, positionM: index * .85, equipment };
}
export function setEquipmentTemplate(layout: Layout, rackId: string, equipmentId: string, templateId: string | null): Layout {
  const { equipment } = resolveEquipment(layout, rackId, equipmentId);
  const template = templateId === null ? undefined : findEquipmentTemplate(templateId, layout.templates);
  if (templateId !== null && (!template || !compatibleTemplate(equipment, template))) throw new Error('Choose a compatible equipment template.');
  const updated = { ...equipment };
  if (templateId === null) delete updated.templateId;
  else updated.templateId = templateId;
  // Appearance changes preserve the physical configuration of each existing socket.
  const portMedia = { ...layout.portMedia };
  for (const port of portNumbers(equipment)) {
    const ep = { rackId, equipmentId, port }, existing = getPortMedia(layout, ep);
    const target = template?.ports[portIndex(equipment, port)]?.media ?? { kind: 'copper' };
    if (JSON.stringify(existing) !== JSON.stringify(target)) portMedia[endpointKey(ep)] = existing;
  }
  const next = { ...layout, ...(Object.keys(portMedia).length && { portMedia }), racks: layout.racks.map(rack => rack.id === rackId ? { ...rack, equipment: rack.equipment.map(e => e.id === equipmentId ? updated : e) } : rack) };
  for (const cable of next.cables) {
    const problem = cableMediaError(next, cable);
    if (problem) throw new Error(`${cable.id}: ${problem}`);
  }
  return next;
}

export const equipmentTopU = (equipment: Pick<Equipment, 'bottomU' | 'heightU'>) => equipment.bottomU + equipment.heightU - 1;
export const equipmentUnits = (equipment: Pick<Equipment, 'bottomU' | 'heightU'>) => equipment.heightU === 1 ? `U${equipment.bottomU}` : `U${equipment.bottomU}–U${equipmentTopU(equipment)}`;
export function placementError(rack: Rack, bottomU: number, heightU: number, excludeId?: string): string | null {
  if (!Number.isInteger(bottomU) || !Number.isInteger(heightU) || bottomU < 1 || heightU < 1 || bottomU + heightU - 1 > rack.heightU) return `Choose a whole bottom rack unit that fits all ${heightU}U inside U1–U${rack.heightU}.`;
  const collision = rack.equipment.find(e => e.id !== excludeId && bottomU <= equipmentTopU(e) && bottomU + heightU - 1 >= e.bottomU);
  return collision ? `Overlaps ${collision.label} (${equipmentUnits(collision)}). Choose free rack units.` : null;
}
export function firstFreeUnit(rack: Rack, heightU: number, excludeId?: string): number | null {
  for (let u = rack.heightU - heightU + 1; u >= 1; u--) if (!placementError(rack, u, heightU, excludeId)) return u;
  return null;
}
export function nextEquipmentId(layout: Layout, kind: EquipmentKind): string {
  let n = 1;
  const prefix = kind === 'switch' ? 'SW' : 'PP';
  while (layout.racks.some(r => r.equipment.some(e => e.id === `${prefix}-${String(n).padStart(3, '0')}`))) n++;
  return `${prefix}-${String(n).padStart(3, '0')}`;
}
export interface EquipmentPlacement { portStart?: number; rackId: string; templateId: string; id: string; label: string; bottomU: number }
export function addEquipment(layout: Layout, draft: EquipmentPlacement): Layout {
  const rack = layout.racks.find(r => r.id === draft.rackId);
  const template = findEquipmentTemplate(draft.templateId, layout.templates);
  if (!rack || !template) throw new Error('Choose a rack and a saved equipment template.');
  if ((draft.portStart !== undefined && !validPortRange(draft.portStart, template.portCount)) || !validPortRange(template.portStart ?? 1, template.portCount)) throw new Error(`Use a whole starting number from 0 to ${MAX_PORT_NUMBER - template.portCount + 1}.`);
  if (!/^[\w-]{1,100}$/.test(draft.id) || rack.equipment.some(e => e.id === draft.id)) throw new Error('Use a unique equipment ID in this rack (letters, numbers, underscores or hyphens, up to 100 characters).');
  if (!draft.label.trim() || draft.label.length > 100) throw new Error('Enter an equipment label up to 100 characters.');
  const error = placementError(rack, draft.bottomU, template.heightU);
  if (error) throw new Error(error);
  const equipment: Equipment = { id: draft.id, label: draft.label.trim(), bottomU: draft.bottomU, heightU: template.heightU, kind: template.kind, portCount: template.portCount, portStart: draft.portStart ?? template.portStart ?? 1, ...(draft.portStart !== undefined && { portStartOverride: true }), templateId: template.id };
  return { ...layout, racks: layout.racks.map(r => r.id === rack.id ? { ...r, equipment: [...r.equipment, equipment].sort((a, b) => equipmentTopU(b) - equipmentTopU(a)) } : r) };
}
export function equipmentRemovalImpact(layout: Layout, rackId: string, equipmentId: string) {
  const { equipment, rack } = resolveEquipment(layout, rackId, equipmentId);
  const matches = (ep: Endpoint) => ep.rackId === rackId && ep.equipmentId === equipmentId;
  const prefix = `${rackId}/${equipmentId}/`;
  return { equipment, rack, cables: layout.cables.filter(c => matches(c.from) || matches(c.to)),
    vlanAssignments: Object.keys(layout.portVlans ?? {}).filter(key => key.startsWith(prefix)).length,
    documentedPorts: Object.keys(layout.portDetails ?? {}).filter(key => key.startsWith(prefix)).length };
}
export function removeEquipment(layout: Layout, rackId: string, equipmentId: string): Layout {
  const impact = equipmentRemovalImpact(layout, rackId, equipmentId), removed = new Set(impact.cables.map(c => c.id));
  const prefix = `${rackId}/${equipmentId}/`;
  return removeEmptyStacks({ ...layout, racks: layout.racks.map(r => r.id === rackId ? { ...r, equipment: r.equipment.filter(e => e.id !== equipmentId) } : r),
    cables: layout.cables.filter(c => !removed.has(c.id)),
    ...(layout.portVlans ? { portVlans: Object.fromEntries(Object.entries(layout.portVlans).filter(([key]) => !key.startsWith(prefix))) } : {}),
    ...(layout.portMedia ? { portMedia: Object.fromEntries(Object.entries(layout.portMedia).filter(([key]) => !key.startsWith(prefix))) } : {}),
    ...(layout.portDetails ? { portDetails: Object.fromEntries(Object.entries(layout.portDetails).filter(([key]) => !key.startsWith(prefix))) } : {}) });
}
export function moveEquipment(layout: Layout, rackId: string, equipmentId: string, destinationId: string, bottomU: number): Layout {
  const { equipment } = resolveEquipment(layout, rackId, equipmentId);
  const destination = layout.racks.find(r => r.id === destinationId);
  if (!destination) throw new Error('Choose a destination rack.');
  if (rackId !== destinationId && destination.equipment.some(e => e.id === equipmentId)) throw new Error('The destination already contains this equipment ID.');
  const error = placementError(destination, bottomU, equipment.heightU, rackId === destinationId ? equipmentId : undefined);
  if (error) throw new Error(error);
  const remap = (ep: Endpoint) => ep.rackId === rackId && ep.equipmentId === equipmentId ? { ...ep, rackId: destinationId } : ep;
  const prefix = `${rackId}/${equipmentId}/`, target = `${destinationId}/${equipmentId}/`;
  function remapRecords<T>(records: Record<string, T>) { return Object.fromEntries(Object.entries(records).map(([key, value]) => [key.startsWith(prefix) ? target + key.slice(prefix.length) : key, value])); }
  return { ...layout, racks: layout.racks.map(r => {
    if (r.id !== rackId && r.id !== destinationId) return r;
    const equipmentList = r.id === rackId ? r.equipment.filter(e => e.id !== equipmentId) : r.equipment;
    return { ...r, equipment: (r.id === destinationId ? [...equipmentList, { ...equipment, bottomU }] : equipmentList).sort((a, b) => equipmentTopU(b) - equipmentTopU(a)) };
  }), cables: layout.cables.map(c => ({ ...c, from: remap(c.from), to: remap(c.to) })),
    ...(layout.portVlans ? { portVlans: remapRecords(layout.portVlans) } : {}),
    ...(layout.portMedia ? { portMedia: remapRecords(layout.portMedia) } : {}),
    ...(layout.portDetails ? { portDetails: remapRecords(layout.portDetails) } : {}) };
}
// Preserve the original demo's socket positions; other generic faces use a grid.
export const legacyFace = (e: Equipment) => e.heightU === 1 && e.portCount === (e.kind === 'switch' ? 48 : 24);
export function schematicSocket(e: Equipment, port: number) {
  const columns = Math.min(24, e.portCount), rows = Math.ceil(e.portCount / columns);
  const column = portIndex(e, port) % columns, row = Math.floor(portIndex(e, port) / columns);
  return { x: (70 + (columns === 1 ? 109.25 : column / (columns - 1) * 218.5)) / 334, y: (row + .5) / rows };
}

export function rackRemovalImpact(layout: Layout, rackId: string) {
  const rack = layout.racks.find(r => r.id === rackId);
  if (!rack) throw new Error('Choose an existing rack.');
  const prefix = `${rackId}/`;
  return {
    rack, equipment: rack.equipment.length, ports: rack.equipment.reduce((n, e) => n + e.portCount, 0),
    connections: layout.cables.filter(c => c.from.rackId === rackId || c.to.rackId === rackId).length,
    vlanAssignments: Object.keys(layout.portVlans ?? {}).filter(key => key.startsWith(prefix)).length,
    documentedPorts: Object.keys(layout.portDetails ?? {}).filter(key => key.startsWith(prefix)).length,
  };
}
export function removeRack(layout: Layout, rackId: string): Layout {
  rackRemovalImpact(layout, rackId);
  const prefix = `${rackId}/`;
  return removeEmptyStacks({
    ...layout,
    racks: layout.racks.filter(r => r.id !== rackId),
    cables: layout.cables.filter(c => c.from.rackId !== rackId && c.to.rackId !== rackId),
    ...(layout.portVlans ? { portVlans: Object.fromEntries(Object.entries(layout.portVlans).filter(([key]) => !key.startsWith(prefix))) } : {}),
    ...(layout.portMedia ? { portMedia: Object.fromEntries(Object.entries(layout.portMedia).filter(([key]) => !key.startsWith(prefix))) } : {}),
    ...(layout.portDetails ? { portDetails: Object.fromEntries(Object.entries(layout.portDetails).filter(([key]) => !key.startsWith(prefix))) } : {}),
  });
}

export function fixtureLayout(vlans: readonly Vlan[] = VLANS): Layout {
  const racks = [makeRack(0), makeRack(1)];
  const cables: Cable[] = [];
  const ep = (r: number, device: number, port: number): Endpoint => ({ rackId: racks[r].id, equipmentId: racks[r].equipment[device].id, port });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) for (let k = 0; k < 3; k++) {
    const vlan = VLANS[(i + r) % 6].id;
    cables.push({ id: `CB-${String(cables.length + 1).padStart(4, '0')}`, from: ep(r, 1 + i * 4, 3 + k), to: ep(r, 20 + i, 3 + k), vlan, jacket: vlanColor(vlan) });
  }
  cables.push({ id: 'CR-0018', from: ep(0, 3, 18), to: ep(1, 20, 18), vlan: 30, jacket: '#f5cd22' });
  cables.push({ id: 'CR-0019', from: ep(1, 4, 12), to: ep(0, 21, 42), vlan: 40, jacket: '#b26bf6' });
  const validCables = cables.filter(c => vlans.some(v => v.id === c.vlan));
  // Seed demo assignments once. Later cable edits never mutate port VLANs.
  const portVlans: PortVlans = {};
  for (const cable of validCables) for (const endpoint of [cable.from, cable.to]) if (cable.vlan !== null) portVlans[endpointKey(endpoint)] = cable.vlan;
  return { racks, cables: validCables, portVlans };
}
export function resolveEquipment(layout: Layout, rackId: string, equipmentId: string) {
  const rack = layout.racks.find(r => r.id === rackId);
  const equipment = rack?.equipment.find(e => e.id === equipmentId);
  if (!rack || !equipment) throw new Error('Choose a valid rack and device.');
  return { rack, equipment };
}
export function resolveEndpoint(layout: Layout, ep: Endpoint) {
  const { rack, equipment } = resolveEquipment(layout, ep.rackId, ep.equipmentId);
  const index = portIndex(equipment, ep.port);
  if (!Number.isInteger(ep.port) || index < 0 || index >= equipment.portCount) throw new Error('Choose a valid rack, device, and port.');
  return { rack, equipment };
}
export function portVlan(layout: Layout, endpoint: Endpoint): number | null {
  const equipment = layout.racks.find(rack => rack.id === endpoint.rackId)?.equipment.find(item => item.id === endpoint.equipmentId);
  if (!equipment || !Number.isInteger(endpoint.port) || portIndex(equipment, endpoint.port) < 0 || portIndex(equipment, endpoint.port) >= equipment.portCount) return null;
  if (!isNetworkPort(layout, endpoint)) return null;
  if (equipment.kind === 'patch-panel') {
    const cable = layout.cables.find(c => sameEndpoint(c.from, endpoint) || sameEndpoint(c.to, endpoint));
    if (!cable) return null;
    const peer = sameEndpoint(cable.from, endpoint) ? cable.to : cable.from;
    if (resolveEndpoint(layout, peer).equipment.kind !== 'switch' || !isNetworkPort(layout, peer)) return null;
    return layout.portVlans?.[endpointKey(peer)] ?? null;
  }
  return layout.portVlans?.[endpointKey(endpoint)] ?? null;
}
// Use the connected switch ports, never a saved cable VLAN or a panel's previous peer.
// Links without a switch, or with differing switch VLANs, have no single VLAN.
export function connectionPortVlan(layout: Layout, cable: Pick<Cable, 'from' | 'to'>): number | null {
  const values = [cable.from, cable.to].filter(endpoint => resolveEndpoint(layout, endpoint).equipment.kind === 'switch').map(endpoint => portVlan(layout, endpoint));
  return values.length && values.every(value => value === values[0]) ? values[0] : null;
}
export function assignPortVlan(layout: Layout, endpoint: Endpoint, vlan: number | null, vlans: readonly Vlan[] = VLANS): Layout {
  return assignPortVlans(layout, [endpoint], vlan, vlans);
}
export function assignPortVlans(layout: Layout, endpoints: readonly Endpoint[], vlan: number | null, vlans: readonly Vlan[] = VLANS): Layout {
  // Validate the complete batch before changing any assignments.
  for (const endpoint of endpoints) resolveEndpoint(layout, endpoint);
  if (vlan !== null && !vlans.some(v => v.id === vlan)) throw new Error('Choose a configured VLAN.');
  const portVlans = { ...layout.portVlans };
  for (const endpoint of endpoints) {
    // Panels derive their VLAN from the connected switch, never a local override.
    if (resolveEndpoint(layout, endpoint).equipment.kind !== 'switch' || !isNetworkPort(layout, endpoint)) continue;
    if (vlan === null) delete portVlans[endpointKey(endpoint)];
    else portVlans[endpointKey(endpoint)] = vlan;
  }
  return { ...layout, portVlans };
}

export function patchPortDetails(layout: Layout, endpoint: Endpoint): PatchPortDetails {
  const details = layout.portDetails?.[endpointKey(endpoint)] ?? { facilityLocation: '', notes: '' };
  const equipment = layout.racks.find(rack => rack.id === endpoint.rackId)?.equipment.find(item => item.id === endpoint.equipmentId);
  if (equipment?.kind !== 'switch') return details;
  const cable = layout.cables.find(c => sameEndpoint(c.from, endpoint) || sameEndpoint(c.to, endpoint));
  const peer = cable ? (sameEndpoint(cable.from, endpoint) ? cable.to : cable.from) : null;
  const facilityLocation = peer && resolveEndpoint(layout, peer).equipment.kind === 'patch-panel'
    ? layout.portDetails?.[endpointKey(peer)]?.facilityLocation ?? '' : '';
  return { ...details, facilityLocation };
}
export function validPortDetails(value: unknown): value is PatchPortDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const details = value as Partial<PatchPortDetails>;
  return typeof details.facilityLocation === 'string' && details.facilityLocation.length <= PORT_LOCATION_MAX
    && typeof details.notes === 'string' && details.notes.length <= PORT_NOTES_MAX;
}
export function setPortNotes(layout: Layout, endpoint: Endpoint, notes: string): Layout {
  resolveEndpoint(layout, endpoint);
  if (typeof notes !== 'string' || notes.length > PORT_NOTES_MAX) throw new Error(`Use up to ${PORT_NOTES_MAX} characters for notes.`);
  const key = endpointKey(endpoint);
  // Edit only this port's stored notes; never copy its inherited location.
  const details = { ...(layout.portDetails?.[key] ?? { facilityLocation: '' }), notes };
  const portDetails = { ...layout.portDetails };
  if (!details.facilityLocation && !notes) delete portDetails[key];
  else portDetails[key] = details;
  return { ...layout, portDetails };
}
export function setPatchPortDetails(layout: Layout, endpoint: Endpoint, details: PatchPortDetails): Layout {
  if (resolveEndpoint(layout, endpoint).equipment.kind !== 'patch-panel') throw new Error('Choose a patch-panel port.');
  if (!validPortDetails(details)) throw new Error(`Use up to ${PORT_LOCATION_MAX} characters for the facility location and ${PORT_NOTES_MAX} for notes.`);
  const portDetails = { ...layout.portDetails };
  if (!details.facilityLocation && !details.notes) delete portDetails[endpointKey(endpoint)];
  else portDetails[endpointKey(endpoint)] = { ...details };
  return { ...layout, portDetails };
}

export function updatePatchPortsDetails(layout: Layout, endpoints: readonly Endpoint[], changes: Partial<PatchPortDetails>): Layout {
  const updates = endpoints.map(endpoint => {
    if (resolveEndpoint(layout, endpoint).equipment.kind !== 'patch-panel') throw new Error('Choose patch-panel ports.');
    const details = { ...patchPortDetails(layout, endpoint), ...changes };
    if (!validPortDetails(details)) throw new Error(`Use up to ${PORT_LOCATION_MAX} characters for the facility location and ${PORT_NOTES_MAX} for notes.`);
    return { key: endpointKey(endpoint), details };
  });
  // Validate every endpoint and merged value before changing the batch.
  const portDetails = { ...layout.portDetails };
  for (const { key, details } of updates) {
    if (!details.facilityLocation && !details.notes) delete portDetails[key];
    else portDetails[key] = details;
  }
  return { ...layout, portDetails };
}

export function isNetworkPort(layout: Layout, ep: Endpoint): boolean {
  return templatePort(resolveEndpoint(layout, ep).equipment, ep.port, layout.templates)?.function !== 'console';
}
export function portPhysicalLabel(layout: Layout, ep: Endpoint): string {
  const socket = templatePort(resolveEndpoint(layout, ep).equipment, ep.port, layout.templates);
  return socket?.function === 'console' ? `Serial console · ${socket.consoleConnector}` : mediaLabel(getPortMedia(layout, ep));
}
export function getPortMedia(layout: Layout, ep: Endpoint): PortMedia {
  const { equipment } = resolveEndpoint(layout, ep);
  return layout.portMedia?.[endpointKey(ep)] ?? templatePort(equipment, ep.port, layout.templates)?.media ?? { kind: 'copper' };
}
export function cableMediaError(layout: Layout, cable: Cable): string | null {
  if ([cable.from, cable.to].some(ep => !isNetworkPort(layout, ep))) return 'Serial console ports cannot use Ethernet or fiber connections. Console cabling is not supported yet.';
  if (cable.medium !== undefined && cable.medium !== 'copper' && cable.medium !== 'fiber') return 'Choose copper or fiber cable.';
  if (cable.medium === 'fiber' ? !validFiberCable(cable.fiber) : cable.fiber !== undefined) return 'Enter valid fiber mode, connectors, and strand count.';
  for (const side of ['from', 'to'] as const) {
    const p = getPortMedia(layout, cable[side]);
    if (!validPortMedia(p)) return 'Invalid physical port configuration.';
    if (isSlot(p) && (!p.transceiver?.trim() || !p.connector)) return `${side === 'from' ? 'From' : 'To'} port: configure the installed transceiver and connector in the Ports inspector.`;
    if (portMedium(p) !== (cable.medium ?? 'copper')) return `${side === 'from' ? 'From' : 'To'} port requires a ${portMedium(p)} cable.`;
    if (cable.medium === 'fiber') {
      if (!p.connector || !p.mode || !p.strands) return `${side === 'from' ? 'From' : 'To'} port: configure its fiber connector, mode, and strand count in the Ports inspector.`;
      const f = cable.fiber!;
      if (p.connector !== (side === 'from' ? f.fromConnector : f.toConnector)) return `${side === 'from' ? 'From' : 'To'} connector does not match the port.`;
      if (p.mode !== f.mode) return `${side === 'from' ? 'From' : 'To'} port fiber mode does not match the cable.`;
      if (p.strands !== f.strands) return `${side === 'from' ? 'From' : 'To'} port strand count does not match the cable.`;
    }
  }
  return null;
}
export function setPortsMedia(layout: Layout, endpoints: Endpoint[], media: PortMedia): Layout {
  if (!endpoints.length) throw new Error('Select at least one port.');
  if (!validPortMedia(media)) throw new Error('Check the physical port settings.');
  const portMedia = { ...layout.portMedia };
  for (const ep of endpoints) { resolveEndpoint(layout, ep); if (!isNetworkPort(layout, ep)) throw new Error('Edit console connector settings in the equipment template.'); portMedia[endpointKey(ep)] = { ...media }; }
  const next = { ...layout, portMedia };
  const affected = new Set(endpoints.map(endpointKey));
  for (const cable of layout.cables.filter(c => affected.has(endpointKey(c.from)) || affected.has(endpointKey(c.to)))) {
    const problem = cableMediaError(next, cable);
    if (problem) throw new Error(`${cable.id}: ${problem} Remove or update the connection before changing these ports.`);
  }
  return next;
}

export const equipmentName = (layout: Layout, ep: Pick<Endpoint, 'rackId' | 'equipmentId'>) => layout.racks.find(r => r.id === ep.rackId)?.equipment.find(e => e.id === ep.equipmentId)?.label.trim() || ep.equipmentId;
export const endpointLabel = (ep: Endpoint, layout: Layout) => `${rackName(layout, ep.rackId)} / ${equipmentName(layout, ep)} / Port ${ep.port}`;
export function connectionError(layout: Layout, cable: Cable, vlans: readonly Vlan[] = VLANS): string | null {
  try { resolveEndpoint(layout, cable.from); resolveEndpoint(layout, cable.to); } catch (error) { return (error as Error).message; }
  if (sameEndpoint(cable.from, cable.to)) return 'A cable must connect two different ports.';
  if (cable.vlan !== null && !vlans.some(v => v.id === cable.vlan)) return 'Choose a listed VLAN.';
  if (layout.cables.some(c => c.id !== cable.id && [c.from, c.to].some(e => sameEndpoint(e, cable.from) || sameEndpoint(e, cable.to)))) return 'One of these ports is already connected. Choose a free port or edit its existing connection.';
  return cableMediaError(layout, cable);
}
export function endpointFace(layout: Layout, ep: Endpoint) { return portFace(resolveEndpoint(layout, ep).equipment, ep.port, layout.templates); }
// Measurements are independent of drawing coordinates. Example template: port field spans 70% of rack width.
function physicalEndpoint(layout: Layout, ep: Endpoint, cal: Calibration) {
  const { rack, equipment } = resolveEndpoint(layout, ep);
  const column = portIndex(equipment, ep.port) % 24;
  const socket = templatePort(equipment, ep.port, layout.templates) ?? (legacyFace(equipment) ? undefined : schematicSocket(equipment, ep.port));
  // Explicit equipment width centers the face inside the outer rack frame.
  // Retain the old approximation only for projects without that measurement.
  const faceWidth = cal.equipmentWidthM ?? cal.rackWidthM * .8;
  const imageX = socket?.x ?? .0625 + (column + .5) / 24 * .875;
  const socketX = endpointFace(layout, ep) === 'rear' ? 1 - imageX : imageX;
  const x = rack.positionM + managerExtension(rack, cal) + (cal.rackWidthM - faceWidth) / 2 + socketX * faceWidth;
  const topOffset = (Math.max(...layout.racks.map(r => r.heightU)) - equipmentTopU(equipment) + (socket?.y ?? .5) * equipment.heightU) * .04445;
  return { x, depth: topOffset, rack };
}
// Port numbers follow the displayed two-row template: 1–24 above, 25–48 below.
// Each endpoint exits its own half of the device, independently of the other rack.
export function endpointSide(layout: Layout, endpoint: Endpoint): Side {
  const { equipment } = resolveEndpoint(layout, endpoint);
  const socket = templatePort(equipment, endpoint.port, layout.templates) ?? (legacyFace(equipment) ? undefined : schematicSocket(equipment, endpoint.port));
  if (socket) return (endpointFace(layout, endpoint) === 'rear' ? 1 - socket.x : socket.x) < .5 ? 'left' : 'right';
  return portIndex(equipment, endpoint.port) % 24 < 12 ? 'left' : 'right';
}
export function routeSides(layout: Layout, cable: Cable): { from: Side; to: Side } {
  return { from: endpointSide(layout, cable.from), to: endpointSide(layout, cable.to) };
}
export function cableRoute(layout: Layout, cable: Cable) {
  const sides = routeSides(layout, cable);
  const cross = cable.from.rackId !== cable.to.rackId;
  // Opposite halves of the same rack also cross in the tray, never across the front.
  return { sides, cross, overhead: cross || sides.from !== sides.to };
}
export function estimateCable(layout: Layout, cable: Cable, cal: Calibration) {
  const problem = calibrationError(cal);
  if (problem) throw new Error(problem);
  const a = physicalEndpoint(layout, cable.from, cal), b = physicalEndpoint(layout, cable.to, cal);
  const { sides, cross, overhead } = cableRoute(layout, cable);
  const manager = (r: Rack, side: Side) => r.positionM + (side === 'right' ? rackFootprint(r, cal) - managerWidth(r, cal) / 2 : managerWidth(r, cal) / 2);
  const aVertical = a.depth + cal.trayAboveRackM, bVertical = b.depth + cal.trayAboveRackM;
  const managedVertical = overhead
    ? (hasVerticalManagement(a.rack) ? aVertical : 0) + (hasVerticalManagement(b.rack) ? bVertical : 0)
    : hasVerticalManagement(a.rack) ? Math.abs(a.depth - b.depth) : 0;
  const unmanagedVertical = overhead
    ? (hasVerticalManagement(a.rack) ? 0 : aVertical) + (hasVerticalManagement(b.rack) ? 0 : bVertical)
    : hasVerticalManagement(a.rack) ? 0 : Math.abs(a.depth - b.depth);
  const access = (r: Rack) => Math.max(0, managerExtension(r, cal) - managerWidth(r, cal) / 2);
  const managementAccess = access(a.rack) + access(b.rack);
  const ax = manager(a.rack, sides.from), bx = manager(b.rack, sides.to);
  const segments = {
    'Port to rack edge': Math.max(0, Math.abs(a.x - ax) + Math.abs(b.x - bx) - managementAccess),
    'Side manager access': managementAccess,
    'Managed vertical runs': managedVertical,
    'Unmanaged vertical runs': unmanagedVertical,
    'Overhead span': overhead ? Math.abs(bx - ax) : 0,
    'Bends & entry': cal.bendAllowanceM,
    'Service slack': cal.slackM,
  };
  const requiredM = Object.values(segments).reduce((a, b) => a + b, 0);
  const stock = cable.medium === 'fiber' ? (cal.fiberStock ?? []).filter(s => matchingFiberStock(cable, s)).map(s => s.lengthM) : cal.stockedLengthsM;
  const recommendedM = [...stock].filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b).find(n => n >= requiredM) ?? null;
  return { segments, requiredM, recommendedM, sides, cross, overhead };
}

// Rebuild record keys together so overlapping old/new ranges never overwrite a socket.
export function setEquipmentPortStart(layout: Layout, rackId: string, equipmentId: string, start: number | null): Layout {
  const { equipment } = resolveEquipment(layout, rackId, equipmentId);
  const template = findEquipmentTemplate(equipment.templateId ?? '', layout.templates);
  const portStart = start === null ? template?.portStart ?? 1 : start;
  if (!validPortRange(portStart, equipment.portCount)) throw new Error(`Use a whole starting number from 0 to ${MAX_PORT_NUMBER - equipment.portCount + 1}.`);
  const offset = portStart - firstPortNumber(equipment);
  const keys = new Map<string, Endpoint>();
  for (const port of portNumbers(equipment)) {
    const ep = { rackId, equipmentId, port }; keys.set(endpointKey(ep), { ...ep, port: port + offset });
  }
  const remapEndpoint = (ep: Endpoint) => keys.get(endpointKey(ep)) ?? ep;
  const remapRecords = <T,>(records: Record<string, T>) => Object.fromEntries(Object.entries(records).map(([key, value]) => [keys.has(key) ? endpointKey(keys.get(key)!) : key, value]));
  const updated = { ...equipment, portStart };
  if (start === null) delete updated.portStartOverride; else updated.portStartOverride = true;
  return { ...layout,
    racks: layout.racks.map(r => r.id === rackId ? { ...r, equipment: r.equipment.map(e => e.id === equipmentId ? updated : e) } : r),
    cables: layout.cables.map(c => ({ ...c, from: remapEndpoint(c.from), to: remapEndpoint(c.to) })),
    ...(layout.portVlans && { portVlans: remapRecords(layout.portVlans) }),
    ...(layout.portDetails && { portDetails: remapRecords(layout.portDetails) }),
    ...(layout.portMedia && { portMedia: remapRecords(layout.portMedia) }),
  };
}
