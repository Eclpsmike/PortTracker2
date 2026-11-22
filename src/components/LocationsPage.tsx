import { MAX_PROJECT_BACKUP_BYTES, parseProjectBackup, type ImportedProjectBackup } from '../projectBackup';
import { useEffect, useRef, useState } from 'react';
import { type Closet, type Project, type LocationDraft, upsertLocation, archiveLocation } from '../project';
import { Icon } from './Icon';

function LocationEditor({ project, initial, onSave, onClose }: { project: Project; initial?: Closet; onSave: (next: Project) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<LocationDraft>({ name: initial?.name ?? '', type: initial?.type ?? 'IDF', building: project.buildings.find(b => b.id === (initial?.buildingId ?? project.locations.find(l => l.id === project.activeLocationId)?.buildingId))?.name ?? '', floor: initial?.floor ?? '', room: initial?.room ?? '', notes: initial?.notes ?? '', portPrefix: initial?.portPrefix ?? '' });
  const [copyFrom, setCopyFrom] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { const d = dialog.current!; d.showModal(); return () => d.close(); }, []);
  const field = (key: keyof LocationDraft, value: string) => { setDraft({ ...draft, [key]: value }); setError(''); };
  return <dialog ref={dialog} className="editor-dialog" onCancel={onClose} aria-labelledby="location-editor-title">
    <form onSubmit={event => { event.preventDefault(); try { onSave(upsertLocation(project, draft, initial?.id, copyFrom)); } catch (error) { setError((error as Error).message); } }}>
      <div className="dialog-heading"><h2 id="location-editor-title">{initial ? 'Edit distribution frame' : 'Add distribution frame'}</h2><button type="button" className="icon-button" aria-label="Close distribution frame editor" onClick={onClose}><Icon name="close"/></button></div>
      <div className="form-row"><label>Distribution frame name<input required maxLength={100} value={draft.name} onChange={e => field('name', e.target.value)}/></label><label>Distribution frame type<select value={draft.type} onChange={e => field('type', e.target.value)}><option>MDF</option><option>IDF</option></select></label></div>
      <label title="Added before facility port numbers assigned to this frame, for example B225.">Port prefix<input maxLength={20} placeholder="e.g. B" value={draft.portPrefix??''} onChange={e=>field('portPrefix',e.target.value)}/></label>
      <label>Building<input required maxLength={100} list="project-buildings" value={draft.building} onChange={e => field('building', e.target.value)}/></label>
      <datalist id="project-buildings">{project.buildings.map(b => <option key={b.id} value={b.name}/>)}</datalist>
      <div className="form-row"><label>Floor<input maxLength={100} value={draft.floor} onChange={e => field('floor', e.target.value)}/></label><label>Room<input maxLength={100} value={draft.room} onChange={e => field('room', e.target.value)}/></label></div>
      <label>Notes<textarea maxLength={2000} rows={3} value={draft.notes} onChange={e => field('notes', e.target.value)}/></label>
      {!initial && <><label>Starting layout<select value={copyFrom} onChange={e => setCopyFrom(e.target.value)}><option value="">Empty distribution frame</option>{project.locations.map(l => <option key={l.id} value={l.id}>Copy equipment: {project.buildings.find(b => b.id === l.buildingId)?.name} / {l.name}</option>)}</select></label><p className="note">Copies racks and equipment only. Connections, port VLAN assignments, and port details start empty.</p></>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-footer"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Save distribution frame</button></div>
    </form>
  </dialog>;
}
export function LocationsPage({ project, onChange, onOpen, onImport, onExport }: { project: Project; onChange: (project: Project) => void; onOpen: (id: string) => void; onImport: (backup: ImportedProjectBackup) => Promise<void>; onExport: () => void }) {
  const [editing, setEditing] = useState<Closet | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [siteName, setSiteName] = useState(project.siteName);
  const [imported, setImported] = useState<ImportedProjectBackup | null>(null);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const activeCount = project.locations.filter(l => !l.archived).length;
  async function readFile(selected?: File) {
    setError(''); setImported(null);
    if (!selected) return;
    if (selected.size > MAX_PROJECT_BACKUP_BYTES) { setError('Choose a project JSON file up to 128 MB.'); return; }
    try {
      const next = parseProjectBackup(JSON.parse(await selected.text()));
      if (!next) throw new Error('Invalid or unsupported project. Check the distribution frames, ports, VLAN references, and file version.');
      setImported(next);
    } catch (error) { setError(error instanceof SyntaxError ? 'This file is not valid JSON.' : (error as Error).message); }
  }
  const locations = project.locations.filter(l => (showArchived || !l.archived) && `${l.name} ${l.type} ${l.portPrefix??''} ${project.buildings.find(b => b.id === l.buildingId)?.name} ${l.floor} ${l.room}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="locations-page">
    <div className="configuration-heading"><div><span className="eyebrow">{project.siteName}</span><h1>Distribution Frames</h1><p>Manage MDFs and IDFs, then open their rack views.</p></div><button className="primary-button" onClick={() => setEditing('new')}><Icon name="plus"/>Add distribution frame</button></div>
    <section className="panel project-settings" aria-label="Project settings"><form onSubmit={e => { e.preventDefault(); if (siteName.trim()) onChange({ ...project, siteName: siteName.trim() }); }}><label>Site name<input required maxLength={100} value={siteName} onChange={e => setSiteName(e.target.value)}/></label><button className="secondary-button" type="submit">Save site name</button></form><div className="project-file-actions"><button className="secondary-button" onClick={onExport}><Icon name="download"/>Export project</button><button className="secondary-button" onClick={() => file.current?.click()}>Import project</button><input ref={file} className="sr-only" type="file" aria-label="Project JSON file" accept=".json,application/json" onChange={e => { void readFile(e.target.files?.[0]); e.target.value = ''; }}/></div><p className="note">Export project includes racks, the facility drawing and original plan file, templates, shared configuration, and saved preferences.</p></section>
    {error && <p className="form-error" role="alert">{error}</p>}
    {imported && <section className="panel import-preview" aria-label="Import preview"><h2>Import {imported.project.siteName}</h2><p>{imported.project.locations.length} distribution frames · {imported.project.locations.reduce((n, l) => n + l.layout.racks.length, 0)} racks · {imported.project.locations.reduce((n, l) => n + l.layout.cables.length, 0)} connections</p><p>{imported.facilityPlan ? `Facility drawing: ${imported.facilityPlan.building} / ${imported.facilityPlan.floor} · ${imported.facilityPlan.objects.length} objects` : imported.legacy ? "Older rack-only backup: no facility drawing is included." : "No saved facility drawing in this backup."}</p><p>Import replaces the current racks, facility drawing, templates, configuration, and saved preferences. Export the current project first to keep a copy.</p><div className="project-file-actions"><button className="secondary-button" onClick={onExport}>Export current project</button><button className="secondary-button" disabled={restoring} onClick={() => setImported(null)}>Cancel import</button><button className="primary-button" disabled={restoring} onClick={async () => { setRestoring(true); setError(''); try { await onImport(imported); setImported(null); } catch (error) { setError((error as Error).message); } finally { setRestoring(false); } }}>Replace with imported project</button></div></section>}
    <div className="location-filters"><label className="search-field"><Icon name="search" size={16}/><input aria-label="Search distribution frames" placeholder="Search distribution frames…" value={query} onChange={e => setQuery(e.target.value)}/></label><label><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}/>Show archived distribution frames</label></div>
    <div className="location-grid">{locations.map(l => <article className="panel location-card" key={l.id} aria-label={`${l.name} distribution frame`}>
      <div className="location-card-heading"><span className="status-pill">{l.type}{l.archived ? ' · Archived' : l.id === project.activeLocationId ? ' · Current' : ''}</span><h2>{l.name}</h2></div>
      <p>{project.buildings.find(b => b.id === l.buildingId)?.name}{l.floor && ` · Floor ${l.floor}`}{l.room && ` · ${l.room}`}</p><p>{l.layout.racks.length} racks · {l.layout.cables.length} connections · {Object.keys(l.layout.portVlans ?? {}).length} VLAN-assigned ports</p>{l.portPrefix&&<p>Port prefix: <strong>{l.portPrefix}</strong></p>}{l.notes && <p className="location-notes">{l.notes}</p>}
      <div className="location-card-actions">{!l.archived && <button className="primary-button" aria-label={`Open ${l.name}`} onClick={() => onOpen(l.id)}>Open racks<Icon name="arrow" size={14}/></button>}<button className="secondary-button" aria-label={`Edit ${l.name}`} onClick={() => setEditing(l)}>Edit</button>{l.archived ? <button className="secondary-button" aria-label={`Restore ${l.name}`} onClick={() => onChange({ ...project, locations: project.locations.map(item => item.id === l.id ? { ...item, archived: false } : item) })}>Restore</button> : <button className="text-button" aria-label={`Archive ${l.name}`} title={activeCount === 1 ? 'Keep at least one active distribution frame.' : 'Archive retains all racks, connections and VLAN assignments.'} disabled={activeCount === 1} onClick={() => onChange(archiveLocation(project, l.id))}>Archive</button>}</div>
    </article>)}</div>
    {!locations.length && <p className="config-empty">No distribution frames match your search.</p>}
    {editing && <LocationEditor project={project} initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={next => { onChange(next); setEditing(null); }}/ >}
  </main>;
}
