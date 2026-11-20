import { useEffect, useRef, useState } from 'react';
import { type Layout, rackRemovalImpact } from '../model';
import { Icon } from './Icon';

export function RemoveCabinetDialog({ layout, locationName, initialRackId, onClose, onRemove }: {
  layout: Layout; locationName: string; initialRackId: string;
  onClose: () => void; onRemove: (rackId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [rackId, setRackId] = useState(layout.racks.some(r => r.id === initialRackId) ? initialRackId : layout.racks[0].id);
  const impact = rackRemovalImpact(layout, rackId);
  useEffect(() => { const d = dialog.current!; d.showModal(); cancel.current?.focus(); return () => d.close(); }, []);
  return <dialog ref={dialog} className="editor-dialog remove-cabinet-dialog" aria-labelledby="remove-cabinet-title" onCancel={onClose}>
    <div className="dialog-heading"><h2 id="remove-cabinet-title">Remove rack</h2><button type="button" className="icon-button" aria-label="Close rack removal" onClick={onClose}><Icon name="close"/></button></div>
    <p className="subtle">Distribution frame: {locationName}</p>
    <label className="cabinet-removal-picker">Rack to remove<select value={rackId} onChange={event => setRackId(event.target.value)}>{layout.racks.map(rack => <option key={rack.id} value={rack.id}>{rack.label}</option>)}</select></label>
    <p>This will permanently delete <strong>{impact.rack.label}</strong> and the following data:</p>
    <dl className="cabinet-removal-impact">
      <div><dt>Equipment</dt><dd>{impact.equipment}</dd></div>
      <div><dt>Ports</dt><dd>{impact.ports}</dd></div>
      <div><dt>Cable connections</dt><dd>{impact.connections}</dd></div>
      <div><dt>Port VLAN assignments</dt><dd>{impact.vlanAssignments}</dd></div>
      <div><dt>Ports with location or notes</dt><dd>{impact.documentedPorts}</dd></div>
    </dl>
    <p className="note">Connections to other racks are also removed. Port VLAN assignments and notes on those other racks are preserved. This deletion is saved with the project.</p>
    {layout.racks.length === 1 && <p className="note">This is the last rack. The distribution frame will remain available with no racks.</p>}
    <div className="dialog-footer"><button ref={cancel} type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="danger-button" onClick={() => onRemove(rackId)}><Icon name="trash"/>Delete rack</button></div>
  </dialog>;
}
