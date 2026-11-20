import { test, expect, type Page } from '@playwright/test';
import { defaultProject } from '../src/project';
import { defaultConfiguration } from '../src/configuration';

async function addLocation(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add facility location', exact: true }).click();
  await page.getByRole('textbox', { name: 'Location name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save facility location', exact: true }).click();
}

test('location CRUD, single and bulk assignment, filtering and renaming preserve notes and zoom', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/configuration/vlans');
  await page.getByRole('link', { name: 'Facility locations', exact: true }).click();
  await addLocation(page, 'West wing');
  await addLocation(page, 'Reception');
  await page.getByRole('button', { name: 'Add facility location', exact: true }).click();
  await page.getByRole('textbox', { name: 'Location name', exact: true }).fill('west WING');
  await page.getByRole('button', { name: 'Save facility location', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: 'Back to racks', exact: true }).click();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoom = await page.locator('.zoom-control span').textContent();
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('button', { name: 'Port 18, connected', exact: true }).click();
  await page.getByRole('combobox', { name: 'Facility location', exact: true }).selectOption('Reception');
  await page.getByRole('textbox', { name: 'Port notes', exact: true }).fill('Keep outlet label');
  await page.getByRole('checkbox', { name: 'Select multiple ports' }).check();
  for (const n of [18, 24]) await page.locator(`[data-grid-port="CAB-A01/PP-A04/${n}"]`).click();
  await page.getByRole('combobox', { name: 'Facility location action', exact: true }).selectOption('replace');
  await page.getByRole('combobox', { name: 'New facility location', exact: true }).selectOption('West wing');
  await page.getByRole('button', { name: 'Apply details to 2 ports', exact: true }).click();
  await page.getByRole('region', { name: 'Facility location filters' }).getByRole('checkbox', { name: 'Location — West wing', exact: true }).check();
  await expect(page.locator('.cable-group')).toHaveCount(1);
  await expect(page.locator('[data-port="CAB-A01/PP-A04/24"]')).toHaveAttribute('opacity', '1');
  await expect(page.locator('[data-port="CAB-A01/PP-A04/23"]')).toHaveAttribute('opacity', '0.3');
  await expect(page.locator('[data-grid-port="CAB-A01/PP-A04/23"]')).toHaveClass(/vlan-muted/);
  await page.getByRole('tab', { name: 'Connections', exact: true }).click();
  await page.getByRole('region', { name: 'Facility location filters' }).getByRole('link', { name: 'Configure locations', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove location West wing', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Edit location West wing', exact: true }).click();
  await page.getByRole('textbox', { name: 'Location name', exact: true }).fill('West offices');
  await page.getByLabel('Location color', { exact: true }).fill('#cc2255');
  await page.getByRole('button', { name: 'Save facility location', exact: true }).click();
  await page.getByRole('button', { name: 'Remove location Reception', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit location Reception', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to racks', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Location — West offices', exact: true })).toBeChecked();
  await expect(page.locator('[data-port="CAB-A01/PP-A04/24"] .port-location-marker')).toHaveAttribute('stroke', '#cc2255');
  await expect(page.locator('.zoom-control span')).toHaveText(zoom!);
  await expect(page.locator('.cable-group')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('combobox', { name: 'Facility location action', exact: true }).selectOption('clear');
  await page.getByRole('button', { name: 'Apply details to 2 ports', exact: true }).click();
  await expect(page.locator('.cable-group')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Select multiple ports' }).uncheck();
  await page.getByRole('button', { name: 'Port 18, connected', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Port notes', exact: true })).toHaveValue('Keep outlet label');
  await expect(page.getByRole('combobox', { name: 'Port VLAN', exact: true })).toHaveValue('30');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.cable-group')).toHaveCount(32);
  await page.getByRole('region', { name: 'Facility location filters' }).getByRole('link', { name: 'Configure locations', exact: true }).click();
  await page.getByRole('button', { name: 'Remove location West offices', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('table')).toContainText('No facility locations configured');
  expect(errors).toEqual([]);
});

test('legacy locations migrate and can be assigned to switch ports on mobile and restored from a backup', async ({ page }) => {
  const project = defaultProject(defaultConfiguration(), 'metric');
  project.locations[0].layout.portDetails = { 'CAB-A01/PP-A04/24': { facilityLocation: 'Room 214', notes: 'Legacy note' } };
  await page.addInitScript(project => { if (!localStorage.getItem('porttracker.project')) localStorage.setItem('porttracker.project', JSON.stringify(project)); }, project);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('button', { name: 'Port 24, available', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Facility location', exact: true })).toHaveValue('Room 214');
  await expect(page.getByRole('textbox', { name: 'Port notes', exact: true })).toHaveValue('Legacy note');
  await page.getByRole('combobox', { name: 'Browse equipment' }).selectOption('SW-A01');
  await page.getByRole('button', { name: 'Port 48, available', exact: true }).click();
  await page.getByRole('combobox', { name: 'Facility location', exact: true }).selectOption('Room 214');
  await page.getByRole('checkbox', { name: 'Select multiple ports' }).check();
  for (const n of [47, 48]) await page.getByRole('button', { name: `Port ${n}, available`, exact: true }).click();
  await page.getByRole('combobox', { name: 'Facility location action', exact: true }).selectOption('replace');
  await page.getByRole('combobox', { name: 'New facility location', exact: true }).selectOption('Room 214');
  await page.getByRole('button', { name: 'Apply details to 2 ports', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Port notes action', exact: true })).toHaveCount(0);
  await page.getByRole('region', { name: 'Facility location filters' }).getByRole('checkbox', { name: 'Location — Room 214', exact: true }).check();
  await expect(page.locator('.cable-group')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.view-filters-panel').screenshot({ path: 'artifacts/facility-location-filter-mobile.png' });
  const saved = await page.evaluate(() => localStorage.getItem('porttracker.project')!);
  await page.goto('/#/locations');
  await page.getByLabel('Project JSON file').setInputFiles({ name: 'locations.json', mimeType: 'application/json', buffer: Buffer.from(saved) });
  await page.getByRole('button', { name: 'Replace with imported project', exact: true }).click();
  await page.getByRole('button', { name: 'Open IDF-01', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Facility location filters' }).getByRole('checkbox', { name: 'Location — Room 214', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Facility location filters' }).getByRole('checkbox', { name: 'Location — Room 214', exact: true })).toBeVisible();
});

test('left filters switch socket outlines between location and VLAN colors on original and mapped equipment', async ({ page }) => {
  const project = defaultProject({ ...defaultConfiguration(), facilityLocations: [
    { name: 'Lab', color: '#cc2255' }, { name: 'Office', color: '#2288aa' },
  ] }, 'metric');
  project.locations[0].layout.portDetails = {
    'CAB-A01/PP-A04/24': { facilityLocation: 'Lab', notes: 'Spare outlet' },
    'CAB-A01/PP-A04/23': { facilityLocation: 'Office', notes: '' },
    'CAB-A01/SW-A01/48': { facilityLocation: 'Lab', notes: '' },
  };
  project.locations[0].layout.portVlans!['CAB-A01/PP-A04/24'] = 99;
  project.locations[0].layout.racks[0].equipment.find(e => e.id === 'PP-A04')!.templateId = 'netbox-generic-copper-24';
  await page.addInitScript(project => {
    if (!localStorage.getItem('porttracker.project')) localStorage.setItem('porttracker.project', JSON.stringify(project));
  }, project);
  await page.goto('/');
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('button', { name: 'Port 24, available', exact: true }).click();
  const socket = page.locator('[data-port="CAB-A01/PP-A04/24"]');
  const gridPort = page.locator('[data-grid-port="CAB-A01/PP-A04/24"]');
  const filters = page.getByRole('region', { name: 'Facility location filters' });
  await expect(socket.locator('.port-vlan-marker')).toHaveCount(0);
  await filters.getByRole('checkbox', { name: 'Location — Lab', exact: true }).check();
  await expect(socket.locator('.port-location-marker')).toHaveAttribute('stroke', '#cc2255');
  await expect(page.locator('[data-port="CAB-A01/SW-A01/48"] .port-location-marker')).toHaveAttribute('stroke', '#cc2255');
  await expect(page.locator('[data-port="CAB-A01/PP-A04/23"] .port-location-marker')).toHaveCount(0);
  await expect(page.locator('.port-vlan-marker')).toHaveCount(0);
  await expect(gridPort).toHaveCSS('border-top-color', 'rgb(204, 34, 85)');
  await expect(gridPort).toHaveCSS('border-bottom-color', 'rgb(204, 34, 85)');
  await expect(page.locator('.port-key')).toContainText('Colored box = location');
  await page.getByRole('checkbox', { name: 'Cables', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'VLAN colors', exact: true }).uncheck();
  await expect(socket.locator('.port-location-marker')).toHaveAttribute('stroke', '#cc2255');
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await expect(socket.locator('.port-location-marker')).toHaveAttribute('stroke', '#cc2255');
  const centers = await socket.evaluate(e => {
    const center = (selector: string) => {
      const r = e.querySelector(selector) as SVGRectElement;
      return { x: r.x.baseVal.value + r.width.baseVal.value / 2, y: r.y.baseVal.value + r.height.baseVal.value / 2 };
    };
    return { hit: center('.port-hit'), outline: center('.port-location-marker') };
  });
  expect(centers.outline.x).toBeCloseTo(centers.hit.x, 3);
  expect(centers.outline.y).toBeCloseTo(centers.hit.y, 3);
  await filters.getByRole('checkbox', { name: 'Location — Lab', exact: true }).uncheck();
  await filters.getByRole('checkbox', { name: 'Location — Office', exact: true }).check();
  await expect(socket.locator('.port-location-marker')).toHaveCount(0);
  await expect(page.locator('[data-port="CAB-A01/PP-A04/23"] .port-location-marker')).toHaveAttribute('stroke', '#2288aa');
  await filters.getByRole('checkbox', { name: 'Location — Office', exact: true }).uncheck();
  await filters.getByRole('checkbox', { name: 'Unassigned location', exact: true }).check();
  await expect(page.locator('[data-port="CAB-A01/PP-A04/22"] .port-location-marker')).toHaveAttribute('stroke', '#91a4b5');
  await expect(socket.locator('.port-location-marker')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'VLAN colors', exact: true }).check();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('checkbox', { name: 'VLAN 99 — Servers', exact: true }).check();
  await expect(page.locator('.port-location-marker')).toHaveCount(0);
  await expect(socket.locator('.port-vlan-marker')).toHaveAttribute('stroke', '#8b9cac');
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await expect(gridPort).toHaveCSS('border-bottom-color', 'rgb(139, 156, 172)');
  await expect(page.locator('.port-key')).toContainText('Colored edge = selected VLAN');
  await expect(page.getByRole('combobox', { name: 'Facility location', exact: true })).toHaveValue('Lab');
  await expect(page.getByRole('textbox', { name: 'Port notes', exact: true })).toHaveValue('Spare outlet');
});
