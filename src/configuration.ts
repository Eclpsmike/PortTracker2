import { type FiberStock, validFiberStock } from './media';
import { type Vlan, type Cable, type PortVlans, VLANS, defaultCalibration, PORT_LOCATION_MAX } from './model';

export interface FacilityLocation { name: string; color: string }
export interface CableColor { name: string; color: string }
export interface Configuration { version: 1; vlans: Vlan[]; stockedLengthsM: number[]; fiberStock?: FiberStock[]; facilityLocations?: FacilityLocation[]; cableColors?: CableColor[]; defaultCableColor?: string }
export const DEFAULT_CABLE_COLORS: readonly CableColor[] = [
  { name: 'Blue', color: '#159de7' }, { name: 'Yellow', color: '#f3cf19' },
  { name: 'White', color: '#ffffff' }, { name: 'Black', color: '#000000' },
  { name: 'Gray', color: '#808080' }, { name: 'Red', color: '#e74c3c' },
  { name: 'Green', color: '#27ae60' }, { name: 'Orange', color: '#f39c12' },
  { name: 'Purple', color: '#9b59b6' },
];
export function configuredCableColors(configuration: Configuration): CableColor[] {
  const colors = new Map((configuration.cableColors ?? DEFAULT_CABLE_COLORS).map(value => [value.color.toLowerCase(), { ...value, color: value.color.toLowerCase() }]));
  for (const stock of configuration.fiberStock ?? []) {
    const color = stock.jacket.toLowerCase();
    if (!colors.has(color)) colors.set(color, { color, name: `Fiber stock ${color}` });
  }
  return [...colors.values()];
}
export function configuredDefaultCableColor(configuration: Configuration): string {
  const colors = configuredCableColors(configuration);
  const preferred = configuration.defaultCableColor?.toLowerCase() ?? '#159de7';
  return colors.find(color => color.color === preferred)?.color
    ?? colors.find(color => color.color === '#159de7')?.color ?? colors[0]?.color ?? '';
}
export function cableColorError(value: CableColor, colors: readonly CableColor[], editingColor?: string): string | null {
  if (!value.name.trim() || value.name.trim().length > 60) return 'Enter a color name between 1 and 60 characters.';
  if (!/^#[0-9a-f]{6}$/i.test(value.color)) return 'Choose a valid six-digit color.';
  if (colors.some(color => color.color !== editingColor && (color.color.toLowerCase() === value.color.toLowerCase() || color.name.toLowerCase() === value.name.trim().toLowerCase()))) return 'That cable color or name already exists.';
  return null;
}
export function facilityLocationError(value: FacilityLocation, locations: readonly FacilityLocation[], previousName?: string): string | null {
  if (!value.name.trim() || value.name.trim().length > PORT_LOCATION_MAX) return `Enter a location name between 1 and ${PORT_LOCATION_MAX} characters.`;
  if (locations.some(l => l.name !== previousName && l.name.toLowerCase() === value.name.trim().toLowerCase())) return 'That location name already exists.';
  if (!/^#[0-9a-f]{6}$/i.test(value.color)) return 'Choose a valid six-digit color.';
  return null;
}
export const CONFIGURATION_STORAGE_KEY = 'porttracker.configuration';
export function defaultConfiguration(): Configuration {
  return { version: 1, vlans: VLANS.map(v => ({ ...v })), stockedLengthsM: [...defaultCalibration.stockedLengthsM], defaultCableColor: '#159de7' };
}
export function vlanError(vlan: Vlan, vlans: readonly Vlan[], editingId?: number): string | null {
  if (!Number.isInteger(vlan.id) || vlan.id < 1 || vlan.id > 4094) return 'Use a VLAN ID from 1 to 4094.';
  if (editingId !== undefined && vlan.id !== editingId) return 'VLAN IDs stay fixed when editing. Add a new VLAN to use a different ID.';
  if (vlans.some(v => v.id === vlan.id && v.id !== editingId)) return 'That VLAN ID already exists.';
  if (!vlan.name.trim() || vlan.name.trim().length > 60) return 'Enter a VLAN name between 1 and 60 characters.';
  if (!/^#[0-9a-f]{6}$/i.test(vlan.color)) return 'Choose a valid six-digit color.';
  return null;
}
export function vlanRemovalError(id: number, cables: readonly Cable[], portVlans: PortVlans = {}): string | null {
  if (Object.values(portVlans).includes(id)) return 'Clear or reassign this VLAN’s port assignments before deleting it.';
  return cables.some(c => c.vlan === id) ? 'Reassign or remove this VLAN’s connections before deleting it.' : null;
}
export function stockLengthError(meters: number, stock: readonly number[], editingIndex?: number): string | null {
  if (!Number.isFinite(meters) || meters <= 0) return 'Enter a length greater than zero.';
  if (stock.some((n, index) => index !== editingIndex && Math.abs(n - meters) < 1e-6)) return 'That physical cable length is already in stock.';
  return null;
}
export function parseConfiguration(value: unknown): Configuration | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<Configuration>;
  if (data.version !== 1 || !Array.isArray(data.vlans) || !Array.isArray(data.stockedLengthsM)) return null;
  if (data.defaultCableColor !== undefined && (typeof data.defaultCableColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(data.defaultCableColor))) return null;
  const cableColors: CableColor[] = [];
  if (data.cableColors !== undefined) {
    if (!Array.isArray(data.cableColors) || data.cableColors.length > 1000) return null;
    for (const value of data.cableColors) {
      if (!value || typeof value.name !== 'string' || typeof value.color !== 'string' || cableColorError(value, cableColors)) return null;
      cableColors.push({ name: value.name.trim(), color: value.color.toLowerCase() });
    }
  }
  const vlans: Vlan[] = [];
  for (const v of data.vlans) {
    if (!v || typeof v.id !== 'number' || typeof v.name !== 'string' || typeof v.color !== 'string' || vlanError(v, vlans)) return null;
    vlans.push({ id: v.id, name: v.name.trim(), color: v.color });
  }
  const stock: number[] = [];
  for (const n of data.stockedLengthsM) {
    if (typeof n !== 'number' || stockLengthError(n, stock)) return null;
    stock.push(n);
  }
  if (data.fiberStock !== undefined && (!Array.isArray(data.fiberStock) || data.fiberStock.length > 1000 || !data.fiberStock.every(validFiberStock))) return null;
  const facilityLocations: FacilityLocation[] = [];
  if (data.facilityLocations !== undefined) {
    if (!Array.isArray(data.facilityLocations)) return null;
    for (const l of data.facilityLocations) {
      if (!l || typeof l.name !== 'string' || typeof l.color !== 'string' || facilityLocationError(l, facilityLocations)) return null;
      facilityLocations.push({ name: l.name.trim(), color: l.color });
    }
  }
  return { ...(data.defaultCableColor !== undefined && { defaultCableColor: data.defaultCableColor.toLowerCase() }), ...(data.cableColors !== undefined && { cableColors }), ...(data.facilityLocations !== undefined && { facilityLocations }), ...(data.fiberStock !== undefined && { fiberStock: structuredClone(data.fiberStock) }), version: 1, vlans: vlans.sort((a, b) => a.id - b.id), stockedLengthsM: stock.sort((a, b) => a - b) };
}
export function readConfiguration(): { configuration: Configuration; notice: string } {
  try {
    const raw = localStorage.getItem(CONFIGURATION_STORAGE_KEY);
    if (!raw) return { configuration: defaultConfiguration(), notice: '' };
    const configuration = parseConfiguration(JSON.parse(raw));
    if (configuration) return { configuration, notice: '' };
  } catch {
    return { configuration: defaultConfiguration(), notice: 'Saved configuration could not be read. Default values are shown; export your changes if browser storage is unavailable.' };
  }
  return { configuration: defaultConfiguration(), notice: 'Saved configuration was invalid. Default values are shown.' };
}
export function saveConfiguration(configuration: Configuration): boolean {
  try { localStorage.setItem(CONFIGURATION_STORAGE_KEY, JSON.stringify(configuration)); return true; }
  catch { return false; }
}
