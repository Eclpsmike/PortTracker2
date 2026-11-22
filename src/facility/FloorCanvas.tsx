import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FloorIcon, type FloorIconName } from './FloorIcon';
import { connectRouteEndpoint, nearestConnector, objectConnectors, syncRouteConnections, isSymbol, distance, isRoute, itemLabelLayout, lengthLabel, objectBounds, moveRouteVertex, routeLineWeight, selectionBounds, symbolLocalBounds, symbolWidthInPlanUnits, toolLineWeight, translateObject, type FloorObject, type FloorPlan, type FloorPort, type ObjectKind, type Point } from './model';
export type Tool = FloorIconName;
export type View = { x: number; y: number; scale: number };
interface Props {
  plan: FloorPlan; objects: FloorObject[]; selected: string[]; tool: Tool; view: View; setView: (view: View) => void;
  onSelect: (ids: string[]) => void; onChange: (objects: FloorObject[]) => void; onPlace: (a: Point, b?: Point) => void;
  draft: Point[]; onPoint: (point: Point) => void; grid: boolean; snap: boolean; gridSize: number; unit: 'ft' | 'm';
  fitToken: number; portLabel: (port: FloorPort) => string;
  focusRequest?: {id:string}|null;
}
type Gesture = { kind: 'pan' | 'move' | 'box' | 'location' | 'place' | 'resize' | 'symbol-resize' | 'vertex'; start: Point; client: Point; view: View; objects: FloorObject[]; id?: string; handle?: string; index?: number; additive?: boolean };
export function FloorCanvas(props: Props) {
  const { plan, objects, selected, tool, view, setView, draft } = props;
  const svg = useRef<SVGSVGElement>(null), host = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null), pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; anchor: Point; scale: number } | null>(null);
  const previewRef = useRef<FloorObject[] | null>(null);
  const [preview, setPreview] = useState<FloorObject[] | null>(null), [box, setBox] = useState<{ a: Point; b: Point } | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const latest = useRef(props); latest.current = props;
  useEffect(() => {
    // Fit on load, new plan dimensions, or an explicit request. Tool controls can
    // resize the canvas; those layout changes must preserve the user's viewport.
    const fit = () => {
      const rect = host.current?.getBoundingClientRect(); if (!rect || rect.width <= 32 || rect.height <= 32) return;
      const bg = latest.current.plan.background, scale = Math.min((rect.width - 32) / bg.width, (rect.height - 32) / bg.height);
      latest.current.setView({ scale, x: (rect.width - bg.width * scale) / 2, y: (rect.height - bg.height * scale) / 2 });
      observer.disconnect();
    };
    // If initially hidden, wait for a usable size before performing this fit.
    const observer = new ResizeObserver(fit);
    if (host.current) observer.observe(host.current);
    fit();
    return () => observer.disconnect();
  }, [props.fitToken, plan.background.width, plan.background.height]);
  useEffect(()=>{
    const current=latest.current,object=current.plan.objects.find(o=>o.id===props.focusRequest?.id),rect=host.current?.getBoundingClientRect();
    if(!object||!rect)return;
    const bounds=selectionBounds(current.plan,object);
    const scale=Math.max(.08,Math.min(current.view.scale,(rect.width-48)/Math.max(1,bounds.width),(rect.height-48)/Math.max(1,bounds.height)));
    current.setView({scale,x:rect.width/2-(bounds.x+bounds.width/2)*scale,y:rect.height/2-(bounds.y+bounds.height/2)*scale});
  },[props.focusRequest]);
  useEffect(() => { const element=svg.current; const prevent=(e:WheelEvent)=>e.preventDefault(); element?.addEventListener('wheel',prevent,{passive:false}); return()=>element?.removeEventListener('wheel',prevent); }, []);
  useEffect(() => { const cancel=(e:KeyboardEvent)=>{if(e.key==='Escape'){gesture.current=null;previewRef.current=null;setPreview(null);setBox(null);}};window.addEventListener('keydown',cancel);return()=>window.removeEventListener('keydown',cancel); }, []);
  function local(client: Point): Point { const r = svg.current!.getBoundingClientRect(); return { x: client.x - r.left, y: client.y - r.top }; }
  function planPoint(client: Point, snapping = true): Point {
    const p = local(client), step = props.snap && snapping ? props.gridSize : 0;
    const round = (n: number) => step ? Math.round(n / step) * step : n;
    return { x: Math.max(0, Math.min(plan.background.width, round((p.x - view.x) / view.scale))), y: Math.max(0, Math.min(plan.background.height, round((p.y - view.y) / view.scale))) };
  }
  function routePoint(client: Point): Point {
    return nearestConnector(plan, objects, planPoint(client, false), 10 / view.scale)?.point ?? planPoint(client);
  }
  function reset() { gesture.current = null; previewRef.current = null; setPreview(null); setBox(null); }
  function down(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();e.currentTarget.focus({preventScroll:true});
    const client = { x: e.clientX, y: e.clientY }; pointers.current.set(e.pointerId, client);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      const [a,b] = [...pointers.current.values()], center = local({ x: (a.x+b.x)/2, y:(a.y+b.y)/2 });
      pinch.current = { distance: Math.max(1,distance(a,b)), anchor: { x:(center.x-view.x)/view.scale, y:(center.y-view.y)/view.scale }, scale:view.scale }; reset(); return;
    }
    const point = planPoint(client,tool!=='select'), element = e.target as Element;
    const id = element.closest('[data-object-id]')?.getAttribute('data-object-id');
    let object = objects.find(o => o.id === id);
    // Endpoint handles must remain draggable when equipment is drawn over them.
    let endpointIndex: number | undefined;
    if (tool === 'select') for (const route of objects.filter(o => isRoute(o) && selected.includes(o.id) && !plan.layers.find(l => l.id === o.layerId)?.locked)) {
      const index = [0, route.points!.length - 1].find(i => distance(route.points![i], point) <= 7 / view.scale);
      if (index !== undefined) { object = route; endpointIndex = index; break; }
    }
    const base = { start: point, client, view, objects: [] };
    if (tool === 'pan' || e.button === 1 || e.altKey) gesture.current = { ...base, kind:'pan' };
    else if (tool === 'select' && object) {
      if (plan.layers.find(l => l.id === object.layerId)?.locked) { props.onSelect([object.id]); return; }
      const handle = endpointIndex !== undefined ? null : element.closest('[data-resize]')?.getAttribute('data-resize');
      const symbolHandle = endpointIndex !== undefined ? null : element.closest('[data-symbol-resize]')?.getAttribute('data-symbol-resize');
      const index = endpointIndex ?? element.closest('[data-vertex]')?.getAttribute('data-vertex');
      if (symbolHandle) gesture.current = {...base,kind:'symbol-resize',objects:[object],id:object.id,handle:symbolHandle};
      else if (handle) gesture.current = { ...base, kind:'resize', objects:[object], id:object.id, handle };
      else if (index !== null && index !== undefined) gesture.current = { ...base, kind:'vertex', objects:[object], id:object.id, index:Number(index) };
      else {
        const ids = e.shiftKey ? selected.includes(object.id) ? selected.filter(id => id !== object.id) : [...selected,object.id] : selected.includes(object.id) ? selected : [object.id];
        props.onSelect(ids);
        gesture.current = { ...base, kind:'move', id:object.id, objects:objects.filter(o => ids.includes(o.id) && !plan.layers.find(l => l.id === o.layerId)?.locked) };
      }
    } else if (tool === 'select') { gesture.current = { ...base, kind:'box', additive:e.shiftKey }; setBox({ a:point,b:point }); }
    else if (tool === 'location') { gesture.current = { ...base, kind:'location' }; setBox({ a:point,b:point }); }
    else gesture.current = { ...base, kind:'place' };
  }
  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const client = {x:e.clientX,y:e.clientY}; if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId,client);
    if (pinch.current && pointers.current.size >= 2) {
      const [a,b] = [...pointers.current.values()], mid = local({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
      const scale = Math.max(.08,Math.min(8,pinch.current.scale*distance(a,b)/pinch.current.distance));
      setView({scale,x:mid.x-pinch.current.anchor.x*scale,y:mid.y-pinch.current.anchor.y*scale}); return;
    }
    const activeGesture = gesture.current;
    const endpointDrag = activeGesture?.kind === 'vertex' && (activeGesture.index === 0 || activeGesture.index === activeGesture.objects[0].points!.length - 1);
    const p = ['cable','tray','conduit'].includes(tool) || endpointDrag ? routePoint(client) : planPoint(client, !['box','move','symbol-resize'].includes(activeGesture?.kind??'')); setCursor(p);
    const g = gesture.current; if (!g) return;
    if (g.kind === 'pan') { setView({...g.view,x:g.view.x+client.x-g.client.x,y:g.view.y+client.y-g.client.y}); return; }
    if (g.kind === 'box' || g.kind === 'location') { setBox({a:g.start,b:p}); return; }
    let next: FloorObject[] | null = null;
    if (g.kind === 'move' && g.objects.length) {
      const bounds = g.objects.map(objectBounds), left = Math.min(...bounds.map(b=>b.x)), top = Math.min(...bounds.map(b=>b.y));
      const right = Math.max(...bounds.map(b=>b.x+b.width)), bottom = Math.max(...bounds.map(b=>b.y+b.height));
      const anchor=g.objects.find(o=>o.id===g.id)??g.objects[0];
      const snapDelta=(n:number,origin:number)=>props.snap?Math.round((origin+n)/props.gridSize)*props.gridSize-origin:n;
      const dx = Math.max(-left,Math.min(plan.background.width-right,snapDelta(p.x-g.start.x,anchor.x))), dy = Math.max(-top,Math.min(plan.background.height-bottom,snapDelta(p.y-g.start.y,anchor.y)));
      next = g.objects.map(o=>translateObject(o,dx,dy));
    }
    if (g.kind === 'resize') {
      const o=g.objects[0], east=g.handle!.includes('e'), south=g.handle!.includes('s');
      const x1=east?o.x:Math.min(p.x,o.x+o.width!-10), x2=east?Math.max(o.x+10,p.x):o.x+o.width!;
      const y1=south?o.y:Math.min(p.y,o.y+o.height!-10), y2=south?Math.max(o.y+10,p.y):o.y+o.height!;
      next=[{...o,x:x1,y:y1,width:x2-x1,height:y2-y1}];
    }
    if (g.kind === 'vertex') {
      let route: FloorObject = {...g.objects[0],points:moveRouteVertex(g.objects[0].points!,g.index!,p)};
      if (endpointDrag) route = connectRouteEndpoint(route, g.index === 0 ? 'source' : 'destination', nearestConnector(plan, objects, planPoint(client, false), 10 / view.scale));
      next = [route];
    }
    if (g.kind === 'symbol-resize') {
      const o=g.objects[0],b=symbolLocalBounds(o),corner={x:b.x+(g.handle!.includes('e')?b.width:0),y:b.y+(g.handle!.includes('s')?b.height:0)};
      const delta=((p.x-g.start.x)*corner.x+(p.y-g.start.y)*corner.y)/(corner.x**2+corner.y**2);
      next=[{...o,symbolWidth:Math.max(.001,Math.min(20000,symbolWidthInPlanUnits(plan,o)+delta*28))}];
    }
    if (next) { previewRef.current=next; setPreview(next); }
  }
  function up(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) { if (!pointers.current.size) pinch.current=null; reset(); return; }
    const g=gesture.current; if (!g) return;
    const client={x:e.clientX,y:e.clientY};
    const p=['cable','tray','conduit'].includes(tool)?routePoint(client):planPoint(client,g.kind!=='box');
    if (previewRef.current && distance(g.client,{x:e.clientX,y:e.clientY})>2) props.onChange(previewRef.current);
    if (g.kind === 'location' && distance(g.start,p)>8) props.onPlace(g.start,p);
    if (g.kind === 'box') {
      const x=Math.min(g.start.x,p.x),y=Math.min(g.start.y,p.y),right=Math.max(g.start.x,p.x),bottom=Math.max(g.start.y,p.y);
      const ids=objects.filter(o=> {const b=selectionBounds(plan,o);return b.x>=x&&b.y>=y&&b.x+b.width<=right&&b.y+b.height<=bottom;}).map(o=>o.id);
      props.onSelect(g.additive?[...new Set([...selected,...ids])]:ids);
    }
    if (g.kind === 'place' && distance(g.client,{x:e.clientX,y:e.clientY})<12) {
      setCursor(p);
      if (['cable','tray','conduit','measure','calibrate'].includes(tool)) props.onPoint(p); else props.onPlace(p);
    }
    reset();
  }
  const previewObjects = preview ? syncRouteConnections({...plan,objects:plan.objects.map(o=>preview.find(p=>p.id===o.id)??o)}).objects : plan.objects;
  const previewById = new Map(previewObjects.map(o=>[o.id,o]));
  const visibleObjects = objects.map(o=>previewById.get(o.id)??o);
  const pointsText = (points: Point[]) => points.map(p=>`${p.x},${p.y}`).join(' ');
  const gridStep = props.gridSize;
  const draftingRoute=['cable','tray','conduit'].includes(tool);
  const connecting = draftingRoute || objects.some(o=>isRoute(o)&&selected.includes(o.id));
  const nearby = connecting && cursor ? nearestConnector(plan, visibleObjects, cursor, .001) : undefined;
  const draftWeight=draftingRoute?toolLineWeight(plan,tool as ObjectKind):2;
  const currentSegment=draftingRoute&&draft.length&&cursor?[draft.at(-1)!,cursor]:null;
  return <div className="floor-canvas-host" ref={host}>
    <svg ref={svg} className={`floor-canvas tool-${tool}`} aria-label="Facility floor plan canvas" role="application" tabIndex={0}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e=>{pointers.current.delete(e.pointerId);pinch.current=null;reset();}}
      onWheel={e=> {
        // Touchpad pinches arrive as Ctrl+wheel; ordinary two-finger scrolling pans.
        if(e.ctrlKey){
          const p=local({x:e.clientX,y:e.clientY}),scale=Math.max(.08,Math.min(8,view.scale*Math.exp(-e.deltaY*.0015)));
          setView({scale,x:p.x-(p.x-view.x)*scale/view.scale,y:p.y-(p.y-view.y)*scale/view.scale});
        }else{
          const unit=e.deltaMode===1?16:e.deltaMode===2?svg.current!.clientHeight:1;
          setView({...view,x:view.x-e.deltaX*unit,y:view.y-e.deltaY*unit});
        }
      }}>
      <defs><pattern id="facility-grid" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse"><path d={`M${gridStep} 0H0V${gridStep}`} fill="none" stroke="#80a7c3" strokeOpacity=".18" strokeWidth=".6"/></pattern></defs>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        <rect width={plan.background.width} height={plan.background.height} fill="white" className="floor-paper"/>
        <image href={plan.background.src} width={plan.background.width} height={plan.background.height} pointerEvents="none"/>
        {props.grid&&<rect width={plan.background.width} height={plan.background.height} fill="url(#facility-grid)" pointerEvents="none"/>}
        {visibleObjects.map(o=>{
          const color=o.color??plan.layers.find(l=>l.id===o.layerId)!.color, active=selected.includes(o.id), locked=plan.layers.find(l=>l.id===o.layerId)!.locked;
          const label=o.name, size=14,weight=routeLineWeight(o);
          const labelBox=itemLabelLayout(o);
          const symbolScale=symbolWidthInPlanUnits(plan,o)/28,symbolBounds=symbolLocalBounds(o),handleSize=8/(view.scale*symbolScale);
          const status=o.ports?.every(p=>p.mappingStatus==='verified')?'verified':o.ports?.some(p=>p.mappingStatus==='partially mapped'||p.mappingStatus==='verified')?'partially mapped':o.ports?.every(p=>p.mappingStatus==='planned')?'planned':'unmapped';
          return <g key={o.id} data-object-id={o.id} data-kind={o.kind} data-status={o.ports?status:o.status} className={`floor-object ${active?'selected':''} ${locked?'locked':''}`} role="button" aria-pressed={active} aria-label={`${label}, ${o.kind}`} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();props.onSelect([o.id]);}}}>
            <title>{label}{locked?' · Locked':''}{o.ports?` · ${o.ports.length} port(s) · ${status} · ${o.ports.map(props.portLabel).join(', ')}`:''}</title>
            {o.kind==='location'?<>
              <rect x={o.x} y={o.y} width={o.width} height={o.height} rx="3" fill={color} fillOpacity={active ? .13 : .045} stroke={active?'#0679d4':color} strokeOpacity={active?1:.65} strokeWidth={active?2.5:1} strokeDasharray={active?undefined:'6 4'} pointerEvents="stroke"/>
              <rect className="floor-item-label-box" x={o.x+labelBox.x} y={o.y+labelBox.y} width={labelBox.width} height={labelBox.height} rx="3" fill="#f2f8fd" stroke={color} strokeOpacity=".3"/>
              <text className="floor-item-label-text" x={o.x+labelBox.x+labelBox.width/2} y={o.y+labelBox.y+4+labelBox.fontSize*.8} textAnchor="middle" fontSize={labelBox.fontSize} fontWeight="650" fill="#234963" pointerEvents="none">{labelBox.text}</text>
              {active&&!locked&&tool==='select'&&['nw','ne','sw','se'].map(h=><rect key={h} data-resize={h} x={o.x+(h.includes('e')?o.width!:0)-5} y={o.y+(h.includes('s')?o.height!:0)-5} width="10" height="10" fill="white" stroke="#087dd0" strokeWidth="1.5" className={`resize-${h}`}/>)}
            </>:isRoute(o)?<>
              <polyline points={pointsText(o.points!)} fill="none" stroke="transparent" strokeWidth={Math.max(weight*4,16,18/view.scale)}/>
              <polyline points={pointsText(o.points!)} fill="none" stroke="white" strokeWidth={weight*2} strokeLinejoin="round" pointerEvents="none"/>
              <polyline className="floor-route-line" points={pointsText(o.points!)} fill="none" stroke={color} strokeWidth={weight} strokeDasharray={o.status==='planned'?`${weight*2.8} ${weight*1.6}`:undefined} strokeLinejoin="round" pointerEvents="none"/>
              {active&&<polyline points={pointsText(o.points!)} fill="none" stroke="#087dd0" strokeWidth={weight*3.2} opacity=".22" pointerEvents="none"/>}
              {[o.points![0],o.points!.at(-1)!].map((p,i)=><circle key={i} className="floor-route-endpoint" cx={p.x} cy={p.y} r={weight*2} fill={color} stroke="white" strokeWidth={weight*.5} pointerEvents="none"/>)}
              {active&&!locked&&tool==='select'&&o.points!.map((p,i)=><g key={i} data-vertex={i}>
                <circle cx={p.x} cy={p.y} r={Math.max(weight*2,6/view.scale)} fill="transparent"/>
                <circle className="floor-route-vertex" cx={p.x} cy={p.y} r={weight*2} fill="white" stroke="#087dd0" strokeWidth={weight*.8} pointerEvents="none"/>
              </g>)}
            </>:o.kind==='label'?<text className="floor-item-label-text" x={o.x+(o.labelStyle?.offsetX??0)} y={o.y+(o.labelStyle?.offsetY??0)} fill={color} fontSize={labelBox.fontSize} fontWeight="600" transform={`rotate(${o.rotation} ${o.x} ${o.y})`}>{label}</text>:<g className="floor-symbol" transform={`translate(${o.x} ${o.y}) scale(${symbolScale})`}>
              <rect className="floor-symbol-face" x={-size} y={-size} width={size*2} height={size*2} rx={o.kind==='ap'?size:5} fill="white" stroke={color} strokeWidth="1.5" strokeDasharray={o.ports&&status==='planned'?'3 2':undefined}/>
              <g transform={`rotate(${o.rotation}) translate(-9 -9)`} color={color} pointerEvents="none"><FloorIcon name={o.kind} size={18}/></g>
              {o.ports&&<g pointerEvents="none"><circle cx="11" cy="-11" r="5" fill={status==='verified'?'#13a478':status==='partially mapped'?'#edaa38':status==='planned'?'#2584d2':'#71879b'} stroke="white" strokeWidth="1.5"/>{status==='verified'&&<path d="M8-11l2 2 4-4" fill="none" stroke="white" strokeWidth="1.1"/>}</g>}
              <rect className="floor-symbol-label floor-item-label-box" x={labelBox.x} y={labelBox.y} width={labelBox.width} height={labelBox.height} rx="3" fill={o.kind==='idf'?'#164c70':'#fff'} stroke={color} strokeWidth=".6"/>
              <text className="floor-item-label-text" x={labelBox.x+labelBox.width/2} y={labelBox.y+4+labelBox.fontSize*.8} textAnchor="middle" fontSize={labelBox.fontSize} fontWeight="600" fill={o.kind==='idf'?'white':'#26495f'} pointerEvents="none">{labelBox.text}</text>
              {o.ports&&o.ports.length>1&&<text x="-12" y="5" fontSize="6" fill={color} pointerEvents="none">{o.ports.length}</text>}
              <rect className="floor-selection-outline" {...symbolBounds} fill="none" stroke="#087dd0" strokeWidth="1.5" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
              {active&&!locked&&tool==='select'&&['nw','ne','sw','se'].map(h=><rect key={h} data-symbol-resize={h} x={symbolBounds.x+(h.includes('e')?symbolBounds.width:0)-handleSize/2} y={symbolBounds.y+(h.includes('s')?symbolBounds.height:0)-handleSize/2} width={handleSize} height={handleSize} fill="white" stroke="#087dd0" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className={`resize-${h}`}/>)}
            </g>}
          </g>;
        })}
        {visibleObjects.filter(o=>isSymbol(o)&&(connecting||selected.includes(o.id))).flatMap(o=>objectConnectors(plan,o).map(connector=>{
          const highlighted=nearby?.objectId===o.id&&nearby.side===connector.side;
          return <g key={o.id+connector.side} className={`floor-connector${highlighted?' active':''}`} data-connector-object={o.id} data-connector-side={connector.side} pointerEvents="none">
            <title>{o.name} — {connector.side} connector</title>
            <circle cx={connector.point.x} cy={connector.point.y} r={(highlighted?6:4)/view.scale} fill={highlighted?'#087dd0':'white'} stroke="#087dd0" strokeWidth={1.5/view.scale}/>
          </g>;
        }))}
        {box&&<rect className="floor-selection-marquee" x={Math.min(box.a.x,box.b.x)} y={Math.min(box.a.y,box.b.y)} width={Math.abs(box.a.x-box.b.x)} height={Math.abs(box.a.y-box.b.y)} fill="#1689db" fillOpacity=".1" stroke="#1689db" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="5 3" pointerEvents="none"/>}
        {draft.length>0&&<g className="floor-route-draft" pointerEvents="none"><polyline points={pointsText(draft)} fill="none" stroke="#087dd0" strokeWidth={draftWeight} strokeDasharray={`${draftWeight*2.8} ${draftWeight*1.6}`}/>{draft.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={draftWeight*2} fill="#087dd0" stroke="white" strokeWidth={draftWeight*.5}/>)}{(draftingRoute||draft.length===1)&&cursor&&<line className="floor-route-next-segment" x1={draft.at(-1)!.x} y1={draft.at(-1)!.y} x2={cursor.x} y2={cursor.y} stroke="#087dd0" strokeWidth={draftWeight} strokeDasharray={`${draftWeight*2.8} ${draftWeight*1.6}`}/>}{tool==='measure'&&draft.length===2&&<text x={(draft[0].x+draft[1].x)/2} y={(draft[0].y+draft[1].y)/2-10} textAnchor="middle" fill="#064f87" stroke="white" strokeWidth="4" paintOrder="stroke" fontSize="14" fontWeight="700">{lengthLabel(plan,draft,props.unit)}</text>}</g>}
        {plan.calibration&&currentSegment&&<text className="floor-route-length" role="status" aria-label="Current segment length"
          x={(currentSegment[0].x+currentSegment[1].x)/2} y={(currentSegment[0].y+currentSegment[1].y)/2-draftWeight-12/view.scale}
          textAnchor="middle" fill="#064f87" stroke="white" strokeWidth={4/view.scale} paintOrder="stroke" fontSize={14/view.scale} fontWeight="700" pointerEvents="none">
          {lengthLabel(plan,currentSegment,props.unit)}
        </text>}
      </g>
    </svg>
    <div className="floor-canvas-caption"><span><i/>{plan.background.name}</span><span>{plan.calibration?'Calibrated drawing':'Uncalibrated · set scale to measure'}</span></div>
    <div className="floor-north" aria-hidden="true">N<span>↑</span></div>
  </div>;
}
