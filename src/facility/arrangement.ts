import { gridSpacingInPlanUnits, isRoute, objectBounds, translateObject, type FloorObject, type FloorPlan } from './model';

export type ArrangementAxis='horizontal'|'vertical';
export type ArrangementAction='align-horizontal'|'align-vertical'|'increase'|'decrease'|'distribute';
export const arrangeableObjects=(plan:FloorPlan,objects:readonly FloorObject[])=>objects.filter(o=>!isRoute(o)&&!plan.layers.find(layer=>layer.id===o.layerId)?.locked);
const center=(o:FloorObject)=>({x:o.x+(o.kind==='location'?o.width!/2:0),y:o.y+(o.kind==='location'?o.height!/2:0)});
export function arrangementAxis(objects:readonly FloorObject[]):ArrangementAxis{
  const points=objects.map(center);
  const span=(axis:'x'|'y')=>Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]));
  return span('y')>span('x')?'vertical':'horizontal';
}

export function arrangeObjects(plan:FloorPlan,selected:readonly FloorObject[],action:ArrangementAction,axis:ArrangementAxis):FloorObject[]{
  const objects=arrangeableObjects(plan,selected);
  if(objects.length<2||(action==='distribute'&&objects.length<3))return [];
  const align=action==='align-horizontal'||action==='align-vertical';
  const coordinate=align?(action==='align-horizontal'?'y':'x'):(axis==='horizontal'?'x':'y');
  const sorted=objects.map(object=>({object,value:center(object)[coordinate]})).sort((a,b)=>a.value-b.value);
  const start=sorted[0].value,end=sorted.at(-1)!.value,middle=(start+end)/2;
  let step=gridSpacingInPlanUnits(plan);
  if(action==='decrease'){
    const smallestGap=Math.min(...sorted.slice(1).map((item,i)=>item.value-sorted[i].value));
    // Keep at least one grid interval between centers and never reverse their order.
    step=-Math.min(step,Math.max(0,smallestGap-step));
  }
  const updates=sorted.map(({object,value},i)=>{
    const target=align?middle:action==='distribute'?start+(end-start)*i/(sorted.length-1):value+(i-(sorted.length-1)/2)*step;
    return translateObject(object,coordinate==='x'?target-value:0,coordinate==='y'?target-value:0);
  });
  // Stop at the drawing boundary instead of clipping or distorting the arrangement.
  if(updates.some(object=>{const b=objectBounds(object);return b.x<0||b.y<0||b.x+b.width>plan.background.width||b.y+b.height>plan.background.height;}))return [];
  return updates.filter(object=>{const original=objects.find(o=>o.id===object.id)!;return Math.abs(original.x-object.x)>1e-8||Math.abs(original.y-object.y)>1e-8;});
}
