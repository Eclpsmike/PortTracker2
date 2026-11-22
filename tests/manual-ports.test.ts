import test from 'node:test';
import assert from 'node:assert/strict';
import { stackProject } from './stack-fixture';
import { parseProject, projectLayout, saveEquipmentTemplate } from '../src/project';
import { assignPortVlans, cableMediaError, getPortMedia, interfaceName, isNetworkPort, portPhysicalLabel, portVlan, setPortsMedia, type Endpoint } from '../src/model';
import { validCustomTemplates } from '../src/templateImport';
import type { TemplatePort } from '../src/equipmentTemplates';
import { connectionPortMatches } from '../src/connectionDraft';
import { portMatchesFilters, vlanOutlineColor } from '../src/viewFilters';

const consolePort:TemplatePort={name:'Console',manual:true,function:'console',consoleConnector:'RJ45',face:'rear',x:.5,y:.5,width:.04,height:.2};
function fixture(){
  const project=stackProject(),template=project.templates![0];
  template.rearImage={imageSrc:template.imageSrc,imageWidth:400,imageHeight:100};
  const equipment={id:'SW1',label:'Switch',kind:'switch' as const,bottomU:5,heightU:1,portCount:48,portStart:0,templateId:template.id};
  project.locations[0].layout={racks:[{id:'R1',label:'Rack',heightU:12,positionM:0,equipment:[equipment]}],cables:[{id:'CBL-0001',from:{rackId:'R1',equipmentId:'SW1',port:0},to:{rackId:'R1',equipmentId:'SW1',port:1},vlan:10,jacket:'#147de3'}],portVlans:{'R1/SW1/0':10},portDetails:{'R1/SW1/0':{facilityLocation:'',notes:'Existing notes'}},portMedia:{'R1/SW1/0':{kind:'copper'}}};
  project.locations.push({...structuredClone(project.locations[0]),id:'second-frame',name:'Second frame',layout:{racks:[{id:'R2',label:'Other rack',heightU:12,positionM:0,equipment:[{...equipment,portStart:100,portStartOverride:true}]}],cables:[]}});
  return {project,template};
}
test('appending network and console ports updates every template instance without shifting existing endpoints',()=>{
  const {project,template}=fixture(),before=structuredClone(project);
  const network:TemplatePort={name:'Extra uplink',manual:true,function:'ethernet',face:'rear',x:.8,y:.5,width:.04,height:.2,media:{kind:'copper'}};
  const saved=saveEquipmentTemplate(project,{...template,portCount:50,ports:[...template.ports,consolePort,network]});
  assert.deepEqual(project,before);
  for(let i=0;i<2;i++){
    const old=before.locations[i].layout,next=saved.locations[i].layout;
    assert.equal(next.racks[0].equipment[0].portCount,50);
    assert.equal(next.racks[0].equipment[0].portStart,old.racks[0].equipment[0].portStart);
    assert.deepEqual(next.cables,old.cables);assert.deepEqual(next.portVlans,old.portVlans);assert.deepEqual(next.portMedia,old.portMedia);assert.deepEqual(next.portDetails,old.portDetails);
  }
  const restored=parseProject(JSON.parse(JSON.stringify(saved)))!;assert.ok(restored);
  const layout=projectLayout(restored,restored.locations[0].id),ep={rackId:'R1',equipmentId:'SW1',port:48};
  assert.equal(isNetworkPort(layout,ep),false);assert.equal(portPhysicalLabel(layout,ep),'Serial console · RJ45');
  assert.equal(interfaceName(layout,layout.racks[0].equipment[0],48),'');
  assert.equal(isNetworkPort(layout,{...ep,port:49}),true);assert.deepEqual(getPortMedia(layout,{...ep,port:49}),{kind:'copper'});
  assert.equal(connectionPortMatches(layout,'Console').exact.length,0);assert.equal(connectionPortMatches(layout,'Extra uplink').exact[0].endpoint.port,49);
  assert.equal(isNetworkPort(projectLayout(restored,restored.locations[1].id),{rackId:'R2',equipmentId:'SW1',port:148}),false);
});
test('console ports reject network media, cables and VLAN assignments',()=>{
  const {project,template}=fixture();
  const saved=saveEquipmentTemplate(project,{...template,portCount:49,ports:[...template.ports,consolePort]}),layout=projectLayout(saved,saved.locations[0].id);
  const ep:Endpoint={rackId:'R1',equipmentId:'SW1',port:48},network={...ep,port:2};
  const updated=assignPortVlans(layout,[ep,network],10);
  assert.equal(updated.portVlans?.['R1/SW1/48'],undefined);assert.equal(portVlan(updated,ep),null);assert.equal(portVlan(updated,network),10);
  assert.throws(()=>setPortsMedia(layout,[network,ep],{kind:'copper'}),/console connector/);
  assert.match(cableMediaError(layout,{...layout.cables[0],from:ep,to:network})!,/Serial console/);
  assert.equal(vlanOutlineColor(layout,ep,{vlans:[null],locations:[]}),null);assert.equal(portMatchesFilters(layout,ep,{vlans:[null],locations:[]}),false);
});
test('used templates reject removal, reordering, invalid console metadata and overflowing device ranges',()=>{
  const {project,template}=fixture();
  assert.throws(()=>saveEquipmentTemplate(project,{...template,portCount:47,ports:template.ports.slice(0,47)}),/identities/);
  const swapped=[...template.ports];[swapped[0],swapped[1]]=[swapped[1],swapped[0]];
  assert.throws(()=>saveEquipmentTemplate(project,{...template,ports:swapped}),/identities/);
  for(const bad of [{...consolePort,consoleConnector:undefined},{...consolePort,consoleConnector:'LC'},{...consolePort,media:{kind:'copper'}},{...consolePort,function:'ethernet'},{...consolePort,manual:'yes'}])assert.equal(validCustomTemplates([{...template,portCount:49,ports:[...template.ports,bad]}]),false);
  project.locations[1].layout.racks[0].equipment[0].portStart=999952;
  assert.throws(()=>saveEquipmentTemplate(project,{...template,portCount:49,ports:[...template.ports,consolePort]}),/supported port range/);
  assert.equal(project.locations[0].layout.racks[0].equipment[0].portCount,48);
});
