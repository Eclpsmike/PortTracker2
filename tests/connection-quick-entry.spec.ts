import { test, expect, type Page } from '@playwright/test';
import { stackProject } from './stack-fixture';

async function setup(page: Page, duplicate = false) {
  const project = stackProject();
  project.templates![0].ports = project.templates![0].ports.map((port, i) => ({ ...port, name: `ge-1/0/${i}` }));
  project.locations[0].portPrefix = 'B';
  project.locations[0].layout = {
    racks: [{ id: 'A', label: 'Rack A', heightU: 12, positionM: 0, equipment: [
      { id: 'P1', label: 'P1', kind: 'patch-panel', heightU: 1, bottomU: 10, portCount: 4, portStart: 449 },
      { id: 'SW1', label: 'SW1', kind: 'switch', heightU: 1, bottomU: 2, portCount: 48, portStart: 0, templateId: project.templates![0].id },
    ] }],
    cables: [{ id: 'CBL-0002', from: { rackId: 'A', equipmentId: 'SW1', port: 1 }, to: { rackId: 'A', equipmentId: 'P1', port: 449 }, vlan: 10, jacket: '#159de7' }],
    portVlans: { 'A/SW1/33': 99, 'A/SW1/34': 60 },
  };
  if (duplicate) project.locations[0].layout.racks.push({ id: 'B', label: 'Rack B', heightU: 12, positionM: .85, equipment: [
    { ...project.locations[0].layout.racks[0].equipment[1], id: 'SW2', label: 'SW2' },
    { ...project.locations[0].layout.racks[0].equipment[0], id: 'P2', label: 'P2' },
  ] });
  await page.addInitScript(project => { if (!localStorage.getItem('porttracker.project')) localStorage.setItem('porttracker.project', JSON.stringify(project)); }, project);
  await page.goto('/');
  return project;
}
const savedCables = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('porttracker.project')!).locations[0].layout.cables);

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'desktop'} quick entry saves multiple connections without closing or overwriting`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  const original = await setup(page);
  await page.getByRole('button', { name: 'New connection', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const from = dialog.getByRole('textbox', { name: 'Quick from port', exact: true });
  const to = dialog.getByRole('textbox', { name: 'Quick to port', exact: true });
  await from.fill('1/0/33');await from.press('Enter');await expect(to).toBeFocused();
  await to.fill('b450');
  await expect(dialog.getByRole('combobox', { name: 'From equipment', exact: true })).toHaveValue('SW1');
  await expect(dialog.getByRole('combobox', { name: 'From port', exact: true })).toHaveValue('33');
  await expect(dialog.getByRole('combobox', { name: 'To port', exact: true })).toHaveValue('450');
  await expect(dialog.locator('.connection-endpoints')).toHaveText('ge-1/0/33 ↔ B450');
  await dialog.getByRole('combobox', { name: 'Cable color', exact: true }).selectOption('#f3cf19');
  await dialog.getByRole('button', { name: 'Save and add another', exact: true }).click();
  await expect(dialog).toBeVisible();await expect(from).toBeFocused();await expect(from).toHaveValue('');
  await expect(dialog).toContainText('CBL-0001 saved.');
  await expect(dialog.getByRole('combobox', { name: 'From port', exact: true })).toHaveValue('34');
  await expect(dialog.getByRole('combobox', { name: 'To port', exact: true })).toHaveValue('451');
  await expect(dialog.getByRole('combobox', { name: 'Cable color', exact: true })).toHaveValue('#f3cf19');
  await dialog.getByRole('button', { name: 'Save and add another', exact: true }).click();
  await expect(dialog).toContainText('CBL-0003 saved.');
  await from.fill('ge-1/0/36');await to.fill('B452');
  await dialog.getByRole('button', { name: 'Create connection', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();const cables = await savedCables(page);
  expect(cables).toHaveLength(4);
  expect(cables.find((c: { id: string }) => c.id === 'CBL-0002')).toEqual(original.locations[0].layout.cables[0]);
  for (const [id, fromPort, toPort, vlan] of [['CBL-0001', 33, 450, 99], ['CBL-0003', 34, 451, 60], ['CBL-0004', 36, 452, null]] as const) {
    expect(cables.find((c: { id: string }) => c.id === id)).toMatchObject({ from: { equipmentId: 'SW1', port: fromPort }, to: { equipmentId: 'P1', port: toPort }, vlan, jacket: '#f3cf19' });
  }
});

test('ambiguous and occupied quick entries require an explicit valid selection', async ({ page }) => {
  await setup(page, true);
  await page.getByRole('button', { name: 'New connection', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const quick = dialog.getByRole('region', { name: 'Quick connection entry', exact: true });
  const from = dialog.getByRole('textbox', { name: 'Quick from port', exact: true });
  const to = dialog.getByRole('textbox', { name: 'Quick to port', exact: true });
  await from.fill('1/0/1');await expect(quick.getByRole('button', { name: /SW1.*Already connected/ })).toBeDisabled();
  await from.fill('1/0/33');await to.fill('B450');
  await dialog.getByRole('button', { name: 'Save and add another', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Choose a matching from port');
  expect(await savedCables(page)).toHaveLength(1);
  await quick.getByRole('button', { name: /1\/0\/33.*Rack A.*SW1/ }).click();
  await dialog.getByRole('button', { name: 'Create connection', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Choose a matching to port');
  await quick.getByRole('button', { name: /B450.*Rack A.*P1/ }).click();
  await to.fill('B999');await dialog.getByRole('button', { name: 'Save and add another', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Choose a matching to port');
  await to.fill('B450');await quick.getByRole('button', { name: /B450.*Rack A.*P1/ }).click();
  await dialog.getByRole('button', { name: 'Save and add another', exact: true }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  expect(await savedCables(page)).toHaveLength(2);
});

test('editing can save and add another without excluding the saved cable from occupancy', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Edit connection', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Quick from port', exact: true }).fill('1/0/1');
  await dialog.getByRole('textbox', { name: 'Quick to port', exact: true }).fill('B449');
  await dialog.getByRole('button', { name: 'Save and add another', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Create connection', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  await dialog.getByRole('textbox', { name: 'Quick from port', exact: true }).fill('1/0/1');
  await expect(dialog.getByRole('button', { name: /1\/0\/1.*Already connected/ })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  expect(await savedCables(page)).toHaveLength(1);
});
