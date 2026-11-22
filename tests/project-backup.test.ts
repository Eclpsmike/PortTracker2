import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectBackup, parseProjectBackup } from '../src/projectBackup';
import { locationPortsFixture } from './location-ports-fixture';
import { stackProject } from './stack-fixture';

test('combined backup round-trips racks, maps, source files, templates and saved preferences',()=>{
  const {project,plan}=locationPortsFixture();
  project.templates=stackProject().templates;
  project.preferences={lengthUnit:'imperial',rackZoom:.75,singleRackZoom:2,rackFace:'rear'};
  const template=project.templates![0];
  template.source!.yaml='manufacturer: Juniper\nmodel: Test switch\nu_height: 1\ninterfaces:\n  - {name: "ge-0/0/[0-47]", type: 1000base-t}\n';
  template.rearImage={imageSrc:template.imageSrc,imageWidth:template.imageWidth,imageHeight:template.imageHeight};
  plan.background.src=template.imageSrc;
  plan.background.original={name:'original.png',data:template.imageSrc};
  plan.toolDefaults={outlet:{symbolWidth:6},cable:{lineWeight:3}};
  plan.grid={spacing:2,unit:'ft'};
  plan.calibration={a:{x:0,y:0},b:{x:100,y:0},distance:20,unit:'ft'};
  const backup=createProjectBackup(project,plan),restored=parseProjectBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(restored.facilityPlan,plan);
  assert.deepEqual(restored.project.templates,project.templates);
  assert.deepEqual(restored.project.locations,project.locations);
  assert.deepEqual(restored.project.preferences,project.preferences);
  assert.equal(restored.legacy,false);
  assert.equal('facilityPlan' in restored.project,false);
  assert.equal('backupVersion' in restored.project,false);
  backup.facilityPlan!.objects[0].name='Changed';assert.notEqual(plan.objects[0].name,'Changed');
});
test('legacy rack backups are explicitly marked as missing a drawing',()=>{
  const {project}=locationPortsFixture();
  const restored=parseProjectBackup(project);
  assert.equal(restored.legacy,true);assert.equal(restored.facilityPlan,null);
  assert.equal(parseProjectBackup(createProjectBackup(project,null)).legacy,false);
});
test('corrupt or unsupported combined backups cannot fall back to a partial rack import',()=>{
  const {project,plan}=locationPortsFixture(),backup=createProjectBackup(project,plan);
  const {facilityPlan:_floor,...withoutFloor}=backup;
  for(const value of [withoutFloor,{...backup,backupVersion:2},{...backup,facilityPlan:{}},{...backup,locations:[]},{...backup,facilityPlan:{...plan,objects:[{id:'bad'}]}},plan])assert.throws(()=>parseProjectBackup(value));
});
