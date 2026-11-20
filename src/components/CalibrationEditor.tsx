import { useEffect, useRef, useState } from 'react';
import { calibrationError, type Calibration } from '../model';
import { type LengthUnit, formatLengthInput, formatLengthValue, lengthUnitSymbol, toMeters } from '../units';
import { Icon } from './Icon';
import { LengthUnitSelect } from './LengthUnitSelect';

const fields = [
  ['rackWidthM', 'Rack width'],
  ['equipmentWidthM', 'Equipment width'],
  ['verticalManagerWidthM', 'Side manager width (each)'],
  ['managerOverlapM', 'Manager overlap on rack (each)'],
  ['trayAboveRackM', 'Tray above rack'],
  ['bendAllowanceM', 'Bends & entry allowance'],
  ['slackM', 'Service slack'],
  ['gapM', 'Gap between racks'],
] as const;
type Field = typeof fields[number][0];
type Measurements = Record<Field, number>;
const inputValues = (values: Measurements, unit: LengthUnit) => Object.fromEntries(
  fields.map(([key]) => [key, formatLengthInput(values[key], unit)]),
) as Record<Field, string>;

export function CalibrationEditor({ value, spacing, unit, onSave, onClose }: {
  value: Calibration; spacing: number; unit: LengthUnit;
  onSave: (cal: Calibration, spacing: number, unit: LengthUnit) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draftUnit, setDraftUnit] = useState(unit);
  // Keep unrounded meters separately so changing units or saving untouched inputs never changes measurements.
  const [measurements, setMeasurements] = useState<Measurements>({ ...value, equipmentWidthM: value.equipmentWidthM ?? 19 * .0254, managerOverlapM: value.managerOverlapM ?? 0, verticalManagerWidthM: value.verticalManagerWidthM ?? 0, gapM: spacing });
  const [drafts, setDrafts] = useState(() => inputValues(measurements, unit));
  const symbol = lengthUnitSymbol(draftUnit);
  const problem = calibrationError({ ...value, ...measurements });
  useEffect(() => { const d = dialog.current!; d.showModal(); return () => d.close(); }, []);

  function changeUnit(next: LengthUnit) {
    const nextDrafts = inputValues(measurements, next);
    for (const [key] of fields) if (drafts[key] === '') nextDrafts[key] = '';
    setDrafts(nextDrafts);
    setDraftUnit(next);
  }

  return <dialog ref={dialog} className="calibration-dialog" onCancel={onClose} aria-labelledby="calibration-title">
    <form onSubmit={event => {
      event.preventDefault();
      if (problem) return;
      const { gapM, ...values } = measurements;
      onSave({ ...value, ...values }, gapM, draftUnit);
    }}>
      <div className="dialog-heading"><div><span className="eyebrow">ILLUSTRATIVE MEASUREMENTS</span><h2 id="calibration-title">Length calibration</h2></div><button type="button" className="icon-button" aria-label="Close calibration" onClick={onClose}><Icon name="close"/></button></div>
      <p className="note">Example values only. Verify measurements at the installation before ordering cables. These values do not depend on zoom or SVG pixels.</p>
      <LengthUnitSelect value={draftUnit} onChange={changeUnit}/>
      <p className="note">Rack width is the outer frame width. Equipment is centered inside it. Manager overlap is the portion mounted over the frame: a 5-inch manager overlapping 1 inch adds only 4 inches outside the rack. The gap is clear space between the outermost edges of adjacent racks and managers. Routes follow the center of each manager.</p>
      {fields.map(([key, label]) => <label className="calibration-field" key={key}>{label}<span>
        <input aria-label={label} aria-describedby="calibration-unit" type="number" step="any" min={Number(formatLengthInput(key === 'rackWidthM' ? .1 : 0, draftUnit))} max={Number(formatLengthInput(20, draftUnit))} required value={drafts[key]} onChange={event => {
          const raw = event.target.value;
          setDrafts({ ...drafts, [key]: raw });
          if (raw !== '' && Number.isFinite(event.target.valueAsNumber)) setMeasurements({ ...measurements, [key]: toMeters(event.target.valueAsNumber, draftUnit) });
        }}/>{symbol}
      </span></label>)}
      <p className="note" id="calibration-unit">Measurements in {draftUnit === 'imperial' ? 'inches (in)' : 'meters (m)'}. Rack U: {draftUnit === 'imperial' ? '1.75 in' : '44.45 mm'}. Equipment width defaults to 19 inches; mapped ports use their position within that face.</p>
      {problem && <p className="form-error" role="alert">{problem}</p>}
      <p className="note">Stock lengths: {value.stockedLengthsM.map(n => formatLengthValue(n, draftUnit)).join(', ')} {symbol}. Changing units shows the same stocked cables in the selected units.</p>
      <div className="dialog-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={!!problem}>Apply values</button></div>
    </form>
  </dialog>;
}
