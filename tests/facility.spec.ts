import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createObject, samplePlan, type FloorPlan } from '../src/facility/model';
import { defaultProject } from '../src/project';
import { defaultConfiguration } from '../src/configuration';
import { stackProject } from './stack-fixture';
import { locationPortsFixture } from './location-ports-fixture';
test.setTimeout(60000);
test.use({ actionTimeout: 10000 });

async function saved(page:Page):Promise<FloorPlan>{
  await expect(page.locator('.floor-statusbar')).toContainText('Saved in this browser');
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('porttracker-facility',1);
    request.onsuccess=()=>{const db=request.result;const get=db.transaction('plans').objectStore('plans').get(JSON.parse(localStorage.getItem('porttracker.project')!).id);get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>reject(get.error);};request.onerror=()=>reject(request.error);
  }));
}
async function point(page:Page,x:number,y:number){return page.locator('.floor-canvas>g').evaluate((g,p)=>{const matrix=(g as SVGGElement).getScreenCTM()!;const q=new DOMPoint(p.x,p.y).matrixTransform(matrix);return{x:q.x,y:q.y};},{x,y});}
async function clickPoint(page:Page,x:number,y:number){const p=await point(page,x,y);await page.mouse.click(p.x,p.y);}
async function placeSmbLater(page:Page,x:number,y:number){await clickPoint(page,x,y);await page.getByRole('dialog',{name:'Set up SMB',exact:true}).getByRole('button',{name:'Configure later',exact:true}).click();}
async function drag(page:Page,a:{x:number;y:number},b:{x:number;y:number}){const start=await point(page,a.x,a.y),end=await point(page,b.x,b.y);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();}
async function tool(page:Page,name:string){const tools=page.getByRole('complementary',{name:'Floor drawing tools'});if(!await tools.isVisible())await page.getByRole('button',{name:'Drawing tools',exact:true}).click();await tools.getByRole('button',{name,exact:true}).click();}
async function panel(page:Page,name:'Layers'|'Filters'|'Properties'){const tabs=page.getByRole('tablist',{name:'Floor plan panels'});if(!await tabs.isVisible())await page.getByRole('button',{name:/Layers & properties/}).click();await tabs.getByRole('tab',{name:new RegExp(`^${name}`)}).click();}
async function propertyGroup(page:Page,key:string){const group=page.locator(`.floor-${key}-properties`);if(await group.getAttribute('open')===null)await group.locator('summary').click();}
async function field(page:Page,name:string,value:string){const input=page.getByLabel(name,{exact:true});const group=input.locator('xpath=ancestor::details[contains(@class,"floor-property-accordion")]');if(await group.count()&&await group.getAttribute('open')===null)await group.locator('summary').click();await input.fill(value);await input.press('Tab');}
async function start(page:Page){await page.goto('/#/facility');await expect(page.getByRole('application',{name:'Facility floor plan canvas'})).toBeVisible();await saved(page);}

test('Arrange controls align, space and distribute selected items with undo and attached paths',async({page})=>{
  const plan=samplePlan();plan.objects=[];
  for(const point of [{x:100,y:150},{x:180,y:230},{x:300,y:170}])plan.objects.push(createObject(plan,'speaker',point,'devices'));
  const [a,b,c]=plan.objects;
  plan.objects.push({...createObject(plan,'cable',{x:114,y:150},'paths'),points:[{x:114,y:150},{x:200,y:270},{x:166,y:230}],sourceId:a.id,sourceSide:'right',destinationId:b.id,destinationSide:'left'});
  await start(page);page.once('dialog',dialog=>dialog.accept());
  await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'arrange.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(plan))});
  await expect.poll(()=>saved(page)).toEqual(plan);
  await page.locator(`[data-object-id="${a.id}"]`).press('Enter');
  await page.keyboard.down('Shift');await clickPoint(page,b.x,b.y);await clickPoint(page,c.x,c.y);await page.keyboard.up('Shift');
  const arrange=page.getByRole('region',{name:'Arrange selected items',exact:true});
  await expect(arrange).toBeVisible();
  await arrange.getByRole('button',{name:'Align horizontally',exact:true}).click();
  let current=await saved(page);expect(current.objects.slice(0,3).map(o=>o.y)).toEqual([190,190,190]);
  expect(current.objects[3].points).toEqual([{x:114,y:190},{x:200,y:270},{x:166,y:190}]);
  await arrange.getByRole('button',{name:'Increase spacing',exact:true}).click();
  expect((await saved(page)).objects.slice(0,3).map(o=>o.x)).toEqual([90,180,310]);
  await arrange.getByRole('button',{name:'Decrease spacing',exact:true}).click();
  expect((await saved(page)).objects.slice(0,3).map(o=>o.x)).toEqual([100,180,300]);
  await arrange.getByRole('button',{name:'Distribute evenly',exact:true}).click();
  expect((await saved(page)).objects.slice(0,3).map(o=>o.x)).toEqual([100,200,300]);
  await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();
  expect((await saved(page)).objects.slice(0,3).map(o=>o.x)).toEqual([100,180,300]);
  await page.getByRole('button',{name:'Redo floor edit',exact:true}).click();
  await arrange.getByRole('button',{name:'Align vertically',exact:true}).click();
  await expect(arrange.getByRole('combobox',{name:'Spacing direction',exact:true})).toHaveValue('vertical');
  await arrange.getByRole('button',{name:'Increase spacing',exact:true}).click();
  current=await saved(page);expect(current.objects.slice(0,3).map(o=>[o.x,o.y])).toEqual([[200,180],[200,190],[200,200]]);
  await expect(arrange.getByRole('button',{name:'Decrease spacing',exact:true})).toBeDisabled();
  await page.setViewportSize({width:390,height:844});await panel(page,'Properties');
  await arrange.scrollIntoViewIfNeeded();expect(await arrange.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.reload();expect(await saved(page)).toEqual(current);
});

test('location Ports accordion combines area ports with live VLANs and patch status',async({page})=>{
  const {project,plan,empty}=locationPortsFixture();
  await page.addInitScript(project=>{if(!localStorage.getItem('porttracker.project'))localStorage.setItem('porttracker.project',JSON.stringify(project));},project);
  await start(page);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'location-ports.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(plan))});
  await expect.poll(()=>saved(page)).toEqual(plan);
  await page.locator('[data-object-id="room-201"]').press('Enter');
  const accordion=page.locator('.floor-location-ports');
  await expect(accordion.locator('summary')).toHaveText('Ports 5');
  expect(await accordion.evaluate(el=>el.previousElementSibling?.classList.contains('floor-unplaced-objects'))).toBe(true);
  await accordion.locator('summary').click();
  const table=page.getByRole('table',{name:'Location ports',exact:true});
  await expect(table.getByRole('columnheader')).toHaveText(['Port','Label','VLAN','Patch status']);
  await expect(table.locator('tbody tr')).toHaveCount(5);
  const linked=table.locator('tbody tr').filter({hasText:'B001'});
  await expect(linked).toContainText('SMB A');await expect(linked).toContainText('Shared jack');
  await expect(linked.locator('td').nth(1)).toHaveText('10');await expect(linked.locator('td').last()).toHaveText('Patched');
  await expect(table.locator('tbody tr').filter({hasText:'Spare'})).toContainText('Not linked');
  await expect(table.locator('tbody tr').filter({hasText:'B002'})).toContainText('SMB B');
  await expect(table.locator('tbody tr').filter({hasText:'B006'})).toContainText('Wall plate');
  await expect(table.locator('tbody tr').filter({hasText:'B003'})).toContainText('Unplaced');
  await expect(table).not.toContainText('B004');await expect(table).not.toContainText('B005');
  await page.goto('/#/cabinets');await page.getByRole('tab',{name:'Ports',exact:true}).click();
  await page.locator('[data-port="R1/SW1/1"]').press('Enter');
  await page.getByRole('combobox',{name:'Port VLAN',exact:true}).selectOption('60');
  await page.goto('/#/facility');await saved(page);await page.locator('[data-object-id="room-201"]').press('Enter');
  await accordion.locator('summary').click();await expect(linked.locator('td').nth(1)).toHaveText('60');
  await page.setViewportSize({width:390,height:844});await panel(page,'Properties');
  await table.scrollIntoViewIfNeeded();expect(await table.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1440,height:900});
  await page.locator(`[data-object-id="${empty.id}"]`).press('Enter');
  await expect(accordion.locator('summary')).toHaveText('Ports 0');await accordion.locator('summary').click();
  await expect(accordion).toContainText('No ports in this location.');
});

test('Speaker tool supports placement, properties, filtering, reload and export/import',async({page})=>{
  await start(page);await tool(page,'Speaker');
  await field(page,'Symbol width (plan units)','20');await clickPoint(page,350,180);
  let plan=await saved(page);const speaker=plan.objects.at(-1)!;
  expect(speaker).toMatchObject({kind:'speaker',name:'Speaker 1',layerId:'devices',symbolWidth:20});
  const shape=page.locator(`[data-object-id="${speaker.id}"]`);
  await expect(shape.locator('.floor-symbol')).toBeVisible();
  await field(page,'Object name','Shipping speaker');await field(page,'Object notes','Ceiling speaker');
  await propertyGroup(page,'placement');await field(page,'Rotation (degrees)','90');
  await panel(page,'Filters');await page.getByLabel('Filter type',{exact:true}).selectOption('speaker');
  await expect(shape).toBeVisible();
  await expect(page.locator('.floor-object')).toHaveCount(1);
  await panel(page,'Properties');await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();
  expect((await saved(page)).objects.find(o=>o.id===speaker.id)!.rotation).toBe(0);
  await page.getByRole('button',{name:'Redo floor edit',exact:true}).click();
  plan=await saved(page);await page.reload();expect(await saved(page)).toEqual(plan);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();
  const backup=await readFile((await(await download).path())!);
  page.once('dialog',dialog=>dialog.accept());await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'speaker-plan.json',mimeType:'application/json',buffer:backup});
  await expect.poll(()=>saved(page)).toEqual(plan);
});

test('switching drawing tools and resizing preserve zoom and pan until Fit plan is requested',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  const drawing=page.locator('.floor-canvas>g');
  const initial=await drawing.getAttribute('transform');
  await page.getByRole('button',{name:'Zoom floor in',exact:true}).click();
  await tool(page,'Pan');await drag(page,{x:300,y:200},{x:330,y:220});
  const zoomed=await drawing.getAttribute('transform');expect(zoomed).not.toBe(initial);
  for(const name of ['Location box','Wall plate','Cable path','Measure','Select']){
    await tool(page,name);
    // Let layout and ResizeObserver callbacks settle before checking the view.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await expect(drawing).toHaveAttribute('transform',zoomed!);
  }
  await page.setViewportSize({width:1200,height:800});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(drawing).toHaveAttribute('transform',zoomed!);
  await page.getByRole('button',{name:'Fit plan',exact:true}).click();
  await expect(drawing).not.toHaveAttribute('transform',zoomed!);
  const bounds=await page.locator('.floor-canvas').boundingBox();
  const plan=await saved(page),topLeft=await point(page,0,0),bottomRight=await point(page,plan.background.width,plan.background.height);
  expect(topLeft.x).toBeGreaterThanOrEqual(bounds!.x+15);expect(topLeft.y).toBeGreaterThanOrEqual(bounds!.y+15);
  expect(bottomRight.x).toBeLessThanOrEqual(bounds!.x+bounds!.width-15);expect(bottomRight.y).toBeLessThanOrEqual(bounds!.y+bounds!.height-15);
});

test('symbols keep their drawing width across zoom with configurable calibrated size and persistence',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  const initial=await saved(page),face=page.locator('[data-object-id="plate-204"] .floor-symbol-face');
  const width=async()=>(await face.boundingBox())!.width;
  const zoom=async()=>page.locator('.floor-canvas>g').evaluate(g=>(g as SVGGElement).getCTM()!.a);
  const drawingWidth=async()=>await width()/await zoom();
  const normalWidth=await width(),normalDrawingWidth=await drawingWidth();
  expect(normalDrawingWidth).toBeCloseTo(29.5,1);
  await page.getByRole('button',{name:'Zoom floor in',exact:true}).click();
  await page.getByRole('button',{name:'Zoom floor in',exact:true}).click();
  expect(await width()).toBeCloseTo(normalWidth*1.2*1.2,1);
  expect(await drawingWidth()).toBeCloseTo(normalDrawingWidth,1);
  const canvas=page.locator('.floor-canvas'),bounds=(await canvas.boundingBox())!;
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  const beforeWheel=await page.locator('.floor-canvas>g').getAttribute('transform');
  await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');
  await expect(page.locator('.floor-canvas>g')).not.toHaveAttribute('transform',beforeWheel!);
  expect(await drawingWidth()).toBeCloseTo(normalDrawingWidth,1);
  await page.getByRole('button',{name:'Fit plan',exact:true}).click();
  await page.getByRole('button',{name:'Calibrate scale',exact:true}).click();await clickPoint(page,100,100);await clickPoint(page,300,100);
  await field(page,'Known distance','100');await page.getByLabel('Calibration units').selectOption('ft');await page.getByRole('button',{name:'Apply scale',exact:true}).click();
  expect(await drawingWidth()).toBeCloseTo(normalDrawingWidth,1);
  const calibrated=await saved(page);
  await tool(page,'Wall plate');
  await expect(page.getByRole('spinbutton',{name:'Symbol width (ft)',exact:true})).toHaveValue('14');
  await field(page,'Symbol width (ft)','1');
  expect(await drawingWidth()).toBeCloseTo(normalDrawingWidth,1);
  await field(page,'Symbol width (ft)','2');
  await page.getByRole('button',{name:'Undo floor edit'}).click();
  await expect(page.getByRole('spinbutton',{name:'Symbol width (ft)',exact:true})).toHaveValue('1');
  await page.getByRole('combobox',{name:'Floor length units',exact:true}).selectOption('m');
  await expect(page.getByRole('spinbutton',{name:'Symbol width (m)',exact:true})).toHaveValue('0.3048');
  const changed=await saved(page);expect(changed.toolDefaults?.plate?.symbolWidth).toBe(2);expect(changed.objects).toEqual(initial.objects);expect(changed.calibration).toEqual(calibrated.calibration);
  await page.reload();expect(await saved(page)).toEqual(changed);expect(await drawingWidth()).toBeCloseTo(normalDrawingWidth,1);
  await tool(page,'Wall plate');await clickPoint(page,600,580);
  const added=(await saved(page)).objects.at(-1)!;expect(added.symbolWidth).toBe(2);
  await tool(page,'Select');await clickPoint(page,470,475);await panel(page,'Properties');
  await expect(page.getByRole('textbox',{name:'Object name',exact:true})).toHaveValue(initial.objects.find(o=>o.id==='plate-204')!.name);
});

test('items drag freely by icon and label with snapping disabled',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  await page.getByRole('checkbox',{name:'Snap to grid',exact:true}).uncheck();
  const initial=(await saved(page)).objects.find(o=>o.id==='ap-01')!;
  await drag(page,initial,{x:initial.x+17.3,y:initial.y+13.7});
  let moved=(await saved(page)).objects.find(o=>o.id===initial.id)!;
  expect(moved.x-initial.x).toBeCloseTo(17.3,1);expect(moved.y-initial.y).toBeCloseTo(13.7,1);
  const label=page.locator('[data-object-id="ap-01"] .floor-symbol>text').first();
  const bounds=(await label.boundingBox())!;const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+25,y+17,{steps:8});await page.mouse.up();
  const byLabel=(await saved(page)).objects.find(o=>o.id===initial.id)!;
  expect(byLabel.x).toBeGreaterThan(moved.x+20);expect(byLabel.y).toBeGreaterThan(moved.y+10);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('dragging off-grid items snaps their anchors and group movement preserves spacing',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  const initial=await saved(page),ap=initial.objects.find(o=>o.id==='ap-01')!;
  expect(ap.x%10).not.toBe(0);expect(ap.y%10).not.toBe(0);
  await drag(page,ap,{x:ap.x+17,y:ap.y+13});
  let moved=(await saved(page)).objects.find(o=>o.id===ap.id)!;
  expect(moved.x).toBe(160);expect(moved.y).toBe(190);
  await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();
  expect((await saved(page)).objects.find(o=>o.id===ap.id)).toEqual(ap);
  // Dragging the label uses the symbol center, not the pointer's offset on the label.
  const label=page.locator('[data-object-id="ap-01"] .floor-symbol>text').first();
  const box=(await label.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+25,y+17,{steps:8});await page.mouse.up();
  moved=(await saved(page)).objects.find(o=>o.id===ap.id)!;
  expect(moved.x%10).toBe(0);expect(moved.y%10).toBe(0);
  await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();
  const second=initial.objects.find(o=>o.id==='ap-02')!;
  await page.locator('[data-object-id="ap-01"]').press('Enter');
  await page.keyboard.down('Shift');await clickPoint(page,second.x,second.y);await page.keyboard.up('Shift');
  // The second item is the drag anchor even though it follows the first in the plan.
  await drag(page,second,{x:second.x+17,y:second.y+13});
  const group=await saved(page),a=group.objects.find(o=>o.id===ap.id)!,b=group.objects.find(o=>o.id===second.id)!;
  expect(b.x%10).toBe(0);expect(b.y%10).toBe(0);
  expect(b.x-a.x).toBe(second.x-ap.x);expect(b.y-a.y).toBe(second.y-ap.y);
  await page.reload();expect(await saved(page)).toEqual(group);
});

test('grid spacing changes preserve placed items and calibration while new placements use the new grid',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  await page.getByRole('button',{name:'Calibrate scale',exact:true}).click();await clickPoint(page,100,100);await clickPoint(page,300,100);
  await field(page,'Known distance','20');await page.getByLabel('Calibration units').selectOption('ft');await page.getByRole('button',{name:'Apply scale',exact:true}).click();
  const initial=await saved(page);
  await page.getByRole('combobox',{name:'Grid units',exact:true}).selectOption('ft');
  await expect(page.getByRole('spinbutton',{name:'Grid spacing',exact:true})).toHaveValue('1');
  await field(page,'Grid spacing','2.5');
  await expect(page.locator('#facility-grid')).toHaveAttribute('width','25');
  let changed=await saved(page);expect(changed.grid).toEqual({spacing:2.5,unit:'ft'});
  expect(changed.objects).toEqual(initial.objects);expect(changed.calibration).toEqual(initial.calibration);
  await page.getByRole('combobox',{name:'Grid units',exact:true}).selectOption('m');
  await expect(page.getByRole('spinbutton',{name:'Grid spacing',exact:true})).toHaveValue('0.762');
  expect(Number(await page.locator('#facility-grid').getAttribute('width'))).toBeCloseTo(25,8);
  await tool(page,'SMB');await placeSmbLater(page,212,410);
  const added=(await saved(page)).objects.at(-1)!;expect(added.x).toBeCloseTo(200,8);expect(added.y).toBeCloseTo(400,8);
  await field(page,'Grid spacing','1.524');
  changed=await saved(page);expect(changed.objects.slice(0,-1)).toEqual(initial.objects);expect(changed.objects.at(-1)).toEqual(added);
  await page.reload();expect(await saved(page)).toEqual(changed);
  await expect(page.getByRole('spinbutton',{name:'Grid spacing',exact:true})).toHaveValue('1.524');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('selection marquee works inside rooms without snapping and contains the entire symbol and label',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);const before=await saved(page);
  const a=await point(page,343,413),b=await point(page,517,543);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});
  await expect(page.locator('.floor-selection-marquee')).toHaveAttribute('x',/^34[23]\.\d+|343$/);
  expect(Number(await page.locator('.floor-selection-marquee').getAttribute('width'))).toBeCloseTo(174,1);
  await page.mouse.up();await expect(page.locator('.floor-object.selected')).toHaveCount(1);
  await expect(page.locator('[data-object-id="plate-204"]')).toHaveAttribute('aria-pressed','true');
  expect(await saved(page)).toEqual(before);
  // A rectangle that contains the anchor but cuts off its label must not select it.
  await drag(page,{x:435,y:445},{x:505,y:490});await expect(page.locator('.floor-object.selected')).toHaveCount(0);
  await drag(page,{x:517,y:543},{x:343,y:413});await expect(page.locator('[data-object-id="plate-204"]')).toHaveAttribute('aria-pressed','true');
  expect(await saved(page)).toEqual(before);
});

test('individual symbol scaling keeps selection aligned, preserves positions, supports undo and respects locks',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  await page.getByRole('button',{name:'Calibrate scale',exact:true}).click();await clickPoint(page,100,100);await clickPoint(page,300,100);
  await field(page,'Known distance','20');await page.getByLabel('Calibration units').selectOption('ft');await page.getByRole('button',{name:'Apply scale',exact:true}).click();
  const before=await saved(page),original=before.objects.find(o=>o.id==='ap-01')!;
  await clickPoint(page,original.x,original.y);await panel(page,'Properties');
  await field(page,'Item symbol width (ft)','2');
  const changed=(await saved(page)).objects.find(o=>o.id===original.id)!;
  expect(changed).toEqual({...original,symbolWidth:20});
  expect((await saved(page)).objects.filter(o=>o.id!==original.id)).toEqual(before.objects.filter(o=>o.id!==original.id));
  const object=page.locator('[data-object-id="ap-01"]'),outline=object.locator('.floor-selection-outline');
  await expect(outline).toBeVisible();await expect(object.locator('[data-symbol-resize]')).toHaveCount(4);
  for(let i=0;i<2;i++){
    const selection=(await outline.boundingBox())!,face=(await object.locator('.floor-symbol-face').boundingBox())!,label=(await object.locator('.floor-symbol-label').boundingBox())!;
    expect(selection.x).toBeLessThanOrEqual(Math.min(face.x,label.x));expect(selection.y).toBeLessThanOrEqual(face.y);
    expect(selection.x+selection.width).toBeGreaterThanOrEqual(Math.max(face.x+face.width,label.x+label.width));
    expect(selection.y+selection.height).toBeGreaterThanOrEqual(label.y+label.height);
    expect((await object.locator('[data-symbol-resize="se"]').boundingBox())!.width).toBeCloseTo(9.5,1);
    await page.getByRole('button',{name:'Zoom floor in',exact:true}).click();
  }
  await object.focus();await expect(object).toHaveCSS('outline-style','none');await expect(outline).toBeVisible();
  const handle=(await object.locator('[data-symbol-resize="se"]').boundingBox())!,x=handle.x+handle.width/2,y=handle.y+handle.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+20,y+20,{steps:8});await page.mouse.up();
  const resized=(await saved(page)).objects.find(o=>o.id===original.id)!;
  expect(resized.symbolWidth).toBeGreaterThan(20);expect(resized.x).toBe(original.x);expect(resized.y).toBe(original.y);
  await page.getByRole('button',{name:'Undo floor edit'}).click();expect((await saved(page)).objects.find(o=>o.id===original.id)).toEqual(changed);
  await page.reload();expect((await saved(page)).objects.find(o=>o.id===original.id)).toEqual(changed);
  await clickPoint(page,original.x,original.y);await panel(page,'Layers');await page.getByRole('button',{name:'Lock layer Access Points',exact:true}).click();await panel(page,'Properties');
  await propertyGroup(page,'symbol');
  await expect(page.getByRole('spinbutton',{name:/^Item symbol width/})).toBeDisabled();await expect(object.locator('[data-symbol-resize]')).toHaveCount(0);
  await panel(page,'Layers');await page.getByRole('button',{name:'Unlock layer Access Points',exact:true}).click();await panel(page,'Properties');
  await propertyGroup(page,'symbol');await page.getByRole('button',{name:'Use default symbol width',exact:true}).click();expect((await saved(page)).objects.find(o=>o.id===original.id)!.symbolWidth).toBe(28);
  await page.screenshot({path:'artifacts/facility-selection-sizing.png',fullPage:true});
});

test('room dimensions use calibrated feet and meters without moving their anchor',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  await page.getByRole('button',{name:'Calibrate scale',exact:true}).click();await clickPoint(page,100,100);await clickPoint(page,300,100);
  await field(page,'Known distance','20');await page.getByLabel('Calibration units').selectOption('ft');await page.getByRole('button',{name:'Apply scale',exact:true}).click();
  const before=await saved(page),room=before.objects.find(o=>o.id==='room-201')!;
  await clickPoint(page,room.x+20,room.y+15);await panel(page,'Properties');
  await propertyGroup(page,'symbol');
  await expect(page.getByRole('spinbutton',{name:'Width (ft)',exact:true})).toHaveValue('20.7');
  await field(page,'Width (ft)','25');await field(page,'Height (ft)','18');
  await page.getByRole('combobox',{name:'Floor length units',exact:true}).selectOption('m');
  await expect(page.getByRole('spinbutton',{name:'Width (m)',exact:true})).toHaveValue('7.62');
  await field(page,'Height (m)','6.096');
  const after=await saved(page),resized=after.objects.find(o=>o.id===room.id)!;
  expect(resized.width).toBeCloseTo(250,8);expect(resized.height).toBeCloseTo(200,8);
  expect(resized.x).toBe(room.x);expect(resized.y).toBe(room.y);expect(after.calibration).toEqual(before.calibration);
  expect(after.objects.filter(o=>o.id!==room.id)).toEqual(before.objects.filter(o=>o.id!==room.id));
});

test('item label font, placement and offsets persist with correct selection bounds and unchanged geometry',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);const initial=await saved(page),item=initial.objects.find(o=>o.id==='ap-01')!;
  await clickPoint(page,item.x,item.y);await panel(page,'Properties');
  const object=page.locator('[data-object-id="ap-01"]'),label=object.locator('.floor-item-label-box'),text=object.locator('.floor-item-label-text');
  await field(page,'Label font size','18');await page.getByRole('combobox',{name:'Label position',exact:true}).selectOption('above');
  await field(page,'Label X offset','7');await field(page,'Label Y offset','-9');
  await expect(text).toHaveAttribute('font-size','18');
  const labelBounds=(await label.boundingBox())!,face=(await object.locator('.floor-symbol-face').boundingBox())!,outline=(await object.locator('.floor-selection-outline').boundingBox())!;
  expect(labelBounds.y+labelBounds.height).toBeLessThan(face.y);
  expect(outline.x).toBeLessThan(labelBounds.x);expect(outline.y).toBeLessThan(labelBounds.y);
  expect(outline.x+outline.width).toBeGreaterThan(labelBounds.x+labelBounds.width);
  let savedPlan=await saved(page),updated=savedPlan.objects.find(o=>o.id===item.id)!;
  expect(updated).toEqual({...item,labelStyle:{fontSize:18,position:'above',offsetX:7,offsetY:-9}});
  expect(savedPlan.objects.filter(o=>o.id!==item.id)).toEqual(initial.objects.filter(o=>o.id!==item.id));
  await page.getByRole('combobox',{name:'Label position',exact:true}).selectOption('right');
  expect((await label.boundingBox())!.x).toBeGreaterThan((await object.locator('.floor-symbol-face').boundingBox())!.x+face.width);
  await page.getByRole('button',{name:'Undo floor edit'}).click();expect((await saved(page)).objects.find(o=>o.id===item.id)).toEqual(updated);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();
  const backup=JSON.parse((await readFile((await(await download).path())!)).toString()).facilityPlan as FloorPlan;expect(backup.objects.find(o=>o.id===item.id)).toEqual(updated);
  await page.reload();expect((await saved(page)).objects.find(o=>o.id===item.id)).toEqual(updated);
  await clickPoint(page,item.x,item.y);await panel(page,'Layers');await page.getByRole('button',{name:'Lock layer Access Points',exact:true}).click();await panel(page,'Properties');
  await propertyGroup(page,'label');
  await expect(page.getByRole('spinbutton',{name:'Label font size',exact:true})).toBeDisabled();await expect(page.getByRole('combobox',{name:'Label position',exact:true})).toBeDisabled();
  await panel(page,'Layers');await page.getByRole('button',{name:'Unlock layer Access Points',exact:true}).click();await panel(page,'Properties');
  await propertyGroup(page,'label');await page.getByRole('button',{name:'Reset label style',exact:true}).click();await expect(text).toHaveAttribute('font-size','10');
  expect((await saved(page)).objects.find(o=>o.id===item.id)!.labelStyle).toBeUndefined();
  const room=initial.objects.find(o=>o.id==='room-201')!;await clickPoint(page,room.x+20,room.y+15);await panel(page,'Properties');
  await field(page,'Label font size','16');await page.getByRole('combobox',{name:'Label position',exact:true}).selectOption('bottom-right');
  await expect(page.locator('[data-object-id="room-201"] .floor-item-label-text')).toHaveAttribute('font-size','16');
  const roomLabel=page.locator('[data-object-id="room-201"] .floor-item-label-box');expect(Number(await roomLabel.getAttribute('y'))).toBeGreaterThan(room.y+room.height!-40);
  savedPlan=await saved(page);expect(savedPlan.objects.find(o=>o.id===room.id)).toEqual({...room,labelStyle:{fontSize:16,position:'bottom-right'}});
  await page.screenshot({path:'artifacts/facility-label-settings.png',fullPage:true});
});

test('facility sample, editable room and unmapped four-port plate persist with layers and filters',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:900});await start(page);
  const initial=await saved(page);await expect(page.locator('[data-object-id]')).toHaveCount(initial.objects.length);
  await page.screenshot({path:'artifacts/facility-desktop.png',fullPage:true});
  await tool(page,'Location box');await drag(page,{x:60,y:370},{x:290,y:560});
  await field(page,'Object name','Office 204');await field(page,'Object notes','West offices');
  const room=(await saved(page)).objects.at(-1)!;
  await drag(page,{x:80,y:382},{x:100,y:392});
  const moved=(await saved(page)).objects.find(o=>o.id===room.id)!;expect(moved.x).toBeGreaterThan(room.x);
  await drag(page,{x:moved.x+moved.width!,y:moved.y+moved.height!},{x:moved.x+moved.width!+10,y:moved.y+moved.height!+10});
  await field(page,'Object name','Office 204 West');
  await tool(page,'Wall plate');await expect(page.getByRole('combobox',{name:'Wall plate port count'})).toHaveValue('4');await clickPoint(page,220,490);
  await page.getByRole('combobox',{name:'Room / location',exact:true}).selectOption(room.id);
  let plan=await saved(page);const plate=plan.objects.at(-1)!;expect(plate.ports).toHaveLength(4);expect(plate.locationId).toBe(room.id);
  expect(plate.ports!.every(p=>p.mappingStatus==='unmapped'&&!p.idfId&&!p.patchPanelId&&!p.switchId)).toBe(true);
  expect(plan.objects.filter(o=>o.points).length).toBe(initial.objects.filter(o=>o.points).length);
  await panel(page,'Layers');await page.getByRole('checkbox',{name:'Show layer Network Outlets',exact:true}).uncheck();await expect(page.locator('[data-kind="plate"]')).toHaveCount(0);
  await page.getByRole('checkbox',{name:'Show layer Network Outlets',exact:true}).check();await expect(page.locator('[data-kind="plate"]')).toHaveCount(6);
  await page.getByRole('textbox',{name:'New layer name'}).fill('Future Expansion');await page.getByRole('button',{name:'Add layer',exact:true}).click();
  const layer=(await saved(page)).layers.at(-1)!;
  await clickPoint(page,220,490);await panel(page,'Properties');await propertyGroup(page,'layer');await page.getByRole('combobox',{name:'Layer',exact:true}).selectOption(layer.id);
  await panel(page,'Layers');await field(page,'Layer name','Future Office Expansion');await page.getByRole('checkbox',{name:'Show layer Future Office Expansion'}).uncheck();await expect(page.locator(`[data-object-id="${plate.id}"]`)).toHaveCount(0);
  await page.getByRole('checkbox',{name:'Show layer Future Office Expansion'}).check();await panel(page,'Filters');await page.getByLabel('Filter status').selectOption('unmapped');await expect(page.locator('[data-kind="idf"]')).toHaveCount(0);await page.getByRole('button',{name:'Clear floor filters'}).click();await expect(page.locator('[data-kind="idf"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Save drawing',exact:true}).click();plan=await saved(page);await page.reload();expect(await saved(page)).toEqual(plan);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();const backup=await readFile((await(await download).path())!);expect(JSON.parse(backup.toString()).facilityPlan).toEqual(plan);
  await tool(page,'SMB');await placeSmbLater(page,200,200);await saved(page);
  page.once('dialog',d=>d.accept());await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'floor.json',mimeType:'application/json',buffer:backup});await expect.poll(()=>saved(page)).toEqual(plan);
  await expect(page.getByRole('alert')).toHaveCount(0);expect(errors).toEqual([]);
});

test('route vertices, scale, history, duplication and locked layers work without changing rack data',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  const rackData=await page.evaluate(()=>localStorage.getItem('porttracker.project'));
  await tool(page,'Cable path');await clickPoint(page,100,290);await clickPoint(page,200,330);await clickPoint(page,300,390);await page.getByRole('button',{name:'Finish path',exact:true}).click();
  let plan=await saved(page);const route=plan.objects.at(-1)!;expect(route.points!.length).toBeGreaterThan(2);expect(route.status).toBe('planned');expect(route.destinationId).toBeUndefined();
  await expect(page.locator('.floor-measure-result')).toContainText('Uncalibrated');
  const vertex=route.points![1];await drag(page,vertex,{x:vertex.x+20,y:vertex.y+10});plan=await saved(page);const points=plan.objects.find(o=>o.id===route.id)!.points!;expect(points).not.toEqual(route.points);expect(points[0]).toEqual(route.points![0]);expect(points[2]).toEqual(route.points![2]);
  await page.getByRole('button',{name:'Calibrate scale',exact:true}).click();await clickPoint(page,100,100);await clickPoint(page,300,100);await field(page,'Known distance','20');await page.getByLabel('Calibration units').selectOption('ft');await page.getByRole('button',{name:'Apply scale',exact:true}).click();
  await tool(page,'Measure');await clickPoint(page,100,100);await clickPoint(page,200,100);await expect(page.locator('.floor-measure-toast')).toContainText('10.0 ft');
  await tool(page,'Select');await page.locator('[data-object-id="ap-01"]').click();await panel(page,'Properties');const before=(await saved(page)).objects.find(o=>o.id==='ap-01')!;
  await drag(page,{x:before.x,y:before.y},{x:before.x+40,y:before.y+30});const after=(await saved(page)).objects.find(o=>o.id==='ap-01')!;expect(after.x).not.toBe(before.x);
  await page.getByRole('button',{name:'Undo floor edit'}).click();expect((await saved(page)).objects.find(o=>o.id==='ap-01')).toEqual(before);await page.getByRole('button',{name:'Redo floor edit'}).click();expect((await saved(page)).objects.find(o=>o.id==='ap-01')).toEqual(after);
  await page.getByRole('button',{name:'Duplicate',exact:true}).click();expect((await saved(page)).objects.filter(o=>o.kind==='ap')).toHaveLength(4);
  await panel(page,'Layers');await page.getByRole('button',{name:'Lock layer Access Points',exact:true}).click();await clickPoint(page,after.x,after.y);await panel(page,'Properties');await expect(page.getByRole('textbox',{name:'Object name',exact:true})).toBeDisabled();
  await page.getByRole('link',{name:'Racks',exact:true}).click();await expect(page.getByRole('region',{name:'Rack workspace'})).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('porttracker.project'))).toBe(rackData);
});

test('safe background import, invalid project rejection and mobile placement',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:390,height:844});await start(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/facility-mobile.png',fullPage:true});
  await tool(page,'SMB');await placeSmbLater(page,200,200);await panel(page,'Properties');await expect(page.getByRole('textbox',{name:'Object name',exact:true})).toHaveValue(/^SMB-\d{3,}$/);
  await page.getByRole('button',{name:'Close floor panels'}).click();const before=await saved(page);
  await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schemaVersion":999}')});await expect(page.getByRole('alert')).toContainText('unsupported');expect((await saved(page)).objects).toEqual(before.objects);
  await page.getByRole('button',{name:'Dismiss floor error'}).click();
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><script>window.badSvg=true</script><rect width="600" height="400" fill="#dfeaf4"/></svg>';
  await page.getByLabel('Upload floor plan').setInputFiles({name:'plan.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await expect(page.getByRole('dialog',{name:'Replace floor plan background'})).toBeVisible();await page.getByRole('button',{name:'Use plan · clear overlays',exact:true}).click();
  const imported=await saved(page);expect(imported.background.src).toMatch(/^data:image\/png;base64,/);expect(imported.objects).toHaveLength(0);expect(imported.calibration).toBeNull();expect(await page.evaluate(()=>('badSvg' in window))).toBe(false);
  await page.reload();expect((await saved(page)).background).toEqual(imported.background);expect(errors).toEqual([]);
});

test('PDF upload renders the selected page and preserves the original document',async({page})=>{
  await start(page);
  // Small self-contained two-page PDF with a vector rectangle on each page.
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 5 0 R >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 5 0 R >>'];
  const stream='0.2 0.4 0.7 rg 20 20 150 100 re f';objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await page.getByLabel('Upload floor plan').setInputFiles({name:'two-pages.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf)});
  await expect(page.getByRole('dialog',{name:'Replace floor plan background'})).toBeVisible();await page.getByLabel('PDF page',{exact:true}).fill('2');await page.getByRole('button',{name:'Preview page',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('page 2');await page.getByRole('button',{name:'Use plan · clear overlays'}).click();
  const plan=await saved(page);expect(plan.background.width).toBe(800);expect(plan.background.height).toBe(600);expect(plan.background.original?.page).toBe(2);expect(plan.background.original?.data).toMatch(/^data:application\/pdf;base64,/);
});

test('multi-selection, layer removal and per-port filters preserve drawing data',async({page})=>{
  await start(page);const initial=await saved(page);
  await page.locator('[data-object-id="ap-01"]').click();await page.locator('[data-object-id="ap-02"]').click({modifiers:['Shift']});
  await expect(page.getByRole('heading',{name:'2 objects selected'})).toBeVisible();
  await page.getByRole('application',{name:'Facility floor plan canvas'}).focus();await page.keyboard.press('Control+d');expect((await saved(page)).objects.filter(o=>o.kind==='ap')).toHaveLength(5);
  await page.keyboard.press('Control+z');expect((await saved(page)).objects).toEqual(initial.objects);
  await panel(page,'Layers');await page.getByRole('button',{name:'Edit layer Access Points',exact:true}).click();await page.getByRole('button',{name:'Remove',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Remove drawing layer'});await dialog.getByRole('combobox').selectOption('devices');await dialog.getByRole('button',{name:'Confirm removal'}).click();
  const reassigned=await saved(page);expect(reassigned.objects.filter(o=>o.kind==='ap').every(o=>o.layerId==='devices')).toBe(true);expect(reassigned.objects).toHaveLength(initial.objects.length);
  await clickPoint(page,470,475);await panel(page,'Properties');await page.getByRole('combobox',{name:'Mapping status',exact:true}).selectOption('verified');
  await panel(page,'Filters');await page.getByLabel('Filter status').selectOption('verified');await page.getByRole('button',{name:/^Network ports/}).click();
  await expect(page.locator('.floor-table-scroll tbody tr')).toHaveCount(1);await expect(page.locator('.floor-table-scroll')).toContainText('A-204-01');
  await page.getByRole('button',{name:'Clear floor filters'}).click();await expect(page.locator('.floor-table-scroll tbody tr')).toHaveCount(11);
});

test('touch pinch zoom changes the viewport without moving or creating objects',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});const page=await context.newPage();
  await start(page);const before=await saved(page),canvas=page.locator('.floor-canvas');const bounds=(await canvas.boundingBox())!;
  const initialScale=await page.locator('.floor-canvas>g').evaluate(g=>(g as SVGGElement).getCTM()!.a);
  const face=page.locator('[data-object-id="ap-01"] .floor-symbol-face'),initialWidth=(await face.boundingBox())!.width;
  const client=await context.newCDPSession(page),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-65,y,id:1},{x:x+65,y,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const finalScale=await page.locator('.floor-canvas>g').evaluate(g=>(g as SVGGElement).getCTM()!.a);
  expect(finalScale).toBeGreaterThan(initialScale*1.5);
  expect((await face.boundingBox())!.width/finalScale).toBeCloseTo(initialWidth/initialScale,1);
  expect(await saved(page)).toEqual(before);await context.close();
});

for(const mobile of [false,true])test(`${mobile?'mobile':'desktop'} floor image rotation and cropping preserve source, undo and save`,async({page})=>{
  await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});await start(page);
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="white"/><rect width="100" height="100" fill="red"/></svg>';
  await page.getByLabel('Upload floor plan').setInputFiles({name:'orientation.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await page.getByRole('button',{name:'Use plan · clear overlays'}).click();const original=await saved(page);
  await page.getByRole('button',{name:'Rotate / crop',exact:true}).click();const editor=page.getByRole('dialog',{name:'Rotate and crop floor plan'});
  await editor.getByRole('button',{name:'Rotate right 90°',exact:true}).click();await expect(editor.getByRole('spinbutton',{name:'Crop width',exact:true})).toHaveValue('300');
  const red=await editor.locator('svg[aria-label="Floor plan crop preview"]>image').evaluate(async node=>{
    const img=new Image();img.src=(node as SVGImageElement).href.baseVal;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);return Array.from(ctx.getImageData(250,50,1,1).data);
  });expect(red).toEqual([255,0,0,255]);
  const preview=editor.getByRole('img',{name:'Floor plan crop preview'});
  await preview.scrollIntoViewIfNeeded();
  const coords=await preview.evaluate(node=>{const m=(node as SVGSVGElement).getScreenCTM()!;const a=new DOMPoint(20,20).matrixTransform(m),b=new DOMPoint(280,380).matrixTransform(m);return{a:{x:a.x,y:a.y},b:{x:b.x,y:b.y}};});
  await page.mouse.move(coords.a.x,coords.a.y);await page.mouse.down();await page.mouse.move(coords.b.x,coords.b.y,{steps:6});await page.mouse.up();
  await expect(editor.getByRole('spinbutton',{name:'Crop x',exact:true})).toHaveValue('20');await expect(editor.getByRole('spinbutton',{name:'Crop width',exact:true})).toHaveValue('260');
  await editor.getByRole('button',{name:'Crop to selection',exact:true}).click();await expect(editor.getByRole('spinbutton',{name:'Crop height',exact:true})).toHaveValue('360');
  await page.screenshot({path:`artifacts/facility-image-editor-${mobile?'mobile':'desktop'}.png`,fullPage:true});
  await editor.getByRole('button',{name:'Apply image changes',exact:true}).click();const edited=await saved(page);expect(edited.background.width).toBe(260);expect(edited.background.height).toBe(360);expect(edited.background.original).toEqual(original.background.original);
  await page.getByRole('button',{name:'Undo floor edit'}).click();expect(await saved(page)).toEqual(original);await page.getByRole('button',{name:'Redo floor edit'}).click();expect(await saved(page)).toEqual(edited);
  await page.reload();expect(await saved(page)).toEqual(edited);
  await page.getByRole('button',{name:'Rotate / crop',exact:true}).click();await editor.getByRole('button',{name:'Rotate left 90°',exact:true}).click();await expect(editor.getByRole('spinbutton',{name:'Crop width',exact:true})).toHaveValue('360');await editor.getByRole('button',{name:'Cancel',exact:true}).click();expect(await saved(page)).toEqual(edited);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('crop preview blocks cutting off hidden objects and applies whole-plan rotation without losing overlays',async({page})=>{
  await start(page);await page.getByRole('checkbox',{name:'Show layer Network Outlets',exact:true}).uncheck();const initial=await saved(page);
  await page.getByRole('button',{name:'Rotate / crop',exact:true}).click();const editor=page.getByRole('dialog',{name:'Rotate and crop floor plan'});
  await editor.getByRole('spinbutton',{name:'Crop width',exact:true}).fill('200');await expect(editor.getByRole('status')).toContainText('excludes');await expect(editor.getByRole('button',{name:'Crop to selection',exact:true})).toBeDisabled();
  await editor.getByRole('button',{name:'Clear crop selection',exact:true}).click();await editor.getByRole('button',{name:'Rotate right 90°',exact:true}).click();await editor.getByRole('button',{name:'Apply image changes',exact:true}).click();
  const rotated=await saved(page);expect(rotated.objects).toHaveLength(initial.objects.length);expect(rotated.layers).toEqual(initial.layers);
  expect(rotated.objects.find(o=>o.id==='plate-204')).toMatchObject({x:175,y:470,rotation:90,ports:initial.objects.find(o=>o.id==='plate-204')!.ports});
  await page.getByRole('button',{name:'Undo floor edit'}).click();expect(await saved(page)).toEqual(initial);
});


test('SMB identifiers and eight independent ports persist through edits, duplication and reload',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  await tool(page,'SMB');
  await placeSmbLater(page,200,200);
  for(let n=2;n<=8;n++)await page.getByRole('button',{name:`Add SMB port ${n}`,exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Object name',exact:true})).toHaveValue('SMB-001');
  const slots=page.locator('.floor-smb-port-table');
  await expect(slots.getByRole('button',{name:/^Edit SMB port/})).toHaveCount(8);
  await expect(page.getByRole('combobox',{name:'SMB port count',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Edit SMB port 8',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Port label',exact:true})).toHaveValue('SMB-001-8');
  await field(page,'Port notes','Eighth jack');
  await page.getByRole('combobox',{name:'Mapping status',exact:true}).selectOption('verified');
  const original=(await saved(page)).objects.at(-1)!;
  expect(original.ports).toHaveLength(8);expect(original.ports![7].notes).toBe('Eighth jack');
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Remove port 8',exact:true}).click();
  expect((await saved(page)).objects.at(-1)!.ports).toHaveLength(8);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Remove port 8',exact:true}).click();
  await expect(slots.getByRole('button',{name:'Add SMB port 8',exact:true})).toBeEnabled();
  expect((await saved(page)).objects.at(-1)!.ports).toEqual(original.ports!.slice(0,7));
  await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();
  expect((await saved(page)).objects.at(-1)).toEqual(original);
  await page.getByRole('button',{name:'Duplicate',exact:true}).click();
  let plan=await saved(page);const copy=plan.objects.at(-1)!;
  expect(copy.name).toBe('SMB-002');expect(copy.ports).toHaveLength(8);
  expect(copy.ports!.every(p=>p.mappingStatus==='unmapped'&&!p.notes)).toBe(true);
  await slots.getByRole('button',{name:'Edit SMB port 8',exact:true}).click();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Remove port 8',exact:true}).click();
  await slots.getByRole('button',{name:'Add SMB port 8',exact:true}).click();
  expect((await saved(page)).objects.at(-1)!.ports![0]).toEqual(copy.ports![0]);
  await panel(page,'Layers');await page.getByRole('button',{name:'Lock layer Network Outlets',exact:true}).click();
  await panel(page,'Properties');await expect(slots.getByRole('button',{name:'Edit SMB port 8',exact:true})).toBeDisabled();
  await expect(slots.getByRole('button',{name:'Remove port 8',exact:true})).toBeDisabled();
  plan=await saved(page);await page.reload();expect(await saved(page)).toEqual(plan);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();
  const backup=await readFile((await(await download).path())!);
  page.once('dialog',d=>d.accept());await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'smb.json',mimeType:'application/json',buffer:backup});
  await expect.poll(()=>saved(page)).toEqual(plan);await expect(page.getByRole('alert')).toHaveCount(0);
});


test('SMB Ports shows live rack VLAN and patch status on desktop and mobile',async({page})=>{
  const project=defaultProject(defaultConfiguration(),'metric'),frame=project.locations[0];
  frame.portPrefix='B';
  frame.layout={racks:[{id:'R1',label:'Rack A',heightU:12,positionM:0,equipment:[
    {id:'P1',label:'Panel 1',kind:'patch-panel',bottomU:4,heightU:1,portCount:3},
    {id:'SW1',label:'Switch 1',kind:'switch',bottomU:2,heightU:1,portCount:4},
  ]}],cables:[1,2].map(port=>({id:`CBL-000${port}`,from:{rackId:'R1',equipmentId:'P1',port},to:{rackId:'R1',equipmentId:'SW1',port},vlan:30,jacket:'#159de7'})),portVlans:{'R1/SW1/1':10}};
  await page.addInitScript(project=>{if(!localStorage.getItem('porttracker.project'))localStorage.setItem('porttracker.project',JSON.stringify(project));},project);
  await start(page);await tool(page,'SMB');await clickPoint(page,200,200);
  const setup=page.getByRole('dialog',{name:'Set up SMB',exact:true});
  await setup.getByRole('combobox',{name:'IDF / MDF prefix',exact:true}).selectOption(frame.id);
  await setup.getByLabel('First port',{exact:true}).fill('1');await setup.getByLabel('Last port',{exact:true}).fill('4');
  await setup.getByRole('button',{name:'Place SMB',exact:true}).click();
  const smb=(await saved(page)).objects.at(-1)!;
  const table=page.getByRole('table',{name:'SMB ports',exact:true}),rows=table.locator('tbody tr');
  await expect(rows.nth(0).locator('td')).toHaveText(['B001','10','Patched']);
  await expect(rows.nth(1).locator('td')).toHaveText(['B002','—','Patched']);
  await expect(rows.nth(2).locator('td')).toHaveText(['B003','—','Unpatched']);
  await expect(rows.nth(3).locator('td')).toHaveText(['B004','—','Not linked']);
  await expect(rows.nth(4).locator('td')).toHaveText(['+ Add port','—','—']);
  // Mapping status is separate; termination details are read from the rack.
  await page.getByRole('combobox',{name:'Mapping status',exact:true}).selectOption('verified');
  await page.locator('.floor-termination > summary').click();
  const details=page.locator('.floor-port-rack-details');
  await expect(details.locator('dd')).toHaveText(['Rack A','Panel 1','B001','Switch 1','1','10 — Management']);
  await expect(page.getByRole('combobox',{name:'VLAN',exact:true})).toHaveCount(0);
  await expect(rows.nth(0).locator('td')).toHaveText(['B001','10','Patched']);
  await saved(page);await page.goto('/#/cabinets');
  await page.getByRole('tab',{name:'Ports',exact:true}).click();
  await page.locator('[data-port="R1/SW1/1"]').press('Enter');
  await page.getByRole('combobox',{name:'Port VLAN',exact:true}).selectOption('20');
  await page.goto('/#/facility');await saved(page);
  await page.locator(`[data-object-id="${smb.id}"]`).press('Enter');
  await expect(rows.nth(0).locator('td')).toHaveText(['B001','20','Patched']);
  await page.locator('.floor-termination > summary').click();
  await expect(details.locator('dd').last()).toHaveText('20 — Workstations');
  await page.goto('/#/cabinets');
  await page.getByRole('button',{name:'Select cable CBL-0001',exact:true}).press('Enter');
  await page.getByRole('button',{name:'Edit connection',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Remove',exact:true}).click();
  await page.goto('/#/facility');await saved(page);
  await page.locator(`[data-object-id="${smb.id}"]`).press('Enter');
  await expect(rows.nth(0).locator('td')).toHaveText(['B001','—','Unpatched']);
  await page.locator('.floor-termination > summary').click();
  await expect(details.locator('dd')).toHaveText(['Rack A','Panel 1','B001','Unpatched','—','Unassigned']);
  await page.reload();await saved(page);
  await page.locator(`[data-object-id="${smb.id}"]`).press('Enter');
  await expect(rows.nth(0).locator('td')).toHaveText(['B001','—','Unpatched']);
  await page.setViewportSize({width:390,height:844});await panel(page,'Properties');
  await expect(rows.nth(1).locator('td')).toHaveText(['B002','—','Patched']);
  await table.scrollIntoViewIfNeeded();
  expect(await table.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const before=(await saved(page)).objects.find(o=>o.id===smb.id)!;
  const rackBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations[0].layout);
  page.once('dialog',dialog=>dialog.dismiss());
  await table.getByRole('button',{name:'Remove port 2',exact:true}).click();
  expect((await saved(page)).objects.find(o=>o.id===smb.id)!.ports).toEqual(before.ports);
  page.once('dialog',dialog=>dialog.accept());
  await table.getByRole('button',{name:'Remove port 2',exact:true}).click();
  const remaining=before.ports!.filter((_,i)=>i!==1);
  expect((await saved(page)).objects.find(o=>o.id===smb.id)!.ports).toEqual(remaining);
  await expect(rows.nth(1).getByRole('button',{name:'Edit SMB port 2',exact:true})).toHaveText('B003');
  await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();
  expect((await saved(page)).objects.find(o=>o.id===smb.id)!.ports).toEqual(before.ports);
  await page.getByRole('button',{name:'Redo floor edit',exact:true}).click();
  expect((await saved(page)).objects.find(o=>o.id===smb.id)!.ports).toEqual(remaining);
  // Removing the selected port selects its next neighbor; remaining port data stays intact.
  page.once('dialog',dialog=>dialog.accept());
  await table.getByRole('button',{name:'Remove port 1',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Port label',exact:true})).toHaveValue('B003');
  page.once('dialog',dialog=>dialog.accept());
  await table.getByRole('button',{name:'Remove port 2',exact:true}).click();
  await expect(table.getByRole('button',{name:'Remove port 1',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations[0].layout)).toEqual(rackBefore);
  await saved(page);await page.reload();await saved(page);
  await page.locator(`[data-object-id="${smb.id}"]`).press('Enter');await panel(page,'Properties');
  expect((await saved(page)).objects.find(o=>o.id===smb.id)!.ports).toEqual([before.ports![2]]);
});

test('SMB termination resolves ambiguous panel links and displays live equipment and interface names',async({page})=>{
  const project=defaultProject(defaultConfiguration(),'metric'),frame=project.locations[0];frame.portPrefix='B';
  project.templates=stackProject().templates;
  frame.layout={racks:[
    {id:'R1',label:'Rack A',heightU:12,positionM:0,equipment:[{id:'P1',label:'Panel A',kind:'patch-panel',bottomU:4,heightU:1,portCount:2,firstNumber:225}]},
    {id:'R2',label:'Rack B',heightU:12,positionM:1,equipment:[{id:'P2',label:'Panel B',kind:'patch-panel',bottomU:4,heightU:1,portCount:2,firstNumber:225},{id:'SW1',label:'Core switch',kind:'switch',bottomU:2,heightU:1,portCount:48,portStart:0,templateId:project.templates![0].id}]},
  ],cables:[{id:'CBL-0001',from:{rackId:'R2',equipmentId:'SW1',port:0},to:{rackId:'R2',equipmentId:'P2',port:1},vlan:30,jacket:'#159de7'}],portVlans:{'R2/SW1/0':60}};
  await page.addInitScript(project=>{if(!localStorage.getItem('porttracker.project'))localStorage.setItem('porttracker.project',JSON.stringify(project));},project);
  await start(page);await tool(page,'SMB');await clickPoint(page,200,200);
  const setup=page.getByRole('dialog',{name:'Set up SMB',exact:true});
  await setup.getByRole('combobox',{name:'IDF / MDF prefix',exact:true}).selectOption(frame.id);
  await setup.getByLabel('First port',{exact:true}).fill('225');await setup.getByLabel('Last port',{exact:true}).fill('225');
  await setup.getByRole('button',{name:'Place SMB',exact:true}).click();
  const smb=(await saved(page)).objects.at(-1)!;
  const table=page.getByRole('table',{name:'SMB ports',exact:true});
  await expect(table.locator('tbody tr').first()).toContainText('Not linked');
  await page.locator('.floor-termination > summary').click();
  const picker=page.getByRole('combobox',{name:'Linked patch-panel port',exact:true});
  await expect(picker).toHaveValue('__unresolved');
  await picker.selectOption(`${frame.id}/R2/P2/1`);
  const details=page.locator('.floor-port-rack-details');
  await expect(details.locator('dd')).toHaveText(['Rack B','Panel B','B225','Core switch','ge-0/0/0','60 — Printers']);
  await expect(page.getByRole('textbox',{name:'Port label',exact:true})).toHaveValue('B225');
  await expect(table.locator('tbody tr').first()).toContainText('Patched');
  expect((await saved(page)).objects.find(o=>o.id===smb.id)!.ports![0]).toMatchObject({rackId:'R2',patchPanelId:'P2',patchPanelPort:1});
  await page.reload();await saved(page);await page.locator(`[data-object-id="${smb.id}"]`).press('Enter');
  await page.locator('.floor-termination > summary').click();
  await expect(details.locator('dd')).toHaveText(['Rack B','Panel B','B225','Core switch','ge-0/0/0','60 — Printers']);
  await page.locator('.floor-port-link-editor > summary').click();
  await picker.selectOption(`${frame.id}/R1/P1/2`);
  await expect(details.locator('dd')).toHaveText(['Rack A','Panel A','B226','Unpatched','—','Unassigned']);
  await expect(page.getByRole('textbox',{name:'Port label',exact:true})).toHaveValue('B226');
  await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();
  await expect(details.locator('dd')).toHaveText(['Rack B','Panel B','B225','Core switch','ge-0/0/0','60 — Printers']);
});

test('SMB Ports lists eight table rows and adds ports on desktop and mobile',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  await tool(page,'SMB');await placeSmbLater(page,200,200);
  const ports=page.getByRole('region',{name:'Ports',exact:true});
  const slots=ports.locator('.floor-smb-port-table');
  await expect(page.getByRole('region',{name:'SMB ports',exact:true})).toHaveCount(0);
  await expect(slots.getByRole('button',{name:'Add SMB port 3',exact:true})).toBeDisabled();
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport);await panel(page,'Properties');
    const target=viewport.width===390?8:4;
    let object=(await saved(page)).objects.at(-1)!;
    for(let n=object.ports!.length+1;n<=target;n++)await slots.getByRole('button',{name:`Add SMB port ${n}`,exact:true}).click();
    object=(await saved(page)).objects.at(-1)!;
    expect(object.ports).toHaveLength(target);
    await expect(slots.locator('tbody tr')).toHaveCount(8);
    await expect(slots.getByRole('columnheader')).toHaveText(['Port','Label','VLAN','Patch status']);
    await slots.scrollIntoViewIfNeeded();
    for(let n=1;n<=target;n++)await expect(slots.getByRole('button',{name:`Edit SMB port ${n}`,exact:true})).toContainText(object.ports![n-1].label);
    await slots.getByRole('button',{name:`Edit SMB port ${target}`,exact:true}).click();
    await expect(ports.getByRole('heading',{name:`Port ${target} settings`,exact:true})).toBeVisible();
    await field(page,'Port notes',`Jack ${target}`);
    expect((await saved(page)).objects.at(-1)!.ports![target-1].notes).toBe(`Jack ${target}`);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});


test('two-finger scrolling pans both axes while touchpad pinch keeps zoom anchored to the pointer',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  const before=await saved(page),canvas=page.locator('.floor-canvas'),drawing=page.locator('.floor-canvas>g');
  const view=()=>drawing.evaluate(g=>{const m=(g as SVGGElement).transform.baseVal.consolidate()!.matrix;return {x:m.e,y:m.f,scale:m.a};});
  const bounds=(await canvas.boundingBox())!,pointer={x:Math.round(bounds.x+bounds.width*.6)-bounds.x,y:Math.round(bounds.y+bounds.height*.4)-bounds.y};
  await page.mouse.move(bounds.x+pointer.x,bounds.y+pointer.y);
  const initial=await view(),scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));
  await page.mouse.wheel(65,40);
  await expect.poll(async()=>(await view()).x).toBeCloseTo(initial.x-65,3);
  let panned=await view();expect(panned.y).toBeCloseTo(initial.y-40,3);expect(panned.scale).toBe(initial.scale);
  await page.mouse.wheel(-25,-70);
  await expect.poll(async()=>(await view()).y).toBeCloseTo(initial.y+30,3);
  panned=await view();expect(panned.x).toBeCloseTo(initial.x-40,3);expect(panned.scale).toBe(initial.scale);
  const anchor={x:(pointer.x-panned.x)/panned.scale,y:(pointer.y-panned.y)/panned.scale};
  await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');
  await expect.poll(async()=>(await view()).scale).toBeGreaterThan(panned.scale);
  const enlarged=await view();
  expect((pointer.x-enlarged.x)/enlarged.scale).toBeCloseTo(anchor.x,2);
  expect((pointer.y-enlarged.y)/enlarged.scale).toBeCloseTo(anchor.y,2);
  await page.keyboard.down('Control');await page.mouse.wheel(0,120);await page.keyboard.up('Control');
  await expect.poll(async()=>(await view()).scale).toBeCloseTo(panned.scale,5);
  expect(await page.evaluate(()=>({x:scrollX,y:scrollY}))).toEqual(scroll);
  expect(await saved(page)).toEqual(before);
});


test('drawing tools remember independent symbol widths and path weights with proportional endpoint dots',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  const initial=await saved(page);
  await tool(page,'SMB');await field(page,'Symbol width (plan units)','5');
  await tool(page,'Camera');await field(page,'Symbol width (plan units)','12');
  await tool(page,'SMB');await expect(page.getByRole('spinbutton',{name:'Symbol width (plan units)',exact:true})).toHaveValue('5');
  await placeSmbLater(page,200,200);const smb=(await saved(page)).objects.at(-1)!;expect(smb.symbolWidth).toBe(5);
  await tool(page,'SMB');await field(page,'Symbol width (plan units)','9');
  expect((await saved(page)).objects.find(o=>o.id===smb.id)!.symbolWidth).toBe(5);
  await tool(page,'Cable path');await field(page,'Line weight (plan units)','3');
  await tool(page,'Cable tray');await field(page,'Line weight (plan units)','6');
  await tool(page,'Conduit');await field(page,'Line weight (plan units)','1');
  await tool(page,'Cable path');await expect(page.getByRole('spinbutton',{name:'Line weight (plan units)',exact:true})).toHaveValue('3');
  await clickPoint(page,100,290);await clickPoint(page,250,290);
  await expect(page.locator('.floor-route-draft>polyline')).toHaveAttribute('stroke-width','3');
  await expect(page.locator('.floor-route-draft>circle').first()).toHaveAttribute('r','6');
  await page.getByRole('button',{name:'Finish path',exact:true}).click();
  const route=(await saved(page)).objects.at(-1)!,shape=page.locator(`[data-object-id="${route.id}"]`);
  expect(route.lineWeight).toBe(3);
  await expect(shape.locator('.floor-route-line')).toHaveAttribute('stroke-width','3');
  await expect(shape.locator('.floor-route-endpoint').first()).toHaveAttribute('r','6');
  await expect(shape.locator('.floor-route-vertex').first()).toHaveAttribute('r','6');
  await field(page,'Item line weight (plan units)','5');
  await expect(shape.locator('.floor-route-endpoint').first()).toHaveAttribute('r','10');
  await page.getByRole('button',{name:'Undo floor edit'}).click();
  await expect(shape.locator('.floor-route-line')).toHaveAttribute('stroke-width','3');
  await tool(page,'Cable path');await field(page,'Line weight (plan units)','7');
  await expect(shape.locator('.floor-route-line')).toHaveAttribute('stroke-width','3');
  const final=await saved(page);expect(final.objects.slice(0,initial.objects.length)).toEqual(initial.objects);
  await page.reload();expect(await saved(page)).toEqual(final);
  for(const [name,label,value] of [['SMB','Symbol width (plan units)','9'],['Camera','Symbol width (plan units)','12'],['Cable path','Line weight (plan units)','7'],['Cable tray','Line weight (plan units)','6'],['Conduit','Line weight (plan units)','1']]){
    await tool(page,name);await expect(page.getByRole('spinbutton',{name:label,exact:true})).toHaveValue(value);
  }
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();
  const backup=await readFile((await(await download).path())!);
  page.once('dialog',d=>d.accept());await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'tool-sizes.json',mimeType:'application/json',buffer:backup});
  await expect.poll(()=>saved(page)).toEqual(final);await expect(page.getByRole('alert')).toHaveCount(0);
});


for(const [name,kind,finish] of [['Cable path','cable','enter'],['Cable tray','tray','button'],['Conduit','conduit','enter']] as const)test(`${name} accepts diagonals and keeps adding segments until explicitly finished`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  const before=await saved(page);await tool(page,name);
  await clickPoint(page,100,290);
  const second=await point(page,200,340);await page.mouse.dblclick(second.x,second.y);
  await expect(page.locator('.floor-route-draft>circle')).toHaveCount(2);
  expect((await saved(page)).objects).toEqual(before.objects);
  await clickPoint(page,300,300);
  const hover=await point(page,340,330);await page.mouse.move(hover.x,hover.y);
  const preview=page.locator('.floor-route-next-segment');
  await expect(preview).toHaveAttribute('x1','300');await expect(preview).toHaveAttribute('y1','300');
  await expect(preview).toHaveAttribute('x2','340');await expect(preview).toHaveAttribute('y2','330');
  await clickPoint(page,400,360);
  await expect(page.locator('.floor-route-draft>circle')).toHaveCount(4);
  expect((await saved(page)).objects).toEqual(before.objects);
  if(finish==='enter')await page.keyboard.press('Enter');else await page.getByRole('button',{name:'Finish path',exact:true}).click();
  await expect(page.locator('.floor-route-draft')).toHaveCount(0);
  const plan=await saved(page),route=plan.objects.at(-1)!;
  expect(plan.objects).toHaveLength(before.objects.length+1);expect(route.kind).toBe(kind);
  expect(route.points).toEqual([{x:100,y:290},{x:200,y:340},{x:300,y:300},{x:400,y:360}]);
  await drag(page,route.points![1],{x:230,y:370});
  const edited=(await saved(page)).objects.at(-1)!;
  expect(edited.points).toEqual([{x:100,y:290},{x:230,y:370},{x:300,y:300},{x:400,y:360}]);
  const savedPlan=await saved(page);await page.reload();expect(await saved(page)).toEqual(savedPlan);
  await tool(page,name);await clickPoint(page,100,100);await clickPoint(page,150,160);await page.keyboard.press('Escape');
  await expect(page.locator('.floor-route-draft')).toHaveCount(0);expect(await saved(page)).toEqual(savedPlan);
});


for(const name of ['Cable path','Cable tray','Conduit'])test(`${name} shows live calibrated segment length while drawing`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  const readout=page.getByRole('status',{name:'Current segment length',exact:true});
  await tool(page,name);await clickPoint(page,100,290);
  let p=await point(page,130,330);await page.mouse.move(p.x,p.y);
  await expect(readout).toHaveCount(0);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Calibrate scale',exact:true}).click();
  await clickPoint(page,100,100);await clickPoint(page,200,100);
  await field(page,'Known distance','10');await page.getByLabel('Calibration units').selectOption('ft');
  await page.getByRole('button',{name:'Apply scale',exact:true}).click();
  await tool(page,name);await clickPoint(page,100,290);
  p=await point(page,130,330);await page.mouse.move(p.x,p.y);
  await expect(readout).toHaveText('5.0 ft');
  await page.getByRole('button',{name:'Zoom floor in',exact:true}).click();
  p=await point(page,130,330);await page.mouse.move(p.x,p.y);await expect(readout).toHaveText('5.0 ft');
  await clickPoint(page,130,330);
  p=await point(page,190,410);await page.mouse.move(p.x,p.y);await expect(readout).toHaveText('10.0 ft');
  await page.getByRole('combobox',{name:'Floor length units',exact:true}).selectOption('m');
  await expect(readout).toHaveText('3.0 m');
  await clickPoint(page,190,410);await expect(readout).toHaveText('0.0 m');
  await page.keyboard.press('Enter');await expect(readout).toHaveCount(0);
  await expect(page.locator('.floor-measure-result')).toContainText('4.6 m');
  await tool(page,name);await clickPoint(page,100,290);p=await point(page,130,330);await page.mouse.move(p.x,p.y);
  await expect(readout).toHaveText('1.5 m');await page.keyboard.press('Escape');await expect(readout).toHaveCount(0);
});


test('frame port prefixes update facility labels, map tooltips and search while preserving port identities',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  async function prefix(value:string){
    await page.getByRole('link',{name:'Distribution Frames',exact:true}).click();
    await page.getByRole('button',{name:'Edit IDF-01',exact:true}).click();
    await page.getByRole('textbox',{name:'Port prefix',exact:true}).fill(value);
    await page.getByRole('button',{name:'Save distribution frame',exact:true}).click();
  }
  await prefix('B');
  await expect(page.getByRole('article',{name:'IDF-01 distribution frame',exact:true})).toContainText('Port prefix: B');
  await page.getByRole('link',{name:'Facility',exact:true}).click();await saved(page);
  await tool(page,'SMB');await placeSmbLater(page,200,200);
  await page.locator('.floor-termination summary').click();
  await page.getByRole('combobox',{name:'IDF / distribution frame',exact:true}).selectOption('idf-01');
  await field(page,'Patch panel port','225');
  await expect(page.getByRole('textbox',{name:'Port label',exact:true})).toHaveValue('B225');
  await expect(page.getByRole('button',{name:'Edit SMB port 1',exact:true})).toContainText('B225');
  const before=await saved(page),smb=before.objects.at(-1)!;
  await expect(page.locator(`[data-object-id="${smb.id}"]>title`)).toContainText('B225');
  await page.getByRole('button',{name:/^Network ports/}).click();
  await page.getByRole('searchbox',{name:'Search floor ports',exact:true}).fill('B225');
  await expect(page.locator('.floor-table-scroll tbody tr')).toHaveCount(1);
  await expect(page.locator('.floor-table-scroll')).toContainText('B225');
  await prefix('C');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();
  const backup=JSON.parse(await readFile((await(await download).path())!,'utf8'));
  expect(backup.locations.find((l:{id:string})=>l.id==='idf-01').portPrefix).toBe('C');
  await page.reload();await page.getByRole('button',{name:'Edit IDF-01',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Port prefix',exact:true})).toHaveValue('C');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('link',{name:'Facility',exact:true}).click();expect(await saved(page)).toEqual(before);
  await page.locator(`[data-object-id="${smb.id}"]`).click();
  await expect(page.getByRole('textbox',{name:'Port label',exact:true})).toHaveValue('C225');
  await prefix('');await page.getByRole('link',{name:'Facility',exact:true}).click();await saved(page);
  await page.locator(`[data-object-id="${smb.id}"]`).click();
  await expect(page.getByRole('textbox',{name:'Port label',exact:true})).toHaveValue(smb.ports![0].label);
  expect(await saved(page)).toEqual(before);
});


test('IDF markers choose a configured distribution frame in place of a free-text name',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  await page.getByRole('link',{name:'Distribution Frames',exact:true}).click();
  await page.getByRole('button',{name:'Add distribution frame',exact:true}).click();
  await page.getByRole('textbox',{name:'Distribution frame name',exact:true}).fill('West MDF');
  await page.getByRole('combobox',{name:'Distribution frame type',exact:true}).selectOption('MDF');
  await page.getByRole('button',{name:'Save distribution frame',exact:true}).click();
  const frameId=await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations.find((l:{name:string})=>l.name==='West MDF').id);
  await page.getByRole('link',{name:'Facility',exact:true}).click();const original=await saved(page);
  await page.locator('[data-object-id="idf-01"]').click();
  const select=page.getByRole('combobox',{name:'Distribution frame',exact:true});
  await expect(select).toBeVisible();await expect(page.getByRole('textbox',{name:'Object name',exact:true})).toHaveCount(0);
  await expect(select.locator('option')).toContainText(['Select IDF / MDF','IDF-01 (IDF)','West MDF (MDF)']);
  await select.selectOption(frameId);
  await expect(page.locator('.floor-property-heading h3')).toHaveText('West MDF');
  const equipment=page.getByRole('region',{name:'Equipment properties',exact:true});
  await expect(equipment.getByRole('combobox',{name:'Room / location',exact:true})).toBeVisible();
  await expect(equipment.getByRole('textbox',{name:'Object notes',exact:true})).toBeVisible();
  const appearance=page.locator('.floor-symbol-properties');
  await expect(appearance).not.toHaveAttribute('open','');
  await appearance.locator('summary').click();
  await expect(appearance.getByRole('spinbutton',{name:'Item symbol width (plan units)',exact:true})).toBeVisible();
  const layerProperties=page.locator('.floor-layer-properties');
  await layerProperties.locator('summary').click();
  await expect(layerProperties.getByRole('combobox',{name:'Layer',exact:true})).toBeVisible();
  const labelProperties=page.locator('.floor-label-properties');
  await labelProperties.locator('summary').click();
  await expect(labelProperties.getByRole('spinbutton',{name:'Label X offset',exact:true})).toHaveAttribute('aria-description',/Positive X/);
  await appearance.locator('summary').click();
  await expect(page.locator('[data-object-id="idf-01"] .floor-item-label-text')).toHaveText('West MDF');
  let plan=await saved(page);
  expect(plan.objects.find(o=>o.id==='idf-01')).toEqual({...original.objects.find(o=>o.id==='idf-01'),idfId:frameId,name:'West MDF'});
  expect(plan.objects.filter(o=>o.points)).toEqual(original.objects.filter(o=>o.points));
  await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();await expect(select).toHaveValue('');
  await page.getByRole('button',{name:'Redo floor edit',exact:true}).click();await expect(select).toHaveValue(frameId);
  plan=await saved(page);await page.reload();expect(await saved(page)).toEqual(plan);
  await page.locator('[data-object-id="idf-01"]').click();await expect(select).toHaveValue(frameId);
  await panel(page,'Layers');await page.getByRole('button',{name:'Lock layer IDFs / Racks',exact:true}).click();
  await panel(page,'Properties');await expect(select).toBeDisabled();
  await panel(page,'Layers');await page.getByRole('button',{name:'Unlock layer IDFs / Racks',exact:true}).click();
  await tool(page,'SMB');await placeSmbLater(page,200,200);
  await expect(page.getByRole('textbox',{name:'Object name',exact:true})).toBeVisible();
});


test('items inherit enclosing location boxes with manual overrides, filters and persistent automatic mode',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  await tool(page,'Location box');await drag(page,{x:700,y:80},{x:900,y:280});await field(page,'Object name','COM B');
  const room=(await saved(page)).objects.at(-1)!;
  const roomSelect=page.getByRole('combobox',{name:'Room / location',exact:true});
  const automatic=()=>roomSelect.locator('option:checked');
  await page.locator('[data-object-id="idf-01"]').click();
  await expect(automatic()).toHaveText('COM B');
  await expect(roomSelect.getByRole('option',{name:'COM B',exact:true})).toHaveCount(1);
  await drag(page,{x:785,y:155},{x:950,y:300});await expect(automatic()).toHaveText('Unassigned');
  await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();await expect(automatic()).toHaveText('COM B');
  await roomSelect.selectOption('room-204');await drag(page,{x:785,y:155},{x:950,y:300});await expect(roomSelect).toHaveValue('room-204');
  await roomSelect.selectOption('__auto');await expect(automatic()).toHaveText('Unassigned');
  await page.locator('.floor-placement-properties>summary').click();
  await field(page,'X position','785');await field(page,'Y position','155');await expect(automatic()).toHaveText('COM B');
  await roomSelect.selectOption('');await expect(roomSelect).toHaveValue('');
  await roomSelect.selectOption('__auto');
  await page.locator(`[data-object-id="${room.id}"]`).press('Enter');
  await field(page,'X position','500');
  await page.locator('[data-object-id="idf-01"]').click();await expect(automatic()).toHaveText('Unassigned');
  await page.locator(`[data-object-id="${room.id}"]`).press('Enter');await field(page,'Width (plan units)','400');
  await page.locator('[data-object-id="idf-01"]').click();await expect(automatic()).toHaveText('COM B');
  await tool(page,'SMB');await placeSmbLater(page,800,220);await expect(automatic()).toHaveText('COM B');
  const smb=(await saved(page)).objects.at(-1)!;
  await page.getByRole('button',{name:/^Network ports/}).click();await page.getByRole('searchbox',{name:'Search floor ports',exact:true}).fill(smb.name);
  await expect(page.locator('.floor-table-scroll tbody')).toContainText('COM B');
  await panel(page,'Filters');await page.getByLabel('Filter location').selectOption(room.id);
  await expect(page.locator(`[data-object-id="${smb.id}"]`)).toHaveCount(1);await expect(page.locator('[data-object-id="idf-01"]')).toHaveCount(1);
  const plan=await saved(page);await page.reload();expect(await saved(page)).toEqual(plan);
  await page.locator('[data-object-id="idf-01"]').click();await expect(automatic()).toHaveText('COM B');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();
  const backup=await readFile((await(await download).path())!);
  page.once('dialog',d=>d.accept());await page.getByLabel('Import project or drawing JSON').setInputFiles({name:'locations.json',mimeType:'application/json',buffer:backup});await saved(page);
  await page.locator('[data-object-id="idf-01"]').click();await expect(automatic()).toHaveText('COM B');
});

for(const routeTool of ['Cable path','Cable tray','Conduit'])test(`${routeTool} snaps to side connectors, fills connections, follows equipment and detaches`,async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await start(page);
  await tool(page,routeTool);
  await expect(page.locator('[data-connector-object="idf-01"]')).toHaveCount(4);
  // Connector snap takes precedence over the 10-unit grid (these edges are at 799 and 141).
  await clickPoint(page,800,155);await clickPoint(page,650,240);await clickPoint(page,420,220);
  await expect(page.getByRole('button',{name:'Finish path',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Finish path',exact:true}).click();
  let plan=await saved(page),route=plan.objects.at(-1)!;
  expect(route.sourceId).toBe('idf-01');expect(route.sourceSide).toBe('right');
  expect(route.destinationId).toBe('plate-201');expect(route.destinationSide).toBe('top');
  expect(route.points).toEqual([{x:799,y:155},{x:650,y:240},{x:420,y:221}]);
  await expect(page.getByRole('combobox',{name:'Source (optional)',exact:true})).toHaveValue('idf-01');
  await expect(page.getByRole('combobox',{name:'Destination (optional)',exact:true})).toHaveValue('plate-201');
  await page.locator('[data-object-id="idf-01"]').press('Enter');
  await field(page,'X position','805');await field(page,'Item symbol width (plan units)','40');
  route=(await saved(page)).objects.find(o=>o.id===route.id)!;
  expect(route.points![0]).toEqual({x:825,y:155});expect(route.points![1]).toEqual({x:650,y:240});
  await page.locator(`[data-object-id="${route.id}"]`).press('Enter');
  await drag(page,{x:825,y:155},{x:930,y:250});
  route=(await saved(page)).objects.find(o=>o.id===route.id)!;
  expect(route.sourceId).toBeUndefined();expect(route.sourceSide).toBeUndefined();
  expect(route.points![0]).toEqual({x:930,y:250});
  await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();
  route=(await saved(page)).objects.find(o=>o.id===route.id)!;expect(route.sourceSide).toBe('right');
  await drag(page,{x:825,y:155},{x:785,y:155});
  route=(await saved(page)).objects.find(o=>o.id===route.id)!;
  expect(route.sourceSide).toBe('left');expect(route.points![0]).toEqual({x:785,y:155});
  plan=await saved(page);await page.reload();expect(await saved(page)).toEqual(plan);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();
  const backup=JSON.parse((await readFile((await(await download).path())!)).toString());
  expect(backup.facilityPlan.objects.find((o:{id:string})=>o.id===route.id).sourceSide).toBe('left');
});

async function setupPrefix(page:Page){
  await page.getByRole('link',{name:'Distribution Frames',exact:true}).click();
  await page.getByRole('button',{name:'Edit IDF-01',exact:true}).click();
  await page.getByRole('textbox',{name:'Port prefix',exact:true}).fill('B');
  await page.getByRole('button',{name:'Save distribution frame',exact:true}).click();
  await page.getByRole('link',{name:'Facility',exact:true}).click();await saved(page);
}

test('SMB placement modal configures a prefixed range atomically with undo, reload and export',async({page})=>{
  await start(page);await setupPrefix(page);const before=await saved(page);
  await tool(page,'SMB');await clickPoint(page,200,200);
  const dialog=page.getByRole('dialog',{name:'Set up SMB',exact:true});
  await expect(dialog).toBeVisible();expect(await saved(page)).toEqual(before);
  const prefix=dialog.getByRole('combobox',{name:'IDF / MDF prefix',exact:true});
  await expect(prefix).toBeFocused();await expect(prefix.locator('option')).toContainText(['Select a prefix','B — IDF-01 (IDF)']);
  await prefix.selectOption('idf-01');
  await dialog.getByLabel('First port',{exact:true}).fill('1');await dialog.getByLabel('Last port',{exact:true}).fill('8');
  await expect(dialog.getByRole('status')).toHaveText('8 ports: B001, B002, B003, B004, B005, B006, B007, B008');
  await dialog.getByRole('button',{name:'Place SMB',exact:true}).click();await expect(dialog).toHaveCount(0);
  let plan=await saved(page);const smb=plan.objects.at(-1)!;
  expect(smb.name).toBe('SMB-001');expect(smb.x).toBe(200);expect(smb.y).toBe(200);
  expect(smb.ports!.map(p=>[p.idfId,p.patchPanelPort,p.mappingStatus])).toEqual(Array.from({length:8},(_,i)=>['idf-01',1+i,'unmapped']));
  await expect(page.getByRole('table',{name:'SMB ports',exact:true})).toContainText('B001');
  await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();expect(await saved(page)).toEqual(before);
  await page.getByRole('button',{name:'Redo floor edit',exact:true}).click();expect(await saved(page)).toEqual(plan);
  await page.reload();expect(await saved(page)).toEqual(plan);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export project',exact:true}).click();
  const backup=JSON.parse((await readFile((await(await download).path())!)).toString());
  expect(backup.facilityPlan.objects.at(-1).ports).toEqual(smb.ports);
});

test('SMB setup validates ranges and individual numbers and supports mobile entry',async({page})=>{
  await start(page);await setupPrefix(page);await page.setViewportSize({width:390,height:844});
  await tool(page,'SMB');await clickPoint(page,200,200);
  const dialog=page.getByRole('dialog',{name:'Set up SMB',exact:true});
  await dialog.getByRole('button',{name:'Place SMB',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Select an IDF');
  await dialog.getByRole('combobox',{name:'IDF / MDF prefix',exact:true}).selectOption('idf-01');
  await dialog.getByLabel('First port',{exact:true}).fill('225');await dialog.getByLabel('Last port',{exact:true}).fill('233');
  await dialog.getByRole('button',{name:'Place SMB',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('up to 8 ports');
  await dialog.getByLabel('Last port',{exact:true}).fill('224');await dialog.getByRole('button',{name:'Place SMB',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('greater than or equal');
  await dialog.getByRole('radio',{name:'Individual ports',exact:true}).check();
  await dialog.getByLabel('Port 1 number',{exact:true}).fill('225');await dialog.getByLabel('Port 2 number',{exact:true}).fill('225');
  await dialog.getByRole('button',{name:'Place SMB',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('must be different');
  await dialog.getByLabel('Port 2 number',{exact:true}).fill('231');await dialog.getByLabel('Port 8 number',{exact:true}).fill('280');
  await expect(dialog.getByRole('status')).toHaveText('3 ports: B225, B231, B280');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await dialog.getByRole('button',{name:'Place SMB',exact:true}).click();
  const smb=(await saved(page)).objects.at(-1)!;expect(smb.ports!.map(p=>p.patchPanelPort)).toEqual([225,231,280]);
  expect(smb.ports!.every(p=>p.idfId==='idf-01')).toBe(true);
});

test('SMB setup can be cancelled or deferred when no prefixes exist',async({page})=>{
  await start(page);const before=await saved(page);await tool(page,'SMB');await clickPoint(page,200,200);
  const dialog=page.getByRole('dialog',{name:'Set up SMB',exact:true});
  await expect(dialog).toContainText('Add a port prefix');
  await expect(dialog.getByRole('combobox',{name:'IDF / MDF prefix',exact:true}).locator('option[value="idf-01"]')).toBeDisabled();
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect(await saved(page)).toEqual(before);
  await clickPoint(page,210,210);await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);expect(await saved(page)).toEqual(before);
  await clickPoint(page,220,220);await dialog.getByRole('button',{name:'Configure later',exact:true}).click();
  const smb=(await saved(page)).objects.at(-1)!;
  expect(smb.name).toBe('SMB-001');expect(smb.ports).toHaveLength(1);expect(smb.ports![0].idfId).toBeUndefined();expect(smb.ports![0].patchPanelPort).toBeUndefined();
  await page.getByRole('button',{name:'Add SMB port 2',exact:true}).click();expect((await saved(page)).objects.at(-1)!.ports).toHaveLength(2);
});

for(const mobile of [false,true])test(`${mobile?'mobile':'desktop'} floor search finds ports and rooms and reveals selected items`,async({page})=>{
  await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});await start(page);
  await panel(page,'Layers');
  const search=page.getByRole('region',{name:'Search floor plan',exact:true});
  const input=search.getByRole('searchbox',{name:'Search',exact:true});
  const tabs=page.getByRole('tablist',{name:'Floor plan panels'});
  expect((await search.boundingBox())!.y+(await search.boundingBox())!.height).toBeLessThanOrEqual((await tabs.boundingBox())!.y);
  const drawing=page.locator('.floor-canvas>g'),before=await drawing.getAttribute('transform');
  await input.fill(' a-204-03 ');
  await expect(search.getByRole('status')).toHaveText('1 item found');
  await expect(search).toContainText('A-204-01');
  await expect(drawing).toHaveAttribute('transform',before!);
  await input.press('Enter');
  await expect(page.locator('[data-object-id="plate-204"]')).toHaveClass(/selected/);
  await expect(page.getByRole('tab',{name:'Properties',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(drawing).not.toHaveAttribute('transform',before!);
  await expect(page.getByLabel('Object name',{exact:true})).toHaveValue('A-204-01');
  await input.fill('office 201');
  await expect(search).toContainText('Office 201');await expect(search).toContainText('A-201-01');
  await input.fill('nothing matches this');await expect(search.getByRole('status')).toHaveText('No matching items');
  await input.press('Escape');await expect(input).toHaveValue('');
  await expect(page.locator('[data-object-id="plate-204"]')).toHaveClass(/selected/);
  await panel(page,'Layers');
  await page.getByRole('checkbox',{name:'Show layer Cameras',exact:true}).uncheck();
  await page.getByRole('button',{name:'Lock layer Cameras',exact:true}).click();
  await panel(page,'Filters');await page.getByLabel('Filter type',{exact:true}).selectOption('plate');
  await input.fill('cam-01');await expect(search).toContainText('Hidden');
  await search.getByRole('button',{name:/CAM-01/}).click();
  await expect(page.locator('[data-object-id="cam-01"]')).toHaveClass(/selected/);
  await expect(page.getByLabel('Object name',{exact:true})).toHaveValue('CAM-01');
  const plan=await saved(page);expect(plan.layers.find(l=>l.id==='cameras')).toMatchObject({visible:true,locked:true});
  await search.getByRole('button',{name:'Clear floor search',exact:true}).click();
  await expect(input).toHaveValue('');await expect(search.locator('li')).toHaveCount(0);
  expect(await search.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.locator('.floor-sidebar').screenshot({path:`artifacts/floor-search-${mobile?'mobile':'desktop'}.png`});
});

test('SMB port placement fills rack locations and removes ports from the room unplaced list',async({page})=>{
  const project=defaultProject(defaultConfiguration(),'metric'),frame=project.locations[0];
  frame.portPrefix='B';frame.layout.racks=frame.layout.racks.slice(0,1);frame.layout.cables=[];frame.layout.portVlans={};
  project.configuration.facilityLocations=[{name:'Office 201',color:'#159de7'}];
  frame.layout.portDetails={'CAB-A01/PP-A01/2':{facilityLocation:'Office 201',notes:'Waiting for map placement'}};
  await page.addInitScript(project=>{if(!localStorage.getItem('porttracker.project'))localStorage.setItem('porttracker.project',JSON.stringify(project));},project);
  await start(page);
  await page.locator('[data-object-id="room-201"]').press('Enter');
  const unplaced=page.getByRole('region',{name:'Unplaced objects',exact:true});
  await expect(unplaced).toContainText('B002');await expect(unplaced).toContainText('Waiting for map placement');
  await tool(page,'SMB');await clickPoint(page,350,180);
  const dialog=page.getByRole('dialog',{name:'Set up SMB',exact:true});
  await dialog.getByRole('combobox',{name:'IDF / MDF prefix',exact:true}).selectOption(frame.id);
  await dialog.getByRole('spinbutton',{name:'First port',exact:true}).fill('1');
  await dialog.getByRole('spinbutton',{name:'Last port',exact:true}).fill('2');
  await dialog.getByRole('button',{name:'Place SMB',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations[0].layout.portDetails['CAB-A01/PP-A01/1']?.facilityLocation)).toBe('Office 201');
  await field(page,'X position','400');await field(page,'Y position','450');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations[0].layout.portDetails['CAB-A01/PP-A01/1']?.facilityLocation)).toBe('Office 204');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations[0].layout.portDetails['CAB-A01/PP-A01/2']?.facilityLocation)).toBe('Office 204');
  await page.getByRole('button',{name:'Undo floor edit',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations[0].layout.portDetails['CAB-A01/PP-A01/1']?.facilityLocation)).toBe('Office 201');
  await page.locator('[data-object-id="room-201"]').press('Enter');
  await expect(unplaced).toContainText('No unplaced ports');
  await saved(page);await page.goto('/#/cabinets');
  await page.locator('[data-port="CAB-A01/PP-A01/1"]').press('Enter');
  await expect(page.getByRole('region',{name:'Selected port details',exact:true})).toContainText('Office 201');
  await expect(page.getByLabel('Facility location',{exact:true})).toBeDisabled();
  await expect(page.locator('.patch-port-details')).toContainText('From map: Office 201');
  await page.getByRole('checkbox',{name:'Select multiple ports',exact:true}).check();
  await page.getByRole('button',{name:'Port 2, available',exact:true}).click();
  await page.getByRole('button',{name:'Port 3, available',exact:true}).click();
  await page.getByRole('combobox',{name:'Facility location action',exact:true}).selectOption('replace');
  await page.getByRole('combobox',{name:'New facility location',exact:true}).selectOption('Office 204');
  await page.getByRole('button',{name:'Apply details to 2 ports',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations[0].layout.portDetails['CAB-A01/PP-A01/3']?.facilityLocation)).toBe('Office 204');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations[0].layout.portDetails['CAB-A01/PP-A01/2']?.facilityLocation)).toBe('Office 201');
  await page.evaluate(()=>{
    const project=JSON.parse(localStorage.getItem('porttracker.project')!);
    project.configuration.facilityLocations.push({name:'Shipping',color:'#159de7'});
    project.locations[0].layout.portDetails['CAB-A01/PP-A01/1'].facilityLocation='Shipping';
    localStorage.setItem('porttracker.project',JSON.stringify(project));
  });
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations[0].layout.portDetails['CAB-A01/PP-A01/1']?.facilityLocation)).toBe('Office 201');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!));
  expect(stored.locations[0].layout.portDetails['CAB-A01/PP-A01/2'].notes).toBe('Waiting for map placement');
  await page.goto('/#/facility');await saved(page);
  await page.locator('[data-object-id="room-201"]').press('Enter');await expect(unplaced).toContainText('No unplaced ports');
  const smb=(await saved(page)).objects.find(o=>o.kind==='outlet')!;
  await page.locator(`[data-object-id="${smb.id}"]`).press('Enter');await page.keyboard.press('Delete');
  await page.locator('[data-object-id="room-201"]').press('Enter');await expect(unplaced).toContainText('B001');await expect(unplaced).toContainText('B002');
  await unplaced.scrollIntoViewIfNeeded();
  await unplaced.screenshot({path:'artifacts/location-unplaced-list.png'});
  await page.locator('.floor-sidebar').screenshot({path:'artifacts/location-unplaced-ports.png'});
  await page.setViewportSize({width:390,height:844});await panel(page,'Properties');
  await expect(unplaced).toContainText('B001');await expect(unplaced).toContainText('B002');
  await page.locator('.floor-sidebar').screenshot({path:'artifacts/location-unplaced-ports-mobile.png'});
});
