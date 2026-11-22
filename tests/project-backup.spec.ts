import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { locationPortsFixture } from './location-ports-fixture';
import { stackProject } from './stack-fixture';
import { createProjectBackup } from '../src/projectBackup';
import type { FloorPlan } from '../src/facility/model';

async function rack(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!));}
async function drawing(page:Page){return page.evaluate(async()=>{
  const id=JSON.parse(localStorage.getItem('porttracker.project')!).id;
  return new Promise<FloorPlan|undefined>((resolve,reject)=>{const open=indexedDB.open('porttracker-facility',1);open.onsuccess=()=>{const db=open.result,request=db.transaction('plans').objectStore('plans').get(id);request.onsuccess=()=>{resolve(request.result);db.close();};request.onerror=()=>reject(request.error);};});
});}
async function seed(page:Page){
  const {project,plan}=locationPortsFixture();project.templates=stackProject().templates;
  project.preferences={lengthUnit:'imperial',rackZoom:.7,singleRackZoom:1.2,rackFace:'rear'};
  const t=project.templates![0];t.source!.yaml='manufacturer: Juniper\nmodel: Test switch\nu_height: 1\ninterfaces:\n  - {name: "ge-0/0/[0-47]", type: 1000base-t}\n';
  t.rearImage={imageSrc:t.imageSrc,imageWidth:t.imageWidth,imageHeight:t.imageHeight};
  plan.background.src=t.imageSrc;plan.background.original={name:'original.png',data:t.imageSrc};
  plan.toolDefaults={outlet:{symbolWidth:5},cable:{lineWeight:4}};
  plan.grid={spacing:10,unit:'plan'};plan.calibration={a:{x:0,y:0},b:{x:100,y:0},distance:20,unit:'ft'};
  await page.goto('/#/locations');
  await page.evaluate(async({project,plan})=>{
    localStorage.setItem('porttracker.project',JSON.stringify(project));
    await new Promise<void>((resolve,reject)=>{const open=indexedDB.open('porttracker-facility',1);open.onupgradeneeded=()=>open.result.createObjectStore('plans');open.onsuccess=()=>{const db=open.result,tx=db.transaction('plans','readwrite');tx.objectStore('plans').put(plan,project.id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
  },{project,plan});
  await page.reload();await expect(page.getByRole('textbox',{name:'Site name',exact:true})).toBeVisible();
  return {project,plan};
}
async function exported(page:Page,name='Export project'){
  const pending=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();
  const file=await pending;expect(file.suggestedFilename()).toBe('porttracker-project.json');
  return JSON.parse(await readFile((await file.path())!,'utf8'));
}
async function preview(page:Page,data:unknown){
  await page.goto('/#/locations');await page.getByLabel('Project JSON file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}
test('one backup restores all project data and the full map on another browser context',async({page,browser})=>{
  const {plan}=await seed(page);const backup=await exported(page);
  expect(backup.facilityPlan).toEqual(plan);expect(backup.templates[0].source.yaml).toContain('manufacturer: Juniper');
  const context=await browser.newContext(),other=await context.newPage();
  await other.goto(new URL('/#/locations',page.url()).href);
  await other.getByLabel('Project JSON file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(other.getByRole('region',{name:'Import preview'})).toContainText('Facility drawing:');
  await other.getByRole('button',{name:'Replace with imported project',exact:true}).click();
  await expect(other.getByRole('region',{name:'Import preview'})).toHaveCount(0);
  const restored=await rack(other);expect(restored.id).not.toBe(backup.id);expect(restored.locations).toEqual(backup.locations);expect(restored.templates).toEqual(backup.templates);expect(restored.configuration).toEqual(backup.configuration);expect(restored.preferences).toEqual(backup.preferences);expect(restored.facilityPlan).toBeUndefined();
  expect(await drawing(other)).toEqual(plan);
  await other.goto(new URL('/#/facility',page.url()).href);await expect(other.getByRole('application',{name:'Facility floor plan canvas'})).toBeVisible();
  expect((await exported(other)).facilityPlan).toEqual(plan);
  await other.reload();expect(await drawing(other)).toEqual(plan);await context.close();
});
test('map export includes current edits and full map import replaces both sides even for the same original project ID',async({page})=>{
  const {plan}=await seed(page);const backup=await exported(page);
  await page.goto('/#/facility');await expect(page.getByRole('application',{name:'Facility floor plan canvas'})).toBeVisible();
  const modified={...plan,floor:'Changed drawing'};
  page.once('dialog',d=>d.accept());await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'old-drawing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(modified))});
  await expect(page.locator('.floor-title')).toContainText('Changed drawing');
  expect((await exported(page)).facilityPlan.floor).toBe('Changed drawing');
  await page.goto('/#/locations');await page.getByLabel('Site name',{exact:true}).fill('Changed racks');await page.getByRole('button',{name:'Save site name',exact:true}).click();
  await page.goto('/#/facility');page.once('dialog',d=>d.accept());
  await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'full-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.locator('.floor-title')).toContainText(plan.floor);
  expect((await rack(page)).siteName).toBe(backup.siteName);expect(await drawing(page)).toEqual(plan);
  await page.reload();expect(await drawing(page)).toEqual(plan);
});
test('invalid maps and storage failures leave the existing project and drawing intact',async({page})=>{
  await seed(page);const backup=await exported(page),before=await rack(page),floor=await drawing(page);
  await preview(page,{...backup,facilityPlan:{...backup.facilityPlan,objects:[{id:'bad'}]}});
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('region',{name:'Import preview'})).toHaveCount(0);expect(await rack(page)).toEqual(before);expect(await drawing(page)).toEqual(floor);
  await preview(page,backup);
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('Quota exceeded');};});
  await page.getByRole('button',{name:'Replace with imported project',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('were not replaced');expect(await rack(page)).toEqual(before);expect(await drawing(page)).toEqual(floor);
  await page.reload();await preview(page,backup);
  await page.evaluate(()=>{IDBObjectStore.prototype.put=()=>{throw new Error('Drawing write failed');};});
  await page.getByRole('button',{name:'Replace with imported project',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Drawing write failed');expect(await rack(page)).toEqual(before);expect(await drawing(page)).toEqual(floor);
});
test('failed drawing saves remain exportable after navigation; unreadable drawings block partial backups',async({page})=>{
  const {plan}=await seed(page);await page.goto('/#/facility');await expect(page.getByRole('application',{name:'Facility floor plan canvas'})).toBeVisible();
  await page.evaluate(()=>{IDBObjectStore.prototype.put=()=>{throw new Error('Drawing write unavailable');};});
  const changed={...plan,floor:'Unsaved map edit'};page.once('dialog',d=>d.accept());
  await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'drawing.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(changed))});
  await expect(page.getByRole('alert')).toContainText('Drawing write unavailable');
  await page.goto('/#/locations');expect((await exported(page)).facilityPlan.floor).toBe('Unsaved map edit');expect((await drawing(page))!.floor).toBe(plan.floor);
  await page.reload();
  await page.evaluate(async()=>{const id=JSON.parse(localStorage.getItem('porttracker.project')!).id;await new Promise<void>(resolve=>{const open=indexedDB.open('porttracker-facility',1);open.onsuccess=()=>{const tx=open.result.transaction('plans','readwrite');tx.objectStore('plans').put({kind:'bad'},id);tx.oncomplete=()=>{open.result.close();resolve();};};});});
  await page.reload();let downloaded=false;page.on('download',()=>{downloaded=true;});await page.getByRole('button',{name:'Export project',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Export failed');expect(downloaded).toBe(false);
});
test('older rack-only backups preview their missing map and remain importable',async({page})=>{
  const {project}=await seed(page);await preview(page,project);
  await expect(page.getByRole('region',{name:'Import preview'})).toContainText('Older rack-only backup');
  await page.getByRole('button',{name:'Replace with imported project',exact:true}).click();
  await expect(page.getByRole('region',{name:'Import preview'})).toHaveCount(0);
  expect(await drawing(page)).toBeUndefined();expect((await exported(page)).facilityPlan).toBeNull();
  // The new format explicitly distinguishes no drawing from a missing field.
  expect(createProjectBackup(project,null).facilityPlan).toBeNull();
});

test('project edits remain exportable when localStorage stops accepting writes',async({page})=>{
  await seed(page);const before=await rack(page);
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('Storage unavailable');};});
  await page.getByLabel('Site name',{exact:true}).fill('In-memory site name');await page.getByRole('button',{name:'Save site name',exact:true}).click();
  await expect(page.locator('.project-storage-notice')).toContainText('in memory only');
  const backup=await exported(page);expect(backup.siteName).toBe('In-memory site name');expect(backup.facilityPlan).toEqual(await drawing(page));expect((await rack(page)).siteName).toBe(before.siteName);
});
