import { test, expect } from '@playwright/test';
import { defaultProject } from '../src/project';
import { defaultConfiguration } from '../src/configuration';

test('rack cable colors and route preview follow live VLAN edits, filters and reload', async ({ page }) => {
  const project = defaultProject(defaultConfiguration(), 'metric');
  project.configuration.vlans.find(vlan => vlan.id === 10)!.color = '#123abc';
  project.locations[0].layout = {
    racks: [{ id: 'R1', label: 'Rack A', heightU: 12, positionM: 0, equipment: [
      { id: 'P1', label: 'Panel 1', kind: 'patch-panel', bottomU: 4, heightU: 1, portCount: 4 },
      { id: 'SW1', label: 'Switch 1', kind: 'switch', bottomU: 2, heightU: 1, portCount: 4 },
    ] }],
    cables: [{ id: 'CBL-0001', from: { rackId: 'R1', equipmentId: 'P1', port: 1 }, to: { rackId: 'R1', equipmentId: 'SW1', port: 1 }, vlan: 30, jacket: '#ffffff' }],
    portVlans: { 'R1/SW1/1': 10 },
  };
  await page.addInitScript(project => { if (!localStorage.getItem('porttracker.project')) localStorage.setItem('porttracker.project', JSON.stringify(project)); }, project);
  await page.goto('/');
  const cable = page.locator('.cable-group');
  const stroke = cable.locator(':scope > path').nth(1);
  const preview = page.locator('.path-diagram > path').nth(1);
  await expect(stroke).toHaveAttribute('stroke', '#123abc');
  await expect(preview).toHaveAttribute('stroke', '#123abc');
  const overlay = page.getByRole('checkbox', { name: 'VLAN colors', exact: true });
  await overlay.uncheck();
  await expect(stroke).toHaveAttribute('stroke', '#ffffff');
  await expect(preview).toHaveAttribute('stroke', '#ffffff');
  await overlay.check();
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.locator('[data-port="R1/SW1/1"]').press('Enter');
  const vlan = page.getByRole('combobox', { name: 'Port VLAN', exact: true });
  await vlan.selectOption('20');
  await expect(stroke).toHaveAttribute('stroke', '#31c94a');
  for (const end of await cable.locator(':scope > g > rect').all()) await expect(end).toHaveAttribute('fill', '#31c94a');
  await page.getByRole('checkbox', { name: 'VLAN 20 — Workstations', exact: true }).check();
  await expect(cable).toHaveCount(1);
  await vlan.selectOption('10');
  await expect(cable).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(stroke).toHaveAttribute('stroke', '#123abc');
  await vlan.selectOption('20');
  await page.getByRole('button', { name: 'View connection', exact: true }).click();
  await expect(preview).toHaveAttribute('stroke', '#31c94a');
  await page.reload();
  await expect(stroke).toHaveAttribute('stroke', '#31c94a');
  await expect(preview).toHaveAttribute('stroke', '#31c94a');
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.locator('[data-port="R1/SW1/1"]').press('Enter');
  await vlan.selectOption('');
  await expect(stroke).toHaveAttribute('stroke', '#91a4b5');
  await page.getByRole('button', { name: 'View connection', exact: true }).click();
  await expect(preview).toHaveAttribute('stroke', '#91a4b5');
});

test('switch-to-switch connection shows each endpoint VLAN, including unassigned', async ({ page }) => {
  const project = defaultProject(defaultConfiguration(), 'metric');
  project.locations[0].layout = {
    racks: [{ id: 'R1', label: 'Rack A', heightU: 12, positionM: 0, equipment: [
      { id: 'SW1', label: 'Switch 1', kind: 'switch', bottomU: 2, heightU: 1, portCount: 4 },
      { id: 'SW2', label: 'Switch 2', kind: 'switch', bottomU: 3, heightU: 1, portCount: 4 },
    ] }],
    cables: [{ id: 'NEW-0001', from: { rackId: 'R1', equipmentId: 'SW1', port: 1 }, to: { rackId: 'R1', equipmentId: 'SW2', port: 1 }, vlan: 30, jacket: '#159de7' }],
    portVlans: { 'R1/SW1/1': 10, 'R1/SW2/1': 99 },
  };
  await page.addInitScript(project => { if (!localStorage.getItem('porttracker.project')) localStorage.setItem('porttracker.project', JSON.stringify(project)); }, project);
  await page.goto('/');
  const stroke = page.locator('.cable-group > path').nth(1);
  await expect(stroke).toHaveAttribute('stroke', '#91a4b5');
  const vlan = page.locator('.connection-details > div').filter({ has: page.locator('dt', { hasText: /^VLAN$/ }) }).locator('dd');
  await expect(vlan).toContainText('From: 10 — Management');
  await expect(vlan).toContainText('To: 99 — Servers');
  await expect(page.locator('.connection-panel')).not.toContainText('NEW-0001');
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.locator('[data-port="R1/SW2/1"]').press('Enter');
  await page.getByRole('combobox', { name: 'Port VLAN', exact: true }).selectOption('10');
  await expect(stroke).toHaveAttribute('stroke', '#159de7');
  await page.getByRole('combobox', { name: 'Port VLAN', exact: true }).selectOption('');
  await expect(stroke).toHaveAttribute('stroke', '#91a4b5');
  await page.getByRole('button', { name: 'View connection', exact: true }).click();
  await expect(vlan).toContainText('From: 10 — Management');
  await expect(vlan).toContainText('To: Unassigned');
  await page.reload();await expect(vlan).toContainText('To: Unassigned');
});
