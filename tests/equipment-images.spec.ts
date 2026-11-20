import { loadTemplateFixture } from './equipment-template-helpers';
import { seedFacilityLocations } from './facility-location-helpers';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const patch = 'netbox-generic-copper-24';
const sw = 'netbox-ubiquiti-us-48';

async function expectUndistortedImages(page: Page) {
  const images = await page.locator('.equipment-image').evaluateAll(nodes => nodes.map(node => {
    const image = node as SVGImageElement, rect = image.getBoundingClientRect();
    return { src: image.href.baseVal, ratio: rect.width / rect.height, preserve: image.getAttribute('preserveAspectRatio') };
  }));
  expect(images.length).toBeGreaterThan(0);
  for (const image of images) {
    expect(image.preserve).toBe('xMidYMid meet');
    // Browser bounds use fractional pixels after responsive zoom.
    expect(image.ratio).toBeCloseTo(image.src.includes('generic') ? 1462 / 134 : 824 / 77, 3);
  }
}

test.beforeEach(async ({ page }) => { await seedFacilityLocations(page, ["Room 214"]); });

test('equipment images retain port data, align cable endpoints, and persist through backups', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.equipment-image')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('button', { name: 'Port 24, available', exact: true }).click();
  await page.getByRole('combobox', { name: 'Facility location', exact: true }).selectOption('Room 214');
  await page.getByRole('textbox', { name: 'Port notes', exact: true }).fill('Desk outlet');
  await page.getByRole('combobox', { name: 'Port VLAN', exact: true }).selectOption('99');
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await loadTemplateFixture(page, 'CAB-A01', 'PP-A04', patch);
  await expect(page.getByRole('region', { name: 'Equipment appearance', exact: true })).toHaveCount(0);
  const face = page.locator('[data-equipment="CAB-A01/PP-A04"]');
  await expect(face).toHaveAttribute('data-template', patch);
  await expect(face.locator('.rack-port')).toHaveCount(24);
  await expect(face.locator('use')).toHaveCount(0);
  await expectUndistortedImages(page);
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('button', { name: 'Port 24, available', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Facility location', exact: true })).toHaveValue('Room 214');
  await expect(page.locator('[data-port="CAB-A01/PP-A04/24"]')).toHaveAttribute('data-vlan', '99');
  await page.getByRole('checkbox', { name: 'Select multiple ports' }).check();
  await page.locator('[data-grid-port="CAB-A01/PP-A04/22"]').click();
  await page.locator('[data-grid-port="CAB-A01/PP-A04/23"]').click();
  await page.getByRole('combobox', { name: 'VLAN for selected ports' }).selectOption('60');
  await page.getByRole('button', { name: 'Apply to 2 selected ports', exact: true }).click();
  for (const n of [22, 23]) await expect(face.locator(`[data-port="CAB-A01/PP-A04/${n}"]`)).toHaveAttribute('data-vlan', '60');
  await page.getByRole('checkbox', { name: 'Select multiple ports' }).uncheck();
  await page.getByRole('combobox', { name: 'Browse rack' }).selectOption('CAB-A02');
  await page.getByRole('combobox', { name: 'Browse equipment' }).selectOption('SW-B01');
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await loadTemplateFixture(page, 'CAB-A02', 'SW-B01', sw);
  await expectUndistortedImages(page);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expectUndistortedImages(page);
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await expectUndistortedImages(page);
  const centers = await page.locator('[data-equipment="CAB-A02/SW-B01"] .port-hit').evaluateAll(nodes => nodes.map(node => {
    const r = node as SVGRectElement; return { x: r.x.baseVal.value + r.width.baseVal.value / 2, y: r.y.baseVal.value + r.height.baseVal.value / 2 };
  }));
  expect(centers).toHaveLength(48);
  expect(centers[0].x).toBe(centers[1].x);
  expect(centers[0].y).toBeLessThan(centers[1].y);
  expect(centers[2].x).toBeGreaterThan(centers[0].x);
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('button', { name: 'Port 18, connected', exact: true }).click();
  await page.getByRole('button', { name: 'View connection', exact: true }).click();
  await expect(page.locator('.path-diagram')).toHaveAttribute('aria-label', 'Overhead route from Rack A right manager to Rack B left manager');
  const endpoint = await page.locator('.cable-group.selected > path').first().evaluate((p: SVGPathElement) => {
    const point = p.getPointAtLength(p.getTotalLength()); return { x: point.x, y: point.y };
  });
  expect(endpoint.x).toBeCloseTo(centers[17].x, 3);
  expect(endpoint.y).toBeCloseTo(centers[17].y, 3);
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Cables', exact: true }).uncheck();
  await page.locator('[data-port="CAB-A02/SW-B01/48"]').click();
  await expect(page.locator('.selected-port-info')).toContainText('SW-B01 / Port 48');
  await page.getByRole('checkbox', { name: 'Cables', exact: true }).check();
  await page.screenshot({ path: 'artifacts/equipment-images.png', fullPage: true });
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Cables', exact: true }).uncheck();
  await face.screenshot({ path: 'artifacts/equipment-patch-proportions.png' });
  await page.locator('[data-equipment="CAB-A02/SW-B01"]').screenshot({ path: 'artifacts/equipment-switch-proportions.png' });
  await expectUndistortedImages(page);
  await page.getByRole('button', { name: 'Fit', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Cables', exact: true }).check();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const backup = await readFile((await (await downloadPromise).path())!);
  const saved = JSON.parse(backup.toString()).locations[0].layout;
  expect(saved.racks[0].equipment.find((e: { id: string }) => e.id === 'PP-A04').templateId).toBe(patch);
  expect(saved.racks[1].equipment.find((e: { id: string }) => e.id === 'SW-B01').templateId).toBe(sw);
  expect(saved.portDetails['CAB-A01/PP-A04/24'].notes).toBe('Desk outlet');
  expect(saved.portVlans['CAB-A01/PP-A04/24']).toBe(99);
  expect(saved.cables).toHaveLength(32);
  await page.reload();
  await expect(page.locator('.equipment-image')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await loadTemplateFixture(page, 'CAB-A01', 'PP-A04', null);
  await expect(page.locator('.equipment-image')).toHaveCount(1);
  await page.getByRole('link', { name: 'Distribution Frames', exact: true }).click();
  await page.getByLabel('Project JSON file').setInputFiles({ name: 'images.json', mimeType: 'application/json', buffer: backup });
  await page.getByRole('button', { name: 'Replace with imported project', exact: true }).click();
  await page.getByRole('button', { name: 'Open IDF-01', exact: true }).click();
  await expect(page.locator('.equipment-image')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('button', { name: 'Port 24, available', exact: true }).click();
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await expect(face).toHaveAttribute('data-template', patch);
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Port notes', exact: true })).toHaveValue('Desk outlet');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectUndistortedImages(page);
  expect(errors).toEqual([]);
});

test('unavailable images retain interactive mapped sockets and recover after reload', async ({ page }) => {
  await page.route('**/equipment/netbox/*.png', route => route.abort());
  await page.goto('/');
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('combobox', { name: 'Browse equipment' }).selectOption('SW-A01');
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await loadTemplateFixture(page, 'CAB-A01', 'SW-A01', sw);
  await expect(page.locator('.socket-fallback')).toHaveCount(48);
  await page.getByRole('checkbox', { name: 'Cables', exact: true }).uncheck();
  await page.locator('[data-port="CAB-A01/SW-A01/48"]').click();
  await expect(page.locator('.selected-port-info')).toContainText('SW-A01 / Port 48');
  await page.unroute('**/equipment/netbox/*.png');
  await page.reload();
  await expect(page.locator('.socket-fallback')).toHaveCount(0);
  await expect(page.locator('.equipment-image')).toHaveCount(1);
});
