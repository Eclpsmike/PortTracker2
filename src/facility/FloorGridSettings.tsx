import { CommitField } from './FloorProperties';
import { gridSpacingInPlanUnits, unitsPerPoint, type FloorPlan } from './model';

export function FloorGridSettings({plan,onChange}:{plan:FloorPlan;onChange:(plan:FloorPlan)=>void}) {
  const grid=plan.grid??{spacing:10,unit:'plan' as const};
  function changeUnit(unit:NonNullable<FloorPlan['grid']>['unit']) {
    let spacing=gridSpacingInPlanUnits(plan);
    if(unit!=='plan') {
      const scale=unitsPerPoint(plan);if(scale===null)return;
      spacing*=scale*(unit===plan.calibration!.unit?1:unit==='ft'?1/.3048:.3048);
    }
    onChange({...plan,grid:{unit,spacing:Number(spacing.toPrecision(12))}});
  }
  return <>
    <CommitField label="Grid spacing" type="number" min={.001} max={1000000} step="any" value={grid.spacing} onCommit={value=>onChange({...plan,grid:{...grid,spacing:Number(value)}})}/>
    <label>Grid units<select aria-label="Grid units" value={grid.unit} onChange={e=>changeUnit(e.target.value as typeof grid.unit)}><option value="plan">Plan units</option><option value="ft" disabled={!plan.calibration}>Feet</option><option value="m" disabled={!plan.calibration}>Meters</option></select></label>
    <span className="floor-hint">Spacing sets the distance between grid lines. Existing items stay in place; snapping applies when you place or move items.</span>
    {!plan.calibration&&<span className="floor-hint">Calibrate scale to use feet or meters.{grid.unit!=='plan'?' Showing a 10 plan-unit grid until calibrated.':''}</span>}
  </>;
}
