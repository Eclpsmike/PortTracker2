import { remoteStore } from '../serverStorage';
import { exportProjectBackup, MAX_PROJECT_BACKUP_BYTES, parseProjectBackup, type ImportedProjectBackup } from '../projectBackup';
import { useEffect, useRef, useState } from 'react';
import type { Project } from '../project';
import { Icon } from './Icon';
import { facilityPortLabel } from '../facility/portLabels';
import { FloorCanvas, type Tool, type View } from '../facility/FloorCanvas';
import { FloorIcon } from '../facility/FloorIcon';
import { SmbSetupDialog } from '../facility/SmbSetupDialog';
import { FloorGridSettings } from '../facility/FloorGridSettings';
import { FloorSearch } from '../facility/FloorSearch';
import { CommitField, FloorProperties } from '../facility/FloorProperties';
import { connectRouteEndpoint, nearestConnector, syncRouteConnections, createObject, distance, duplicateObjects, effectiveLocationId, emptyFilters, gridSpacingInPlanUnits, isSymbol, kindLabels, lengthLabel, objectKinds, objectVisible, parseFloorPlan, removeObjects, samplePlan, statuses, toolLineWeight, toolSymbolWidth, uid, unitsPerPoint, type Background, type FloorFilters, type FloorLayer, type FloorObject, type FloorPlan, type ObjectKind, type Point } from '../facility/model';
import { downloadFile, readFloorPlan, saveFloorPlan } from '../facility/storage';
import { readBackground } from '../facility/background';
import { PlanImageEditor } from '../facility/PlanImageEditor';
import '../facility/facility.css';

const tools: { key:Tool; label:string; shortcut?:string }[] = [
  {key:'select',label:'Select',shortcut:'V'}, {key:'pan',label:'Pan',shortcut:'H'},
  {key:'outlet',label:'SMB',shortcut:'O'}, {key:'plate',label:'Wall plate'}, {key:'idf',label:'IDF / Rack'},
  {key:'ap',label:'Access point'}, {key:'camera',label:'Camera'}, {key:'speaker',label:'Speaker'}, {key:'printer',label:'Printer'}, {key:'device',label:'Device'},
  {key:'location',label:'Location box',shortcut:'R'}, {key:'cable',label:'Cable path',shortcut:'C'}, {key:'tray',label:'Cable tray'}, {key:'conduit',label:'Conduit'},
  {key:'measure',label:'Measure',shortcut:'M'}, {key:'label',label:'Label',shortcut:'T'},
];
const preferredLayer: Partial<Record<Tool,string>> = {location:'rooms',outlet:'outlets',plate:'outlets',idf:'racks',ap:'ap',camera:'cameras',speaker:'devices',printer:'devices',device:'devices',cable:'paths',tray:'trays',conduit:'conduits',label:'labels'};
const errorMessage=(e:unknown)=>e instanceof Error?e.message:'The operation could not be completed.';
export function FacilityPage({project,onImport,onPlanChange}:{project:Project;onImport:(backup:ImportedProjectBackup)=>Promise<void>;onPlanChange?:(projectId:string,plan:FloorPlan)=>void}) {
  const [history,setHistory]=useState<{past:FloorPlan[];plan:FloorPlan;future:FloorPlan[]}>({past:[],plan:samplePlan(),future:[]});
  const {plan}=history;
  const [ready,setReady]=useState(false),[blocked,setBlocked]=useState(false),[saveStatus,setSaveStatus]=useState('Loading drawing…');
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const [tool,setToolState]=useState<Tool>('select'),[selected,setSelected]=useState<string[]>([]),[activeLayer,setActiveLayer]=useState('outlets');
  const [filters,setFilters]=useState<FloorFilters>(emptyFilters),[tab,setTab]=useState<'layers'|'filters'|'properties'>('layers');
  const [sidebar,setSidebar]=useState(false),[toolbox,setToolbox]=useState(false),[grid,setGrid]=useState(true),[snap,setSnap]=useState(true);
  const gridSize=gridSpacingInPlanUnits(plan);
  const [pendingSmb,setPendingSmb]=useState<FloorObject|null>(null);
  const [plateCount,setPlateCount]=useState(4),[draft,setDraft]=useState<Point[]>([]),[view,setView]=useState<View>({x:0,y:0,scale:1}),[fitToken,setFitToken]=useState(0);
  const [unit,setUnit]=useState<'ft'|'m'>(project.preferences.lengthUnit==='imperial'?'ft':'m');
  const [layerName,setLayerName]=useState(''),[expandedLayer,setExpandedLayer]=useState('');
  const [deleteLayer,setDeleteLayer]=useState(''),[reassignLayer,setReassignLayer]=useState('');
  const [calibrating,setCalibrating]=useState(false),[knownLength,setKnownLength]=useState('10');
  const [importing,setImporting]=useState(false),[pendingBackground,setPendingBackground]=useState<Background|null>(null),[pendingFile,setPendingFile]=useState<File|null>(null),[pdfPage,setPdfPage]=useState(1);
  const [imageEditing,setImageEditing]=useState(false);
  const [tableOpen,setTableOpen]=useState(false),[search,setSearch]=useState('');
  const [focusRequest,setFocusRequest]=useState<{id:string}|null>(null);
  const importInput=useRef<HTMLInputElement>(null),backgroundInput=useRef<HTMLInputElement>(null),serial=useRef(0),spaceTool=useRef<Tool|null>(null);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),4000);return()=>clearTimeout(timer);},[message]);
  useEffect(()=>{
    let live=true;
    readFloorPlan(project.id).then(saved=>{if(live&&saved)setHistory({past:[],plan:saved,future:[]});}).catch(e=>{if(live){setBlocked(true);setError(`Saved drawing could not be opened. ${errorMessage(e)} Export the current example or import a backup; existing storage has not been replaced.`);}}).finally(()=>{if(live)setReady(true);});
    return()=>{live=false;};
  },[project.id]);
  useEffect(()=>{
    if(!ready||blocked)return;
    const version=++serial.current;setSaveStatus('Saving…');
    void saveFloorPlan(project.id,plan).then(()=>{if(version===serial.current)setSaveStatus(remoteStore()?'Saved to server':'Saved in this browser');}).catch(e=>{if(version===serial.current){setSaveStatus('Not saved · export a backup');setError(errorMessage(e));}});
  },[plan,ready,blocked,project.id]);
  const visible=plan.layers.flatMap(l=>plan.objects.filter(o=>o.layerId===l.id&&objectVisible(plan,o,filters)));
  useEffect(()=>{if(ready&&!blocked)onPlanChange?.(project.id,plan);},[ready,blocked,project.id,plan,onPlanChange]);
  const editableSelected=selected.filter(id=>visible.some(o=>o.id===id&&!plan.layers.find(l=>l.id===o.layerId)?.locked));
  useEffect(()=>{setSelected(ids=>ids.filter(id=>plan.objects.some(o=>o.id===id&&objectVisible(plan,o,filters))));},[plan,filters]);
  useEffect(()=>{if(!plan.layers.some(l=>l.id===activeLayer))setActiveLayer(plan.layers[0].id);},[plan.layers,activeLayer]);
  function commit(next:FloorPlan) {
    if(remoteStore()?.user.role==='viewer'){setError('This account has read-only access.');return false;}
    try {next=parseFloorPlan(syncRouteConnections(next));setError('');setHistory(h=>({past:[...h.past,h.plan].slice(-60),plan:next,future:[]}));return true;}
    catch(e){setError(errorMessage(e));return false;}
  }
  function updateObjects(updates:FloorObject[]) {
    const allowed=updates.filter(o=>!plan.layers.find(l=>l.id===plan.objects.find(p=>p.id===o.id)?.layerId)?.locked);
    commit({...plan,objects:plan.objects.map(o=>allowed.find(n=>n.id===o.id)??o)});
  }
  function updateObject(id:string,patch:Partial<FloorObject>) {const o=plan.objects.find(o=>o.id===id);if(o)updateObjects([{...o,...patch}]);}
  function undo(){setHistory(h=>h.past.length?{past:h.past.slice(0,-1),plan:h.past.at(-1)!,future:[h.plan,...h.future]}:h);setDraft([]);setError('');}
  function redo(){setHistory(h=>h.future.length?{past:[...h.past,h.plan],plan:h.future[0],future:h.future.slice(1)}:h);setDraft([]);setError('');}
  function chooseTool(next:Tool){setToolState(next);setDraft([]);setCalibrating(false);setMessage('');const layer=plan.layers.find(l=>l.id===preferredLayer[next]&&l.visible&&!l.locked);if(layer)setActiveLayer(layer.id);}
  function select(ids:string[]){setSelected(ids);if(ids.length)setTab('properties');}
  function selectSearchResult(object:FloorObject){
    const layer=plan.layers.find(layer=>layer.id===object.layerId);
    if(layer&&!layer.visible&&!commit({...plan,layers:plan.layers.map(l=>l.id===layer.id?{...l,visible:true}:l)}))return;
    setFilters(emptyFilters);chooseTool('select');select([object.id]);setSidebar(true);setFocusRequest({id:object.id});
  }
  function usableLayer(){const l=plan.layers.find(l=>l.id===activeLayer);if(!l||l.locked||!l.visible){setError('Choose a visible, unlocked drawing layer.');return false;}return true;}
  function addObject(object:FloorObject){if(commit({...plan,objects:[...plan.objects,object]})){setFilters(emptyFilters);select([object.id]);setToolState('select');setDraft([]);setMessage(`${object.name} added.`);return true;}return false;}
  function place(a:Point,b?:Point){
    if(!objectKinds.includes(tool as ObjectKind)||!usableLayer())return;
    const o=createObject(plan,tool as ObjectKind,a,activeLayer,tool==='outlet'?1:plateCount);
    if(b)Object.assign(o,{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y)});
    if(o.kind==='outlet')setPendingSmb(o);else addObject(o);
  }
  function point(p:Point){
    if(tool==='measure'||tool==='calibrate'){
      if(draft.length!==1)setDraft([p]);else if(distance(draft[0],p)>.1){setDraft([draft[0],p]);if(tool==='calibrate')setCalibrating(true);}return;
    }
    if(!usableLayer())return;
    setDraft(points=>!points.length?[p]:distance(points.at(-1)!,p)<.1?points:[...points,p]);
  }
  function finishRoute(){if(!['cable','tray','conduit'].includes(tool)||draft.length<2||!usableLayer())return;let route:FloorObject={...createObject(plan,tool as ObjectKind,draft[0],activeLayer),points:draft};route=connectRouteEndpoint(route,'source',nearestConnector(plan,visible,draft[0],.001));route=connectRouteEndpoint(route,'destination',nearestConnector(plan,visible,draft.at(-1)!,.001));addObject(route);}
  function duplicate(){if(!editableSelected.length)return;const result=duplicateObjects(plan,editableSelected);if(commit(result.plan)){select(result.ids);setMessage('Copies have new IDs. Port mappings and route endpoints are left unassigned.');}}
  function remove(){if(editableSelected.length&&commit(removeObjects(plan,editableSelected)))setSelected([]);}
  function patchLayer(id:string,patch:Partial<FloorLayer>){commit({...plan,layers:plan.layers.map(l=>l.id===id?{...l,...patch}:l)});}
  function reorderLayer(id:string,direction:number){const layers=[...plan.layers],index=layers.findIndex(l=>l.id===id),to=index+direction;if(to<0||to>=layers.length)return;[layers[index],layers[to]]=[layers[to],layers[index]];commit({...plan,layers});}
  function addLayer(){if(!layerName.trim())return;const id=uid('layer');if(commit({...plan,layers:[...plan.layers,{id,name:layerName.trim(),visible:true,locked:false,color:'#3882b5'}]})){setActiveLayer(id);setExpandedLayer(id);setLayerName('');}}
  async function save(){if(blocked){setError('Import a valid backup before replacing unreadable saved data.');return;}try{await saveFloorPlan(project.id,plan);setSaveStatus(remoteStore()?'Saved to server':'Saved in this browser');setError('');}catch(e){setSaveStatus('Not saved · export a backup');setError(errorMessage(e));}}
  async function importProject(file?:File) {
    if(!file)return;
    try {
      if(file.size>MAX_PROJECT_BACKUP_BYTES)throw new Error('Choose a JSON backup up to 128 MB.');
      const value=JSON.parse(await file.text());
      const drawingOnly=value?.kind==='porttracker-facility'||(value?.schemaVersion===1&&value?.background);
      if(!drawingOnly){
        const backup=parseProjectBackup(value);
        const drawing=backup.facilityPlan?`and the facility drawing (${backup.facilityPlan.objects.length} objects)`:'with no saved facility drawing';
        if(!window.confirm(`Replace the current project with ${backup.project.siteName}: ${backup.project.locations.length} distribution frames ${drawing}? This replaces racks, maps, templates, and settings. Export a backup first if needed.`))return;
        await onImport(backup);return;
      }
      const next=parseFloorPlan(value);
      if(!window.confirm('Replace only the current floor plan with this older drawing file? Rack data is kept. Export a project backup first if needed.'))return;
      if(commit(next)){setBlocked(false);setSelected([]);setDraft([]);setFilters(emptyFilters);setFitToken(n=>n+1);setMessage('Floor plan imported. Export project now backs up the drawing and racks together.');}
    }catch(e){setError(errorMessage(e));}
  }
  async function uploadBackground(file?:File,page=1){if(!file)return;setImporting(true);setError('');try{const bg=await readBackground(file,page);setPendingBackground(bg);setPendingFile(file);setPdfPage(page);}catch(e){setError(errorMessage(e));}finally{setImporting(false);}}
  function applyBackground(keep:boolean){
    if(!pendingBackground)return;
    if(keep&&(pendingBackground.width!==plan.background.width||pendingBackground.height!==plan.background.height)){setError('Keeping overlays requires matching drawing dimensions. Start with an empty overlay or use a matching image.');return;}
    if(commit({...plan,background:pendingBackground,calibration:null,objects:keep?plan.objects:[]})){setPendingBackground(null);setPendingFile(null);setSelected([]);setDraft([]);setFitToken(n=>n+1);setMessage('Drawing loaded. Set its scale before measuring.');}
  }
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{
      if(pendingSmb)return;
      if((e.target as Element).closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))return;
      const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
      if(!mod&&(e.target as Element).closest('button'))return;
      if(mod&&key==='z'){e.preventDefault();e.shiftKey?redo():undo();}
      else if(mod&&key==='y'){e.preventDefault();redo();}
      else if(mod&&key==='d'){e.preventDefault();duplicate();}
      else if(mod&&key==='s'){e.preventDefault();void save();}
      else if(key==='delete'||key==='backspace'){e.preventDefault();remove();}
      else if(key==='escape'){setDraft([]);setSelected([]);setCalibrating(false);setToolState('select');}
      else if(key==='enter'){e.preventDefault();finishRoute();}
      else if(key===' '&&!e.repeat){e.preventDefault();spaceTool.current=tool;setToolState('pan');}
      else if(!mod){const t=tools.find(t=>t.shortcut?.toLowerCase()===key);if(t)chooseTool(t.key);}
    };
    const up=(e:KeyboardEvent)=>{if(e.key===' '&&spaceTool.current){setToolState(spaceTool.current);spaceTool.current=null;}};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);};
  });
  const zoom=(factor:number)=>setView(v=>({...v,scale:Math.max(.08,Math.min(8,v.scale*factor))}));
  const portRows=visible.flatMap(o=>(o.ports??[]).filter(p=>(!filters.status||p.mappingStatus===filters.status)&&(!filters.idf||p.idfId===filters.idf)&&(!filters.vlan||String(p.vlanId??'')===filters.vlan)).map(p=>({object:o,port:p,location:plan.objects.find(r=>r.id===effectiveLocationId(plan,o))?.name??'Unassigned'}))).filter(row=>`${facilityPortLabel(row.port,project)} ${row.port.label} ${row.object.name} ${row.location} ${row.port.mappingStatus}`.toLowerCase().includes(search.toLowerCase()));
  const totalPorts=plan.objects.reduce((n,o)=>n+(o.ports?.length??0),0),filterCount=Object.values(filters).filter(Boolean).length;
  const routeTool=['cable','tray','conduit'].includes(tool);
  const sizeTool=objectKinds.includes(tool as ObjectKind)&&isSymbol({kind:tool as ObjectKind});
  const drawingKind=tool as ObjectKind;
  const setToolSize=(settings:{symbolWidth?:number;lineWeight?:number})=>commit({...plan,toolDefaults:{...plan.toolDefaults,[drawingKind]:{...plan.toolDefaults?.[drawingKind],...settings}}});
  const scale=unitsPerPoint(plan),displayScale=scale===null?null:scale*(unit===plan.calibration!.unit?1:unit==='ft'?1/.3048:.3048);
  const targetLength=displayScale===null?null:100/view.scale*displayScale;
  const magnitude=targetLength===null?1:10**Math.floor(Math.log10(targetLength));
  const scaleBar=targetLength===null?null:([1,2,5,10].map(n=>n*magnitude).find(n=>n>=targetLength)??10*magnitude);
  const scalePixels=scaleBar===null?80:scaleBar/displayScale!*view.scale;
  const selectedObjects=plan.objects.filter(o=>selected.includes(o.id));
  if(!ready)return <main className="facility-loading" role="status">Opening Facility floor plan…</main>;
  return <main className="facility-page">
    <header className="floor-toolbar"><div className="floor-title"><span className="eyebrow">FACILITY</span><h1>{plan.building} <Icon name="chevron" size={15}/> {plan.floor}</h1></div>
      <div className="floor-toolbar-actions"><button onClick={()=>backgroundInput.current?.click()} disabled={importing}><FloorIcon name="upload"/>{importing?'Reading…':'Change plan'}</button><button disabled={importing} onClick={()=>{setDraft([]);setImageEditing(true);}}><Icon name="edit"/>Rotate / crop</button><div className="floor-zoom"><button aria-label="Zoom floor out" onClick={()=>zoom(1/1.2)}><Icon name="minus"/></button><span>{Math.round(view.scale*100)}%</span><button aria-label="Zoom floor in" onClick={()=>zoom(1.2)}><Icon name="plus"/></button></div><button onClick={()=>setFitToken(n=>n+1)}><Icon name="fit"/>Fit plan</button><button onClick={undo} disabled={!history.past.length} title="Undo (Ctrl+Z)" aria-label="Undo floor edit"><FloorIcon name="undo"/></button><button onClick={redo} disabled={!history.future.length} title="Redo (Ctrl+Shift+Z)" aria-label="Redo floor edit"><FloorIcon name="redo"/></button><button className="floor-primary" onClick={()=>void save()} disabled={blocked}><FloorIcon name="save"/>Save drawing</button><button onClick={async()=>{try{await exportProjectBackup(project,blocked?undefined:plan);setMessage('Project exported with rack and facility data.');}catch(e){setError(errorMessage(e));}}}><Icon name="download"/>Export project</button><button onClick={()=>importInput.current?.click()}>Import project</button></div>
    </header>
    <input ref={backgroundInput} className="sr-only" type="file" aria-label="Upload floor plan" accept=".pdf,.png,.jpg,.jpeg,.svg,.webp" onChange={e=>{void uploadBackground(e.target.files?.[0]);e.target.value='';}}/>
    <input ref={importInput} className="sr-only" type="file" aria-label="Import project or drawing JSON" accept=".json,application/json" onChange={e=>{void importProject(e.target.files?.[0]);e.target.value='';}}/>
    {error&&<div className="floor-alert" role="alert"><Icon name="info"/><span>{error}</span><button aria-label="Dismiss floor error" onClick={()=>setError('')}><Icon name="close"/></button></div>}
    <div className="floor-mobile-controls"><button aria-expanded={toolbox} onClick={()=>setToolbox(!toolbox)}><Icon name="edit"/>Drawing tools</button><button aria-expanded={sidebar} onClick={()=>setSidebar(!sidebar)}><Icon name="layers"/>Layers & properties{selected.length?` (${selected.length})`:''}</button></div>
    <div className={`floor-workspace${toolbox?' tools-open':''}${sidebar?' properties-open':''}`}>
      <aside className="floor-tools" aria-label="Floor drawing tools"><div className="floor-section-heading">Drawing tools<button className="floor-mobile-close" aria-label="Close drawing tools" onClick={()=>setToolbox(false)}><Icon name="close"/></button></div>
        <div className="floor-tool-list">{tools.map(t=><button key={t.key} className={tool===t.key?'active':''} aria-pressed={tool===t.key} aria-label={t.label} title={`${t.label}${t.shortcut?` (${t.shortcut})`:''}`} onClick={()=>{chooseTool(t.key);setToolbox(false);}}><FloorIcon name={t.key}/><span>{t.label}</span>{t.shortcut&&<kbd aria-hidden="true">{t.shortcut}</kbd>}</button>)}</div>
        <div className="floor-tool-settings" aria-label="Drawing tool size">
          {(sizeTool||routeTool)?<><strong>{kindLabels[drawingKind]} size</strong>
            {sizeTool&&<CommitField key={tool+'-symbol-'+unit} label={`Symbol width (${displayScale===null?'plan units':unit})`} type="number" min={0} max={20000*(displayScale??1)} step="any" value={Number((toolSymbolWidth(plan,drawingKind)*(displayScale??1)).toPrecision(8))} onCommit={value=>setToolSize({symbolWidth:Number(value)/(displayScale??1)})}/>}
            {routeTool&&<CommitField key={tool+'-weight'} label="Line weight (plan units)" type="number" min={0} max={200} step="any" value={toolLineWeight(plan,drawingKind)} onCommit={value=>setToolSize({lineWeight:Number(value)})}/>}
            <span className="floor-hint">Saved for new {kindLabels[drawingKind].toLowerCase()} items.{routeTool?' Endpoint dots scale with line weight.':''} Edit existing items in Properties.</span>
          </>:<span className="floor-hint">Choose a marker or path tool to set its saved size.</span>}
        </div>
        <div className="floor-tool-settings"><label><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/>Snap to grid</label><label><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/>Show grid</label><FloorGridSettings plan={plan} onChange={commit}/><button className={tool==='calibrate'?'active':''} onClick={()=>chooseTool('calibrate')}><FloorIcon name="calibrate"/>Calibrate scale</button><label>Length units<select aria-label="Floor length units" value={unit} onChange={e=>setUnit(e.target.value as 'ft'|'m')}><option value="ft">Feet</option><option value="m">Meters</option></select></label></div>
      </aside>
      <section className="floor-center" aria-label="Floor plan workspace"><div className="floor-context"><div><span className="floor-mode">{tool==='calibrate'?'CALIBRATE':tools.find(t=>t.key===tool)?.label.toUpperCase()}</span><span>{tool==='select'?'Click to inspect · Shift-click or drag to select multiple':tool==='pan'?'Drag or two-finger scroll to pan · Pinch to zoom':tool==='location'?'Drag a rectangle around the room or area':tool==='measure'||tool==='calibrate'?'Choose two points on the plan':routeTool?'Click to add segments · Snap to side connectors · Enter or Finish path to save':'Click the plan to place an item'}</span></div>
        {!['select','pan','measure','calibrate'].includes(tool)&&<label>Drawing layer<select aria-label="Drawing layer" value={activeLayer} onChange={e=>setActiveLayer(e.target.value)}>{plan.layers.map(l=><option key={l.id} value={l.id} disabled={!l.visible||l.locked}>{l.name}{l.locked?' · locked':''}{!l.visible?' · hidden':''}</option>)}</select></label>}
        {tool==='plate'&&<label>Ports<select aria-label="Wall plate port count" value={plateCount} onChange={e=>setPlateCount(Number(e.target.value))}>{[1,2,4,6].map(n=><option key={n}>{n}</option>)}</select></label>}
        {routeTool&&<button disabled={draft.length<2} onClick={finishRoute}>Finish path</button>}
      </div>
        <FloorCanvas portLabel={port=>facilityPortLabel(port,project)} plan={plan} objects={visible} selected={selected} tool={tool} view={view} setView={setView} onSelect={select} onChange={updateObjects} onPlace={place} draft={draft} onPoint={point} grid={grid} snap={snap} gridSize={gridSize} unit={unit} fitToken={fitToken} focusRequest={focusRequest}/>
        <div className="floor-statusbar"><div className="floor-scale"><span style={{width:scalePixels}}/><small>{scaleBar===null?'Scale not set':`${scaleBar.toFixed(1)} ${unit}`}</small></div><span>{visible.length} / {plan.objects.length} objects · {totalPorts} ports{filterCount?` · ${filterCount} filters`:''}</span><span role="status">{message?`${message} · ${saveStatus}`:saveStatus}</span></div>
        <section className={`floor-port-table${tableOpen?' open':''}`}><button className="floor-table-toggle" aria-expanded={tableOpen} onClick={()=>setTableOpen(!tableOpen)}><Icon name="ports"/><strong>Network ports</strong><span>{portRows.length} visible</span><Icon name="chevron" size={14}/></button>{tableOpen&&<><label className="floor-table-search"><Icon name="search"/><input type="search" aria-label="Search floor ports" placeholder="Search labels, rooms or status…" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="floor-table-scroll"><table><thead><tr><th>Port label</th><th>Room / location</th><th>Media</th><th>Status</th><th>IDF</th><th>Patch panel</th><th>Switch / VLAN</th></tr></thead><tbody>{portRows.map(({port:p,object:o,location})=><tr key={p.id}><td><button onClick={()=>{select([o.id]);setSidebar(true);}}>{facilityPortLabel(p,project)}</button></td><td>{location}</td><td>{p.medium}</td><td><span className={`floor-status-dot status-${p.mappingStatus.replace(' ','-')}`}/>{p.mappingStatus}</td><td>{project.locations.find(l=>l.id===p.idfId)?.name??p.idfId??'Unknown'}</td><td>{p.patchPanelId??'Unknown'}{p.patchPanelPort!==undefined?` / ${p.patchPanelPort}`:''}</td><td>{p.switchId??'Unknown'}{p.switchPort!==undefined?` / ${p.switchPort}`:''}{p.vlanId!==undefined?` · VLAN ${p.vlanId}`:''}</td></tr>)}</tbody></table>{!portRows.length&&<p className="floor-hint">No ports match the current filters.</p>}</div></>}</section>
      </section>
      <aside className="floor-sidebar" aria-label="Floor plan controls"><FloorSearch plan={plan} project={project} filters={filters} onSelect={selectSearchResult}/><div className="floor-sidebar-tabs" role="tablist" aria-label="Floor plan panels">{(['layers','filters','properties'] as const).map(t=><button key={t} role="tab" aria-selected={tab===t} onClick={()=>setTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}{t==='filters'&&filterCount?` (${filterCount})`:''}</button>)}<button className="floor-mobile-close" aria-label="Close floor panels" onClick={()=>setSidebar(false)}><Icon name="close"/></button></div>
        <div role="tabpanel" aria-label={`Floor ${tab}`} className="floor-sidebar-content">
          {tab==='layers'&&<><div className="floor-section-heading">Drawing layers<span>{plan.layers.length}</span></div><p className="floor-hint floor-pad">Hide or lock objects without removing them. Lower layers draw on top.</p><div className="floor-layer-list">{plan.layers.map((l,index)=><div className={`floor-layer${activeLayer===l.id?' current':''}`} key={l.id}>
            <div className="floor-layer-row"><label><input aria-label={`Show layer ${l.name}`} type="checkbox" checked={l.visible} onChange={e=>patchLayer(l.id,{visible:e.target.checked})}/><i style={{background:l.color}}/><span>{l.name}</span></label><button aria-label={`${l.locked?'Unlock':'Lock'} layer ${l.name}`} title={l.locked?'Unlock layer':'Lock layer'} onClick={()=>patchLayer(l.id,{locked:!l.locked})}><FloorIcon name={l.locked?'lock':'unlock'} size={14}/></button><button aria-label={`Edit layer ${l.name}`} onClick={()=>setExpandedLayer(expandedLayer===l.id?'':l.id)}><Icon name="chevron" size={13}/></button></div>
            {expandedLayer===l.id&&<div className="floor-layer-editor"><CommitField label="Layer name" value={l.name} onCommit={name=>patchLayer(l.id,{name:name.trim()})}/><label className="floor-color-field">Layer color<input aria-label={`Color for ${l.name}`} type="color" value={l.color} onChange={e=>patchLayer(l.id,{color:e.target.value})}/></label><div className="floor-actions"><button onClick={()=>setActiveLayer(l.id)} disabled={l.locked||!l.visible}>Draw here</button><button aria-label={`Move ${l.name} up`} disabled={index===0} onClick={()=>reorderLayer(l.id,-1)}>↑</button><button aria-label={`Move ${l.name} down`} disabled={index===plan.layers.length-1} onClick={()=>reorderLayer(l.id,1)}>↓</button><button disabled={plan.layers.length===1||l.locked} onClick={()=>{setDeleteLayer(l.id);setReassignLayer(plan.layers.find(p=>p.id!==l.id&&!p.locked)?.id??'');}}>Remove</button></div></div>}
          </div>)}</div><div className="floor-add-layer"><label>New layer<input aria-label="New layer name" placeholder="Future Expansion" value={layerName} onChange={e=>setLayerName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addLayer();}} maxLength={200}/></label><button onClick={addLayer} disabled={!layerName.trim()}><Icon name="plus" size={15}/>Add layer</button></div><div className="floor-plan-settings"><h3>Drawing details</h3><CommitField label="Building name" value={plan.building} onCommit={building=>commit({...plan,building:building.trim()})}/><CommitField label="Floor name" value={plan.floor} onCommit={floor=>commit({...plan,floor:floor.trim()})}/><p>{plan.background.width} × {plan.background.height} plan units</p><p className="floor-hint">Export project includes this drawing, the original plan file, rack data, templates, and settings. Import project also accepts older drawing-only files.</p>{plan.background.original&&<button onClick={()=>{const original=plan.background.original!;const parts=original.data.split(',');const bytes=Uint8Array.from(atob(parts[1]),c=>c.charCodeAt(0));downloadFile(original.name,new Blob([bytes],{type:parts[0].slice(5).split(';')[0]}));}}>Download original plan</button>}</div></>}
          {tab==='filters'&&<div className="floor-property-body"><span className="eyebrow">VISIBLE OBJECTS</span><h3>Filter the floor plan</h3><p className="floor-hint">Filters work independently of layers. Hidden objects stay in your drawing and export.</p>
            {(['location','type','status','idf','vlan'] as const).map(key=><label key={key}>{({location:'Room / location',type:'Device type',status:'Mapping status',idf:'IDF',vlan:'VLAN'})[key]}<select aria-label={`Filter ${key}`} value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}><option value="">All</option>{key==='location'?plan.objects.filter(o=>o.kind==='location').map(o=><option key={o.id} value={o.id}>{o.name}</option>):key==='type'?objectKinds.map(k=><option key={k} value={k}>{kindLabels[k]}</option>):key==='status'?statuses.map(s=><option key={s}>{s}</option>):key==='idf'?project.locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>):project.configuration.vlans.map(v=><option key={v.id} value={v.id}>{v.id} — {v.name}</option>)}</select></label>)}
            <button onClick={()=>setFilters(emptyFilters)} disabled={!filterCount}><Icon name="reset"/>Clear floor filters</button>
          </div>}
          {tab==='properties'&&<FloorProperties plan={plan} project={project} selected={selectedObjects} onArrange={updateObjects} onUpdate={updateObject} onBatch={patch=>updateObjects(plan.objects.filter(o=>editableSelected.includes(o.id)).map(o=>({...o,...patch})))} onDuplicate={duplicate} onDelete={remove} unit={unit}/>}
        </div>
        <div className="floor-sidebar-footer"><span className="floor-status-dot status-unmapped"/>Unmapped <span className="floor-status-dot status-partially-mapped"/>Partial <span className="floor-status-dot status-verified"/>Verified</div>
      </aside>
    </div>
    {pendingSmb&&<SmbSetupDialog key={pendingSmb.id} plan={plan} project={project} object={pendingSmb} onCancel={()=>setPendingSmb(null)} onPlace={object=>{if(addObject(object))setPendingSmb(null);}}/>}
    {tool==='measure'&&draft.length===2&&<div className="floor-measure-toast" role="status"><FloorIcon name="measure"/>{lengthLabel(plan,draft,unit)}<button onClick={()=>setDraft([])}>Clear</button>{!plan.calibration&&<button onClick={()=>{setToolState('calibrate');setCalibrating(true);}}>Set scale</button>}</div>}
    {calibrating&&draft.length===2&&<div className="floor-modal-backdrop"><form role="dialog" aria-modal="true" aria-label="Calibrate drawing scale" className="floor-dialog" onSubmit={e=>{e.preventDefault();if(commit({...plan,calibration:{a:draft[0],b:draft[1],distance:Number(knownLength),unit}})){setCalibrating(false);setDraft([]);setToolState('select');setMessage('Drawing scale calibrated.');}}}><h2>Calibrate drawing scale</h2><p>Enter the real-world distance between the two selected points.</p><label>Known distance<input autoFocus type="number" min="0.001" step="any" required value={knownLength} onChange={e=>setKnownLength(e.target.value)}/></label><label>Calibration units<select value={unit} onChange={e=>setUnit(e.target.value as 'ft'|'m')}><option value="ft">Feet</option><option value="m">Meters</option></select></label><div className="floor-actions"><button type="button" onClick={()=>{setCalibrating(false);setDraft([]);}}>Cancel</button><button className="floor-primary">Apply scale</button></div></form></div>}
    {deleteLayer&&<div className="floor-modal-backdrop"><form role="dialog" aria-modal="true" aria-label="Remove drawing layer" className="floor-dialog" onSubmit={e=>{e.preventDefault();const count=plan.objects.filter(o=>o.layerId===deleteLayer).length;if(count&&!reassignLayer)return;if(commit({...plan,layers:plan.layers.filter(l=>l.id!==deleteLayer),objects:plan.objects.map(o=>o.layerId===deleteLayer?{...o,layerId:reassignLayer}:o)}))setDeleteLayer('');}}><h2>Remove layer</h2><p>{plan.objects.filter(o=>o.layerId===deleteLayer).length} objects belong to this layer. Objects will be reassigned, not deleted.</p>{plan.objects.some(o=>o.layerId===deleteLayer)&&<label>Move objects to<select required value={reassignLayer} onChange={e=>setReassignLayer(e.target.value)}><option value="">Choose an unlocked layer</option>{plan.layers.filter(l=>l.id!==deleteLayer&&!l.locked).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}<div className="floor-actions"><button type="button" onClick={()=>setDeleteLayer('')}>Cancel</button><button className="floor-primary">Confirm removal</button></div></form></div>}
    {imageEditing&&<PlanImageEditor plan={plan} onClose={()=>setImageEditing(false)} onApply={next=>{if(commit(next)){setImageEditing(false);setSelected([]);setDraft([]);setFitToken(n=>n+1);setMessage('Floor plan image updated.');}}}/>}
    {pendingBackground&&<div className="floor-modal-backdrop"><div role="dialog" aria-modal="true" aria-label="Replace floor plan background" className="floor-dialog"><h2>Use this floor plan?</h2><p>{pendingBackground.name}</p><img className="floor-upload-preview" src={pendingBackground.src} alt="New floor plan preview"/>{pendingBackground.original?.pages&&pendingBackground.original.pages>1&&<div className="floor-form-row"><label>PDF page<input type="number" min={1} max={pendingBackground.original.pages} value={pdfPage} onChange={e=>setPdfPage(e.target.valueAsNumber)}/></label><button disabled={importing||!Number.isInteger(pdfPage)} onClick={()=>void uploadBackground(pendingFile!,pdfPage)}>Preview page</button></div>}<p className="floor-hint">Changing the source resets scale calibration. Keep overlays only if the new plan has the same dimensions and alignment.</p><div className="floor-actions"><button onClick={()=>{setPendingBackground(null);setPendingFile(null);}}>Cancel</button><button disabled={importing||pendingBackground.width!==plan.background.width||pendingBackground.height!==plan.background.height} onClick={()=>applyBackground(true)}>Keep overlays</button><button className="floor-primary" disabled={importing} onClick={()=>applyBackground(false)}>Use plan · clear overlays</button></div></div></div>}
  </main>;
}
