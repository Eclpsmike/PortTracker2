import { test, expect } from '@playwright/test';
import { defaultProject } from '../src/project';
import { defaultConfiguration } from '../src/configuration';

test('switch location matches the patch card and follows panel edits, reload and disconnection', async ({ page }) => {
  const project = defaultProject({ ...defaultConfiguration(), facilityLocations: [
    { name: 'Office 202', color: '#159de7' }, { name: 'COM B', color: '#159de7' }, { name: 'Old location', color: '#159de7' },
  ] }, 'metric');
  project.locations[0].layout.portDetails = {
    'CAB-A01/PP-A04/18': { facilityLocation: 'Office 202', notes: 'Panel note' },
    'CAB-A02/SW-B01/18': { facilityLocation: 'Old location', notes: '' },
  };
  await page.addInitScript(project => {
    if (!localStorage.getItem('porttracker.project')) localStorage.setItem('porttracker.project', JSON.stringify(project));
  }, project);
  await page.goto('/');await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  const panel = page.locator('[data-port="CAB-A01/PP-A04/18"]');
  const switchPort = page.locator('[data-port="CAB-A02/SW-B01/18"]');
  const location = page.getByRole('combobox', { name: 'Facility location', exact: true });
  const card = page.getByRole('region', { name: 'Selected port details', exact: true });
  const patchLocation = card.locator('dl > div').filter({ hasText: /^Patch location/ }).locator('dd');
  await switchPort.press('Enter');
  await expect(page.getByRole('region', { name: 'Port location assignment', exact: true })).toHaveCount(0);
  await expect(location).toHaveCount(0);
  await expect(card).toContainText('Office 202');await expect(card).not.toContainText('Panel note');
  await page.locator('[data-port="CAB-A02/SW-B01/48"]').press('Control+Enter');
  await expect(page.getByRole('region', { name: 'Bulk port location assignment', exact: true })).toHaveCount(0);
  await switchPort.press('Enter');await panel.press('Control+Enter');
  await page.getByRole('combobox', { name: 'Facility location action', exact: true }).selectOption('replace');
  await page.getByRole('combobox', { name: 'New facility location', exact: true }).selectOption('COM B');
  await page.getByRole('button', { name: 'Apply details to 1 port', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Selected ports', exact: true }).locator('tbody tr td:nth-child(3)')).toHaveText(['COM B', 'COM B']);
  await panel.press('Enter');await expect(location).toBeEnabled();await location.selectOption('');
  await switchPort.press('Enter');await expect(patchLocation).toHaveText('Unassigned');
  await panel.press('Enter');await location.selectOption('Office 202');
  await page.reload();await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await switchPort.press('Enter');await expect(patchLocation).toHaveText('Office 202');
  await page.getByRole('button', { name: 'View connection', exact: true }).click();
  await page.getByRole('button', { name: 'Edit connection', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await switchPort.press('Enter');await expect(location).toHaveCount(0);await expect(patchLocation).toHaveText('Unassigned');
  await expect(card).not.toContainText('Office 202');await expect(card).not.toContainText('Old location');
});
