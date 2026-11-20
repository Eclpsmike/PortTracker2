import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { FloorPlan } from '../src/facility/model';
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
async function drag(page:Page,a:{x:number;y:number},b:{x:number;y:number}){const start=await point(page,a.x,a.y),end=await point(page,b.x,b.y);await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:8});await page.mouse.up();}
async function tool(page:Page,name:string){const tools=page.getByRole('complementary',{name:'Floor drawing tools'});if(!await tools.isVisible())await page.getByRole('button',{name:'Drawing tools',exact:true}).click();await tools.getByRole('button',{name,exact:true}).click();}
async function panel(page:Page,name:'Layers'|'Filters'|'Properties'){const tabs=page.getByRole('tablist',{name:'Floor plan panels'});if(!await tabs.isVisible())await page.getByRole('button',{name:/Layers & properties/}).click();await tabs.getByRole('tab',{name:new RegExp(`^${name}`)}).click();}
async function field(page:Page,name:string,value:string){const input=page.getByLabel(name,{exact:true});await input.fill(value);await input.press('Tab');}
async function start(page:Page){await page.goto('/#/facility');await expect(page.getByRole('application',{name:'Facility floor plan canvas'})).toBeVisible();await saved(page);}

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
  await page.mouse.wheel(0,-120);
  await expect(page.locator('.floor-canvas>g')).not.toHaveAttribute('transform',beforeWheel!);
  expect(await drawingWidth()).toBeCloseTo(normalDrawingWidth,1);
  await page.getByRole('button',{name:'Fit plan',exact:true}).click();
  await page.getByRole('button',{name:'Calibrate scale',exact:true}).click();await clickPoint(page,100,100);await clickPoint(page,300,100);
  await field(page,'Known distance','100');await page.getByLabel('Calibration units').selectOption('ft');await page.getByRole('button',{name:'Apply scale',exact:true}).click();
  expect(await drawingWidth()).toBeCloseTo(normalDrawingWidth,1);
  const calibrated=await saved(page);
  await expect(page.getByRole('spinbutton',{name:'Symbol width (ft)',exact:true})).toHaveValue('14');
  await field(page,'Symbol width (ft)','1');
  await expect.poll(drawingWidth).toBeCloseTo(normalDrawingWidth/14,1);
  await field(page,'Symbol width (ft)','2');
  await expect.poll(drawingWidth).toBeCloseTo(normalDrawingWidth/7,1);
  await page.getByRole('button',{name:'Undo floor edit'}).click();await expect.poll(drawingWidth).toBeCloseTo(normalDrawingWidth/14,1);
  await page.getByRole('combobox',{name:'Floor length units',exact:true}).selectOption('m');
  await expect(page.getByRole('spinbutton',{name:'Symbol width (m)',exact:true})).toHaveValue('0.3048');
  const changed=await saved(page);expect(changed.symbolWidth).toBe(2);expect(changed.objects).toEqual(initial.objects);expect(changed.calibration).toEqual(calibrated.calibration);
  await page.reload();expect(await saved(page)).toEqual(changed);expect(await drawingWidth()).toBeCloseTo(normalDrawingWidth/14,1);
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
  await tool(page,'Outlet');await clickPoint(page,212,410);
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
  await expect(page.getByRole('spinbutton',{name:/^Item symbol width/})).toBeDisabled();await expect(object.locator('[data-symbol-resize]')).toHaveCount(0);
  await panel(page,'Layers');await page.getByRole('button',{name:'Unlock layer Access Points',exact:true}).click();await panel(page,'Properties');
  await page.getByRole('button',{name:'Use default symbol width',exact:true}).click();expect((await saved(page)).objects.find(o=>o.id===original.id)!.symbolWidth).toBeUndefined();
  await page.screenshot({path:'artifacts/facility-selection-sizing.png',fullPage:true});
});

test('room dimensions use calibrated feet and meters without moving their anchor',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  await page.getByRole('button',{name:'Calibrate scale',exact:true}).click();await clickPoint(page,100,100);await clickPoint(page,300,100);
  await field(page,'Known distance','20');await page.getByLabel('Calibration units').selectOption('ft');await page.getByRole('button',{name:'Apply scale',exact:true}).click();
  const before=await saved(page),room=before.objects.find(o=>o.id==='room-201')!;
  await clickPoint(page,room.x+20,room.y+15);await panel(page,'Properties');
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
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export drawing',exact:true}).click();
  const backup=JSON.parse((await readFile((await(await download).path())!)).toString()) as FloorPlan;expect(backup.objects.find(o=>o.id===item.id)).toEqual(updated);
  await page.reload();expect((await saved(page)).objects.find(o=>o.id===item.id)).toEqual(updated);
  await clickPoint(page,item.x,item.y);await panel(page,'Layers');await page.getByRole('button',{name:'Lock layer Access Points',exact:true}).click();await panel(page,'Properties');
  await expect(page.getByRole('spinbutton',{name:'Label font size',exact:true})).toBeDisabled();await expect(page.getByRole('combobox',{name:'Label position',exact:true})).toBeDisabled();
  await panel(page,'Layers');await page.getByRole('button',{name:'Unlock layer Access Points',exact:true}).click();await panel(page,'Properties');
  await page.getByRole('button',{name:'Reset label style',exact:true}).click();await expect(text).toHaveAttribute('font-size','10');
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
  await clickPoint(page,220,490);await panel(page,'Properties');await page.getByRole('combobox',{name:'Layer',exact:true}).selectOption(layer.id);
  await panel(page,'Layers');await field(page,'Layer name','Future Office Expansion');await page.getByRole('checkbox',{name:'Show layer Future Office Expansion'}).uncheck();await expect(page.locator(`[data-object-id="${plate.id}"]`)).toHaveCount(0);
  await page.getByRole('checkbox',{name:'Show layer Future Office Expansion'}).check();await panel(page,'Filters');await page.getByLabel('Filter status').selectOption('unmapped');await expect(page.locator('[data-kind="idf"]')).toHaveCount(0);await page.getByRole('button',{name:'Clear floor filters'}).click();await expect(page.locator('[data-kind="idf"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Save drawing',exact:true}).click();plan=await saved(page);await page.reload();expect(await saved(page)).toEqual(plan);
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export drawing',exact:true}).click();const backup=await readFile((await(await download).path())!);expect(JSON.parse(backup.toString())).toEqual(plan);
  await tool(page,'Outlet');await clickPoint(page,200,200);await saved(page);
  page.once('dialog',d=>d.accept());await page.getByLabel('Import floor plan JSON').setInputFiles({name:'floor.json',mimeType:'application/json',buffer:backup});await expect.poll(()=>saved(page)).toEqual(plan);
  await expect(page.getByRole('alert')).toHaveCount(0);expect(errors).toEqual([]);
});

test('route vertices, scale, history, duplication and locked layers work without changing rack data',async({page})=>{
  await page.setViewportSize({width:1440,height:900});await start(page);
  const rackData=await page.evaluate(()=>localStorage.getItem('porttracker.project'));
  await tool(page,'Cable path');await clickPoint(page,100,290);await clickPoint(page,200,330);await clickPoint(page,300,390);await page.getByRole('button',{name:'Finish path',exact:true}).click();
  let plan=await saved(page);const route=plan.objects.at(-1)!;expect(route.points!.length).toBeGreaterThan(2);expect(route.status).toBe('planned');expect(route.destinationId).toBeUndefined();
  await expect(page.locator('.floor-measure-result')).toContainText('Uncalibrated');
  const vertex=route.points![1];await drag(page,vertex,{x:vertex.x+20,y:vertex.y+10});plan=await saved(page);const points=plan.objects.find(o=>o.id===route.id)!.points!;expect(points).not.toEqual(route.points);expect(points.slice(1).every((p,i)=>p.x===points[i].x||p.y===points[i].y)).toBe(true);
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
  await tool(page,'Outlet');await clickPoint(page,200,200);await panel(page,'Properties');await expect(page.getByRole('textbox',{name:'Object name',exact:true})).toHaveValue(/^PORT-/);
  await page.getByRole('button',{name:'Close floor panels'}).click();const before=await saved(page);
  await page.getByLabel('Import floor plan JSON').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schemaVersion":999}')});await expect(page.getByRole('alert')).toContainText('unsupported');expect((await saved(page)).objects).toEqual(before.objects);
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
