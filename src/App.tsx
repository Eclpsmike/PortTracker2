import { useRackDragSelection } from './components/useRackDragSelection';
import { ViewFiltersPanel } from './components/ViewFiltersPanel';
import { EMPTY_VIEW_FILTERS, type ViewFilters, portMatchesFilters, cableMatchesFilters, locationOutlineColor, vlanOutlineColor } from './viewFilters';
import { FacilityLocationsPage } from './components/FacilityLocationsPage';
import { assignPortLocations, saveFacilityLocation, removeFacilityLocation } from './facilityLocations';
import { PortNumberingControl } from './components/PortNumberingControl';
import { equipmentStack, interfaceName, rackName, equipmentName, hasVerticalManagement, positionRacks, rackFootprint } from './model';
import { RenameCabinetDialog } from './components/RenameCabinetDialog';
import { AddRackDialog } from './components/AddRackDialog';
import { PortMediaControl } from './components/PortMediaControl';
import { defaultFiber, portMedium, fiberLabel, mediaLabel } from './media';
import { lazy, Suspense, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { type Cable, type Endpoint, type Layout, type Calibration, defaultCalibration, equipmentUnits, estimateCable, fixtureLayout, makeRack, sameEndpoint, vlanColor, resolveEndpoint, portVlan, assignPortVlan, assignPortVlans, endpointKey, patchPortDetails, setPatchPortDetails, updatePatchPortsDetails, removeRack, firstPortNumber, portNumbers, portIndex, getPortMedia, setPortsMedia, cableMediaError, setEquipmentPortStart } from './model';
import { rackSceneSize, TOP, UNIT } from './geometry';
import { Icon } from './components/Icon';
import { RemoveCabinetDialog } from './components/RemoveCabinetDialog';
import type { EquipmentAction } from './components/EquipmentDialog';
import { templatePort, equipmentTemplate } from './equipmentTemplates';
import { RackScene } from './components/RackScene';
import { EndpointPicker } from './components/EndpointPicker';
import { ConnectionEditor } from './components/ConnectionEditor';
import { PathDiagram } from './components/PathDiagram';
import { CalibrationEditor } from './components/CalibrationEditor';
import { LengthUnitSelect } from './components/LengthUnitSelect';
import { formatCableLengthValue, cableLengthUnitSymbol, type LengthUnit } from './units';
import { type Configuration } from './configuration';
import { type Project, type Closet, readProject, saveProject, projectLayout } from './project';
import { LocationsPage } from './components/LocationsPage';
import { TemplateLibraryPage } from './components/TemplateLibraryPage';
import { ConfigurationPages } from './components/ConfigurationPages';
import { BulkPatchPortDetailsControl } from './components/BulkPatchPortDetailsControl';
import { PatchPortDetailsControl } from './components/PatchPortDetailsControl';
import { PortVlanControl } from './components/PortVlanControl';
import { BulkPortVlanControl } from './components/BulkPortVlanControl';
import './styles.css';
const EquipmentDialog = lazy(() => import('./components/EquipmentDialog').then(module => ({ default: module.EquipmentDialog })));
const StackMembershipDialog = lazy(() => import('./components/StackMembershipDialog').then(module => ({ default: module.StackMembershipDialog })));
const DataViewPage = lazy(() => import('./components/DataViewPage').then(module => ({ default: module.DataViewPage })));
const FacilityPage = lazy(() => import('./components/FacilityPage').then(module => ({ default: module.FacilityPage })));
type Page = 'facility' | 'data' | 'facility-locations' | 'cabinets' | 'vlans' | 'stock' | 'locations' | 'templates';
function currentPage(): Page {
  return location.hash === '#/facility' ? 'facility' : location.hash === '#/data' ? 'data' : location.hash === '#/configuration/facility-locations' ? 'facility-locations' : location.hash === '#/configuration/templates' ? 'templates' : location.hash === '#/locations' ? 'locations' : location.hash === '#/configuration/vlans' ? 'vlans' : location.hash === '#/configuration/stock' ? 'stock' : 'cabinets';
}
type Tab = 'equipment' | 'ports' | 'connections';
type Selection = { kind: 'cable'; id: string } | { kind: 'port'; ep: Endpoint } | null;
const defaultPort = { rackId: 'CAB-A01', equipmentId: 'PP-A04', port: 18 };
export default function App() {
  const [initial] = useState(readProject);
  const [project, setProject] = useState(initial.project);
  const [blocked, setBlocked] = useState(initial.blocked);
  const [notice, setNotice] = useState(initial.notice);
  const [saveError, setSaveError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!blocked) setSaveError(saveProject(project) ? '' : 'Browser storage is unavailable. Changes are in memory only; export your project to keep them.');
  }, [project, blocked]);
  const active = project.locations.find(l => l.id === project.activeLocationId)!;
  function replaceProject(next: Project) { setProject(next); setBlocked(false); setNotice(''); setRevision(n => n + 1); }
  return <><CabinetWorkspace key={`${active.id}/${revision}`} project={project} active={active} setProject={setProject} onImport={replaceProject} storageNotice={saveError || notice} storageBlocked={blocked} onRecover={() => {
    if (window.confirm('Replace the unreadable saved project with the project currently shown? Export any recoverable data first.')) { setBlocked(false); setNotice(''); }
  }} onRetry={() => setSaveError(saveProject(project) ? '' : 'Browser storage is unavailable. Changes are in memory only; export your project to keep them.')}/></>;
}
function CabinetWorkspace({ project, active, setProject, onImport, storageNotice, storageBlocked, onRecover, onRetry }: {
  project: Project; active: Closet; setProject: Dispatch<SetStateAction<Project>>; onImport: (project: Project) => void;
  storageNotice: string; storageBlocked: boolean; onRecover: () => void; onRetry: () => void;
}) {
  const [page, setPage] = useState(currentPage);
  useEffect(() => { const onHashChange = () => setPage(currentPage()); window.addEventListener('hashchange', onHashChange); return () => window.removeEventListener('hashchange', onHashChange); }, []);
  const configuration = project.configuration;
  const vlans = configuration.vlans;
  const facilityLocations = configuration.facilityLocations ?? [];
  const [viewFilters, setViewFilters] = useState<ViewFilters>(EMPTY_VIEW_FILTERS);
  const clearViewFilters = () => setViewFilters(EMPTY_VIEW_FILTERS);
  const lengthUnit = project.preferences.lengthUnit;
  const setLengthUnit = (unit: LengthUnit) => setProject(current => ({ ...current, preferences: { ...current.preferences, lengthUnit: unit } }));
  const unitSymbol = cableLengthUnitSymbol(lengthUnit);
  const layout = projectLayout(project, active.id);
  function updateLocation(update: (location: Closet) => Closet) {
    setProject(current => ({ ...current, locations: current.locations.map(l => l.id === active.id ? update(l) : l) }));
  }
  const setLayout = (next: SetStateAction<Layout>) => updateLocation(l => {
    const value = typeof next === 'function' ? next({ ...l.layout, templates: project.templates ?? [] }) : next;
    const { templates: _catalog, ...saved } = value;
    return { ...l, layout: saved };
  });
  const setCalibration = (calibration: Calibration) => { const { fiberStock: _stock, ...saved } = calibration; updateLocation(l => ({ ...l, calibration: saved })); };
  const setRackGap = (rackGap: number) => updateLocation(l => ({ ...l, rackGap }));
  const firstRack = layout.racks.find(r => r.equipment.length);
  const firstPort = firstRack ? { rackId: firstRack.id, equipmentId: firstRack.equipment[0].id, port: firstPortNumber(firstRack.equipment[0]) } : defaultPort;
  const initialPort = layout.racks.some(r => r.id === defaultPort.rackId && r.equipment.some(e => e.id === defaultPort.equipmentId && portIndex(e, defaultPort.port) >= 0 && portIndex(e, defaultPort.port) < e.portCount)) ? defaultPort : firstPort;
  const [selection, setSelection] = useState<Selection>(() => { const cable = layout.cables.find(c => c.id === 'CR-0018') ?? layout.cables[0]; return cable ? { kind: 'cable', id: cable.id } : null; });
  const [tab, setTab] = useState<Tab>('connections');
  const [view, setView] = useState<'single' | 'multi'>('multi');
  const [singleRack, setSingleRack] = useState(layout.racks[0]?.id ?? '');
  const [multiIds, setMultiIds] = useState<string[]>(layout.racks.map(r => r.id));
  const [showCables, setShowCables] = useState(true), [showVlan, setShowVlan] = useState(true);
  const physicalCalibration = active.calibration, rackGap = active.rackGap;
  const calibration = { ...physicalCalibration, stockedLengthsM: configuration.stockedLengthsM, fiberStock: configuration.fiberStock };
  const [equipmentAction, setEquipmentAction] = useState<EquipmentAction | null>(null);
  const [stackEditor, setStackEditor] = useState<Endpoint | null>(null);
  const [renameCabinetOpen, setRenameCabinetOpen] = useState(false);
  const [addRackTemplate, setAddRackTemplate] = useState<boolean | null>(null);
  const [removeCabinetOpen, setRemoveCabinetOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [editor, setEditor] = useState<{ cable: Cable; isNew: boolean } | null>(null);
  const [tracing, setTracing] = useState(false);
  const [portBrowser, setPortBrowser] = useState<Endpoint>(initialPort);
  const [multiPortMode, setMultiPortMode] = useState(false);
  const [bulkPorts, setBulkPorts] = useState<number[]>([]);
  const rangeAnchor = useRef<number | null>(null);
  const bulkEndpoints = bulkPorts.map(port => ({ ...portBrowser, port }));
  const [toast, setToast] = useState('');
  const zoomKey = view === 'single' ? 'singleRackZoom' : 'rackZoom';
  const zoom = project.preferences[zoomKey];
  const maxZoom = view === 'single' ? 8 : 2;
  const setZoom = (value: number) => setProject(current => ({ ...current, preferences: { ...current.preferences, [zoomKey]: value } }));
  const canvas = useRef<HTMLDivElement>(null);
  const inspector = useRef<HTMLElement>(null);
  useEffect(() => { inspector.current?.scrollTo({ top: 0 }); }, [tab]);
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => { const observer = new ResizeObserver(([e]) => { if (e.contentRect.width > 0 && e.contentRect.height > 0) setViewport({ width: e.contentRect.width, height: e.contentRect.height }); }); if (canvas.current) observer.observe(canvas.current); return () => observer.disconnect(); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  const rackIds = view === 'single' ? layout.racks.filter(r => r.id === singleRack).map(r => r.id) : layout.racks.filter(r => multiIds.includes(r.id)).map(r => r.id);
  const size = rackSceneSize(layout, rackIds);
  const initialScale = viewport ? view === 'single'
    ? Math.max(.12, Math.min(viewport.width / size.width, maxZoom))
    : Math.max(.12, Math.min((viewport.width - 24) / size.width, (viewport.height - 24) / (TOP + 26 * UNIT), 1.15)) : 1;
  const scale = zoom ?? initialScale;
  const fitScale = viewport ? Math.max(.12, Math.min((viewport.width - 24) / size.width, (viewport.height - 24) / size.height, 2)) : scale;
  useEffect(() => {
    // Single-rack view fits the available width until the user chooses a zoom.
    if (view === 'multi' && zoom === undefined && viewport) setProject(current => current.preferences.rackZoom === undefined ? { ...current, preferences: { ...current.preferences, rackZoom: initialScale } } : current);
  }, [view, zoom, viewport, initialScale, setProject]);
  const selectedPort = selection?.kind === 'port' ? selection.ep : null;
  const selectedCable = selection?.kind === 'cable' ? layout.cables.find(c => c.id === selection.id) : selectedPort ? layout.cables.find(c => sameEndpoint(c.from, selectedPort) || sameEndpoint(c.to, selectedPort)) : undefined;
  const estimate = selectedCable ? estimateCable(layout, selectedCable, calibration) : null;
  const visibleCables = layout.cables.filter(c => rackIds.includes(c.from.rackId) && rackIds.includes(c.to.rackId) && cableMatchesFilters(layout, c, viewFilters));
  const hiddenSelected = selectedCable && (!showCables || !visibleCables.some(c => c.id === selectedCable.id));
  const browseEquipment = layout.racks.find(r => r.id === portBrowser.rackId)?.equipment.find(e => e.id === portBrowser.equipmentId);
  const totalPorts = layout.racks.reduce((sum, r) => sum + r.equipment.reduce((sum, e) => sum + e.portCount, 0), 0);
  function remapPortSelection(nextLayout: Layout) {
    const remap = (ep: Endpoint) => {
      const before = layout.racks.find(r => r.id === ep.rackId)?.equipment.find(e => e.id === ep.equipmentId);
      const after = nextLayout.racks.find(r => r.id === ep.rackId)?.equipment.find(e => e.id === ep.equipmentId);
      return before && after ? { ...ep, port: ep.port + firstPortNumber(after) - firstPortNumber(before) } : ep;
    };
    setPortBrowser(remap(portBrowser));
    if (selection?.kind === 'port') setSelection({ kind: 'port', ep: remap(selection.ep) });
    clearBulkSelection();
  }
  function updateTemplates(next: Project) { remapPortSelection(projectLayout(next, active.id)); setProject(next); }
  function changePortRange(start: number | null) {
    const next = setEquipmentPortStart(layout, portBrowser.rackId, portBrowser.equipmentId, start);
    remapPortSelection(next); setLayout(next); setToast('Port range updated. Connections and port data preserved.');
  }
  function selectCable(id: string) { clearBulkSelection(); setMultiPortMode(false); setSelection({ kind: 'cable', id }); setTab('connections'); setTracing(false); }
  function openInspectorTab(next: Tab) {
    if (next === 'ports' && selectedPort && (selectedPort.rackId !== portBrowser.rackId || selectedPort.equipmentId !== portBrowser.equipmentId)) {
      setSelection({ kind: 'port', ep: portBrowser });
    }
    setTab(next);
  }
  function clearBulkSelection() { setBulkPorts([]); rangeAnchor.current = null; }
  function browsePorts(ep: Endpoint) {
    clearBulkSelection(); setPortBrowser(ep); setSelection(multiPortMode ? null : { kind: 'port', ep });
  }
  function selectPort(ep: Endpoint, range = false) {
    if (multiPortMode) {
      const sameDevice = ep.rackId === portBrowser.rackId && ep.equipmentId === portBrowser.equipmentId;
      const anchor = sameDevice ? rangeAnchor.current : null;
      setBulkPorts(current => {
        if (!sameDevice) return [ep.port];
        if (range && anchor !== null) {
          const ports = Array.from({ length: Math.abs(ep.port - anchor) + 1 }, (_, i) => Math.min(ep.port, anchor) + i);
          return [...new Set([...current, ...ports])].sort((a, b) => a - b);
        }
        return current.includes(ep.port) ? current.filter(port => port !== ep.port) : [...current, ep.port].sort((a, b) => a - b);
      });
      rangeAnchor.current = ep.port;
      setSelection(null);
    } else setSelection({ kind: 'port', ep });
    setPortBrowser(ep); setTab('ports'); setTracing(false);
  }
  function selectRackPorts(endpoints: Endpoint[], additive: boolean, preferredDevice?: string) {
    const target = additive && multiPortMode && bulkPorts.length ? portBrowser : endpoints.find(ep => `${ep.rackId}/${ep.equipmentId}` === preferredDevice) ?? endpoints[0];
    const matching = target ? endpoints.filter(ep => ep.rackId === target.rackId && ep.equipmentId === target.equipmentId) : [];
    const keep = additive && multiPortMode && target?.rackId === portBrowser.rackId && target.equipmentId === portBrowser.equipmentId;
    setBulkPorts([...new Set([...(keep ? bulkPorts : []), ...matching.map(ep => ep.port)])].sort((a, b) => a - b));
    if (target) setPortBrowser(target);
    setMultiPortMode(true); setSelection(null); setTab('ports'); setTracing(false); rangeAnchor.current = null;
    if (matching.length !== endpoints.length) setToast(`Selection is limited to ${target ? equipmentName(layout, target) : 'one device'}. Drag over one device at a time.`);
  }
  const rackDrag = useRackDragSelection({ layout, rackIds, touchEnabled: multiPortMode, onSelect: selectRackPorts });
  function changeBulkPortVlan(vlan: number | null) {
    if (!bulkEndpoints.length) return;
    setLayout(current => assignPortVlans(current, bulkEndpoints, vlan, vlans));
    setToast(vlan === null ? `VLAN cleared from ${bulkEndpoints.length} ${bulkEndpoints.length === 1 ? 'port' : 'ports'}.` : `${bulkEndpoints.length} ${bulkEndpoints.length === 1 ? 'port' : 'ports'} assigned to VLAN ${vlan}.`);
  }
  function revealCable(c: Cable) { setShowCables(true); clearViewFilters(); if (c.from.rackId !== c.to.rackId) { setView('multi'); setMultiIds([c.from.rackId, c.to.rackId]); } else { setSingleRack(c.from.rackId); setView('single'); } }
  function traceCable() { if (!selectedCable) return; if (hiddenSelected) revealCable(selectedCable); setTracing(v => !v); }
  function newConnection() {
    if (!vlans.length) { location.hash = '/configuration/vlans'; setToast('Add a VLAN before creating a connection.'); return; }
    const endpoints = layout.racks.flatMap(r => r.equipment.flatMap(e => portNumbers(e).map(port => ({ rackId: r.id, equipmentId: e.id, port }))));
    const available = endpoints.filter(ep => !layout.cables.some(c => sameEndpoint(c.from, ep) || sameEndpoint(c.to, ep)));
    const from = selectedPort && available.some(e => sameEndpoint(e, selectedPort)) ? selectedPort : available[0];
    const compatible = from ? available.filter(e => !sameEndpoint(e, from) && portMedium(getPortMedia(layout, e)) === portMedium(getPortMedia(layout, from))) : [];
    const to = compatible.find(e => e.rackId !== from?.rackId) ?? compatible[0] ?? available.find(e => from && !sameEndpoint(e, from));
    if (!from || !to) { setToast('No free port pair is available.'); return; }
    let n = 1; while (layout.cables.some(c => c.id === `NEW-${String(n).padStart(4, '0')}`)) n++;
    const sourceMedia = getPortMedia(layout, from), targetMedia = getPortMedia(layout, to);
    const fiber = { ...defaultFiber(), ...(sourceMedia.mode && { mode: sourceMedia.mode }), ...(sourceMedia.strands && { strands: sourceMedia.strands }), ...(sourceMedia.connector && sourceMedia.connector !== 'RJ45' && { fromConnector: sourceMedia.connector }), ...(targetMedia.connector && targetMedia.connector !== 'RJ45' && { toConnector: targetMedia.connector }) };
    const fallbackVlan = viewFilters.vlans.find(id => id !== null) ?? vlans.find(v => v.id === 30)?.id ?? vlans[0].id;
    setEditor({ isNew: true, cable: { ...(portMedium(sourceMedia) === 'fiber' && { medium: 'fiber' as const, fiber }), id: `NEW-${String(n).padStart(4, '0')}`, from, to, vlan: portVlan(layout, from) ?? portVlan(layout, to) ?? fallbackVlan, jacket: portMedium(sourceMedia) === 'fiber' ? '#f3cf19' : '#159de7' } });
  }
  function changePortVlan(endpoint: Endpoint, vlan: number | null) {
    setLayout(current => assignPortVlan(current, endpoint, vlan, vlans));
    setToast(vlan === null ? 'Port VLAN cleared.' : `Port assigned to VLAN ${vlan}.`);
  }
  function exportLayout() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = 'porttracker-project.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setToast('Project exported.');
  }
  function changeConfiguration(next: Configuration, message: string) {
    setProject(current => ({ ...current, configuration: next }));
    setViewFilters(current => ({ ...current, vlans: current.vlans.filter(id => id === null || next.vlans.some(v => v.id === id)) }));
    setToast(message);
  }
  function openLocation(id: string) {
    setProject(current => ({ ...current, activeLocationId: id }));
    location.hash = '/cabinets';
  }
  function addTemplateRack() { setAddRackTemplate(true); }
  function openEmptyRack() { setAddRackTemplate(false); }
  function addRack(template: boolean, heightU: number, verticalManagement: boolean) {
    if (layout.racks.length >= 100) { setToast('This distribution frame already has 100 racks.'); return; }
    let index = layout.racks.length;
    while (layout.racks.some(r => r.id === makeRack(index).id)) index++;
    const rack = makeRack(index, heightU); rack.verticalManagement = verticalManagement; if (!template) rack.equipment = []; rack.positionM = layout.racks.length ? Math.max(...layout.racks.map(r => r.positionM + rackFootprint(r, calibration))) + rackGap : 0;
    setLayout({ ...layout, racks: [...layout.racks, rack] }); setMultiIds([...multiIds, rack.id]); setView('multi'); setSingleRack(rack.id);
    if (!browseEquipment && rack.equipment.length) setPortBrowser({ rackId: rack.id, equipmentId: rack.equipment[0].id, port: firstPortNumber(rack.equipment[0]) });
    setAddRackTemplate(null); setToast(template ? `${rack.label} added with the standard equipment template.` : `${rack.label} added empty. Use Add equipment to populate it.`);
  }
  function deleteCabinet(rackId: string) {
    const next = removeRack(layout, rackId);
    setLayout(current => removeRack(current, rackId));
    if ((selection?.kind === 'port' && selection.ep.rackId === rackId) || (selection?.kind === 'cable' && !next.cables.some(c => c.id === selection.id))) setSelection(null);
    if (portBrowser.rackId === rackId) {
      const fallback = next.racks.find(r => r.equipment.length);
      setPortBrowser(fallback ? { rackId: fallback.id, equipmentId: fallback.equipment[0].id, port: firstPortNumber(fallback.equipment[0]) } : defaultPort);
    }
    if (singleRack === rackId) setSingleRack(next.racks[0]?.id ?? '');
    const remainingVisible = multiIds.filter(id => id !== rackId);
    setMultiIds(remainingVisible.length ? remainingVisible : next.racks.slice(0, 1).map(r => r.id));
    clearBulkSelection(); setMultiPortMode(false); setTracing(false); clearViewFilters();
    setRemoveCabinetOpen(false); setToast(`${rackName(layout, rackId)} removed from ${active.name}.`);
  }
  function finishEquipmentChange(next: Layout, selected: Endpoint | null, message: string) {
    setLayout(next); setEquipmentAction(null); clearBulkSelection(); setMultiPortMode(false); setTracing(false); clearViewFilters(); setTab('equipment');
    const fallbackRack = next.racks.find(r => r.equipment.length);
    const endpoint = selected ?? (fallbackRack ? { rackId: fallbackRack.id, equipmentId: fallbackRack.equipment[0].id, port: firstPortNumber(fallbackRack.equipment[0]) } : null);
    setPortBrowser(endpoint ?? defaultPort);
    // Equipment management must not replace the cable being inspected with the device's first port.
    setSelection(selectedCable && next.cables.some(c => c.id === selectedCable.id) ? { kind: 'cable', id: selectedCable.id } : selected ? { kind: 'port', ep: selected } : null);
    if (selected) { setView('multi'); setMultiIds([...new Set([...rackIds, selected.rackId])]); setSingleRack(selected.rackId); }
    setToast(message);
  }
  const buildingName = project.buildings.find(b => b.id === active.buildingId)?.name ?? '';
  const allCables = project.locations.flatMap(l => l.layout.cables);
  const allPortVlans = Object.fromEntries(project.locations.flatMap(l => Object.entries(l.layout.portVlans ?? {}).map(([key, value]) => [`${l.id}/${key}`, value])));
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Icon name="network" size={29}/></span><div><strong>PortTracker</strong><span>Network Rack Manager</span></div></div><nav aria-label="Workspace"><a href="#/locations" className={page === 'locations' ? 'nav-active' : ''} aria-current={page === 'locations' ? 'page' : undefined}><Icon name="network"/>Distribution Frames</a><a href="#/cabinets" className={page === 'cabinets' ? 'nav-active' : ''} aria-current={page === 'cabinets' ? 'page' : undefined}><Icon name="rack"/>Racks</a><button onClick={() => { location.hash = '/cabinets'; openInspectorTab('ports'); inspector.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}><Icon name="ports"/>Ports</button><button onClick={() => { location.hash = '/cabinets'; openInspectorTab('connections'); inspector.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }}><Icon name="cable"/>Connections</button><a href="#/facility" className={page === 'facility' ? 'nav-active' : ''} aria-current={page === 'facility' ? 'page' : undefined}><Icon name="layers"/>Facility</a><a href="#/data" className={page === 'data' ? 'nav-active' : ''} aria-current={page === 'data' ? 'page' : undefined}><Icon name="table"/>Data view</a><a href="#/configuration/vlans" className={page === 'vlans' || page === 'stock' || page === 'templates' || page === 'facility-locations' ? 'nav-active' : ''} aria-current={page === 'vlans' || page === 'stock' || page === 'templates' || page === 'facility-locations' ? 'page' : undefined}><Icon name="settings"/>Configuration</a></nav><span className="demo-tag"><span/>LOCAL PROJECT</span>{page !== 'facility' && <button className="header-export" aria-label="Export" onClick={exportLayout}><Icon name="download"/><span>Export</span></button>}</header>
    {storageNotice && <div className="project-storage-notice configuration-warning" role="status"><span>{storageNotice}</span>{storageBlocked ? <><a href="#/locations">Import a backup</a><button className="secondary-button" onClick={onRecover}>Start new project</button></> : <button className="secondary-button" onClick={onRetry}>Retry save</button>}</div>}
    <div className="cabinet-page" hidden={page !== 'cabinets'}>
    <div className="toolbar"><div className="breadcrumb"><span>Racks</span><Icon name="chevron" size={13}/><label className="location-selector"><span className="sr-only">Active distribution frame</span><select aria-label="Active distribution frame" value={active.id} onChange={e => openLocation(e.target.value)}>{project.locations.filter(l => !l.archived).map(l => <option key={l.id} value={l.id}>{project.buildings.find(b => b.id === l.buildingId)?.name} / {l.name} ({l.type})</option>)}</select></label></div><div className="view-controls"><div className="segmented" aria-label="Rack view">{([['single', 'Single rack'], ['multi', 'Multiple racks']] as const).map(([key, label]) => <button key={key} aria-pressed={view === key} className={view === key ? 'active' : ''} onClick={() => { setView(key); }}>{label}</button>)}</div><div className="zoom-control"><button aria-label="Zoom out" disabled={scale <= .12} onClick={() => setZoom(Math.max(.12, scale - .15))}><Icon name="minus" size={15}/></button><span>{Math.round(scale * 100)}%</span><button aria-label="Zoom in" disabled={scale >= maxZoom} onClick={() => setZoom(Math.min(maxZoom, scale + .15))}><Icon name="plus" size={15}/></button></div></div><div className="display-controls"><button className="fit-button" title="Fit all visible racks" onClick={() => setZoom(fitScale)}><Icon name="fit" size={16}/>Fit</button></div></div>
    <main className="workspace">
      <aside className="left-sidebar" aria-label="Rack summary and filters">
        <section className="panel summary-panel"><div className="summary-title"><div className="cabinet-icon"><Icon name="rack" size={34}/></div><div><h1>{active.name}</h1><p>{buildingName}{active.room && ` · ${active.room}`}</p><span className="status-pill"><span/>{active.type} / local</span></div></div><div className="summary-stats">{layout.racks.map(r => <div key={r.id}><span>{r.label}</span><b>{r.heightU}U</b></div>)}<div><span>Patch panels</span><b>{layout.racks.flatMap(r => r.equipment).filter(e => e.kind === 'patch-panel').length} <small>({layout.racks.flatMap(r => r.equipment).filter(e => e.kind === 'patch-panel').reduce((n, e) => n + e.portCount, 0)} ports)</small></b></div><div><span>Switches</span><b>{layout.racks.flatMap(r => r.equipment).filter(e => e.kind === 'switch').length} <small>({layout.racks.flatMap(r => r.equipment).filter(e => e.kind === 'switch').reduce((n, e) => n + e.portCount, 0)} ports)</small></b></div></div><div className="occupancy"><div><span>Connected ports</span><b>{layout.cables.length * 2} <small>/ {totalPorts.toLocaleString()}</small></b></div><div className="progress-track"><span style={{ width: `${layout.cables.length * 2 / (totalPorts || 1) * 100}%` }}/></div><span>{layout.cables.length} cables · {Math.round(layout.cables.length * 2 / (totalPorts || 1) * 100)}% occupied</span></div></section>
        <ViewFiltersPanel layout={layout} vlans={vlans} locations={facilityLocations} value={viewFilters} onChange={setViewFilters} onAddConnection={newConnection} showCables={showCables} showVlan={showVlan} onCables={setShowCables} onVlanColors={setShowVlan}/>
        <p className="local-note"><Icon name="info" size={14}/>{storageNotice ? 'Check the project storage notice above.' : 'Project saved in this browser.'}<br/>Export a backup to keep a copy.</p>
      </aside>
      <section className="center-column" aria-label="Rack workspace">
        <div className="canvas-heading"><div><span className="eyebrow">RACK ELEVATION</span><span>{rackIds.length} {rackIds.length === 1 ? 'rack' : 'racks'} · Front view</span></div><div className="cabinet-actions"><button className="text-button" onClick={openEmptyRack}><Icon name="plus" size={14}/>Add empty rack</button><button className="text-button" disabled={!layout.racks.length} onClick={() => setEquipmentAction({ kind: 'add' })}><Icon name="plus" size={14}/>Add equipment</button><button className="text-button" disabled={!layout.racks.length} onClick={() => setRenameCabinetOpen(true)}><Icon name="edit" size={14}/>Rack settings</button><button className="text-button" disabled={!layout.racks.length} onClick={() => setRemoveCabinetOpen(true)}><Icon name="trash" size={14}/>Remove rack</button><span className="canvas-live"><span/>Interactive</span></div></div>
        {view === 'single' && <div className="rack-options"><label>Visible rack <select aria-label="Visible rack" value={singleRack} onChange={ev => setSingleRack(ev.target.value)}>{layout.racks.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label></div>}
        {view === 'multi' && layout.racks.length > 0 && <div className="rack-options">{layout.racks.map(r => <label key={r.id}><input type="checkbox" aria-label={r.label} checked={multiIds.includes(r.id)} disabled={multiIds.length === 1 && multiIds.includes(r.id)} onChange={ev => setMultiIds(ev.target.checked ? [...multiIds, r.id] : multiIds.filter(id => id !== r.id))}/>{r.label}</label>)}<button className="text-button" onClick={addTemplateRack}><Icon name="plus" size={14}/>Add template rack</button></div>}
        <div className={`rack-viewport${multiPortMode ? ' port-selection-mode' : ''}`} ref={canvas} {...rackDrag.handlers} tabIndex={0} aria-label="Rack view">
          {!layout.racks.length && <div className="empty-location"><h2>No racks in {active.name}</h2><p>Add an empty rack using the toolbar, or start with the standard patch-panel and switch layout.</p><button className="primary-button" onClick={addTemplateRack}>Add template rack</button></div>}
          {layout.racks.length > 0 && <div className="scene-frame" style={{ width: size.width * scale, height: size.height * scale }}><div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: size.width, height: size.height }}><RackScene selectionBox={rackDrag.box} selectedPorts={multiPortMode && tab === 'ports' ? bulkEndpoints : []} filters={viewFilters} facilityLocations={facilityLocations} vlans={vlans} layout={layout} rackIds={rackIds} cables={visibleCables} selectedCable={selectedCable} selectedPort={selectedPort} showCables={showCables} showVlan={showVlan} tracing={tracing} onPort={selectPort} onCable={selectCable}/></div></div>}
        </div>
        <div className="canvas-footer"><span><span className="tiny-dot"/>{showCables ? visibleCables.length : 0} cables shown<span className="footer-divider">|</span>{showVlan ? 'VLAN overlays' : 'Cable jacket colors'}</span><span>Click to inspect · Drag over ports to select</span></div>
        {hiddenSelected && <div className="visibility-notice"><Icon name="info" size={15}/><span>Selected cable is hidden by the current view.</span><button onClick={() => revealCable(selectedCable)}>Show cable</button></div>}
      </section>
      <aside className="right-sidebar" ref={inspector} aria-label="Connection inspector">
        <div className="inspector-tabs" role="tablist" aria-label="Inspector">{([['equipment', 'rack', 'Equipment'], ['ports', 'ports', 'Ports'], ['connections', 'cable', 'Connections']] as const).map(([key, icon, label]) => <button role="tab" aria-selected={tab === key} aria-controls={`panel-${key}`} id={`tab-${key}`} key={key} className={tab === key ? 'active' : ''} onClick={() => openInspectorTab(key)}><Icon name={icon} size={16}/>{label}</button>)}</div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="inspector-body">
          {tab === 'equipment' && <section className="panel equipment-manager">
            <h2><Icon name="rack"/>Rack equipment</h2>
            <div className="panel-content">
              <button className="primary-button full-width" disabled={!layout.racks.length} onClick={() => setEquipmentAction({ kind: 'add' })}><Icon name="plus"/>Add equipment from template</button>
              {!layout.racks.length && <><p>Add a rack before placing equipment.</p><button className="secondary-button" onClick={openEmptyRack}>Add a rack</button></>}
              {browseEquipment ? <>
                <EndpointPicker label="Manage" layout={layout} value={portBrowser} ports={false} onChange={ep => { clearBulkSelection(); setMultiPortMode(false); setPortBrowser(ep); setTracing(false); }}/>
                <p className="note">{browseEquipment.label} · {equipmentUnits(browseEquipment)} · {browseEquipment.portCount} ports</p>
                <p className="note stack-membership-summary">{equipmentStack(layout, browseEquipment)?.name}{browseEquipment.stack ? ` · Member ${browseEquipment.stack.member}` : ''}</p>
                <div className="equipment-actions">{browseEquipment.kind === 'switch' && <button className="secondary-button" onClick={() => setStackEditor(portBrowser)}>Stack / Virtual Chassis</button>}<button className="secondary-button" onClick={() => setEquipmentAction({ kind: 'move', endpoint: portBrowser })}>Move equipment</button><button className="secondary-button" onClick={() => setEquipmentAction({ kind: 'remove', endpoint: portBrowser })}>Remove equipment</button></div><PortNumberingControl key={`numbering/${portBrowser.rackId}/${portBrowser.equipmentId}/${browseEquipment.portStart}/${browseEquipment.portStartOverride}`} equipment={browseEquipment} templateStart={equipmentTemplate(browseEquipment, layout.templates)?.portStart ?? 1} onApply={changePortRange}/>
                <button className="secondary-button full-width" onClick={() => { setMultiPortMode(false); clearBulkSelection(); setSelection({ kind: 'port', ep: portBrowser }); setTab('ports'); }}>Manage ports<Icon name="arrow" size={16}/></button>
              </> : <p>No equipment in this distribution frame. Add equipment from a template to get started.</p>}
            </div>
          </section>}
          {tab === 'connections' && <>
            <section className="panel connection-panel"><div className="connection-heading"><Icon name={selectedCable ? 'cable' : 'rack'} size={25}/><h2>{selectedCable ? estimate?.cross ? 'Cross-rack connection' : 'Rack connection' : 'Rack overview'}</h2>{selectedCable && <span className="status-pill"><span/>Active</span>}</div>
              {selectedCable && estimate ? <>{cableMediaError(layout, selectedCable) && <p className="form-error" role="status">{cableMediaError(layout, selectedCable)}</p>}<div className="connection-id">{selectedCable.id}<span>CABLE RECORD</span></div><dl className="connection-details"><div><dt>From</dt><dd>{rackName(layout, selectedCable.from.rackId)}<br/><strong>{equipmentName(layout, selectedCable.from)} / Port {selectedCable.from.port}</strong><small className="connection-interface">{interfaceName(layout, resolveEndpoint(layout, selectedCable.from).equipment, selectedCable.from.port)}</small></dd></div><div><dt>To</dt><dd>{rackName(layout, selectedCable.to.rackId)}<br/><strong>{equipmentName(layout, selectedCable.to)} / Port {selectedCable.to.port}</strong><small className="connection-interface">{interfaceName(layout, resolveEndpoint(layout, selectedCable.to).equipment, selectedCable.to.port)}</small></dd></div><div><dt>VLAN</dt><dd><span className="swatch" style={{ background: vlanColor(selectedCable.vlan, vlans) }}/>{selectedCable.vlan} — {vlans.find(v => v.id === selectedCable.vlan)?.name}</dd></div><div><dt>Medium</dt><dd>{selectedCable.medium === 'fiber' ? `Fiber · ${fiberLabel(selectedCable.fiber!)}` : 'Copper'}</dd></div><div><dt>Jacket</dt><dd><span className="swatch" style={{ background: selectedCable.jacket }}/>Physical cable color</dd></div><div><dt>Route</dt><dd>{estimate.overhead ? `${estimate.sides.from} → overhead → ${estimate.sides.to}` : `${estimate.sides.from} ${hasVerticalManagement(resolveEndpoint(layout, selectedCable.from).rack) ? 'vertical manager' : 'rack side'}`}</dd></div></dl><LengthUnitSelect value={lengthUnit} onChange={setLengthUnit} imperialSymbol="ft"/><div className="estimate-summary"><div><span>ESTIMATED LENGTH</span><strong>{formatCableLengthValue(estimate.requiredM, lengthUnit)} <small>{unitSymbol}</small></strong></div><div><a className="stock-config-link" href="#/configuration/stock">STOCK LENGTH <Icon name="settings" size={10}/></a><strong>{estimate.recommendedM === null ? 'No stock match' : formatCableLengthValue(estimate.recommendedM, lengthUnit)} <small>{estimate.recommendedM === null ? '' : unitSymbol}</small></strong></div></div><p className="estimate-note"><Icon name="info" size={13}/>Illustrative · example calibration</p></> : <div className="panel-content"><p>Select a port or cable to inspect its connection.</p><button className="secondary-button" onClick={() => setTab('ports')}><Icon name="ports"/>Browse ports</button></div>}
            </section>
            {selectedCable && <section className="panel"><h2>Path visualization<span className="heading-hint">{estimate?.cross ? 'Cross-rack' : 'Same rack'}</span></h2><PathDiagram vlans={vlans} cable={selectedCable} layout={layout} showVlan={showVlan} tracing={tracing}/><div className="path-caption"><span>{equipmentName(layout, selectedCable.from)}:{selectedCable.from.port}</span><Icon name="arrow" size={14}/><span>{equipmentName(layout, selectedCable.to)}:{selectedCable.to.port}</span></div></section>}
            <section className="panel"><h2>Connection actions</h2><div className="action-list"><button onClick={newConnection}><Icon name="plus"/>New connection<Icon name="chevron" size={14}/></button><button disabled={!selectedCable} onClick={traceCable}><Icon name="search"/>{tracing ? 'Stop tracing' : 'Trace cable'}<Icon name="chevron" size={14}/></button><button disabled={!selectedCable} onClick={() => selectedCable && setEditor({ cable: selectedCable, isNew: false })}><Icon name="edit"/>Edit connection<Icon name="chevron" size={14}/></button><button onClick={() => setCalibrationOpen(true)}><Icon name="settings"/>Length calibration<Icon name="chevron" size={14}/></button><button disabled={!selection} onClick={() => { setSelection(null); setTracing(false); }}><Icon name="close"/>Clear selection<Icon name="chevron" size={14}/></button></div></section>
            {estimate && <details className="length-breakdown"><summary>How this length is calculated</summary>{Object.entries(estimate.segments).map(([label, value]) => <div key={label}><span>{label}</span><b>{formatCableLengthValue(value, lengthUnit)} {unitSymbol}</b></div>)}<p>Physical fixture measurements; independent of the drawing scale. Verify on site.</p></details>}
          </>}
          {tab === 'ports' && !browseEquipment && <section className="panel panel-content"><p>Add a template rack to start managing ports.</p><button className="primary-button" onClick={addTemplateRack}>Add template rack</button></section>}
          {tab === 'ports' && !browseEquipment && <section className="panel"><h2>No equipment to browse</h2><div className="panel-content"><p>Add a rack and place equipment from a saved template to get started.</p><button className="primary-button" disabled={!layout.racks.length} onClick={() => setEquipmentAction({ kind: 'add' })}>Add equipment from template</button></div></section>}
          {tab === 'ports' && browseEquipment && <section className="panel port-browser"><h2><Icon name="ports"/>Port inspector</h2><div className="panel-content">{!multiPortMode && selectedPort && <div className="selected-port-info"><span className="eyebrow">SELECTED PORT</span><strong>{equipmentName(layout, selectedPort)} / Port {selectedPort.port}</strong>{equipmentName(layout, selectedPort) !== selectedPort.equipmentId && <span>Equipment ID: {selectedPort.equipmentId}</span>}{interfaceName(layout, resolveEndpoint(layout, selectedPort).equipment, selectedPort.port) && <span>{interfaceName(layout, resolveEndpoint(layout, selectedPort).equipment, selectedPort.port)} · {templatePort(resolveEndpoint(layout, selectedPort).equipment, selectedPort.port, layout.templates)?.interfaceType}</span>}<span>{rackName(layout, selectedPort.rackId)}{resolveEndpoint(layout, selectedPort).equipment.firstNumber && !resolveEndpoint(layout, selectedPort).equipment.portStartOverride && firstPortNumber(resolveEndpoint(layout, selectedPort).equipment) === 1 ? ` · Global port ${resolveEndpoint(layout, selectedPort).equipment.firstNumber! + portIndex(resolveEndpoint(layout, selectedPort).equipment, selectedPort.port)}` : ''}</span></div>}<p className="note">Choose a device, then select a port. Every port is available here at a larger touch target.</p><EndpointPicker label="Browse" layout={layout} value={portBrowser} ports={false} onChange={browsePorts}/>
            <div className="port-selection-tools"><label><input type="checkbox" checked={multiPortMode} onChange={event => { setMultiPortMode(event.target.checked); clearBulkSelection(); setSelection(null); setTracing(false); }}/>Select multiple ports</label>
              {multiPortMode && <><div className="port-selection-actions"><button className="secondary-button" onClick={() => { setBulkPorts(portNumbers(browseEquipment)); rangeAnchor.current = null; }}>Select all {browseEquipment.portCount} ports</button><button className="text-button" disabled={!bulkPorts.length} onClick={clearBulkSelection}>Clear selection</button></div><p className="note">Tap ports to toggle selection. Drag a box over rack ports; Shift-drag adds ports. Shift-click selects a range in the grid. Selection is limited to this device.</p><strong className="bulk-port-count" aria-live="polite">{bulkPorts.length} {bulkPorts.length === 1 ? 'port' : 'ports'} selected</strong></>}
            </div><div className="port-grid">{portNumbers(browseEquipment).map(port => { const ep = { ...portBrowser, port }; const c = layout.cables.find(c => sameEndpoint(c.from, ep) || sameEndpoint(c.to, ep)); const active = multiPortMode ? bulkPorts.includes(ep.port) : selectedPort && sameEndpoint(ep, selectedPort); const assignedVlan = portVlan(layout, ep); const details = patchPortDetails(layout, ep); const documented = !!(details.facilityLocation || details.notes); const matches = portMatchesFilters(layout, ep, viewFilters); const locationColor = locationOutlineColor(layout, ep, viewFilters, facilityLocations); const vlanColorValue = showVlan ? vlanOutlineColor(layout, ep, viewFilters, vlans) : null; return <button key={port} aria-label={`Port ${port}, ${c ? 'connected' : 'available'}`} aria-pressed={!!active} data-grid-port={endpointKey(ep)} data-vlan={assignedVlan ?? undefined} title={[mediaLabel(getPortMedia(layout, ep)), interfaceName(layout, browseEquipment, ep.port), templatePort(browseEquipment, ep.port, layout.templates)?.interfaceType, assignedVlan === null ? 'No port VLAN assigned' : `Port VLAN ${assignedVlan}`, details.facilityLocation, details.notes ? 'Has port notes' : ''].filter(Boolean).join(' · ')} className={`${c ? 'connected' : ''} ${active ? 'active' : ''} ${(viewFilters.vlans.length + viewFilters.locations.length) > 0 && !matches && !active ? 'vlan-muted' : ''}`} style={{ ...(locationColor && { borderColor: locationColor }), ...(vlanColorValue && { borderBottomColor: vlanColorValue }) }} onClick={event => selectPort(ep, event.shiftKey)}>{port}{documented && <span className="port-info-marker" aria-hidden="true"><Icon name="info" size={10}/></span>}</button>; })}</div><p className="port-key"><span className="tiny-dot"/>{viewFilters.locations.length ? 'Colored box = location · bottom edge = selected VLAN' : 'Colored edge = selected VLAN'} · dot = cable · ⓘ = port details</p>{multiPortMode && bulkEndpoints.length > 0 && <PortMediaControl key={`media/${endpointKey(portBrowser)}/${bulkPorts.join(',')}`} initial={getPortMedia(layout, bulkEndpoints[0])} count={bulkEndpoints.length} onApply={media => setLayout(setPortsMedia(layout, bulkEndpoints, media))}/>}{multiPortMode && <BulkPatchPortDetailsControl locations={facilityLocations} notesEnabled={browseEquipment.kind === 'patch-panel'} key={`${portBrowser.rackId}/${portBrowser.equipmentId}/${bulkPorts.join(',')}`} layout={layout} endpoints={bulkEndpoints} onApply={changes => { setLayout(current => { const next = changes.facilityLocation === undefined ? current : assignPortLocations(current, bulkEndpoints, changes.facilityLocation, facilityLocations); return changes.notes === undefined ? next : updatePatchPortsDetails(next, bulkEndpoints, { notes: changes.notes }); }); setToast(`Details updated for ${bulkEndpoints.length} ${bulkEndpoints.length === 1 ? 'port' : 'ports'}.`); }}/>}{multiPortMode && <BulkPortVlanControl key={`${portBrowser.rackId}/${portBrowser.equipmentId}`} layout={layout} endpoints={bulkEndpoints} vlans={vlans} onApply={changeBulkPortVlan}/>}{!multiPortMode && selectedPort && <div className="selected-port-controls">{<PatchPortDetailsControl locations={facilityLocations} notesEnabled={resolveEndpoint(layout, selectedPort).equipment.kind === 'patch-panel'} value={patchPortDetails(layout, selectedPort)} onChange={details => setLayout(current => { const next = assignPortLocations(current, [selectedPort], details.facilityLocation, facilityLocations); return resolveEndpoint(current, selectedPort).equipment.kind === 'patch-panel' ? setPatchPortDetails(next, selectedPort, details) : next; })}/>}
            <PortMediaControl key={`media/${endpointKey(selectedPort)}`} initial={getPortMedia(layout, selectedPort)} count={1} onApply={media => setLayout(setPortsMedia(layout, [selectedPort], media))}/><PortVlanControl layout={layout} endpoint={selectedPort} vlans={vlans} cable={selectedCable} onChange={vlan => changePortVlan(selectedPort, vlan)}/>{selectedCable ? <><p>Connected via <b>{selectedCable.id}</b></p><button className="primary-button full-width" onClick={() => selectCable(selectedCable.id)}>View connection<Icon name="arrow" size={16}/></button></> : <><p className="available-text">Available · no cable assigned</p><button className="primary-button full-width" onClick={newConnection}><Icon name="plus"/>Connect this port</button></>}</div>}</div></section>}

        </div>
      </aside>
    </main>
    </div>
    {page === 'facility' && <Suspense fallback={<main className="facility-loading" role="status">Loading Facility…</main>}><FacilityPage key={project.id} project={project}/></Suspense>}
    {page === 'data' && <Suspense fallback={<main className="data-page" role="status">Loading data view…</main>}><DataViewPage project={project} onUnit={setLengthUnit}/></Suspense>}
    {page === 'locations' && <LocationsPage project={project} onChange={setProject} onOpen={openLocation} onImport={onImport} onExport={exportLayout}/>}
    {page === 'templates' && <TemplateLibraryPage project={project} onChange={updateTemplates} onPlace={templateId => { location.hash = '/cabinets'; setEquipmentAction({ kind: 'add', templateId }); }}/>}
    {page === 'facility-locations' && <FacilityLocationsPage project={project} onSave={(value, previousName) => { setProject(current => saveFacilityLocation(current, value, previousName)); if (previousName !== undefined) setViewFilters(current => ({ ...current, locations: current.locations.map(name => name === previousName ? value.name.trim() : name) })); setToast('Facility location saved.'); }} onRemove={name => { setProject(current => removeFacilityLocation(current, name)); setViewFilters(current => ({ ...current, locations: current.locations.filter(item => item !== name) })); setToast('Facility location removed.'); }}/ >}
    {(page === 'vlans' || page === 'stock') && <ConfigurationPages key={page} page={page} configuration={configuration} cables={allCables} portVlans={allPortVlans} unit={lengthUnit} onUnit={setLengthUnit} onChange={changeConfiguration} notice=""/>}
    <footer className="app-footer"><span><Icon name="network" size={13}/>PortTracker <span className="footer-divider">/</span>{page === 'facility' ? 'Facility floor plan' : 'Rack workspace'}</span><span>{storageNotice ? 'Check project storage notice' : 'Saved locally'} · No live network connection</span>{page === 'cabinets' && active.id === 'idf-01' && <button onClick={() => { if (!window.confirm('Reset this distribution frame to the demo racks, connections and port VLANs? Other distribution frames and shared configuration are preserved.')) return; clearBulkSelection(); setMultiPortMode(false); setLayout(fixtureLayout(vlans)); setCalibration(defaultCalibration); setRackGap(.25); setSelection(fixtureLayout(vlans).cables.some(c => c.id === 'CR-0018') ? { kind: 'cable', id: 'CR-0018' } : null); setPortBrowser(defaultPort); setMultiIds(['CAB-A01', 'CAB-A02']); setSingleRack('CAB-A01'); setView('multi'); setTab('connections'); clearViewFilters(); setShowVlan(true); setShowCables(true); setTracing(false); setToast('Demo connections and port VLANs restored. Configuration preserved.'); }}><Icon name="reset" size={13}/>Reset demo</button>}</footer>
    {toast && <div className="toast" role="status"><Icon name="check"/>{toast}</div>}
    {stackEditor && <Suspense fallback={null}><StackMembershipDialog layout={layout} endpoint={stackEditor} onClose={() => setStackEditor(null)} onSave={next => { setLayout(next); setStackEditor(null); setToast('Stack membership saved. Port assignments preserved.'); }}/></Suspense>}
    {equipmentAction && <Suspense fallback={null}><EquipmentDialog layout={layout} action={equipmentAction} locationName={active.name} initialRackId={tab === 'equipment' ? portBrowser.rackId : singleRack} onClose={() => setEquipmentAction(null)} onSave={finishEquipmentChange}/></Suspense>}
    {addRackTemplate !== null && <AddRackDialog template={addRackTemplate} onClose={() => setAddRackTemplate(null)} onSave={(heightU, verticalManagement) => addRack(addRackTemplate, heightU, verticalManagement)}/>}
    {renameCabinetOpen && layout.racks.length > 0 && <RenameCabinetDialog layout={layout} initialRackId={view === 'single' ? singleRack : selectedPort?.rackId ?? selectedCable?.from.rackId ?? singleRack} onClose={() => setRenameCabinetOpen(false)} onSave={(rackId, name, heightU, verticalManagement) => { setLayout(current => ({ ...current, racks: positionRacks(current.racks.map(r => r.id === rackId ? { ...r, label: name, heightU, verticalManagement } : r), calibration, rackGap) })); setRenameCabinetOpen(false); setToast(`Rack settings saved for ${name}.`); }}/ >}
    {removeCabinetOpen && <RemoveCabinetDialog layout={layout} locationName={active.name} initialRackId={selectedPort?.rackId ?? singleRack} onClose={() => setRemoveCabinetOpen(false)} onRemove={deleteCabinet}/>}
    {editor && <ConnectionEditor vlans={vlans} key={editor.cable.id} layout={layout} initial={editor.cable} isNew={editor.isNew} onClose={() => setEditor(null)} onSave={cable => { setLayout({ ...layout, cables: [...layout.cables.filter(c => c.id !== cable.id), cable] }); setEditor(null); selectCable(cable.id); setToast(editor.isNew ? 'Connection created.' : 'Connection updated.'); }} onDelete={id => { setLayout({ ...layout, cables: layout.cables.filter(c => c.id !== id) }); setSelection(null); setEditor(null); setTracing(false); setToast('Connection removed.'); }}/ >}
    {calibrationOpen && <CalibrationEditor unit={lengthUnit} value={calibration} spacing={rackGap} onClose={() => setCalibrationOpen(false)} onSave={(cal, gap, unit) => { setLengthUnit(unit); setCalibration(cal); setRackGap(gap); setLayout({ ...layout, racks: positionRacks(layout.racks, cal, gap) }); setCalibrationOpen(false); setToast('Example calibration updated.'); }}/ >}
  </div>;
}
