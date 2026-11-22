import { test, expect } from '@playwright/test';
import { stackProject } from './stack-fixture';

for(const mobile of [false,true])test(`${mobile?'mobile':'desktop'} adds console and Ethernet ports to a used template and preserves connections`,async({page})=>{
  if(mobile)await page.setViewportSize({width:390,height:844});
  const project=stackProject(),template=project.templates![0];
  template.rearImage={imageSrc:template.imageSrc,imageWidth:824,imageHeight:77};
  project.locations[0].layout={racks:[{id:'R1',label:'Rack',heightU:12,positionM:0,equipment:[{id:'SW1',label:'Switch',kind:'switch',bottomU:5,heightU:1,portCount:48,portStart:0,templateId:template.id}]}],cables:[{id:'CBL-0001',from:{rackId:'R1',equipmentId:'SW1',port:0},to:{rackId:'R1',equipmentId:'SW1',port:1},vlan:10,jacket:'#147de3'}],portVlans:{'R1/SW1/0':10},portDetails:{'R1/SW1/0':{facilityLocation:'',notes:'Existing notes'}}};
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(project=>{if(!localStorage.getItem('porttracker.project'))localStorage.setItem('porttracker.project',JSON.stringify(project));},project);
  async function edit(){await page.goto('/#/configuration/templates');await page.getByRole('button',{name:`Edit template ${template.name}`,exact:true}).click();}
  async function save(){await page.getByRole('checkbox',{name:'I checked every socket position and numbered interface against the image.',exact:true}).check();await page.getByRole('button',{name:'Save template',exact:true}).click();await expect(page.getByRole('region',{name:'Template editor',exact:true})).toHaveCount(0);}
  async function place(x:number){
    const map=page.locator('.template-map');await map.scrollIntoViewIfNeeded();
    await map.evaluate((svg,x)=>{const stage=svg.parentElement!;stage.scrollLeft=svg.getBoundingClientRect().width*x-stage.clientWidth/2;},x);
    const box=(await map.boundingBox())!;await page.mouse.click(box.x+box.width*x,box.y+box.height*.5);
  }
  await edit();await page.getByRole('button',{name:'Add port',exact:true}).click();
  const form=page.getByRole('form',{name:'Add port',exact:true});
  await form.getByLabel('New port label',{exact:true}).fill('ge-0/0/0');await form.getByRole('button',{name:'Add port to template',exact:true}).click();await expect(form.getByRole('alert')).toContainText('already exists');
  await form.getByLabel('New port label',{exact:true}).fill('Console');await form.getByRole('combobox',{name:'Port function',exact:true}).selectOption('console');
  await form.getByRole('combobox',{name:'Console connector',exact:true}).selectOption('RJ45');await form.getByRole('combobox',{name:'New port face',exact:true}).selectOption('rear');
  await form.getByRole('button',{name:'Add port to template',exact:true}).click();await expect(form).toHaveCount(0);
  await expect(page.getByLabel('Mapped port',{exact:true}).locator('option:checked')).toHaveText('Console · Rear (unmapped)');
  await expect(page.getByRole('button',{name:'Save template',exact:true})).toBeDisabled();await expect(page.getByLabel('Port type',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Source',{exact:true})).toHaveValue('Manually added');
  await place(.5);await expect(page.locator('[data-map-index="48"] text')).toHaveText('Console');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await save();
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!));
  expect(saved.templates[0].portCount).toBe(49);expect(saved.locations[0].layout.racks[0].equipment[0].portCount).toBe(49);
  expect(saved.locations[0].layout.cables).toEqual(project.locations[0].layout.cables);expect(saved.locations[0].layout.portDetails).toEqual(project.locations[0].layout.portDetails);expect(saved.locations[0].layout.portVlans).toEqual(project.locations[0].layout.portVlans);
  expect(saved.templates[0].ports[48]).toMatchObject({manual:true,function:'console',consoleConnector:'RJ45',face:'rear'});expect(saved.templates[0].ports[48].media).toBeUndefined();
  await page.goto('/#/cabinets');await page.getByRole('tab',{name:'Ports',exact:true}).click();await page.getByRole('group',{name:'Rack face',exact:true}).getByRole('button',{name:'Rear',exact:true}).click();
  await page.locator('[data-port="R1/SW1/48"]').click();
  const card=page.getByRole('region',{name:'Selected port details',exact:true});await expect(card).toContainText('Serial console · RJ45');await expect(card.getByText('VLAN',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Port VLAN assignment',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Connect this port',exact:true})).toHaveCount(0);await expect(page.getByText('Physical port settings',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();await page.getByRole('button',{name:'Add connection',exact:true}).click();
  await expect(page.getByLabel('From port',{exact:true}).locator('option[value="48"]')).toBeDisabled();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await edit();await page.getByLabel('Mapped port',{exact:true}).selectOption('48');await expect(page.getByRole('combobox',{name:'Console connector',exact:true})).toHaveValue('RJ45');
  await page.getByRole('combobox',{name:'Console connector',exact:true}).selectOption('USB-C');
  await page.getByRole('button',{name:'Add port',exact:true}).click();await form.getByLabel('New port label',{exact:true}).fill('Temporary');await form.getByRole('button',{name:'Cancel adding port',exact:true}).click();
  await expect(page.getByLabel('Mapped port',{exact:true}).locator('option')).toHaveCount(49);
  await page.getByRole('button',{name:'Add port',exact:true}).click();await form.getByLabel('New port label',{exact:true}).fill('Aux');await form.getByRole('combobox',{name:'New port face',exact:true}).selectOption('rear');await form.getByRole('button',{name:'Add port to template',exact:true}).click();
  await page.getByRole('button',{name:'Remove added port',exact:true}).click();await expect(page.getByLabel('Mapped port',{exact:true}).locator('option')).toHaveCount(49);
  await page.getByRole('button',{name:'Add port',exact:true}).click();await form.getByLabel('New port label',{exact:true}).fill('Aux');await form.getByRole('combobox',{name:'New port face',exact:true}).selectOption('rear');await form.getByRole('button',{name:'Add port to template',exact:true}).click();
  await place(.8);await save();await page.reload();
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!));expect(saved.templates[0].ports[48].consoleConnector).toBe('USB-C');expect(saved.templates[0].ports[49]).toMatchObject({name:'Aux',manual:true,function:'ethernet',media:{kind:'copper'}});
  expect(saved.locations[0].layout.racks[0].equipment[0].portCount).toBe(50);expect(saved.locations[0].layout.cables).toEqual(project.locations[0].layout.cables);
  expect(errors).toEqual([]);
});
