import { useEffect, useState } from 'react';
import { facilityPortLabel, prefixedFacilityPortLabel } from './portLabels';
import type { Project } from '../project';
import { rackPortIndex, resolveFloorPort } from './portLocations';
import { FloorIcon } from './FloorIcon';
import { FloorArrange } from './FloorArrange';
import { Icon } from '../components/Icon';
import { UnplacedLocationPorts } from './UnplacedLocationPorts';
import { LocationPorts } from './LocationPorts';
import { FloorPortConnectionCells } from './FloorPortConnectionCells';
import { FloorPortLocation } from './FloorPortLocation';
import { FloorPortTermination } from './FloorPortTermination';
import { effectiveLocationId, isRoute, isSymbol, itemLabelLayout, labelPositions, kindLabels, lengthLabel, resizeSmbPorts, routeLineWeight, smbPortCounts, statuses, symbolWidthInPlanUnits, toolSymbolWidth, unitsPerPoint, type FloorObject, type FloorPlan, type FloorPort, type LabelPosition } from './model';

export function CommitField({ label, value, onCommit, type = 'text', min, max, step, multiline = false, tooltip }: {
  label: string; value: string | number; onCommit: (value: string) => void; type?: string; min?: number; max?: number; step?: number | 'any'; multiline?: boolean; tooltip?: string;
}) {
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  const commit=()=>{if(draft!==String(value))onCommit(draft);};
  return <label title={tooltip}>{label}{multiline?<textarea aria-label={label} aria-description={tooltip} value={draft} maxLength={10000} onChange={e=>setDraft(e.target.value)} onBlur={commit}/>:<input aria-label={label} aria-description={tooltip} type={type} value={draft} min={min} max={max} step={step} maxLength={200} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/>}</label>;
}
interface Props { plan: FloorPlan; project: Project; selected: FloorObject[]; onUpdate: (id: string, patch: Partial<FloorObject>) => void; onBatch: (patch: Partial<FloorObject>) => void; onArrange: (objects: FloorObject[]) => void; onDuplicate: () => void; onDelete: () => void; unit: 'ft' | 'm' }
export function FloorProperties({plan, project, selected, onUpdate, onBatch, onArrange, onDuplicate, onDelete, unit}:Props) {
  const [portId,setPortId]=useState('');
  if(!selected.length)return <div className="floor-empty"><FloorIcon name="select" size={30}/><h3>Select an item</h3><p>Choose a room, SMB, device or route on the plan to inspect and edit it.</p><p>Shift-click or drag a selection box to select more than one item.</p></div>;
  const editable=selected.filter(o=>!plan.layers.find(l=>l.id===o.layerId)?.locked);
  if(selected.length>1)return <section className="floor-property-body"><span className="eyebrow">MULTIPLE ITEMS</span><h3>{selected.length} objects selected</h3><p>{editable.length} editable · {selected.length-editable.length} locked</p><FloorArrange key={selected.map(o=>o.id).sort().join("/")} plan={plan} selected={selected} onArrange={onArrange}/><label>Move selected to layer<select value="" onChange={e=>onBatch({layerId:e.target.value})} disabled={!editable.length}><option value="" disabled>Choose layer</option>{plan.layers.filter(l=>!l.locked).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Selected location<select value="" onChange={e=>onBatch({locationMode:e.target.value==='__auto'?'auto':'manual',locationId:e.target.value==='__auto'?undefined:e.target.value||undefined})} disabled={!editable.length}><option value="">Unassigned</option>{selected.every(o=>o.kind!=='location')&&<option value="__auto">Automatic — enclosing location box</option>}{plan.objects.filter(o=>o.kind==='location'&&!selected.some(s=>s.id===o.id)).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><div className="floor-actions"><button onClick={onDuplicate} disabled={!editable.length}><FloorIcon name="duplicate"/>Duplicate</button><button onClick={onDelete} disabled={!editable.length}>Delete</button></div><ul className="floor-selection-list">{selected.map(o=><li key={o.id}><FloorIcon name={o.kind}/>{o.name}</li>)}</ul></section>;
  const o=selected[0], locked=!editable.length, port=o.ports?.find(p=>p.id===portId)??o.ports?.[0];
  const prefixedLabel=port?prefixedFacilityPortLabel(port,project):null;
  const rackPorts=o.kind==='outlet'?rackPortIndex(project):[];
  const update=(patch:Partial<FloorObject>)=>onUpdate(o.id,patch);
  const updatePort=(patch:Partial<FloorPort>)=>update({ports:o.ports!.map(p=>p.id===port!.id?{...p,...patch}:p)});
  function addSmbPort() {
    if(locked||o.ports!.length>=8)return;
    const ports=resizeSmbPorts(plan,o,o.ports!.length+1);
    update({ports});setPortId(ports.at(-1)!.id);
  }
  function removeSmbPort(target:FloorPort) {
    if(locked||o.ports!.length<=1)return;
    const index=o.ports!.findIndex(p=>p.id===target.id);
    if(index<0||!window.confirm(`Remove port ${index+1} (${facilityPortLabel(target,project)}) from ${o.name}? Its SMB label, notes and mapping will be removed. The rack port and its cable connection will stay. You can undo this change.`))return;
    const ports=o.ports!.filter(p=>p.id!==target.id);
    update({ports});
    if(port?.id===target.id)setPortId(ports[Math.min(index,ports.length-1)].id);
  }
  const scale=unitsPerPoint(plan),displayScale=scale===null?1:scale*(unit===plan.calibration!.unit?1:unit==='ft'?1/.3048:.3048);
  const identityFields=<>
      {o.kind==='idf'?<label>Distribution frame<select aria-label="Distribution frame" value={o.idfId??''} onChange={e=>{
        const frame=project.locations.find(l=>l.id===e.target.value);
        update(frame?{idfId:frame.id,name:frame.name}:{idfId:undefined});
      }}>
        <option value="">Select IDF / MDF</option>
        {project.locations.filter(l=>!l.archived||l.id===o.idfId).map(l=><option key={l.id} value={l.id} disabled={l.archived}>{l.name} ({l.type}) · {project.buildings.find(b=>b.id===l.buildingId)?.name}{l.archived?' · archived':''}</option>)}
        {o.idfId&&!project.locations.some(l=>l.id===o.idfId)&&<option value={o.idfId} disabled>{o.name} · saved frame unavailable</option>}
      </select></label>:<CommitField label="Object name" value={o.name} onCommit={name=>update({name:name.trim()})}/>}
  </>;
  const colorField=<label className="floor-color-field">Object color<input aria-label="Object color" type="color" value={o.color??plan.layers.find(l=>l.id===o.layerId)!.color} onChange={e=>update({color:e.target.value})}/></label>;
  const symbolAppearance=<>
      {isSymbol(o)&&<>
        <CommitField key={o.id+'symbol-width'} label={`Item symbol width (${scale===null?'plan units':unit})`} tooltip={`Sets this item's marker width. Drag a corner handle to resize its icon and label together; its location stays fixed.${scale===null?' Calibrate scale to enter feet or meters.':''}`} type="number" min={0} max={20000*displayScale} step="any" value={Number((symbolWidthInPlanUnits(plan,o)*displayScale).toPrecision(8))} onCommit={value=>update({symbolWidth:Number(value)/displayScale})}/>
        {o.symbolWidth!==undefined&&<button type="button" onClick={()=>update({symbolWidth:toolSymbolWidth(plan,o.kind)})}>Use default symbol width</button>}
      </>}
      {o.kind==='location'&&<div className="floor-form-row"><CommitField label={`Width (${scale===null?'plan units':unit})`} value={Number((o.width!*displayScale).toPrecision(8))} type="number" min={5*displayScale} step="any" onCommit={v=>update({width:Number(v)/displayScale})}/><CommitField label={`Height (${scale===null?'plan units':unit})`} value={Number((o.height!*displayScale).toPrecision(8))} type="number" min={5*displayScale} step="any" onCommit={v=>update({height:Number(v)/displayScale})}/></div>}
      {isRoute(o)&&<CommitField key={o.id+'line-weight'} label="Item line weight (plan units)" type="number" min={0} max={200} step="any" value={routeLineWeight(o)} onCommit={value=>update({lineWeight:Number(value)})}/>}
      {colorField}
  </>;
  const labelAppearance=<>
      {!isRoute(o)&&<div className="floor-label-settings">
        <CommitField key={o.id+'label-font'} label="Label font size" tooltip="Labels zoom with the drawing; device labels also scale with their symbols." type="number" min={4} max={96} step="any" value={itemLabelLayout(o).fontSize} onCommit={value=>update({labelStyle:{...o.labelStyle,fontSize:Number(value)}})}/>
        {o.kind!=='label'&&<label>Label position<select aria-label="Label position" value={o.labelStyle?.position??(o.kind==='location'?'top-left':'below')} onChange={e=>update({labelStyle:{...o.labelStyle,position:e.target.value as LabelPosition}})}>{labelPositions(o).map(position=><option key={position} value={position}>{position.split('-').map(word=>word[0].toUpperCase()+word.slice(1)).join(' ')}</option>)}</select></label>}
        <div className="floor-form-row"><CommitField key={o.id+'label-x'} label="Label X offset" tooltip="Positive X moves the label right. The item stays in place." type="number" min={-20000} max={20000} step="any" value={o.labelStyle?.offsetX??0} onCommit={value=>update({labelStyle:{...o.labelStyle,offsetX:Number(value)}})}/><CommitField key={o.id+'label-y'} label="Label Y offset" tooltip="Positive Y moves the label down. The item stays in place." type="number" min={-20000} max={20000} step="any" value={o.labelStyle?.offsetY??0} onCommit={value=>update({labelStyle:{...o.labelStyle,offsetY:Number(value)}})}/></div>
        {o.labelStyle&&<button type="button" onClick={()=>update({labelStyle:undefined})}>Reset label style</button>}
      </div>}
  </>;
  const layerField=<>
      <label>Layer<select value={o.layerId} onChange={e=>update({layerId:e.target.value})}>{plan.layers.map(l=><option key={l.id} value={l.id} disabled={l.locked}>{l.name}{l.locked?' · locked':''}</option>)}</select></label>
  </>;
  const locationFields=<>
      <label>{o.kind==='location'?'Parent location':'Room / location'}<select title={o.kind==='location'?undefined:'Follow location box uses the smallest enclosing box and follows item or box movement. Choose a room or Unassigned to override it.'} value={effectiveLocationId(plan,o)??''} onChange={e=>update(o.kind==='location'?{locationId:e.target.value||undefined}:{locationMode:e.target.value==='__auto'?'auto':'manual',locationId:e.target.value==='__auto'?undefined:e.target.value||undefined})}>
        {o.kind!=='location'&&<option value="__auto" title="Inherits the enclosing location box.">Follow location box</option>}
        <option value="">Unassigned</option>{plan.objects.filter(r=>r.kind==='location'&&r.id!==o.id).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      {o.kind==='location'&&<CommitField label="Location type" value={o.locationType??'office'} onCommit={locationType=>update({locationType})}/>}
  </>;
  const positionAppearance=<>
      {!isRoute(o)&&<div className="floor-form-row"><CommitField label="X position" value={Math.round(o.x*100)/100} type="number" min={0} max={plan.background.width} onCommit={v=>update({x:Number(v)})}/><CommitField label="Y position" value={Math.round(o.y*100)/100} type="number" min={0} max={plan.background.height} onCommit={v=>update({y:Number(v)})}/></div>}
      {!isRoute(o)&&o.kind!=='location'&&<CommitField label="Rotation (degrees)" value={o.rotation} type="number" step={15} onCommit={v=>update({rotation:Number(v)})}/>}

  </>;
  const notesField=<>
      <CommitField label="Object notes" value={o.notes} multiline onCommit={notes=>update({notes})}/>
  </>;
  return <section className="floor-property-body">
    <div className="floor-property-heading"><span className="floor-object-icon"><FloorIcon name={o.kind} size={23}/></span><div><span className="eyebrow">{kindLabels[o.kind]}</span><h3>{o.name}</h3></div></div>
    {locked&&<p className="floor-warning"><FloorIcon name="lock"/>This layer is locked. Unlock it in Layers to edit.</p>}
    <fieldset disabled={locked} className="floor-fields">
      <section className="floor-equipment-properties" aria-label={isSymbol(o)?'Equipment properties':'Item properties'}>
        <h4>{isSymbol(o)?'Equipment properties':'Item properties'}</h4>
        {identityFields}{locationFields}{notesField}
      </section>
      {o.kind==='location'&&<><UnplacedLocationPorts project={project} plan={plan} name={o.name}/><LocationPorts project={project} plan={plan} location={o}/></>}
      {isRoute(o)&&<>
        <div className="floor-measure-result"><span>DRAWN ROUTE LENGTH</span><strong>{lengthLabel(plan,o.points!,unit)}</strong></div>
        <p className="floor-hint">Length follows the drawn path. It does not include rack runs, service slack or installation allowances.</p>
        <label>Route status<select value={o.status} onChange={e=>update({status:e.target.value as 'planned'|'verified'})}><option value="planned">Planned</option><option value="verified">Verified</option></select></label>
        {(['sourceId','destinationId'] as const).map((key,i)=><label key={key}>{i?'Destination (optional)':'Source (optional)'}<select value={o[key]??''} onChange={e=>update({[key]:e.target.value||undefined,[key==='sourceId'?'sourceSide':'destinationSide']:undefined})}><option value="">Unknown / unconnected</option>{plan.objects.filter(r=>!isRoute(r)&&r.kind!=='location'&&r.kind!=='label').map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>)}
        <p className="floor-hint">Drag an endpoint to a side connector to link equipment, or away to disconnect. Connected endpoints follow the equipment. Verification remains explicit.</p>
      </>}
      {port&&<section className="floor-port-properties" aria-label="Ports">
        <h4>{o.kind==='outlet'?'Ports':`${o.ports!.length} ${o.ports!.length===1?'port':'ports'}`}</h4>
        {o.kind==='outlet'?<table className="floor-smb-port-table" aria-label="SMB ports">
          <thead><tr><th scope="col">Port</th><th scope="col">Label</th><th scope="col">VLAN</th><th scope="col">Patch status</th></tr></thead>
          <tbody>{smbPortCounts.map(number=>{
            const slot=o.ports![number-1],active=slot?.id===port.id;
            const linked=slot?resolveFloorPort(slot,rackPorts):null;
            return <tr key={number} className={`${active?'selected ':''}${slot?'populated':'empty'}`} onClick={slot&&!locked?()=>setPortId(slot.id):undefined}>
              <th scope="row">{number}</th>
              <td>{slot?<button type="button" aria-label={`Edit SMB port ${number}`} aria-pressed={active} title={facilityPortLabel(slot,project)}>{facilityPortLabel(slot,project)}</button>
                :<button type="button" aria-label={`Add SMB port ${number}`} disabled={locked||number!==o.ports!.length+1} onClick={addSmbPort}>{number===o.ports!.length+1?'+ Add port':'Unused'}</button>}</td>
              <FloorPortConnectionCells linked={linked} vlans={project.configuration.vlans} empty={!slot} actions={slot&&<button type="button" className="floor-remove-port" aria-label={`Remove port ${number}`} title={o.ports!.length<=1?'An SMB must have at least one port':`Remove ${facilityPortLabel(slot,project)} from this SMB`} disabled={locked||o.ports!.length<=1} onClick={event=>{event.stopPropagation();removeSmbPort(slot);}}><Icon name="close" size={14}/></button>}/>
            </tr>;
          })}</tbody>
        </table>:<div className="floor-port-tabs">{o.ports!.map((p,i)=><button type="button" key={p.id} aria-label={`Edit plate port ${i+1}`} aria-pressed={p.id===port.id} onClick={()=>setPortId(p.id)}>{i+1}</button>)}</div>}
        {o.kind==='outlet'&&<h4 className="floor-port-editor-heading">Port {o.ports!.findIndex(p=>p.id===port.id)+1} settings</h4>}
        <FloorPortLocation project={project} plan={plan} object={o} port={port}/>
        {prefixedLabel===null?<CommitField key={port.id+'label'} label="Port label" value={port.label} onCommit={label=>updatePort({label:label.trim()})}/>:<label title="Uses the distribution frame’s port prefix and this port’s patch-panel number.">Port label<input aria-label="Port label" value={prefixedLabel} readOnly/></label>}
        <label>Mapping status<select value={port.mappingStatus} onChange={e=>updatePort({mappingStatus:e.target.value as FloorPort['mappingStatus']})}>{statuses.map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}</select></label>
        <label>Media type<select value={port.medium} onChange={e=>updatePort({medium:e.target.value as FloorPort['medium']})}><option value="copper">Copper</option><option value="fiber">Fiber</option></select></label>
        {o.kind==='outlet'?<FloorPortTermination project={project} port={port} index={rackPorts} onChange={updatePort}/>:<details className="floor-termination"><summary>Termination & VLAN <span>Optional</span></summary><p className="floor-hint">Unknown values can stay empty. Drawing a route does not verify a port.</p>
          <label>IDF / distribution frame<select value={port.idfId??''} onChange={e=>updatePort({idfId:e.target.value||undefined})}><option value="">Unknown</option>{project.locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}{port.idfId&&!project.locations.some(l=>l.id===port.idfId)&&<option value={port.idfId}>{port.idfId} · saved reference</option>}</select></label>
          <CommitField key={port.id+'rack'} label="Rack reference" value={port.rackId??''} onCommit={v=>updatePort({rackId:v.trim()||undefined})}/>
          <CommitField key={port.id+'panel'} label="Patch panel reference" value={port.patchPanelId??''} onCommit={v=>updatePort({patchPanelId:v.trim()||undefined})}/>
          <CommitField key={port.id+'panelport'} label="Patch panel port" type="number" min={0} value={port.patchPanelPort??''} onCommit={v=>updatePort({patchPanelPort:v===''?undefined:Number(v)})}/>
          <CommitField key={port.id+'switch'} label="Switch reference" value={port.switchId??''} onCommit={v=>updatePort({switchId:v.trim()||undefined})}/>
          <CommitField key={port.id+'switchport'} label="Switch port" type="number" min={0} value={port.switchPort??''} onCommit={v=>updatePort({switchPort:v===''?undefined:Number(v)})}/>
          <label>VLAN<select value={port.vlanId??''} onChange={e=>updatePort({vlanId:e.target.value===''?undefined:Number(e.target.value)})}><option value="">Unknown</option>{project.configuration.vlans.map(v=><option key={v.id} value={v.id}>{v.id} — {v.name}</option>)}{port.vlanId!==undefined&&!project.configuration.vlans.some(v=>v.id===port.vlanId)&&<option value={port.vlanId}>{port.vlanId} · saved VLAN</option>}</select></label>
        </details>}
        <CommitField key={port.id+'notes'} label="Port notes" value={port.notes} multiline onCommit={notes=>updatePort({notes})}/>
        <p className="floor-record-id">Port ID: {port.id}</p>
      </section>}
      {[
        {key:'symbol',title:'Symbol',fields:symbolAppearance,visible:true},
        {key:'label',title:'Label',fields:labelAppearance,visible:!isRoute(o)},
        {key:'placement',title:'Placement',fields:positionAppearance,visible:!isRoute(o)},
        {key:'layer',title:'Layer properties',fields:layerField,visible:true},
      ].filter(group=>group.visible).map(group=><details key={o.id+group.key} className={`floor-property-accordion floor-${group.key}-properties`}>
        <summary>{group.title}</summary>
        <div className="floor-accordion-fields">{group.fields}</div>
      </details>)}
    </fieldset>
    <div className="floor-actions"><button disabled={locked} onClick={onDuplicate}><FloorIcon name="duplicate"/>Duplicate</button><button disabled={locked} onClick={onDelete}>Delete object</button></div>
    <p className="floor-record-id">Object ID: {o.id}</p>
  </section>;
}
