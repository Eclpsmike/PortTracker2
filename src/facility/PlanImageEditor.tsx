import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Icon } from '../components/Icon';
import { objectBounds, type FloorPlan, type Point } from './model';
import { cropFloorPlan, excludedObjects, fullCrop, renderPlanImage, rotateFloorPlan, validCrop, type CropBox } from './planTransforms';

export function PlanImageEditor({plan,onApply,onClose}:{plan:FloorPlan;onApply:(plan:FloorPlan)=>void;onClose:()=>void}) {
  const [draft,setDraft]=useState(plan),[crop,setCrop]=useState(()=>fullCrop(plan.background)),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const svg=useRef<SVGSVGElement>(null),dialog=useRef<HTMLDivElement>(null),start=useRef<Point|null>(null),busyRef=useRef(false);busyRef.current=busy;
  const closeRef=useRef(onClose);closeRef.current=onClose;
  const {width,height,src}=draft.background;
  const valid=validCrop(draft.background,crop),excluded=valid?excludedObjects(draft,crop):[];
  const unchanged=crop.x===0&&crop.y===0&&crop.width===width&&crop.height===height;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,element=dialog.current!;
    element.querySelector<HTMLButtonElement>('button')?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busyRef.current)closeRef.current();}
      if(e.key==='Tab'){
        const items=Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));
        if(!items.length)return;
        if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)!.focus();}
        else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0].focus();}
      }
    };
    element.addEventListener('keydown',key);return()=>{element.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
  },[]);
  function point(e:PointerEvent<SVGSVGElement>):Point {
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return {x:Math.round(Math.max(0,Math.min(width,p.x))),y:Math.round(Math.max(0,Math.min(height,p.y)))};
  }
  function move(e:PointerEvent<SVGSVGElement>){if(!start.current)return;const p=point(e),a=start.current;setCrop({x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),width:Math.abs(a.x-p.x),height:Math.abs(a.y-p.y)});}
  async function transform(operation:{clockwise:boolean}|CropBox){
    if(busy)return;setBusy(true);setError('');
    try{
      const source=await renderPlanImage(draft.background,operation);
      const next='clockwise' in operation?rotateFloorPlan(draft,operation.clockwise,source):cropFloorPlan(draft,operation,source);
      setDraft(next);setCrop(fullCrop(next.background));
    }catch(e){setError(e instanceof Error?e.message:'The image could not be edited.');}finally{setBusy(false);}
  }
  const calibrationWillReset=valid&&draft.calibration&&[draft.calibration.a,draft.calibration.b].some(p=>p.x<crop.x||p.y<crop.y||p.x>crop.x+crop.width||p.y>crop.y+crop.height);
  return <div className="floor-modal-backdrop"><div ref={dialog} role="dialog" aria-modal="true" aria-label="Rotate and crop floor plan" className="floor-dialog floor-image-editor">
    <div className="floor-image-heading"><div><h2>Rotate & crop floor plan</h2><p>Markers, rooms and routes stay aligned with the drawing.</p></div><button aria-label="Close image editor" disabled={busy} onClick={onClose}><Icon name="close"/></button></div>
    <div className="floor-image-tools"><button disabled={busy} onClick={()=>void transform({clockwise:false})}><Icon name="reset"/>Rotate left 90°</button><button disabled={busy} onClick={()=>void transform({clockwise:true})}><Icon name="reset" style={{transform:'scaleX(-1)'}}/>Rotate right 90°</button><button disabled={busy||draft===plan} onClick={()=>{setDraft(plan);setCrop(fullCrop(plan.background));setError('');}}>Reset edits</button><span>{width} × {height}</span></div>
    <p className="floor-hint">Drag over the image to select a crop, or enter its position and size below. All overlays are shown here, including hidden layers.</p>
    <div className="floor-crop-preview"><svg ref={svg} role="img" aria-label="Floor plan crop preview" viewBox={`0 0 ${width} ${height}`} onPointerDown={e=>{if(busy||e.button!==0)return;start.current=point(e);e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={move} onPointerUp={e=>{move(e);start.current=null;}} onPointerCancel={()=>{start.current=null;}}>
      <image href={src} width={width} height={height}/>
      <g pointerEvents="none">{draft.objects.map(o=>{
        const color=o.color??draft.layers.find(l=>l.id===o.layerId)!.color,b=objectBounds(o);
        return o.points?<polyline key={o.id} points={o.points.map(p=>`${p.x},${p.y}`).join(' ')} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none"/>:o.kind==='location'?<rect key={o.id} {...b} fill={color} fillOpacity=".08" stroke={color} vectorEffect="non-scaling-stroke"/>:<circle key={o.id} cx={o.x} cy={o.y} r={Math.max(width,height)/140} fill={color} stroke="white" vectorEffect="non-scaling-stroke"/>;
      })}</g>
      {valid&&<g pointerEvents="none"><path d={`M0 0H${width}V${height}H0Z M${crop.x} ${crop.y}v${crop.height}h${crop.width}v-${crop.height}Z`} fill="#16354b" fillOpacity=".48" fillRule="evenodd"/><rect data-crop-selection x={crop.x} y={crop.y} width={crop.width} height={crop.height} fill="none" stroke="#1689db" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="7 4"/></g>}
    </svg></div>
    <fieldset disabled={busy} className="floor-crop-fields">{(['x','y','width','height'] as const).map(key=><label key={key}>{({x:'Crop left',y:'Crop top',width:'Crop width',height:'Crop height'})[key]}<input aria-label={`Crop ${key}`} type="number" min={key==='width'||key==='height'?1:0} step={1} value={Number.isNaN(crop[key])?'':crop[key]} onChange={e=>setCrop({...crop,[key]:e.target.valueAsNumber})}/></label>)}</fieldset>
    {!valid&&<p className="floor-warning" role="status">Choose a crop inside the drawing with a positive width and height.</p>}
    {!!excluded.length&&<p className="floor-warning" role="status">This crop excludes {excluded.length} object(s): {excluded.slice(0,3).map(o=>o.name).join(', ')}{excluded.length>3?'…':''}. Expand the crop or move these objects first.</p>}
    {calibrationWillReset&&<p className="floor-hint">A calibration point is outside this crop. The scale will be cleared; recalibrate after cropping.</p>}
    {plan.calibration&&!draft.calibration&&<p className="floor-hint">This crop cleared the previous scale. Recalibrate the drawing after applying.</p>}
    {error&&<p className="floor-warning" role="alert">{error}</p>}
    <div className="floor-image-tools"><button disabled={busy||!valid||!!excluded.length||unchanged} onClick={()=>void transform(crop)}>Crop to selection</button><button disabled={busy||unchanged} onClick={()=>setCrop(fullCrop(draft.background))}>Clear crop selection</button><span>{busy?'Updating preview…':'Original upload is preserved.'}</span></div>
    <div className="floor-actions"><button disabled={busy} onClick={onClose}>Cancel</button><button className="floor-primary" disabled={busy||draft===plan||!unchanged} onClick={()=>onApply(draft)}>Apply image changes</button></div>
    {!unchanged&&<p className="floor-hint">Choose Crop to selection or Clear crop selection before applying.</p>}
  </div></div>;
}
