import { seedFacilityLocations } from './facility-location-helpers';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function choosePort(page: Page, port: number, connected = false) {
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('button', { name: `Port ${port}, ${connected ? 'connected' : 'available'}`, exact: true }).click();
}

test.beforeEach(async ({ page }) => { await seedFacilityLocations(page, ["Building A · Floor 2 · Room 214 · West wall", "Reception", "Warehouse"]); });

test('patch-panel facility location and notes autosave independently, survive reload and round-trip through backup', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await choosePort(page, 24);
  const location = page.getByRole('combobox', { name: 'Facility location', exact: true });
  const notes = page.getByRole('textbox', { name: 'Port notes', exact: true });
  await location.selectOption('Building A · Floor 2 · Room 214 · West wall');
  await notes.fill('Outlet A-214-02\nAbove the counter. Spare data drop.');
  await expect(page.locator('.cable-group')).toHaveCount(32);
  await expect(page.locator('[data-grid-port="CAB-A01/PP-A04/24"] .port-info-marker')).toHaveCount(1);
  await expect(page.locator('[data-port="CAB-A01/PP-A04/24"] title')).toContainText('Room 214');
  await choosePort(page, 23);
  await expect(location).toHaveValue('');
  await expect(notes).toHaveValue('');
  await choosePort(page, 24);
  await expect(notes).toHaveValue('Outlet A-214-02\nAbove the counter. Spare data drop.');
  await page.reload();
  await choosePort(page, 24);
  await expect(location).toHaveValue('Building A · Floor 2 · Room 214 · West wall');
  await expect(notes).toHaveValue('Outlet A-214-02\nAbove the counter. Spare data drop.');
  await page.locator('.patch-port-details').screenshot({ path: 'artifacts/patch-port-details.png' });
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await pendingDownload;
  const backup = await readFile((await download.path())!);
  expect(JSON.parse(backup.toString()).locations[0].layout.portDetails['CAB-A01/PP-A04/24'].facilityLocation).toContain('Room 214');
  await location.selectOption('');
  await notes.fill('');
  await expect(page.locator('[data-grid-port="CAB-A01/PP-A04/24"] .port-info-marker')).toHaveCount(0);
  await page.reload();
  await choosePort(page, 24);
  await expect(location).toHaveValue('');
  await expect(notes).toHaveValue('');
  await page.getByRole('link', { name: 'Distribution Frames', exact: true }).click();
  await page.getByLabel('Project JSON file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await page.getByRole('button', { name: 'Replace with imported project', exact: true }).click();
  await page.getByRole('button', { name: 'Open IDF-01', exact: true }).click();
  await choosePort(page, 24);
  await expect(location).toHaveValue('Building A · Floor 2 · Room 214 · West wall');
  await expect(notes).toHaveValue('Outlet A-214-02\nAbove the counter. Spare data drop.');
  await page.setViewportSize({ width: 390, height: 844 });
  await notes.fill('Updated from a phone');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('combobox', { name: 'Browse equipment' }).selectOption('SW-A01');
  await expect(page.getByRole('region', { name: 'Patch-panel port details' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('port documentation remains after cable removal and stays out of copied equipment layouts', async ({ page }) => {
  await page.goto('/');
  await choosePort(page, 18, true);
  await page.getByRole('combobox', { name: 'Facility location', exact: true }).selectOption('Reception');
  await page.getByRole('textbox', { name: 'Port notes', exact: true }).fill('Desk 1, outlet R-01');
  await page.getByRole('button', { name: 'View connection', exact: true }).click();
  await page.getByRole('button', { name: 'Edit connection', exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await choosePort(page, 18);
  await expect(page.getByRole('combobox', { name: 'Facility location', exact: true })).toHaveValue('Reception');
  await page.getByRole('combobox', { name: 'Port VLAN', exact: true }).selectOption('99');
  await expect(page.getByRole('textbox', { name: 'Port notes', exact: true })).toHaveValue('Desk 1, outlet R-01');
  await page.getByRole('link', { name: 'Distribution Frames', exact: true }).click();
  await page.getByRole('button', { name: 'Add distribution frame', exact: true }).click();
  await page.getByRole('textbox', { name: 'Distribution frame name', exact: true }).fill('IDF-02');
  await page.getByRole('combobox', { name: 'Starting layout' }).selectOption('idf-01');
  await page.getByRole('button', { name: 'Save distribution frame', exact: true }).click();
  await page.getByRole('button', { name: 'Open IDF-02', exact: true }).click();
  await choosePort(page, 18);
  await expect(page.getByRole('combobox', { name: 'Facility location', exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Port notes', exact: true })).toHaveValue('');
  await page.getByRole('combobox', { name: 'Facility location', exact: true }).selectOption('Warehouse');
  await page.getByRole('combobox', { name: 'Active distribution frame' }).selectOption('idf-01');
  await choosePort(page, 18);
  await expect(page.getByRole('combobox', { name: 'Facility location', exact: true })).toHaveValue('Reception');
  await expect(page.getByRole('textbox', { name: 'Port notes', exact: true })).toHaveValue('Desk 1, outlet R-01');
});
