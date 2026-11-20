import { validPortRange } from './portNumbering';
import { assertStackLayout } from './stacks';
import { migrateFacilityLocations } from './facilityLocations';
import { validPortMedia } from './media';
import { validCustomTemplates } from './templateImport';
import { findEquipmentTemplate, compatibleTemplate, type EquipmentTemplate } from './equipmentTemplates';
import { type Layout, type Calibration, type Endpoint, fixtureLayout, defaultCalibration, resolveEndpoint, connectionError, validPortDetails, firstPortNumber, portNumbers, endpointKey, cableMediaError, MAX_RACK_UNITS, calibrationError } from './model';
import { type Configuration, parseConfiguration, readConfiguration } from './configuration';
import { type LengthUnit, readLengthUnit } from './units';

export const PROJECT_STORAGE_KEY = 'porttracker.project';
export interface Building { id: string; name: string }
export interface Closet {
  id: string; name: string; type: 'MDF' | 'IDF'; buildingId: string; floor: string; room: string; notes: string; archived: boolean;
  layout: Layout; calibration: Calibration; rackGap: number;
}
export interface Project {
  templates?: EquipmentTemplate[];
  schemaVersion: 2; id: string; siteName: string; buildings: Building[]; locations: Closet[];
  activeLocationId: string; configuration: Configuration; preferences: { lengthUnit: LengthUnit; rackZoom?: number; singleRackZoom?: number };
}
export const newId = () => crypto.randomUUID();
export function defaultProject(configuration: Configuration, lengthUnit: LengthUnit): Project {
  return { schemaVersion: 2, id: newId(), siteName: 'Main site', buildings: [{ id: 'building-a', name: 'Building A' }],
    locations: [{ id: 'idf-01', name: 'IDF-01', type: 'IDF', buildingId: 'building-a', floor: '', room: 'Network closet', notes: '', archived: false,
      layout: fixtureLayout(configuration.vlans), calibration: structuredClone(defaultCalibration), rackGap: .25 }],
    activeLocationId: 'idf-01', configuration, preferences: { lengthUnit } };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 100): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const id = (v: unknown): v is string => text(v) && /^[\w-]+$/.test(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const optionalText = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
function validCalibration(v: unknown): v is Calibration {
  return record(v) && finite(v.rackWidthM) && v.rackWidthM > 0 && finite(v.trayAboveRackM) && finite(v.bendAllowanceM) && finite(v.slackM)
    && (v.verticalManagerWidthM === undefined || finite(v.verticalManagerWidthM))
    && (v.equipmentWidthM === undefined || finite(v.equipmentWidthM))
    && (v.managerOverlapM === undefined || finite(v.managerOverlapM))
    && calibrationError(v as unknown as Calibration) === null
    && Array.isArray(v.stockedLengthsM) && v.stockedLengthsM.every(n => finite(n) && n > 0);
}
function validLayout(value: unknown, config: Configuration, templates: EquipmentTemplate[] = []): value is Layout {
  if (!record(value) || value.templates !== undefined || !Array.isArray(value.racks) || value.racks.length > 100 || !Array.isArray(value.cables)) return false;
  const rackIds = new Set<string>();
  const portKeys = new Set<string>(), patchPortKeys = new Set<string>();
  for (const r of value.racks) {
    if (!record(r) || !id(r.id) || rackIds.has(r.id) || !text(r.label) || !Number.isInteger(r.heightU) || Number(r.heightU) < 1 || Number(r.heightU) > MAX_RACK_UNITS || !finite(r.positionM) || !Array.isArray(r.equipment) || r.equipment.length > Number(r.heightU)) return false;
    if (r.verticalManagement !== undefined && typeof r.verticalManagement !== 'boolean') return false;
    rackIds.add(r.id);
    const equipmentIds = new Set<string>(), occupied = new Set<number>();
    for (const e of r.equipment) {
      if (!record(e) || !id(e.id) || equipmentIds.has(e.id) || !text(e.label) || !['patch-panel', 'switch'].includes(String(e.kind)) || !Number.isInteger(e.heightU) || Number(e.heightU) < 1 || !Number.isInteger(e.bottomU) || Number(e.bottomU) < 1 || Number(e.bottomU) + Number(e.heightU) - 1 > Number(r.heightU) || !Number.isInteger(e.portCount) || Number(e.portCount) < 1 || Number(e.portCount) > 256) return false;
      if (e.templateId !== undefined) {
        if (typeof e.templateId !== 'string') return false;
        const template = findEquipmentTemplate(e.templateId, templates);
        if (!template || !compatibleTemplate(e as unknown as Layout['racks'][number]['equipment'][number], template)) return false;
      }
      if (!validPortRange(e.portStart === undefined ? 1 : e.portStart, Number(e.portCount))) return false;
      if (e.portStartOverride !== undefined && (typeof e.portStartOverride !== 'boolean' || e.portStartOverride && e.portStart === undefined)) return false;
      if (e.firstNumber !== undefined && (!Number.isInteger(e.firstNumber) || Number(e.firstNumber) < 1)) return false;
      equipmentIds.add(e.id);
      for (let u = Number(e.bottomU); u < Number(e.bottomU) + Number(e.heightU); u++) { if (occupied.has(u)) return false; occupied.add(u); }
      for (let port = Number(e.portStart ?? 1); port < Number(e.portStart ?? 1) + Number(e.portCount); port++) {
        const key = `${r.id}/${e.id}/${port}`;
        portKeys.add(key);
        if (e.kind === 'patch-panel') patchPortKeys.add(key);
      }
    }
  }
  if (value.portMedia !== undefined) {
    if (!record(value.portMedia)) return false;
    for (const [key, media] of Object.entries(value.portMedia)) if (!portKeys.has(key) || !validPortMedia(media)) return false;
  }
  const layout = { ...value, templates } as unknown as Layout;
  try { assertStackLayout(layout); } catch { return false; }
  const cableIds = new Set<string>();
  for (const c of value.cables) {
    if (!record(c) || !id(c.id) || cableIds.has(c.id) || typeof c.jacket !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.jacket)) return false;
    for (const ep of [c.from, c.to]) {
      if (!record(ep) || !id(ep.rackId) || !id(ep.equipmentId) || !Number.isInteger(ep.port)) return false;
      try { resolveEndpoint(layout, ep as unknown as Endpoint); } catch { return false; }
    }
    if (connectionError(layout, c as unknown as Layout['cables'][number], config.vlans)) return false;
    cableIds.add(c.id);
  }
  if (value.portVlans !== undefined) {
    if (!record(value.portVlans)) return false;
    for (const [key, vlan] of Object.entries(value.portVlans)) if (!portKeys.has(key) || !config.vlans.some(v => v.id === vlan)) return false;
  }
  if (value.portDetails !== undefined) {
    if (!record(value.portDetails)) return false;
    for (const [key, details] of Object.entries(value.portDetails)) if (!portKeys.has(key) || !validPortDetails(details) || (!patchPortKeys.has(key) && details.notes !== '')) return false;
  }
  return true;
}
export function parseProject(value: unknown): Project | null {
  if (!record(value) || value.schemaVersion !== 2 || !id(value.id) || !text(value.siteName) || !Array.isArray(value.buildings) || !Array.isArray(value.locations) || !value.locations.length || value.locations.length > 100) return null;
  if (value.templates !== undefined && !validCustomTemplates(value.templates)) return null;
  const config = parseConfiguration(value.configuration);
  if (!config || !record(value.preferences) || !['metric', 'imperial'].includes(String(value.preferences.lengthUnit))) return null;
  if (value.preferences.rackZoom !== undefined && (!finite(value.preferences.rackZoom) || value.preferences.rackZoom < .12 || value.preferences.rackZoom > 2)) return null;
  if (value.preferences.singleRackZoom !== undefined && (!finite(value.preferences.singleRackZoom) || value.preferences.singleRackZoom < .12 || value.preferences.singleRackZoom > 8)) return null;
  const buildingIds = new Set<string>(), buildingNames = new Set<string>(), locationIds = new Set<string>(), locationNames = new Set<string>();
  for (const b of value.buildings) {
    if (!record(b) || !id(b.id) || buildingIds.has(b.id) || !text(b.name) || buildingNames.has(b.name.trim().toLowerCase())) return null;
    buildingIds.add(b.id); buildingNames.add(b.name.trim().toLowerCase());
  }
  for (const l of value.locations) {
    if (!record(l) || !id(l.id) || locationIds.has(l.id) || !text(l.name) || !['MDF', 'IDF'].includes(String(l.type)) || typeof l.buildingId !== 'string' || !buildingIds.has(l.buildingId) || !optionalText(l.floor, 100) || !optionalText(l.room, 100) || !optionalText(l.notes, 2000) || typeof l.archived !== 'boolean' || !finite(l.rackGap) || !validCalibration(l.calibration) || !validLayout(l.layout, config, (value.templates ?? []) as EquipmentTemplate[])) return null;
    const nameKey = `${l.buildingId}/${l.name.trim().toLowerCase()}`;
    if (locationNames.has(nameKey)) return null;
    locationIds.add(l.id); locationNames.add(nameKey);
  }
  if (!value.locations.some(l => l.id === value.activeLocationId && !l.archived)) return null;
  return migrateFacilityLocations(structuredClone({ ...value, configuration: config }) as unknown as Project);
}
export function importProject(value: unknown): Project | null {
  const project = parseProject(value);
  if (project) return project;
  // Accept exports from the original single-cabinet demo.
  if (!record(value) || value.schemaVersion !== 1) return null;
  const config = parseConfiguration(value.configuration);
  if (!config || !validLayout(value.layout, config) || !validCalibration(value.calibration)) return null;
  const unit = record(value.preferences) && value.preferences.lengthUnit === 'imperial' ? 'imperial' : 'metric';
  const migrated = defaultProject(config, unit);
  migrated.locations[0].layout = structuredClone(value.layout);
  migrated.locations[0].calibration = structuredClone(value.calibration);
  return migrateFacilityLocations(migrated);
}
export function readProject(): { project: Project; notice: string; blocked: boolean } {
  const legacy = readConfiguration();
  const fallback = () => defaultProject(legacy.configuration, readLengthUnit());
  try {
    const raw = localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return { project: fallback(), notice: legacy.notice, blocked: false };
    const project = parseProject(JSON.parse(raw));
    if (project) return { project, notice: '', blocked: false };
  } catch { /* Preserve unreadable saved data until the user chooses a recovery action. */ }
  return { project: fallback(), notice: 'Saved project could not be read. The starting rack is shown; the saved project has not been replaced. Import a backup or choose Start new project to save again.', blocked: true };
}
export function saveProject(project: Project): boolean {
  try { localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project)); return true; } catch { return false; }
}
export interface LocationDraft { name: string; type: 'MDF' | 'IDF'; building: string; floor: string; room: string; notes: string }
export function upsertLocation(project: Project, draft: LocationDraft, editingId?: string, copyFromId?: string): Project {
  if (!editingId && project.locations.length >= 100) throw new Error('This project already has 100 distribution frames.');
  if (!['MDF', 'IDF'].includes(draft.type)) throw new Error('Choose MDF or IDF.');
  if (!text(draft.name) || !text(draft.building) || !optionalText(draft.floor, 100) || !optionalText(draft.room, 100) || !optionalText(draft.notes, 2000)) throw new Error('Enter a distribution frame name and building (up to 100 characters). Notes may contain up to 2,000 characters.');
  const building = project.buildings.find(b => b.name.trim().toLowerCase() === draft.building.trim().toLowerCase()) ?? { id: newId(), name: draft.building.trim() };
  if (project.locations.some(l => l.id !== editingId && l.buildingId === building.id && l.name.trim().toLowerCase() === draft.name.trim().toLowerCase())) throw new Error('That distribution frame name already exists in this building.');
  const existing = project.locations.find(l => l.id === editingId);
  const source = project.locations.find(l => l.id === copyFromId);
  const location: Closet = { id: existing?.id ?? newId(), type: draft.type, floor: draft.floor.trim(), room: draft.room.trim(), notes: draft.notes.trim(), name: draft.name.trim(), buildingId: building.id, archived: existing?.archived ?? false,
    layout: existing?.layout ?? { racks: source ? structuredClone(source.layout.racks) : [], cables: [], portVlans: {}, ...(source?.layout.stacks && { stacks: structuredClone(source.layout.stacks) }), ...(source?.layout.portMedia && { portMedia: structuredClone(source.layout.portMedia) }) },
    calibration: existing?.calibration ?? structuredClone(source?.calibration ?? defaultCalibration), rackGap: existing?.rackGap ?? source?.rackGap ?? .25 };
  return { ...project, buildings: project.buildings.some(b => b.id === building.id) ? project.buildings : [...project.buildings, building], locations: existing ? project.locations.map(l => l.id === existing.id ? location : l) : [...project.locations, location] };
}
export function archiveLocation(project: Project, id: string): Project {
  const active = project.locations.filter(l => !l.archived && l.id !== id);
  if (!active.length) throw new Error('Keep at least one active distribution frame.');
  return { ...project, locations: project.locations.map(l => l.id === id ? { ...l, archived: true } : l), activeLocationId: project.activeLocationId === id ? active[0].id : project.activeLocationId };
}


export function projectLayout(project: Project, locationId: string): Layout {
  const location = project.locations.find(l => l.id === locationId);
  if (!location) throw new Error('Choose an existing distribution frame.');
  return { ...location.layout, templates: project.templates ?? [] };
}
export function templateUsage(project: Project, templateId: string): number {
  return project.locations.reduce((count, location) => count + location.layout.racks.reduce((n, rack) => n + rack.equipment.filter(e => e.templateId === templateId).length, 0), 0);
}
export function saveEquipmentTemplate(project: Project, template: EquipmentTemplate): Project {
  const existing = project.templates?.find(t => t.id === template.id);
  if (project.templates?.some(t => t.id !== template.id && t.name.trim().toLowerCase() === template.name.trim().toLowerCase())) throw new Error('A template with that name already exists.');
  if (existing && templateUsage(project, template.id) && (existing.kind !== template.kind || existing.heightU !== template.heightU || existing.portCount !== template.portCount || existing.ports.some((p, i) => p.name !== template.ports[i]?.name))) throw new Error('Used templates must retain their type, rack height, and numbered port identities.');
  const templates = existing ? project.templates!.map(t => t.id === template.id ? template : t) : [...(project.templates ?? []), template];
  if (!validCustomTemplates(templates)) throw new Error('Check every socket is mapped, inside the image, and does not overlap another socket. The library supports 30 templates and 4 MB of embedded image data.');
  const locations = existing && firstPortNumber(existing) !== firstPortNumber(template) ? project.locations.map(location => {
    const keys = new Map<string, Endpoint>();
    const racks = location.layout.racks.map(rack => ({ ...rack, equipment: rack.equipment.map(equipment => {
      if (equipment.templateId !== template.id || equipment.portStartOverride) return equipment;
      const offset = firstPortNumber(template) - firstPortNumber(equipment);
      for (const port of portNumbers(equipment)) {
        const endpoint = { rackId: rack.id, equipmentId: equipment.id, port };
        keys.set(endpointKey(endpoint), { ...endpoint, port: port + offset });
      }
      return { ...equipment, portStart: firstPortNumber(template) };
    }) }));
    const remapEndpoint = (endpoint: Endpoint) => keys.get(endpointKey(endpoint)) ?? endpoint;
    const remapRecords = <T,>(records: Record<string, T>) => Object.fromEntries(Object.entries(records).map(([key, value]) => [keys.has(key) ? endpointKey(keys.get(key)!) : key, value]));
    return { ...location, layout: { ...location.layout, racks,
      cables: location.layout.cables.map(cable => ({ ...cable, from: remapEndpoint(cable.from), to: remapEndpoint(cable.to) })),
      ...(location.layout.portVlans && { portVlans: remapRecords(location.layout.portVlans) }),
      ...(location.layout.portMedia && { portMedia: remapRecords(location.layout.portMedia) }),
      ...(location.layout.portDetails && { portDetails: remapRecords(location.layout.portDetails) }),
    } };
  }) : project.locations;
  for (const location of locations) for (const cable of location.layout.cables) {
    const problem = cableMediaError({ ...location.layout, templates }, cable);
    if (problem) throw new Error(`${location.name} / ${cable.id}: ${problem}`);
  }
  return { ...project, locations, templates: structuredClone(templates) };
}
export function removeEquipmentTemplate(project: Project, templateId: string): Project {
  if (templateUsage(project, templateId)) throw new Error('This template is used by equipment and cannot be removed.');
  return { ...project, templates: (project.templates ?? []).filter(t => t.id !== templateId) };
}
