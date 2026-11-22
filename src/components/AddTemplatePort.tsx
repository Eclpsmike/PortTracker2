import { useState } from 'react';
import { CONSOLE_CONNECTORS, type ConsoleConnector, type EquipmentSide, type PortFunction } from '../equipmentTemplates';
import type { PortMedia } from '../media';
import { PortMediaFields } from './MediaFields';

export interface ManualPortInput { name: string; function: PortFunction; face: EquipmentSide; consoleConnector?: ConsoleConnector; media?: PortMedia }
export function AddTemplatePort({ hasRear, onAdd, onCancel }: { hasRear: boolean; onAdd: (port: ManualPortInput) => void; onCancel: () => void }) {
  const [name, setName] = useState(''), [fn, setFunction] = useState<PortFunction>('ethernet');
  const [face, setFace] = useState<EquipmentSide>('front');
  const [connector, setConnector] = useState<ConsoleConnector>('RJ45');
  const [media, setMedia] = useState<PortMedia>({ kind: 'copper' });
  const [error, setError] = useState('');
  return <form className="template-grid" aria-label="Add port" onSubmit={event => {
    event.preventDefault(); setError('');
    try { onAdd({ name: name.trim(), function: fn, face, ...(fn === 'console' ? { consoleConnector: connector } : { media }) }); }
    catch (error) { setError((error as Error).message); }
  }}>
    <h3>Add port</h3>
    <div className="template-fields">
      <label>New port label<input autoFocus required maxLength={80} value={name} placeholder="Console, MGMT, or port name" onChange={event => setName(event.target.value)}/></label>
      <label>Port function<select value={fn} onChange={event => setFunction(event.target.value as PortFunction)}><option value="ethernet">Ethernet / network</option><option value="console">Serial console</option></select></label>
      <label>New port face<select value={face} onChange={event => setFace(event.target.value as EquipmentSide)}><option value="front">Front</option><option value="rear" disabled={!hasRear}>Rear{!hasRear?' — add a rear image first':''}</option></select></label>
      {fn === 'console' && <label>Console connector<select value={connector} onChange={event => setConnector(event.target.value as ConsoleConnector)}>{CONSOLE_CONNECTORS.map(c => <option key={c}>{c}</option>)}</select></label>}
    </div>
    {fn === 'ethernet' ? <PortMediaFields value={media} onChange={setMedia}/> : <p className="note">Console ports can be mapped and documented. They have no VLAN or Ethernet connection settings; serial console cabling is not supported yet.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="template-actions"><button type="submit" className="primary-button">Add port to template</button><button type="button" className="secondary-button" onClick={onCancel}>Cancel adding port</button></div>
  </form>;
}
