import { useState } from 'react';
import type { FacilityLocation } from '../configuration';
import { type Endpoint, type Layout, type PatchPortDetails, patchPortDetails, resolveEndpoint } from '../model';

type Action = 'keep' | 'replace' | 'clear';

export function BulkPatchPortDetailsControl({ layout, endpoints, onApply, locations, mapLocationCount = 0 }: {
  layout: Layout; endpoints: readonly Endpoint[]; locations: readonly FacilityLocation[]; mapLocationCount?: number;
  onApply: (changes: Pick<PatchPortDetails, 'facilityLocation'>) => void;
}) {
  const [action, setAction] = useState<Action>('keep');
  const [value, setValue] = useState('');
  const inheritedCount = endpoints.filter(endpoint => resolveEndpoint(layout, endpoint).equipment.kind === 'switch').length;
  if (inheritedCount === endpoints.length) return null;
  const editableCount = Math.max(0, endpoints.length - inheritedCount - mapLocationCount);
  const canApply = editableCount > 0 && action !== 'keep' && (action === 'clear' || locations.some(location => location.name === value));
  const currentValues = new Set(endpoints.map(endpoint => patchPortDetails(layout, endpoint).facilityLocation));
  const current = currentValues.size > 1 ? 'Mixed values' : currentValues.values().next().value || 'Not set';
  function apply() {
    if (!canApply) return;
    onApply({ facilityLocation: action === 'clear' ? '' : value });
    setAction('keep');setValue('');
  }
  return <section className="patch-port-details bulk-port-details" aria-label="Bulk port location assignment">
    <h3>Location for selected ports</h3>
    {inheritedCount > 0 && <p className="note">Switch-port locations follow their connected patch-panel ports. Location changes apply only to selected patch-panel ports without a map location.</p>}
    {mapLocationCount > 0 && <p className="note">{mapLocationCount} {mapLocationCount === 1 ? 'port follows its' : 'ports follow their'} map location. Change those locations in Facility.</p>}
    <div className="bulk-detail-field">
      <label>Facility location action<select disabled={!editableCount} value={action} onChange={event => setAction(event.target.value as Action)}>
        <option value="keep">Keep existing values</option><option value="replace">Assign a location</option><option value="clear">Clear value</option>
      </select></label>
      <p className="bulk-detail-current" title={current}>Current: {current}</p>
      {action === 'replace' && <label>New facility location<select value={value} onChange={event => setValue(event.target.value)}>
        <option value="" disabled>Choose a location…</option>{locations.map(location => <option key={location.name} value={location.name}>{location.name}</option>)}
      </select></label>}
      {action === 'clear' && <p className="note">Facility location will be cleared on selected patch-panel ports without a map location.</p>}
    </div>
    <button className="primary-button full-width" disabled={!canApply} onClick={apply}>Apply details to {editableCount} {editableCount === 1 ? 'port' : 'ports'}</button>
    <a href="#/configuration/facility-locations">Configure facility locations</a>
    <p className="note">Applied changes save with this distribution frame. Changing the port selection resets pending edits.</p>
  </section>;
}
