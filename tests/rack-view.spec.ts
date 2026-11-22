import { seedFacilityLocations } from './facility-location-helpers';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function rename(page: Page, id: string, name: string) {
  await page.getByRole('button', { name: 'Rack settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Rack to rename', exact: true }).selectOption(id);
  await page.getByRole('textbox', { name: 'Rack name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save rack settings', exact: true }).click();
}
async function noRackIds(page: Page) {
  const labels = await page.evaluate(() => document.body.innerText + '\n' + [...document.querySelectorAll('[aria-label], svg title')].map(e => e.getAttribute('aria-label') ?? e.textContent).join('\n'));
  expect(labels).not.toMatch(/\b(?:CAB|RACK)-A\d+/);
}

test.beforeEach(async ({ page }) => { await seedFacilityLocations(page, ["Zoom test room"]); });

test('calibration saves explicit frame, equipment and manager overlap dimensions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Length calibration', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Length units', exact: true }).selectOption('imperial');
  for (const [label, value] of [['Rack width', '23'], ['Equipment width', '19'], ['Side manager width (each)', '5'], ['Manager overlap on rack (each)', '1'], ['Gap between racks', '1']]) {
    await dialog.getByRole('spinbutton', { name: label, exact: true }).fill(value);
  }
  await dialog.getByRole('spinbutton', { name: 'Manager overlap on rack (each)', exact: true }).fill('6');
  await expect(dialog.getByRole('button', { name: 'Apply values', exact: true })).toBeDisabled();
  await dialog.getByRole('spinbutton', { name: 'Manager overlap on rack (each)', exact: true }).fill('1');
  await dialog.getByRole('combobox', { name: 'Length units', exact: true }).selectOption('metric');
  await dialog.getByRole('combobox', { name: 'Length units', exact: true }).selectOption('imperial');
  await expect(dialog.getByRole('spinbutton', { name: 'Manager overlap on rack (each)', exact: true })).toHaveValue('1');
  await dialog.getByRole('button', { name: 'Apply values', exact: true }).click();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('porttracker.project')!));
  const frame = saved.locations[0];
  expect(frame.calibration.equipmentWidthM).toBeCloseTo(19 * .0254, 10);
  expect(frame.calibration.managerOverlapM).toBeCloseTo(.0254, 10);
  expect(frame.layout.racks[1].positionM).toBeCloseTo(32 * .0254, 10);
});

test('rack management options control drawing and survive calibration and reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add empty rack', exact: true }).click();
  await page.getByRole('combobox', { name: 'Vertical cable management', exact: true }).selectOption('no');
  await page.getByRole('button', { name: 'Add rack', exact: true }).click();
  await expect(page.locator('[data-vertical-manager^="CAB-A03/"]')).toHaveCount(0);
  await expect(page.locator('[data-vertical-manager^="CAB-A01/"]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Rack settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Rack to rename' }).selectOption('CAB-A01');
  await page.getByRole('combobox', { name: 'Vertical cable management', exact: true }).selectOption('no');
  await page.getByRole('button', { name: 'Save rack settings', exact: true }).click();
  await expect(page.locator('[data-vertical-manager^="CAB-A01/"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Length calibration', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Length units', exact: true }).selectOption('metric');
  await dialog.getByRole('spinbutton', { name: 'Side manager width (each)', exact: true }).fill('0.1');
  await dialog.getByRole('button', { name: 'Apply values', exact: true }).click();
  await page.reload();
  await expect(page.locator('[data-vertical-manager]')).toHaveCount(2);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('porttracker.project')!));
  expect(saved.locations[0].calibration.verticalManagerWidthM).toBe(.1);
  expect(saved.locations[0].layout.racks.map((r: { positionM: number }) => r.positionM)).toEqual([0, .85, 1.9]);
});

test('new empty racks accept and persist a custom rack-unit count', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add empty rack', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Rack units', exact: true }).fill('18');
  await page.getByRole('button', { name: 'Add rack', exact: true }).click();
  await expect(page.locator('.summary-stats').getByText('18U', { exact: true })).toBeVisible();
  await expect(page.locator('[data-empty-unit="CAB-A03/18"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('.summary-stats').getByText('18U', { exact: true })).toBeVisible();
});

test('single rack fills the canvas width by default and remembers its own chosen zoom', async ({ page }) => {
  await page.goto('/');
  const multiZoom = await page.locator('.zoom-control span').textContent();
  await page.getByRole('button', { name: 'Single rack', exact: true }).click();
  const fillsWidth = async () => {
    await expect.poll(() => page.locator('.rack-viewport').evaluate(element => {
      const style = getComputedStyle(element);
      const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return Math.abs(element.querySelector('.scene-frame')!.getBoundingClientRect().width - available);
    })).toBeLessThan(2);
    await expect(page.locator('.rack-viewport')).toHaveJSProperty('scrollLeft', 0);
  };
  await fillsWidth();
  await page.getByRole('combobox', { name: 'Visible rack' }).selectOption('CAB-A02');
  await fillsWidth();
  await page.setViewportSize({ width: 390, height: 844 });
  await fillsWidth();
  await page.setViewportSize({ width: 3840, height: 1080 });
  await fillsWidth();
  await page.setViewportSize({ width: 1768, height: 800 });
  await fillsWidth();
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  const singleZoom = await page.locator('.zoom-control span').textContent();
  const transform = await page.locator('.scene-frame > div').evaluate(e => getComputedStyle(e).transform);
  const unchanged = async () => {
    await expect(page.locator('.zoom-control span')).toHaveText(singleZoom!);
    await expect(page.locator('.scene-frame > div')).toHaveCSS('transform', transform);
  };
  await rename(page, 'CAB-A02', 'Distribution');
  await unchanged();
  await page.getByRole('button', { name: 'Multiple racks', exact: true }).click();
  await expect(page.locator('.zoom-control span')).toHaveText(multiZoom!);
  await page.getByRole('button', { name: 'Single rack', exact: true }).click();
  await unchanged();
  await page.reload();
  await page.getByRole('button', { name: 'Single rack', exact: true }).click();
  await unchanged();
  await page.setViewportSize({ width: 390, height: 844 });
  await unchanged();
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect(page.locator('.zoom-control span')).not.toHaveText(singleZoom!);
  const fit = await page.locator('.zoom-control span').textContent();
  await page.reload();
  await page.getByRole('button', { name: 'Single rack', exact: true }).click();
  await expect(page.locator('.zoom-control span')).toHaveText(fit!);
});

test('custom names appear throughout menus, diagrams and rack dialogs without showing IDs', async ({ page }) => {
  await page.goto('/');
  await rename(page, 'CAB-A01', 'Core network');
  await rename(page, 'CAB-A02', 'Distribution');
  await expect(page.getByRole('checkbox', { name: 'Core network', exact: true })).toBeChecked();
  await expect(page.locator('.connection-details')).toContainText('Core network');
  await expect(page.locator('.path-diagram')).toHaveAttribute('aria-label', /Core network.*Distribution/);
  await noRackIds(page);
  await page.getByRole('button', { name: 'Single rack', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Visible rack' }).locator('option')).toHaveText(['Core network', 'Distribution']);
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Browse rack' }).locator('option')).toHaveText(['Core network', 'Distribution']);
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: 'Move equipment', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Destination rack' }).locator('option')).toHaveText(['Core network', 'Distribution']);
  await noRackIds(page);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'From rack' }).locator('option')).toHaveText(['Core network', 'Distribution']);
  await noRackIds(page);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Remove rack', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Rack to remove' }).locator('option')).toHaveText(['Core network', 'Distribution']);
  await noRackIds(page);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search connections' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Length calibration', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Core network', exact: true })).toBeVisible();
  await noRackIds(page);
});

test('zoom survives equipment and rack edits, view changes, units, reload and backups; Fit is explicit', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoom = await page.locator('.zoom-control span').textContent();
  const transform = await page.locator('.scene-frame > div').evaluate(e => getComputedStyle(e).transform);
  const unchanged = async () => { await expect(page.locator('.zoom-control span')).toHaveText(zoom!); await expect(page.locator('.scene-frame > div')).toHaveCSS('transform', transform); };
  await rename(page, 'CAB-A01', 'Core'); await unchanged();
  await page.getByRole('button', { name: 'Single rack', exact: true }).click();
  await page.getByRole('button', { name: 'Multiple racks', exact: true }).click(); await unchanged();
  await page.getByRole('button', { name: 'Add empty rack', exact: true }).click();
  await page.getByRole('button', { name: 'Add rack', exact: true }).click(); await unchanged();
  await page.getByRole('checkbox', { name: 'Rack C', exact: true }).uncheck(); await unchanged();
  await page.getByRole('button', { name: 'Add equipment', exact: true }).click();
  await page.getByRole('combobox', { name: 'Destination rack', exact: true }).selectOption('CAB-A01');
  await page.getByRole('textbox', { name: 'Equipment ID', exact: true }).fill('ZOOM-PANEL');
  await page.getByRole('button', { name: 'Place equipment', exact: true }).click(); await unchanged();
  await expect(page.getByRole('tab', { name: 'Equipment', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Manage ports', exact: true }).click();
  await page.getByRole('button', { name: 'Port 24, available', exact: true }).click();
  await page.getByRole('combobox', { name: 'Facility location', exact: true }).selectOption('Zoom test room');
  await page.getByRole('combobox', { name: 'Port VLAN', exact: true }).selectOption('99'); await unchanged();
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: 'Move equipment', exact: true }).click();
  await page.getByRole('combobox', { name: 'Destination rack', exact: true }).selectOption('CAB-A02');
  await page.getByRole('button', { name: 'Save equipment position', exact: true }).click(); await unchanged();
  await expect(page.getByRole('tab', { name: 'Equipment', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Manage ports', exact: true }).click();
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: 'Remove equipment', exact: true }).click();
  await page.getByRole('button', { name: 'Delete equipment', exact: true }).click(); await unchanged();
  await page.getByRole('button', { name: 'Remove rack', exact: true }).click();
  await page.getByRole('combobox', { name: 'Rack to remove', exact: true }).selectOption('CAB-A03');
  await page.getByRole('button', { name: 'Delete rack', exact: true }).click(); await unchanged();
  await page.evaluate(() => { location.hash = '/configuration/stock'; });
  await page.getByRole('combobox', { name: 'Length units', exact: true }).selectOption('imperial');
  await page.reload();
  await page.getByRole('link', { name: 'Back to racks', exact: true }).click(); await unchanged();
  await page.setViewportSize({ width: 390, height: 844 }); await unchanged();
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expect(page.locator('.zoom-control span')).not.toHaveText(zoom!);
  const fit = await page.locator('.zoom-control span').textContent();
  await page.getByRole('button', { name: 'Add empty rack', exact: true }).click();
  await page.getByRole('button', { name: 'Add rack', exact: true }).click();
  await expect(page.locator('.zoom-control span')).toHaveText(fit!);
  await page.reload(); await expect(page.locator('.zoom-control span')).toHaveText(fit!);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export', exact: true }).click();
  const backup = await readFile((await (await download).path())!);
  const exported = JSON.parse(backup.toString());
  expect(exported.preferences.lengthUnit).toBe('imperial');
  expect(exported.preferences.rackZoom).toBeGreaterThanOrEqual(.12);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.goto('/#/locations');
  await page.getByLabel('Project JSON file').setInputFiles({ name: 'zoom.json', mimeType: 'application/json', buffer: backup });
  await page.getByRole('button', { name: 'Replace with imported project', exact: true }).click();
  await page.getByRole('button', { name: 'Open IDF-01', exact: true }).click();
  await expect(page.locator('.zoom-control span')).toHaveText(fit!);
  expect(errors).toEqual([]);
});

for (const single of [false,true]) test(`${single?'single':'multiple'} rack touchpad pinch zooms the workspace and preserves native panning`, async ({page}) => {
  await page.goto('/#/cabinets');
  await page.evaluate(()=>{
    const project=JSON.parse(localStorage.getItem('porttracker.project')!);
    project.preferences.rackZoom=1.5;project.preferences.singleRackZoom=3;
    localStorage.setItem('porttracker.project',JSON.stringify(project));
  });
  await page.reload();
  await page.getByRole('button',{name:single?'Single rack':'Multiple racks',exact:true}).click();
  const viewport=page.locator('.rack-viewport');
  const scale=()=>page.locator('.scene-frame > div').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a);
  await viewport.evaluate(el=>{el.scrollLeft=100;el.scrollTop=200;});
  const bounds=(await viewport.boundingBox())!,pointer={x:Math.round(bounds.x+bounds.width*.4),y:Math.round(bounds.y+bounds.height*.4)};
  const scenePoint=()=>viewport.evaluate((el,p)=>{
    const frame=el.querySelector('.scene-frame')!,r=frame.getBoundingClientRect(),s=new DOMMatrix(getComputedStyle(frame.firstElementChild!).transform).a;
    return {x:(p.x-r.left)/s,y:(p.y-r.top)/s};
  },pointer);
  const pageMetrics=()=>page.evaluate(()=>({viewport:visualViewport!.scale,pixelRatio:devicePixelRatio,header:document.querySelector('.topbar')!.getBoundingClientRect().height}));
  const pageBefore=await pageMetrics(),pointBefore=await scenePoint(),initial=await scale();
  const dataBefore=await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations);
  await page.mouse.move(pointer.x,pointer.y);
  await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');
  await expect.poll(scale).toBeGreaterThan(initial);
  const enlarged=await scale(),pointAfter=await scenePoint();
  expect(pointAfter.x).toBeCloseTo(pointBefore.x,0);expect(pointAfter.y).toBeCloseTo(pointBefore.y,0);
  expect(await pageMetrics()).toEqual(pageBefore);
  await page.keyboard.down('Control');await page.mouse.wheel(0,120);await page.keyboard.up('Control');
  await expect.poll(scale).toBeCloseTo(initial,5);
  const scrollBefore=await viewport.evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
  await page.mouse.wheel(40,60);
  await expect.poll(()=>viewport.evaluate(el=>el.scrollTop)).toBeGreaterThan(scrollBefore.y);
  expect(await viewport.evaluate(el=>el.scrollLeft)).toBeGreaterThan(scrollBefore.x);
  expect(await scale()).toBeCloseTo(initial,5);
  await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');
  await expect.poll(scale).toBeCloseTo(enlarged,5);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('porttracker.project')!).locations)).toEqual(dataBefore);
  await page.reload();await page.getByRole('button',{name:single?'Single rack':'Multiple racks',exact:true}).click();
  await expect.poll(scale).toBeCloseTo(enlarged,5);
  await page.getByRole('link',{name:'Facility',exact:true}).click();
  await page.getByRole('link',{name:'Racks',exact:true}).click();
  await expect(viewport).toBeVisible();
  // Returning to the rack page must attach the listener to the new viewport.
  await viewport.dispatchEvent('wheel',{ctrlKey:true,deltaY:10000,clientX:pointer.x,clientY:pointer.y});
  await expect.poll(scale).toBeCloseTo(.12,5);
  await viewport.dispatchEvent('wheel',{ctrlKey:true,deltaY:-10000,clientX:pointer.x,clientY:pointer.y});
  await expect.poll(scale).toBe(single?8:2);
  await page.getByRole('button',{name:'Fit',exact:true}).click();
  await expect.poll(scale).toBeLessThan(single?8:2);
});
