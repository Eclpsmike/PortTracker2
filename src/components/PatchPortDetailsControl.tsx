import { type PatchPortDetails, PORT_NOTES_MAX } from '../model';
import type { FacilityLocation } from '../configuration';

export function PatchPortDetailsControl({ value, onChange, locations, notesEnabled = true }: {
  value: PatchPortDetails; locations: readonly FacilityLocation[]; notesEnabled?: boolean; onChange: (details: PatchPortDetails) => void;
}) {
  return <section className="patch-port-details" aria-label={notesEnabled ? 'Patch-panel port details' : 'Port location assignment'}>
    <h3>Port details</h3>
    <label>Facility location<select aria-label="Facility location" value={value.facilityLocation} onChange={event => onChange({ ...value, facilityLocation: event.target.value })}><option value="">Unassigned</option>{locations.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}</select></label>
    <a href="#/configuration/facility-locations">Configure facility locations</a>
    {notesEnabled && <label>Port notes<textarea rows={4} maxLength={PORT_NOTES_MAX} placeholder="Outlet label, connected area, installation details…" value={value.notes} onChange={event => onChange({ ...value, notes: event.target.value })}/></label>}
    <p className="note">Saved automatically on this port, with or without a cable.</p>
  </section>;
}
