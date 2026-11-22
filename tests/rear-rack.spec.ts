import { test, expect } from '@playwright/test';
import { stackProject } from './stack-fixture';
import { UNIT } from '../src/geometry';

test('new templates can import front and rear images before mapping ports',async({page})=>{
  await page.goto('/#/configuration/templates');await page.getByRole('button',{name:'Import template',exact:true}).click();
  const definition=page.getByRole('region',{name:'Device definition',exact:true}),front=page.getByRole('region',{name:'Front image settings',exact:true}),back=page.getByRole('region',{name:'Rear image settings',exact:true});
  const definitionBox=(await definition.boundingBox())!,frontBox=(await front.boundingBox())!,backBox=(await back.boundingBox())!;
  expect(definitionBox.y+definitionBox.height).toBeLessThan(frontBox.y);
  expect(frontBox.x+frontBox.width).toBeLessThan(backBox.x);expect(frontBox.y).toBe(backBox.y);
  await page.locator('.template-editor').screenshot({path:'artifacts/template-images-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  const mobileFront=(await front.boundingBox())!,mobileRear=(await back.boundingBox())!;
  expect(mobileFront.y+mobileFront.height).toBeLessThan(mobileRear.y);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.template-editor').screenshot({path:'artifacts/template-images-mobile.png'});
  await page.setViewportSize({width:1768,height:800});
  await page.getByLabel('Device definition YAML',{exact:true}).setInputFiles('public/equipment/netbox/24-port-copper-patch-panel.yaml');
  await page.getByLabel('Front equipment image',{exact:true}).setInputFiles('public/equipment/netbox/generic-24-port-copper-patch-panel.front.png');
  await page.getByLabel('Rear equipment image',{exact:true}).setInputFiles('public/equipment/netbox/ubiquiti-unifi-switch-48-gen1.front.png');
  const rear=await page.getByRole('img',{name:'Rear equipment preview',exact:true}).getAttribute('src');
  await page.getByRole('button',{name:'Continue to port mapping',exact:true}).click();
  await expect(page.locator('.template-images-section')).not.toHaveAttribute('open','');
  expect((await page.locator('.template-images-section').boundingBox())!.height).toBeLessThan(60);
  await expect(page.getByRole('img',{name:'Rear equipment preview',exact:true})).not.toBeVisible();
  await page.locator('.template-images-section > summary').click();
  await expect(page.getByRole('img',{name:'Rear equipment preview',exact:true})).toHaveAttribute('src',rear!);
  await page.locator('.template-images-section > summary').click();
  await page.getByText('Start with a regular grid',{exact:true}).click();await page.getByRole('button',{name:'Generate port grid',exact:true}).click();
  await page.getByRole('checkbox',{name:'I checked every socket position and numbered interface against the image.',exact:true}).check();
  await page.getByRole('button',{name:'Save template',exact:true}).click();
  await expect(page.getByRole('region',{name:'Template editor',exact:true})).toHaveCount(0);
  const template=await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).templates[0]);
  expect(template.rearImage.imageSrc).toBe(rear);expect(template.imageSrc).not.toBe(rear);expect(template.ports).toHaveLength(24);
});

test('rear template upload persists, renders, and preserves equipment and front connections',async({page})=>{
  const project=stackProject(),template=project.templates![0];
  project.locations[0].layout={racks:[
    {id:'R1',label:'Rack A',heightU:12,positionM:0,equipment:[{id:'SW1',label:'Core switch',kind:'switch',bottomU:4,heightU:1,portCount:48,portStart:0,templateId:template.id}]},
    {id:'R2',label:'Rack B',heightU:12,positionM:1,equipment:[{id:'P1',label:'Panel',kind:'patch-panel',bottomU:10,heightU:1,portCount:4}]},
  ],cables:[{id:'CBL-0001',from:{rackId:'R1',equipmentId:'SW1',port:0},to:{rackId:'R2',equipmentId:'P1',port:1},vlan:10,jacket:'#159de7'}],portVlans:{'R1/SW1/0':10}};
  await page.addInitScript(project=>{if(!localStorage.getItem('porttracker.project'))localStorage.setItem('porttracker.project',JSON.stringify(project));},project);
  await page.goto('/#/configuration/templates');
  await page.getByRole('button',{name:`Edit template ${template.name}`,exact:true}).click();
  await page.locator('.template-images-section > summary').click();
  await page.getByLabel('Rear equipment image',{exact:true}).setInputFiles('public/equipment/netbox/generic-24-port-copper-patch-panel.front.png');
  await expect(page.getByRole('img',{name:'Rear equipment preview',exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:'I checked every socket position and numbered interface against the image.',exact:true}).check();
  await page.getByRole('button',{name:'Save template',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!));
  expect(saved.locations[0].layout).toEqual(project.locations[0].layout);
  expect(saved.templates[0].ports.map((p:{x:number;y:number})=>[p.x,p.y])).toEqual(template.ports.map(p=>[p.x,p.y]));
  await page.goto('/#/cabinets');
  const faces=page.getByRole('group',{name:'Rack face',exact:true});
  const device=page.locator('[data-equipment="R1/SW1"]');
  await expect(device.locator('image')).toHaveAttribute('href',template.imageSrc);
  const originalPosition=await device.getAttribute('data-bottom-u');
  await faces.getByRole('button',{name:'Rear',exact:true}).click();
  await expect(page.locator('.rack-scene')).toHaveAttribute('data-face','rear');
  await expect(device.locator('.equipment-rear-image')).toHaveAttribute('href',saved.templates[0].rearImage.imageSrc);
  await expect(device).toHaveAttribute('data-bottom-u',originalPosition!);
  await expect(page.locator('[data-equipment="R2/P1"]')).toContainText('No rear image');
  await expect(page.locator('.rack-port,.cable-group')).toHaveCount(0);
  const a=(await device.boundingBox())!,b=(await page.locator('[data-equipment="R2/P1"]').boundingBox())!;expect(b.x).toBeLessThan(a.x);
  await page.getByRole('tab',{name:'Equipment',exact:true}).click();
  const hit=page.locator('[data-equipment-drag="R1/SW1"]');await hit.click();await expect(hit).toHaveAttribute('aria-pressed','true');
  const box=(await hit.boundingBox())!,scale=await page.locator('.rack-scene').evaluate(svg=>svg.getBoundingClientRect().width/(svg as SVGSVGElement).viewBox.baseVal.width);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+UNIT*scale,{steps:8});
  page.once('dialog',dialog=>dialog.accept());await page.mouse.up();await expect(device).toHaveAttribute('data-bottom-u','3');
  await page.reload();await expect(faces.getByRole('button',{name:'Rear',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(device.locator('.equipment-rear-image')).toHaveAttribute('href',saved.templates[0].rearImage.imageSrc);
  await faces.getByRole('button',{name:'Front',exact:true}).click();
  await expect(device.locator('image')).toHaveAttribute('href',template.imageSrc);await expect(page.locator('.cable-group')).toHaveCount(1);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations[0].layout.cables)).toEqual(project.locations[0].layout.cables);
  await page.goto('/#/configuration/templates');await page.getByRole('button',{name:`Edit template ${template.name}`,exact:true}).click();
  await page.locator('.template-images-section > summary').click();
  await expect(page.getByRole('img',{name:'Rear equipment preview',exact:true})).toHaveAttribute('src',saved.templates[0].rearImage.imageSrc);
  await page.getByLabel('Rear equipment image',{exact:true}).setInputFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
  await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('img',{name:'Rear equipment preview',exact:true})).toHaveAttribute('src',saved.templates[0].rearImage.imageSrc);
  await page.getByRole('button',{name:'Remove rear image',exact:true}).click();
  await page.getByRole('checkbox',{name:'I checked every socket position and numbered interface against the image.',exact:true}).check();
  await page.getByRole('button',{name:'Save template',exact:true}).click();
  await page.goto('/#/cabinets');await faces.getByRole('button',{name:'Rear',exact:true}).click();await expect(device).toContainText('No rear image');
  await page.setViewportSize({width:390,height:844});await expect(faces).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('maps individual and grouped rear ports, preserves connections, and selects only the visible face',async({page})=>{
  const project=stackProject(),template=project.templates![0];
  project.locations[0].layout={racks:[{id:'R1',label:'Rack A',heightU:12,positionM:0,equipment:[
    {id:'SW1',label:'Core switch',kind:'switch',bottomU:8,heightU:1,portCount:48,portStart:0,templateId:template.id},
    {id:'P1',label:'Panel',kind:'patch-panel',bottomU:10,heightU:1,portCount:4},
  ]}],cables:[
    {id:'CBL-0001',from:{rackId:'R1',equipmentId:'SW1',port:0},to:{rackId:'R1',equipmentId:'P1',port:1},vlan:10,jacket:'#159de7'},
    {id:'CBL-0002',from:{rackId:'R1',equipmentId:'SW1',port:2},to:{rackId:'R1',equipmentId:'SW1',port:3},vlan:null,jacket:'#159de7'},
  ],portVlans:{'R1/SW1/0':10}};
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(project=>{if(!localStorage.getItem('porttracker.project'))localStorage.setItem('porttracker.project',JSON.stringify(project));},project);
  await page.goto('/#/configuration/templates');await page.getByRole('button',{name:`Edit template ${template.name}`,exact:true}).click();
  await expect(page.getByLabel('Port face',{exact:true}).locator('option[value="rear"]')).toBeDisabled();
  await page.locator('.template-images-section > summary').click();
  await page.getByLabel('Rear equipment image',{exact:true}).setInputFiles('public/equipment/netbox/generic-24-port-copper-patch-panel.front.png');
  await page.locator('.template-images-section > summary').click();
  await page.getByLabel('Advance after placing a port',{exact:true}).uncheck();
  await page.getByLabel('Port face',{exact:true}).selectOption('rear');
  await expect(page.locator('[data-map-index]')).toHaveCount(0);
  const mapping=page.locator('.template-map');await mapping.scrollIntoViewIfNeeded();
  const bounds=(await mapping.boundingBox())!;await mapping.click({position:{x:bounds.width*.2,y:bounds.height*.5}});
  await expect(page.locator('[data-map-index]')).toHaveCount(1);
  await page.getByText('Start with a regular grid',{exact:true}).click();
  await page.getByRole('button',{name:'Clear grid selection',exact:true}).click();
  await page.getByLabel('First port in range',{exact:true}).selectOption('2');await page.getByLabel('Last port in range',{exact:true}).selectOption('3');
  await page.getByRole('button',{name:'Select port range',exact:true}).click();
  await page.getByLabel('Grid columns',{exact:true}).fill('2');
  await page.getByLabel('First column center (%)',{exact:true}).fill('70');await page.getByLabel('Last column center (%)',{exact:true}).fill('85');
  await page.getByLabel('First row center (%)',{exact:true}).fill('50');await page.getByLabel('Last row center (%)',{exact:true}).fill('50');
  await page.getByRole('button',{name:'Generate port grid',exact:true}).click();
  await expect(page.locator('[data-map-index]')).toHaveCount(3);
  await page.locator('.template-mapping-preview').screenshot({path:'artifacts/rear-port-mapping.png'});
  await page.getByRole('group',{name:'Mapping face',exact:true}).getByRole('button',{name:'Front',exact:true}).click();
  await expect(page.locator('[data-map-index]')).toHaveCount(45);
  await page.locator('.template-images-section > summary').click();await page.getByRole('button',{name:'Remove rear image',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Move all rear ports to Front');
  await expect(page.getByRole('img',{name:'Rear equipment preview',exact:true})).toBeVisible();
  await page.getByRole('checkbox',{name:'I checked every socket position and numbered interface against the image.',exact:true}).check();
  await page.getByRole('button',{name:'Save template',exact:true}).click();
  await expect(page.getByRole('region',{name:'Template editor',exact:true})).toHaveCount(0);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!));
  expect(saved.locations[0].layout).toEqual(project.locations[0].layout);
  expect(saved.templates[0].ports.filter((p:{face?:string})=>p.face==='rear')).toHaveLength(3);
  expect(saved.templates[0].ports[1]).toEqual({...template.ports[1],media:{kind:'copper'},interfaceType:'mapped'});
  await page.goto('/#/cabinets');await page.getByRole('tab',{name:'Ports',exact:true}).click();
  const faces=page.getByRole('group',{name:'Rack face',exact:true}),device=page.locator('[data-equipment="R1/SW1"]');
  await expect(device.locator('.rack-port')).toHaveCount(45);await expect(page.locator('.cable-group')).toHaveCount(1);
  await expect(page.locator('.cable-face-continuation')).toContainText('To Rear');
  await faces.getByRole('button',{name:'Rear',exact:true}).click();
  await expect(device.locator('.rack-port')).toHaveCount(3);await expect(page.locator('.cable-group')).toHaveCount(2);
  await expect(page.locator('.cable-face-continuation')).toContainText('To Front');
  await page.locator('.rack-scene').screenshot({path:'artifacts/rear-ports-rack.png'});
  await page.locator('[data-port="R1/SW1/0"]').click({timeout:5000});
  await expect(page.locator('.rack-scene')).toHaveAttribute('data-face','rear');
  await expect(page.locator('[data-port="R1/SW1/0"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-port="R1/SW1/0"]')).toHaveAttribute('data-vlan','10');
  // Marquee across the entire rear device must not select its hidden front ports.
  const box=(await device.boundingBox())!;
  await page.mouse.move(box.x-1,box.y-1);await page.mouse.down();await page.mouse.move(box.x+box.width+1,box.y+box.height+1,{steps:8});await page.mouse.up();
  await expect(page.getByText('3 selected ports',{exact:true})).toBeVisible();
  const cablePoint=await page.getByRole('button',{name:'Select cable CBL-0001',exact:true}).evaluate(element=>{
    const path=element as SVGPathElement, point=path.getPointAtLength(path.getTotalLength()*.4).matrixTransform(path.getScreenCTM()!);return {x:point.x,y:point.y};
  });
  await page.mouse.click(cablePoint.x,cablePoint.y);
  await expect(page.getByRole('tab',{name:'Connections',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.rack-scene')).toHaveAttribute('data-face','rear');
  await page.reload();await expect(page.locator('.rack-scene')).toHaveAttribute('data-face','rear');await expect(device.locator('.rack-port')).toHaveCount(3);
  await page.goto('/#/configuration/templates');await page.getByRole('button',{name:`Edit template ${template.name}`,exact:true}).click();
  await page.getByLabel('Mapped port',{exact:true}).selectOption('2');await expect(page.getByLabel('Port face',{exact:true})).toHaveValue('rear');await expect(page.locator('[data-map-index]')).toHaveCount(3);
  expect(errors).toEqual([]);
});
