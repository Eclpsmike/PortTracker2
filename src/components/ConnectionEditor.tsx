import { defaultFiber, mediaLabel } from '../media';
import { FiberFields } from './MediaFields';
import { useEffect, useRef, useState } from 'react';
import { type Cable, type Layout, type Vlan, connectionError, portVlan, getPortMedia } from '../model';
import { EndpointPicker } from './EndpointPicker';
import { Icon } from './Icon';
export function ConnectionEditor({ layout, vlans, initial, isNew, onSave, onDelete, onClose }: { layout: Layout; vlans: readonly Vlan[]; initial: Cable; isNew: boolean; onSave: (c: Cable) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [cable, setCable] = useState(initial);
  const [error, setError] = useState('');
  const fromVlan = portVlan(layout, cable.from), toVlan = portVlan(layout, cable.to);
  const mismatch = [fromVlan, toVlan].some(vlan => vlan !== null && vlan !== cable.vlan);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="editor-dialog" onCancel={onClose} aria-labelledby="editor-title" onClick={ev => { if (ev.target === ev.currentTarget) onClose(); }}>
    <form onSubmit={ev => { ev.preventDefault(); const error = connectionError(layout, cable, vlans); if (error) setError(error); else onSave(cable); }}>
      <div className="dialog-heading"><div><span className="eyebrow">CABLE DOCUMENTATION</span><h2 id="editor-title">{isNew ? 'Create connection' : 'Edit connection'}</h2></div><button type="button" className="icon-button" aria-label="Close connection editor" onClick={onClose}><Icon name="close"/></button></div>
      <p className="subtle">{cable.id} · Changes are saved with this location.</p>
      <EndpointPicker label="From" layout={layout} value={cable.from} onChange={from => { setCable({ ...cable, from }); setError(''); }}/>
      <EndpointPicker label="To" layout={layout} value={cable.to} onChange={to => { setCable({ ...cable, to }); setError(''); }}/>
      <p className="note">From: {mediaLabel(getPortMedia(layout, cable.from))}<br/>To: {mediaLabel(getPortMedia(layout, cable.to))}</p>
      <label>Cable medium<select value={cable.medium ?? 'copper'} onChange={e => { const medium = e.target.value as 'copper' | 'fiber'; const { fiber: _fiber, ...rest } = cable; setCable({ ...rest, medium, ...(medium === 'fiber' && { fiber: defaultFiber(), jacket: '#f3cf19' }) }); setError(''); }}><option value="copper">Copper</option><option value="fiber">Fiber</option></select></label>
      {cable.medium === 'fiber' && <><FiberFields value={cable.fiber ?? defaultFiber()} onChange={fiber => { setCable({ ...cable, fiber }); setError(''); }}/><p className="note">A duplex pair is one connection with 2 strands. Connector, fiber mode, and strand count must match both ports.</p></>}
      <div className="form-row"><label>Logical VLAN<select value={cable.vlan} onChange={ev => setCable({ ...cable, vlan: +ev.target.value })}>{vlans.map(v => <option key={v.id} value={v.id}>{v.id} · {v.name}</option>)}</select></label><label>Cable jacket<input type="color" aria-label="Cable jacket" value={cable.jacket} onChange={ev => setCable({ ...cable, jacket: ev.target.value })}/></label></div>
      <p className="note">Port VLANs: From {fromVlan ?? 'unassigned'} · To {toVlan ?? 'unassigned'}. Saving a cable does not change port assignments.</p>
      {mismatch && <p className="port-vlan-mismatch" role="status">The cable VLAN differs from an assigned port VLAN. Manage port assignments in the Ports inspector.</p>}
      <p className="note">Cable jacket color is independent of the VLAN overlay. Endpoints route through the manager on their side of the selected equipment face. Cross-rack and opposite-side connections use the overhead tray.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-footer">{!isNew && <button type="button" className="danger-button" onClick={() => onDelete(cable.id)}><Icon name="trash"/>Remove</button>}<button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit"><Icon name="check"/>{isNew ? 'Create connection' : 'Save connection'}</button></div>
    </form>
  </dialog>;
}
