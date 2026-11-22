import { interfaceName, rackName, equipmentName, type SwitchStack } from '../model';
import { confirmEquipmentMove } from './confirmEquipmentMove';
import { createStackEquipment, MAX_STACK_CREATE, MAX_STACK_MEMBER, nextStackMember, planStackMembers, setEquipmentStack, type StackPlacement } from '../stacks';
import { createPatchPanels, planPatchPanels, MAX_PANEL_BATCH } from '../patchPanels';
import { formatPrefixedPortNumber, MAX_PORT_NUMBER } from '../portNumbering';
import { StackDetailsFields } from './StackDetailsFields';
import { RackPositionPreview } from './RackPositionPreview';
import { useEffect, useRef, useState } from 'react';
import { EQUIPMENT_TEMPLATES, findEquipmentTemplate } from '../equipmentTemplates';
import { type Endpoint, type Layout, type EquipmentPlacement, addEquipment, moveEquipment, removeEquipment, nextEquipmentId, firstFreeUnit, placementError, equipmentRemovalImpact, equipmentUnits, endpointLabel } from '../model';
import { Icon } from './Icon';
export type EquipmentAction = { kind: 'add'; templateId?: string } | { kind: 'move' | 'remove'; endpoint: Endpoint };
export function EquipmentDialog({ layout, action, locationName, portPrefix, initialRackId, onClose, onSave }: {
  layout: Layout; action: EquipmentAction; locationName: string; portPrefix?: string; initialRackId: string; onClose: () => void;
  onSave: (layout: Layout, selected: Endpoint | null, message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const previewElement = useRef<HTMLElement>(null);
  const templates = [...EQUIPMENT_TEMPLATES, ...(layout.templates ?? [])];
  const impact = action.kind !== 'add' ? equipmentRemovalImpact(layout, action.endpoint.rackId, action.endpoint.equipmentId) : null;
  const initialTemplate = action.kind === 'add' ? findEquipmentTemplate(action.templateId ?? '', layout.templates) ?? templates[0] : null;
  const initialRack = layout.racks.find(r => r.id === (impact?.rack.id ?? initialRackId)) ?? layout.racks[0];
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? '');
  const [rackId, setRackId] = useState(initialRack?.id ?? '');
  const [bottomU, setBottomU] = useState(impact?.equipment.bottomU ?? (initialRack ? firstFreeUnit(initialRack, initialTemplate!.heightU) ?? 1 : 1));
  const [id, setId] = useState(initialTemplate ? nextEquipmentId(layout, initialTemplate.kind) : impact!.equipment.id);
  const [label, setLabel] = useState(id);
  const [error, setError] = useState('');
  const [stackMode, setStackMode] = useState('standalone');
  const [stack, setStack] = useState<SwitchStack>({ id: crypto.randomUUID(), name: '', managementAddress: '', interfaceNaming: 'juniper' });
  const [member, setMember] = useState(0);
  const [count, setCount] = useState(2);
  const [preview, setPreview] = useState<{ signature: string; rows: StackPlacement[] } | null>(null);
  const [panelQuantity, setPanelQuantity] = useState(1);
  const [panelStart, setPanelStart] = useState(initialTemplate?.portStart ?? 1);
  const [panelPreview, setPanelPreview] = useState<{ signature: string; rows: EquipmentPlacement[] } | null>(null);
  const template = findEquipmentTemplate(templateId, layout.templates);
  const rack = layout.racks.find(r => r.id === rackId);
  const height = impact?.equipment.heightU ?? template?.heightU ?? 1;
  const exclude = action.kind === 'move' && rackId === action.endpoint.rackId ? action.endpoint.equipmentId : undefined;
  const conflict = rack ? placementError(rack, bottomU, height, exclude) : 'Add a rack before placing equipment.';
  const title = action.kind === 'add' ? 'Add equipment from template' : action.kind === 'move' ? 'Move equipment' : 'Remove equipment';
  const creatingStack = action.kind === 'add' && template?.kind === 'switch' && stackMode === 'create';
  const addingPanels = action.kind === 'add' && template?.kind === 'patch-panel';
  const panelPortLabel = (number: number) => portPrefix ? formatPrefixedPortNumber(portPrefix, number) : String(number);
  const panelSignature = JSON.stringify([templateId, rackId, bottomU, id, label, panelQuantity, panelStart]);
  const panels = panelPreview?.signature === panelSignature ? panelPreview.rows : null;
  let panelConflict = '';
  if (addingPanels) try {
    const rows = panels ?? planPatchPanels(layout, { rackId, templateId, id: id.trim(), label, bottomU }, panelQuantity, panelStart);
    if (panels || panelQuantity === 1) createPatchPanels(layout, rows);
  } catch (e) { panelConflict = (e as Error).message; }
  function buildPanelPreview() {
    try { setPanelPreview({ signature: panelSignature, rows: planPatchPanels(layout, { rackId, templateId, id: id.trim(), label, bottomU }, panelQuantity, panelStart) }); setError(''); }
    catch (e) { setError((e as Error).message); }
  }
  const signature = JSON.stringify([templateId, rackId, bottomU, id, label, member, count]);
  const members = preview?.signature === signature ? preview.rows : null;
  const hasPreview = (creatingStack && !!members) || (addingPanels && !!panels);
  useEffect(() => { if (hasPreview) previewElement.current?.scrollIntoView({ block: 'start' }); }, [hasPreview]);
  let stackConflict = '';
  if (creatingStack && members) try { createStackEquipment(layout, stack, members); } catch (e) { stackConflict = (e as Error).message; }
  else if (action.kind === 'add' && stackMode !== 'standalone' && stackMode !== 'create') try {
    setEquipmentStack(addEquipment(layout, { rackId, templateId, id: id.trim(), label, bottomU }), rackId, id.trim(), stackMode, member);
  } catch (e) { stackConflict = (e as Error).message; }
  function buildPreview() {
    try { setPreview({ signature, rows: planStackMembers(layout, { rackId, templateId, id: id.trim(), label, bottomU }, count, member) }); setError(''); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { const d = dialog.current!; d.showModal(); return () => d.close(); }, []);
  function chooseRack(next: string) {
    setRackId(next); const r = layout.racks.find(r => r.id === next)!;
    setBottomU(firstFreeUnit(r, height, action.kind === 'move' && next === action.endpoint.rackId ? action.endpoint.equipmentId : undefined) ?? 1); setError('');
  }
  function submit() {
    try {
      if (action.kind === 'add') {
        const draft: EquipmentPlacement = { rackId, templateId, id: id.trim(), label, bottomU };
        if (addingPanels) {
          if (panelQuantity > 1 && !panels) { buildPanelPreview(); return; }
          const rows = panels ?? planPatchPanels(layout, draft, panelQuantity, panelStart);
          const next = createPatchPanels(layout, rows), first = rows[0];
          onSave(next, { rackId: first.rackId, equipmentId: first.id, port: first.portStart! }, `${rows.length} patch panel(s) added with ports ${panelPortLabel(panelStart)}–${panelPortLabel(panelStart + rows.length * template!.portCount - 1)}.`);
        } else if (creatingStack) {
          if (!members) { buildPreview(); return; }
          const next = createStackEquipment(layout, stack, members), first = members[0];
          onSave(next, { rackId: first.rackId, equipmentId: first.id, port: findEquipmentTemplate(first.templateId, layout.templates)?.portStart ?? 1 }, `${stack.name.trim()} created with ${members.length} members.`);
        } else {
          let next = addEquipment(layout, draft);
          if (stackMode !== 'standalone') next = setEquipmentStack(next, rackId, draft.id, stackMode, member);
          onSave(next, { rackId, equipmentId: draft.id, port: template?.portStart ?? 1 }, `${draft.label} added to ${rackName(layout, rackId)}.`);
        }
      } else if (action.kind === 'move') {
        const next=moveEquipment(layout, action.endpoint.rackId, action.endpoint.equipmentId, rackId, bottomU);
        if(!confirmEquipmentMove(layout,action.endpoint.rackId,action.endpoint.equipmentId,rackId,bottomU))return;
        onSave(next, { ...action.endpoint, rackId }, `${equipmentName(layout, action.endpoint)} moved to ${rackName(layout, rackId)}. Connections and port data preserved.`);
      }
      else onSave(removeEquipment(layout, action.endpoint.rackId, action.endpoint.equipmentId), null, `${equipmentName(layout, action.endpoint)} removed.`);
    } catch (e) { setError((e as Error).message); }
  }
  return <dialog ref={dialog} className={`editor-dialog equipment-dialog${hasPreview ? ' stack-creation-dialog' : ''}`} aria-labelledby="equipment-dialog-title" onCancel={onClose}>
    <form onSubmit={e => { e.preventDefault(); submit(); }}>
      <div className="dialog-heading"><h2 id="equipment-dialog-title">{title}</h2><button type="button" className="icon-button" aria-label="Close equipment editor" onClick={onClose}><Icon name="close"/></button></div>
      <p className="subtle">Distribution frame: {locationName}</p>
      {action.kind === 'add' && <>
        <label>Equipment template<select aria-label="Equipment template" value={templateId} onChange={e => {
          const t = findEquipmentTemplate(e.target.value, layout.templates)!; setTemplateId(t.id); setPanelStart(t.portStart ?? 1); const nextId = nextEquipmentId(layout, t.kind); setId(nextId); setLabel(nextId); setBottomU(rack ? firstFreeUnit(rack, t.heightU) ?? 1 : 1); if (t.kind !== 'switch') setStackMode('standalone'); setError('');
        }}>{templates.map(t => <option key={t.id} value={t.id}>{t.name} · {t.heightU}U · {t.portCount} ports</option>)}</select></label>
        <p className="note"><a href="#/configuration/templates" onClick={onClose}>Import or map another template</a></p>
        <div className="form-row"><label>Equipment ID<input required maxLength={100} value={id} onChange={e => setId(e.target.value)}/></label><label>Equipment label<input required maxLength={100} value={label} onChange={e => setLabel(e.target.value)}/></label></div>
        <p className="note" hidden={addingPanels}>{template && `Ports ${template.portStart ?? 1}–${template.portCount - 1 + (template.portStart ?? 1)}. `}Port numbering comes from the equipment template’s port map.</p>
      </>}
      {addingPanels && <fieldset className="stack-setup"><legend>Patch panels</legend>
        <div className="form-row"><label>Quantity<input type="number" min={1} max={MAX_PANEL_BATCH} step={1} required value={Number.isNaN(panelQuantity) ? '' : panelQuantity} onChange={e => setPanelQuantity(e.target.valueAsNumber)}/></label>
        <label>Starting port number<span className={portPrefix?'equipment-prefixed-port-input':undefined}>{portPrefix&&<span aria-hidden="true">{portPrefix}</span>}<input aria-label="Starting port number" aria-description={portPrefix&&Number.isInteger(panelStart)?`Starting port: ${panelPortLabel(panelStart)}`:undefined} type="number" min={0} max={MAX_PORT_NUMBER} step={1} required value={Number.isNaN(panelStart) ? '' : panelStart} onChange={e => setPanelStart(e.target.valueAsNumber)}/></span></label></div>
        <p className="note">{Number.isInteger(panelQuantity) && Number.isInteger(panelStart) && `${panelQuantity} × ${template!.portCount} ports: ${panelPortLabel(panelStart)}–${panelPortLabel(panelStart + panelQuantity * template!.portCount - 1)}. `}Numbering continues across panels. Placement starts at the chosen unit and fills free space below it. Printed numbers in template images stay unchanged.</p>
      </fieldset>}
      {impact && <p><strong>{impact.equipment.label}</strong> · {impact.rack.label} · {equipmentUnits(impact.equipment)} · {impact.equipment.portCount} ports</p>}
      {action.kind === 'add' && template?.kind === 'switch' && <fieldset className="stack-setup"><legend>Stack / Virtual Chassis</legend>
        <label>Stack membership<select value={stackMode} onChange={e => { setStackMode(e.target.value); setPreview(null); setError(''); if (!['standalone', 'create'].includes(e.target.value)) { try { setMember(nextStackMember(layout, e.target.value)); } catch { setMember(0); } } else setMember(0); }}><option value="standalone">Standalone</option><option value="create">Create a stack</option>{layout.stacks?.map(s => <option key={s.id} value={s.id}>Join {s.name}</option>)}</select></label>
        {creatingStack && <><StackDetailsFields value={stack} onChange={setStack}/><div className="form-row"><label>Number of members<input type="number" min={1} max={MAX_STACK_CREATE} step={1} required value={Number.isNaN(count) ? '' : count} onChange={e => setCount(e.target.valueAsNumber)}/></label><label>Starting member number<input type="number" min={0} max={MAX_STACK_MEMBER} step={1} required value={Number.isNaN(member) ? '' : member} onChange={e => setMember(e.target.valueAsNumber)}/></label></div><p className="note">Includes the first switch. Preview fills available space below it, skipping occupied units. Adjust each member’s template, rack, position, name, and number before creating the stack.</p></>}
        {!['standalone', 'create'].includes(stackMode) && <label>Member number<input type="number" min={0} max={MAX_STACK_MEMBER} step={1} required value={Number.isNaN(member) ? '' : member} onChange={e => setMember(e.target.valueAsNumber)}/></label>}
      </fieldset>}
      {action.kind !== 'remove' && <>
        <div className="form-row"><label>Destination rack<select aria-label="Destination rack" value={rackId} onChange={e => chooseRack(e.target.value)}>{layout.racks.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label><label>Bottom rack unit<input type="number" min={1} max={rack?.heightU ?? 42} step={1} required value={Number.isNaN(bottomU) ? '' : bottomU} onChange={e => { setBottomU(e.target.valueAsNumber); setError(''); }}/></label></div>
        <p className="note">Occupies {equipmentUnits({ bottomU, heightU: height })} ({height}U). Rack numbers increase upward. Ports keep their existing numbers.</p>
        {conflict && <p role="status" className="form-error">{conflict}</p>}
        {rack && <RackPositionPreview rack={rack} bottomU={bottomU} heightU={height} excludeId={exclude} firstOnly={creatingStack || (addingPanels && panelQuantity > 1)} onSelect={unit => { setBottomU(unit); setError(''); }}/>}
        {rack && <details className="equipment-occupancy"><summary>Occupied rack units</summary>{rack.equipment.length ? <ul>{[...rack.equipment].sort((a, b) => b.bottomU - a.bottomU).map(e => <li key={e.id}>{equipmentUnits(e)} · {e.label}{e.id === exclude ? ' (moving)' : ''}</li>)}</ul> : <p>This rack is empty.</p>}</details>}
      </>}
      {creatingStack && members && <section ref={previewElement} className="stack-member-preview" aria-label="Stack placement preview"><div className="stack-preview-heading"><h3>Review {members.length} stack members</h3><button type="button" className="secondary-button" onClick={buildPreview}>Regenerate placement</button></div>
        <p className="note">All members are added together. A position of 0 means there was no space below the first switch; choose a free position or another rack. New members start without cables or port assignments.</p>
        <div className="stack-preview-scroll"><table><thead><tr><th>Member</th><th>Switch name</th><th>Template</th><th>Rack</th><th>Bottom U</th><th>First interface</th></tr></thead><tbody>{members.map((row, index) => {
          const t = findEquipmentTemplate(row.templateId, layout.templates)!;
          const name = interfaceName({ ...layout, stacks: [...(layout.stacks ?? []), stack] }, { ...row, kind: 'switch', heightU: t.heightU, portCount: t.portCount, portStart: t.portStart, stack: { stackId: stack.id, member: row.member } }, t.portStart ?? 1);
          const update = (patch: Partial<StackPlacement>) => { setPreview({ signature, rows: members.map((m, i) => i === index ? { ...m, ...patch } : m) }); setError(''); };
          return <tr key={row.id}><td><input aria-label={`Member number ${index + 1}`} type="number" min={0} max={MAX_STACK_MEMBER} step={1} required value={Number.isNaN(row.member) ? '' : row.member} onChange={e => update({ member: e.target.valueAsNumber })}/></td><td><input aria-label={`Switch name ${index + 1}`} required maxLength={100} value={row.label} onChange={e => update({ label: e.target.value })}/></td><td><select aria-label={`Member template ${index + 1}`} value={row.templateId} onChange={e => update({ templateId: e.target.value })}>{templates.filter(t => t.kind === 'switch').map(t => <option key={t.id} value={t.id}>{t.name} · {t.heightU}U</option>)}</select></td><td><select aria-label={`Member rack ${index + 1}`} value={row.rackId} onChange={e => update({ rackId: e.target.value })}>{layout.racks.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></td><td><input aria-label={`Member bottom unit ${index + 1}`} type="number" required min={1} max={layout.racks.find(r => r.id === row.rackId)?.heightU ?? 42} step={1} value={Number.isNaN(row.bottomU) ? '' : row.bottomU} onChange={e => update({ bottomU: e.target.valueAsNumber })}/><small>{t.heightU}U</small></td><td>{name || 'No mapped interface name'}</td></tr>;
        })}</tbody></table></div>
      </section>}
      {addingPanels && panels && <section ref={previewElement} aria-label="Patch panel placement preview">
        <div className="stack-preview-heading"><h3>Review {panels.length} patch panels</h3><button type="button" className="secondary-button" onClick={buildPanelPreview}>Regenerate placement</button></div>
        <p className="note">A position of 0 means there is no space. Choose a free unit or another rack. All panels are added together.</p>
        <div className="stack-preview-scroll"><table><thead><tr><th>Panel</th><th>Name</th><th>Rack</th><th>Bottom U</th><th>Ports</th></tr></thead><tbody>{panels.map((row, i) => {
          const update = (patch: Partial<EquipmentPlacement>) => setPanelPreview({ signature: panelSignature, rows: panels.map((p, j) => i === j ? { ...p, ...patch } : p) });
          return <tr key={row.id}><td>{i + 1}</td><td><input aria-label={`Panel name ${i + 1}`} required maxLength={100} value={row.label} onChange={e => update({ label: e.target.value })}/></td>
            <td><select aria-label={`Panel rack ${i + 1}`} value={row.rackId} onChange={e => update({ rackId: e.target.value })}>{layout.racks.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></td>
            <td><input aria-label={`Panel bottom unit ${i + 1}`} type="number" min={1} max={layout.racks.find(r => r.id === row.rackId)?.heightU} step={1} required value={Number.isNaN(row.bottomU) ? '' : row.bottomU} onChange={e => update({ bottomU: e.target.valueAsNumber })}/></td>
            <td>{panelPortLabel(row.portStart!)}–{panelPortLabel(row.portStart! + template!.portCount - 1)}</td></tr>;
        })}</tbody></table></div>
      </section>}
      {panelConflict && <p className="form-error" role="status">{panelConflict}</p>}
      {impact && <section aria-label="Equipment change impact">
        <h3>{action.kind === 'remove' ? 'Data to be deleted' : 'Data preserved by this move'}</h3>
        <dl className="cabinet-removal-impact"><div><dt>Cable connections</dt><dd>{impact.cables.length}</dd></div><div><dt>Port VLAN assignments</dt><dd>{impact.vlanAssignments}</dd></div><div><dt>Ports with location or notes</dt><dd>{impact.documentedPorts}</dd></div></dl>
        {!!impact.cables.length && <details open className="equipment-occupancy"><summary>Affected connections</summary><ul>{impact.cables.map(c => <li key={c.id}><strong>{c.id}</strong><br/>{endpointLabel(c.from, layout)} → {endpointLabel(c.to, layout)}</li>)}</ul></details>}
        <p className="note">{action.kind === 'remove' ? 'Connections involving this device are removed. VLANs and notes on the other endpoints are preserved. The rack remains available.' : 'Connections follow the device to its new position. Cable routes and estimated lengths are recalculated.'}</p>
      </section>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {stackConflict && <p className="form-error" role="status">{stackConflict}</p>}
      <div className="dialog-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className={action.kind === 'remove' ? 'danger-button' : 'primary-button'} disabled={action.kind !== 'remove' && !!(addingPanels ? panelConflict || (!panels && conflict) : creatingStack && members ? stackConflict : conflict || stackConflict)}>{addingPanels && panelQuantity > 1 ? panels ? 'Create patch panels' : 'Preview patch panels' : creatingStack ? members ? 'Create stack' : 'Preview stack' : action.kind === 'add' ? 'Place equipment' : action.kind === 'move' ? 'Save equipment position' : 'Delete equipment'}</button></div>
    </form>
  </dialog>;
}
