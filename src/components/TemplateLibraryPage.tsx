import { usePortDragSelection } from './usePortDragSelection';
import { ConfigurationNav } from './ConfigurationNav';
import { validPortRange, MAX_PORT_NUMBER } from '../portNumbering';
import { type PortMedia, inferPortMedia } from '../media';
import { PortMediaFields } from './MediaFields';
import { useRef, useState } from 'react';
import { type EquipmentTemplate, type TemplatePort, EQUIPMENT_TEMPLATES } from '../equipmentTemplates';
import { type Project, saveEquipmentTemplate, removeEquipmentTemplate, templateUsage } from '../project';
import { parseDeviceDefinition, readTemplateImage, gridPorts, validTemplatePort, type DeviceDefinition } from '../templateImport';

function TemplateEditor({ initial, project, onSave, onCancel }: { initial?: EquipmentTemplate; project: Project; onSave: (project: Project) => void; onCancel: () => void }) {
  const [definition, setDefinition] = useState<DeviceDefinition | null>(initial ? { manufacturer: initial.source!.manufacturer, model: initial.source!.model, heightU: initial.heightU, kind: initial.kind, ports: initial.ports.map(p => ({ name: p.name!, type: p.interfaceType ?? 'mapped' })) } : null);
  const [filename, setFilename] = useState(initial?.source?.filename ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [image, setImage] = useState<Pick<EquipmentTemplate, 'imageSrc' | 'imageWidth' | 'imageHeight'> | null>(initial ?? null);
  const [included, setIncluded] = useState<string[]>(initial?.ports.map(p => p.name!) ?? []);
  const [ports, setPorts] = useState<(TemplatePort | null)[]>(initial ? [...initial.ports] : []);
  const [names, setNames] = useState<string[]>(initial?.ports.map(p => p.name!) ?? []);
  const [media, setMedia] = useState<Record<string, PortMedia>>(() => Object.fromEntries(initial?.ports.map(p => [p.name!, p.media ?? { kind: 'copper' }]) ?? []));
  const [mapping, setMapping] = useState(!!initial);
  const [selected, setSelected] = useState(0);
  const [gridSelection, setGridSelection] = useState<number[]>(initial ? initial.ports.map((_, i) => i) : []);
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
  const mapped = ports.filter(p => p && validTemplatePort(p)).length;
  const gridIndices = names.map((_, i) => i).filter(i => gridSelection.includes(i));
  let gridPreview: TemplatePort[] = [], gridError = '';
  if (gridIndices.length) {
    try { gridPreview = gridPorts(gridIndices.map(i => names[i]), columns, order, left / 100, right / 100, top / 100, bottom / 100, width / 100, height / 100); }
    catch (e) { gridError = (e as Error).message; }
  }
  const visiblePreview = gridOpen && previewing ? new Map(gridIndices.map((index, i) => [index, gridPreview[i]]).filter((entry): entry is [number, TemplatePort] => !!entry[1])) : dragSelect ? selectionPreview : new Map<number, TemplatePort>();
  const selectablePorts = ports.map((p, i) => visiblePreview.get(i) ?? p);
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
  function continueMapping() {
    // Append newly included interfaces so existing numbered slots and source swaps stay intact.
    const chosen = [...names.filter(n => included.includes(n)), ...definition!.ports.filter(p => included.includes(p.name) && !names.includes(p.name)).map(p => p.name)];
    const previous = new Map(names.map((n, i) => [n, ports[i]]));
    const nextPorts = chosen.map(n => previous.get(n) ?? null);
    const unmapped = nextPorts.flatMap((p, i) => p ? [] : [i]);
    setNames(chosen); setPorts(nextPorts); setSelected(0);
    const group = unmapped.length ? unmapped : chosen.map((_, i) => i);
    setGridSelection(group); setColumns(Math.min(24, group.length)); setTop(group.length > 24 ? 35 : 50);
    setRangeFirst(portStart); setRangeLast(portStart + chosen.length - 1);
    setMapping(true); setSelectionPreview(new Map()); setGridOpen(false); setReviewed(false); setError(''); setPreviewing(true);
  }

  function updatePort(index: number, patch: Partial<TemplatePort>) {
    setReviewed(false); setError(''); setPreviewing(false);
    setPorts(current => current.map((p, i) => i === index ? { name: names[i], x: .5, y: .5, width: width / 100, height: height / 100, ...p, ...patch } : p));
  }
  async function uploadDefinition(file?: File) {
    if (!file) return;
    const revision = ++fileRevision.current;
    setError(''); setLoading(true); setDefinition(null); setIncluded([]); setFilename(''); setName(''); setNames([]); setPorts([]); setGridSelection([]);
    try {
      if (file.size > 512 * 1024) throw new Error('Choose a YAML definition smaller than 512 KB.');
      const parsed = parseDeviceDefinition(await file.text());
      if (revision !== fileRevision.current) return;
      setMedia(Object.fromEntries(parsed.ports.map(p => [p.name, inferPortMedia(p.type)])));
      setDefinition(parsed); setFilename(file.name); setName(`${parsed.manufacturer} ${parsed.model}`.slice(0, 100));
      const copper = parsed.ports.filter(p => /base-t$|8p8c/i.test(p.type));
      setIncluded((copper.length ? copper : parsed.ports.filter(p => !['virtual', 'lag', 'bridge'].includes(p.type))).map(p => p.name));
    } catch (e) { if (revision === fileRevision.current) setError((e as Error).message); }
    finally { if (revision === fileRevision.current) setLoading(false); }
  }
  async function uploadImage(file?: File) {
    if (!file) return;
    setError(''); setLoading(true); setImage(null);
    try { setImage(await readTemplateImage(file)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  function save() {
    if (!definition || !image || !reviewed || !validRange || mapped !== names.length) return;
    try {
      const template: EquipmentTemplate = { id: initial?.id ?? `custom-${crypto.randomUUID()}`, name: name.trim(), kind: definition.kind, heightU: definition.heightU, portCount: names.length, portStart,
        imageSrc: image.imageSrc, imageWidth: image.imageWidth, imageHeight: image.imageHeight,
        description: `Imported ${definition.manufacturer} ${definition.model}. ${names.length} mapped ports; routing follows the side of each socket.`,
        source: { manufacturer: definition.manufacturer, model: definition.model, filename }, ports: (ports as TemplatePort[]).map(p => ({ ...p, media: media[p.name!] ?? { kind: 'copper' }, interfaceType: definition.ports.find(source => source.name === p.name)?.type ?? 'other' })) };
      onSave(saveEquipmentTemplate(project, template));
    } catch (e) { setError((e as Error).message); }
  }
  const field = (label: string, value: number, change: (value: number) => void, min = 0, max = 100) => <label>{label}<input type="number" min={min} max={max} step="any" value={Number.isNaN(value) ? '' : value} onChange={e => { change(e.target.valueAsNumber); setReviewed(false); }}/></label>;
  const gridField = (label: string, value: number, change: (value: number) => void, min = 0, max = 100) => field(label, value, next => { change(next); setPreviewing(true); }, min, max);
  return <section className="panel template-editor" aria-label="Template editor">
    <h2>{initial ? 'Edit port map' : mapping ? 'Map the ports' : 'Import equipment template'}</h2>
    <p>Use the matching front image and NetBox device YAML. Nothing is uploaded to a server.</p>
    <div hidden={mapping}>
      <div className="template-fields"><label>Device definition YAML<input type="file" accept=".yaml,.yml" disabled={loading} onChange={e => { void uploadDefinition(e.target.files?.[0]); }}/></label>
      <label>Equipment image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={loading} onChange={e => { void uploadImage(e.target.files?.[0]); }}/></label></div>
      <p className="note">YAML up to 512 KB. PNG, JPEG, or WebP up to 1 MB. Images keep their original proportions.</p>
    </div>
    {definition && <>
      <div className="template-fields"><label>Template name<input maxLength={100} value={name} onChange={e => setName(e.target.value)}/></label>
        <label>Equipment type<select aria-label="Equipment type" disabled={!!initial || mapping} value={definition.kind} onChange={e => setDefinition({ ...definition, kind: e.target.value as DeviceDefinition['kind'] })}><option value="patch-panel">Patch panel</option><option value="switch">Switch</option></select></label>
        <p>{definition.manufacturer} · {definition.model} · {definition.heightU}U · {definition.ports.length} ports in definition</p></div>
      {!mapping && <>
        <p>Include the physical ports on this face, including any uplinks you want to map. Copper ports are selected by default. You can map separate groups on the next step or return here to include more ports without losing existing positions.</p>
        <div className="template-actions"><button className="secondary-button" onClick={() => setIncluded(definition.ports.map(p => p.name))}>Include all ports</button><button className="secondary-button" onClick={() => setIncluded([])}>Clear included ports</button><strong>{included.length} ports included</strong></div>
        <div className="template-port-checks">{definition.ports.map(p => <label key={p.name}><input type="checkbox" checked={included.includes(p.name)} onChange={e => setIncluded(e.target.checked ? [...included, p.name] : included.filter(n => n !== p.name))}/><span>{p.name}<small>{p.type}</small></span></label>)}</div>
      </>}
    </>}
    {!mapping && image && <img className="template-preview" src={image.imageSrc} alt="Imported equipment preview"/>}
    {!mapping && <button className="primary-button" disabled={!definition || !image || !included.length || !name.trim() || loading} onClick={continueMapping}>Continue to port mapping</button>}
    {mapping && image && <>
      <label className="port-numbering-field">Starting port number<input aria-label="Starting port number" type="number" min={0} max={MAX_PORT_NUMBER - names.length + 1} step={1} required value={Number.isNaN(portStart) ? '' : portStart} onChange={e => { const next = e.target.valueAsNumber; if (Number.isInteger(next) && Number.isInteger(portStart)) { setRangeFirst(n => n + next - portStart); setRangeLast(n => n + next - portStart); } setPortStart(next); setReviewed(false); setError(''); }}/></label>
      {validRange ? <p className="note">Ports {portStart}–{names.length - 1 + portStart}. New equipment inherits this numbering. Source interface names and numbers printed in the image are unchanged.</p> : <p className="form-error" role="alert">Enter a whole starting number from 0 to {MAX_PORT_NUMBER - names.length + 1}.</p>}
      <p>Use a separate grid for each group of ports, or choose a numbered port and click its socket center. The image stays visible while you adjust positions. Individual devices can use a different range in the Equipment inspector.</p>
      <div className="template-mapping-preview">
        <div className="mapping-selection-toolbar">
          <div className="segmented" role="group" aria-label="Image interaction">
            <button className={!dragSelect ? 'active' : ''} aria-pressed={!dragSelect} onClick={() => changeMappingMode(false)}>Place ports</button>
            <button className={dragSelect ? 'active' : ''} aria-pressed={dragSelect} onClick={() => changeMappingMode(true)}>Drag select</button>
          </div>
          {dragSelect && <><label><input type="checkbox" checked={addToSelection} onChange={e => setAddToSelection(e.target.checked)}/>Add to selection</label><strong aria-live="polite">{gridIndices.length} selected</strong></>}
        </div>
        <div className="template-mapping-stage"><svg {...imageEvents} tabIndex={0} onKeyDown={e => { if (e.key === 'Escape') cancelDrag(); }} className={`template-map${dragSelect ? ' drag-select' : ''}`} viewBox={`0 0 ${image.imageWidth} ${image.imageHeight}`} style={{ aspectRatio: `${image.imageWidth} / ${image.imageHeight}` }} aria-label="Port mapping image" role="group" onClick={e => {
        if (dragSelect) return;
        const box = e.currentTarget.getBoundingClientRect();
        updatePort(selected, { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height });
        if (advance) setSelected(n => Math.min(names.length - 1, n + 1));
      }}>
        <image href={image.imageSrc} width={image.imageWidth} height={image.imageHeight} preserveAspectRatio="xMidYMid meet"/>
        {(dragSelect ? selectablePorts : ports).map((p, i) => p && <g key={i} data-map-index={i} role="button" tabIndex={0} aria-label={`Select ${ports[i] ? 'mapped' : 'preview'} port ${i + displayStart}`} aria-pressed={dragSelect ? gridSelection.includes(i) : i === selected} onClick={e => { if (dragSelect) { e.stopPropagation(); return; } if (i !== selected) { e.stopPropagation(); setSelected(i); } }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (dragSelect) { setSelectionPreview(visiblePreview); selectGridPorts(gridSelection.includes(i) ? gridSelection.filter(n => n !== i) : [...gridSelection, i]); setPreviewing(false); } else setSelected(i); } }}>
          <rect x={(p.x - p.width / 2) * image.imageWidth} y={(p.y - p.height / 2) * image.imageHeight} width={p.width * image.imageWidth} height={p.height * image.imageHeight} fill={dragSelect ? gridSelection.includes(i) ? '#48baff70' : '#00babb15' : i === selected ? '#ffbf3340' : '#00babb25'} stroke={dragSelect ? gridSelection.includes(i) ? '#65caff' : '#00babb' : i === selected ? '#ffbf33' : '#00babb'} strokeDasharray={dragSelect && visiblePreview.has(i) ? '4 3' : undefined} strokeWidth={2} vectorEffect="non-scaling-stroke"/>
          <text x={p.x * image.imageWidth} y={p.y * image.imageHeight} textAnchor="middle" dominantBaseline="middle" fill="white" stroke="#102e40" strokeWidth={2} paintOrder="stroke" fontSize={image.imageWidth / 90} pointerEvents="none">{i + displayStart}</text>
        </g>)}
        {!dragSelect && gridOpen && previewing && gridPreview.map((p, i) => <g key={gridIndices[i]} data-grid-preview-port={gridIndices[i] + displayStart} pointerEvents="none">
          <rect x={(p.x - p.width / 2) * image.imageWidth} y={(p.y - p.height / 2) * image.imageHeight} width={p.width * image.imageWidth} height={p.height * image.imageHeight} fill="#bf83ff22" stroke="#cf9cff" strokeDasharray="4 3" strokeWidth={2} vectorEffect="non-scaling-stroke"/>
          <text x={p.x * image.imageWidth} y={p.y * image.imageHeight} textAnchor="middle" dominantBaseline="middle" fill="white" stroke="#472563" strokeWidth={2} paintOrder="stroke" fontSize={image.imageWidth / 90}>{gridIndices[i] + displayStart}</text>
        </g>)}
        {marquee && <rect className="port-selection-marquee" x={Math.min(marquee.start.x, marquee.end.x) * image.imageWidth} y={Math.min(marquee.start.y, marquee.end.y) * image.imageHeight} width={Math.abs(marquee.end.x - marquee.start.x) * image.imageWidth} height={Math.abs(marquee.end.y - marquee.start.y) * image.imageHeight} fill="#48baff30" stroke="#65caff" strokeWidth={2} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
      </svg></div><p className="mapping-preview-caption">{mapped} / {names.length} ports mapped{dragSelect && visiblePreview.size > 0 ? ' · Dashed boxes are preview positions. Drag to select; Generate port grid applies positions.' : gridOpen && previewing && gridPreview.length > 0 ? ` · Dashed purple boxes preview ${gridPreview.length} selected ports. Generate port grid to apply.` : dragSelect ? ' · Drag around sockets or across the port list. Shift-drag adds ports. Unmapped ports can be selected in the list.' : ' · Click to place a port, or drag a box to select ports. On touch screens, use Drag select.'}</p></div>
      <details ref={gridDetails} className="template-grid" onToggle={event => { setGridOpen(event.currentTarget.open); if (!dragSelect || !mapped) setPreviewing(true); }}>
        <summary>Start with a regular grid</summary>
        <p>Select the ports in one physical group, adjust its grid, then generate. Other port positions stay unchanged. Repeat for another group, such as uplinks.</p>
        <fieldset className="grid-port-selection"><legend>Ports for this grid</legend>
          <div className="template-actions">
            <button className="secondary-button" onClick={() => selectGridPorts(names.map((_, i) => i))}>Select all ports for grid</button>
            <button className="secondary-button" onClick={() => selectGridPorts(ports.flatMap((p, i) => p ? [] : [i]))}>Select unmapped ports</button>
            <button className="secondary-button" onClick={() => selectGridPorts([])}>Clear grid selection</button>
            <strong aria-live="polite">{gridIndices.length} ports selected for grid</strong>
            {!initial && <button className="text-button" onClick={() => { setMapping(false); setReviewed(false); }}>Include more ports</button>}
          </div>
          <div className="grid-range-controls">
            <label>First port in range<input type="number" min={displayStart} max={displayStart + names.length - 1} step={1} value={Number.isNaN(rangeFirst) ? '' : rangeFirst} onChange={e => setRangeFirst(e.target.valueAsNumber)}/></label>
            <label>Last port in range<input type="number" min={displayStart} max={displayStart + names.length - 1} step={1} value={Number.isNaN(rangeLast) ? '' : rangeLast} onChange={e => setRangeLast(e.target.valueAsNumber)}/></label>
            <button className="secondary-button" disabled={!validSelectionRange} onClick={() => selectGridPorts(names.flatMap((_, i) => i + displayStart >= rangeFirst && i + displayStart <= rangeLast ? [i] : []))}>Select port range</button>
          </div>
          <div {...listEvents} onKeyDown={e => { if (e.key === 'Escape') cancelDrag(); }} className={`grid-port-options${dragSelect ? ' drag-select' : ''}`}>{names.map((n, i) => <label key={i} data-grid-choice={i}><input type="checkbox" aria-label={`Grid port ${i + displayStart} — ${n}`} checked={gridSelection.includes(i)} onChange={e => selectGridPorts(e.target.checked ? [...gridSelection, i] : gridSelection.filter(p => p !== i))}/><span>{i + displayStart} — {n}<small>{ports[i] ? 'Mapped' : 'Unmapped'}</small></span></label>)}</div>
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
          setPorts(current => current.map((p, i) => replacements.get(i) ?? p)); setSelectionPreview(new Map()); setReviewed(false); setError(''); setPreviewing(false);
        }}>Generate port grid</button>
      </details>
      <div className="template-fields">
        <label>Mapped port<select aria-label="Mapped port" value={selected} onChange={e => setSelected(+e.target.value)}>{names.map((n, i) => <option value={i} key={i}>{i + displayStart} — {n}{ports[i] ? '' : ' (unmapped)'}</option>)}</select></label>
        <label>Source interface<select aria-label="Source interface" disabled={!!initial} value={names[selected]} onChange={e => {
          const other = names.indexOf(e.target.value), next = [...names]; [next[selected], next[other]] = [next[other], next[selected]]; setNames(next);
          setPorts(current => current.map((p, i) => p ? { ...p, name: next[i] } : null)); setReviewed(false);
        }}>{names.map(n => <option key={n}>{n}</option>)}</select></label>
        {field('Socket center X (%)', socket ? +(socket.x * 100).toFixed(4) : 50, x => updatePort(selected, { x: x / 100 }))}
        {field('Socket center Y (%)', socket ? +(socket.y * 100).toFixed(4) : 50, y => updatePort(selected, { y: y / 100 }))}
        {field('Socket width (%)', socket ? +(socket.width * 100).toFixed(4) : width, w => { setWidth(w); updatePort(selected, { width: w / 100 }); }, .1)}
        {field('Socket height (%)', socket ? +(socket.height * 100).toFixed(4) : height, h => { setHeight(h); updatePort(selected, { height: h / 100 }); }, .1)}
      </div>
      <section aria-label="Mapped port physical settings"><h3>Physical type for port {selected + displayStart}</h3>
        <PortMediaFields value={media[names[selected]] ?? { kind: 'copper' }} onChange={value => { setMedia(current => ({ ...current, [names[selected]]: value })); setReviewed(false); }}/>
        <button className="secondary-button" onClick={() => { const value = media[names[selected]] ?? { kind: 'copper' as const }; setMedia(Object.fromEntries(names.map(n => [n, { ...value }]))); setReviewed(false); }}>Apply this physical type to all mapped ports</button>
        <p className="note">Mixed copper and fiber ports are supported. Optical slots need an installed transceiver, connector, fiber mode, and strand count before connection. You can configure individual devices later in the Ports inspector.</p>
      </section>
      <div className="template-actions"><label><input type="checkbox" checked={advance} onChange={e => setAdvance(e.target.checked)}/>Advance after placing a port</label><button className="secondary-button" onClick={() => { setPorts(current => current.map((p, i) => i === selected ? null : p)); setSelectionPreview(new Map()); setReviewed(false); setPreviewing(false); }}>Clear this position</button><button className="secondary-button" disabled={ports.every(p => p === null)} onClick={() => { setPorts(current => current.map(() => null)); setSelectionPreview(new Map()); setSelected(0); setReviewed(false); setError(''); setPreviewing(false); }}>Clear all positions</button><strong>{mapped} / {names.length} ports mapped</strong></div>

      <p className="note">Place this template as new equipment to use its full rack height and port count. Excluded interfaces remain decorative; include and map uplinks to make them usable.</p>
      <label className="template-review"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>I checked every socket position and numbered interface against the image.</label>
      {initial && <p className="note">This template is used by {templateUsage(project, initial.id)} device(s) across all locations. Changing the starting number renumbers devices following the template. Individual range overrides are kept. Connections, VLANs, notes, and physical settings remain attached to the same sockets.</p>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="template-actions">{mapping && <button className="primary-button" disabled={!validRange || !reviewed || !name.trim() || mapped !== names.length || !names.length} onClick={save}>Save template</button>}{mapping && !initial && <button className="secondary-button" onClick={() => { setMapping(false); setReviewed(false); }}>Back to files</button>}<button className="secondary-button" onClick={onCancel}>Cancel</button></div>
  </section>;
}

export function TemplateLibraryPage({ project, onChange, onPlace }: { project: Project; onChange: (project: Project) => void; onPlace: (templateId: string) => void }) {
  const [editor, setEditor] = useState<{ initial?: EquipmentTemplate } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return <main className="configuration-workspace template-library">
    <ConfigurationNav page="templates"/>
    <section className="configuration-content"><div className="configuration-heading"><div><span className="eyebrow">CONFIGURATION</span><h1>Equipment templates</h1><p>Import device definitions and images, then map their ports.</p></div>{!editor && <button className="primary-button" onClick={() => { setEditor({}); setMessage(''); setError(''); }}>Import template</button>}</div>
      {message && <p role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
      {editor ? <TemplateEditor key={editor.initial?.id ?? 'new'} initial={editor.initial} project={project} onSave={next => { onChange(next); setEditor(null); setMessage('Template saved. Choose Place in rack to add equipment.'); }} onCancel={() => setEditor(null)}/> : <>
        <p className="note">Place new equipment from any saved template. New equipment inherits its template’s starting port number.</p>
        <div className="template-cards">{[...EQUIPMENT_TEMPLATES, ...(project.templates ?? [])].map(t => <article className="panel template-card" key={t.id}>
          <h2>{t.name}</h2><img src={t.imageSrc} alt={t.name}/><p>{t.heightU}U · {t.portCount} ports · Ports {t.portStart ?? 1}–{t.portCount - 1 + (t.portStart ?? 1)} · {t.kind === 'switch' ? 'Switch' : 'Patch panel'}</p><p>{t.source ? `Imported · ${templateUsage(project, t.id)} device(s)` : 'Bundled · NetBox Device Type Library'}</p>
          <button className="primary-button" aria-label={`Place ${t.name} in rack`} onClick={() => onPlace(t.id)}>Place in rack</button>
          {t.source && <div className="template-actions"><button className="secondary-button" aria-label={`Edit template ${t.name}`} onClick={() => { setEditor({ initial: t }); setMessage(''); }}>Edit port map</button><button className="secondary-button" aria-label={`Remove template ${t.name}`} disabled={templateUsage(project, t.id) > 0} title={templateUsage(project, t.id) ? 'This template is used by equipment and cannot be removed.' : 'Remove unused template'} onClick={() => { try { onChange(removeEquipmentTemplate(project, t.id)); setMessage('Unused template removed.'); } catch (e) { setError((e as Error).message); } }}>Remove</button></div>}
        </article>)}</div>
      </>}
    </section>
  </main>;
}
