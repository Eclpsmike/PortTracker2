import { test, expect } from '@playwright/test';
import { defaultProject } from '../src/project';
import { defaultConfiguration } from '../src/configuration';

for (const mapped of [false, true]) test(`${mapped ? 'image' : 'schematic'} port boxes follow live VLAN and location assignments only for checked filters`, async ({ page }) => {
  const project = defaultProject({ ...defaultConfiguration(), facilityLocations: [
    { name: 'COM B', color: '#cc2255' }, { name: 'Shipping', color: '#2288aa' },
  ] }, 'metric');
  project.locations[0].layout = {
    racks: [{ id: 'R1', label: 'Rack A', heightU: 12, positionM: 0, equipment: [
      { id: 'P1', label: 'Panel 1', kind: 'patch-panel', bottomU: 4, heightU: 1, portCount: 24, ...(mapped && { templateId: 'netbox-generic-copper-24' }) },
      { id: 'SW1', label: 'Switch 1', kind: 'switch', bottomU: 2, heightU: 1, portCount: 48, ...(mapped && { templateId: 'netbox-ubiquiti-us-48' }) },
    ] }],
    cables: [{ id: 'CBL-0001', from: { rackId: 'R1', equipmentId: 'P1', port: 1 }, to: { rackId: 'R1', equipmentId: 'SW1', port: 1 }, vlan: 30, jacket: '#ffffff' }],
    portVlans: { 'R1/SW1/1': 10, 'R1/P1/1': 30 },
    portDetails: { 'R1/P1/1': { facilityLocation: 'COM B', notes: '' }, 'R1/SW1/1': { facilityLocation: 'Shipping', notes: '' } },
  };
  await page.addInitScript(project => { if (!localStorage.getItem('porttracker.project')) localStorage.setItem('porttracker.project', JSON.stringify(project)); }, project);
  await page.goto('/');
  const panel = page.locator('[data-port="R1/P1/1"]');
  const switchPort = page.locator('[data-port="R1/SW1/1"]');
  async function colors(vlan: string | null, location: string | null) {
    for (const port of [panel, switchPort]) for (const [selector, color] of [['.port-vlan-marker', vlan], ['.port-location-marker', location]] as const) {
      if (color) await expect(port.locator(selector)).toHaveAttribute('stroke', color);
      else await expect(port.locator(selector)).toHaveCount(0);
    }
  }
  await colors(null, null);
  const ten = page.getByRole('checkbox', { name: 'VLAN 10 — Management', exact: true });
  const twenty = page.getByRole('checkbox', { name: 'VLAN 20 — Workstations', exact: true });
  const com = page.getByRole('checkbox', { name: 'Location — COM B', exact: true });
  const shipping = page.getByRole('checkbox', { name: 'Location — Shipping', exact: true });
  await ten.check();await com.check();
  await colors('#159de7', '#cc2255');
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await switchPort.press('Enter');
  await page.getByRole('combobox', { name: 'Port VLAN', exact: true }).selectOption('20');
  await colors(null, '#cc2255');
  await twenty.check();await colors('#31c94a', '#cc2255');
  await panel.press('Enter');
  await page.getByRole('combobox', { name: 'Facility location', exact: true }).selectOption('Shipping');
  await colors('#31c94a', null);
  await shipping.check();await colors('#31c94a', '#2288aa');
  await page.getByRole('checkbox', { name: 'VLAN colors', exact: true }).uncheck();
  await colors(null, '#2288aa');
  await page.getByRole('checkbox', { name: 'VLAN colors', exact: true }).check();
  await ten.uncheck();await com.uncheck();await colors('#31c94a', '#2288aa');
  await page.reload();
  await twenty.check();await shipping.check();await colors('#31c94a', '#2288aa');
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await switchPort.press('Enter');
  await page.getByRole('combobox', { name: 'Port VLAN', exact: true }).selectOption('');
  await panel.press('Enter');
  await page.getByRole('combobox', { name: 'Facility location', exact: true }).selectOption('');
  await colors(null, null);
  await page.getByRole('checkbox', { name: 'Unassigned VLAN', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Unassigned location', exact: true }).check();
  await colors('#91a4b5', '#91a4b5');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await colors(null, null);
});
