import { test, expect, type Page } from '@playwright/test';
import { defaultProject, type Project } from '../src/project';
import { defaultConfiguration } from '../src/configuration';
import { estimateCable, type Cable } from '../src/model';
import { formatCableLengthValue, cableLengthUnitSymbol } from '../src/units';

function fixture(fiber = false) {
  const project = defaultProject(defaultConfiguration(), 'imperial');
  project.configuration.stockedLengthsM = [.5, 1, 2, 3, 5, 10];
  project.configuration.fiberStock = [
    { lengthM: .1, mode: 'single-mode', fromConnector: 'LC', toConnector: 'LC', strands: 2, jacket: '#f3cf19' },
    { lengthM: 5, mode: 'single-mode', fromConnector: 'LC', toConnector: 'LC', strands: 2, jacket: '#f3cf19' },
  ];
  project.locations[0].portPrefix = 'B';
  project.locations[0].layout = {
    racks: [
      { id: 'A', label: 'Rack A', heightU: 12, positionM: 0, equipment: [
        { id: 'P1', label: 'P1', kind: 'patch-panel', bottomU: 10, heightU: 1, portCount: 4 },
        { id: 'SW1', label: 'SW1', kind: 'switch', bottomU: 2, heightU: 1, portCount: 4 },
      ] },
      { id: 'B', label: 'Rack B', heightU: 12, positionM: .85, equipment: [{ id: 'SW2', label: 'SW2', kind: 'switch', bottomU: 10, heightU: 1, portCount: 4 }] },
    ], cables: [],
    ...(fiber && { portMedia: {
      'A/P1/1': { kind: 'fiber' as const, connector: 'LC' as const, mode: 'single-mode' as const, strands: 2 },
      'A/SW1/1': { kind: 'fiber' as const, connector: 'LC' as const, mode: 'single-mode' as const, strands: 2 },
      'A/SW1/2': { kind: 'fiber' as const, connector: 'SC' as const, mode: 'single-mode' as const, strands: 2 },
      'A/SW1/3': { kind: 'fiber' as const, connector: 'LC' as const, mode: 'multimode' as const, strands: 2 },
    } }),
  };
  return project;
}
async function open(page: Page, project: Project) {
  await page.addInitScript(project => { if (!localStorage.getItem('porttracker.project')) localStorage.setItem('porttracker.project', JSON.stringify(project)); }, project);
  await page.goto('/');await page.getByRole('tab', { name: 'Ports', exact: true }).click();
  await page.locator('[data-port="A/P1/1"]').press('Enter');
  await page.locator('[data-port="A/SW1/1"]').press('Control+Enter');
  await page.getByRole('button', { name: 'Connect selected ports', exact: true }).click();
  return page.getByRole('dialog', { name: 'Create connection', exact: true });
}

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'desktop'} routing preview updates endpoints and recommends the calibrated stocked length before saving`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const project = fixture();
  const dialog = await open(page, project);
  const preview = page.getByRole('region', { name: 'Cable routing suggestion', exact: true });
  const length = (label: string) => preview.locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');
  const cable: Cable = { id: 'CBL-0001', from: { rackId: 'A', equipmentId: 'P1', port: 1 }, to: { rackId: 'A', equipmentId: 'SW1', port: 1 }, vlan: 30, jacket: '#159de7' };
  const format = (value: number) => `${formatCableLengthValue(value, project.preferences.lengthUnit)} ${cableLengthUnitSymbol(project.preferences.lengthUnit)}`;
  const estimate = () => estimateCable(project.locations[0].layout, cable, { ...project.locations[0].calibration, stockedLengthsM: project.configuration.stockedLengthsM });
  await expect(preview.locator('.path-diagram')).toBeVisible();
  const settingsBox = await dialog.locator('.connection-editor-settings').boundingBox(), previewBox = await preview.boundingBox();
  if (mobile) expect(settingsBox!.y).toBeGreaterThanOrEqual(previewBox!.y + previewBox!.height);
  else {
    expect(settingsBox!.x).toBeGreaterThan(previewBox!.x + previewBox!.width);
    expect(Math.abs(previewBox!.y - settingsBox!.y)).toBeLessThan(2);
  }
  await expect(preview).toContainText('B001 ↔ 1');
  await expect(preview).toContainText('Same rack');
  await expect(length('Estimated length')).toHaveText(format(estimate().requiredM));
  await expect(length('Patch cable needed')).toHaveText(format(estimate().recommendedM!));
  await expect(preview).toContainText('Copper patch cable · RJ45–RJ45');
  await dialog.getByRole('combobox', { name: 'To equipment', exact: true }).selectOption('P1');
  await expect(preview).toContainText('Choose two different ports');
  await expect(length('Patch cable needed')).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'To rack', exact: true }).selectOption('B');
  cable.to = { rackId: 'B', equipmentId: 'SW2', port: 1 };
  await expect(preview).toContainText('Cross-rack');await expect(preview).toContainText('overhead tray');
  await expect(length('Estimated length')).toHaveText(format(estimate().requiredM));
  await expect(length('Patch cable needed')).toHaveText(format(estimate().recommendedM!));
  await preview.scrollIntoViewIfNeeded();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/connection-route-preview-${mobile ? 'mobile' : 'desktop'}.png` });
  const unsaved = await page.evaluate(() => JSON.parse(localStorage.getItem('porttracker.project')!));
  expect(unsaved.locations[0].layout.cables).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Create connection', exact: true }).click();
  await page.getByRole('button', { name: 'Edit connection', exact: true }).click();
  await expect(length('Patch cable needed')).toHaveText(format(estimate().recommendedM!));
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('fiber routing preview checks connectors, strands and compatible stock', async ({ page }) => {
  const errors: string[] = [];page.on('pageerror', error => errors.push(error.message));
  const dialog = await open(page, fixture(true));
  const preview = page.getByRole('region', { name: 'Cable routing suggestion', exact: true });
  await expect(dialog.getByRole('combobox', { name: 'Cable color', exact: true })).toHaveValue('#159de7');
  await dialog.getByRole('combobox', { name: 'Cable color', exact: true }).selectOption('#f3cf19');
  await expect(preview).toContainText('16.40 ft');
  await expect(preview).toContainText('Fiber patch cable · Single-mode · LC–LC · 2 strands');
  await expect(dialog.getByRole('combobox', { name: 'Cable medium', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Logical VLAN', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'From connector', exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'To port', exact: true }).selectOption('2');
  await expect(preview).toContainText('LC–SC');
  await expect(preview).toContainText('No suitable stocked length');
  await dialog.getByRole('combobox', { name: 'To port', exact: true }).selectOption('3');
  await expect(preview).toContainText('To port fiber mode does not match the cable.');
  await expect(preview).not.toContainText('Patch cable needed');
  await dialog.getByRole('combobox', { name: 'To port', exact: true }).selectOption('1');
  await dialog.getByRole('combobox', { name: 'Cable color', exact: true }).selectOption('#159de7');
  await expect(preview).toContainText('No suitable stocked length');
  await expect(preview).toContainText('A compatible cable of at least');
  await dialog.getByRole('combobox', { name: 'From port', exact: true }).selectOption('4');
  await dialog.getByRole('combobox', { name: 'To port', exact: true }).selectOption('4');
  await expect(preview).toContainText('Copper patch cable');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(errors).toEqual([]);
});
