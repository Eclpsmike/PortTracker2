import { useEffect, useRef, useState, type PointerEvent, type MouseEvent, type KeyboardEvent } from 'react';
import { EQUIPMENT_FACE, UNIT, equipmentPosition, rackOriginX, rackTop } from '../geometry';
import { equipmentUnits, placementError, type Layout } from '../model';

export type EquipmentSelection={rackId:string;equipmentId:string};
export type EquipmentDrop=EquipmentSelection&{bottomU:number;heightU:number;x:number;y:number;error:string|null;label:string};
export function useRackEquipmentDrag({layout,rackIds,enabled,onSelect,onMove,onMessage}:{
  layout:Layout;rackIds:string[];enabled:boolean;onSelect:(selection:EquipmentSelection)=>void;
  onMove:(selection:EquipmentSelection,bottomU:number)=>void;onMessage:(message:string)=>void;
}){
  const [preview,setPreview]=useState<EquipmentDrop|null>(null);
  const drag=useRef<{pointerId:number;svg:SVGSVGElement;host:HTMLDivElement;selection:EquipmentSelection;offsetY:number;clientX:number;clientY:number;moved:boolean}|null>(null);
  const suppressClick=useRef(false);
  function point(svg:SVGSVGElement,event:{clientX:number;clientY:number}){
    const matrix=svg.getScreenCTM();if(!matrix)return null;
    return new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
  }
  function reset(){const current=drag.current;drag.current=null;setPreview(null);if(current?.host.hasPointerCapture(current.pointerId))current.host.releasePointerCapture(current.pointerId);}
  useEffect(()=>{reset();},[enabled,layout.racks,rackIds.join('/')]);
  useEffect(()=>()=>{const current=drag.current;if(current?.host.hasPointerCapture(current.pointerId))current.host.releasePointerCapture(current.pointerId);},[]);
  function proposal(event:{clientX:number;clientY:number}):EquipmentDrop|null{
    const current=drag.current;if(!current)return null;
    const rack=layout.racks.find(r=>r.id===current.selection.rackId),equipment=rack?.equipment.find(e=>e.id===current.selection.equipmentId),p=point(current.svg,event);
    if(!rack||!equipment||!p)return null;
    const x=rackOriginX(layout,rack.id,rackIds)+EQUIPMENT_FACE.x;
    const bottomU=rack.heightU-Math.round((p.y-current.offsetY-rackTop(layout,rack.id,rackIds))/UNIT)-equipment.heightU+1;
    const viewport=current.host.getBoundingClientRect();
    const outside=p.x<x||p.x>x+EQUIPMENT_FACE.width||event.clientX<viewport.left||event.clientX>viewport.right||event.clientY<viewport.top||event.clientY>viewport.bottom;
    const error=outside?`Drop inside ${rack.label}.`:placementError(rack,bottomU,equipment.heightU,equipment.id);
    return {...current.selection,bottomU,heightU:equipment.heightU,x,y:rackTop(layout,rack.id,rackIds)+(rack.heightU-bottomU-equipment.heightU+1)*UNIT,error,label:`${equipment.label} · ${equipmentUnits({...equipment,bottomU})}`};
  }
  return {preview,handlers:{
    onPointerDown(event:PointerEvent<HTMLDivElement>){
      if(!enabled||event.button!==0)return;
      if(drag.current){suppressClick.current=true;reset();return;}
      const target=(event.target as Element).closest('[data-equipment-drag]');
      const rackId=target?.getAttribute('data-rack-id'),equipmentId=target?.getAttribute('data-equipment-id');
      const svg=event.currentTarget.querySelector<SVGSVGElement>('.rack-scene');
      const equipment=layout.racks.find(r=>r.id===rackId)?.equipment.find(e=>e.id===equipmentId);
      if(!rackId||!equipmentId||!equipment||!svg)return;
      const p=point(svg,event);if(!p)return;
      event.preventDefault();event.currentTarget.focus({preventScroll:true});suppressClick.current=false;
      const selection={rackId,equipmentId};onSelect(selection);
      drag.current={pointerId:event.pointerId,svg,host:event.currentTarget,selection,offsetY:p.y-equipmentPosition(layout,rackId,equipment,rackIds).y,clientX:event.clientX,clientY:event.clientY,moved:false};
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event:PointerEvent<HTMLDivElement>){
      const current=drag.current;if(!current||current.pointerId!==event.pointerId)return;
      if(!current.moved&&Math.hypot(event.clientX-current.clientX,event.clientY-current.clientY)<4)return;
      current.moved=true;event.preventDefault();setPreview(proposal(event));
    },
    onPointerUp(event:PointerEvent<HTMLDivElement>){
      const current=drag.current;if(!current||current.pointerId!==event.pointerId)return;
      const drop=current.moved?proposal(event):null;suppressClick.current=current.moved;reset();
      if(!drop)return;
      if(drop.error)onMessage(drop.error);else onMove(current.selection,drop.bottomU);
    },
    onPointerCancel(){suppressClick.current=!!drag.current?.moved;reset();},
    onLostPointerCapture(){if(drag.current){suppressClick.current=drag.current.moved;reset();}},
    onClickCapture(event:MouseEvent<HTMLDivElement>){if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}},
    onKeyDown(event:KeyboardEvent<HTMLDivElement>){if(event.key==='Escape'&&drag.current){event.preventDefault();suppressClick.current=drag.current.moved;reset();onMessage('Equipment move cancelled.');}},
    onDragStart(event:React.DragEvent<HTMLDivElement>){event.preventDefault();},
  }};
}
