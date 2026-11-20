import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, generate = true) {
  await page.goto('/#/configuration/templates');
  await page.getByRole('button', { name: 'Import template', exact: true }).click();
  await page.getByLabel('Device definition YAML').setInputFiles('public/equipment/netbox/24-port-copper-patch-panel.yaml');
  await page.getByLabel('Equipment image', { exact: true }).setInputFiles('public/equipment/netbox/generic-24-port-copper-patch-panel.front.png');
  await page.getByRole('button', { name: 'Continue to port mapping' }).click();
  await page.getByText('Start with a regular grid', { exact: true }).click();
  if (generate) await page.getByRole('button', { name: 'Generate port grid', exact: true }).click();
  await page.getByRole('button', { name: 'Drag select', exact: true }).click();
}
const positions = (page: Page) => page.locator('.template-map g[role="button"] rect').evaluateAll(nodes => nodes.map(n => [n.getAttribute('x'), n.getAttribute('y')]));
const selected = (page: Page) => page.locator('.grid-port-options input:checked').evaluateAll(nodes => nodes.map(n => Number(n.closest('[data-grid-choice]')!.getAttribute('data-grid-choice')) + 1));
async function marquee(page: Page, first: number, last: number, reverse = false, cancel = false, screenshot?: string) {
  await page.locator('.template-map').scrollIntoViewIfNeeded();
  const a = (await page.locator(`[data-map-index="${first - 1}"] rect`).boundingBox())!;
  const b = (await page.locator(`[data-map-index="${last - 1}"] rect`).boundingBox())!;
  const start = { x: a.x - 1, y: a.y - 1 }, end = { x: b.x + b.width + 1, y: b.y + b.height + 1 };
  await page.mouse.move(reverse ? end.x : start.x, reverse ? end.y : start.y);
  await page.mouse.down();
  await page.mouse.move(reverse ? start.x : end.x, reverse ? start.y : end.y, { steps: 8 });
  await expect(page.locator('.port-selection-marquee')).toBeVisible();
  if (screenshot) await page.screenshot({ path: screenshot });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.port-selection-marquee')).toHaveCount(0);
}

test('image drag selection replaces, adds, cancels and preserves socket coordinates', async ({ page }) => {
  await setup(page);
  const before = await positions(page);
  await marquee(page, 1, 3);
  expect(await selected(page)).toEqual([1, 2, 3]);
  await expect(page.locator('.template-map g[aria-pressed="true"]')).toHaveCount(3);
  await page.keyboard.down('Shift');
  await marquee(page, 5, 6);
  await page.keyboard.up('Shift');
  expect(await selected(page)).toEqual([1, 2, 3, 5, 6]);
  await marquee(page, 7, 8, true);
  expect(await selected(page)).toEqual([7, 8]);
  await marquee(page, 10, 12, false, true);
  expect(await selected(page)).toEqual([7, 8]);
  await page.getByRole('button', { name: 'Select mapped port 9', exact: true }).focus();
  await page.keyboard.press('Space');
  expect(await selected(page)).toEqual([7, 8, 9]);
  expect(await positions(page)).toEqual(before);
  await page.getByRole('button', { name: 'Place ports', exact: true }).click();
  const map = page.locator('.template-map');
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * .5, box.y + box.height * .8);
  const after = await positions(page);
  expect(after[0]).not.toEqual(before[0]);
  expect(after.slice(1)).toEqual(before.slice(1));
});

test('dragging across unmapped port choices checks or clears the visited ports', async ({ page }) => {
  await setup(page, false);
  await page.getByRole('button', { name: 'Clear grid selection', exact: true }).click();
  const dragChoices = async () => {
    const first = page.locator('[data-grid-choice="0"]'), last = page.locator('[data-grid-choice="2"]');
    await first.scrollIntoViewIfNeeded(); await last.scrollIntoViewIfNeeded();
    const a = (await first.boundingBox())!, b = (await last.boundingBox())!;
    await page.mouse.move(a.x + 12, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + 12, b.y + b.height / 2, { steps: 20 }); await page.mouse.up();
  };
  await dragChoices();
  expect(await selected(page)).toEqual([1, 2, 3]);
  await dragChoices();
  expect(await selected(page)).toEqual([]);
  await expect(page.getByRole('button', { name: 'Generate port grid', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Grid port 4 — Port 4', exact: true }).check();
  expect(await selected(page)).toEqual([4]);
});

test('touch marquee selects ports and supports adding without a keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const before = await positions(page);
  const client = await page.context().newCDPSession(page);
  const touchDrag = async (first: number, last: number) => {
    const map = page.locator('.template-map'); await map.scrollIntoViewIfNeeded();
    const a = (await page.locator(`[data-map-index="${first - 1}"] rect`).boundingBox())!;
    const b = (await page.locator(`[data-map-index="${last - 1}"] rect`).boundingBox())!;
    const start = { x: a.x - 1, y: a.y - 1 }, end = { x: b.x + b.width + 1, y: b.y + b.height + 1 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await touchDrag(1, 3);
  await expect.poll(() => selected(page)).toEqual([1, 2, 3]);
  await page.getByRole('checkbox', { name: 'Add to selection', exact: true }).check();
  await touchDrag(5, 6);
  await expect.poll(() => selected(page)).toEqual([1, 2, 3, 5, 6]);
  expect(await positions(page)).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('drag mode retains visible grid previews before sockets are mapped', async ({ page }) => {
  await setup(page, false);
  await expect(page.locator('.template-map [data-map-index]')).toHaveCount(24);
  await marquee(page, 1, 3);
  expect(await selected(page)).toEqual([1, 2, 3]);
  await expect(page.locator('.template-map [aria-pressed="true"]')).toHaveCount(3);
  await expect(page.locator('.mapping-preview-caption')).toContainText('0 / 24 ports mapped');
});

test('dragging directly on the image draws a box without first selecting a mode', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Place ports', exact: true }).click();
  const before = await positions(page);
  await marquee(page, 2, 5, false, false, 'artifacts/image-drag-selection.png');
  expect(await selected(page)).toEqual([2, 3, 4, 5]);
  await expect(page.getByRole('button', { name: 'Drag select', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await positions(page)).toEqual(before);
  await page.getByRole('button', { name: 'Place ports', exact: true }).click();
  await marquee(page, 7, 8, false, true);
  expect(await selected(page)).toEqual([2, 3, 4, 5]);
  expect(await positions(page)).toEqual(before);
});
