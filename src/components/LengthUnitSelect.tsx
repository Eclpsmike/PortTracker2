import type { LengthUnit } from '../units';
export function LengthUnitSelect({ value, onChange, imperialSymbol = 'in' }: { value: LengthUnit; onChange: (unit: LengthUnit) => void; imperialSymbol?: 'in' | 'ft' }) {
  return <label className="length-unit-select">Length units
    <select value={value} onChange={event => onChange(event.target.value as LengthUnit)}>
      <option value="metric">Metric (m)</option>
      <option value="imperial">Standard / US ({imperialSymbol})</option>
    </select>
  </label>;
}
