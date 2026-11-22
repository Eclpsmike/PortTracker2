import { createTemplatePackage, exportableTemplate, importTemplatePackage, readTemplatePackage, templatePackageFilename } from '../templatePackage';
import { downloadFile } from '../facility/storage';
import { AddTemplatePort, type ManualPortInput } from './AddTemplatePort';
import { usePortDragSelection } from './usePortDragSelection';
import { ConfigurationNav } from './ConfigurationNav';
import { validPortRange, MAX_PORT_NUMBER } from '../portNumbering';
import { type PortMedia, inferPortMedia } from '../media';
import { PortMediaFields } from './MediaFields';
import { useRef, useState } from 'react';
import { templatePortLabel, CONSOLE_CONNECTORS, type ConsoleConnector, type EquipmentSide, type EquipmentImage, type EquipmentTemplate, type TemplatePort, EQUIPMENT_TEMPLATES } from '../equipmentTemplates';
import { type Project, saveEquipmentTemplate, removeEquipmentTemplate, templateUsage } from '../project';
import { parseDeviceDefinition, readTemplateImage, gridPorts, validTemplatePort, type DeviceDefinition } from '../templateImport';

function TemplateEditor({ initial, project, onSave, onCancel }: { initial?: EquipmentTemplate; project: Project; onSave: (project: Project) => void; onCancel: () => void }) {
  const [definition, setDefinition] = useState<DeviceDefinition | null>(initial ? { manufacturer: initial.source!.manufacturer, model: initial.source!.model, heightU: initial.heightU, kind: initial.kind, ports: initial.ports.map(p => ({ name: p.name!, type: p.interfaceType ?? 'mapped',function:p.function === 'console'?'console':undefined,consoleConnector:p.consoleConnector,sourceSection:p.sourceSection })) } : null);
  const [sourceYaml, setSourceYaml] = useState(initial?.source?.yaml ?? '');
  const [sourceNotice, setSourceNotice] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);
  const [filename, setFilename] = useState(initial?.source?.filename ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [image, setImage] = useState<Pick<EquipmentTemplate, 'imageSrc' | 'imageWidth' | 'imageHeight'> | null>(initial ?? null);
  const [rearImage,setRearImage]=useState<EquipmentImage|null>(initial?.rearImage??null);
  const [rearLoading,setRearLoading]=useState(false);
  const rearRevision=useRef(0);
  const rearInput=useRef<HTMLInputElement>(null);
  const [included, setIncluded] = useState<string[]>(initial?.ports.map(p => p.name!) ?? []);
  const [ports, setPorts] = useState<(TemplatePort | null)[]>(initial ? [...initial.ports] : []);
  const [mappingFace, setMappingFace] = useState<EquipmentSide>(initial?.ports[0]?.face ?? 'front');
  const [faces, setFaces] = useState<EquipmentSide[]>(initial?.ports.map(p => p.face ?? 'front') ?? []);
  const mappingImage = mappingFace === 'rear' ? rearImage : image;
  const [names, setNames] = useState<string[]>(initial?.ports.map(p => p.name!) ?? []);
  const [addingPort, setAddingPort] = useState(false);
  const [portMetadata, setPortMetadata] = useState<Record<string, Pick<TemplatePort, 'manual' | 'function' | 'consoleConnector' | 'sourceSection'>>>(() => Object.fromEntries(initial?.ports.map(p => [p.name!, {manual:p.manual,function:p.function,consoleConnector:p.consoleConnector,sourceSection:p.sourceSection}]) ?? []));
  const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(initial?.ports.map(p => [p.name!, p.label ?? '']) ?? []));
  const [media, setMedia] = useState<Record<string, PortMedia>>(() => Object.fromEntries(initial?.ports.map(p => [p.name!, p.media ?? { kind: 'copper' }]) ?? []));
  const [mapping, setMapping] = useState(!!initial);
  const [selected, setSelected] = useState(0);
  const [gridSelection, setGridSelection] = useState<number[]>(initial ? initial.ports.flatMap((p, i) => (p.face ?? 'front') === (initial.ports[0]?.face ?? 'front') ? [i] : []) : []);
  const [gridOpen, setGridOpen] = useState(false);
  const [dragSelect, setDragSelect] = useState(false);
  const [selectionPreview, setSelectionPreview] = useState<Map<number, TemplatePort>>(new Map());
  const [addToSelection, setAddToSelection] = useState(false);
  const gridDetails = useRef<HTMLDetailsElement>(null);
  const [previewing, setPreviewing] = useState(true);
  const [rangeFirst, setRangeFirst] = useState(initial?.portStart ?? 1);
  const [rangeLast, setRangeLast] = useState((initial?.portStart ?? 1) + (initial?.portCount ?? 1) - 1);
  const [portStart, setPortStart] = useState(initial?.portStart ?? 1);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRevision = useRef(0);
  const [advance, setAdvance] = useState(true);
  const [width, setWidth] = useState(2.5), [height, setHeight] = useState(25);
  const [columns, setColumns] = useState(24), [order, setOrder] = useState<'rows' | 'columns'>('rows');
  const [left, setLeft] = useState(5), [right, setRight] = useState(95), [top, setTop] = useState(35), [bottom, setBottom] = useState(65);
  const socket = ports[selected];
  const validRange = validPortRange(portStart, names.length);
  const displayStart = validRange ? portStart : initial?.portStart ?? 1;
  const portLabel = (i: number) => templatePortLabel({ name: names[i], label: labels[names[i]] }, definition?.kind ?? 'switch', displayStart + i);
  const duplicateLabels = definition?.kind === 'switch' && new Set(names.map((_, i) => portLabel(i).toLowerCase())).size !== names.length;
  const mapped = ports.filter(p => p && validTemplatePort(p)).length;
  const gridIndices = names.map((_, i) => i).filter(i => gridSelection.includes(i));
  let gridPreview: TemplatePort[] = [], gridError = '';
  if (gridIndices.length) {
    try { gridPreview = gridPorts(gridIndices.map(i => names[i]), columns, order, left / 100, right / 100, top / 100, bottom / 100, width / 100, height / 100).map(p => ({ ...p, face: mappingFace })); }
    catch (e) { gridError = (e as Error).message; }
  }
  const visiblePreview = gridOpen && previewing ? new Map(gridIndices.map((index, i) => [index, gridPreview[i]]).filter((entry): entry is [number, TemplatePort] => !!entry[1])) : dragSelect ? selectionPreview : new Map<number, TemplatePort>();
  const facePorts = ports.map((p, i) => faces[i] === mappingFace ? p : null);
  const selectablePorts = facePorts.map((p, i) => visiblePreview.get(i) ?? p);
  const validSelectionRange = Number.isInteger(rangeFirst) && Number.isInteger(rangeLast) && rangeFirst >= displayStart && rangeLast < displayStart + names.length && rangeFirst <= rangeLast;
  function selectGridPorts(indices: number[]) {
    setGridSelection(indices); setColumns(current => Math.max(1, Math.min(current, indices.length || 1))); setPreviewing(true);
  }
  const { marquee, cancel: cancelDrag, imageEvents, listEvents } = usePortDragSelection({
    enabled: dragSelect, additive: addToSelection,
    ports: selectablePorts,
    selection: gridSelection,
    onImageSelect: indices => { setDragSelect(true); setSelectionPreview(visiblePreview); selectGridPorts(indices); if (gridDetails.current) gridDetails.current.open = true; setPreviewing(false); },
    onListSelect: indices => { setSelectionPreview(new Map()); selectGridPorts(indices); },
  });
  function changeMappingMode(drag: boolean) { cancelDrag(); setSelectionPreview(drag ? visiblePreview : new Map()); setDragSelect(drag); setPreviewing(false); }
  function showFace(face: EquipmentSide) {
    cancelDrag(); setMappingFace(face); setSelectionPreview(new Map()); setPreviewing(false);
    const indices = names.flatMap((_, i) => (faces[i] ?? 'front') === face ? [i] : []);
    setGridSelection(indices);
  }
  function choosePort(index: number) { setSelected(index); if ((faces[index] ?? 'front') !== mappingFace) showFace(faces[index] ?? 'front'); }
  function assignFace(face: EquipmentSide) {
    if (face !== faces[selected]) {
      setPorts(current => current.map((p, i) => i === selected ? null : p));
      setFaces(current => current.map((f, i) => i === selected ? face : f)); setReviewed(false);
    }
    showFace(face); selectGridPorts([selected]);
  }
  function continueMapping() {
    // Append newly included interfaces so existing numbered slots and source swaps stay intact.
    const chosen = [...names.filter(n => included.includes(n)), ...definition!.ports.filter(p => included.includes(p.name) && !names.includes(p.name)).map(p => p.name)];
    const previous = new Map(names.map((n, i) => [n, ports[i]]));
    const nextPorts = chosen.map(n => previous.get(n) ?? null);
    const nextFaces = chosen.map(n => faces[names.indexOf(n)] ?? 'front'), face = nextFaces[0] ?? 'front';
    const unmapped = nextPorts.flatMap((p, i) => !p && nextFaces[i] === face ? [i] : []);
    setFaces(nextFaces); setMappingFace(face);
    setNames(chosen); setPorts(nextPorts); setSelected(0);
    const group = unmapped.length ? unmapped : chosen.flatMap((_, i) => nextFaces[i] === face ? [i] : []);
    setGridSelection(group); setColumns(Math.min(24, group.length)); setTop(group.length > 24 ? 35 : 50);
    setRangeFirst(portStart); setRangeLast(portStart + chosen.length - 1);
    setMapping(true); setSelectionPreview(new Map()); setGridOpen(false); setReviewed(false); setError(''); setPreviewing(true);
  }

  function addPort(input: ManualPortInput) {
    if (!input.name || input.name.length > 80) throw new Error('Enter a port label up to 80 characters.');
    if (!validPortRange(portStart, names.length + 1)) throw new Error('This template has reached the supported port limit.');
    const label = templatePortLabel({name:input.name}, 'switch', names.length + portStart).toLowerCase();
    if (definition!.ports.some(p => p.name.toLowerCase() === input.name.toLowerCase()) || names.some((_, i) => portLabel(i).toLowerCase() === label)) throw new Error('A port with that name or label already exists.');
    if (input.face === 'rear' && !rearImage) throw new Error('Add a rear image first.');
    setDefinition(current => ({...current!,ports:[...current!.ports,{name:input.name,type:input.function === 'console' ? 'serial-console' : 'manual'}]}));
    setLabels(current => ({...current,[input.name]:''}));
    setNames(current => [...current,input.name]); setIncluded(current => [...current,input.name]);
    setPorts(current => [...current,null]); setFaces(current => [...current,input.face]);
    setPortMetadata(current => ({...current,[input.name]:{manual:true,function:input.function,consoleConnector:input.consoleConnector}}));
    if(input.media) setMedia(current => ({...current,[input.name]:input.media!}));
    setSelected(names.length); setMappingFace(input.face); setGridSelection([names.length]);
    setRangeLast(portStart + names.length); setAddingPort(false); setReviewed(false); setError('');
    cancelDrag(); setDragSelect(false); setSelectionPreview(new Map()); setPreviewing(false);
    if(gridDetails.current) gridDetails.current.open=false;
  }
  function removeAddedPort() {
    const name = names[selected];
    if (selected < (initial?.portCount ?? 0) || !portMetadata[name]?.manual) return;
    setDefinition(current => ({...current!,ports:current!.ports.filter(p=>p.name!==name)}));
    setNames(current=>current.filter((_,i)=>i!==selected)); setPorts(current=>current.filter((_,i)=>i!==selected)); setFaces(current=>current.filter((_,i)=>i!==selected)); setIncluded(current=>current.filter(n=>n!==name));
    const next = Math.max(0,selected-1); setSelected(next); setMappingFace(faces[next] ?? 'front');
    setGridSelection([]); setSelectionPreview(new Map()); setPreviewing(false); setReviewed(false); setError(''); setRangeFirst(portStart); setRangeLast(portStart+names.length-2);
  }
  function updatePort(index: number, patch: Partial<TemplatePort>) {
    setReviewed(false); setError(''); setPreviewing(false);
    setFaces(current => current.map((f, i) => i === index ? mappingFace : f));
    setPorts(current => current.map((p, i) => i === index ? { name: names[i], x: .5, y: .5, width: width / 100, height: height / 100, ...p, ...patch, face: mappingFace } : p));
  }
  async function uploadDefinition(file?: File) {
    if (!file) return;
    const revision = ++fileRevision.current;
    setError(''); setLoading(true); setDefinition(null); setIncluded([]); setFilename(''); setSourceYaml(''); setName(''); setNames([]); setPorts([]); setLabels({}); setPortMetadata({}); setAddingPort(false); setFaces([]); setMappingFace('front'); setGridSelection([]);
    try {
      if (file.size > 512 * 1024) throw new Error('Choose a YAML definition smaller than 512 KB.');
      const yaml = await file.text();
      const parsed = parseDeviceDefinition(yaml);
      if (revision !== fileRevision.current) return;
      setSourceYaml(yaml);
      setPortMetadata(Object.fromEntries(parsed.ports.map(p=>[p.name,{function:p.function,consoleConnector:p.consoleConnector,sourceSection:p.sourceSection}])));
      setMedia(Object.fromEntries(parsed.ports.map(p => [p.name, inferPortMedia(p.type)])));
      setDefinition(parsed); setFilename(file.name); setName(`${parsed.manufacturer} ${parsed.model}`.slice(0, 100));
      const copper = parsed.ports.filter(p => p.function !== 'console' && /base-t$|8p8c/i.test(p.type));
      setIncluded((copper.length ? [...copper,...parsed.ports.filter(p=>p.function === 'console')] : parsed.ports.filter(p => !['virtual', 'lag', 'bridge'].includes(p.type))).map(p => p.name));
    } catch (e) { if (revision === fileRevision.current) setError((e as Error).message); }
    finally { if (revision === fileRevision.current) setLoading(false); }
  }
  async function uploadImage(file?: File) {
    if (!file) return;
    setError(''); setLoading(true); setImage(null);
    try { setImage(await readTemplateImage(file)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  function save() {
    if (!definition || !image || !reviewed || !validRange || mapped !== names.length || rearLoading || sourceLoading || duplicateLabels) return;
    try {
      const template: EquipmentTemplate = { id: initial?.id ?? `custom-${crypto.randomUUID()}`, name: name.trim(), kind: definition.kind, heightU: definition.heightU, portCount: names.length, portStart,
        imageSrc: image.imageSrc, imageWidth: image.imageWidth, imageHeight: image.imageHeight,
        ...(rearImage&&{rearImage}),
        description: `Imported ${definition.manufacturer} ${definition.model}. ${names.length} mapped ports; routing follows the side of each socket.`,
        source: { manufacturer: definition.manufacturer, model: definition.model, filename, ...(sourceYaml && {yaml:sourceYaml}) }, ports: (ports as TemplatePort[]).map(p => ({ ...p, ...portMetadata[p.name!], label: labels[p.name!]?.trim() || undefined, media: portMetadata[p.name!]?.function === 'console' ? undefined : media[p.name!] ?? { kind: 'copper' }, interfaceType: definition.ports.find(source => source.name === p.name)?.type ?? 'other' })) };
      onSave(saveEquipmentTemplate(project, template));
    } catch (e) { setError((e as Error).message); }
  }
  const field = (label: string, value: number, change: (value: number) => void, min = 0, max = 100) => <label>{label}<input type="number" min={min} max={max} step="any" value={Number.isNaN(value) ? '' : value} onChange={e => { change(e.target.valueAsNumber); setReviewed(false); }}/></label>;
  const gridField = (label: string, value: number, change: (value: number) => void, min = 0, max = 100) => field(label, value, next => { change(next); setPreviewing(true); }, min, max);
  return <section className="panel template-editor" aria-label="Template editor">
    <h2>{initial ? 'Edit equipment template' : mapping ? 'Map the ports' : 'Import equipment template'}</h2>
    {!mapping&&<p>Choose a device definition, then add its front and optional rear images.</p>}
    <section className="template-definition" aria-label="Device definition" hidden={mapping}>
      <h3>Device definition</h3>
      <div className="template-fields"><label>Device definition YAML<input type="file" accept=".yaml,.yml" disabled={loading} onChange={e => { void uploadDefinition(e.target.files?.[0]); }}/></label></div>
      <p className="note">NetBox YAML · up to 512 KB · Original source is preserved with the template.</p>
    </section>
    {mapping && <details className="template-grid"><summary>Source YAML <span className="note">{sourceYaml ? 'Preserved' : 'Not retained'}</span></summary>
      <p className="note">{sourceYaml ? 'The original YAML is retained, including fields not yet used by PortTracker. Changes to the port map are stored separately.' : 'This older template has no original YAML. Attach the matching file to include it in future exports.'}</p>
      {sourceYaml && <button type="button" className="secondary-button" onClick={()=>downloadFile(filename || 'device.yaml',new Blob([sourceYaml],{type:'text/yaml;charset=utf-8'}))}>Download source YAML</button>}
      <label>Attach source YAML<input type="file" accept=".yaml,.yml" disabled={sourceLoading} onChange={async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;setSourceNotice('');setSourceLoading(true);try{
        if(file.size>512*1024)throw new Error('Choose a YAML definition smaller than 512 KB.');
        const yaml=await file.text(),parsed=parseDeviceDefinition(yaml);
        if(!definition || parsed.manufacturer!==definition.manufacturer || parsed.model!==definition.model || parsed.heightU!==definition.heightU)throw new Error('Choose the original YAML matching this manufacturer, model, and rack height.');
        setSourceYaml(yaml);setFilename(file.name);setReviewed(false);setSourceNotice('Source attached. Existing mapped ports are unchanged. Save the template to keep it.');
      }catch(error){setSourceNotice((error as Error).message);}finally{setSourceLoading(false);}}}/></label>
      {sourceNotice && <p role="status">{sourceNotice}</p>}
    </details>}
    <details className={`template-images-section${mapping?' is-mapping':''}`} open={!mapping}>
      <summary title="Expand to review the images or change the rear image.">Equipment images <span>{image?'Front ready':'Front needed'} · {rearImage?'Rear ready':'No rear image'}</span></summary>
    <div className="template-image-pair">
      <section className="template-image-card" aria-label="Front image settings">
        <h3>Front image <span className="template-image-badge">Required</span></h3>
        <div hidden={mapping}><label>Front equipment image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={loading} onChange={e => { void uploadImage(e.target.files?.[0]); }}/></label></div>
        <div className="template-image-preview">{image?<img src={image.imageSrc} alt="Front equipment preview"/>:<span>No front image selected</span>}</div>
        <p className="note">Front rack view and port mapping</p>
      </section>
      <section className="template-image-card" aria-label="Rear image settings">
        <h3>Rear image <span className="template-image-badge">Optional</span></h3>
        <label>Rear equipment image<input ref={rearInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={rearLoading} onChange={async event=>{
        const file=event.target.files?.[0];if(!file)return;
        const revision=++rearRevision.current;setRearLoading(true);setError('');
        try{const next=await readTemplateImage(file);if(revision===rearRevision.current){setRearImage(next);setReviewed(false);}}
        catch(error){if(revision===rearRevision.current)setError((error as Error).message);}
        finally{if(revision===rearRevision.current)setRearLoading(false);}
      }}/></label>
        <div className="template-image-preview">{rearImage?<img src={rearImage.imageSrc} alt="Rear equipment preview"/>:<span>No rear image selected</span>}</div>
        <p className="note">Rear rack view and port mapping</p>
        {rearLoading&&<p role="status">Loading rear image…</p>}
        {rearImage&&<button type="button" className="text-button" onClick={()=>{if(faces.some(f=>f==='rear')){setError('Move all rear ports to Front before removing the rear image.');return;}setMappingFace('front');setReviewed(false);rearRevision.current++;setRearLoading(false);setRearImage(null);if(rearInput.current)rearInput.current.value='';}}>Remove rear image</button>}
      </section>
    </div>
    <p className="note template-image-help">PNG, JPEG, or WebP · up to 1 MB per image · original proportions preserved</p>
    </details>
    {definition && <>
      <div className="template-fields"><label>Template name<input maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label>
        <label>Equipment type<select aria-label="Equipment type" disabled={!!initial || mapping} value={definition.kind} onChange={e => setDefinition({ ...definition, kind: e.target.value as DeviceDefinition['kind'] })}><option value="patch-panel">Patch panel</option><option value="switch">Switch</option></select></label>
        <p>{definition.manufacturer} · {definition.model} · {definition.heightU}U · {definition.ports.length} ports in definition</p></div>
      {!mapping && <>
        <p>Include the physical ports on either face, including any uplinks you want to map. Copper and console ports are selected by default. Other YAML fields are retained in the original source. You can map separate groups on the next step or return here to include more ports without losing existing positions.</p>
        <div className="template-actions"><button className="secondary-button" onClick={() => setIncluded(definition.ports.map(p => p.name))}>Include all ports</button><button className="secondary-button" onClick={() => setIncluded([])}>Clear included ports</button><strong>{included.length} ports included</strong></div>
        <div className="template-port-checks">{definition.ports.map(p => <label key={p.name}><input type="checkbox" checked={included.includes(p.name)} onChange={e => setIncluded(e.target.checked ? [...included, p.name] : included.filter(n => n !== p.name))}/><span>{p.name}<small>{p.type}</small></span></label>)}</div>
      </>}
    </>}
    {!mapping && <button className="primary-button" disabled={!definition || !image || !included.length || !name.trim() || loading} onClick={continueMapping}>Continue to port mapping</button>}
    {mapping && mappingImage && <>
      {definition?.kind === 'patch-panel' && <>
      <label className="port-numbering-field">Starting port number<input aria-label="Starting port number" type="number" min={0} max={MAX_PORT_NUMBER - names.length + 1} step={1} required value={Number.isNaN(portStart) ? '' : portStart} onChange={e => { const next = e.target.valueAsNumber; if (Number.isInteger(next) && Number.isInteger(portStart)) { setRangeFirst(n => n + next - portStart); setRangeLast(n => n + next - portStart); } setPortStart(next); setReviewed(false); setError(''); }}/></label>
      {validRange ? <p className="note">Ports {portStart}–{names.length - 1 + portStart}. New equipment inherits this numbering. Source interface names and numbers printed in the image are unchanged.</p> : <p className="form-error" role="alert">Enter a whole starting number from 0 to {MAX_PORT_NUMBER - names.length + 1}.</p>}
      </>}
      <p>Use a separate grid for each group of ports, or choose a port and click its socket center. The image stays visible while you adjust positions.</p>
      {definition?.kind !== 'patch-panel' && <div className="template-actions">
        <div className="segmented" role="group" aria-label="Mapping face">{(['front', 'rear'] as const).map(face => <button key={face} className={mappingFace === face ? 'active' : ''} aria-pressed={mappingFace === face} disabled={face === 'rear' && !rearImage} onClick={() => showFace(face)}>{face === 'front' ? 'Front' : 'Rear'}</button>)}</div>
        {!rearImage && <span className="note">Add a rear image under Equipment images to map rear ports.</span>}
      </div>}
      {definition?.kind === 'switch' && <>
        <div className="template-actions"><button type="button" className="secondary-button" disabled={addingPort || !validPortRange(portStart,names.length+1)} onClick={()=>setAddingPort(true)}>Add port</button>{portMetadata[names[selected]]?.manual && selected >= (initial?.portCount ?? 0) && <button type="button" className="text-button" onClick={removeAddedPort}>Remove added port</button>}</div>
        {addingPort && <AddTemplatePort hasRear={!!rearImage} onAdd={addPort} onCancel={()=>setAddingPort(false)}/>}
      </>}
      <div className="template-fields">
        <label>Mapped port<select aria-label="Mapped port" value={selected} onChange={e => choosePort(+e.target.value)}>{names.map((n, i) => <option value={i} key={i}>{definition?.kind === 'patch-panel' ? `${i + displayStart} — ${n}` : portLabel(i)}{faces[i] === 'rear' ? ' · Rear' : ''}{ports[i] ? '' : ' (unmapped)'}</option>)}</select></label>
        {definition?.kind !== 'patch-panel' && <label>Port face<select aria-label="Port face" value={faces[selected] ?? 'front'} onChange={e => assignFace(e.target.value as EquipmentSide)}><option value="front">Front</option><option value="rear" disabled={!rearImage}>Rear</option></select></label>}
      {definition?.kind === 'switch' && <label>Port label<input aria-label="Port label" title="Leave blank to use the interface name. Changing the label preserves existing connections." maxLength={80} value={labels[names[selected]] ?? ''} placeholder={templatePortLabel({name:names[selected]}, 'switch', selected + displayStart)} onChange={event => {setLabels(current => ({...current, [names[selected]]: event.target.value})); setReviewed(false); setError('');}}/></label>}
      </div>

      {duplicateLabels && <p className="form-error" role="alert">Each port needs a unique label.</p>}
      <p className="note">{mappingFace === 'rear' ? 'Rear' : 'Front'} image · Click a socket to place port {portLabel(selected)} on this face.</p>
      <div className="template-mapping-preview">
        <div className="mapping-selection-toolbar">
          <div className="segmented" role="group" aria-label="Image interaction">
            <button className={!dragSelect ? 'active' : ''} aria-pressed={!dragSelect} onClick={() => changeMappingMode(false)}>Place ports</button>
            <button className={dragSelect ? 'active' : ''} aria-pressed={dragSelect} onClick={() => changeMappingMode(true)}>Drag select</button>
          </div>
          {dragSelect && <><label><input type="checkbox" checked={addToSelection} onChange={e => setAddToSelection(e.target.checked)}/>Add to selection</label><strong aria-live="polite">{gridIndices.length} selected</strong></>}
        </div>
        <div className="template-mapping-stage"><svg {...imageEvents} tabIndex={0} onKeyDown={e => { if (e.key === 'Escape') cancelDrag(); }} className={`template-map${dragSelect ? ' drag-select' : ''}`} viewBox={`0 0 ${mappingImage.imageWidth} ${mappingImage.imageHeight}`} style={{ aspectRatio: `${mappingImage.imageWidth} / ${mappingImage.imageHeight}` }} aria-label="Port mapping image" role="group" onClick={e => {
        if (dragSelect) return;
        const box = e.currentTarget.getBoundingClientRect();
        updatePort(selected, { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height });
        if (advance) { const next = names.findIndex((_, i) => i > selected && faces[i] === mappingFace); if (next >= 0) setSelected(next); }
      }}>
        <image href={mappingImage.imageSrc} width={mappingImage.imageWidth} height={mappingImage.imageHeight} preserveAspectRatio="xMidYMid meet"/>
        {(dragSelect ? selectablePorts : facePorts).map((p, i) => p && <g key={i} data-map-index={i} role="button" tabIndex={0} aria-label={`Select ${ports[i] ? 'mapped' : 'preview'} port ${portLabel(i)}`} aria-pressed={dragSelect ? gridSelection.includes(i) : i === selected} onClick={e => { if (dragSelect) { e.stopPropagation(); return; } if (i !== selected) { e.stopPropagation(); setSelected(i); } }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (dragSelect) { setSelectionPreview(visiblePreview); selectGridPorts(gridSelection.includes(i) ? gridSelection.filter(n => n !== i) : [...gridSelection, i]); setPreviewing(false); } else setSelected(i); } }}>
          <rect x={(p.x - p.width / 2) * mappingImage.imageWidth} y={(p.y - p.height / 2) * mappingImage.imageHeight} width={p.width * mappingImage.imageWidth} height={p.height * mappingImage.imageHeight} fill={dragSelect ? gridSelection.includes(i) ? '#48baff70' : '#00babb15' : i === selected ? '#ffbf3340' : '#00babb25'} stroke={dragSelect ? gridSelection.includes(i) ? '#65caff' : '#00babb' : i === selected ? '#ffbf33' : '#00babb'} strokeDasharray={dragSelect && visiblePreview.has(i) ? '4 3' : undefined} strokeWidth={2} vectorEffect="non-scaling-stroke"/>
          <text x={p.x * mappingImage.imageWidth} y={p.y * mappingImage.imageHeight} textAnchor="middle" dominantBaseline="middle" fill="white" stroke="#102e40" strokeWidth={2} paintOrder="stroke" fontSize={Math.min(mappingImage.imageWidth / 90, p.width * mappingImage.imageWidth / Math.max(1, portLabel(i).length * .65))} pointerEvents="none">{portLabel(i)}</text>
        </g>)}
        {!dragSelect && gridOpen && previewing && gridPreview.map((p, i) => <g key={gridIndices[i]} data-grid-preview-port={gridIndices[i] + displayStart} pointerEvents="none">
          <rect x={(p.x - p.width / 2) * mappingImage.imageWidth} y={(p.y - p.height / 2) * mappingImage.imageHeight} width={p.width * mappingImage.imageWidth} height={p.height * mappingImage.imageHeight} fill="#bf83ff22" stroke="#cf9cff" strokeDasharray="4 3" strokeWidth={2} vectorEffect="non-scaling-stroke"/>
          <text x={p.x * mappingImage.imageWidth} y={p.y * mappingImage.imageHeight} textAnchor="middle" dominantBaseline="middle" fill="white" stroke="#472563" strokeWidth={2} paintOrder="stroke" fontSize={Math.min(mappingImage.imageWidth / 90, p.width * mappingImage.imageWidth / Math.max(1, portLabel(gridIndices[i]).length * .65))}>{portLabel(gridIndices[i])}</text>
        </g>)}
        {marquee && <rect className="port-selection-marquee" x={Math.min(marquee.start.x, marquee.end.x) * mappingImage.imageWidth} y={Math.min(marquee.start.y, marquee.end.y) * mappingImage.imageHeight} width={Math.abs(marquee.end.x - marquee.start.x) * mappingImage.imageWidth} height={Math.abs(marquee.end.y - marquee.start.y) * mappingImage.imageHeight} fill="#48baff30" stroke="#65caff" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
      </svg></div><p className="mapping-preview-caption">{mapped} / {names.length} ports mapped{dragSelect && visiblePreview.size > 0 ? ' · Dashed boxes are preview positions. Drag to select; Generate port grid applies positions.' : gridOpen && previewing && gridPreview.length > 0 ? ` · Dashed purple boxes preview ${gridPreview.length} selected ports. Generate port grid to apply.` : dragSelect ? ' · Drag around sockets or across the port list. Shift-drag adds ports. Unmapped ports can be selected in the list.' : ' · Click to place a port, or drag a box to select ports. On touch screens, use Drag select.'}</p></div>
      <details ref={gridDetails} className="template-grid" onToggle={event => { setGridOpen(event.currentTarget.open); if (!dragSelect || !mapped) setPreviewing(true); }}>
        <summary>Start with a regular grid</summary>
        <p>Select the ports in one physical group, adjust its grid, then generate. Selected ports will be assigned to the displayed face. Other port positions stay unchanged. Repeat for another group, such as uplinks.</p>
        <fieldset className="grid-port-selection"><legend>Ports for this grid</legend>
          <div className="template-actions">
            <button className="secondary-button" onClick={() => selectGridPorts(names.flatMap((_, i) => faces[i] === mappingFace ? [i] : []))}>Select all ports for grid</button>
            <button className="secondary-button" onClick={() => selectGridPorts(ports.flatMap((p, i) => !p && faces[i] === mappingFace ? [i] : []))}>Select unmapped ports</button>
            <button className="secondary-button" onClick={() => selectGridPorts([])}>Clear grid selection</button>
            <strong aria-live="polite">{gridIndices.length} ports selected for grid</strong>
            {!initial && <button className="text-button" onClick={() => { setMapping(false); setReviewed(false); }}>Include more ports</button>}
          </div>
          <div className="grid-range-controls">
            {definition?.kind === 'switch' ? <>
              <label>First port in range<select aria-label="First port in range" value={rangeFirst} onChange={e => setRangeFirst(+e.target.value)}>{names.map((_, i) => <option key={i} value={i + displayStart}>{portLabel(i)}</option>)}</select></label>
              <label>Last port in range<select aria-label="Last port in range" value={rangeLast} onChange={e => setRangeLast(+e.target.value)}>{names.map((_, i) => <option key={i} value={i + displayStart}>{portLabel(i)}</option>)}</select></label>
            </> : <>
            <label>First port in range<input type="number" min={displayStart} max={displayStart + names.length - 1} step={1} value={Number.isNaN(rangeFirst) ? '' : rangeFirst} onChange={e => setRangeFirst(e.target.valueAsNumber)}/></label>
            <label>Last port in range<input type="number" min={displayStart} max={displayStart + names.length - 1} step={1} value={Number.isNaN(rangeLast) ? '' : rangeLast} onChange={e => setRangeLast(e.target.valueAsNumber)}/></label>
            </>}
            <button className="secondary-button" disabled={!validSelectionRange} onClick={() => selectGridPorts(names.flatMap((_, i) => i + displayStart >= rangeFirst && i + displayStart <= rangeLast ? [i] : []))}>Select port range</button>
          </div>
          <div {...listEvents} onKeyDown={e => { if (e.key === 'Escape') cancelDrag(); }} className={`grid-port-options${dragSelect ? ' drag-select' : ''}`}>{names.map((n, i) => <label key={i} data-grid-choice={i}><input type="checkbox" aria-label={`Grid port ${portLabel(i)} — ${n}`} checked={gridSelection.includes(i)} onChange={e => selectGridPorts(e.target.checked ? [...gridSelection, i] : gridSelection.filter(p => p !== i))}/><span>{portLabel(i)}{portLabel(i) !== n && definition?.kind === 'patch-panel' ? ` — ${n}` : ''}<small>{faces[i] === 'rear' ? 'Rear' : 'Front'} · {ports[i] ? 'Mapped' : 'Unmapped'}</small></span></label>)}</div>
        </fieldset>
        <div className="template-fields">{gridField('Grid columns', columns, setColumns, 1, Math.max(1, gridIndices.length))}
          <label>Grid numbering<select aria-label="Grid numbering" value={order} onChange={e => { setOrder(e.target.value as 'rows' | 'columns'); setPreviewing(true); }}><option value="rows">Across rows</option><option value="columns">Down columns (odd/even for two rows)</option></select></label>
          {gridField('First column center (%)', left, setLeft)}{gridField('Last column center (%)', right, setRight)}{gridField('First row center (%)', top, setTop)}{gridField('Last row center (%)', bottom, setBottom)}
          {gridField('Grid socket width (%)', width, setWidth, .1)}{gridField('Grid socket height (%)', height, setHeight, .1)}
        </div>
        {gridError && <p className="form-error" role="status">{gridError}</p>}
        {!gridIndices.length && <p className="note">Select at least one port to generate a grid.</p>}
        <button className="secondary-button" disabled={!gridIndices.length || !!gridError} onClick={() => {
          const replacements = new Map(gridIndices.map((index, i) => [index, gridPreview[i]]));
          setFaces(current => current.map((f, i) => replacements.has(i) ? mappingFace : f));
          setPorts(current => current.map((p, i) => replacements.get(i) ?? p)); setSelectionPreview(new Map()); setReviewed(false); setError(''); setPreviewing(false);
        }}>Generate port grid</button>
      </details>
      <div className="template-fields">

        {portMetadata[names[selected]]?.manual ? <label>Source<input readOnly value="Manually added"/></label> : <label>Source interface<select aria-label="Source interface" disabled={!!initial} value={names[selected]} onChange={e => {
          const other = names.indexOf(e.target.value), next = [...names]; [next[selected], next[other]] = [next[other], next[selected]]; setNames(next);
          setPorts(current => current.map((p, i) => p ? { ...p, name: next[i] } : null)); setReviewed(false);
        }}>{names.filter(n=>!portMetadata[n]?.manual).map(n => <option key={n}>{n}</option>)}</select></label>}
        {field('Socket center X (%)', socket ? +(socket.x * 100).toFixed(4) : 50, x => updatePort(selected, { x: x / 100 }))}
        {field('Socket center Y (%)', socket ? +(socket.y * 100).toFixed(4) : 50, y => updatePort(selected, { y: y / 100 }))}
        {field('Socket width (%)', socket ? +(socket.width * 100).toFixed(4) : width, w => { setWidth(w); updatePort(selected, { width: w / 100 }); }, .1)}
        {field('Socket height (%)', socket ? +(socket.height * 100).toFixed(4) : height, h => { setHeight(h); updatePort(selected, { height: h / 100 }); }, .1)}
      </div>
      <section aria-label="Mapped port physical settings"><h3>Physical type for port {portLabel(selected)}</h3>
        {portMetadata[names[selected]]?.function === 'console' ? <>
          <p>Serial console</p><label className="port-numbering-field">Console connector<select value={portMetadata[names[selected]].consoleConnector} onChange={event=>{setPortMetadata(current=>({...current,[names[selected]]:{...current[names[selected]],consoleConnector:event.target.value as ConsoleConnector}}));setReviewed(false);}}>{CONSOLE_CONNECTORS.map(c=><option key={c}>{c}</option>)}</select></label>
          <p className="note">Console ports have no Ethernet or VLAN settings. Serial console cabling is not supported yet.</p>
        </> : <>
        <PortMediaFields value={media[names[selected]] ?? { kind: 'copper' }} onChange={value => { setMedia(current => ({ ...current, [names[selected]]: value })); setReviewed(false); }}/>
        <button className="secondary-button" onClick={() => { const value = media[names[selected]] ?? { kind: 'copper' as const }; setMedia(Object.fromEntries(names.filter(n=>portMetadata[n]?.function !== 'console').map(n => [n, { ...value }]))); setReviewed(false); }}>Apply this physical type to all mapped ports</button>
        <p className="note">Mixed copper and fiber ports are supported. Optical slots need an installed transceiver, connector, fiber mode, and strand count before connection. You can configure individual devices later in the Ports inspector.</p>
        </>}
      </section>
      <div className="template-actions"><label><input type="checkbox" checked={advance} onChange={e => setAdvance(e.target.checked)}/>Advance after placing a port</label><button className="secondary-button" onClick={() => { setPorts(current => current.map((p, i) => i === selected ? null : p)); setSelectionPreview(new Map()); setReviewed(false); setPreviewing(false); }}>Clear this position</button><button className="secondary-button" title="Clear positions on the displayed face only" disabled={facePorts.every(p => p === null)} onClick={() => { setPorts(current => current.map((p, i) => faces[i] === mappingFace ? null : p)); setSelectionPreview(new Map()); setReviewed(false); setError(''); setPreviewing(false); }}>Clear all positions</button><strong>{mapped} / {names.length} ports mapped</strong></div>

      <p className="note">Saving also updates equipment already using this template. Excluded interfaces remain decorative; include and map uplinks to make them usable.</p>
      <label className="template-review"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>I checked every socket position and numbered interface against the image.</label>
      {initial && <p className="note">This template is used by {templateUsage(project, initial.id)} device(s) across all locations. Changing the starting number renumbers devices following the template. Individual range overrides are kept. Added ports are appended to every device using this template when saved. Connections, VLANs, notes, and physical settings remain attached to the same existing sockets.</p>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="template-actions">{mapping && <button className="primary-button" disabled={duplicateLabels || rearLoading || sourceLoading || !validRange || !reviewed || !name.trim() || mapped !== names.length || !names.length} onClick={save}>Save template</button>}{mapping && !initial && <button className="secondary-button" onClick={() => { setMapping(false); setReviewed(false); }}>Back to files</button>}<button className="secondary-button" onClick={onCancel}>Cancel</button></div>
  </section>;
}

export function TemplateLibraryPage({ project, onChange, onPlace }: { project: Project; onChange: (project: Project) => void; onPlace: (templateId: string) => void }) {
  const packageInput=useRef<HTMLInputElement>(null);
  const [packageBusy,setPackageBusy]=useState(false);
  const [editor, setEditor] = useState<{ initial?: EquipmentTemplate } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return <main className="configuration-workspace template-library">
    <ConfigurationNav page="templates"/>
    <section className="configuration-content"><div className="configuration-heading"><div><span className="eyebrow">CONFIGURATION</span><h1>Equipment templates</h1><p>Import device definitions and images, then map their ports.</p></div>{!editor && <div className="template-actions"><button className="secondary-button" disabled={packageBusy} onClick={()=>packageInput.current?.click()}>Import saved template</button><button className="primary-button" disabled={packageBusy} onClick={() => { setEditor({}); setMessage(''); setError(''); }}>Import template</button></div>}</div>
      <input ref={packageInput} type="file" aria-label="Saved template file" className="sr-only" accept=".json" disabled={packageBusy} onChange={async event=>{
        const file=event.target.files?.[0];event.target.value='';if(!file)return;setPackageBusy(true);setError('');setMessage('');
        try{const data=await readTemplatePackage(file),result=importTemplatePackage(project,data);onChange(result.project);setMessage(`Imported ${result.template.name}. Existing templates and equipment were not changed.`);}
        catch(error){setError((error as Error).message);}finally{setPackageBusy(false);}
      }}/>
      {message && <p role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
      {editor ? <TemplateEditor key={editor.initial?.id ?? 'new'} initial={editor.initial} project={project} onSave={next => { onChange(next); setEditor(null); setMessage('Template saved. Choose Place in rack to add equipment.'); }} onCancel={() => setEditor(null)}/> : <>
        <p className="note">Saved template packages include images, source YAML when available, and port maps. Importing a package creates a separate copy.</p>
        <div className="template-cards">{[...EQUIPMENT_TEMPLATES, ...(project.templates ?? [])].map(t => <article className="panel template-card" key={t.id}>
          <h2>{t.name}</h2><img src={t.imageSrc} alt={t.name}/><p>{t.heightU}U · {t.portCount} ports · Ports {t.portStart ?? 1}–{t.portCount - 1 + (t.portStart ?? 1)} · {t.kind === 'switch' ? 'Switch' : 'Patch panel'}</p><p>{t.source ? `Imported · ${templateUsage(project, t.id)} device(s)` : 'Bundled · NetBox Device Type Library'}</p>
          <button className="primary-button" disabled={packageBusy} aria-label={`Place ${t.name} in rack`} onClick={() => onPlace(t.id)}>Place in rack</button>
          <div className="template-actions"><button className="secondary-button" disabled={packageBusy} aria-label={`Export template ${t.name}`} onClick={async()=>{setPackageBusy(true);setError('');setMessage('');try{const template=await exportableTemplate(t);downloadFile(templatePackageFilename(template),new Blob([JSON.stringify(createTemplatePackage(template),null,2)],{type:'application/json'}));setMessage('Template package exported.');}catch(error){setError((error as Error).message);}finally{setPackageBusy(false);}}}>Export template</button>{t.source?.yaml&&<button className="text-button" aria-label={`Download source YAML for ${t.name}`} onClick={()=>downloadFile(t.source!.filename,new Blob([t.source!.yaml!],{type:'text/yaml;charset=utf-8'}))}>Source YAML</button>}</div>
          {t.source && <div className="template-actions"><button className="secondary-button" disabled={packageBusy} aria-label={`Edit template ${t.name}`} onClick={() => { setEditor({ initial: t }); setMessage(''); }}>Edit template</button><button className="secondary-button" aria-label={`Remove template ${t.name}`} disabled={packageBusy || templateUsage(project, t.id) > 0} title={templateUsage(project, t.id) ? 'This template is used by equipment and cannot be removed.' : 'Remove unused template'} onClick={() => { try { onChange(removeEquipmentTemplate(project, t.id)); setMessage('Unused template removed.'); } catch (e) { setError((e as Error).message); } }}>Remove</button></div>}
        </article>)}</div>
      </>}
    </section>
  </main>;
}
