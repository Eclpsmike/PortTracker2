import { type PatchPortDetails } from '../model';
import type { FacilityLocation } from '../configuration';

export function PatchPortDetailsControl({ value, onChange, locations, locationSource, inheritedLocation = false }: {
  value: PatchPortDetails; locations: readonly FacilityLocation[]; locationSource?:string; inheritedLocation?:boolean; onChange: (details: PatchPortDetails) => void;
}) {
  if (inheritedLocation) return null;
  return <section className="patch-port-details" aria-label="Patch-panel port details">
    <h3>Port details</h3>
    <label>Facility location<select aria-label="Facility location" disabled={!!locationSource} value={value.facilityLocation} onChange={event => onChange({ ...value, facilityLocation: event.target.value })}><option value="">Unassigned</option>{locations.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}</select></label>
    {locationSource&&<p className="note">From map: {locationSource}. Move or change the linked item’s location in <a href="#/facility">Facility</a>.</p>}
    <a href="#/configuration/facility-locations">Configure facility locations</a>
    <p className="note">Saved automatically on this port, with or without a cable.</p>
  </section>;
}
