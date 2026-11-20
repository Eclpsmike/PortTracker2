import { useEffect, useState } from 'react';
import type { Project } from '../project';
import { FloorIcon } from './FloorIcon';
import { isRoute, isSymbol, itemLabelLayout, labelPositions, kindLabels, lengthLabel, statuses, symbolWidthInPlanUnits, unitsPerPoint, type FloorObject, type FloorPlan, type FloorPort, type LabelPosition } from './model';

export function CommitField({ label, value, onCommit, type = 'text', min, max, step, multiline = false }: {
  label: string; value: string | number; onCommit: (value: string) => void; type?: string; min?: number; max?: number; step?: number | 'any'; multiline?: boolean;
}) {
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  const commit=()=>{if(draft!==String(value))onCommit(draft);};
  return <label>{label}{multiline?<textarea aria-label={label} value={draft} maxLength={10000} onChange={e=>setDraft(e.target.value)} onBlur={commit}/>:<input aria-label={label} type={type} value={draft} min={min} max={max} step={step} maxLength={200} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/>}</label>;
}
interface Props { plan: FloorPlan; project: Project; selected: FloorObject[]; onUpdate: (id: string, patch: Partial<FloorObject>) => void; onBatch: (patch: Partial<FloorObject>) => void; onDuplicate: () => void; onDelete: () => void; unit: 'ft' | 'm' }
export function FloorProperties({plan, project, selected, onUpdate, onBatch, onDuplicate, onDelete, unit}:Props) {
  const [portId,setPortId]=useState('');
  if(!selected.length)return <div className="floor-empty"><FloorIcon name="select" size={30}/><h3>Select an item</h3><p>Choose a room, outlet, device or route on the plan to inspect and edit it.</p><p>Shift-click or drag a selection box to select more than one item.</p></div>;
  const editable=selected.filter(o=>!plan.layers.find(l=>l.id===o.layerId)?.locked);
  if(selected.length>1)return <section className="floor-property-body"><span className="eyebrow">MULTIPLE ITEMS</span><h3>{selected.length} objects selected</h3><p>{editable.length} editable · {selected.length-editable.length} locked</p><label>Move selected to layer<select value="" onChange={e=>onBatch({layerId:e.target.value})} disabled={!editable.length}><option value="" disabled>Choose layer</option>{plan.layers.filter(l=>!l.locked).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Selected location<select value="" onChange={e=>onBatch({locationId:e.target.value||undefined})} disabled={!editable.length}><option value="">Unassigned</option>{plan.objects.filter(o=>o.kind==='location'&&!selected.some(s=>s.id===o.id)).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><div className="floor-actions"><button onClick={onDuplicate} disabled={!editable.length}><FloorIcon name="duplicate"/>Duplicate</button><button onClick={onDelete} disabled={!editable.length}>Delete</button></div><ul className="floor-selection-list">{selected.map(o=><li key={o.id}><FloorIcon name={o.kind}/>{o.name}</li>)}</ul></section>;
  const o=selected[0], locked=!editable.length, port=o.ports?.find(p=>p.id===portId)??o.ports?.[0];
  const update=(patch:Partial<FloorObject>)=>onUpdate(o.id,patch);
  const updatePort=(patch:Partial<FloorPort>)=>update({ports:o.ports!.map(p=>p.id===port!.id?{...p,...patch}:p)});
  const scale=unitsPerPoint(plan),displayScale=scale===null?1:scale*(unit===plan.calibration!.unit?1:unit==='ft'?1/.3048:.3048);
  return <section className="floor-property-body">
    <div className="floor-property-heading"><span className="floor-object-icon"><FloorIcon name={o.kind} size={23}/></span><div><span className="eyebrow">{kindLabels[o.kind]}</span><h3>{o.name}</h3></div></div>
    {locked&&<p className="floor-warning"><FloorIcon name="lock"/>This layer is locked. Unlock it in Layers to edit.</p>}
    <fieldset disabled={locked} className="floor-fields">
      <CommitField label="Object name" value={o.name} onCommit={name=>update({name:name.trim()})}/>
      {isSymbol(o)&&<>
        <CommitField key={o.id+'symbol-width'} label={`Item symbol width (${scale===null?'plan units':unit})`} type="number" min={0} max={20000*displayScale} step="any" value={Number((symbolWidthInPlanUnits(plan,o)*displayScale).toPrecision(8))} onCommit={value=>update({symbolWidth:Number(value)/displayScale})}/>
        <p className="floor-hint">Sets this item's marker width. Drag a corner handle to resize its icon and label together; its location stays fixed.{scale===null?' Calibrate scale to enter feet or meters.':''}</p>
        {o.symbolWidth!==undefined&&<button type="button" onClick={()=>update({symbolWidth:undefined})}>Use default symbol width</button>}
      </>}
      {!isRoute(o)&&<div className="floor-label-settings">
        <h4>Item label</h4>
        <CommitField key={o.id+'label-font'} label="Label font size" type="number" min={4} max={96} step="any" value={itemLabelLayout(o).fontSize} onCommit={value=>update({labelStyle:{...o.labelStyle,fontSize:Number(value)}})}/>
        {o.kind!=='label'&&<label>Label position<select aria-label="Label position" value={o.labelStyle?.position??(o.kind==='location'?'top-left':'below')} onChange={e=>update({labelStyle:{...o.labelStyle,position:e.target.value as LabelPosition}})}>{labelPositions(o).map(position=><option key={position} value={position}>{position.split('-').map(word=>word[0].toUpperCase()+word.slice(1)).join(' ')}</option>)}</select></label>}
        <div className="floor-form-row"><CommitField key={o.id+'label-x'} label="Label X offset" type="number" min={-20000} max={20000} step="any" value={o.labelStyle?.offsetX??0} onCommit={value=>update({labelStyle:{...o.labelStyle,offsetX:Number(value)}})}/><CommitField key={o.id+'label-y'} label="Label Y offset" type="number" min={-20000} max={20000} step="any" value={o.labelStyle?.offsetY??0} onCommit={value=>update({labelStyle:{...o.labelStyle,offsetY:Number(value)}})}/></div>
        <p className="floor-hint">Positive X moves right; positive Y moves down. Labels zoom with the drawing; device labels also scale with their symbols. The item's location stays fixed.</p>
        {o.labelStyle&&<button type="button" onClick={()=>update({labelStyle:undefined})}>Reset label style</button>}
      </div>}
      <label>Layer<select value={o.layerId} onChange={e=>update({layerId:e.target.value})}>{plan.layers.map(l=><option key={l.id} value={l.id} disabled={l.locked}>{l.name}{l.locked?' · locked':''}</option>)}</select></label>
      <label>{o.kind==='location'?'Parent location':'Room / location'}<select value={o.locationId??''} onChange={e=>update({locationId:e.target.value||undefined})}><option value="">Unassigned</option>{plan.objects.filter(r=>r.kind==='location'&&r.id!==o.id).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      {o.kind==='location'&&<CommitField label="Location type" value={o.locationType??'office'} onCommit={locationType=>update({locationType})}/>}
      {!isRoute(o)&&<div className="floor-form-row"><CommitField label="X position" value={Math.round(o.x*100)/100} type="number" min={0} max={plan.background.width} onCommit={v=>update({x:Number(v)})}/><CommitField label="Y position" value={Math.round(o.y*100)/100} type="number" min={0} max={plan.background.height} onCommit={v=>update({y:Number(v)})}/></div>}
      {o.kind==='location'?<div className="floor-form-row"><CommitField label={`Width (${scale===null?'plan units':unit})`} value={Number((o.width!*displayScale).toPrecision(8))} type="number" min={5*displayScale} step="any" onCommit={v=>update({width:Number(v)/displayScale})}/><CommitField label={`Height (${scale===null?'plan units':unit})`} value={Number((o.height!*displayScale).toPrecision(8))} type="number" min={5*displayScale} step="any" onCommit={v=>update({height:Number(v)/displayScale})}/></div>:!isRoute(o)&&<CommitField label="Rotation (degrees)" value={o.rotation} type="number" step={15} onCommit={v=>update({rotation:Number(v)})}/>}
      <label className="floor-color-field">Object color<input aria-label="Object color" type="color" value={o.color??plan.layers.find(l=>l.id===o.layerId)!.color} onChange={e=>update({color:e.target.value})}/></label>
      {o.kind==='idf'&&<label>Distribution frame reference<select value={o.idfId??''} onChange={e=>update({idfId:e.target.value||undefined})}><option value="">Unknown / not linked</option>{project.locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      <CommitField label="Object notes" value={o.notes} multiline onCommit={notes=>update({notes})}/>
      {isRoute(o)&&<>
        <div className="floor-measure-result"><span>DRAWN ROUTE LENGTH</span><strong>{lengthLabel(plan,o.points!,unit)}</strong></div>
        <p className="floor-hint">Length follows the drawn path. It does not include rack runs, service slack or installation allowances.</p>
        <label>Route status<select value={o.status} onChange={e=>update({status:e.target.value as 'planned'|'verified'})}><option value="planned">Planned</option><option value="verified">Verified</option></select></label>
        {(['sourceId','destinationId'] as const).map((key,i)=><label key={key}>{i?'Destination (optional)':'Source (optional)'}<select value={o[key]??''} onChange={e=>update({[key]:e.target.value||undefined})}><option value="">Unknown / unconnected</option>{plan.objects.filter(r=>!isRoute(r)&&r.kind!=='location'&&r.kind!=='label').map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>)}
        <p className="floor-hint">Drag the handles on the plan to move route vertices. Connections and verification remain explicit.</p>
      </>}
      {port&&<div className="floor-port-properties"><h4>{o.ports!.length} {o.ports!.length===1?'port':'ports'}</h4><div className="floor-port-tabs">{o.ports!.map((p,i)=><button type="button" key={p.id} aria-label={`Edit plate port ${i+1}`} aria-pressed={p.id===port.id} onClick={()=>setPortId(p.id)}>{i+1}</button>)}</div>
        <CommitField key={port.id+'label'} label="Port label" value={port.label} onCommit={label=>updatePort({label:label.trim()})}/>
        <label>Mapping status<select value={port.mappingStatus} onChange={e=>updatePort({mappingStatus:e.target.value as FloorPort['mappingStatus']})}>{statuses.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}</select></label>
        <label>Media type<select value={port.medium} onChange={e=>updatePort({medium:e.target.value as FloorPort['medium']})}><option value="copper">Copper</option><option value="fiber">Fiber</option></select></label>
        <details className="floor-termination"><summary>Termination & VLAN <span>Optional</span></summary><p className="floor-hint">Unknown values can stay empty. Drawing a route does not verify a port.</p>
          <label>IDF / distribution frame<select value={port.idfId??''} onChange={e=>updatePort({idfId:e.target.value||undefined})}><option value="">Unknown</option>{project.locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}{port.idfId&&!project.locations.some(l=>l.id===port.idfId)&&<option value={port.idfId}>{port.idfId} · saved reference</option>}</select></label>
          <CommitField key={port.id+'rack'} label="Rack reference" value={port.rackId??''} onCommit={v=>updatePort({rackId:v.trim()||undefined})}/>
          <CommitField key={port.id+'panel'} label="Patch panel reference" value={port.patchPanelId??''} onCommit={v=>updatePort({patchPanelId:v.trim()||undefined})}/>
          <CommitField key={port.id+'panelport'} label="Patch panel port" type="number" min={0} value={port.patchPanelPort??''} onCommit={v=>updatePort({patchPanelPort:v===''?undefined:Number(v)})}/>
          <CommitField key={port.id+'switch'} label="Switch reference" value={port.switchId??''} onCommit={v=>updatePort({switchId:v.trim()||undefined})}/>
          <CommitField key={port.id+'switchport'} label="Switch port" type="number" min={0} value={port.switchPort??''} onCommit={v=>updatePort({switchPort:v===''?undefined:Number(v)})}/>
          <label>VLAN<select value={port.vlanId??''} onChange={e=>updatePort({vlanId:e.target.value===''?undefined:Number(e.target.value)})}><option value="">Unknown</option>{project.configuration.vlans.map(v=><option key={v.id} value={v.id}>{v.id} — {v.name}</option>)}{port.vlanId!==undefined&&!project.configuration.vlans.some(v=>v.id===port.vlanId)&&<option value={port.vlanId}>{port.vlanId} · saved VLAN</option>}</select></label>
        </details>
        <CommitField key={port.id+'notes'} label="Port notes" value={port.notes} multiline onCommit={notes=>updatePort({notes})}/>
        <p className="floor-record-id">Port ID: {port.id}</p>
      </div>}
    </fieldset>
    <div className="floor-actions"><button disabled={locked} onClick={onDuplicate}><FloorIcon name="duplicate"/>Duplicate</button><button disabled={locked} onClick={onDelete}>Delete object</button></div>
    <p className="floor-record-id">Object ID: {o.id}</p>
  </section>;
}
