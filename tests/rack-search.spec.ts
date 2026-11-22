import { test, expect } from '@playwright/test';
import { stackProject } from './stack-fixture';

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'desktop'} rack search opens equipment, prefixed ports, interfaces and hidden connections`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const project = stackProject();
  project.configuration.facilityLocations = [{ name: 'Office 202', color: '#159de7' }];
  project.locations[0].portPrefix = 'B';
  project.locations[0].layout = {
    racks: [
      { id: 'A', label: 'Rack A', heightU: 12, positionM: 0, equipment: [{ id: 'P1', label: 'Shipping panel', kind: 'patch-panel', heightU: 1, bottomU: 10, portCount: 4 }] },
      { id: 'B', label: 'Rack B', heightU: 12, positionM: .85, equipment: [{ id: 'SW-001', label: 'Core switch', kind: 'switch', heightU: 1, bottomU: 2, portCount: 48, portStart: 0, templateId: 'custom-test-juniper' }] },
    ],
    cables: [{ id: 'CBL-0001', from: { rackId: 'A', equipmentId: 'P1', port: 1 }, to: { rackId: 'B', equipmentId: 'SW-001', port: 0 }, vlan: 10, jacket: '#159de7' }],
    portVlans: { 'B/SW-001/0': 99 },
    portDetails: { 'A/P1/1': { facilityLocation: 'Office 202', notes: 'North wall' } },
  };
  if (mobile) {
    const cable = project.locations[0].layout.cables[0];
    [cable.from, cable.to] = [cable.to, cable.from];
  }
  await page.addInitScript(project => { localStorage.setItem('porttracker.project', JSON.stringify(project)); }, project);
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search rack workspace', exact: true });
  const section = page.getByRole('region', { name: 'Search rack workspace', exact: true });
  const searchBox = await search.boundingBox(), tabs = await page.getByRole('tablist', { name: 'Inspector', exact: true }).boundingBox();
  expect(searchBox!.y + searchBox!.height).toBeLessThan(tabs!.y);
  await search.fill('b001');
  await section.locator('[data-search-result="port/A/P1/1"]').click();
  await expect(page.getByRole('tab', { name: 'Ports', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Selected port details', exact: true })).toContainText('Shipping panel / Port B001');
  await expect(search).toHaveValue('');
  await page.getByRole('button', { name: 'Single rack', exact: true }).click();
  await page.getByRole('combobox', { name: 'Visible rack', exact: true }).selectOption('A');
  await page.getByRole('button', { name: 'Select all VLANs', exact: true }).click();
  await search.fill('0/0/0');await search.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Visible rack', exact: true })).toHaveValue('B');
  const port = page.locator('[data-port="B/SW-001/0"]');
  await expect(port).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeDisabled();
  const visible = await port.evaluate(element => {
    const target = element.getBoundingClientRect(), viewport = document.querySelector('.rack-viewport')!.getBoundingClientRect();
    return target.bottom > viewport.top && target.top < viewport.bottom && target.right > viewport.left && target.left < viewport.right;
  });
  expect(visible).toBe(true);
  await search.fill('north wall');await expect(section.locator('[data-search-result="port/A/P1/1"]')).toBeVisible();
  await search.fill('office 202');await expect(section.locator('[data-search-result="port/B/SW-001/0"]')).toBeVisible();
  await search.fill('SW-001');await section.locator('[data-search-result="equipment/B/SW-001"]').click();
  await expect(page.getByRole('tab', { name: 'Equipment', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: 'Label name', exact: true })).toHaveValue('Core switch');
  await page.getByRole('checkbox', { name: 'Cables', exact: true }).uncheck();
  await search.fill('CBL-0001');await search.press('Enter');
  await expect(page.getByRole('tab', { name: 'Connections', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.connection-endpoints')).toHaveText(mobile ? 'ge-0/0/0 ↔ B001' : 'B001 ↔ ge-0/0/0');
  await expect(page.locator('.connection-panel')).not.toContainText('CBL-0001');
  await expect(page.locator('.connection-details > div').filter({ has: page.locator('dt', { hasText: /^VLAN$/ }) }).locator('dd')).toHaveText('99 — Servers');
  const endpoints = page.locator('.connection-details > div');
  await expect(endpoints.filter({ has: page.locator('dt', { hasText: mobile ? /^To$/ : /^From$/ }) }).locator('strong')).toHaveText('Shipping panel / Port B001');
  await expect(endpoints.filter({ has: page.locator('dt', { hasText: mobile ? /^From$/ : /^To$/ }) }).locator('strong')).toHaveText('Core switch / Port 0/0/0');
  await expect(page.locator('.path-caption')).toContainText('Shipping panel:B001');
  await expect(page.getByRole('checkbox', { name: 'Cables', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Multiple racks', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await search.fill('nothing matches here');await expect(section.getByRole('status')).toHaveText('No matching items');
  await search.press('Escape');await expect(search).toHaveValue('');
  await search.fill('B001');await page.getByRole('button', { name: 'Clear rack search', exact: true }).click();
  await expect(search).toHaveValue('');
});
