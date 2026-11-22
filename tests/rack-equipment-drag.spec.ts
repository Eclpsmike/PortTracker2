import {test,expect,type Page} from '@playwright/test';
import {defaultProject,type Project} from '../src/project';
import {defaultConfiguration} from '../src/configuration';
import {EQUIPMENT_FACE,UNIT,equipmentPosition,rackTop} from '../src/geometry';

async function setup(page:Page,connected=true){
  const project=defaultProject({...defaultConfiguration(),facilityLocations:[{name:'COM B',color:'#159de7'}]},'metric');
  project.locations[0].layout={racks:[{id:'RACK-A',label:'Rack A',heightU:12,positionM:0,equipment:[
    {id:'P1',label:'P1',kind:'patch-panel',bottomU:10,heightU:2,portCount:4},
    {id:'SW-001',label:'SW-001',kind:'switch',bottomU:6,heightU:1,portCount:8},
  ]}],cables:[{id:'C1',from:{rackId:'RACK-A',equipmentId:'P1',port:1},to:{rackId:'RACK-A',equipmentId:'SW-001',port:1},vlan:10,jacket:'#159de7'}],portVlans:{'RACK-A/P1/1':99},portDetails:{'RACK-A/P1/1':{facilityLocation:'COM B',notes:'Preserve this port'}}};
  if(!connected)project.locations[0].layout.cables=[];
  await page.addInitScript(project=>{if(!localStorage.getItem('porttracker.project'))localStorage.setItem('porttracker.project',JSON.stringify(project));},project);
  await page.goto('/');await page.getByRole('tab',{name:'Equipment',exact:true}).click();return project;
}
async function saved(page:Page):Promise<Project>{return page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!));}

test('equipment labels save without changing IDs or port data',async({page})=>{
  const before=await setup(page);
  const picker=page.getByRole('combobox',{name:'Manage equipment',exact:true});
  await picker.selectOption('P1');
  const field=page.getByRole('textbox',{name:'Label name',exact:true});
  await field.fill('  Shipping panel  ');await field.press('Enter');
  await expect(field).toHaveValue('Shipping panel');
  await expect(picker.locator('option:checked')).toContainText('Shipping panel');
  await expect(page.locator('[data-equipment-drag="RACK-A/P1"]')).toHaveAttribute('aria-label','Select equipment Shipping panel in Rack A');
  const expected=structuredClone(before.locations[0].layout);
  expected.racks[0].equipment[0].label='Shipping panel';
  expect((await saved(page)).locations[0].layout).toEqual(expected);

  await field.fill('   ');await field.press('Tab');
  await expect(page.getByRole('alert')).toHaveText('Enter a label name.');
  expect((await saved(page)).locations[0].layout).toEqual(expected);
  await field.press('Escape');await expect(field).toHaveValue('Shipping panel');
  await picker.selectOption('SW-001');await expect(field).toHaveValue('SW-001');
  await field.fill('Core switch');await field.press('Tab');
  expected.racks[0].equipment[1].label='Core switch';
  expect((await saved(page)).locations[0].layout).toEqual(expected);
  await page.reload();await page.getByRole('tab',{name:'Equipment',exact:true}).click();
  await picker.selectOption('SW-001');await expect(field).toHaveValue('Core switch');
  await picker.selectOption('P1');await expect(field).toHaveValue('Shipping panel');
});
async function positions(page:Page,bottomU:number){
  const layout=(await saved(page)).locations[0].layout,rack=layout.racks[0],equipment=rack.equipment.find(e=>e.id==='P1')!;
  const origin=equipmentPosition(layout,rack.id,equipment,[rack.id]);
  const points={start:{x:origin.x+EQUIPMENT_FACE.x+EQUIPMENT_FACE.width/2,y:origin.y+equipment.heightU*UNIT/2},end:{x:origin.x+EQUIPMENT_FACE.x+EQUIPMENT_FACE.width/2,y:rackTop(layout,rack.id,[rack.id])+(rack.heightU-bottomU-equipment.heightU+1)*UNIT+equipment.heightU*UNIT/2}};
  await page.locator('[data-equipment-drag="RACK-A/P1"]').scrollIntoViewIfNeeded();
  return page.locator('.rack-scene').evaluate((svg,points)=>{const matrix=(svg as SVGSVGElement).getScreenCTM()!;const convert=(p:{x:number;y:number})=>{const value=new DOMPoint(p.x,p.y).matrixTransform(matrix);return{x:value.x,y:value.y};};return{start:convert(points.start),end:convert(points.end)};},points);
}
async function beginDrag(page:Page,bottomU:number){const p=await positions(page,bottomU);await page.mouse.move(p.start.x,p.start.y);await page.mouse.down();await page.mouse.move(p.end.x,p.end.y,{steps:8});return p;}

test('equipment can be selected on the rack or in Manage and dragged to a snapped position without changing port data',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const before=await setup(page);
  const panel=page.locator('[data-equipment-drag="RACK-A/P1"]'),device=page.locator('[data-equipment="RACK-A/P1"]');
  await page.getByRole('combobox',{name:'Manage equipment',exact:true}).selectOption('SW-001');
  await expect(page.locator('[data-equipment-drag="RACK-A/SW-001"]')).toHaveAttribute('aria-pressed','true');
  await panel.click();await expect(panel).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('combobox',{name:'Manage equipment',exact:true})).toHaveValue('P1');
  await expect(page.locator('.equipment-selection-outline')).toHaveCount(1);
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();const zoom=await page.locator('.zoom-control span').textContent();
  await beginDrag(page,3);
  await expect(page.locator('.equipment-drop-preview')).toHaveAttribute('data-bottom-u','3');await expect(page.locator('.equipment-drop-preview')).toHaveAttribute('data-valid','true');
  await expect(device).toHaveAttribute('data-bottom-u','10');
  await page.screenshot({path:'artifacts/rack-equipment-drag-preview.png'});
  page.once('dialog',async dialog=>{expect(dialog.type()).toBe('confirm');expect(dialog.message()).toContain('P1 has 1 cable connection');expect(dialog.message()).toContain('To: Rack A · U3–U4');await dialog.accept();});
  await page.mouse.up();await expect(device).toHaveAttribute('data-bottom-u','3');
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(panel).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.zoom-control span')).toHaveText(zoom!);
  let after=await saved(page);expect(after.locations[0].layout.cables).toEqual(before.locations[0].layout.cables);expect(after.locations[0].layout.portDetails).toEqual(before.locations[0].layout.portDetails);expect(after.locations[0].layout.portVlans).toEqual(before.locations[0].layout.portVlans);
  await page.reload();await expect(device).toHaveAttribute('data-bottom-u','3');
  await page.getByRole('tab',{name:'Equipment',exact:true}).click();await expect(page.locator('.equipment-selection-outline')).toHaveCount(1);
  await page.getByRole('tab',{name:'Ports',exact:true}).click();await expect(page.locator('.rack-equipment-hit')).toHaveCount(0);
  await page.locator('[data-port="RACK-A/P1/1"]').press('Enter');await expect(page.getByRole('region',{name:'Selected port details',exact:true})).toContainText('COM B');
  expect(errors).toEqual([]);
});

test('equipment drag rejects collisions and out-of-bounds drops and Escape cancels a valid preview',async({page})=>{
  const before=await setup(page),device=page.locator('[data-equipment="RACK-A/P1"]');
  await beginDrag(page,5);await expect(page.locator('.equipment-drop-preview')).toHaveAttribute('data-valid','false');await expect(page.locator('.equipment-drag-status')).toContainText('Overlaps SW-001');await page.mouse.up();await expect(device).toHaveAttribute('data-bottom-u','10');
  await beginDrag(page,12);await expect(page.locator('.equipment-drop-preview')).toHaveAttribute('data-valid','false');await page.mouse.up();await expect(device).toHaveAttribute('data-bottom-u','10');
  await beginDrag(page,2);await expect(page.locator('.equipment-drop-preview')).toHaveAttribute('data-valid','true');await page.keyboard.press('Escape');await expect(page.locator('.equipment-drop-preview')).toHaveCount(0);await page.mouse.up();await expect(device).toHaveAttribute('data-bottom-u','10');
  expect((await saved(page)).locations[0].layout).toEqual(before.locations[0].layout);
});

test('touch dragging moves multi-unit equipment without opening the move dialog',async({page})=>{
  await page.setViewportSize({width:390,height:844});await setup(page);
  const {start,end}=await positions(page,3),client=await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[end]});
  await expect(page.locator('.equipment-drop-preview')).toHaveAttribute('data-valid','true');
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('1 cable connection');await dialog.accept();});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('[data-equipment="RACK-A/P1"]')).toHaveAttribute('data-bottom-u','3');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('cancelling the connected-equipment warning keeps the original position for drag and dialog moves',async({page})=>{
  const before=await setup(page),device=page.locator('[data-equipment="RACK-A/P1"]');
  await beginDrag(page,3);
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('From: Rack A · U10–U11');expect(dialog.message()).toContain('To: Rack A · U3–U4');await dialog.dismiss();});
  await page.mouse.up();await expect(device).toHaveAttribute('data-bottom-u','10');
  expect((await saved(page)).locations[0].layout).toEqual(before.locations[0].layout);
  await page.getByRole('button',{name:'Move equipment',exact:true}).click();
  await page.getByRole('spinbutton',{name:'Bottom rack unit',exact:true}).fill('3');
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('1 cable connection');await dialog.dismiss();});
  await page.getByRole('button',{name:'Save equipment position',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Move equipment',exact:true})).toBeVisible();
  expect((await saved(page)).locations[0].layout).toEqual(before.locations[0].layout);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Save equipment position',exact:true}).click();
  await expect(device).toHaveAttribute('data-bottom-u','3');
  expect((await saved(page)).locations[0].layout.cables).toEqual(before.locations[0].layout.cables);
});

test('unconnected equipment moves without a warning',async({page})=>{
  await setup(page,false);let warnings=0;page.on('dialog',async dialog=>{warnings++;await dialog.dismiss();});
  await beginDrag(page,3);await page.mouse.up();
  await expect(page.locator('[data-equipment="RACK-A/P1"]')).toHaveAttribute('data-bottom-u','3');
  expect(warnings).toBe(0);
});
