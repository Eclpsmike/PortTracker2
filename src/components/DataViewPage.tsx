import { useMemo, useState } from 'react';
import { connectionRows, connectionsCsv, type ConnectionRow } from '../connectionData';
import type { Project } from '../project';
import { cableLengthUnitSymbol, formatCableLengthValue, type LengthUnit } from '../units';
import { Icon } from './Icon';
import { LengthUnitSelect } from './LengthUnitSelect';
import { InventoryDataView } from './InventoryDataView';

const columns = [
  ['frame', 'Distribution frame'], ['from', 'From'], ['to', 'To'], ['vlan', 'Cable VLAN'], ['media', 'Cable type'],
  ['estimated', 'Estimated length'], ['stock', 'Stock length'], ['fromLocation', 'From location'], ['toLocation', 'To location'],
  ['fromNotes', 'From notes'], ['toNotes', 'To notes'], ['jacket', 'Jacket color'], ['route', 'Route'],
  ['fromStack', 'From stack'], ['toStack', 'To stack'],
] as const;
type SortKey = typeof columns[number][0];
function sortValue(row: ConnectionRow, key: SortKey): string | number | null {
  if (key === 'frame') return `${row.building} / ${row.frame}`;
  if (key === 'from' || key === 'to') return row[key].label;
  if (key === 'fromLocation') return row.from.facilityLocation;
  if (key === 'toLocation') return row.to.facilityLocation;
  if (key === 'fromNotes') return row.from.notes;
  if (key === 'toNotes') return row.to.notes;
  if (key === 'fromStack') return row.from.stack;
  if (key === 'toStack') return row.to.stack;
  if (key === 'vlan') return row.vlanId;
  return row[key];
}

type DataViewProps = { project: Project; onUnit: (unit: LengthUnit) => void };
const tabs = [['racks', 'Racks'], ['ports', 'Ports'], ['connections', 'Connections']] as const;
type DataTab = typeof tabs[number][0];

export function DataViewPage({ project, onUnit }: DataViewProps) {
  const [tab, setTab] = useState<DataTab>('connections');
  const [visited, setVisited] = useState<DataTab[]>(['connections']);
  function selectTab(value: DataTab) {
    setTab(value); setVisited(current => current.includes(value) ? current : [...current, value]);
  }
  return <main className="data-page">
    <header className="configuration-heading"><div><span className="eyebrow">{project.siteName}</span><h1>Data view</h1><p>Browse racks, equipment ports, and connections. Search, sort, and export the filtered results.</p></div></header>
    <div className="data-tabs" role="tablist" aria-label="Data view tables">{tabs.map(([key, label], index) => <button key={key} id={`data-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`data-panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => selectTab(key)} onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); selectTab(tabs[next][0]); document.getElementById(`data-tab-${tabs[next][0]}`)?.focus();
    }}><Icon name={key === 'racks' ? 'rack' : key === 'ports' ? 'ports' : 'cable'}/>{label}</button>)}</div>
    {tabs.map(([key]) => <section key={key} className="data-tab-panel" id={`data-panel-${key}`} role="tabpanel" aria-labelledby={`data-tab-${key}`} hidden={tab !== key}>
      {visited.includes(key) && (key === 'connections' ? <ConnectionsDataView project={project} onUnit={onUnit}/> : <InventoryDataView project={project} kind={key}/>)}
    </section>)}
  </main>;
}

function ConnectionsDataView({ project, onUnit }: DataViewProps) {
  const [query, setQuery] = useState('');
  const [frame, setFrame] = useState(project.activeLocationId);
  const [rack, setRack] = useState('');
  const [vlan, setVlan] = useState('');
  const [medium, setMedium] = useState('');
  const [stack, setStack] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'from', descending: false });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [notice, setNotice] = useState('');
  const unit = project.preferences.lengthUnit, symbol = cableLengthUnitSymbol(unit);
  const rows = useMemo(() => connectionRows(project), [project]);
  const frames = project.locations.filter(f => includeArchived || !f.archived);
  const scope = frames.filter(f => !frame || frame === f.id);
  const scopedRows = rows.filter(row => scope.some(f => f.id === row.frameId));
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const shown = scopedRows.filter(row => {
    if (stack && ![row.from.stackId, row.to.stackId].some(id => id && `${row.frameId}/${id}` === stack)) return false;
    if (rack && ![`${row.frameId}/${row.from.rackId}`, `${row.frameId}/${row.to.rackId}`].includes(rack)) return false;
    if (vlan && row.vlanId !== Number(vlan) || medium && row.medium !== medium) return false;
    const searchable = [row.building, row.frame, row.from.label, row.to.label, row.vlan, row.media, row.jacket, row.route,
      row.from.vlan, row.to.vlan, row.from.interfaceName, row.to.interfaceName, row.from.stack, row.to.stack, row.from.facilityLocation, row.to.facilityLocation, row.from.notes, row.to.notes].join(' ').toLocaleLowerCase();
    return words.every(word => searchable.includes(word));
  }).sort((a, b) => {
    const av = sortValue(a, sort.key), bv = sortValue(b, sort.key);
    if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
    const comparison = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sort.descending ? -comparison : comparison;
  });
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1), start = currentPage * pageSize;
  const paginated = shown.slice(start, start + pageSize);
  function changeFilter(update: () => void) { update(); setPage(0); setNotice(''); }
  function resetFilters() {
    changeFilter(() => { setQuery(''); setFrame(project.activeLocationId); setRack(''); setVlan(''); setMedium(''); setStack(''); setIncludeArchived(false); });
  }
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([connectionsCsv(shown, unit)], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'porttracker-connections.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Exported ${shown.length} connections in ${symbol}.`);
  }
  function cell(row: ConnectionRow, key: SortKey) {
    if (key === 'frame') return <><strong>{row.frame}{row.archived ? ' (archived)' : ''}</strong><small>{row.building}</small></>;
    if (key === 'from' || key === 'to') return <><strong>{row[key].rack}</strong><span>{row[key].equipment} / Port {row[key].port}</span>{row[key].interfaceName && <small>{row[key].interfaceName}</small>}<small>Port VLAN: {row[key].vlan}</small></>;
    if (key === 'fromStack' || key === 'toStack') { const ep = key === 'fromStack' ? row.from : row.to; return ep.stack ? <>{ep.stack}<small>Member {ep.member}</small></> : '—'; }
    if (key === 'vlan') return <span className="data-vlan"><span className="swatch" style={{ background: project.configuration.vlans.find(v => v.id === row.vlanId)?.color }}/>{row.vlan}</span>;
    if (key === 'jacket') return <span className="config-color"><span className="swatch" style={{ background: row.jacket }}/>{row.jacket}</span>;
    if (key === 'estimated' || key === 'stock') return row[key] === null ? 'No matching stock' : `${formatCableLengthValue(row[key], unit)} ${symbol}`;
    return sortValue(row, key) || '—';
  }
  return <div>
    <div className="data-section-heading"><div><h2>Connections</h2><p>Cable connections across your distribution frames.</p></div>
      <button className="primary-button" disabled={!shown.length} onClick={exportCsv}><Icon name="download"/>Export CSV</button>
    </div>
    <section className="panel data-filters" aria-label="Data filters">
      <label className="data-search">Search connections<div className="search-field"><Icon name="search"/><input type="search" value={query} placeholder="Rack, equipment, port, location, notes…" onChange={e => changeFilter(() => setQuery(e.target.value))}/></div></label>
      <label>Distribution frame<select value={frame} onChange={e => changeFilter(() => { setFrame(e.target.value); setStack(''); setRack(''); })}><option value="">All distribution frames</option>{frames.map(f => <option key={f.id} value={f.id}>{project.buildings.find(b => b.id === f.buildingId)?.name} / {f.name}{f.archived ? ' (archived)' : ''}</option>)}</select></label>
      <label>Rack<select value={rack} onChange={e => changeFilter(() => setRack(e.target.value))}><option value="">All racks</option>{scope.flatMap(f => f.layout.racks.map(r => <option key={`${f.id}/${r.id}`} value={`${f.id}/${r.id}`}>{frame ? '' : `${project.buildings.find(b => b.id === f.buildingId)?.name} / ${f.name} / `}{r.label}</option>))}</select></label>
      <label>Cable VLAN<select value={vlan} onChange={e => changeFilter(() => setVlan(e.target.value))}><option value="">All VLANs</option>{project.configuration.vlans.map(v => <option key={v.id} value={v.id}>{v.id} — {v.name}</option>)}</select></label>
      <label>Cable type<select value={medium} onChange={e => changeFilter(() => setMedium(e.target.value))}><option value="">All cable types</option><option value="copper">Copper</option><option value="fiber">Fiber</option></select></label>
      <label>Stack<select value={stack} onChange={e => changeFilter(() => setStack(e.target.value))}><option value="">All stacks</option>{scope.flatMap(f => (f.layout.stacks ?? []).map(s => <option key={`${f.id}/${s.id}`} value={`${f.id}/${s.id}`}>{project.buildings.find(b => b.id === f.buildingId)?.name} / {f.name} / {s.name}</option>))}</select></label>
      <div className="data-filter-actions"><label><input type="checkbox" checked={includeArchived} onChange={e => changeFilter(() => { setIncludeArchived(e.target.checked); setStack(''); setRack(''); if (!e.target.checked && project.locations.find(f => f.id === frame)?.archived) setFrame(''); })}/>Include archived frames</label><button className="secondary-button" onClick={resetFilters}>Reset filters</button></div>
    </section>
    <section className="panel configuration-table-panel">
      <div className="configuration-table-toolbar"><strong role="status">{shown.length} of {scopedRows.length} connections</strong><LengthUnitSelect value={unit} onChange={onUnit} imperialSymbol="ft"/></div>
      <div className="data-table-scroll" tabIndex={0} role="region" aria-label="Connections table, scroll for more columns">
        <table className="configuration-table data-table"><caption className="sr-only">Connections with endpoint assignments, cable details, and illustrative lengths</caption><thead><tr>{columns.map(([key, label]) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.descending ? 'descending' : 'ascending' : 'none'}><button onClick={() => { setSort({ key, descending: sort.key === key && !sort.descending }); setPage(0); }}>{label}<span aria-hidden="true">{sort.key === key ? sort.descending ? ' ↓' : ' ↑' : ' ↕'}</span></button></th>)}</tr></thead>
          <tbody>{paginated.map(row => <tr key={row.key}>{columns.map(([key]) => <td key={key} className={`data-cell-${key}`}>{cell(row, key)}</td>)}</tr>)}{!shown.length && <tr><td colSpan={columns.length} className="config-empty">{scopedRows.length ? 'No connections match these filters.' : 'No connections in the selected distribution frames.'}</td></tr>}</tbody>
        </table>
      </div>
      <div className="data-pagination"><span>{shown.length ? `${start + 1}–${Math.min(start + pageSize, shown.length)} of ${shown.length}` : '0 connections'}</span><label>Rows per page<select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}><option>25</option><option>50</option><option>100</option></select></label><button className="secondary-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pageCount}</span><button className="secondary-button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>
    </section>
    <p className="configuration-help"><Icon name="info"/>Lengths are illustrative estimates based on each frame’s calibration. CSV includes all filtered rows in the current sort order. Edit connections and port assignments in the Racks view.</p>
    {notice && <p role="status" className="data-export-notice">{notice}</p>}
  </div>;
}
