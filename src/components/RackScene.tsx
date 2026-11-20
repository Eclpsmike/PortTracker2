import type { RackSelectionBox } from './useRackDragSelection';
import { EMPTY_VIEW_FILTERS, type ViewFilters, portMatchesFilters, locationOutlineColor, vlanOutlineColor } from '../viewFilters';
import type { FacilityLocation } from '../configuration';
import { mediaLabel, portMedium } from '../media';
import { equipmentTemplate } from '../equipmentTemplates';
import { useId, useState, useEffect } from 'react';
import { hasVerticalManagement, type Layout, type Rack, type Equipment, type Endpoint, type Cable, type Vlan, endpointKey, sameEndpoint, vlanColor, portVlan, patchPortDetails, resolveEndpoint, getPortMedia, firstPortNumber, equipmentTopU, interfaceName } from '../model';
import { UNIT, RACK_WIDTH, RACK_FRAME_WIDTH, rackTop, rackOriginX, rackSceneSize, rackSideInset, portPoint, cablePoints, roundedPath, portSize, EQUIPMENT_FACE, equipmentImageBounds, equipmentFace, equipmentPosition } from '../geometry';
export interface SceneProps {
  filters?: ViewFilters; facilityLocations?: readonly FacilityLocation[]; vlans?: readonly Vlan[]; layout: Layout; rackIds: string[]; cables: Cable[];
  selectedPorts?: readonly Endpoint[];
  selectionBox?: RackSelectionBox | null;
  selectedCable: Cable | undefined; selectedPort: Endpoint | null;
  showCables: boolean; showVlan: boolean; tracing: boolean;
  onPort: (ep: Endpoint) => void; onCable: (id: string) => void;
}
function EquipmentFace({ rack, equipment: e, x, props, prefix }: { rack: Rack; equipment: Equipment; x: number; props: SceneProps; prefix: string }) {
  const { y } = equipmentPosition(props.layout, rack.id, e, props.rackIds);
  const isSwitch = e.kind === 'switch';
  const template = equipmentTemplate(e, props.layout.templates);
  const imageBounds = equipmentImageBounds(e, props.layout.templates);
  const face = equipmentFace(e);
  const originalOffset = (UNIT * e.heightU - 17) / 2;
  const [failedImage, setFailedImage] = useState('');
  useEffect(() => setFailedImage(''), [template?.imageSrc]);
  const imageVisible = template && failedImage !== template.imageSrc;
  return <g className="equipment" data-equipment={`${rack.id}/${e.id}`} data-template={template?.id ?? 'original'} data-bottom-u={e.bottomU} data-height-u={e.heightU}>
    <rect x={x + EQUIPMENT_FACE.x} y={y + EQUIPMENT_FACE.y} width={EQUIPMENT_FACE.width} height={face.height} rx="1.5" fill={`url(#${prefix}-${isSwitch ? 'switch' : 'panel'})`} stroke="#050b12" strokeWidth=".9" />
    {template ? <>
      {imageVisible && <image className="equipment-image" href={template.imageSrc} x={x + imageBounds.x} y={y + imageBounds.y} width={imageBounds.width} height={imageBounds.height} preserveAspectRatio="xMidYMid meet" pointerEvents="none" onError={() => setFailedImage(template.imageSrc)}/>}
      <rect x={x + 55} y={y + .7} width="34" height="4.3" rx=".5" fill="#15384a" opacity=".9" pointerEvents="none"/>
      <text x={x + 72} y={y + 4} textAnchor="middle" fontSize="3.8" fontWeight="700" fill="white" pointerEvents="none">{e.label}</text>
      <title>{`${e.label} · ${template.name}${imageVisible ? '' : ' · Image unavailable; socket positions retained'}`}</title>
    </> : <g transform={`translate(0 ${originalOffset})`}>
      {[58, 383].map(cx => <g key={cx}><circle cx={x + cx} cy={y + 8} r="2.1" fill="#a2aeb7" stroke="#1c2730"/><path d={`M ${x + cx - 1} ${y + 7} l2 2`} stroke="#263441" strokeWidth=".7"/></g>)}
      <rect x={x + 64} y={y + 2.5} width="48" height="11.5" rx="2" fill="#ecf2f4" stroke="#a0afb7" strokeWidth=".5"/>
      <text x={x + 88} y={y + 10.5} textAnchor="middle" fontSize="7.2" fontWeight="800" fill="#14212d">{e.label}</text>
      {isSwitch && <circle cx={x + 60} cy={y + 8} r="1.5" fill="#b9ee48"/>}
    </g>}
    {Array.from({ length: e.portCount }, (_, index) => {
      const ep = { rackId: rack.id, equipmentId: e.id, port: firstPortNumber(e) + index };
      const p = portPoint(props.layout, ep, props.rackIds);
      const { width: w, height: h } = portSize(e, ep.port, props.layout.templates);
      const selected = (!!props.selectedPort && sameEndpoint(props.selectedPort, ep)) || !!props.selectedPorts?.some(port => sameEndpoint(port, ep));
      const connected = props.layout.cables.some(c => sameEndpoint(c.from, ep) || sameEndpoint(c.to, ep));
      const cableEnd = !!props.selectedCable && [props.selectedCable.from, props.selectedCable.to].some(e => sameEndpoint(e, ep));
      const assignedVlan = portVlan(props.layout, ep);
      const details = patchPortDetails(props.layout, ep);
      const physical = getPortMedia(props.layout, ep);
      const filters = props.filters ?? EMPTY_VIEW_FILTERS;
      const matches = portMatchesFilters(props.layout, ep, filters);
      const locationColor = locationOutlineColor(props.layout, ep, filters, props.facilityLocations ?? []);
      const vlanColorValue = props.showVlan ? vlanOutlineColor(props.layout, ep, filters, props.vlans) : null;
      const locationOutset = locationColor && vlanColorValue ? 1.3 : 0;
      const selectionOutset = locationOutset ? 2.6 : 1;
      const selectionVerticalOutset = locationOutset ? 2.6 : template ? .5 : 1.5;
      const dimmed = (filters.vlans.length + filters.locations.length) > 0 && !matches && !selected;
      return <g key={index} role="button" aria-label={`${rack.label} ${e.label} port ${ep.port}${connected ? ', connected' : ', available'}`} aria-pressed={selected} tabIndex={-1} className="rack-port" data-medium={portMedium(physical)} data-vlan={assignedVlan ?? undefined} opacity={dimmed ? .3 : 1} data-port={endpointKey(ep)} onClick={event => { event.stopPropagation(); props.onPort(ep); }} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); props.onPort(ep); } }}>
        <rect className="port-hit" x={p.x - w / 2 - .4} y={p.y - h / 2 - (template ? .3 : 1)} width={w + .8} height={h + (template ? .6 : 2)} fill="transparent"/>
        {!template && portMedium(physical) === 'copper' && <use href={`#${prefix}-${isSwitch ? 'switch-port' : 'patch-port'}`} transform={`translate(${p.x} ${p.y}) scale(${w / 8.8} ${h / (isSwitch ? 6 : 10)})`}/>}
        {!template && portMedium(physical) === 'fiber' && <g pointerEvents="none"><rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx=".5" fill="#111f29" stroke="#91b8c8" strokeWidth=".6"/><path d={`M${p.x} ${p.y - h / 2} v${h}`} stroke="#91b8c8" strokeWidth=".6"/></g>}
        {template && !imageVisible && <rect className="socket-fallback" x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} fill="#08141c" stroke="#bac5cc" strokeWidth=".5"/>}
        {vlanColorValue && <rect className="port-vlan-marker" x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx=".5" fill="none" stroke={vlanColorValue} strokeWidth={template ? .65 : 1.1} pointerEvents="none"/>}
        {locationColor && <rect className="port-location-marker" x={p.x - w / 2 - locationOutset} y={p.y - h / 2 - locationOutset} width={w + 2 * locationOutset} height={h + 2 * locationOutset} rx=".5" fill="none" stroke={locationColor} strokeWidth={template ? .65 : 1.1} pointerEvents="none"/>}
        {(selected || cableEnd) && <rect className="port-ring" x={p.x - w / 2 - selectionOutset} y={p.y - h / 2 - selectionVerticalOutset} width={w + 2 * selectionOutset} height={h + 2 * selectionVerticalOutset} rx="1" fill="none" stroke={selected ? '#fff' : '#ffbd47'} strokeWidth={template ? .9 : 1.5}/>}
        <title>{`${rack.label} · ${e.label} · Port ${ep.port} · ${mediaLabel(physical)}${interfaceName(props.layout, e, ep.port) ? ` · ${interfaceName(props.layout, e, ep.port)}` : ''}${e.firstNumber && !e.portStartOverride && firstPortNumber(e) === 1 ? ` · Global ${e.firstNumber + index}` : ''}${assignedVlan === null ? ' · No port VLAN' : ` · Port VLAN ${assignedVlan}`}${details.facilityLocation ? ` · ${details.facilityLocation}` : ''}${details.notes ? ' · Has port notes' : ''}`}</title>
      </g>;
    })}
    {!template && <g transform={`translate(0 ${originalOffset})`}><rect x={x + 349} y={y + 2.5} width="29" height="11.5" rx="1.5" fill="#e4ecf0"/>
      <text x={x + 363.5} y={y + 10.3} textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#172433">{e.firstNumber && !e.portStartOverride && firstPortNumber(e) === 1 ? `${e.firstNumber}–${e.firstNumber + e.portCount - 1}` : e.kind === 'patch-panel' ? `${firstPortNumber(e)}–${firstPortNumber(e) + e.portCount - 1}` : `${e.portCount}P`}</text></g>}
  </g>;
}
function Cabinet({ rack, props, prefix }: { rack: Rack; props: SceneProps; prefix: string }) {
  const x = rackOriginX(props.layout, rack.id, props.rackIds), height = rack.heightU * UNIT, inset = rackSideInset(rack);
  const cabinetName = rack.label;
  const top = rackTop(props.layout, rack.id, props.rackIds);
  return <g>
    <rect className="cabinet-frame" x={x - 3 + inset} y={top - 35} width={RACK_FRAME_WIDTH - 2 * inset} height={height + 53} rx="5" fill="#0a121b" stroke="#8a9aa7" strokeWidth="2"/>
    <rect x={x + 10 + inset} y={top - 28} width={RACK_WIDTH - 20 - 2 * inset} height={height + 39} fill={`url(#${prefix}-rack)`}/>
    <rect x={x + 48} y={top - 4} width={RACK_WIDTH - 96} height={height + 8} fill="#070e15"/>
    <rect x={x + 58} y={top - 28} width={RACK_WIDTH - 116} height="20" rx="2" fill={`url(#${prefix}-panel)`}/>
    <rect x={x + 127} y={top - 26} width="177" height="17" rx="3" fill="#eef3f5"/>
    <svg x={x + 127} y={top - 26} width="177" height="17" overflow="hidden"><title>{cabinetName}</title><text x="88.5" y="12" textAnchor="middle" fontSize="10" fontWeight="800" fill="#172532">{cabinetName.length > 28 ? `${cabinetName.slice(0, 27)}…` : cabinetName}</text></svg>
    {Array.from({ length: rack.heightU }, (_, i) => <g key={i}>
      <text x={x + 51} y={top + i * UNIT + UNIT / 2 + 3} textAnchor="end" fontSize="8" fill="#b7c7d4">U{rack.heightU - i}</text>
      <rect x={x + 52} y={top + i * UNIT + UNIT / 2 - 2} width="2" height="4" fill="#53616d"/>
    </g>)}
    {rack.equipment.map(e => <EquipmentFace key={e.id} rack={rack} equipment={e} x={x} props={props} prefix={prefix}/>)}
    {Array.from({ length: rack.heightU }, (_, i) => rack.heightU - i).filter(u => !rack.equipment.some(e => u >= e.bottomU && u <= equipmentTopU(e))).map(u => {
      const blankY = top + (rack.heightU - u) * UNIT;
      return <g key={u} data-empty-unit={`${rack.id}/${u}`}>
        <rect x={x + EQUIPMENT_FACE.x} y={blankY + EQUIPMENT_FACE.y} width={EQUIPMENT_FACE.width} height={EQUIPMENT_FACE.height} rx="1" fill={`url(#${prefix}-blank)`} stroke="#080e15"/>
        {[58, 383].map(cx => <circle key={cx} cx={x + cx} cy={blankY + UNIT / 2} r="1.3" fill="#596873"/>)}
        {u % 5 === 3 && <rect x={x + 72} y={blankY + UNIT / 2 - 4.5} width="296" height="9" fill={`url(#${prefix}-vent)`}/>}
      </g>;
    })}
    {hasVerticalManagement(rack) && [18, RACK_WIDTH - 18].map((offset, side) => <g key={side} data-vertical-manager={`${rack.id}/${side}`}>
      <rect x={x + offset - 16} y={top - 22} width="32" height={height + 30} fill={`url(#${prefix}-manager)`} stroke="#627583" strokeWidth="1.5"/>
      {Array.from({ length: 7 }, (_, lane) => <path key={lane} d={`M${x + offset - 10 + lane * 3.1},${top - 14} V${top + height - 9}`} stroke={['#168bd4','#199ddf','#4ac8f5','#1175bb','#167ebe','#18bce9','#056eb0'][lane]} strokeWidth="1.8" opacity=".8"/>)}
      {Array.from({ length: 9 }, (_, i) => <g key={i}>
        <rect x={x + offset - 18} y={top - 11 + i * (height / 8.5)} width="36" height="12" rx="1" fill={`url(#${prefix}-panel)`} stroke="#17222c" strokeWidth="1.5"/>
        <path d={`M${x + offset - 14},${top - 8 + i * (height / 8.5)} h28`} stroke="#a7b0b5" opacity=".45"/>
      </g>)}
    </g>)}
  </g>;
}
export function RackScene(props: SceneProps) {
  const prefix = useId().replace(/:/g, '');
  const size = rackSceneSize(props.layout, props.rackIds);
  const selectedId = props.selectedCable?.id;
  const cables = [...props.cables].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));
  return <svg className="rack-scene" viewBox={`0 0 ${size.width} ${size.height}`} width={size.width} height={size.height} role="group" aria-label="Interactive network racks. Use the Ports inspector for keyboard selection.">
    <defs>
      <linearGradient id={`${prefix}-rack`}><stop stopColor="#61717d"/><stop offset=".07" stopColor="#18232b"/><stop offset=".5" stopColor="#111c26"/><stop offset=".95" stopColor="#445461"/><stop offset="1" stopColor="#1b2833"/></linearGradient>
      <linearGradient id={`${prefix}-panel`} x2="0" y2="1"><stop stopColor="#788792"/><stop offset=".18" stopColor="#384652"/><stop offset=".75" stopColor="#26343f"/><stop offset="1" stopColor="#7f8d97"/></linearGradient>
      <linearGradient id={`${prefix}-switch`} x2="0" y2="1"><stop stopColor="#ced6db"/><stop offset=".2" stopColor="#879aa7"/><stop offset=".8" stopColor="#5c707e"/><stop offset="1" stopColor="#c7d2d9"/></linearGradient>
      <linearGradient id={`${prefix}-blank`} x2="0" y2="1"><stop stopColor="#354450"/><stop offset=".5" stopColor="#25323e"/><stop offset="1" stopColor="#1c2834"/></linearGradient>
      <linearGradient id={`${prefix}-manager`}><stop stopColor="#6a7880"/><stop offset=".14" stopColor="#182631"/><stop offset=".8" stopColor="#0a141e"/><stop offset="1" stopColor="#697780"/></linearGradient>
      <pattern id={`${prefix}-vent`} width="6" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" rx="1" fill="#050c12"/></pattern>
      <g id={`${prefix}-patch-port`}><rect x="-4.4" y="-5" width="8.8" height="10" rx=".5" fill="#bac5cc"/><path d="M-3.5-4h7v5.5H2V4h-4V1.5h-1.5z" fill="#030a10"/><path d="M-2.7-3v1 M-1.5-3v1 M-.3-3v1 M.9-3v1 M2.1-3v1" stroke="#a3a486" strokeWidth=".5"/><path d="M-3.4 3.5h1 M2.5 3.5h1" stroke="#526777" strokeWidth=".7"/></g>
      <g id={`${prefix}-switch-port`}><rect x="-4.4" y="-3" width="8.8" height="6" rx=".5" fill="#c3cfd5"/><path d="M-3.4-2.2h6.8v3H2V2h-4V.8h-1.4z" fill="#050c11"/><path d="M-2.5-1.7h5" stroke="#a8a47c" strokeWidth=".5"/></g>
    </defs>
    <g>
      <rect x="24" y="19" width={size.width - 48} height="17" rx="2" fill={`url(#${prefix}-panel)`} stroke="#152632" strokeWidth="2"/>
      <rect x="24" y="48" width={size.width - 48} height="7" fill="#2e3f4a"/>
      {Array.from({ length: Math.ceil((size.width - 65) / 54) }, (_, i) => <g key={i}><rect x={34 + i * 54} y="18" width="9" height="38" rx="2" fill={`url(#${prefix}-panel)`} stroke="#14252f"/><circle cx={38.5 + i * 54} cy="25" r="1.5" fill="#adb8c2"/></g>)}
      <rect x={size.width / 2 - 111} y="6" width="222" height="23" rx="5" fill="#133a52" stroke="#d6e3ed" strokeWidth="2"/>
      <text x={size.width / 2} y="21" textAnchor="middle" fontSize="10" fill="white" fontWeight="600">OVERHEAD CABLE PATHWAY</text>
    </g>
    {props.rackIds.map(id => <Cabinet key={id} rack={props.layout.racks.find(r => r.id === id)!} props={props} prefix={prefix}/>)}
    {props.showCables && cables.map(c => {
      const selected = c.id === selectedId;
      const points = cablePoints(props.layout, c, props.rackIds);
      const d = roundedPath(points);
      const color = props.showVlan ? vlanColor(c.vlan, props.vlans) : c.jacket;
      const ends = [points[0], points[points.length - 1]];
      return <g key={c.id} className={`cable-group ${selected ? 'selected' : ''}`} opacity={selectedId && !selected ? .65 : 1}>
        <path d={d} fill="none" stroke="#02080d" strokeWidth={selected ? 6.3 : 4.6} strokeLinecap="round"/>
        <path d={d} fill="none" stroke={color} strokeWidth={selected ? 3.5 : 2.6} strokeLinecap="round"/>
        <path d={d} fill="none" stroke="#ffffff" strokeWidth=".65" strokeOpacity=".42" transform="translate(-.5,-.6)"/>
        {selected && <path d={d} fill="none" stroke="#fff" strokeWidth="1.2" strokeDasharray="3 8" className={props.tracing ? 'trace-motion' : ''} pointerEvents="none"/>}
        <path d={d} fill="none" stroke="transparent" strokeWidth="10" className="cable-hit" role="button" tabIndex={0} aria-label={`Select cable ${c.id}`} aria-pressed={selected} onClick={() => props.onCable(c.id)} onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); props.onCable(c.id); } }}/>
        {ends.map((p, i) => {
          const ep = i === 0 ? c.from : c.to, e = resolveEndpoint(props.layout, ep).equipment;
          const size = portSize(e, ep.port, props.layout.templates), hasImage = !!equipmentTemplate(e, props.layout.templates);
          const w = hasImage ? Math.min(6.2, size.width * .75) : 6.2, h = hasImage ? Math.min(8.2, size.height * .85) : 8.2;
          return <g key={i} pointerEvents="none"><rect x={p.x - w / 2} y={p.y - h / 2} width={w} height={h} rx={hasImage ? .4 : 1.2} fill={color} stroke="#062333" strokeWidth=".6"/>{!hasImage && <path d={`M${p.x - 1.8} ${p.y - 3.2} v4.5 M${p.x + 1.2} ${p.y - 3.2} v4.5`} stroke="#fff" opacity=".55" strokeWidth=".7"/>}</g>;
        })}
      </g>;
    })}
    {props.selectionBox && <rect className="rack-selection-marquee" {...props.selectionBox} fill="#28a9ed30" stroke="#65caff" strokeWidth={2} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
  </svg>;
}
