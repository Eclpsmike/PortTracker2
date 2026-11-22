import { defaultProject } from '../src/project';
import { defaultConfiguration } from '../src/configuration';
import { createObject, samplePlan } from '../src/facility/model';

export function locationPortsFixture(){
  const project=defaultProject(defaultConfiguration(),'metric'),frame=project.locations[0];frame.portPrefix='B';
  frame.layout={racks:[{id:'R1',label:'Rack A',heightU:12,positionM:0,equipment:[
    {id:'P1',label:'Panel 1',kind:'patch-panel',bottomU:4,heightU:1,portCount:6},
    {id:'SW1',label:'Switch 1',kind:'switch',bottomU:2,heightU:1,portCount:2},
  ]}],cables:[{id:'CBL-0001',from:{rackId:'R1',equipmentId:'P1',port:1},to:{rackId:'R1',equipmentId:'SW1',port:1},vlan:30,jacket:'#159de7'}],portVlans:{'R1/SW1/1':10},portDetails:{
    'R1/P1/3':{facilityLocation:'Office 201',notes:''},'R1/P1/4':{facilityLocation:'Office 204',notes:''},'R1/P1/5':{facilityLocation:'Office 201',notes:''},
  }};
  const plan=samplePlan();plan.objects=plan.objects.filter(o=>o.kind==='location');
  function add(kind:'outlet'|'plate',name:string,ports:(number|null)[],layer='outlets'){
    const object=createObject(plan,kind,{x:350,y:180},layer,ports.length);object.name=name;
    object.ports=object.ports!.map((port,i)=>ports[i]===null?{...port,label:'Spare'}:{...port,idfId:frame.id,patchPanelPort:ports[i]!});
    plan.objects.push(object);return object;
  }
  const smb=add('outlet','SMB A',[1,null]);
  add('outlet','SMB B',[2],'devices');plan.layers.find(layer=>layer.id==='devices')!.visible=false;
  add('outlet','Shared jack',[1]);add('plate','Wall plate',[6]);
  const outside=add('outlet','Other room',[5]);outside.locationMode='manual';outside.locationId='room-204';
  const empty=createObject(plan,'location',{x:800,y:400},'rooms');empty.name='Empty room';plan.objects.push(empty);
  return {project,plan,smb,room:plan.objects.find(o=>o.id==='room-201')!,empty};
}
