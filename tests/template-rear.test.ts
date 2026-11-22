import test from 'node:test';
import assert from 'node:assert/strict';
import { stackProject } from './stack-fixture';
import { validCustomTemplates } from '../src/templateImport';
import { parseProject, saveEquipmentTemplate } from '../src/project';
import { equipmentImageBounds, equipmentFace } from '../src/geometry';
import type { Equipment } from '../src/model';

test('rear images and rack face round trip without changing front maps or equipment data',()=>{
  const project=stackProject(),original=project.templates![0];
  const rearImage={imageSrc:original.imageSrc,imageWidth:400,imageHeight:100};
  const updated=saveEquipmentTemplate(project,{...original,rearImage});updated.preferences.rackFace='rear';
  const restored=parseProject(JSON.parse(JSON.stringify(updated)))!;
  assert.ok(restored);assert.deepEqual(restored.templates![0].rearImage,rearImage);
  assert.deepEqual(restored.templates![0].ports,original.ports);
  assert.deepEqual(restored.locations,project.locations);assert.equal(restored.preferences.rackFace,'rear');
  const removed=saveEquipmentTemplate(updated,original);
  assert.equal(removed.templates![0].rearImage,undefined);
  for(const face of [null,'side',1,['rear']])assert.equal(parseProject({...updated,preferences:{...updated.preferences,rackFace:face}}),null);
});
test('rear images validate format, dimensions, and shared library image budget',()=>{
  const template=stackProject().templates![0],rear={imageSrc:template.imageSrc,imageWidth:400,imageHeight:100};
  for(const bad of [null,{}, {...rear,imageSrc:'https://example.com/rear.png'}, {...rear,imageSrc:'data:image/svg+xml;base64,PHN2Zz4='}, {...rear,imageWidth:0}, {...rear,imageHeight:8193}, {...rear,imageWidth:1.5}, {...rear,imageWidth:8192,imageHeight:8192}]){
    assert.equal(validCustomTemplates([{...template,rearImage:bad}]),false);
  }
  const imageSrc=`data:image/png;base64,${Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n','binary'),Buffer.alloc(850000)]).toString('base64')}`;
  const large={...template,imageSrc,rearImage:{...rear,imageSrc}};
  assert.equal(validCustomTemplates([large]),true);
  assert.equal(validCustomTemplates([large,{...large,id:'custom-second'}]),false);
});
test('rear images fit independently without stretching or changing front socket geometry',()=>{
  const template=stackProject().templates![0];template.rearImage={imageSrc:template.imageSrc,imageWidth:400,imageHeight:100};
  const equipment:Equipment={id:'SW1',label:'Switch',kind:'switch',portCount:48,portStart:0,bottomU:2,heightU:1,templateId:template.id};
  const front=equipmentImageBounds(equipment,[template]),rear=equipmentImageBounds(equipment,[template],'rear'),face=equipmentFace(equipment);
  assert.ok(Math.abs(rear.width/rear.height-4)<1e-9);assert.ok(rear.width<=face.width&&rear.height<=face.height);
  assert.deepEqual(equipmentImageBounds(equipment,[{...template,rearImage:undefined}]),front);
  assert.deepEqual(equipmentImageBounds(equipment,[],'rear'),face);
});

test('port faces validate independently and preserve connected socket identities', async()=>{
  const { endpointFace, endpointSide } = await import('../src/model');
  const { portPoint, portSize, equipmentPosition, cablePoints } = await import('../src/geometry');
  const { projectLayout } = await import('../src/project');
  const project=stackProject(),original=project.templates![0];
  const template={...original,rearImage:{imageSrc:original.imageSrc,imageWidth:400,imageHeight:100},ports:original.ports.map((p,i)=>i===0?{...p,face:'rear' as const,x:.2,y:.5}:p)};
  project.locations[0].layout={racks:[{id:'R1',label:'Rack',heightU:12,positionM:0,equipment:[{id:'SW1',label:'Switch',kind:'switch',heightU:1,bottomU:2,portCount:48,portStart:0,templateId:template.id}]}],cables:[{id:'CBL-0001',from:{rackId:'R1',equipmentId:'SW1',port:0},to:{rackId:'R1',equipmentId:'SW1',port:1},medium:'copper',vlan:null,jacket:'#147de3'}]};
  const saved=saveEquipmentTemplate(project,template),restored=parseProject(JSON.parse(JSON.stringify(saved)))!;
  assert.ok(restored);assert.deepEqual(restored.locations,project.locations);
  const layout=projectLayout(restored,restored.locations[0].id),cable=layout.cables[0],equipment=layout.racks[0].equipment[0];
  assert.equal(endpointFace(layout,cable.from),'rear');assert.equal(endpointFace(layout,cable.to),'front');
  assert.equal(endpointSide(layout,cable.from),'right');
  const rear=equipmentImageBounds(equipment,[template],'rear'),origin=equipmentPosition(layout,'R1',equipment,['R1']);
  assert.equal(portPoint(layout,cable.from,['R1']).x,origin.x+rear.x+.2*rear.width);
  assert.equal(portSize(equipment,0,[template]).width,template.ports[0].width*rear.width);
  for(const face of ['front','rear'] as const){const points=cablePoints(layout,cable,['R1'],face);assert.equal(points.length,3);assert.deepEqual(points[0],portPoint(layout,face==='rear'?cable.from:cable.to,['R1']));}
  const sameRear={...cable,to:{...cable.from,port:2}};
  const both={...layout,templates:[{...template,ports:template.ports.map((p,i)=>i===2?{...p,face:'rear' as const}:p)}]};
  assert.equal(cablePoints(both,sameRear,['R1'],'front').length,0);assert.ok(cablePoints(both,sameRear,['R1'],'rear').length>=4);
  assert.equal(validCustomTemplates([{...template,rearImage:undefined}]),false);
  assert.equal(validCustomTemplates([{...template,kind:'patch-panel'}]),false);
  assert.equal(validCustomTemplates([{...template,ports:template.ports.map((p,i)=>i===0?{...p,face:'side'}:p)}]),false);
  const sharedPosition={...template,ports:template.ports.map((p,i)=>i===0?{...template.ports[1],name:p.name,face:'rear' as const}:p)};
  assert.equal(validCustomTemplates([sharedPosition]),true);
  assert.equal(validCustomTemplates([{...sharedPosition,ports:sharedPosition.ports.map(p=>({...p,face:'front'}))}]),false);
});
