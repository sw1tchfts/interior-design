import { expect, type Page, test } from '@playwright/test';

const INCH = 0.0254;
const FOOT = 12 * INCH;

interface DebugOpening {
  id: string;
  type: string;
  wallId: string;
  offset: number;
  width: number;
  sill: number;
  swing: string;
}

interface DebugDoc {
  roomOrder: string[];
  rooms: Record<string, { vertices: { p: [number, number] }[]; openings: DebugOpening[] }>;
  layoutOrder: string[];
  layouts: Record<string, { itemOrder: string[]; items: Record<string, { transform: { x: number; z: number; rotationY: number } }> }>;
}

const getDoc = (page: Page) =>
  page.evaluate(() => (window as unknown as { __APP__: { doc: { getState(): { history: { present: unknown } | null } } } }).__APP__.doc.getState().history?.present) as Promise<DebugDoc>;

async function firstItem(page: Page) {
  const doc = await getDoc(page);
  const layout = doc.layouts[doc.layoutOrder[0]!]!;
  return { id: layout.itemOrder[0]!, ...layout.items[layout.itemOrder[0]!]!.transform };
}

async function roomPoints(page: Page) {
  const doc = await getDoc(page);
  return doc.rooms[doc.roomOrder[0]!]!.vertices.map((v) => v.p);
}

async function openings(page: Page) {
  const doc = await getDoc(page);
  return doc.rooms[doc.roomOrder[0]!]!.openings;
}

test('create a room, add furniture, drag, undo, edit walls and persist', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByPlaceholder('Smith living room').fill('E2E Room');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('plan-svg')).toBeVisible();
  await expect(page.getByTestId('scene-3d').locator('canvas')).toBeVisible();

  // Add a sofa; it appears selected in the properties panel.
  await page.getByTestId('add-sofa-84').click();
  await expect(page.getByLabel('Item name')).toHaveValue('Sofa 84"');
  const before = await firstItem(page);

  // Drag it in the plan; the move snaps to the 1" grid and is one undo step.
  const symbol = page.locator(`[data-item-id="${before.id}"]`);
  const box = (await symbol.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 4, box.y + box.height / 2 + i * 2);
  await page.mouse.up();
  const after = await firstItem(page);
  expect(after.x).toBeGreaterThan(before.x);
  expect(Math.abs(after.x / INCH - Math.round(after.x / INCH))).toBeLessThan(1e-6);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await firstItem(page)).x).toBeCloseTo(before.x, 9);
  await page.getByRole('button', { name: 'Redo' }).click();
  expect((await firstItem(page)).x).toBeCloseTo(after.x, 9);

  // Rotate with the keyboard.
  await symbol.click();
  await page.keyboard.press('r');
  expect((await firstItem(page)).rotationY).toBeCloseTo(Math.PI / 2, 6);

  // Edit wall A's length by clicking its dimension label.
  await page.getByTestId('wall-label-0').click();
  const wallInput = page.getByLabel('Length of wall A');
  await wallInput.fill(`15'6"`);
  await wallInput.press('Enter');
  const pts = await roomPoints(page);
  expect(Math.hypot(pts[1]![0] - pts[0]![0], pts[1]![1] - pts[0]![1])).toBeCloseTo(15.5 * FOOT, 6);

  // Persist and reload.
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 5000 });
  const saved = await firstItem(page);
  await page.reload();
  await expect(page.getByLabel('Project name')).toHaveValue('E2E Room');
  const reloaded = await firstItem(page);
  expect(reloaded.x).toBeCloseTo(saved.x, 9);
  expect(reloaded.rotationY).toBeCloseTo(saved.rotationY, 9);

  expect(errors).toEqual([]);
});

test('add doors and windows, slide and edit them, and persist', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('plan-svg')).toBeVisible();

  // A new door lands on a wall and opens in the properties panel.
  await page.getByTestId('add-door-30').click();
  await expect(page.getByLabel('Opening width')).toBeVisible();
  const [door] = await openings(page);
  expect(door!.type).toBe('door');
  expect(door!.width).toBeCloseTo(30 * INCH, 9);

  // Slide it along its (horizontal) wall: the offset snaps to the 1" grid and is one undo step.
  const box = (await page.locator(`[data-opening-id="${door!.id}"]`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 + i * 6, box.y + box.height / 2);
  await page.mouse.up();
  const moved = (await openings(page))[0]!;
  expect(moved.wallId).toBe(door!.wallId);
  expect(moved.offset).toBeGreaterThan(door!.offset);
  expect(Math.abs(moved.offset / INCH - Math.round(moved.offset / INCH))).toBeLessThan(1e-6);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await openings(page))[0]!.offset).toBeCloseTo(door!.offset, 9);

  // Edit it in the properties panel.
  const width = page.getByLabel('Opening width');
  await width.fill('36');
  await width.press('Enter');
  expect((await openings(page))[0]!.width).toBeCloseTo(36 * INCH, 9);
  await page.getByRole('button', { name: 'Outward' }).click();
  expect((await openings(page))[0]!.swing).toBe('out');

  // A window sits above the floor; the 3D view keeps rendering with both cut out.
  await page.getByTestId('add-window-36').click();
  const all = await openings(page);
  expect(all).toHaveLength(2);
  expect(all[1]!.sill).toBeGreaterThan(0);
  await expect(page.getByTestId('scene-3d').locator('canvas')).toBeVisible();

  await expect(page.getByTestId('save-status')).toHaveText('Saved', { timeout: 5000 });
  await page.reload();
  await expect(page.getByTestId('plan-svg')).toBeVisible();
  const reloaded = await openings(page);
  expect(reloaded.map((o) => o.type)).toEqual(['door', 'window']);
  expect(reloaded[0]!.swing).toBe('out');

  expect(errors).toEqual([]);
});

test('import a RoomPlan scan and pick a room', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByTestId('scan-file-input').setInputFiles('src/domain/scan/fixtures/openplan3d-apartment.json');
  const picker = page.getByTestId('scan-rooms');
  await expect(picker).toContainText('This scan has 3 rooms');
  await picker.getByRole('button', { name: /Bedroom 1/ }).click();

  await expect(page.getByTestId('plan-svg')).toBeVisible();
  await expect(page.getByLabel('Project name')).toHaveValue('openplan3d-apartment – Bedroom 1');
  const doc = await getDoc(page);
  const room = doc.rooms[doc.roomOrder[0]!]!;
  expect(room.vertices).toHaveLength(4);
  expect(room.openings.map((o) => o.type).sort()).toEqual(['door', 'window', 'window']);
  const layout = doc.layouts[doc.layoutOrder[0]!]!;
  expect(layout.itemOrder).toHaveLength(6);
  await expect(page.locator('[data-item-id]')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('draw a room outline by typing wall lengths', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByTestId('plan-svg')).toBeVisible();
  await page.getByTestId('tool-draw').click();

  const svg = (await page.getByTestId('plan-svg').boundingBox())!;
  await page.mouse.click(svg.x + svg.width / 2 - 150, svg.y + svg.height / 2 - 100);
  for (const [dx, dy, len] of [[1, 0, `10'`], [0, 1, `8'`], [-1, 0, `10'`]] as const) {
    // Point the rubber band along the wall from the last corner, then type its length.
    const last = (await page.getByTestId('draw-point').last().boundingBox())!;
    await page.mouse.move(last.x + last.width / 2 + dx * 120, last.y + last.height / 2 + dy * 120);
    await page.keyboard.type(len);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Enter'); // close the outline

  const pts = await roomPoints(page);
  expect(pts).toHaveLength(4);
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10 * FOOT, 6);
  expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(8 * FOOT, 6);
});
