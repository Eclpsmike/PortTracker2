import { useEffect, useRef, useState } from 'react';
import { type Cable, type Layout, type Vlan, type Calibration, type Endpoint, connectionError, endpointKey } from '../model';
import { deriveConnection, connectionPortMatches, nextConnectionId, nextConnectionOnEquipment, type ConnectionPortMatch } from '../connectionDraft';
import type { CableColor } from '../configuration';
import type { LengthUnit } from '../units';
import { ConnectionRoutePreview } from './ConnectionRoutePreview';
import { EndpointPicker } from './EndpointPicker';
import { Icon } from './Icon';

export function ConnectionEditor({ layout, vlans, initial, isNew, calibration, lengthUnit, portPrefix, cableColors, defaultCableColor, onSave, onDelete, onClose }: {
  layout: Layout; vlans: readonly Vlan[]; initial: Cable; isNew: boolean; calibration: Calibration; lengthUnit: LengthUnit; portPrefix?: string;
  defaultCableColor: string; cableColors: readonly CableColor[]; onSave: (c: Cable, addAnother?: boolean) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const fromQuick = useRef<HTMLInputElement>(null), toQuick = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(isNew);
  const [queries, setQueries] = useState({ from: '', to: '' });
  const [resolved, setResolved] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [savedNotice, setSavedNotice] = useState('');
  const [draft, setDraft] = useState(() => {
    const value = deriveConnection(layout, initial);
    return { ...value, jacket: isNew ? defaultCableColor : initial.jacket.toLowerCase() };
  });
  const [error, setError] = useState('');
  const cable = deriveConnection(layout, draft);
  const configuredColor = cableColors.some(color => color.color === cable.jacket);
  const existingColor = !creating && cable.jacket === initial.jacket.toLowerCase();
  const validColor = configuredColor || existingColor;
  const previewLayout = { ...layout, cables: [...layout.cables.filter(c => c.id !== cable.id), cable] };
  function changeEndpoint(side: 'from' | 'to', endpoint: Endpoint) {
    const next = deriveConnection(layout, { ...draft, [side]: endpoint });
    setDraft({ ...next, jacket: draft.jacket });setError('');
    setQueries(current => ({ ...current, [side]: '' }));setResolved(current => ({ ...current, [side]: null }));
  }
  function pickPort(side: 'from' | 'to', match: ConnectionPortMatch, query = match.label) {
    if (match.occupied) return;
    setQueries(current => ({ ...current, [side]: query }));
    setResolved(current => ({ ...current, [side]: endpointKey(match.endpoint) }));
    setDraft(current => deriveConnection(layout, { ...current, [side]: match.endpoint }));setError('');
  }
  function typePort(side: 'from' | 'to', query: string) {
    setQueries(current => ({ ...current, [side]: query }));setResolved(current => ({ ...current, [side]: null }));setError('');
    const { exact } = connectionPortMatches(layout, query, portPrefix, creating ? undefined : cable.id);
    if (exact.length === 1 && !exact[0].occupied) pickPort(side, exact[0], query);
  }
  function save(addAnother = false) {
    const unresolved = (['from', 'to'] as const).find(side => queries[side].trim() && resolved[side] !== endpointKey(cable[side]));
    const problem = unresolved ? `Choose a matching ${unresolved} port or clear its quick entry.`
      : !validColor ? 'Choose a configured cable color.'
      : creating && layout.cables.some(item => item.id === cable.id) ? 'This connection ID is already in use. Reopen the connection dialog.'
      : connectionError(layout, cable, vlans);
    if (problem) { setError(problem);return; }
    onSave(cable, addAnother);
    if (addAnother) {
      const next = nextConnectionOnEquipment(previewLayout, cable);
      setDraft(next ?? { ...cable, id: nextConnectionId(previewLayout) });setCreating(true);
      setQueries({ from: '', to: '' });setResolved({ from: null, to: null });setError('');
      setSavedNotice(`${cable.id} saved. ${next ? 'Next available ports selected.' : 'Choose ports for the next connection.'}`);
      fromQuick.current?.focus();
    }
  }
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="editor-dialog connection-editor-dialog" onCancel={onClose} aria-labelledby="editor-title" onClick={ev => { if (ev.target === ev.currentTarget) onClose(); }}>
    <form onSubmit={ev => { ev.preventDefault();save(); }}>
      <div className="dialog-heading"><div><span className="eyebrow">CABLE DOCUMENTATION</span><h2 id="editor-title">{creating ? 'Create connection' : 'Edit connection'}</h2></div><button type="button" className="icon-button" aria-label="Close connection editor" onClick={onClose}><Icon name="close"/></button></div>
      <p className="subtle">{cable.id} · Changes are saved with this location.</p>
      <div className="connection-editor-columns">
        <ConnectionRoutePreview layout={previewLayout} cable={cable} calibration={calibration} lengthUnit={lengthUnit} portPrefix={portPrefix}/>
        <div className="connection-editor-settings">
          <section className="connection-quick-entry" aria-label="Quick connection entry">
            <h3>Quick entry</h3>
            <div className="connection-quick-fields">{(['from', 'to'] as const).map(side => {
              const matches = connectionPortMatches(layout, queries[side], portPrefix, creating ? undefined : cable.id);
              const selected = resolved[side] === endpointKey(cable[side]) ? matches.exact.find(match => endpointKey(match.endpoint) === resolved[side]) : undefined;
              return <div key={side}><label>{side === 'from' ? 'From port' : 'To port'}<input type="text" aria-label={`Quick ${side} port`} ref={side === 'from' ? fromQuick : toQuick} autoComplete="off" spellCheck={false} placeholder={side === 'from' ? 'e.g. 1/0/33' : 'e.g. B450'} value={queries[side]} onChange={event => typePort(side, event.target.value)} onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault();if (side === 'from' && selected) toQuick.current?.focus(); }
                if (event.key === 'Escape' && queries[side]) { event.preventDefault();event.stopPropagation();typePort(side, ''); }
              }}/></label>
                {queries[side].trim() && (selected ? <p className="note">{selected.description} / {selected.label}</p> : <>
                  <p className="note" role="status">{matches.suggestions.length ? 'Choose a matching port:' : 'No matching port.'}</p>
                  <ul>{matches.suggestions.slice(0, 8).map(match => <li key={endpointKey(match.endpoint)}><button type="button" disabled={match.occupied} onClick={() => pickPort(side, match)}><strong>{match.label}</strong><span>{match.description}{match.occupied ? ' · Already connected' : ''}</span></button></li>)}</ul>
                  {matches.suggestions.length > 8 && <p className="note">{matches.suggestions.length} matches. Enter more of the port label.</p>}
                </>)}
              </div>;
            })}</div>
          </section>
          <EndpointPicker portPrefix={portPrefix} label="From" layout={layout} value={cable.from} onChange={endpoint => changeEndpoint('from', endpoint)}/>
          <EndpointPicker portPrefix={portPrefix} label="To" layout={layout} value={cable.to} onChange={endpoint => changeEndpoint('to', endpoint)}/>
          <label>Cable color<div className="connection-color-select"><span className="swatch" style={{ background: cable.jacket || 'transparent' }}/><select aria-label="Cable color" value={cable.jacket} onChange={event => { setDraft({ ...draft, jacket: event.target.value });setError(''); }}>
            {!validColor && <option value="">Choose a cable color</option>}
            {existingColor && !configuredColor && <option value={cable.jacket}>Current color ({cable.jacket})</option>}
            {cableColors.map(color => <option key={color.color} value={color.color}>{color.name}</option>)}
          </select></div></label>
          <a className="connection-color-config" href="#/configuration/stock" onClick={onClose}>Configure cable colors</a>
          {!cableColors.length && <p className="note">Add available colors in Cable stock to select a jacket color.</p>}
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {savedNotice && <p className="note" role="status">{savedNotice}</p>}
      <div className="dialog-footer">{!creating && <button type="button" className="danger-button" onClick={() => onDelete(cable.id)}><Icon name="trash"/>Remove</button>}<button type="button" className="secondary-button" onClick={onClose}>{savedNotice ? 'Done' : 'Cancel'}</button><button className="secondary-button" type="button" disabled={!validColor} onClick={() => save(true)}>Save and add another</button><button className="primary-button" type="submit" disabled={!validColor}><Icon name="check"/>{creating ? 'Create connection' : 'Save connection'}</button></div>
    </form>
  </dialog>;
}
