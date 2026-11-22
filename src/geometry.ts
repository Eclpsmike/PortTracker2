import { equipmentTemplate, templatePort, portFace, type EquipmentTemplate } from './equipmentTemplates';
import { hasVerticalManagement, type Rack, type Layout, type Endpoint, type Cable, type Equipment, resolveEndpoint, endpointFace, cableRoute, equipmentTopU, portIndex, legacyFace, schematicSocket } from './model';
// One shared scale for 19-inch equipment faces and 1.75-inch rack units.
const FACE_WIDTH = 334;
export const UNIT = FACE_WIDTH * 1.75 / 19, RACK_WIDTH = 430, RACK_GAP = 0, TOP = 108, MARGIN = 24;
// Include the cabinet frame in the pitch so adjacent outer edges touch.
export const RACK_FRAME_WIDTH = RACK_WIDTH + 6;
export const rackX = (index: number) => MARGIN + index * (RACK_FRAME_WIDTH + RACK_GAP);
// All visible rack bases share the floor set by the tallest visible rack.
export const rackTop = (layout: Layout, rackId: string, rackIds: string[]) => TOP + (Math.max(1, ...layout.racks.filter(r => rackIds.includes(r.id)).map(r => r.heightU)) - layout.racks.find(r => r.id === rackId)!.heightU) * UNIT;
export const sceneSize = (count: number, heightU = 42) => ({ width: MARGIN * 2 + count * RACK_WIDTH + Math.max(0, count - 1) * (RACK_FRAME_WIDTH - RACK_WIDTH + RACK_GAP), height: TOP + heightU * UNIT + 35 });
export const rackSideInset = (rack: Rack) => hasVerticalManagement(rack) ? 0 : 36;
export function rackOriginX(layout: Layout, id: string, ids: string[]) {
  const preceding = ids.slice(0, ids.indexOf(id)).map(id => layout.racks.find(r => r.id === id)!);
  return MARGIN + preceding.reduce((sum, r) => sum + RACK_FRAME_WIDTH - 2 * rackSideInset(r) + RACK_GAP, 0) - rackSideInset(layout.racks.find(r => r.id === id)!);
}
export function rackSceneSize(layout: Layout, ids: string[]) {
  const racks = ids.map(id => layout.racks.find(r => r.id === id)!);
  const size = sceneSize(ids.length, Math.max(1, ...racks.map(r => r.heightU)));
  return { ...size, width: size.width - racks.reduce((sum, r) => sum + 2 * rackSideInset(r), 0) };
}
export const EQUIPMENT_FACE = { x: 53, y: .25, width: FACE_WIDTH, height: UNIT - .5 };
export const equipmentFace = (e: Equipment) => ({ ...EQUIPMENT_FACE, height: UNIT * e.heightU - .5 });
// Fit without stretching or cropping. The image and every socket overlay must
// share these bounds, including any space around the fitted image.
export function equipmentImageBounds(equipment: Equipment, templates: readonly EquipmentTemplate[] = [], side:'front'|'rear'='front') {
  const template = equipmentTemplate(equipment, templates);
  const image=side==='rear'?template?.rearImage:template;
  const face = equipmentFace(equipment);
  if (!image) return face;
  const scale = Math.min(face.width / image.imageWidth, face.height / image.imageHeight);
  const width = image.imageWidth * scale, height = image.imageHeight * scale;
  return { x: face.x + (face.width - width) / 2, y: face.y + (face.height - height) / 2, width, height };
}
export function portSize(equipment: Equipment, port: number, templates: readonly EquipmentTemplate[] = []) {
  const socket = templatePort(equipment, port, templates);
  const bounds = equipmentImageBounds(equipment, templates, portFace(equipment, port, templates));
  return socket ? { width: socket.width * bounds.width, height: socket.height * bounds.height } : { width: 8.8, height: legacyFace(equipment) ? equipment.kind === 'switch' ? 6 : 10 : Math.min(10, bounds.height / Math.ceil(equipment.portCount / 24) * .65) };
}
export function equipmentPosition(layout: Layout, rackId: string, equipment: Equipment, rackIds: string[]) {
  const rack = layout.racks.find(r => r.id === rackId)!;
  return { x: rackOriginX(layout, rackId, rackIds), y: rackTop(layout, rackId, rackIds) + (rack.heightU - equipmentTopU(equipment)) * UNIT };
}
export function portPoint(layout: Layout, ep: Endpoint, rackIds: string[]) {
  const { equipment } = resolveEndpoint(layout, ep);
  const origin = equipmentPosition(layout, ep.rackId, equipment, rackIds);
  const socket = templatePort(equipment, ep.port, layout.templates);
  const bounds = equipmentImageBounds(equipment, layout.templates, endpointFace(layout, ep));
  if (socket) return { x: origin.x + bounds.x + socket.x * bounds.width, y: origin.y + bounds.y + socket.y * bounds.height };
  if (!legacyFace(equipment)) {
    const point = schematicSocket(equipment, ep.port);
    return { x: origin.x + bounds.x + point.x * bounds.width, y: origin.y + bounds.y + point.y * bounds.height };
  }
  const x = origin.x + 123 + (portIndex(equipment, ep.port) % 24) * 9.5;
  const y = origin.y + UNIT / 2 + (equipment.kind === 'switch' ? portIndex(equipment, ep.port) < 24 ? -3.7 : 3.7 : 0);
  return { x, y };
}
export function cablePoints(layout: Layout, cable: Cable, rackIds: string[], face: 'front' | 'rear' = 'front') {
  const a = portPoint(layout, cable.from, rackIds), b = portPoint(layout, cable.to, rackIds);
  const { sides, overhead } = cableRoute(layout, cable);
  const lane = (Number(cable.id.replace(/\D/g, '')) % 5 - 2) * 2.2;
  const manager = (rackId: string, side: string) => { const inset = hasVerticalManagement(layout.racks.find(r => r.id === rackId)!) ? 26 : 45; return rackOriginX(layout, rackId, rackIds) + ((face === 'rear' ? side === 'right' : side === 'left') ? inset : RACK_WIDTH - inset) + lane; };
  const ax = manager(cable.from.rackId, sides.from), bx = manager(cable.to.rackId, sides.to);
  const fromVisible = endpointFace(layout, cable.from) === face, toVisible = endpointFace(layout, cable.to) === face;
  if (!fromVisible && !toVisible) return [];
  // Stop at the manager when the other endpoint is on the opposite face.
  if (!toVisible) return [a, { x: ax, y: a.y }, { x: ax, y: a.y - 18 }];
  if (!fromVisible) return [b, { x: bx, y: b.y }, { x: bx, y: b.y - 18 }];
  return overhead ? [a, { x: ax, y: a.y }, { x: ax, y: 39 + lane }, { x: bx, y: 39 + lane }, { x: bx, y: b.y }, b] : [a, { x: ax, y: a.y }, { x: ax, y: b.y }, b];
}
export function roundedPath(points: { x: number; y: number }[], radius = 13) {
  if (!points.length) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], p = points[i], next = points[i + 1];
    const before = Math.hypot(p.x - prev.x, p.y - prev.y), after = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, before / 2, after / 2);
    if (before === 0 || after === 0) { d += ` L ${p.x} ${p.y}`; continue; }
    d += ` L ${p.x - (p.x - prev.x) / before * r} ${p.y - (p.y - prev.y) / before * r} Q ${p.x} ${p.y} ${p.x + (next.x - p.x) / after * r} ${p.y + (next.y - p.y) / after * r}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}
