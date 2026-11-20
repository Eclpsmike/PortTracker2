import test from 'node:test';
import assert from 'node:assert/strict';
import { createObject, duplicateObjects, emptyFilters, gridSpacingInPlanUnits, itemLabelLayout, lengthLabel, objectVisible, orthogonalSegment, orthogonalVertex, parseFloorPlan, removeObjects, samplePlan, selectionBounds, symbolLocalBounds, symbolWidthInPlanUnits } from '../src/facility/model';
import { cropFloorPlan, excludedObjects, rotateFloorPlan, validCrop } from '../src/facility/planTransforms';

test('quarter-turn image rotation preserves overlay identities, routes and calibrated lengths',()=>{
  const plan=samplePlan();plan.calibration={a:{x:100,y:100},b:{x:200,y:100},distance:10,unit:'ft'};
  const rotated=rotateFloorPlan(plan,true,plan.background.src);parseFloorPlan(rotated);
  assert.equal(rotated.background.width,650);assert.equal(rotated.background.height,1100);
  assert.deepEqual(rotated.objects[0],{...plan.objects[0],x:650-plan.objects[0].y-plan.objects[0].height!,y:plan.objects[0].x,width:plan.objects[0].height,height:plan.objects[0].width});
  assert.deepEqual(rotated.objects.find(o=>o.id==='plate-204')!.ports,plan.objects.find(o=>o.id==='plate-204')!.ports);
  const route=plan.objects.find(o=>o.id==='path-204')!,newRoute=rotated.objects.find(o=>o.id===route.id)!;
  assert.equal(lengthLabel(plan,route.points!),lengthLabel(rotated,newRoute.points!));
  assert.deepEqual(rotateFloorPlan(rotated,false,plan.background.src),plan);
});
test('cropping translates all overlays and retains calibration when its points remain inside',()=>{
  const plan=samplePlan();plan.calibration={a:{x:100,y:100},b:{x:200,y:100},distance:10,unit:'ft'};
  plan.layers.find(l=>l.id==='outlets')!.visible=false;plan.layers.find(l=>l.id==='rooms')!.locked=true;
  const crop={x:50,y:50,width:1000,height:550};assert.equal(excludedObjects(plan,crop).length,0);
  const result=cropFloorPlan(plan,crop,plan.background.src);parseFloorPlan(result);
  assert.deepEqual(result.calibration,{...plan.calibration,a:{x:50,y:50},b:{x:150,y:50}});
  assert.equal(result.objects[0].x,plan.objects[0].x-50);assert.equal(result.objects[0].y,plan.objects[0].y-50);
  assert.equal(result.objects.find(o=>o.id==='path-204')!.points![0].x,735);
  assert.deepEqual(result.layers,plan.layers);
  assert.throws(()=>cropFloorPlan(plan,{x:300,y:300,width:200,height:200},plan.background.src),/excludes/);
  assert.equal(validCrop(plan.background,{x:0,y:0,width:-1,height:20}),false);
});
test('crop resets excluded calibration without discarding the original upload',()=>{
  const plan=samplePlan();plan.objects=[];
  plan.background.original={name:'source.pdf',data:'data:application/pdf;base64,AAAA',page:1};
  plan.calibration={a:{x:10,y:10},b:{x:100,y:10},distance:10,unit:'ft'};
  const cropped=cropFloorPlan(plan,{x:50,y:50,width:100,height:100},'data:image/png;base64,AAAA');
  assert.equal(cropped.calibration,null);assert.deepEqual(cropped.background.original,plan.background.original);
  assert.equal(plan.background.width,1100);assert.equal(plan.calibration.distance,10);
});

test('handoff single-floor files migrate stable IDs and port statuses into native exports',()=>{
  const native=parseFloorPlan({schemaVersion:1,id:'handoff',building:'Building A',floor:'Floor 1',background:{path:'sample-floorplan.svg',width:1100,height:650},calibration:null,
    layers:[{id:'outlets',name:'Network Outlets',visible:true,locked:false,order:0,color:'#1689db'}],locations:[],devices:[],routes:[],
    wallPlates:[{id:'plate-204',layerId:'outlets',x:470,y:475,ports:[{id:'A-204-01',status:'unmapped'}]}]});
  assert.equal(native.kind,'porttracker-facility');assert.equal(native.objects[0].ports![0].id,'A-204-01');
  assert.equal(native.objects[0].ports![0].mappingStatus,'unmapped');assert.equal('wallPlates' in native,false);
  assert.deepEqual(parseFloorPlan(JSON.parse(JSON.stringify(native))),native);
});

test('sample floor is valid and outlets do not require routes or terminations',()=>{
  const plan=samplePlan(); assert.equal(parseFloorPlan(plan),plan);
  const plate=createObject(plan,'plate',{x:100,y:100},'outlets',4);
  plan.objects.push(plate);assert.equal(parseFloorPlan(plan),plan);
  assert.equal(plate.ports!.length,4);assert.ok(plate.ports!.every(p=>p.mappingStatus==='unmapped'&&!p.idfId&&!p.patchPanelId&&!p.switchId));
  assert.ok(!plan.objects.some(o=>o.sourceId===plate.id||o.destinationId===plate.id));
});
test('floor plan distances require calibration and are independent of viewport',()=>{
  const plan=samplePlan(), points=[{x:0,y:0},{x:100,y:0},{x:100,y:100}];
  assert.equal(lengthLabel(plan,points),'Uncalibrated');
  plan.calibration={a:{x:0,y:0},b:{x:100,y:0},distance:10,unit:'ft'};
  assert.equal(lengthLabel(plan,points),'20.0 ft');assert.equal(lengthLabel(plan,points,'m'),'6.1 m');
  plan.calibration.b=plan.calibration.a;assert.throws(()=>parseFloorPlan(plan),/calibration/);
});
test('physical grid spacing converts units and survives missing calibration without altering geometry',()=>{
  const plan=samplePlan(),objects=structuredClone(plan.objects);
  assert.equal(gridSpacingInPlanUnits(plan),10);
  plan.grid={spacing:2.5,unit:'ft'};assert.equal(gridSpacingInPlanUnits(plan),10);
  plan.calibration={a:{x:0,y:0},b:{x:100,y:0},distance:10,unit:'ft'};
  assert.equal(gridSpacingInPlanUnits(plan),25);
  plan.grid={spacing:.762,unit:'m'};assert.ok(Math.abs(gridSpacingInPlanUnits(plan)-25)<1e-10);
  plan.calibration={...plan.calibration,distance:3.048,unit:'m'};
  plan.grid={spacing:2.5,unit:'ft'};assert.ok(Math.abs(gridSpacingInPlanUnits(plan)-25)<1e-10);
  assert.deepEqual(plan.objects,objects);assert.deepEqual(parseFloorPlan(JSON.parse(JSON.stringify(plan))).grid,plan.grid);
  for(const grid of [{spacing:0,unit:'ft'},{spacing:NaN,unit:'ft'},{spacing:2,unit:'yards'},null])assert.throws(()=>parseFloorPlan({...plan,grid}),/grid spacing/);
});
test('saved symbol width overrides legacy presets and stays independent of grid and calibration',()=>{
  const plan=samplePlan();plan.symbolSize='small';assert.ok(Math.abs(symbolWidthInPlanUnits(plan)-19.6)<1e-10);
  plan.symbolWidth=2;plan.grid={spacing:50,unit:'plan'};
  plan.calibration={a:{x:0,y:0},b:{x:100,y:0},distance:50,unit:'ft'};
  assert.equal(symbolWidthInPlanUnits(parseFloorPlan(JSON.parse(JSON.stringify(plan)))),2);
  for(const symbolWidth of [0,-1,Infinity,NaN,20001])assert.throws(()=>parseFloorPlan({...plan,symbolWidth}),/symbol width/);
});
test('item width overrides the default and selection bounds include the label without changing its anchor',()=>{
  const plan=samplePlan(),item=plan.objects.find(o=>o.id==='plate-204')!;
  plan.symbolWidth=40;item.symbolWidth=10;const original=structuredClone(item);
  assert.equal(symbolWidthInPlanUnits(plan,item),10);
  const b=selectionBounds(plan,item);assert.ok(b.x<item.x-5);assert.ok(b.y<item.y-5);assert.ok(b.y+b.height>item.y+10);
  plan.symbolWidth=80;assert.deepEqual(selectionBounds(plan,item),b);assert.deepEqual(item,original);
  assert.equal(parseFloorPlan(JSON.parse(JSON.stringify(plan))).objects.find(o=>o.id===item.id)!.symbolWidth,10);
  for(const width of [0,-1,Infinity,20001]){item.symbolWidth=width;assert.throws(()=>parseFloorPlan(plan),/item symbol width/);}
});
test('label placement and font sizing update selection extents and validate saved styles',()=>{
  const plan=samplePlan(),item=plan.objects.find(o=>o.id==='ap-01')!;
  for(const position of ['above','below','left','right','center'] as const){
    item.labelStyle={fontSize:24,position,offsetX:12,offsetY:-8};
    const label=itemLabelLayout(item),bounds=symbolLocalBounds(item);
    assert.ok(bounds.x<label.x&&bounds.y<label.y);
    assert.ok(bounds.x+bounds.width>label.x+label.width&&bounds.y+bounds.height>label.y+label.height);
    assert.deepEqual(parseFloorPlan(JSON.parse(JSON.stringify(plan))).objects.find(o=>o.id===item.id)!.labelStyle,item.labelStyle);
  }
  for(const style of [{fontSize:0},{fontSize:97},{offsetX:Infinity},{offsetY:NaN},{position:'top-left'}]){
    Object.assign(item,{labelStyle:style});assert.throws(()=>parseFloorPlan(plan),/label style/);
  }
});
test('layer and metadata visibility compose without changing stored objects',()=>{
  const plan=samplePlan(),plate=plan.objects.find(o=>o.id==='plate-204')!;
  assert.ok(objectVisible(plan,plate,{...emptyFilters,status:'unmapped'}));
  assert.equal(objectVisible(plan,plate,{...emptyFilters,status:'verified'}),false);
  plan.layers.find(l=>l.id==='outlets')!.visible=false;
  assert.equal(objectVisible(plan,plate,emptyFilters),false);assert.equal(plate.ports!.length,4);
});
test('duplicate gives objects and ports fresh identities and clears physical mappings',()=>{
  const plan=samplePlan(),plate=plan.objects.find(o=>o.id==='plate-204')!;
  plate.ports![0].idfId='idf-01';plate.ports![0].mappingStatus='verified';
  const result=duplicateObjects(plan,[plate.id,'room-204','path-204']);parseFloorPlan(result.plan);
  const copy=result.plan.objects.find(o=>result.ids.includes(o.id)&&o.kind==='plate')!;
  assert.notEqual(copy.id,plate.id);assert.notEqual(copy.locationId,plate.locationId);
  assert.notEqual(copy.ports![0].id,plate.ports![0].id);assert.equal(copy.ports![0].idfId,undefined);assert.equal(copy.ports![0].mappingStatus,'unmapped');
  assert.equal(result.plan.objects.find(o=>result.ids.includes(o.id)&&o.kind==='cable')!.destinationId,undefined);
});
test('deleting a location or route endpoint clears references and respects locked layers',()=>{
  let plan=samplePlan(); plan.layers.find(l=>l.id==='outlets')!.locked=true;
  plan=removeObjects(plan,['plate-204']); assert.ok(plan.objects.some(o=>o.id==='plate-204'));
  plan=removeObjects(plan,['room-204']); assert.equal(plan.objects.find(o=>o.id==='plate-204')!.locationId,undefined);
  plan.layers.find(l=>l.id==='outlets')!.locked=false;plan=removeObjects(plan,['plate-204']);
  assert.equal(plan.objects.find(o=>o.id==='path-204')!.destinationId,undefined);parseFloorPlan(plan);
});
test('route vertex editing preserves orthogonal neighboring segments',()=>{
  const points=[{x:10,y:10},{x:10,y:100},{x:100,y:100},{x:100,y:200}];
  const moved=orthogonalVertex(points,1,{x:30,y:120});
  assert.deepEqual(moved,[{x:30,y:10},{x:30,y:120},{x:100,y:120},{x:100,y:200}]);
  assert.deepEqual(orthogonalSegment({x:1,y:2},{x:3,y:4}),[{x:3,y:2},{x:3,y:4}]);
});
test('floor imports reject unsafe assets, duplicates, invalid geometry and reference cycles',()=>{
  for(const change of [
    (p:ReturnType<typeof samplePlan>)=>{Object.assign(p,{symbolSize:'huge'});},
    (p:ReturnType<typeof samplePlan>)=>{p.background.src='https://example.com/track.svg';},
    (p:ReturnType<typeof samplePlan>)=>{p.objects[1].id=p.objects[0].id;},
    (p:ReturnType<typeof samplePlan>)=>{p.objects[0].width=Infinity;},
    (p:ReturnType<typeof samplePlan>)=>{p.objects[0].locationId=p.objects[1].id;p.objects[1].locationId=p.objects[0].id;},
    (p:ReturnType<typeof samplePlan>)=>{p.objects.find(o=>o.kind==='cable')!.points![1]={x:50,y:50};},
  ]){const plan=samplePlan();change(plan);assert.throws(()=>parseFloorPlan(plan));}
});
