export type Point = { x: number; y: number };
export const objectKinds = ['location', 'outlet', 'plate', 'idf', 'ap', 'camera', 'printer', 'device', 'cable', 'tray', 'conduit', 'label'] as const;
export type ObjectKind = typeof objectKinds[number];
export const statuses = ['planned', 'unmapped', 'partially mapped', 'verified'] as const;
export type MappingStatus = typeof statuses[number];
export interface FloorPort {
  id: string; label: string; medium: 'copper' | 'fiber'; mappingStatus: MappingStatus; notes: string;
  idfId?: string; rackId?: string; patchPanelId?: string; patchPanelPort?: number; switchId?: string; switchPort?: number; vlanId?: number;
}
export interface FloorObject extends Point {
  id: string; kind: ObjectKind; name: string; layerId: string; color?: string; notes: string; rotation: number;
  width?: number; height?: number; locationId?: string; locationType?: string; ports?: FloorPort[]; points?: Point[];
  status?: 'planned' | 'verified'; sourceId?: string; destinationId?: string; idfId?: string;
  symbolWidth?: number;
  labelStyle?: { fontSize?: number; position?: LabelPosition; offsetX?: number; offsetY?: number };
}
export type LabelPosition = 'above' | 'below' | 'left' | 'right' | 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export const labelPositions = (object: Pick<FloorObject,'kind'>): LabelPosition[] => object.kind==='location' ? ['top-left','top-right','center','bottom-left','bottom-right'] : ['below','above','left','right','center'];
export interface FloorLayer { id: string; name: string; visible: boolean; locked: boolean; color: string }
export interface Background {
  src: string; name: string; width: number; height: number;
  original?: { name: string; data: string; page?: number; pages?: number };
}
export interface FloorPlan {
  kind: 'porttracker-facility'; schemaVersion: 1; id: string; building: string; floor: string;
  background: Background; layers: FloorLayer[]; objects: FloorObject[];
  symbolSize?: 'small' | 'medium' | 'large';
  symbolWidth?: number;
  grid?: { spacing: number; unit: 'plan' | 'ft' | 'm' };
  calibration: { a: Point; b: Point; distance: number; unit: 'ft' | 'm' } | null;
}
export interface FloorFilters { location: string; type: string; status: string; idf: string; vlan: string }
export const emptyFilters: FloorFilters = { location: '', type: '', status: '', idf: '', vlan: '' };
export const kindLabels: Record<ObjectKind, string> = { location: 'Location box', outlet: 'Outlet', plate: 'Wall plate', idf: 'IDF / Rack', ap: 'Access point', camera: 'Camera', printer: 'Printer', device: 'Device', cable: 'Cable path', tray: 'Cable tray', conduit: 'Conduit', label: 'Label' };
export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const isRoute = (o: Pick<FloorObject, 'kind'>) => ['cable', 'tray', 'conduit'].includes(o.kind);
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const routeLength = (points: Point[]) => points.slice(1).reduce((total, p, i) => total + distance(points[i], p), 0);
export const unitsPerPoint = (plan: FloorPlan) => plan.calibration ? plan.calibration.distance / distance(plan.calibration.a, plan.calibration.b) : null;
// Width is stored in drawing coordinates so zoom and grid changes cannot resize symbols relative to the plan.
export const symbolWidthInPlanUnits = (plan: FloorPlan, object?: FloorObject) => object?.symbolWidth ?? plan.symbolWidth ?? 28*{small:.7,medium:1,large:1.3}[plan.symbolSize??'medium'];
export const isSymbol = (o: Pick<FloorObject, 'kind'>) => o.kind !== 'location' && o.kind !== 'label' && !isRoute(o);
export function itemLabelLayout(object: FloorObject) {
  const room=object.kind==='location',style=object.labelStyle??{},fontSize=style.fontSize??(room?11:object.kind==='label'?15:10);
  const maxChars=room?28:22,text=object.name.length>maxChars?object.name.slice(0,maxChars-1)+'…':object.name;
  const width=Math.max(room?65:0,text.length*fontSize*.62+12),height=fontSize+8;
  const position=style.position??(room?'top-left':'below');let x=-width/2,y=18;
  if(room){
    x=position.endsWith('right')?object.width!-width-5:position==='center'?(object.width!-width)/2:5;
    y=position.startsWith('bottom')?object.height!-height-5:position==='center'?(object.height!-height)/2:5;
  }else if(position==='above')y=-18-height;
  else if(position==='left'){x=-18-width;y=-height/2;}
  else if(position==='right'){x=18;y=-height/2;}
  else if(position==='center')y=-height/2;
  x+=style.offsetX??0;y+=style.offsetY??0;
  return {x,y,width,height,fontSize,text};
}
export function symbolLocalBounds(object: FloorObject) {
  const label=itemLabelLayout(object),x=Math.min(-17,label.x-1),y=Math.min(-17,label.y-1);
  return {x,y,width:Math.max(17,label.x+label.width+1)-x,height:Math.max(17,label.y+label.height+1)-y};
}
export function selectionBounds(plan: FloorPlan, object: FloorObject) {
  if (object.kind==='location') {
    const label=itemLabelLayout(object),x=Math.min(object.x,object.x+label.x),y=Math.min(object.y,object.y+label.y);
    return {x,y,width:Math.max(object.x+object.width!,object.x+label.x+label.width)-x,height:Math.max(object.y+object.height!,object.y+label.y+label.height)-y};
  }
  if (object.kind==='label') {
    const font=itemLabelLayout(object).fontSize,x=object.labelStyle?.offsetX??0,y=(object.labelStyle?.offsetY??0)-font,width=object.name.length*font*.62;
    const angle=object.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    const corners=[{x,y},{x:x+width,y},{x,y:y+font*1.25},{x:x+width,y:y+font*1.25}].map(p=>({x:object.x+p.x*cos-p.y*sin,y:object.y+p.x*sin+p.y*cos}));
    const left=Math.min(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y));
    return {x:left,y:top,width:Math.max(...corners.map(p=>p.x))-left,height:Math.max(...corners.map(p=>p.y))-top};
  }
  if (!isSymbol(object)) return objectBounds(object);
  const b=symbolLocalBounds(object),scale=symbolWidthInPlanUnits(plan,object)/28;
  return {x:object.x+b.x*scale,y:object.y+b.y*scale,width:b.width*scale,height:b.height*scale};
}
export function gridSpacingInPlanUnits(plan: FloorPlan) {
  const grid = plan.grid ?? { spacing: 10, unit: 'plan' };
  if (grid.unit === 'plan') return grid.spacing;
  let scale = unitsPerPoint(plan);
  if (scale === null) return 10;
  if (grid.unit !== plan.calibration!.unit) scale *= grid.unit === 'ft' ? 1 / .3048 : .3048;
  return grid.spacing / scale;
}
export function lengthLabel(plan: FloorPlan, points: Point[], unit = plan.calibration?.unit ?? 'ft') {
  const scale = unitsPerPoint(plan);
  if (scale === null) return 'Uncalibrated';
  let length = routeLength(points) * scale;
  if (unit !== plan.calibration!.unit) length *= unit === 'ft' ? 1 / .3048 : .3048;
  return `${length.toFixed(1)} ${unit}`;
}
export function objectVisible(plan: FloorPlan, object: FloorObject, filters: FloorFilters) {
  if (!plan.layers.find(l => l.id === object.layerId)?.visible) return false;
  if (filters.location && object.locationId !== filters.location && object.id !== filters.location) return false;
  if (filters.type && object.kind !== filters.type) return false;
  if (filters.idf && object.idfId !== filters.idf && !object.ports?.some(p => p.idfId === filters.idf)) return false;
  if (filters.status && !object.ports?.some(p => p.mappingStatus === filters.status)) return false;
  if (filters.vlan && !object.ports?.some(p => String(p.vlanId ?? '') === filters.vlan)) return false;
  return true;
}
export function objectBounds(o: FloorObject) {
  const points = o.points ?? [{ x: o.x, y: o.y }, { x: o.x + (o.width ?? 0), y: o.y + (o.height ?? 0) }];
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
export function translateObject(o: FloorObject, dx: number, dy: number): FloorObject {
  return { ...o, x: o.x + dx, y: o.y + dy, ...(o.points && { points: o.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }) };
}
export function orthogonalVertex(points: Point[], index: number, point: Point) {
  const next = points.map(p => ({ ...p })), old = points[index];
  for (const neighbor of [index - 1, index + 1]) {
    if (!next[neighbor]) continue;
    if (points[neighbor].x === old.x) next[neighbor].x = point.x;
    else next[neighbor].y = point.y;
  }
  next[index] = point;
  return next;
}
export function orthogonalSegment(a: Point, b: Point): Point[] {
  if (a.x === b.x || a.y === b.y) return [b];
  return [{ x: b.x, y: a.y }, b];
}
export function createObject(plan: FloorPlan, kind: ObjectKind, point: Point, layerId: string, count = 1): FloorObject {
  const number = plan.objects.filter(o => o.kind === kind).length + 1;
  const object: FloorObject = { id: uid(kind), kind, name: `${kindLabels[kind]} ${number}`, layerId, notes: '', rotation: 0, ...point };
  if (kind === 'location') Object.assign(object, { width: 160, height: 100, locationType: 'office' });
  if (kind === 'outlet' || kind === 'plate') {
    const labels = new Set(plan.objects.flatMap(o => o.ports?.map(p => p.label) ?? []));
    let n = 1;
    object.ports = Array.from({ length: kind === 'outlet' ? 1 : count }, () => {
      while (labels.has(`PORT-${String(n).padStart(3, '0')}`)) n++;
      const label = `PORT-${String(n++).padStart(3, '0')}`;
      labels.add(label);
      return { id: uid('port'), label, medium: 'copper', mappingStatus: 'unmapped', notes: '' };
    });
    object.name = object.ports[0].label;
  }
  if (isRoute(object)) Object.assign(object, { points: [point], status: 'planned' });
  return object;
}
export function duplicateObjects(plan: FloorPlan, ids: string[]) {
  const originals = plan.objects.filter(o => ids.includes(o.id) && !plan.layers.find(l => l.id === o.layerId)?.locked);
  const idMap = new Map(originals.map(o => [o.id, uid(o.kind)]));
  const labels = new Set(plan.objects.flatMap(o => o.ports?.map(p => p.label) ?? []));
  const copies: FloorObject[] = originals.map(o => {
    const bounds = objectBounds(o);
    const next = translateObject(o, Math.min(20, plan.background.width - bounds.x - bounds.width), Math.min(20, plan.background.height - bounds.y - bounds.height));
    return { ...next, id: idMap.get(o.id)!, name: `${o.name} copy`, locationId: idMap.get(o.locationId ?? '') ?? o.locationId,
      sourceId: undefined, destinationId: undefined, ...(isRoute(o) && { status: 'planned' as const }),
      ...(o.ports && { ports: o.ports.map(p => {
        let n = 1; while (labels.has(`${p.label}-copy-${n}`)) n++;
        const label = `${p.label}-copy-${n}`; labels.add(label);
        return { id: uid('port'), label, medium: p.medium, mappingStatus: 'unmapped' as const, notes: '' };
      }) }),
    };
  });
  return { plan: { ...plan, objects: [...plan.objects, ...copies] }, ids: copies.map(o => o.id) };
}
export function removeObjects(plan: FloorPlan, ids: string[]) {
  const removed = new Set(plan.objects.filter(o => ids.includes(o.id) && !plan.layers.find(l => l.id === o.layerId)?.locked).map(o => o.id));
  return { ...plan, objects: plan.objects.filter(o => !removed.has(o.id)).map(o => ({ ...o,
    locationId: removed.has(o.locationId ?? '') ? undefined : o.locationId,
    sourceId: removed.has(o.sourceId ?? '') ? undefined : o.sourceId,
    destinationId: removed.has(o.destinationId ?? '') ? undefined : o.destinationId,
  })) };
}
export function samplePlan(): FloorPlan {
  const layers: FloorLayer[] = [
    ['rooms', 'Rooms / Locations', '#447da6'], ['paths', 'Cable Paths', '#ee9b27'], ['trays', 'Cable Trays', '#17a28d'], ['conduits', 'Conduits', '#7c68c4'],
    ['outlets', 'Network Outlets', '#1689db'], ['racks', 'IDFs / Racks', '#164c70'],
    ['ap', 'Access Points', '#078bea'], ['cameras', 'Cameras', '#8259c6'], ['devices', 'Devices', '#437888'], ['labels', 'Labels', '#385a70'],
  ].map(([id, name, color]) => ({ id, name, color, visible: true, locked: false }));
  const object = (id: string, kind: ObjectKind, name: string, layerId: string, x: number, y: number, extra: Partial<FloorObject> = {}): FloorObject => ({ id, kind, name, layerId, x, y, rotation: 0, notes: '', ...extra });
  const plate = (id: string, x: number, y: number, room: string, n: number): FloorObject => object(id, 'plate', `A-${room}-01`, 'outlets', x, y, {
    locationId: `room-${room}`, ports: Array.from({ length: n }, (_, i) => ({ id: `${id}-port-${i+1}`, label: `A-${room}-${String(i+1).padStart(2,'0')}`, medium: 'copper', mappingStatus: 'unmapped', notes: '' })),
  });
  return { kind: 'porttracker-facility', schemaVersion: 1, id: 'sample-floor-1', building: 'Building A', floor: 'Floor 1',
    background: { src: '/facility/sample-floorplan.svg', name: 'Example office floor plan', width: 1100, height: 650 }, calibration: null, layers,
    objects: [
      object('room-201','location','Office 201','rooms',264,65,{width:207,height:200,locationType:'office'}),
      object('room-204','location','Office 204','rooms',330,365,{width:230,height:210,locationType:'office'}),
      object('idf-01','idf','IDF-01','racks',785,155),
      plate('plate-201',420,235,'201',2), plate('plate-202',585,235,'202',1), plate('plate-203',970,235,'203',2),
      plate('plate-204',470,475,'204',4), plate('plate-205',740,490,'205',2),
      object('ap-01','ap','AP-01','ap',146,178), object('ap-02','ap','AP-02','ap',178,450), object('ap-03','ap','AP-03','ap',938,455),
      object('cam-01','camera','CAM-01','cameras',1020,100), object('printer-01','printer','PRN-01','devices',640,490),
      object('tray-main','tray','Main corridor tray','trays',170,315,{points:[{x:170,y:315},{x:1010,y:315}],status:'planned'}),
      object('path-201','cable','Office 201 route','paths',785,155,{points:[{x:785,y:155},{x:785,y:305},{x:420,y:305},{x:420,y:235}],status:'planned',sourceId:'idf-01',destinationId:'plate-201'}),
      object('path-204','cable','Office 204 route','paths',785,155,{points:[{x:785,y:155},{x:785,y:325},{x:470,y:325},{x:470,y:475}],status:'planned',sourceId:'idf-01',destinationId:'plate-204'}),
      object('conduit-east','conduit','East conduit','conduits',1010,315,{points:[{x:1010,y:315},{x:1010,y:510},{x:938,y:510}],status:'planned'}),
    ].map(o => o.locationId && !['room-201','room-204'].includes(o.locationId) ? { ...o, locationId: undefined } : o),
  };
}

// Validate portable files before they replace the active drawing or enter autosave.
export function parseFloorPlan(value: unknown): FloorPlan {
  const fail = (message: string): never => { throw new Error(`Invalid floor plan: ${message}`); };
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const text = (v: unknown, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const color = (v: unknown) => typeof v === 'string' && /^#[\da-f]{6}$/i.test(v);
  if (record(value) && value.kind === undefined && value.schemaVersion === 1 && record(value.background) && value.background.path === 'sample-floorplan.svg') {
    // Read the single-floor starter file supplied in the handoff as well as native exports.
    const starter=value;
    const list = (key: string): Record<string, unknown>[] => {
      const items=starter[key];if(!Array.isArray(items)||items.length>10000||!items.every(record))fail(`invalid ${key}.`);return items as Record<string, unknown>[];
    };
    const base = (o:Record<string,unknown>,kind:unknown) => ({...o,kind,name:o.name??o.id,rotation:o.rotation??0,notes:o.notes??''});
    const objects = [
      ...list('locations').map(o=>base(o,'location')),
      ...list('devices').map(o=>base(o,o.type)),
      ...list('wallPlates').map(o=>({...base(o,'plate'),ports:Array.isArray(o.ports)?o.ports.map(p=>record(p)?{...p,label:p.label??p.id,medium:p.medium??'copper',mappingStatus:p.mappingStatus??p.status??'unmapped',notes:p.notes??''}:p):o.ports})),
      ...list('routes').map(o=>({...base(o,o.kind),x:Array.isArray(o.points)&&record(o.points[0])?o.points[0].x:0,y:Array.isArray(o.points)&&record(o.points[0])?o.points[0].y:0})),
    ];
    value={kind:'porttracker-facility',schemaVersion:1,id:value.id,building:value.building,floor:value.floor,calibration:value.calibration??null,layers:value.layers,objects,background:{src:'/facility/sample-floorplan.svg',name:'Example office floor plan',width:value.background.width,height:value.background.height}};
  }
  if (!record(value) || value.kind !== 'porttracker-facility' || value.schemaVersion !== 1) fail('unsupported file or schema version.');
  const p = value as unknown as FloorPlan;
  if (p.symbolSize !== undefined && !['small', 'medium', 'large'].includes(p.symbolSize)) fail('invalid symbol size.');
  if (p.symbolWidth !== undefined && (!finite(p.symbolWidth) || p.symbolWidth <= 0 || p.symbolWidth > 20000)) fail('symbol width must be greater than zero and at most 20,000 plan units.');
  if (p.grid !== undefined && (!record(p.grid) || !finite(p.grid.spacing) || p.grid.spacing < .001 || p.grid.spacing > 1000000 || !['plan', 'ft', 'm'].includes(p.grid.unit))) fail('grid spacing must be between 0.001 and 1,000,000 with valid units.');
  if (!text(p.id) || !text(p.building) || !text(p.floor)) fail('building, floor and ID are required.');
  const bg = p.background;
  if (!record(bg) || !text(bg.name) || !finite(bg.width) || !finite(bg.height) || bg.width < 1 || bg.height < 1 || bg.width > 20000 || bg.height > 20000) fail('invalid background dimensions.');
  if (typeof bg.src !== 'string' || bg.src.length > 50_000_000 || !(bg.src === '/facility/sample-floorplan.svg' || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(bg.src))) fail('background must be an embedded PNG/JPEG/WebP or the bundled example.');
  if (bg.original && (!record(bg.original) || !text(bg.original.name) || typeof bg.original.data !== 'string' || bg.original.data.length > 50_000_000 || !/^data:(application\/pdf|image\/(png|jpeg|webp|svg\+xml));base64,[A-Za-z0-9+/=]+$/.test(bg.original.data))) fail('invalid original file.');
  const point = (v: unknown): v is Point => record(v) && finite(v.x) && finite(v.y) && (v.x as number) >= 0 && (v.y as number) >= 0 && (v.x as number) <= bg.width && (v.y as number) <= bg.height;
  if (!Array.isArray(p.layers) || !p.layers.length || p.layers.length > 100 || !Array.isArray(p.objects) || p.objects.length > 10000) fail('invalid layers or object count.');
  const ids = new Set<string>();
  function unique(id: string) { if (!text(id) || ids.has(id)) fail('IDs must be unique.'); ids.add(id); }
  for (const l of p.layers) { if (!record(l) || !text(l.name) || !color(l.color) || typeof l.visible !== 'boolean' || typeof l.locked !== 'boolean') fail('invalid layer.'); unique(l.id); }
  const layerIds = new Set(p.layers.map(l => l.id)), portLabels = new Set<string>();
  for (const o of p.objects) {
    if (!record(o) || !objectKinds.includes(o.kind) || !text(o.name) || !point(o) || !finite(o.rotation) || typeof o.notes !== 'string' || o.notes.length > 10000 || !layerIds.has(o.layerId) || (o.color !== undefined && !color(o.color))) fail('invalid object.');
    if (o.symbolWidth !== undefined && (!isSymbol(o) || !finite(o.symbolWidth) || o.symbolWidth <= 0 || o.symbolWidth > 20000)) fail('invalid item symbol width.');
    if (o.labelStyle !== undefined) {
      const s=o.labelStyle;
      if (!record(s) || isRoute(o) || (s.fontSize!==undefined&&(!finite(s.fontSize)||s.fontSize<4||s.fontSize>96)) || (s.position!==undefined&&!labelPositions(o).includes(s.position)) || [s.offsetX,s.offsetY].some(n=>n!==undefined&&(!finite(n)||Math.abs(n)>20000))) fail('invalid item label style.');
    }
    unique(o.id);
    if (o.kind === 'location' && (!finite(o.width) || !finite(o.height) || o.width! < 5 || o.height! < 5 || o.x + o.width! > bg.width || o.y + o.height! > bg.height)) fail('location box is outside the drawing.');
    if (isRoute(o)) {
      if (!Array.isArray(o.points) || o.points.length < 2 || o.points.length > 2000 || !o.points.every(point) || !['planned','verified'].includes(o.status!)) fail('invalid route.');
      if (o.points!.slice(1).some((pt,i) => pt.x !== o.points![i].x && pt.y !== o.points![i].y)) fail('routes must use orthogonal segments.');
    }
    if (['outlet','plate'].includes(o.kind)) {
      if (!Array.isArray(o.ports) || ![1,2,4,6].includes(o.ports.length) || (o.kind === 'outlet' && o.ports.length !== 1)) fail('invalid wall plate ports.');
      for (const port of o.ports!) {
        if (!record(port) || !text(port.label) || portLabels.has(port.label) || !['copper','fiber'].includes(port.medium) || !statuses.includes(port.mappingStatus) || typeof port.notes !== 'string' || port.notes.length > 10000) fail('invalid port or duplicate port label.');
        unique(port.id); portLabels.add(port.label);
        for (const ref of ['idfId','rackId','patchPanelId','switchId'] as const) if (port[ref] !== undefined && !text(port[ref])) fail('invalid port reference.');
        for (const ref of ['patchPanelPort','switchPort','vlanId'] as const) if (port[ref] !== undefined && (!Number.isInteger(port[ref]) || port[ref]! < 0 || port[ref]! > 999999)) fail('invalid port number or VLAN.');
      }
    }
  }
  for (const o of p.objects) {
    if (o.locationId && !p.objects.some(r => r.id === o.locationId && r.kind === 'location')) fail('unknown location.');
    for (const id of [o.sourceId, o.destinationId]) if (id && !p.objects.some(r => r.id === id)) fail('unknown route endpoint.');
    const visited = new Set([o.id]); let parent = o.locationId;
    while (parent) { if (visited.has(parent)) fail('location associations contain a cycle.'); visited.add(parent); parent = p.objects.find(r => r.id === parent)?.locationId; }
  }
  if (p.calibration !== null && (!record(p.calibration) || !point(p.calibration.a) || !point(p.calibration.b) || distance(p.calibration.a,p.calibration.b) < .001 || !finite(p.calibration.distance) || p.calibration.distance <= 0 || !['ft','m'].includes(p.calibration.unit))) fail('invalid calibration.');
  return p;
}
