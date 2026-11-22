import { smbPortNumbers } from '../src/facility/smbSetup';
import { facilityPortLabel } from '../src/facility/portLabels';
import { defaultProject } from '../src/project';
import { defaultConfiguration } from '../src/configuration';
import test from 'node:test';
import assert from 'node:assert/strict';
import { connectRouteEndpoint, nearestConnector, objectConnectors, syncRouteConnections, createObject, duplicateObjects, effectiveLocationId, emptyFilters, gridSpacingInPlanUnits, itemLabelLayout, lengthLabel, objectVisible, moveRouteVertex, parseFloorPlan, removeObjects, resizeSmbPorts, routeLineWeight, samplePlan, selectionBounds, symbolLocalBounds, symbolWidthInPlanUnits, toolLineWeight, toolSymbolWidth } from '../src/facility/model';
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
test('route vertex editing moves only the selected point and allows diagonal segments',()=>{
  const points=[{x:10,y:10},{x:10,y:100},{x:100,y:100},{x:100,y:200}];
  const moved=moveRouteVertex(points,1,{x:30,y:120});
  assert.deepEqual(moved,[{x:10,y:10},{x:30,y:120},{x:100,y:100},{x:100,y:200}]);
  assert.deepEqual(points,[{x:10,y:10},{x:10,y:100},{x:100,y:100},{x:100,y:200}]);

});
test('floor imports reject unsafe assets, duplicates, invalid geometry and reference cycles',()=>{
  for(const change of [
    (p:ReturnType<typeof samplePlan>)=>{Object.assign(p,{symbolSize:'huge'});},
    (p:ReturnType<typeof samplePlan>)=>{p.background.src='https://example.com/track.svg';},
    (p:ReturnType<typeof samplePlan>)=>{p.objects[1].id=p.objects[0].id;},
    (p:ReturnType<typeof samplePlan>)=>{p.objects[0].width=Infinity;},
    (p:ReturnType<typeof samplePlan>)=>{p.objects[0].locationId=p.objects[1].id;p.objects[1].locationId=p.objects[0].id;},
    (p:ReturnType<typeof samplePlan>)=>{p.objects.find(o=>o.kind==='cable')!.points![1]={x:-1,y:50};},
  ]){const plan=samplePlan();change(plan);assert.throws(()=>parseFloorPlan(plan));}
});


test('SMBs receive unique sequential names and support every port count from one to eight',()=>{
  const plan=samplePlan();
  for(let count=1;count<=8;count++){
    const smb=createObject(plan,'outlet',{x:100,y:100},'outlets',count);
    assert.equal(smb.name,`SMB-${String(count).padStart(3,'0')}`);
    assert.equal(smb.ports!.length,count);
    assert.deepEqual(smb.ports!.map(p=>p.label),Array.from({length:count},(_,i)=>`${smb.name}-${i+1}`));
    assert.ok(smb.ports!.every(p=>p.mappingStatus==='unmapped'&&!p.idfId));
    plan.objects.push(smb);
  }
  assert.deepEqual(parseFloorPlan(JSON.parse(JSON.stringify(plan))),JSON.parse(JSON.stringify(plan)));
  for(const count of [0,9,-1,1.5,NaN])assert.throws(()=>createObject(plan,'outlet',{x:100,y:100},'outlets',count),/1 to 8/);
  const smb=plan.objects.at(-1)!;
  for(const ports of [[],[...smb.ports!,{...smb.ports![0],id:'ninth',label:'ninth'}]]){
    assert.throws(()=>parseFloorPlan({...plan,objects:[{...smb,ports}]}),/SMB/);
  }
});

test('SMB port count changes preserve retained identities and mappings and avoid label collisions',()=>{
  const plan=samplePlan(),smb=createObject(plan,'outlet',{x:100,y:100},'outlets');plan.objects.push(smb);
  Object.assign(smb.ports![0],{medium:'fiber',mappingStatus:'verified',idfId:'idf-01',patchPanelId:'PP-1',patchPanelPort:7,notes:'Keep me'});
  const original=structuredClone(smb);
  plan.objects.find(o=>o.kind==='plate')!.ports![0].label='SMB-001-2';
  const ports=resizeSmbPorts(plan,smb,8);
  assert.deepEqual(ports[0],original.ports![0]);assert.deepEqual(smb,original);
  assert.equal(ports.length,8);assert.equal(new Set(ports.map(p=>p.label)).size,8);
  assert.ok(!ports.some(p=>p.label==='SMB-001-2'));
  const expanded={...smb,ports};
  const updated={...plan,objects:plan.objects.map(o=>o.id===smb.id?expanded:o)};
  assert.deepEqual(parseFloorPlan(JSON.parse(JSON.stringify(updated))),JSON.parse(JSON.stringify(updated)));
  assert.deepEqual(resizeSmbPorts(updated,expanded,1),original.ports);
  assert.equal(createObject(updated,'outlet',{x:200,y:200},'outlets').name,'SMB-002');
});

test('duplicated SMBs receive fresh numbered identifiers and retain port counts without copying terminations',()=>{
  const plan=samplePlan();
  for(let i=0;i<2;i++)plan.objects.push(createObject(plan,'outlet',{x:100,y:100},'outlets',8));
  const originals=plan.objects.filter(o=>o.kind==='outlet');
  Object.assign(originals[0].ports![7],{medium:'fiber',mappingStatus:'verified',idfId:'idf-01',notes:'Original'});
  const result=duplicateObjects(plan,originals.map(o=>o.id));
  const copies=result.plan.objects.filter(o=>result.ids.includes(o.id));
  assert.deepEqual(copies.map(o=>o.name),['SMB-003','SMB-004']);
  assert.ok(copies.every(o=>o.ports!.length===8));
  assert.equal(copies[0].ports![7].medium,'fiber');
  assert.ok(copies.flatMap(o=>o.ports!).every(p=>p.mappingStatus==='unmapped'&&!p.idfId&&!p.notes));
  assert.equal(new Set(result.plan.objects.flatMap(o=>[o.id,...(o.ports?.map(p=>p.id)??[])])).size,result.plan.objects.length+result.plan.objects.reduce((n,o)=>n+(o.ports?.length??0),0));
  assert.deepEqual(parseFloorPlan(JSON.parse(JSON.stringify(result.plan))),JSON.parse(JSON.stringify(result.plan)));
});

test('legacy SMB names migrate without losing custom labels, mappings, route references or identities',()=>{
  const plan=samplePlan(),legacy=createObject(plan,'outlet',{x:100,y:100},'outlets');
  legacy.name='PORT-003';Object.assign(legacy.ports![0],{label:'PORT-003',mappingStatus:'verified',idfId:'idf-01',notes:'Existing connection'});
  plan.objects.push(legacy);
  const occupied=createObject(plan,'outlet',{x:200,y:200},'outlets');occupied.name='SMB-003';plan.objects.push(occupied);
  const custom=createObject(plan,'outlet',{x:300,y:200},'outlets');custom.name='Reception';custom.ports![0].label='Desk A';plan.objects.push(custom);
  const customPort=createObject(plan,'outlet',{x:400,y:200},'outlets');customPort.name='PORT-005';customPort.ports![0].label='Custom jack';plan.objects.push(customPort);
  const route=plan.objects.find(o=>o.kind==='cable')!;route.destinationId=legacy.id;
  const migrated=parseFloorPlan(plan),smb=migrated.objects.find(o=>o.id===legacy.id)!;
  assert.equal(legacy.name,'PORT-003');assert.equal(smb.name,'SMB-004');
  assert.deepEqual(smb.ports![0],{...legacy.ports![0],label:'SMB-004-1'});
  assert.deepEqual(migrated.objects.find(o=>o.id===route.id),route);
  assert.deepEqual(migrated.objects.find(o=>o.id===custom.id),custom);
  assert.equal(migrated.objects.find(o=>o.id===customPort.id)!.ports![0].label,'Custom jack');
  assert.equal(parseFloorPlan(migrated),migrated);
});


test('tool sizes persist independently and new objects capture defaults without resizing existing objects',()=>{
  const plan=samplePlan(),original=structuredClone(plan.objects);
  plan.symbolWidth=10;
  assert.equal(toolSymbolWidth(plan,'outlet'),10);
  assert.equal(toolLineWeight(plan,'tray'),4);
  plan.toolDefaults={outlet:{symbolWidth:5},camera:{symbolWidth:12},cable:{lineWeight:3},tray:{lineWeight:6}};
  const smb=createObject(plan,'outlet',{x:100,y:100},'outlets'),route=createObject(plan,'cable',{x:100,y:100},'paths');
  route.points!.push({x:200,y:100});plan.objects.push(smb,route);
  assert.equal(smb.symbolWidth,5);assert.equal(route.lineWeight,3);
  assert.equal(createObject(plan,'camera',{x:100,y:100},'cameras').symbolWidth,12);
  plan.toolDefaults.outlet={symbolWidth:9};plan.toolDefaults.cable={lineWeight:7};
  assert.equal(symbolWidthInPlanUnits(plan,smb),5);assert.equal(routeLineWeight(route),3);
  assert.deepEqual(plan.objects.slice(0,original.length),original);
  const imported=parseFloorPlan(JSON.parse(JSON.stringify(plan)));
  assert.deepEqual(imported.toolDefaults,plan.toolDefaults);
  const duplicate=duplicateObjects(imported,[smb.id,route.id]).plan.objects.slice(-2);
  assert.equal(duplicate[0].symbolWidth,5);assert.equal(duplicate[1].lineWeight,3);
  assert.equal(routeLineWeight(samplePlan().objects.find(o=>o.kind==='cable')!),2.5);
});

test('tool defaults and route weights reject malformed or out-of-range saved sizes',()=>{
  for(const toolDefaults of [null,[],{unknown:{symbolWidth:5}},{outlet:null},{outlet:{symbolWidth:0}},{outlet:{symbolWidth:Infinity}},{outlet:{symbolWidth:20001}},{cable:{symbolWidth:4}},{outlet:{lineWeight:4}},{cable:{lineWeight:0}},{cable:{lineWeight:201}},{cable:{lineWeight:NaN}},{cable:{other:3}}]){
    assert.throws(()=>parseFloorPlan({...samplePlan(),toolDefaults}),/tool/);
  }
  for(const lineWeight of [0,-1,201,NaN,Infinity]){
    const plan=samplePlan();plan.objects.find(o=>o.kind==='cable')!.lineWeight=lineWeight;
    assert.throws(()=>parseFloorPlan(plan),/line weight/);
  }
  const plan=samplePlan();plan.objects.find(o=>o.kind==='ap')!.lineWeight=3;
  assert.throws(()=>parseFloorPlan(plan),/line weight/);
});


test('diagonal routes round-trip and calibrated lengths follow each direct segment',()=>{
  const plan=samplePlan();plan.calibration={a:{x:0,y:0},b:{x:100,y:0},distance:10,unit:'ft'};
  for(const kind of ['cable','tray','conduit'] as const){
    const route=createObject(plan,kind,{x:100,y:100},'paths');
    route.points=[{x:100,y:100},{x:130,y:140},{x:160,y:100}];
    plan.objects.push(route);assert.equal(lengthLabel(plan,route.points),'10.0 ft');
  }
  const portable=JSON.parse(JSON.stringify(plan));assert.deepEqual(parseFloorPlan(portable),portable);
});


test('facility port prefixes follow the assigned frame and current prefix without rewriting labels or mappings',()=>{
  const project=defaultProject(defaultConfiguration(),'imperial');project.locations[0].portPrefix='B';
  const port={...samplePlan().objects.find(o=>o.ports)!.ports![0],idfId:'idf-01',patchPanelPort:225};
  const original=structuredClone(port);
  assert.equal(facilityPortLabel(port,project),'B225');
  assert.equal(facilityPortLabel({...port,patchPanelPort:1},project),'B001');
  assert.equal(facilityPortLabel({...port,patchPanelPort:12},project),'B012');
  assert.equal(facilityPortLabel({...port,patchPanelPort:1000},project),'B1000');
  assert.equal(facilityPortLabel({...port,patchPanelPort:undefined,label:'1'},project),'B001');
  project.locations[0].portPrefix='C';assert.equal(facilityPortLabel(port,project),'C225');
  assert.equal(facilityPortLabel({...port,patchPanelPort:0},project),'C000');
  assert.equal(facilityPortLabel({...port,patchPanelPort:undefined,label:'225'},project),'C225');
  assert.equal(facilityPortLabel({...port,idfId:undefined},project),port.label);
  assert.equal(facilityPortLabel({...port,idfId:'missing-frame'},project),port.label);
  assert.equal(facilityPortLabel({...port,patchPanelPort:undefined},project),port.label);
  project.locations[0].portPrefix='';assert.equal(facilityPortLabel(port,project),port.label);
  assert.deepEqual(port,original);
});


test('items inherit the smallest enclosing box and react to movement, resizing and deletion',()=>{
  let plan=samplePlan();const idf=plan.objects.find(o=>o.kind==='idf')!;
  const room={...createObject(plan,'location',{x:700,y:80},'rooms'),id:'com-b',name:'COM B',width:200,height:200};
  const inner={...room,id:'closet',name:'Closet',x:750,y:100,width:100,height:100};
  plan.objects.push(room,inner);
  assert.equal(effectiveLocationId(plan,idf),'closet');
  assert.equal(objectVisible(plan,idf,{...emptyFilters,location:'closet'}),true);
  assert.equal(objectVisible(plan,idf,{...emptyFilters,location:'room-201'}),false);
  plan.layers.find(l=>l.id==='rooms')!.visible=false;plan.layers.find(l=>l.id==='rooms')!.locked=true;
  assert.equal(effectiveLocationId(plan,idf),'closet');
  assert.equal(effectiveLocationId(plan,{...idf,x:890}),'com-b');
  assert.equal(effectiveLocationId(plan,{...idf,x:950}),undefined);
  inner.width=20;assert.equal(effectiveLocationId(plan,idf),'com-b');
  room.x=500;assert.equal(effectiveLocationId(plan,idf),undefined);
  room.width=400;assert.equal(effectiveLocationId(plan,idf),'com-b');
  plan.layers.find(l=>l.id==='rooms')!.locked=false;plan=removeObjects(plan,['com-b']);
  assert.equal(effectiveLocationId(plan,idf),undefined);
});

test('manual location overrides persist, while automatic copies and contained routes resolve their own locations',()=>{
  const plan=samplePlan(),marker=createObject(plan,'outlet',{x:450,y:200},'outlets');plan.objects.push(marker);
  assert.equal(effectiveLocationId(plan,marker),'room-201');
  const manual={...marker,locationMode:'manual' as const,locationId:'room-204'};
  assert.equal(effectiveLocationId(plan,manual),'room-204');
  assert.equal(effectiveLocationId(plan,{...manual,locationId:undefined}),undefined);
  assert.equal(effectiveLocationId(plan,{...manual,locationMode:'auto'}),'room-201');
  assert.equal(effectiveLocationId(plan,{...marker,locationId:'room-204'}),'room-204');
  const copies=duplicateObjects(plan,[marker.id]);
  assert.equal(effectiveLocationId(copies.plan,copies.plan.objects.at(-1)!),'room-201');
  const route=createObject(plan,'cable',{x:300,y:100},'paths');route.points=[{x:300,y:100},{x:400,y:200}];
  assert.equal(effectiveLocationId(plan,route),'room-201');route.points.push({x:500,y:300});
  assert.equal(effectiveLocationId(plan,route),undefined);
  const portable={...plan,objects:plan.objects.map(o=>o.id===marker.id?manual:o)};
  const imported=parseFloorPlan(JSON.parse(JSON.stringify(portable)));
  assert.equal(effectiveLocationId(imported,imported.objects.at(-1)!),'room-204');
  for(const locationMode of ['invalid',null,1])assert.throws(()=>parseFloorPlan({...plan,objects:[{...marker,locationMode}]}),/location mode/);
  assert.throws(()=>parseFloorPlan({...plan,objects:[{...plan.objects[0],locationMode:'auto'}]}),/location mode/);
});

test('equipment connectors use the four face edges and attached routes follow movement and size',()=>{
  const plan=samplePlan(),idf=plan.objects.find(o=>o.id==='idf-01')!;
  idf.symbolWidth=40;
  const connectors=objectConnectors(plan,idf);
  assert.deepEqual(connectors.map(c=>c.point),[{x:785,y:135},{x:805,y:155},{x:785,y:175},{x:765,y:155}]);
  assert.deepEqual(objectConnectors(plan,{...idf,labelStyle:{fontSize:48,offsetX:70,position:'right'}}),connectors);
  assert.equal(objectConnectors(plan,plan.objects[0]).length,0);
  assert.equal(nearestConnector(plan,[idf],{x:804,y:156},3)?.side,'right');
  assert.equal(nearestConnector(plan,[idf],{x:830,y:156},3),undefined);
  let route=plan.objects.find(o=>o.id==='path-201')!;
  route=connectRouteEndpoint(route,'source',connectors[1]);
  plan.objects=plan.objects.map(o=>o.id===route.id?route:o.id===idf.id?{...idf,x:800,y:200,symbolWidth:60}:o);
  const synced=syncRouteConnections(plan),updated=synced.objects.find(o=>o.id===route.id)!;
  assert.deepEqual(updated.points![0],{x:830,y:200});
  assert.deepEqual(updated.points!.slice(1),route.points!.slice(1));
  assert.equal(updated.sourceId,idf.id);assert.equal(updated.sourceSide,'right');
  assert.deepEqual(parseFloorPlan(JSON.parse(JSON.stringify(synced))),JSON.parse(JSON.stringify(synced)));
  const detached=connectRouteEndpoint(updated,'source');
  assert.equal(detached.sourceId,undefined);assert.equal(detached.sourceSide,undefined);
  assert.deepEqual(detached.points,updated.points);
});

test('connector attachments validate, clear on duplication or deletion, and rotate with the plan',()=>{
  const plan=samplePlan(),idf=plan.objects.find(o=>o.id==='idf-01')!;
  const route=connectRouteEndpoint(plan.objects.find(o=>o.id==='path-201')!,'source',objectConnectors(plan,idf)[2]);
  plan.objects=plan.objects.map(o=>o.id===route.id?route:o);
  const rotated=rotateFloorPlan(plan,true,plan.background.src),turned=rotated.objects.find(o=>o.id===route.id)!;
  assert.equal(turned.sourceSide,'left');
  assert.deepEqual(syncRouteConnections(rotated).objects.find(o=>o.id===route.id)!.points,turned.points);
  assert.deepEqual(rotateFloorPlan(rotated,false,plan.background.src),plan);
  const copied=duplicateObjects(plan,[route.id]).plan.objects.at(-1)!;
  assert.equal(copied.sourceId,undefined);assert.equal(copied.sourceSide,undefined);
  const removed=removeObjects(plan,[idf.id]);
  assert.equal(removed.objects.find(o=>o.id===route.id)!.sourceSide,undefined);parseFloorPlan(removed);
  for(const patch of [{sourceSide:'diagonal'},{sourceId:'room-201'},{sourceId:undefined}]){
    assert.throws(()=>parseFloorPlan({...plan,objects:plan.objects.map(o=>o.id===route.id?{...o,...patch}:o)}),/route connector/);
  }
});


test('SMB setup accepts inclusive ranges and individual numbers with at most eight unique ports',()=>{
  assert.deepEqual(smbPortNumbers('range','225','232',[]),[225,226,227,228,229,230,231,232]);
  assert.deepEqual(smbPortNumbers('range','1','1',[]),[1]);
  assert.deepEqual(smbPortNumbers('individual','','',['225','','231',' 280 ','','','','999999']),[225,231,280,999999]);
  for(const [start,end] of [['225','233'],['2','1'],['','2'],['0','2'],['1.5','2'],['-1','1'],['999999','1000000']])assert.throws(()=>smbPortNumbers('range',start,end,[]));
  for(const entries of [[],[''],['1','01'],['1.2'],['0'],['1000000'],['1e2'],Array.from({length:9},(_,i)=>String(i+1))])assert.throws(()=>smbPortNumbers('individual','','',entries));
});
