import { useState } from 'react';
import { arrangementAxis, arrangeableObjects, arrangeObjects, type ArrangementAction, type ArrangementAxis } from './arrangement';
import { gridSpacingInPlanUnits, type FloorObject, type FloorPlan } from './model';

export function FloorArrange({plan,selected,onArrange}:{plan:FloorPlan;selected:FloorObject[];onArrange:(objects:FloorObject[])=>void}){
  const objects=arrangeableObjects(plan,selected);
  const step=plan.grid&&plan.grid.unit!=='plan'&&plan.calibration?`${plan.grid.spacing} ${plan.grid.unit}`:`${Number(gridSpacingInPlanUnits(plan).toPrecision(6))} plan units`;
  const [axis,setAxis]=useState<ArrangementAxis>(()=>arrangementAxis(objects));
  const actions:[ArrangementAction,string,string][]=[
    ['align-horizontal','Align horizontally','Align centers in a horizontal row.'],
    ['align-vertical','Align vertically','Align centers in a vertical column.'],
    ['decrease','Decrease spacing','Bring centers closer while keeping at least one grid interval between them.'],
    ['increase','Increase spacing','Spread centers apart by one grid interval between neighboring items.'],
    ['distribute','Distribute evenly','Space three or more centers evenly between the first and last item.'],
  ];
  function button([action,label,help]:typeof actions[number]){
    const updates=arrangeObjects(plan,selected,action,axis);
    return <button key={action} type="button" title={help} disabled={!updates.length} onClick={()=>{
      if(action==='align-horizontal')setAxis('horizontal');
      if(action==='align-vertical')setAxis('vertical');
      onArrange(updates);
    }}>{label}</button>;
  }
  return <section className="floor-arrange" aria-label="Arrange selected items">
    <h4>Arrange</h4>
    <div className="floor-arrange-buttons">{actions.slice(0,2).map(button)}</div>
    <label>Spacing direction<select aria-label="Spacing direction" value={axis} onChange={event=>setAxis(event.target.value as ArrangementAxis)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
    <div className="floor-arrange-buttons">{actions.slice(2,4).map(button)}</div>
    {button(actions[4])}
    <p className="floor-hint" title="Uses the current grid spacing. Symbol labels do not affect alignment. Locked items and paths are excluded; connected paths follow their items. Arrangements stop at the drawing boundary.">{objects.length} items · spacing step {step}</p>
  </section>;
}
