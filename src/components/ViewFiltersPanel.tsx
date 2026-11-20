import type { FacilityLocation } from '../configuration';
import { type Layout, type Vlan, portNumbers, portVlan } from '../model';
import { portLocation } from '../facilityLocations';
import { EMPTY_VIEW_FILTERS, type ViewFilters } from '../viewFilters';
import { Icon } from './Icon';

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}/><span className="toggle-label">{label}</span><span className="toggle-track"/></label>;
}

export function ViewFiltersPanel({ layout, vlans, locations, value, onChange, onAddConnection, showCables, showVlan, onCables, onVlanColors }: {
  layout: Layout; vlans: readonly Vlan[]; locations: readonly FacilityLocation[]; value: ViewFilters;
  onChange: (value: ViewFilters) => void; onAddConnection: () => void;
  showCables: boolean; showVlan: boolean; onCables: (value: boolean) => void; onVlanColors: (value: boolean) => void;
}) {
  const endpoints = layout.racks.flatMap(r => r.equipment.flatMap(e => portNumbers(e).map(port => ({ rackId: r.id, equipmentId: e.id, port }))));
  const vlanCounts = new Map<number | null, number>(), locationCounts = new Map<string, number>();
  for (const ep of endpoints) {
    const vlan = portVlan(layout, ep), location = portLocation(layout, ep);
    vlanCounts.set(vlan, (vlanCounts.get(vlan) ?? 0) + 1);
    locationCounts.set(location, (locationCounts.get(location) ?? 0) + 1);
  }
  const active = value.vlans.length + value.locations.length;
  const allVlans = [...vlans.map(v => v.id), null];
  const allLocations = [...locations.map(l => l.name), ''];
  return <section className="panel view-filters-panel" aria-label="View filters">
    <h2><Icon name="settings" size={16}/>View filters</h2>
    <div className="filter-selection-actions"><button className="secondary-button" onClick={() => onChange({ vlans: allVlans, locations: allLocations })}>Select all</button><button className="text-button" disabled={!active} onClick={() => onChange(EMPTY_VIEW_FILTERS)}>Clear filters</button></div>
    <div className="filter-display-controls"><Toggle label="Cables" checked={showCables} onChange={onCables}/><Toggle label="VLAN colors" checked={showVlan} onChange={onVlanColors}/></div>
    <details className="filter-accordion" open><summary>VLANs<span className="count-badge">{value.vlans.length} selected</span></summary>
      <div className="filter-choices vlan-list" role="region" aria-label="VLAN filters">
        <div className="filter-selection-actions"><button className="text-button" aria-label="Select all VLANs" onClick={() => onChange({ ...value, vlans: allVlans })}>Select all</button><button className="text-button" aria-label="Clear VLAN selections" disabled={!value.vlans.length} onClick={() => onChange({ ...value, vlans: [] })}>Clear</button></div>
        {[...vlans, { id: null, name: 'Unassigned', color: '#91a4b5' }].map(v => <label className="filter-choice" key={v.id ?? 'unassigned'}>
          <input type="checkbox" aria-label={v.id === null ? 'Unassigned VLAN' : `VLAN ${v.id} — ${v.name}`} checked={value.vlans.includes(v.id)} onChange={e => onChange({ ...value, vlans: e.target.checked ? [...value.vlans, v.id] : value.vlans.filter(id => id !== v.id) })}/>
          <span className="swatch" style={{ background: v.color }}/><span>{v.id !== null && <><b>{v.id}</b>{' — '}</>}{v.name}</span><span className="filter-count" title="Assigned ports">{vlanCounts.get(v.id) ?? 0}</span>
        </label>)}
        <a className="filter-config-link" href="#/configuration/vlans">Configure VLANs</a>
      </div>
    </details>
    <details className="filter-accordion" open><summary>Locations<span className="count-badge">{value.locations.length} selected</span></summary>
      <div className="filter-choices location-list" role="region" aria-label="Facility location filters">
        <div className="filter-selection-actions"><button className="text-button" aria-label="Select all locations" onClick={() => onChange({ ...value, locations: allLocations })}>Select all</button><button className="text-button" aria-label="Clear location selections" disabled={!value.locations.length} onClick={() => onChange({ ...value, locations: [] })}>Clear</button></div>
        {[...locations, { name: '', color: '#91a4b5' }].map(l => <label className="filter-choice" key={l.name}>
          <input type="checkbox" aria-label={l.name ? `Location — ${l.name}` : 'Unassigned location'} checked={value.locations.includes(l.name)} onChange={e => onChange({ ...value, locations: e.target.checked ? [...value.locations, l.name] : value.locations.filter(name => name !== l.name) })}/>
          <span className="swatch" style={{ background: l.color }}/><span>{l.name || 'Unassigned'}</span><span className="filter-count" title="Assigned ports">{locationCounts.get(l.name) ?? 0}</span>
        </label>)}
        {!locations.length && <p className="note">Configure locations, then assign them to ports.</p>}
        <a className="filter-config-link" href="#/configuration/facility-locations">Configure locations</a>
      </div>
    </details>
    <div className="filter-actions"><button className="primary-button full-width" onClick={onAddConnection}><Icon name="plus" size={17}/>Add connection</button></div>
  </section>;
}
