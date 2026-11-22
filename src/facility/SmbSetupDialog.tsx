import { useEffect, useId, useRef, useState } from 'react';
import type { Project } from '../project';
import { resizeSmbPorts, type FloorObject, type FloorPlan } from './model';
import { smbPortNumbers, type SmbPortEntryMode } from './smbSetup';
import { formatPrefixedPortNumber } from './portLabels';

interface Props {
  plan: FloorPlan; project: Project; object: FloorObject;
  onPlace: (object: FloorObject) => void; onCancel: () => void;
}
export function SmbSetupDialog({plan, project, object, onPlace, onCancel}: Props) {
  const dialog = useRef<HTMLDialogElement>(null), headingId = useId();
  const [frameId, setFrameId] = useState(''), [mode, setMode] = useState<SmbPortEntryMode>('range');
  const [start, setStart] = useState(''), [end, setEnd] = useState('');
  const [entries, setEntries] = useState<string[]>(Array(8).fill('')), [error, setError] = useState('');
  const frames = project.locations.filter(frame => !frame.archived);
  const frame = frames.find(frame => frame.id === frameId);
  let numbers: number[] = [];
  try { numbers = smbPortNumbers(mode, start, end, entries); } catch { /* Show validation after submission. */ }
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} role="dialog" aria-labelledby={headingId} className="floor-dialog floor-smb-setup" onCancel={event=>{event.preventDefault();onCancel();}}>
    <form noValidate onChange={()=>setError('')} onSubmit={event=>{
      event.preventDefault();
      try {
        if (!frame?.portPrefix) throw new Error('Select an IDF / MDF with a port prefix, or choose Configure later.');
        const portNumbers = smbPortNumbers(mode, start, end, entries);
        const ports = resizeSmbPorts(plan, object, portNumbers.length).map((port, i)=>({...port, idfId: frame.id, patchPanelPort: portNumbers[i]}));
        onPlace({...object, ports});
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'The ports could not be configured.'); }
    }}>
      <div><h2 id={headingId}>Set up SMB</h2><p>{object.name}</p></div>
      <label>IDF / MDF prefix<select autoFocus aria-label="IDF / MDF prefix" value={frameId} onChange={event=>setFrameId(event.target.value)}>
        <option value="">Select a prefix</option>
        {frames.map(frame=><option key={frame.id} value={frame.id} disabled={!frame.portPrefix}>{frame.portPrefix?`${frame.portPrefix} — ${frame.name} (${frame.type})`:`${frame.name} — no port prefix`}</option>)}
      </select></label>
      {!frames.some(frame=>frame.portPrefix)&&<p className="floor-warning">Add a port prefix to an IDF or MDF in Distribution Frames to configure ports here. You can place this SMB now with Configure later.</p>}
      <fieldset className="floor-smb-entry-mode"><legend>Port numbers</legend>
        <label><input type="radio" name="smb-entry-mode" value="range" checked={mode==='range'} onChange={()=>setMode('range')}/>Port range</label>
        <label><input type="radio" name="smb-entry-mode" value="individual" checked={mode==='individual'} onChange={()=>setMode('individual')}/>Individual ports</label>
      </fieldset>
      {mode==='range'?<div className="floor-form-row">
        <label>First port<input aria-label="First port" type="number" min={1} max={999999} step={1} placeholder="225" value={start} onChange={event=>setStart(event.target.value)}/></label>
        <label>Last port<input aria-label="Last port" type="number" min={1} max={999999} step={1} placeholder="232" value={end} onChange={event=>setEnd(event.target.value)}/></label>
      </div>:<div className="floor-smb-port-entry-grid">{entries.map((value, i)=><label key={i}>Port {i+1}<input aria-label={`Port ${i+1} number`} type="number" min={1} max={999999} step={1} value={value} onChange={event=>setEntries(values=>values.map((old,index)=>index===i?event.target.value:old))}/></label>)}</div>}
      <p>{mode==='range'?'The range includes both numbers, with a maximum of 8 ports.':'Enter up to 8 port numbers. Leave unused fields blank.'}</p>
      {frame?.portPrefix&&numbers.length>0&&<p className="floor-smb-port-preview" role="status">{numbers.length} {numbers.length===1?'port':'ports'}: <strong>{numbers.map(number=>formatPrefixedPortNumber(frame.portPrefix!,number)).join(', ')}</strong></p>}
      {error&&<p role="alert" className="floor-warning">{error}</p>}
      <div className="floor-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" onClick={()=>onPlace(object)}>Configure later</button><button type="submit" className="floor-primary">Place SMB</button></div>
    </form>
  </dialog>;
}
