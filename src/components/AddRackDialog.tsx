import { useEffect, useRef, useState } from 'react';
import { MAX_RACK_UNITS } from '../model';
import { Icon } from './Icon';

export function AddRackDialog({ template, onSave, onClose }: {
  template: boolean; onSave: (heightU: number, verticalManagement: boolean) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [heightU, setHeightU] = useState(42);
  const [verticalManagement, setVerticalManagement] = useState(true);
  const minimum = template ? 25 : 1;
  const valid = Number.isInteger(heightU) && heightU >= minimum && heightU <= MAX_RACK_UNITS;
  useEffect(() => { const current = dialog.current!; current.showModal(); return () => current.close(); }, []);
  return <dialog ref={dialog} className="editor-dialog equipment-dialog" aria-labelledby="add-rack-title" onCancel={onClose}>
    <form onSubmit={event => { event.preventDefault(); if (valid) onSave(heightU, verticalManagement); }}>
      <div className="dialog-heading"><h2 id="add-rack-title">Add {template ? 'template' : 'empty'} rack</h2><button type="button" className="icon-button" aria-label="Close rack editor" onClick={onClose}><Icon name="close"/></button></div>
      <label>Rack units<input type="number" min={minimum} max={MAX_RACK_UNITS} step={1} required value={Number.isNaN(heightU) ? '' : heightU} onChange={event => setHeightU(event.target.valueAsNumber)}/></label>
      <label>Vertical cable management<select value={verticalManagement ? 'yes' : 'no'} onChange={e => setVerticalManagement(e.target.value === 'yes')}><option value="yes">Side managers on both sides</option><option value="no">No side managers</option></select></label>
      <p className="note">{template ? 'The standard layout needs at least 25U for its patch panels and switches.' : `Choose a whole rack height from 1U to ${MAX_RACK_UNITS}U.`}</p>
      <div className="dialog-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!valid}>Add rack</button></div>
    </form>
  </dialog>;
}
