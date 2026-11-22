import {test,expect} from '@playwright/test';

for(const mobile of [false,true])test(`${mobile?'mobile cross-rack':'desktop same-rack'} selection connects two different switches`,async({page})=>{
  if(mobile)await page.setViewportSize({width:390,height:844});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByRole('tab',{name:'Ports',exact:true}).click();
  await page.locator('[data-port="CAB-A01/SW-A01/48"]').press('Enter');
  const toRack=mobile?'CAB-A02':'CAB-A01',toDevice=mobile?'SW-B02':'SW-A02';
  await page.locator(`[data-port="${toRack}/${toDevice}/48"]`).press('Control+Enter');
  const table=page.getByRole('table',{name:'Selected ports',exact:true});
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('[data-selected-port="CAB-A01/SW-A01/48"]')).toContainText('SW-A01');
  await expect(table.locator(`[data-selected-port="${toRack}/${toDevice}/48"]`)).toContainText(toDevice);
  await page.getByRole('combobox',{name:'VLAN for selected ports',exact:true}).selectOption('99');
  await page.getByRole('button',{name:'Apply to 2 selected ports',exact:true}).click();
  await expect(table.locator('tbody tr td:nth-child(2)')).toHaveText(['99','99']);
  await table.screenshot({path:`artifacts/cross-equipment-selection-${mobile?'mobile':'desktop'}.png`});
  await page.getByRole('button',{name:'Connect selected ports',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Create connection',exact:true});
  await expect(dialog.getByRole('combobox',{name:'From equipment',exact:true})).toHaveValue('SW-A01');
  await expect(dialog.getByRole('combobox',{name:'From port',exact:true})).toHaveValue('48');
  await expect(dialog.getByRole('combobox',{name:'To rack',exact:true})).toHaveValue(toRack);
  await expect(dialog.getByRole('combobox',{name:'To equipment',exact:true})).toHaveValue(toDevice);
  await expect(dialog.getByRole('combobox',{name:'To port',exact:true})).toHaveValue('48');
  await dialog.getByRole('button',{name:'Create connection',exact:true}).click();await expect(dialog).toHaveCount(0);
  const check=async()=>{
    const project=await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!));
    const cable=project.locations[0].layout.cables.find((c:{id:string})=>c.id==='CBL-0001');
    expect(cable.from).toEqual({rackId:'CAB-A01',equipmentId:'SW-A01',port:48});
    expect(cable.to).toEqual({rackId:toRack,equipmentId:toDevice,port:48});expect(cable.vlan).toBe(99);
  };
  await check();await page.reload();await check();expect(errors).toEqual([]);
  await page.getByRole('tab',{name:'Ports',exact:true}).click();
  await page.locator('[data-port="CAB-A01/SW-A01/48"]').press('Enter');
  const card=page.getByRole('region',{name:'Selected port details',exact:true});
  await expect(card).toContainText(`${toDevice} / Port 48`);
  await expect(page.locator('.port-browser')).not.toContainText('CBL-0001');
  await page.locator(`[data-port="${toRack}/${toDevice}/48"]`).press('Control+Enter');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table).toContainText('Connected');
  await expect(table).not.toContainText('CBL-0001');
});

test('cross-device selections support independent deselection and ranges without reusing a foreign anchor',async({page})=>{
  await page.goto('/');await page.getByRole('tab',{name:'Ports',exact:true}).click();
  const rackPort=(equipment:string,port:number)=>page.locator(`[data-port="CAB-A01/${equipment}/${port}"]`);
  await rackPort('SW-A01',3).press('Enter');await rackPort('SW-A02',18).press('Control+Enter');
  await expect(page.getByRole('button',{name:'Connect selected ports',exact:true})).toBeDisabled();
  const table=page.getByRole('table',{name:'Selected ports',exact:true});
  await table.getByRole('button',{name:'Deselect port 3 on SW-A01 in Rack A',exact:true}).click();
  await expect(page.getByRole('region',{name:'Selected port details',exact:true})).toContainText('SW-A02 / Port 18');
  await rackPort('SW-A01',24).press('Shift+Enter');
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await rackPort('SW-A01',26).press('Shift+Enter');
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await expect(table.locator('[data-selected-port="CAB-A01/SW-A02/18"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();await expect(table).toHaveCount(0);
});
