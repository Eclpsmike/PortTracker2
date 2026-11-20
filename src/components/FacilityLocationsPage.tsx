import { useEffect, useRef, useState } from 'react';
import { type FacilityLocation, facilityLocationError } from '../configuration';
import { facilityLocationUsage } from '../facilityLocations';
import { PORT_LOCATION_MAX } from '../model';
import type { Project } from '../project';
import { ConfigurationNav } from './ConfigurationNav';
import { Icon } from './Icon';

function LocationEditor({ initial, catalog, onSave, onClose }: { initial?: FacilityLocation; catalog: readonly FacilityLocation[]; onSave: (value: FacilityLocation) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(initial ?? { name: '', color: '#159de7' });
  const [error, setError] = useState('');
  useEffect(() => { const d = dialog.current!; d.showModal(); return () => d.close(); }, []);
  return <dialog ref={dialog} className="config-dialog" onCancel={onClose} aria-labelledby="facility-location-title"><form onSubmit={e => {
    e.preventDefault(); const value = { ...draft, name: draft.name.trim() };
    const problem = facilityLocationError(value, catalog, initial?.name);
    if (problem) setError(problem); else onSave(value);
  }}>
    <div className="dialog-heading"><div><span className="eyebrow">FACILITY LOCATIONS</span><h2 id="facility-location-title">{initial ? 'Edit facility location' : 'Add facility location'}</h2></div><button type="button" className="icon-button" aria-label="Close location editor" onClick={onClose}><Icon name="close"/></button></div>
    <label className="config-field">Location name<input type="text" required maxLength={PORT_LOCATION_MAX} value={draft.name} onChange={e => { setDraft({ ...draft, name: e.target.value }); setError(''); }}/></label>
    <label className="config-field">Location color<div className="color-field"><input aria-label="Location color" type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })}/><code>{draft.color}</code></div></label>
    <p className="note">Use a room, area, or outlet location. Renaming updates assigned ports throughout the project.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Save facility location</button></div>
  </form></dialog>;
}

export function FacilityLocationsPage({ project, onSave, onRemove }: { project: Project; onSave: (value: FacilityLocation, previousName?: string) => void; onRemove: (name: string) => void }) {
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<{ initial?: FacilityLocation } | null>(null);
  const catalog = project.configuration.facilityLocations ?? [];
  const shown = catalog.filter(l => l.name.toLowerCase().includes(query.toLowerCase()));
  return <main className="configuration-workspace"><ConfigurationNav page="facility-locations"/>
    <section className="configuration-content">
      <div className="configuration-heading"><div><span className="eyebrow">CONFIGURATION</span><h1>Facility locations</h1><p>Define the rooms, areas, and outlets assigned to ports across your racks.</p></div><button className="primary-button" onClick={() => setEditor({})}><Icon name="plus"/>Add facility location</button></div>
      <section className="panel configuration-table-panel"><div className="configuration-table-toolbar"><strong>{catalog.length} locations configured</strong><label className="search-field"><Icon name="search" size={16}/><input aria-label="Search facility locations" placeholder="Search by name…" value={query} onChange={e => setQuery(e.target.value)}/></label></div>
        <div className="configuration-table-scroll"><table className="configuration-table"><caption className="sr-only">Configured facility locations</caption><thead><tr><th scope="col">Name</th><th scope="col">Color</th><th scope="col">Ports</th><th scope="col">Connections</th><th scope="col">Actions</th></tr></thead><tbody>
          {shown.map(l => { const usage = facilityLocationUsage(project, l.name); return <tr key={l.name}><td className="config-name">{l.name}</td><td><span className="config-color"><span className="swatch" style={{ background: l.color }}/><code>{l.color}</code></span></td><td><span className={usage.ports ? 'usage-badge' : 'unused-badge'}>{usage.ports ? `${usage.ports} assigned` : 'Unused'}</span></td><td>{usage.cables}</td><td><div className="config-actions"><button className="secondary-button" aria-label={`Edit location ${l.name}`} onClick={() => setEditor({ initial: l })}><Icon name="edit" size={14}/>Edit</button><button className="config-remove" aria-label={`Remove location ${l.name}`} disabled={usage.ports > 0} title={usage.ports ? 'Clear or reassign this location’s ports first.' : `Remove ${l.name}`} onClick={() => onRemove(l.name)}><Icon name="trash" size={15}/></button></div></td></tr>; })}
          {!shown.length && <tr><td colSpan={5} className="config-empty">{catalog.length ? 'No locations match your search.' : 'No facility locations configured. Add one to assign it to ports.'}</td></tr>}
        </tbody></table></div>
      </section>
      <p className="configuration-help"><Icon name="info" size={17}/>Usage includes all MDF/IDF views, including archived ones. Locations can be assigned without a cable; a connection matches when either endpoint has that location.</p>
    </section>
    {editor && <LocationEditor initial={editor.initial} catalog={catalog} onClose={() => setEditor(null)} onSave={value => { onSave(value, editor.initial?.name); setEditor(null); }}/ >}
  </main>;
}
