import { test, expect } from '@playwright/test';
import { defaultProject } from '../src/project';
import { defaultConfiguration } from '../src/configuration';

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'desktop'} accordion checkboxes combine multiple VLANs and locations without resetting zoom`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const project = defaultProject({ ...defaultConfiguration(), facilityLocations: [
    { name: 'Lab', color: '#cc2255' }, { name: 'Office', color: '#2288aa' },
    ...Array.from({ length: 10 }, (_, i) => ({ name: `Room ${i + 1}`, color: '#8844aa' })),
  ] }, 'metric');
  const layout = project.locations[0].layout;
  layout.racks[0].equipment.find(e => e.id === 'PP-A04')!.templateId = 'netbox-generic-copper-24';
  layout.portDetails = {
    'CAB-A01/PP-A02/3': { facilityLocation: 'Lab', notes: '' },
    'CAB-A01/PP-A06/3': { facilityLocation: 'Office', notes: '' },
    'CAB-A01/PP-A04/18': { facilityLocation: 'Lab', notes: '' },
    'CAB-A01/PP-A04/24': { facilityLocation: 'Office', notes: 'Spare outlet' },
  };
  layout.portVlans!['CAB-A01/PP-A04/24'] = 10;
  await page.addInitScript(project => localStorage.setItem('porttracker.project', JSON.stringify(project)), project);
  await page.goto('/');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const zoom = await page.locator('.zoom-control span').textContent();
  const panel = page.getByRole('region', { name: 'View filters', exact: true });
  await expect(panel.getByRole('radio')).toHaveCount(0);
  await expect(panel.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Cable paths', exact: true })).toHaveCount(0);
  const ten = panel.getByRole('checkbox', { name: 'VLAN 10 — Management', exact: true });
  const twenty = panel.getByRole('checkbox', { name: 'VLAN 20 — Workstations', exact: true });
  const lab = panel.getByRole('checkbox', { name: 'Location — Lab', exact: true });
  const office = panel.getByRole('checkbox', { name: 'Location — Office', exact: true });
  await expect(panel.getByRole('checkbox', { name: 'Cables', exact: true })).toBeChecked();
  await expect(panel.getByRole('checkbox', { name: 'VLAN colors', exact: true })).toBeChecked();
  await expect(page.locator('.toolbar input[type="checkbox"]')).toHaveCount(0);
  await expect(page.locator('.port-vlan-marker, .port-location-marker')).toHaveCount(0);
  for (const region of ['VLAN filters', 'Facility location filters']) {
    const list = panel.getByRole('region', { name: region, exact: true });
    await expect(list).toHaveCSS('max-height', 'none');
    await expect(list).toHaveCSS('overflow-y', 'visible');
    expect(await list.evaluate(e => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  }
  const baseCount = layout.cables.filter(c => c.vlan === 10 || c.vlan === 20).length;
  const tenCount = layout.cables.filter(c => c.vlan === 10).length;
  await ten.check(); await twenty.check();
  await expect(page.locator('.cable-group')).toHaveCount(baseCount);
  await lab.check(); await office.check();
  await expect(page.locator('.cable-group')).toHaveCount(baseCount + 1);
  const spare = page.locator('[data-port="CAB-A01/PP-A04/24"]');
  await expect(page.locator('[data-port="CAB-A01/PP-A02/3"] .port-location-marker')).toHaveAttribute('stroke', '#cc2255');
  await expect(page.locator('[data-port="CAB-A01/PP-A06/3"] .port-location-marker')).toHaveAttribute('stroke', '#2288aa');
  await expect(spare.locator('.port-location-marker')).toHaveAttribute('stroke', '#2288aa');
  await expect(spare.locator('.port-vlan-marker')).toHaveAttribute('stroke', '#159de7');
  await expect(page.locator('[data-port="CAB-A01/PP-A04/18"] .port-location-marker')).toHaveAttribute('stroke', '#cc2255');
  await expect(page.locator('[data-port="CAB-A01/PP-A04/18"] .port-vlan-marker')).toHaveCount(0);
  const ringWidths = await spare.evaluate(e => ['.port-vlan-marker', '.port-location-marker'].map(selector => (e.querySelector(selector) as SVGRectElement).width.baseVal.value));
  expect(ringWidths[1]).toBeGreaterThan(ringWidths[0]);
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.getByRole('button', { name: 'Port 24, available', exact: true }).click();
  const grid = page.locator('[data-grid-port="CAB-A01/PP-A04/24"]');
  await expect(grid).toHaveCSS('border-top-color', 'rgb(34, 136, 170)');
  await expect(grid).toHaveCSS('border-bottom-color', 'rgb(21, 157, 231)');
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await expect(spare.locator('.port-location-marker')).toHaveAttribute('stroke', '#2288aa');
  await expect(spare.locator('.port-vlan-marker')).toHaveAttribute('stroke', '#159de7');
  await panel.getByRole('checkbox', { name: 'VLAN colors', exact: true }).uncheck();
  await expect(page.locator('.port-vlan-marker')).toHaveCount(0);
  await expect(spare.locator('.port-location-marker')).toHaveCount(1);
  await panel.getByRole('checkbox', { name: 'VLAN colors', exact: true }).check();
  await expect(spare.locator('.port-vlan-marker')).toHaveCount(1);
  await expect(page.locator('.zoom-control span')).toHaveText(zoom!);
  await panel.locator('summary').filter({ hasText: 'Locations' }).click();
  await expect(lab).not.toBeVisible();
  await expect(page.locator('.cable-group')).toHaveCount(baseCount + 1);
  await panel.locator('summary').filter({ hasText: 'Locations' }).click();
  await expect(lab).toBeChecked(); await expect(office).toBeChecked();
  await page.getByRole('tab', { name: 'Connections', exact: true }).click();
  await twenty.uncheck();
  await expect(page.locator('.cable-group')).toHaveCount(tenCount + 2);
  await lab.uncheck();
  await expect(page.locator('.cable-group')).toHaveCount(tenCount + 1);
  await expect(page.locator('[data-port="CAB-A01/PP-A02/3"] .port-location-marker')).toHaveCount(0);
  await expect(page.locator('[data-port="CAB-A01/PP-A02/3"] .port-vlan-marker')).toHaveCount(1);
  await panel.getByRole('checkbox', { name: 'Unassigned location', exact: true }).check();
  await expect(page.locator('.cable-group')).toHaveCount(32);
  await panel.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(panel.locator('.filter-choice input:checked')).toHaveCount(0);
  await expect(page.locator('.port-location-marker, .port-vlan-marker')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Select all VLANs', exact: true }).click();
  await expect(panel.locator('.vlan-list input:checked')).toHaveCount(8);
  await expect(panel.locator('.location-list input:checked')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Select all locations', exact: true }).click();
  await expect(panel.locator('.location-list input:checked')).toHaveCount(13);
  await panel.getByRole('button', { name: 'Clear VLAN selections', exact: true }).click();
  await expect(panel.locator('.vlan-list input:checked')).toHaveCount(0);
  await expect(panel.locator('.location-list input:checked')).toHaveCount(13);
  await panel.getByRole('button', { name: 'Clear location selections', exact: true }).click();
  await expect(page.locator('.port-location-marker, .port-vlan-marker')).toHaveCount(0);
  await panel.getByRole('checkbox', { name: 'Cables', exact: true }).uncheck();
  await panel.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(panel.locator('.filter-choice input:checked')).toHaveCount(21);
  await expect(page.locator('.cable-group')).toHaveCount(0);
  await expect(page.locator('.port-location-marker')).toHaveCount(1440);
  await expect(page.locator('.port-vlan-marker')).toHaveCount(1440);
  await panel.getByRole('checkbox', { name: 'Cables', exact: true }).check();
  await expect(page.locator('.cable-group')).toHaveCount(32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: `artifacts/view-filters-${mobile ? 'mobile' : 'desktop'}.png` });
  await panel.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(panel.locator('.filter-choice input:checked')).toHaveCount(0);
  await expect(page.locator('.cable-group')).toHaveCount(32);
  await expect(page.locator('.port-location-marker, .port-vlan-marker')).toHaveCount(0);
  await expect(page.locator('.zoom-control span')).toHaveText(zoom!);
});
