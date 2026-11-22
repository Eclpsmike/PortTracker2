import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProject } from '../src/project';
import { defaultConfiguration } from '../src/configuration';
import { samplePlan, type FloorPort } from '../src/facility/model';
import { rackPortIndex, resolveFloorPort, unplacedLocationPorts, locationPorts } from '../src/facility/portLocations';
import { locationPortsFixture } from './location-ports-fixture';
const fixture=()=>{
  const project=defaultProject(defaultConfiguration(),'metric');
  project.locations[0].portPrefix='B';
  project.locations[0].layout.portDetails={'CAB-A01/PP-A01/1':{facilityLocation:'Office 201',notes:'Keep these notes'},'CAB-A01/PP-A01/2':{facilityLocation:'Office 201',notes:''}};
  const plan=samplePlan();
  const port:FloorPort={id:'smb-port-1',label:'B001',medium:'copper',mappingStatus:'unmapped',notes:'',idfId:'idf-01',patchPanelPort:1};
  return {project,plan,port};
};
test('location port lists include hidden and unlinked map ports plus unplaced rack ports without duplicates',()=>{
  const {project,plan,room,smb,empty}=locationPortsFixture();
  const before=structuredClone({project,plan});
  const rows=locationPorts(project,plan,room);
  assert.equal(rows.length,5);
  assert.deepEqual(rows.map(row=>row.linked?.label??row.placements[0].port.label),['B001','Spare','B002','B006','B003']);
  assert.equal(rows[0].placements.length,2);
  assert.equal(rows[4].placements.length,0);
  assert.deepEqual({project,plan},before);
  assert.deepEqual(locationPorts(project,plan,empty),[]);
  smb.x=100;
  assert.equal(locationPorts(project,plan,room).length,4);
  assert.equal(locationPorts(project,plan,room).find(row=>row.linked?.label==='B001')!.placements.length,1);
});
test('floor ports resolve only unique frame numbers or explicit panel references',()=>{
  const {project,port}=fixture(),index=rackPortIndex(project);
  assert.equal(resolveFloorPort(port,index),null); // Two racks share the same number.
  const explicit={...port,rackId:'CAB-A01',patchPanelId:'PP-A01'};
  assert.equal(resolveFloorPort(explicit,index)?.endpoint.port,1);
  assert.equal(resolveFloorPort({...explicit,patchPanelId:'missing'},index),null);
  assert.equal(resolveFloorPort({...explicit,idfId:'missing'},index),null);
  assert.equal(resolveFloorPort({...port,rackId:'CAB-A01',patchPanelPort:25},index)?.equipment.id,'PP-A02');
  project.locations[0].layout.racks=project.locations[0].layout.racks.slice(0,1);
  assert.equal(resolveFloorPort(port,rackPortIndex(project))?.equipment.id,'PP-A01');
});
test('unplaced list excludes linked ports even on hidden layers and preserves their notes',()=>{
  const {project,plan,port}=fixture();
  assert.deepEqual(unplacedLocationPorts(project,plan,' office 201 ').map(p=>p.label),['B001','B002']);
  const plate=plan.objects.find(o=>o.id==='plate-201')!;
  plate.ports=[{...port,rackId:'CAB-A01',patchPanelId:'PP-A01'}];
  plan.layers.find(l=>l.id===plate.layerId)!.visible=false;
  assert.deepEqual(unplacedLocationPorts(project,plan,'Office 201').map(p=>p.label),['B002']);
  plate.ports=[];
  assert.equal(unplacedLocationPorts(project,plan,'Office 201')[0].details.notes,'Keep these notes');
  assert.deepEqual(unplacedLocationPorts(project,plan,'Other room'),[]);
});

test('map locations fill blank rack locations and replace existing assignments while preserving notes',async()=>{
  const {syncPlacedPortLocations}=await import('../src/facility/portLocations');
  const {project,plan,port}=fixture();
  project.locations[0].layout.racks=project.locations[0].layout.racks.slice(0,1);
  project.locations[0].layout.portDetails!['CAB-A01/PP-A01/1']={facilityLocation:'',notes:'Keep these notes'};
  const plate=plan.objects.find(o=>o.id==='plate-201')!;
  plate.ports=[port,{...port,id:'smb-port-2',patchPanelPort:2}];
  const updated=syncPlacedPortLocations(project,plan);
  assert.equal(updated.locations[0].layout.portDetails!['CAB-A01/PP-A01/1'].facilityLocation,'Office 201');
  assert.equal(updated.locations[0].layout.portDetails!['CAB-A01/PP-A01/1'].notes,'Keep these notes');
  assert.equal(project.locations[0].layout.portDetails!['CAB-A01/PP-A01/1'].facilityLocation,'');
  assert.ok(updated.configuration.facilityLocations!.some(l=>l.name==='Office 201'));
  assert.equal(syncPlacedPortLocations(updated,plan),updated);
  plan.objects.find(o=>o.id==='room-201')!.name='Different room';
  const renamed=syncPlacedPortLocations(updated,plan);
  assert.equal(renamed.locations[0].layout.portDetails!['CAB-A01/PP-A01/1'].facilityLocation,'Different room');
  assert.equal(renamed.locations[0].layout.portDetails!['CAB-A01/PP-A01/2'].facilityLocation,'Different room');
  assert.equal(renamed.locations[0].layout.portDetails!['CAB-A01/PP-A01/1'].notes,'Keep these notes');
});
test('ambiguous port numbers and conflicting map placements never update a rack port',async()=>{
  const {syncPlacedPortLocations}=await import('../src/facility/portLocations');
  const {project,plan,port}=fixture();project.locations[0].layout.portDetails={};
  plan.objects.find(o=>o.id==='plate-201')!.ports=[port];
  assert.equal(syncPlacedPortLocations(project,plan),project);
  project.locations[0].layout.racks=project.locations[0].layout.racks.slice(0,1);
  plan.objects.find(o=>o.id==='plate-204')!.ports=[{...port,id:'duplicate-link'}];
  assert.equal(syncPlacedPortLocations(project,plan),project);
});
