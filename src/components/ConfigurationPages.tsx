import { ConfigurationNav } from './ConfigurationNav';
import { FiberStockSection } from './FiberStockSection';
import { useEffect, useRef, useState } from 'react';
import type { Cable, Vlan, PortVlans } from '../model';
import { type Configuration, stockLengthError, vlanError, vlanRemovalError } from '../configuration';
import { type LengthUnit, formatLengthInput, formatLengthValue, fromMeters, lengthUnitSymbol, toMeters } from '../units';
import { Icon } from './Icon';
import { LengthUnitSelect } from './LengthUnitSelect';

export type ConfigurationPage = 'vlans' | 'stock';
type Props = {
  portVlans?: PortVlans; page: ConfigurationPage; configuration: Configuration; cables: readonly Cable[];
  unit: LengthUnit; onUnit: (unit: LengthUnit) => void;
  onChange: (configuration: Configuration, message: string) => void;
  notice: string;
};

function VlanEditor({ initial, vlans, isNew, onSave, onClose }: {
  initial: Vlan; vlans: readonly Vlan[]; isNew: boolean; onSave: (v: Vlan) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(initial);
  const [id, setId] = useState(isNew ? '' : String(initial.id));
  const [error, setError] = useState('');
  useEffect(() => { const d = dialog.current!; d.showModal(); return () => d.close(); }, []);
  return <dialog ref={dialog} className="config-dialog" onCancel={onClose} aria-labelledby="vlan-editor-title">
    <form onSubmit={event => {
      event.preventDefault();
      const value = { ...draft, id: Number(id), name: draft.name.trim() };
      const problem = vlanError(value, vlans, isNew ? undefined : initial.id);
      if (problem) setError(problem); else onSave(value);
    }}>
      <div className="dialog-heading"><div><span className="eyebrow">VLAN CONFIGURATION</span><h2 id="vlan-editor-title">{isNew ? 'Add VLAN' : 'Edit VLAN'}</h2></div><button className="icon-button" type="button" aria-label="Close VLAN editor" onClick={onClose}><Icon name="close"/></button></div>
      <label className="config-field">VLAN ID<input type="number" min="1" max="4094" step="1" required disabled={!isNew} value={id} onChange={e => { setId(e.target.value); setError(''); }}/></label>
      {!isNew && <p className="note">The VLAN ID stays fixed so existing connections keep their assignment.</p>}
      <label className="config-field">VLAN name<input type="text" maxLength={60} required value={draft.name} onChange={e => { setDraft({ ...draft, name: e.target.value }); setError(''); }}/></label>
      <label className="config-field">Overlay color<div className="color-field"><input aria-label="Overlay color" type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })}/><code>{draft.color}</code></div></label>
      <p className="note">This color identifies the VLAN throughout the rack. Physical cable jacket colors stay separate.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Save VLAN</button></div>
    </form>
  </dialog>;
}

function StockEditor({ initialM, stock, editingIndex, unit, onSave, onClose }: {
  initialM?: number; stock: readonly number[]; editingIndex?: number; unit: LengthUnit;
  onSave: (meters: number) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draftUnit, setDraftUnit] = useState(unit);
  const [meters, setMeters] = useState(initialM ?? NaN);
  const [raw, setRaw] = useState(initialM === undefined ? '' : formatLengthInput(initialM, unit));
  const [error, setError] = useState('');
  useEffect(() => { const d = dialog.current!; d.showModal(); return () => d.close(); }, []);
  return <dialog ref={dialog} className="config-dialog" onCancel={onClose} aria-labelledby="stock-editor-title">
    <form onSubmit={event => {
      event.preventDefault();
      const problem = stockLengthError(meters, stock, editingIndex);
      if (problem) setError(problem); else onSave(meters);
    }}>
      <div className="dialog-heading"><div><span className="eyebrow">CABLE STOCK</span><h2 id="stock-editor-title">{editingIndex === undefined ? 'Add stock length' : 'Edit stock length'}</h2></div><button className="icon-button" type="button" aria-label="Close stock editor" onClick={onClose}><Icon name="close"/></button></div>
      <LengthUnitSelect value={draftUnit} onChange={next => { if (raw !== '' && Number.isFinite(meters)) setRaw(formatLengthInput(meters, next)); setDraftUnit(next); }}/>
      <label className="config-field">Cable length ({lengthUnitSymbol(draftUnit)})<input type="number" step="any" min="0" required value={raw} onChange={event => { setRaw(event.target.value); setMeters(event.target.value === '' ? NaN : toMeters(event.target.valueAsNumber, draftUnit)); setError(''); }}/></label>
      <p className="note">Enter an available cable size. Recommendations choose the shortest configured length that covers the estimated route and slack.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Save stock length</button></div>
    </form>
  </dialog>;
}

export function ConfigurationPages({ page, configuration, cables, unit, onUnit, onChange, notice, portVlans = {} }: Props) {
  const [query, setQuery] = useState('');
  const [vlanEditor, setVlanEditor] = useState<{ value: Vlan; isNew: boolean } | null>(null);
  const [stockEditor, setStockEditor] = useState<{ index?: number; meters?: number } | null>(null);
  const [error, setError] = useState('');
  const { vlans, stockedLengthsM } = configuration;
  const shownVlans = vlans.filter(v => `${v.id} ${v.name}`.toLowerCase().includes(query.toLowerCase()));
  const symbol = lengthUnitSymbol(unit);
  function removeVlan(id: number) {
    const problem = vlanRemovalError(id, cables, portVlans);
    if (problem) { setError(problem); return; }
    onChange({ ...configuration, vlans: vlans.filter(v => v.id !== id) }, `VLAN ${id} removed.`);
  }
  return <main className="configuration-workspace">
    <ConfigurationNav page={page}/>
    <section className="configuration-content">
      <div className="configuration-heading"><div><span className="eyebrow">CONFIGURATION</span><h1>{page === 'vlans' ? 'VLAN list' : 'Cable stock'}</h1><p>{page === 'vlans' ? 'Define the networks and logical colors used across your racks.' : 'Manage available cable lengths for automatic size recommendations.'}</p></div>
        <button className="primary-button" onClick={() => page === 'vlans' ? setVlanEditor({ value: { id: 1, name: '', color: '#159de7' }, isNew: true }) : setStockEditor({})}><Icon name="plus"/>{page === 'vlans' ? 'Add VLAN' : 'Add stock length'}</button>
      </div>
      {notice && <p className="configuration-warning" role="status"><Icon name="info"/>{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {page === 'stock' && <h2>Copper cable stock</h2>}
      <section className="panel configuration-table-panel">
        <div className="configuration-table-toolbar"><strong>{page === 'vlans' ? `${vlans.length} VLANs configured` : `${stockedLengthsM.length} stocked lengths`}</strong>
          {page === 'vlans' ? <label className="search-field"><Icon name="search" size={16}/><input aria-label="Search VLANs" placeholder="Search by ID or name…" value={query} onChange={e => setQuery(e.target.value)}/></label> : <LengthUnitSelect value={unit} onChange={onUnit}/>}
        </div>
        <div className="configuration-table-scroll">
          {page === 'vlans' ? <table className="configuration-table"><caption className="sr-only">Configured VLANs</caption><thead><tr><th scope="col">VLAN ID</th><th scope="col">Name</th><th scope="col">Overlay</th><th scope="col">Ports</th><th scope="col">Connections</th><th scope="col">Actions</th></tr></thead><tbody>
            {shownVlans.map(v => {
              const count = cables.filter(c => c.vlan === v.id).length;
              const ports = Object.values(portVlans).filter(id => id === v.id).length;
              return <tr key={v.id}><td><span className="vlan-id-badge">{v.id}</span></td><td className="config-name">{v.name}</td><td><span className="config-color"><span className="swatch" style={{ background: v.color }}/><code>{v.color}</code></span></td><td><span className={ports ? 'usage-badge' : 'unused-badge'}>{ports ? `${ports} assigned` : 'Unused'}</span></td><td><span className={count ? 'usage-badge' : 'unused-badge'}>{count ? `${count} assigned` : 'Unused'}</span></td><td><div className="config-actions"><button className="secondary-button" aria-label={`Edit VLAN ${v.id}`} onClick={() => setVlanEditor({ value: v, isNew: false })}><Icon name="edit" size={14}/>Edit</button><button className="config-remove" disabled={count > 0 || ports > 0} title={count || ports ? 'Clear port assignments and reassign or remove connected cables first.' : `Remove VLAN ${v.id}`} aria-label={`Remove VLAN ${v.id}`} onClick={() => removeVlan(v.id)}><Icon name="trash" size={15}/></button></div></td></tr>;
            })}
            {!shownVlans.length && <tr><td colSpan={6} className="config-empty">{vlans.length ? 'No VLANs match your search.' : 'No VLANs configured. Add one to create cable connections.'}</td></tr>}
          </tbody></table> : <table className="configuration-table"><caption className="sr-only">Available cable lengths</caption><thead><tr><th scope="col">Stock length ({symbol})</th><th scope="col">Equivalent ({lengthUnitSymbol(unit === 'metric' ? 'imperial' : 'metric')})</th><th scope="col">Use</th><th scope="col">Actions</th></tr></thead><tbody>
            {stockedLengthsM.map((meters, index) => <tr key={meters}><td className="stock-size">{Number(fromMeters(meters, unit).toFixed(6))} <span>{symbol}</span></td><td>{formatLengthValue(meters, unit === 'metric' ? 'imperial' : 'metric')} {lengthUnitSymbol(unit === 'metric' ? 'imperial' : 'metric')}</td><td><span className="usage-badge">Available for recommendations</span></td><td><div className="config-actions"><button className="secondary-button" aria-label={`Edit stock length ${formatLengthValue(meters, unit)} ${symbol}`} onClick={() => setStockEditor({ index, meters })}><Icon name="edit" size={14}/>Edit</button><button className="config-remove" aria-label={`Remove stock length ${formatLengthValue(meters, unit)} ${symbol}`} onClick={() => onChange({ ...configuration, stockedLengthsM: stockedLengthsM.filter((_, i) => i !== index) }, 'Stock length removed.')}><Icon name="trash" size={15}/></button></div></td></tr>)}
            {!stockedLengthsM.length && <tr><td colSpan={4} className="config-empty">No stocked lengths. Add a cable size to enable stock recommendations.</td></tr>}
          </tbody></table>}
        </div>
      </section>
      {page === 'stock' && <FiberStockSection stock={configuration.fiberStock ?? []} unit={unit} onChange={fiberStock => onChange({ ...configuration, fiberStock }, 'Fiber stock updated.')}/>}
      <p className="configuration-help"><Icon name="info" size={17}/>{page === 'vlans' ? 'Usage includes every distribution frame, including archived ones. VLAN IDs stay fixed; clear port assignments and reassign connected cables before removing a VLAN.' : 'Stock contains available sizes, not inventory quantities. Changing display units preserves the physical sizes. If no size is long enough, the inspector shows “No stock match”.'}</p>
    </section>
    {vlanEditor && <VlanEditor initial={vlanEditor.value} isNew={vlanEditor.isNew} vlans={vlans} onClose={() => setVlanEditor(null)} onSave={v => { onChange({ ...configuration, vlans: [...vlans.filter(item => item.id !== v.id), v].sort((a, b) => a.id - b.id) }, `VLAN ${v.id} saved.`); setVlanEditor(null); }}/ >}
    {stockEditor && <StockEditor initialM={stockEditor.meters} editingIndex={stockEditor.index} stock={stockedLengthsM} unit={unit} onClose={() => setStockEditor(null)} onSave={meters => { onChange({ ...configuration, stockedLengthsM: [...stockedLengthsM.filter((_, i) => i !== stockEditor.index), meters].sort((a, b) => a - b) }, 'Stock length saved.'); setStockEditor(null); }}/ >}
  </main>;
}
