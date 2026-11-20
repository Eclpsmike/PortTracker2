export type LengthUnit = 'metric' | 'imperial';
export const LENGTH_UNIT_STORAGE_KEY = 'porttracker.lengthUnit';
const METERS_PER_INCH = 0.0254;
const METERS_PER_FOOT = 0.3048;

export const lengthUnitSymbol = (unit: LengthUnit) => unit === 'imperial' ? 'in' : 'm';
export const fromMeters = (meters: number, unit: LengthUnit) => unit === 'imperial' ? meters / METERS_PER_INCH : meters;
export const toMeters = (value: number, unit: LengthUnit) => unit === 'imperial' ? value * METERS_PER_INCH : value;
export const formatLengthValue = (meters: number, unit: LengthUnit) => fromMeters(meters, unit).toFixed(2);
export const formatLengthInput = (meters: number, unit: LengthUnit) => String(Number(fromMeters(meters, unit).toFixed(6)));

// Cable estimates use feet; calibration and stock editing retain inch inputs.
export const cableLengthUnitSymbol = (unit: LengthUnit) => unit === 'imperial' ? 'ft' : 'm';
export const formatCableLengthValue = (meters: number, unit: LengthUnit) => (unit === 'imperial' ? meters / METERS_PER_FOOT : meters).toFixed(2);

export function readLengthUnit(): LengthUnit {
  try { return localStorage.getItem(LENGTH_UNIT_STORAGE_KEY) === 'imperial' ? 'imperial' : 'metric'; }
  catch { return 'metric'; }
}
export function saveLengthUnit(unit: LengthUnit) {
  try { localStorage.setItem(LENGTH_UNIT_STORAGE_KEY, unit); }
  catch { /* The selector still works for this session when storage is unavailable. */ }
}
