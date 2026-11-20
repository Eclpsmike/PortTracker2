import { useState } from 'react';
import { type PortMedia, mediaLabel } from '../media';
import { PortMediaFields } from './MediaFields';
export function PortMediaControl({ initial, count, onApply }: { initial: PortMedia; count: number; onApply: (value: PortMedia) => void }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  return <details className="port-media-control"><summary>Physical port settings{count > 1 ? ` · ${count} selected` : ''}</summary>
    <p className="note">{count > 1 ? 'Applying replaces physical settings on every selected port. Review mixed port types before applying.' : mediaLabel(initial)}</p>
    <PortMediaFields value={draft} onChange={value => { setDraft(value); setError(''); setMessage(''); }}/>
    <p className="note">Use 2 strands for a duplex pair represented by one port. Transceiver models are documentation; speed, wavelength, and optical budgets are not validated.</p>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <button className="secondary-button" disabled={!count} onClick={() => { try { onApply(draft); setError(''); setMessage('Physical port settings saved.'); } catch (e) { setError((e as Error).message); } }}>{count > 1 ? `Apply physical settings to ${count} ports` : 'Save physical port'}</button>
  </details>;
}
