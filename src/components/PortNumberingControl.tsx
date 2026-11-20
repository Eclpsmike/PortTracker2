import { useState } from 'react';
import { firstPortNumber, type Equipment } from '../model';
import { validPortRange, MAX_PORT_NUMBER } from '../portNumbering';
export function PortNumberingControl({ equipment, templateStart, onApply }: { equipment: Equipment; templateStart: number; onApply: (start: number | null) => void }) {
  const [start, setStart] = useState(firstPortNumber(equipment));
  const [error, setError] = useState('');
  const valid = validPortRange(start, equipment.portCount);
  function apply(value: number | null) { try { onApply(value); setError(''); } catch (e) { setError((e as Error).message); } }
  return <details className="port-numbering-control"><summary>Port numbering · {firstPortNumber(equipment)}–{firstPortNumber(equipment) + equipment.portCount - 1}</summary>
    <p className="note">{equipment.portStartOverride ? 'This device uses its own range.' : 'This device follows the template’s range.'} Changes here apply only to this device.</p>
    <label className="port-numbering-field">Starting port number<input aria-label="Equipment starting port number" type="number" min={0} max={MAX_PORT_NUMBER - equipment.portCount + 1} step={1} value={Number.isNaN(start) ? '' : start} onChange={e => { setStart(e.target.valueAsNumber); setError(''); }}/></label>
    <p className="note">{valid ? `New range: ${start}–${start + equipment.portCount - 1}.` : `Enter a whole number from 0 to ${MAX_PORT_NUMBER - equipment.portCount + 1}.`} Connections, VLANs, notes, and physical settings follow their sockets. Source image labels are unchanged.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="equipment-actions"><button className="secondary-button" disabled={!valid} onClick={() => apply(start)}>Save port range</button>{equipment.portStartOverride && <button className="secondary-button" onClick={() => apply(null)}>Use template range ({templateStart}–{templateStart + equipment.portCount - 1})</button>}</div>
  </details>;
}
