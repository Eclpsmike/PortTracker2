import { useEffect, useRef, useState } from 'react';
import { type FiberStock, defaultFiber, fiberLabel, validFiberStock, matchingFiberStock } from '../media';
import { type LengthUnit, formatLengthInput, formatLengthValue, lengthUnitSymbol, toMeters } from '../units';
import { FiberFields } from './MediaFields';
function FiberStockEditor({ initial, unit, stock, index, onSave, onClose }: { initial?: FiberStock; unit: LengthUnit; stock: FiberStock[]; index?: number; onSave: (value: FiberStock) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<FiberStock>(initial ?? { ...defaultFiber(), lengthM: NaN, jacket: '#f3cf19' });
  const [raw, setRaw] = useState(initial ? formatLengthInput(initial.lengthM, unit) : '');
  const [error, setError] = useState('');
  useEffect(() => { const d = dialog.current!; d.showModal(); return () => d.close(); }, []);
  return <dialog ref={dialog} className="config-dialog" onCancel={onClose} aria-labelledby="fiber-stock-title"><form onSubmit={e => {
    e.preventDefault();
    if (!validFiberStock(draft)) { setError('Enter a positive length and valid fiber details.'); return; }
    if (stock.some((s, i) => i !== index && Math.abs(s.lengthM - draft.lengthM) < 1e-6 && matchingFiberStock({ fiber: draft, jacket: draft.jacket }, s))) { setError('That fiber cable size and specification is already in stock.'); return; }
    onSave(draft);
  }}>
    <h2 id="fiber-stock-title">{initial ? 'Edit fiber stock' : 'Add fiber stock'}</h2>
    <FiberFields value={draft} onChange={fiber => setDraft({ ...draft, ...fiber })}/>
    <label className="config-field">Fiber cable length ({lengthUnitSymbol(unit)})<input type="number" required min="0" step="any" value={raw} onChange={e => { setRaw(e.target.value); setDraft({ ...draft, lengthM: toMeters(e.target.valueAsNumber, unit) }); }}/></label>
    <label className="config-field">Fiber jacket color<input type="color" value={draft.jacket} onChange={e => setDraft({ ...draft, jacket: e.target.value })}/></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button">Save fiber stock</button></div>
  </form></dialog>;
}
export function FiberStockSection({ stock, unit, onChange }: { stock: FiberStock[]; unit: LengthUnit; onChange: (stock: FiberStock[]) => void }) {
  const [editor, setEditor] = useState<{ index?: number } | null>(null);
  return <section className="panel configuration-table-panel fiber-stock" aria-label="Fiber cable stock">
    <div className="configuration-table-toolbar"><h2>Fiber cable stock</h2><button className="primary-button" onClick={() => setEditor({})}>Add fiber stock</button></div>
    <p className="note">Recommendations match mode, connectors, strand count, and jacket color, then choose the shortest length that covers the route. Connector direction may be reversed. Copper stock is managed above.</p>
    <div className="configuration-table-scroll"><table className="configuration-table"><caption className="sr-only">Available fiber cables</caption><thead><tr><th>Specification</th><th>Length</th><th>Jacket</th><th>Actions</th></tr></thead><tbody>
      {stock.map((s, i) => <tr key={i}><td>{fiberLabel(s)}</td><td>{formatLengthValue(s.lengthM, unit)} {lengthUnitSymbol(unit)}</td><td><span className="swatch" style={{ background: s.jacket }}/>{s.jacket}</td><td><div className="config-actions"><button className="secondary-button" aria-label={`Edit fiber stock ${i + 1}`} onClick={() => setEditor({ index: i })}>Edit</button><button className="config-remove" aria-label={`Remove fiber stock ${i + 1}`} onClick={() => onChange(stock.filter((_, index) => index !== i))}>Remove</button></div></td></tr>)}
      {!stock.length && <tr><td colSpan={4} className="config-empty">No fiber stock configured. Add a fiber cable size to enable recommendations.</td></tr>}
    </tbody></table></div>
    {editor && <FiberStockEditor initial={editor.index === undefined ? undefined : stock[editor.index]} index={editor.index} stock={stock} unit={unit} onClose={() => setEditor(null)} onSave={value => { onChange([...stock.filter((_, i) => i !== editor.index), value].sort((a, b) => a.lengthM - b.lengthM)); setEditor(null); }}/ >}
  </section>;
}
