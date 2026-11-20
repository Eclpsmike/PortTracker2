import { useState } from 'react';
import type { FacilityLocation } from '../configuration';
import { type Endpoint, type Layout, type PatchPortDetails, patchPortDetails, PORT_LOCATION_MAX, PORT_NOTES_MAX } from '../model';

type Action = 'keep' | 'replace' | 'clear';
const fields = [
  { key: 'facilityLocation', label: 'Facility location', max: PORT_LOCATION_MAX },
  { key: 'notes', label: 'Port notes', max: PORT_NOTES_MAX },
] as const;

export function BulkPatchPortDetailsControl({ layout, endpoints, onApply, locations, notesEnabled = true }: {
  layout: Layout; endpoints: readonly Endpoint[]; locations: readonly FacilityLocation[]; notesEnabled?: boolean; onApply: (changes: Partial<PatchPortDetails>) => void;
}) {
  const [actions, setActions] = useState<Record<keyof PatchPortDetails, Action>>({ facilityLocation: 'keep', notes: 'keep' });
  const [values, setValues] = useState<PatchPortDetails>({ facilityLocation: '', notes: '' });
  const shownFields = fields.filter(field => notesEnabled || field.key !== 'notes');
  const changed = shownFields.filter(field => actions[field.key] !== 'keep');
  const canApply = endpoints.length > 0 && changed.length > 0 && changed.every(field => actions[field.key] !== 'replace' || (field.key === 'facilityLocation' ? locations.some(l => l.name === values.facilityLocation) : values[field.key].trim().length > 0));
  function apply() {
    if (!canApply) return;
    const changes: Partial<PatchPortDetails> = {};
    for (const field of changed) changes[field.key] = actions[field.key] === 'clear' ? '' : values[field.key];
    onApply(changes);
    setActions({ facilityLocation: 'keep', notes: 'keep' });
    setValues({ facilityLocation: '', notes: '' });
  }
  return <section className="patch-port-details bulk-port-details" aria-label={notesEnabled ? 'Bulk patch-panel port details' : 'Bulk port location assignment'}>
    <h3>Port details for selected ports</h3>
    <p className="note">Choose which fields to update. Keep existing values preserves each port’s information.</p>
    {shownFields.map(field => {
      const currentValues = new Set(endpoints.map(endpoint => patchPortDetails(layout, endpoint)[field.key]));
      const current = currentValues.size > 1 ? 'Mixed values' : currentValues.values().next().value || 'Not set';
      return <div className="bulk-detail-field" key={field.key}>
        <label>{field.label} action<select value={actions[field.key]} onChange={event => setActions({ ...actions, [field.key]: event.target.value as Action })}>
          <option value="keep">Keep existing values</option>
          <option value="replace">{field.key === 'facilityLocation' ? 'Assign a location' : 'Replace with new value'}</option>
          <option value="clear">Clear value</option>
        </select></label>
        {endpoints.length > 0 && <p className="bulk-detail-current" title={current}>Current: {current}</p>}
        {actions[field.key] === 'replace' && <label>New {field.label.toLowerCase()}{field.key === 'notes'
          ? <textarea rows={4} maxLength={field.max} value={values[field.key]} onChange={event => setValues({ ...values, [field.key]: event.target.value })}/>
          : <select value={values[field.key]} onChange={event => setValues({ ...values, [field.key]: event.target.value })}><option value="" disabled>Choose a location…</option>{locations.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}</select>}</label>}
        {actions[field.key] === 'clear' && <p className="note">{field.label} will be cleared on all selected ports.</p>}
      </div>;
    })}
    <button className="primary-button full-width" disabled={!canApply} onClick={apply}>Apply details to {endpoints.length} {endpoints.length === 1 ? 'port' : 'ports'}</button>
    <a href="#/configuration/facility-locations">Configure facility locations</a>
    <p className="note">Applied changes save with this distribution frame. Changing the port selection resets pending edits.</p>
  </section>;
}
