import { type FiberStock, validFiberStock } from './media';
import { type Vlan, type Cable, type PortVlans, VLANS, defaultCalibration, PORT_LOCATION_MAX } from './model';

export interface FacilityLocation { name: string; color: string }
export interface Configuration { version: 1; vlans: Vlan[]; stockedLengthsM: number[]; fiberStock?: FiberStock[]; facilityLocations?: FacilityLocation[] }
export function facilityLocationError(value: FacilityLocation, locations: readonly FacilityLocation[], previousName?: string): string | null {
  if (!value.name.trim() || value.name.trim().length > PORT_LOCATION_MAX) return `Enter a location name between 1 and ${PORT_LOCATION_MAX} characters.`;
  if (locations.some(l => l.name !== previousName && l.name.toLowerCase() === value.name.trim().toLowerCase())) return 'That location name already exists.';
  if (!/^#[0-9a-f]{6}$/i.test(value.color)) return 'Choose a valid six-digit color.';
  return null;
}
export const CONFIGURATION_STORAGE_KEY = 'porttracker.configuration';
export function defaultConfiguration(): Configuration {
  return { version: 1, vlans: VLANS.map(v => ({ ...v })), stockedLengthsM: [...defaultCalibration.stockedLengthsM] };
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
  return { ...(data.facilityLocations !== undefined && { facilityLocations }), ...(data.fiberStock !== undefined && { fiberStock: structuredClone(data.fiberStock) }), version: 1, vlans: vlans.sort((a, b) => a.id - b.id), stockedLengthsM: stock.sort((a, b) => a - b) };
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
