import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { stackProject } from './stack-fixture';

const yaml='# Keep this comment\r\nmanufacturer: Test\r\nmodel: Console switch\r\nu_height: 1\r\ninterfaces:\r\n  - {name: mgmt, type: 1000base-t}\r\nconsole-ports:\r\n  - {name: console, type: rj-45}\r\npower-ports:\r\n  - {name: PSU1, type: iec-60320-c14}\r\nx-extra: preserve me\r\n';
const image='public/equipment/netbox/generic-24-port-copper-patch-panel.front.png';
async function download(page:Page,button:string){
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();
  const result=await promise;return {name:result.suggestedFilename(),buffer:await readFile((await result.path())!)};
}
async function saved(page:Page){return page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!));}
async function save(page:Page){
  await page.getByRole('checkbox',{name:'I checked every socket position and numbered interface against the image.',exact:true}).check();
  await page.getByRole('button',{name:'Save template',exact:true}).click();
  await expect(page.getByRole('region',{name:'Template editor',exact:true})).toHaveCount(0);
}
test('YAML console import, rear mapping, portable export and import preserve source and installed equipment',async({page})=>{
  await page.goto('/#/configuration/templates');await page.getByRole('button',{name:'Import template',exact:true}).click();
  await page.getByLabel('Device definition YAML').setInputFiles({name:'console.yaml',mimeType:'text/yaml',buffer:Buffer.from(yaml)});
  await page.getByLabel('Front equipment image',{exact:true}).setInputFiles(image);
  await page.getByLabel('Rear equipment image',{exact:true}).setInputFiles(image);
  await page.getByRole('button',{name:'Continue to port mapping',exact:true}).click();
  await expect(page.getByLabel('Mapped port',{exact:true}).locator('option')).toHaveText(['MGMT (unmapped)','Console (unmapped)']);
  await page.getByText('Start with a regular grid',{exact:true}).click();
  await page.getByRole('button',{name:'Generate port grid',exact:true}).click();
  await page.getByLabel('Mapped port',{exact:true}).selectOption({label:'Console'});
  await expect(page.getByRole('combobox',{name:'Console connector',exact:true})).toHaveValue('RJ45');
  await expect(page.getByRole('combobox',{name:'Port type',exact:true})).toHaveCount(0);
  await page.getByLabel('Port face',{exact:true}).selectOption('rear');
  await page.getByRole('button',{name:'Generate port grid',exact:true}).click();
  await save(page);
  const before=await saved(page),template=before.templates.at(-1);
  expect(template.source.yaml).toBe(yaml);expect(template.ports[1]).toMatchObject({function:'console',consoleConnector:'RJ45',face:'rear',sourceSection:'console-ports'});expect(template.ports[1].media).toBeUndefined();
  const source=await download(page,`Download source YAML for ${template.name}`);expect(source.buffer.toString()).toBe(yaml);
  const exported=await download(page,`Export template ${template.name}`),pkg=JSON.parse(exported.buffer.toString());
  expect(pkg.template).toEqual(template);expect(pkg.schemaVersion).toBe(1);
  await page.getByLabel('Saved template file',{exact:true}).setInputFiles({name:exported.name,mimeType:'application/json',buffer:exported.buffer});
  await expect(page.getByRole('status')).toContainText('Existing templates and equipment were not changed');
  const after=await saved(page),copy=after.templates.at(-1);
  expect(copy.id).not.toBe(template.id);expect(copy.ports).toEqual(template.ports);expect(copy.rearImage).toEqual(template.rearImage);expect(copy.source).toEqual(template.source);expect(after.locations).toEqual(before.locations);
  await page.reload();await expect(page.getByRole('heading',{name:copy.name,exact:true})).toBeVisible();
  const reloaded=await saved(page),bad={...pkg,template:{...template,imageWidth:template.imageWidth+1}};
  await page.getByLabel('Saved template file',{exact:true}).setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
  await expect(page.getByRole('alert')).toContainText('dimensions');expect(await saved(page)).toEqual(reloaded);
});
test('bundled templates export embedded images and source and can be imported as editable copies',async({page})=>{
  await page.goto('/#/configuration/templates');
  for(const name of ['Generic 24-port copper patch panel','Ubiquiti US-48 · 48 copper ports']){
    const result=await download(page,`Export template ${name}`),pkg=JSON.parse(result.buffer.toString());
    expect(pkg.template.imageSrc).toMatch(/^data:image\/png;base64,/);expect(pkg.template.source.yaml).toContain('manufacturer:');
    await page.getByLabel('Saved template file',{exact:true}).setInputFiles({name:result.name,mimeType:'application/json',buffer:result.buffer});
    await expect(page.getByRole('status')).toContainText('Existing templates and equipment were not changed');
    await expect(page.getByRole('button',{name:`Edit template ${name} (imported 1)`,exact:true})).toBeVisible();
  }
});
test('legacy templates can attach matching original YAML without changing maps or installed devices',async({page})=>{
  const project=stackProject(),template=project.templates![0];
  await page.addInitScript(project=>{localStorage.setItem('porttracker.project',JSON.stringify(project));},project);
  await page.goto('/#/configuration/templates');await page.getByRole('button',{name:`Edit template ${template.name}`,exact:true}).click();
  await page.getByText('Source YAML Not retained',{exact:true}).click();
  await page.getByLabel('Attach source YAML',{exact:true}).setInputFiles({name:'wrong.yaml',mimeType:'text/yaml',buffer:Buffer.from(yaml)});
  await expect(page.getByRole('status')).toContainText('matching this manufacturer');
  const original=yaml.replace('manufacturer: Test','manufacturer: Juniper').replace('model: Console switch','model: Test switch');
  await page.getByLabel('Attach source YAML',{exact:true}).setInputFiles({name:'original.yaml',mimeType:'text/yaml',buffer:Buffer.from(original)});
  await expect(page.getByRole('status')).toContainText('Source attached');await save(page);
  const after=await saved(page);expect(after.templates[0].source.yaml).toBe(original);expect(after.templates[0].ports).toEqual(template.ports.map(p=>({...p,media:{kind:'copper'},interfaceType:'mapped'})));expect(after.locations).toEqual(project.locations);
});
