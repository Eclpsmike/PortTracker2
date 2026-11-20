export const PORT_KINDS = { copper: 'Copper (RJ45)', fiber: 'Fiber port', sfp: 'SFP slot', 'sfp-plus': 'SFP+ slot', sfp28: 'SFP28 slot', qsfp: 'QSFP slot', qsfp28: 'QSFP28 slot' } as const;
export type PortKind = keyof typeof PORT_KINDS;
export const FIBER_CONNECTORS = ['LC', 'SC', 'ST', 'MPO'] as const;
export type FiberConnector = typeof FIBER_CONNECTORS[number];
export type FiberMode = 'single-mode' | 'multimode';
export interface PortMedia { kind: PortKind; connector?: FiberConnector | 'RJ45'; mode?: FiberMode; strands?: number; transceiver?: string }
export interface FiberCable { mode: FiberMode; fromConnector: FiberConnector; toConnector: FiberConnector; strands: number }
export interface FiberStock extends FiberCable { lengthM: number; jacket: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const connector = (v: unknown): v is FiberConnector => FIBER_CONNECTORS.includes(v as FiberConnector);
const mode = (v: unknown) => v === 'single-mode' || v === 'multimode';
const strands = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 144;
export const isSlot = (p: PortMedia) => p.kind !== 'copper' && p.kind !== 'fiber';
export const portMedium = (p: PortMedia) => p.kind === 'copper' || p.connector === 'RJ45' ? 'copper' : 'fiber';
export function validPortMedia(v: unknown): v is PortMedia {
  if (!object(v) || typeof v.kind !== 'string' || !Object.hasOwn(PORT_KINDS, v.kind)) return false;
  if (v.connector !== undefined && v.connector !== 'RJ45' && !connector(v.connector)) return false;
  if (v.mode !== undefined && !mode(v.mode) || v.strands !== undefined && !strands(v.strands)) return false;
  if (v.transceiver !== undefined && (typeof v.transceiver !== 'string' || v.transceiver.length > 200)) return false;
  if (v.kind === 'copper' && (v.connector !== undefined && v.connector !== 'RJ45' || v.mode !== undefined || v.strands !== undefined || v.transceiver !== undefined)) return false;
  if (v.kind === 'fiber' && (v.connector === 'RJ45' || v.transceiver !== undefined)) return false;
  if (v.connector === 'RJ45' && (v.mode !== undefined || v.strands !== undefined)) return false;
  return true;
}
export function validFiberCable(v: unknown): v is FiberCable {
  return object(v) && mode(v.mode) && connector(v.fromConnector) && connector(v.toConnector) && strands(v.strands);
}
export function validFiberStock(v: unknown): v is FiberStock {
  return validFiberCable(v) && object(v) && typeof v.lengthM === 'number' && Number.isFinite(v.lengthM) && v.lengthM > 0 && typeof v.jacket === 'string' && /^#[0-9a-f]{6}$/i.test(v.jacket);
}
export const defaultFiber = (): FiberCable => ({ mode: 'single-mode', fromConnector: 'LC', toConnector: 'LC', strands: 2 });
export function inferPortMedia(type: string): PortMedia {
  const t = type.toLowerCase();
  if (t.includes('qsfp28')) return { kind: 'qsfp28' };
  if (t.includes('qsfp')) return { kind: 'qsfp' };
  if (t.includes('sfp28')) return { kind: 'sfp28' };
  if (t.includes('sfpp') || t.includes('sfp+')) return { kind: 'sfp-plus' };
  if (t.includes('sfp')) return { kind: 'sfp' };
  const found = FIBER_CONNECTORS.find(c => t === c.toLowerCase() || t.startsWith(`${c.toLowerCase()}-`));
  return found ? { kind: 'fiber', connector: found } : { kind: 'copper' };
}
export function mediaLabel(p: PortMedia): string {
  return [PORT_KINDS[p.kind], p.connector, p.mode === 'single-mode' ? 'Single-mode' : p.mode === 'multimode' ? 'Multimode' : '', p.strands ? `${p.strands} strands` : '', p.transceiver].filter(Boolean).join(' · ');
}
export function fiberLabel(f: FiberCable) { return `${f.mode === 'single-mode' ? 'Single-mode' : 'Multimode'} · ${f.fromConnector}–${f.toConnector} · ${f.strands} strands`; }
export function matchingFiberStock(cable: { fiber?: FiberCable; jacket: string }, stock: FiberStock) {
  const f = cable.fiber;
  return !!f && f.mode === stock.mode && f.strands === stock.strands && cable.jacket.toLowerCase() === stock.jacket.toLowerCase() &&
    (f.fromConnector === stock.fromConnector && f.toConnector === stock.toConnector || f.fromConnector === stock.toConnector && f.toConnector === stock.fromConnector);
}
