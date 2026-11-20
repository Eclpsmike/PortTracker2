import { useEffect, useRef, useState } from 'react';
import { type Layout, MAX_RACK_UNITS, equipmentTopU } from '../model';
import { Icon } from './Icon';

export function RenameCabinetDialog({ layout, initialRackId, onSave, onClose }: {
  layout: Layout; initialRackId: string; onSave: (rackId: string, name: string, heightU: number, verticalManagement: boolean) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initial = layout.racks.find(r => r.id === initialRackId) ?? layout.racks[0];
  const [rackId, setRackId] = useState(initial.id);
  const [name, setName] = useState(initial.label);
  const [heightU, setHeightU] = useState(initial.heightU);
  const [verticalManagement, setVerticalManagement] = useState(initial.verticalManagement !== false);
  const minimum = Math.max(1, ...layout.racks.find(r => r.id === rackId)!.equipment.map(equipmentTopU));
  const validHeight = Number.isInteger(heightU) && heightU >= minimum && heightU <= MAX_RACK_UNITS;
  const [error, setError] = useState('');
  useEffect(() => { const d = dialog.current!; d.showModal(); return () => d.close(); }, []);
  return <dialog ref={dialog} className="editor-dialog equipment-dialog" aria-labelledby="rename-cabinet-title" onCancel={onClose}>
    <form onSubmit={event => { event.preventDefault(); const trimmed = name.trim(); if (!trimmed || trimmed.length > 100) { setError('Enter a rack name between 1 and 100 characters.'); return; } if (!validHeight) { setError(`Rack height must be between ${minimum} and ${MAX_RACK_UNITS}U to fit the equipment.`); return; } onSave(rackId, trimmed, heightU, verticalManagement); }}>
      <div className="dialog-heading"><h2 id="rename-cabinet-title">Rack settings</h2><button type="button" className="icon-button" aria-label="Close rack name editor" onClick={onClose}><Icon name="close"/></button></div>
      <label>Rack<select aria-label="Rack to rename" value={rackId} onChange={event => { const rack = layout.racks.find(r => r.id === event.target.value)!; setRackId(rack.id); setName(rack.label); setHeightU(rack.heightU); setVerticalManagement(rack.verticalManagement !== false); setError(''); }}>{layout.racks.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
      <label>Rack name<input required maxLength={100} value={name} onChange={event => { setName(event.target.value); setError(''); }}/></label>
      <label>Rack units<input type="number" min={minimum} max={MAX_RACK_UNITS} step={1} required value={Number.isNaN(heightU) ? '' : heightU} onChange={e => setHeightU(e.target.valueAsNumber)}/></label>
      <label>Vertical cable management<select value={verticalManagement ? 'yes' : 'no'} onChange={e => setVerticalManagement(e.target.value === 'yes')}><option value="yes">Side managers on both sides</option><option value="no">No side managers</option></select></label>
      <p className="note">This name appears on the rack and in menus. Renaming preserves its equipment, connections, and port data.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!validHeight}>Save rack settings</button></div>
    </form>
  </dialog>;
}
