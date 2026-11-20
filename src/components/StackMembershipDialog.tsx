import { useEffect, useRef, useState } from 'react';
import { equipmentStack, firstPortNumber, interfaceName, resolveEquipment, type Endpoint, type Layout, type SwitchStack } from '../model';
import { MAX_STACK_MEMBER, nextStackMember, saveStack, setEquipmentStack } from '../stacks';
import { Icon } from './Icon';
import { StackDetailsFields } from './StackDetailsFields';

export function StackMembershipDialog({ layout, endpoint, onClose, onSave }: { layout: Layout; endpoint: Endpoint; onClose: () => void; onSave: (layout: Layout) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { equipment } = resolveEquipment(layout, endpoint.rackId, endpoint.equipmentId);
  const initial = equipmentStack(layout, equipment);
  const [mode, setMode] = useState(initial?.id ?? 'standalone');
  const [member, setMember] = useState(equipment.stack?.member ?? 0);
  const [stack, setStack] = useState<SwitchStack>(initial ?? { id: crypto.randomUUID(), name: '', managementAddress: '', interfaceNaming: 'juniper' });
  const [error, setError] = useState('');
  useEffect(() => { const d = dialog.current!; d.showModal(); return () => d.close(); }, []);
  function result() {
    if (mode === 'standalone') return setEquipmentStack(layout, endpoint.rackId, endpoint.equipmentId, null);
    const next = saveStack(layout, stack);
    return setEquipmentStack(next, endpoint.rackId, endpoint.equipmentId, stack.id, member);
  }
  let preview = '', conflict = '';
  try { const next = result(); preview = interfaceName(next, resolveEquipment(next, endpoint.rackId, endpoint.equipmentId).equipment, firstPortNumber(equipment)); }
  catch (e) { conflict = (e as Error).message; }
  return <dialog ref={dialog} className="editor-dialog equipment-dialog" aria-labelledby="stack-membership-title" onCancel={onClose}><form onSubmit={event => { event.preventDefault(); try { onSave(result()); } catch (e) { setError((e as Error).message); } }}>
    <div className="dialog-heading"><h2 id="stack-membership-title">Stack / Virtual Chassis</h2><button type="button" className="icon-button" aria-label="Close stack editor" onClick={onClose}><Icon name="close"/></button></div>
    <p>{equipment.label}</p>
    <label>Stack membership<select value={mode} onChange={e => {
      const value = e.target.value; setMode(value); setError('');
      if (value === 'create') { setStack({ id: crypto.randomUUID(), name: '', managementAddress: '', interfaceNaming: 'juniper' }); setMember(0); }
      else if (value !== 'standalone') { setStack(layout.stacks!.find(s => s.id === value)!); try { setMember(equipment.stack?.stackId === value ? equipment.stack.member : nextStackMember(layout, value)); } catch { setMember(0); } }
    }}><option value="standalone">Standalone</option><option value="create">Create a stack</option>{layout.stacks?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    {mode !== 'standalone' && <><StackDetailsFields value={stack} onChange={setStack}/><label>Member number<input type="number" min={0} max={MAX_STACK_MEMBER} step={1} required value={Number.isNaN(member) ? '' : member} onChange={e => setMember(e.target.valueAsNumber)}/></label><p className="note">Stack name, management address, and naming apply to every member. Member numbers must be unique within the stack.</p></>}
    {preview && <p className="stack-interface-preview">First interface: <strong>{preview}</strong></p>}
    <p className="note">Cables, VLANs, locations, and notes remain on their physical ports. These changes update PortTracker records.</p>
    {(error || conflict) && <p className="form-error" role="alert">{error || conflict}</p>}
    <div className="dialog-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!!conflict}>Save stack membership</button></div>
  </form></dialog>;
}
