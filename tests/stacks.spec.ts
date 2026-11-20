import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { stackProject } from './stack-fixture';
import type { Project } from '../src/project';

async function saved(page: Page): Promise<Project> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('porttracker.project')!));
}
async function seedProject(page: Page, project = stackProject()) {
  await page.addInitScript(project => {
    if (sessionStorage.getItem('stack-test-seeded')) return;
    localStorage.setItem('porttracker.project', JSON.stringify(project));
    sessionStorage.setItem('stack-test-seeded', 'yes');
  }, project);
  await page.goto('/#/cabinets');
}
async function openCreator(page: Page) {
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await page.getByRole('button', { name: 'Add equipment from template', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Equipment template', exact: true }).selectOption('custom-test-juniper');
  await dialog.getByRole('textbox', { name: 'Equipment label', exact: true }).fill('Access switch');
  await dialog.getByRole('combobox', { name: 'Stack membership', exact: true }).selectOption('create');
  await dialog.getByRole('textbox', { name: 'Stack name', exact: true }).fill('IDF Access');
  return dialog;
}

test('create stack previews all members, supports mixed racks/templates, persists and exports names', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await seedProject(page);
  const before = await saved(page);
  const dialog = await openCreator(page);
  await dialog.getByRole('spinbutton', { name: 'Number of members', exact: true }).fill('4');
  await dialog.getByRole('button', { name: 'Preview stack', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Switch name 1', exact: true })).toHaveValue('Access switch-0');
  await expect(dialog.getByRole('textbox', { name: 'Switch name 4', exact: true })).toHaveValue('Access switch-3');
  await expect(dialog.getByRole('spinbutton', { name: 'Member bottom unit 1', exact: true })).toHaveValue('17');
  await expect(dialog.getByRole('spinbutton', { name: 'Member bottom unit 4', exact: true })).toHaveValue('14');
  await expect(dialog.getByRole('region', { name: 'Stack placement preview' })).toContainText('ge-3/0/0');
  await dialog.getByRole('spinbutton', { name: 'Member number 2', exact: true }).fill('0');
  await expect(dialog.getByRole('button', { name: 'Create stack', exact: true })).toBeDisabled();
  await expect(dialog).toContainText('already assigned');
  expect((await saved(page)).locations[0].layout.stacks).toBeUndefined();
  await dialog.getByRole('spinbutton', { name: 'Member number 2', exact: true }).fill('1');
  await dialog.getByRole('combobox', { name: 'Member template 4', exact: true }).selectOption('custom-test-juniper-2u');
  await dialog.getByRole('combobox', { name: 'Member rack 4', exact: true }).selectOption('CAB-A02');
  await dialog.getByRole('spinbutton', { name: 'Member bottom unit 4', exact: true }).fill('16');
  await dialog.getByRole('textbox', { name: 'Switch name 4', exact: true }).fill('Access switch B');
  await page.screenshot({ path: 'artifacts/stack-preview-desktop.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Create stack', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const after = await saved(page), layout = after.locations[0].layout;
  const members = layout.racks.flatMap(r => r.equipment.filter(e => e.stack));
  expect(members).toHaveLength(4);
  expect(layout.cables).toEqual(before.locations[0].layout.cables);
  expect(layout.portVlans).toEqual(before.locations[0].layout.portVlans);
  expect(layout.racks[1].equipment.find(e => e.label === 'Access switch B')?.heightU).toBe(2);
  await page.getByRole('link', { name: 'Data view', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Data view', exact: true })).toBeVisible();
  await page.getByRole('tablist', { name: 'Data view tables' }).getByRole('tab', { name: 'Ports', exact: true }).click();
  const ports = page.getByRole('tabpanel', { name: 'Ports', exact: true });
  await ports.getByRole('combobox', { name: 'Stack', exact: true }).selectOption(`idf-01/${layout.stacks![0].id}`);
  await expect(ports.getByRole('status')).toHaveText('192 of 1632 ports');
  await ports.getByRole('searchbox', { name: 'Search ports', exact: true }).fill('ge-3/0/23');
  await expect(ports.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await expect(ports.locator('.data-cell-interfaceName')).toHaveText('ge-3/0/23');
  await expect(ports.locator('.data-cell-sourceInterface')).toHaveText('ge-0/0/23');
  const downloadPromise = page.waitForEvent('download');
  await ports.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const csv = await readFile((await (await downloadPromise).path())!, 'utf8');
  expect(csv).toContain('"IDF Access"');
  expect(csv).toContain('"ge-3/0/23"');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Data view', exact: true })).toBeVisible();
  expect((await saved(page)).locations[0].layout).toEqual(layout);
  expect(errors).toEqual([]);
});

test('creating a stack reuses an old empty group name and survives reload', async ({ page }) => {
  const project = stackProject();
  project.locations[0].layout.stacks = [{ id: 'stale-empty-stack', name: 'IDF Access', managementAddress: '', interfaceNaming: 'juniper' }];
  await seedProject(page, project);
  const dialog = await openCreator(page);
  await dialog.getByRole('button', { name: 'Preview stack', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Create stack', exact: true })).toBeEnabled();
  // Preview validation must not change the user's saved project.
  expect((await saved(page)).locations[0].layout.stacks![0].id).toBe('stale-empty-stack');
  await dialog.getByRole('button', { name: 'Create stack', exact: true }).click();
  await page.reload();
  const layout = (await saved(page)).locations[0].layout;
  expect(layout.stacks).toHaveLength(1);
  expect(layout.stacks![0].name).toBe('IDF Access');
  expect(layout.stacks![0].id).not.toBe('stale-empty-stack');
  expect(layout.racks.flatMap(r => r.equipment).filter(e => e.stack?.stackId === layout.stacks![0].id)).toHaveLength(2);
});

test('stack setup flags insufficient space, joins existing switches and preserves assignments on renumber', async ({ page }) => {
  await seedProject(page);
  const dialog = await openCreator(page);
  await dialog.getByRole('spinbutton', { name: 'Number of members', exact: true }).fill('2');
  await dialog.getByRole('spinbutton', { name: 'Bottom rack unit', exact: true }).fill('1');
  await dialog.getByRole('button', { name: 'Preview stack', exact: true }).click();
  await expect(dialog.getByRole('spinbutton', { name: 'Member bottom unit 2', exact: true })).toHaveValue('0');
  await expect(dialog.getByRole('button', { name: 'Create stack', exact: true })).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Member rack 2', exact: true }).selectOption('CAB-A02');
  await dialog.getByRole('spinbutton', { name: 'Member bottom unit 2', exact: true }).fill('17');
  await dialog.getByRole('button', { name: 'Create stack', exact: true }).click();
  await page.reload();
  const layout = (await saved(page)).locations[0].layout;
  expect(layout.stacks?.[0].name).toBe('IDF Access');
  await page.getByRole('tab', { name: 'Equipment', exact: true }).click();
  await page.getByRole('combobox', { name: 'Manage rack', exact: true }).selectOption('CAB-A01');
  await page.getByRole('combobox', { name: 'Manage equipment', exact: true }).selectOption('SW-A01');
  await page.getByRole('button', { name: 'Stack / Virtual Chassis', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('combobox', { name: 'Stack membership', exact: true }).selectOption(layout.stacks![0].id);
  await expect(editor.getByRole('spinbutton', { name: 'Member number', exact: true })).toHaveValue('2');
  await editor.getByRole('button', { name: 'Save stack membership', exact: true }).click();
  const joined = (await saved(page)).locations[0].layout;
  expect(joined.cables).toEqual(layout.cables);
  expect(joined.portVlans).toEqual(layout.portVlans);
  await page.getByRole('button', { name: 'Stack / Virtual Chassis', exact: true }).click();
  await editor.getByRole('spinbutton', { name: 'Member number', exact: true }).fill('1');
  await expect(editor.getByRole('button', { name: 'Save stack membership', exact: true })).toBeDisabled();
  await editor.getByRole('spinbutton', { name: 'Member number', exact: true }).fill('5');
  await editor.getByRole('button', { name: 'Save stack membership', exact: true }).click();
  expect((await saved(page)).locations[0].layout.cables).toEqual(joined.cables);
  await page.getByRole('button', { name: 'Stack / Virtual Chassis', exact: true }).click();
  await editor.getByRole('combobox', { name: 'Stack membership', exact: true }).selectOption('standalone');
  await editor.getByRole('button', { name: 'Save stack membership', exact: true }).click();
  expect((await saved(page)).locations[0].layout.racks[0].equipment.find(e => e.id === 'SW-A01')!.stack).toBeUndefined();
  await page.getByRole('button', { name: 'Add equipment from template', exact: true }).click();
  await editor.getByRole('combobox', { name: 'Equipment template', exact: true }).selectOption('custom-test-juniper');
  await editor.getByRole('combobox', { name: 'Stack membership', exact: true }).selectOption(layout.stacks![0].id);
  await expect(editor.getByRole('spinbutton', { name: 'Member number', exact: true })).toHaveValue('2');
  await editor.getByRole('button', { name: 'Place equipment', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const extended = (await saved(page)).locations[0].layout;
  expect(extended.racks.flatMap(r => r.equipment).filter(e => e.stack)).toHaveLength(3);
  expect(extended.cables).toEqual(joined.cables);
});

test('stack placement preview is usable on mobile and cancellation leaves no stack', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(project => localStorage.setItem('porttracker.project', JSON.stringify(project)), stackProject());
  await page.goto('/#/cabinets');
  const dialog = await openCreator(page);
  await dialog.getByRole('button', { name: 'Preview stack', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Create stack', exact: true })).toBeEnabled();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/stack-preview-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await saved(page)).locations[0].layout.stacks).toBeUndefined();
});
