import { loadTemplateFixture } from './equipment-template-helpers';
import { test, expect, type Page } from '@playwright/test';

async function dragPorts(page: Page, first: number, last: number, { rack = 'CAB-A01', device = 'PP-A04', reverse = false, cancel = false, screenshot = false } = {}) {
  const a = page.locator(`[data-port="${rack}/${device}/${first}"] .port-hit`);
  const b = page.locator(`[data-port="${rack}/${device}/${last}"] .port-hit`);
  await a.scrollIntoViewIfNeeded(); await b.scrollIntoViewIfNeeded();
  const start = (await a.boundingBox())!, end = (await b.boundingBox())!;
  const p = { x: start.x - .2, y: start.y - .2 }, q = { x: end.x + end.width + .2, y: end.y + end.height + .2 };
  await page.mouse.move(reverse ? q.x : p.x, reverse ? q.y : p.y); await page.mouse.down();
  await page.mouse.move(reverse ? p.x : q.x, reverse ? p.y : q.y, { steps: 10 });
  await expect(page.locator('.rack-selection-marquee')).toBeVisible();
  if (screenshot) await page.screenshot({ path: 'artifacts/rack-drag-selection.png' });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.rack-selection-marquee')).toHaveCount(0);
}
const selected = (page: Page) => page.locator('.rack-port[aria-pressed="true"]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-port')));

test('rack view selects patch-panel ports without resetting zoom and keeps inherited VLANs read-only', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/cabinets');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoom = await page.locator('.zoom-control span').textContent();
  await dragPorts(page, 1, 3, { screenshot: true });
  await expect(page.getByRole('tab', { name: 'Ports', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('checkbox', { name: 'Select multiple ports', exact: true })).toHaveCount(0);
  await expect(page.locator('.selected-ports-summary h3')).toHaveText('3 selected ports');
  expect(await selected(page)).toEqual([1, 2, 3].map(n => `CAB-A01/PP-A04/${n}`));
  await expect(page.getByRole('combobox', { name: 'VLAN for selected ports', exact: true })).toHaveCount(0);
  await expect(page.locator('.zoom-control span')).toHaveText(zoom!);
  await page.keyboard.down('Shift'); await dragPorts(page, 5, 6); await page.keyboard.up('Shift');
  expect(await selected(page)).toEqual([1, 2, 3, 5, 6].map(n => `CAB-A01/PP-A04/${n}`));
  await dragPorts(page, 8, 10, { reverse: true });
  expect(await selected(page)).toEqual([8, 9, 10].map(n => `CAB-A01/PP-A04/${n}`));
  await dragPorts(page, 12, 14, { cancel: true });
  expect(await selected(page)).toEqual([8, 9, 10].map(n => `CAB-A01/PP-A04/${n}`));
  await page.getByRole('checkbox', { name: 'Cables', exact: true }).uncheck();
  await page.locator('[data-port="CAB-A01/PP-A04/24"]').click();
  await expect(page.locator('.selected-port-info')).toContainText('PP-A04 / Port 24');
  expect(errors).toEqual([]);
});

test('box selection uses mapped port positions at single-rack zoom and can switch devices', async ({ page }) => {
  await page.goto('/#/cabinets');
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await loadTemplateFixture(page, 'CAB-A01', 'PP-A04', 'netbox-generic-copper-24');
  await page.getByRole('button', { name: 'Single rack', exact: true }).click();
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await dragPorts(page, 4, 7);
  expect(await selected(page)).toEqual([4, 5, 6, 7].map(n => `CAB-A01/PP-A04/${n}`));
  await dragPorts(page, 1, 3, { device: 'PP-A03' });
  expect(await selected(page)).toEqual([1, 2, 3].map(n => `CAB-A01/PP-A03/${n}`));
  await expect(page.getByRole('region',{name:'Selected ports',exact:true})).toContainText('PP-A03');
});

test('touch box selection works directly in the Ports tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/cabinets');
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  const a = page.locator('[data-port="CAB-A01/PP-A04/1"] .port-hit'), b = page.locator('[data-port="CAB-A01/PP-A04/3"] .port-hit');
  await a.scrollIntoViewIfNeeded(); await b.scrollIntoViewIfNeeded();
  const p = (await a.boundingBox())!, q = (await b.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x - .2, y: p.y - .2 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q.x + q.width + .2, y: q.y + q.height + .2 }] });
  await expect(page.locator('.rack-selection-marquee')).toBeVisible();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.selected-ports-summary h3')).toHaveText('3 selected ports');
  expect(await selected(page)).toEqual([1, 2, 3].map(n => `CAB-A01/PP-A04/${n}`));
});

test('one rack selection box includes ports from both switches it spans',async({page})=>{
  await page.goto('/#/cabinets');
  const first=page.locator('[data-port="CAB-A01/SW-A01/1"] .port-hit'),last=page.locator('[data-port="CAB-A01/SW-A02/3"] .port-hit');
  await first.scrollIntoViewIfNeeded();await last.scrollIntoViewIfNeeded();
  const a=(await first.boundingBox())!,b=(await last.boundingBox())!;
  await page.mouse.move(a.x-.2,a.y-.2);await page.mouse.down();
  await page.mouse.move(b.x+b.width+.2,b.y+b.height+.2,{steps:10});await page.mouse.up();
  const ports=await selected(page);
  expect(ports).toContain('CAB-A01/SW-A01/1');expect(ports).toContain('CAB-A01/SW-A02/3');
  const table=page.getByRole('table',{name:'Selected ports',exact:true});
  await expect(table.locator('tbody tr')).toHaveCount(ports.length);
  await expect(table).toContainText('SW-A01');await expect(table).toContainText('SW-A02');
});
