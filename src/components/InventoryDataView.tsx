import { useMemo, useState } from 'react';
import { dataCsv } from '../connectionData';
import { inventoryRows, type InventoryKind, type InventoryRow } from '../inventoryData';
import type { Project } from '../project';
import { Icon } from './Icon';

const rackColumns = [
  ['frame', 'Distribution frame'], ['rack', 'Rack'], ['equipment', 'Equipment'], ['equipmentKind', 'Equipment type'],
  ['stack', 'Stack'], ['member', 'Member'],
  ['position', 'Rack units'], ['heightU', 'Equipment height (U)'], ['portRange', 'Port range'], ['ports', 'Total ports'], ['connectedPorts', 'Connected ports'], ['template', 'Template'],
] as const;
const portColumns = [
  ['frame', 'Distribution frame'], ['rack', 'Rack'], ['equipment', 'Equipment'], ['port', 'Port'], ['sourceInterface', 'Source interface'],
  ['stack', 'Stack'], ['member', 'Member'], ['interfaceName', 'Interface name'],
  ['media', 'Port type'], ['status', 'Connection status'], ['peer', 'Connected to'], ['vlan', 'Port VLAN'], ['facilityLocation', 'Location'], ['notes', 'Notes'],
] as const;
type ColumnKey = typeof rackColumns[number][0] | typeof portColumns[number][0];
const sortValue = (row: InventoryRow, key: ColumnKey): string | number | null => {
  if (key === 'rack') return `${row.building} / ${row.frame} / ${row.rack}`;
  if (key === 'frame') return `${row.building} / ${row.frame}`;
  if (key === 'vlan') return row.vlanId;
  return row[key];
};

export function InventoryDataView({ project, kind }: { project: Project; kind: InventoryKind }) {
  const isPorts = kind === 'ports', title = isPorts ? 'Ports' : 'Racks';
  const columns = isPorts ? portColumns : rackColumns;
  const [query, setQuery] = useState('');
  const [frame, setFrame] = useState(project.activeLocationId);
  const [rack, setRack] = useState('');
  const [equipment, setEquipment] = useState('');
  const [equipmentKind, setEquipmentKind] = useState('');
  const [vlan, setVlan] = useState('');
  const [status, setStatus] = useState('');
  const [stack, setStack] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState<{ key: ColumnKey; descending: boolean }>({ key: 'rack', descending: false });
  const [page, setPage] = useState(0), [pageSize, setPageSize] = useState(50);
  const [notice, setNotice] = useState('');
  const rows = useMemo(() => inventoryRows(project, kind), [project, kind]);
  const frames = project.locations.filter(f => includeArchived || !f.archived);
  const scope = frames.filter(f => !frame || f.id === frame);
  const scopeIds = new Set(scope.map(f => f.id));
  const scopedRows = rows.filter(row => scopeIds.has(row.frameId));
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const shown = scopedRows.filter(row => {
    if (stack && (stack === 'none' ? !!row.stackKey : row.stackKey !== stack)) return false;
    if (rack && row.rackKey !== rack || equipment && row.equipmentKey !== equipment || equipmentKind && row.equipmentKind !== equipmentKind) return false;
    if (status && row.status !== status || vlan && (vlan === 'unassigned' ? row.vlanId !== null : row.vlanId !== Number(vlan))) return false;
    const searchable = [row.building, row.frame, row.rack, row.equipment || 'Empty rack', row.equipmentKind, row.template, row.position,
      isPorts ? row.port : row.portRange, row.stack, row.interfaceName, row.sourceInterface, row.media, row.status, row.peer, row.vlan, row.facilityLocation, row.notes].join(' ').toLocaleLowerCase();
    return words.every(word => searchable.includes(word));
  }).sort((a, b) => {
    const av = sortValue(a, sort.key), bv = sortValue(b, sort.key);
    if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
    const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sort.descending ? -comparison : comparison;
  });
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize)), currentPage = Math.min(page, pageCount - 1), start = currentPage * pageSize;
  const visibleRacks = new Set(shown.map(row => row.rackKey)).size;
  const equipmentCount = shown.filter(row => row.equipmentKey).length;
  const emptyRacks = shown.length - equipmentCount;
  const count = isPorts ? `${shown.length} of ${scopedRows.length} ports` : `${visibleRacks} ${visibleRacks === 1 ? 'rack' : 'racks'} · ${equipmentCount} equipment items${emptyRacks ? ` · ${emptyRacks} empty ${emptyRacks === 1 ? 'rack' : 'racks'}` : ''}`;
  function changeFilter(update: () => void) { update(); setPage(0); setNotice(''); }
  function resetFilters() {
    changeFilter(() => { setQuery(''); setFrame(project.activeLocationId); setRack(''); setEquipment(''); setEquipmentKind(''); setVlan(''); setStatus(''); setStack(''); setIncludeArchived(false); });
  }
  function exportCsv() {
    const headers = ['Building', 'Distribution frame', 'Archived', ...columns.filter(([key]) => key !== 'frame').map(([, label]) => label)];
    const values = shown.map(row => [row.building, row.frame, row.archived ? 'Yes' : 'No', ...columns.filter(([key]) => key !== 'frame').map(([key]) => row[key] ?? '')]);
    const url = URL.createObjectURL(new Blob([dataCsv(headers, values)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `porttracker-${kind}.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Exported ${shown.length} ${isPorts ? 'ports' : 'rack equipment rows'}.`);
  }
  function cell(row: InventoryRow, key: ColumnKey) {
    if (key === 'frame') return <><strong>{row.frame}{row.archived ? ' (archived)' : ''}</strong><small>{row.building}</small></>;
    if (key === 'rack') return <><strong>{row.rack}</strong>{!isPorts && <small>{row.rackUsed} / {row.rackHeight}U occupied</small>}</>;
    if (key === 'equipment') return row.equipment || <span className="unused-badge">Empty rack</span>;
    if (key === 'vlan') return <span className="data-vlan"><span className="swatch" style={{ background: project.configuration.vlans.find(v => v.id === row.vlanId)?.color ?? '#91a4b5' }}/>{row.vlan}</span>;
    if (key === 'status') return <span className={row.status === 'Connected' ? 'usage-badge' : 'unused-badge'}>{row.status}</span>;
    const value = row[key];
    return value === null || value === '' ? '—' : value;
  }
  return <div>
    <div className="data-section-heading"><div><h2>{title}</h2><p>{isPorts ? 'Every equipment port, including ports without a connection.' : 'Equipment listed by rack, including empty racks.'}</p></div><button className="primary-button" disabled={!shown.length} onClick={exportCsv}><Icon name="download"/>Export CSV</button></div>
    <section className={`panel data-filters data-${kind}-filters`} aria-label={`${title} data filters`}>
      <label className="data-search">Search {kind}<div className="search-field"><Icon name="search"/><input type="search" value={query} placeholder={isPorts ? 'Equipment, port, VLAN, location, notes…' : 'Rack, equipment, type, template…'} onChange={e => changeFilter(() => setQuery(e.target.value))}/></div></label>
      <label>Distribution frame<select value={frame} onChange={e => changeFilter(() => { setFrame(e.target.value); setStack(''); setRack(''); setEquipment(''); })}><option value="">All distribution frames</option>{frames.map(f => <option key={f.id} value={f.id}>{project.buildings.find(b => b.id === f.buildingId)?.name} / {f.name}{f.archived ? ' (archived)' : ''}</option>)}</select></label>
      <label>Rack<select value={rack} onChange={e => changeFilter(() => { setRack(e.target.value); setEquipment(''); })}><option value="">All racks</option>{scope.flatMap(f => f.layout.racks.map(r => <option key={`${f.id}/${r.id}`} value={`${f.id}/${r.id}`}>{frame ? '' : `${project.buildings.find(b => b.id === f.buildingId)?.name} / ${f.name} / `}{r.label}</option>))}</select></label>
      {isPorts ? <>
        <label>Equipment<select value={equipment} onChange={e => changeFilter(() => setEquipment(e.target.value))}><option value="">All equipment</option>{scope.flatMap(f => f.layout.racks.filter(r => !rack || `${f.id}/${r.id}` === rack).flatMap(r => r.equipment.map(e => <option key={`${f.id}/${r.id}/${e.id}`} value={`${f.id}/${r.id}/${e.id}`}>{!frame ? `${project.buildings.find(b => b.id === f.buildingId)?.name} / ${f.name} / ` : ''}{!rack ? `${r.label} / ` : ''}{e.label}</option>)))}</select></label>
        <label>Port VLAN<select value={vlan} onChange={e => changeFilter(() => setVlan(e.target.value))}><option value="">All VLANs</option><option value="unassigned">Unassigned</option>{project.configuration.vlans.map(v => <option key={v.id} value={v.id}>{v.id} — {v.name}</option>)}</select></label>
        <label>Connection status<select value={status} onChange={e => changeFilter(() => setStatus(e.target.value))}><option value="">All ports</option><option>Connected</option><option>Available</option></select></label>
      </> : <label>Equipment type<select value={equipmentKind} onChange={e => changeFilter(() => setEquipmentKind(e.target.value))}><option value="">All equipment types</option><option>Patch panel</option><option>Switch</option></select></label>}
      <label>Stack<select value={stack} onChange={e => changeFilter(() => setStack(e.target.value))}><option value="">All stacks</option><option value="none">Not in a stack</option>{scope.flatMap(f => (f.layout.stacks ?? []).map(s => <option key={`${f.id}/${s.id}`} value={`${f.id}/${s.id}`}>{project.buildings.find(b => b.id === f.buildingId)?.name} / {f.name} / {s.name}</option>))}</select></label>
      <div className="data-filter-actions"><label><input type="checkbox" checked={includeArchived} onChange={e => changeFilter(() => { setIncludeArchived(e.target.checked); setStack(''); setRack(''); setEquipment(''); if (!e.target.checked && project.locations.find(f => f.id === frame)?.archived) setFrame(''); })}/>Include archived frames</label><button className="secondary-button" onClick={resetFilters}>Reset filters</button></div>
    </section>
    <section className="panel configuration-table-panel">
      <div className="configuration-table-toolbar"><strong role="status">{count}</strong></div>
      <div className="data-table-scroll" tabIndex={0} role="region" aria-label={`${title} table, scroll for more columns`}>
        <table className="configuration-table data-table"><caption className="sr-only">{isPorts ? 'All equipment ports and their assignments' : 'Rack equipment inventory'}</caption><thead><tr>{columns.map(([key, label]) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.descending ? 'descending' : 'ascending' : 'none'}><button onClick={() => { setSort({ key, descending: sort.key === key && !sort.descending }); setPage(0); }}>{label}<span aria-hidden="true">{sort.key === key ? sort.descending ? ' ↓' : ' ↑' : ' ↕'}</span></button></th>)}</tr></thead>
          <tbody>{shown.slice(start, start + pageSize).map(row => <tr key={row.key}>{columns.map(([key]) => <td key={key} className={`data-cell-${key}`}>{cell(row, key)}</td>)}</tr>)}{!shown.length && <tr><td colSpan={columns.length} className="config-empty">{scopedRows.length ? `No ${kind} match these filters.` : isPorts ? 'No equipment ports in the selected distribution frames.' : 'No racks in the selected distribution frames.'}</td></tr>}</tbody>
        </table>
      </div>
      <div className="data-pagination"><span>{shown.length ? `${start + 1}–${Math.min(start + pageSize, shown.length)} of ${shown.length}` : '0 rows'}</span><label>Rows per page<select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}><option>25</option><option>50</option><option>100</option></select></label><button className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pageCount}</span><button className="secondary-button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>
    </section>
    <p className="configuration-help"><Icon name="info"/>CSV includes all filtered rows in the current sort order. {isPorts ? 'Port VLANs are independent of cable VLANs. Edit port assignments in the Racks view.' : 'Edit rack equipment in the Racks view.'}</p>
    {notice && <p role="status" className="data-export-notice">{notice}</p>}
  </div>;
}
