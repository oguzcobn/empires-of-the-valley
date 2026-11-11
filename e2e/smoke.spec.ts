import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Browser smoke test for the Phase 1 acceptance scenario. It plays through the real UI
 * (canvas clicks, buttons, keyboard) and uses the ?debug=1 hook only to read state, locate
 * tiles on screen and fast-forward the same pure simulation the game loop runs.
 */
type Snapshot = {
  tick: number;
  speed: number;
  rngState: number;
  stocks: Record<string, number>;
  buildings: { id: string; definitionId: string; x: number; y: number; workers: number; state: string }[];
  quests: Record<string, { status: string }>;
  json: string;
};

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const g = (window as any).__EOV__.store.getState().game; // eslint-disable-line @typescript-eslint/no-explicit-any
    const p = g.provinces[g.homeProvinceId];
    return {
      tick: g.tick,
      speed: g.speed,
      rngState: g.rngState,
      stocks: p.stocks,
      buildings: p.buildings,
      quests: g.questProgress,
      json: JSON.stringify({ ...g, speed: 0 }),
    };
  });
}

async function clickTile(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(([tx, ty]) => (window as any).__EOV__.store.getState().focusOn(tx, ty), [x, y]); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.waitForTimeout(80);
  const pt = await page.evaluate(([tx, ty]) => (window as any).__EOV__.tilePoint(tx, ty), [x, y]); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.click(pt.x, pt.y);
}

const advance = (page: Page, ticks: number): Promise<void> =>
  page.evaluate((n) => (window as any).__EOV__.advance(n), ticks); // eslint-disable-line @typescript-eslint/no-explicit-any

test('phase 1: build, staff, produce, save, reload and continue', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('./?debug=1');
  await expect(page.getByRole('heading', { name: 'Empires of the Valley' })).toBeVisible();
  await expect(page.getByTestId('continue')).toBeDisabled();
  await page.getByTestId('new-campaign').click();
  await page.getByTestId('seed-input').fill('42');
  await page.getByTestId('start-game').click();
  await expect(page.getByText('Büyük Krallık çöktü')).toBeVisible();
  await page.getByTestId('intro-start').click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByTestId('quest-tracker')).toContainText('İlk Odun');

  // paused: nothing advances, nothing is consumed
  await page.waitForTimeout(1500);
  let s = await snapshot(page);
  expect(s.tick).toBe(0);
  expect(s.stocks.food).toBe(90000);
  expect(s.stocks.wood).toBe(160000);

  // invalid placement: on the town center and on water
  await page.keyboard.press('b');
  await page.getByTestId('build-hut').click();
  await clickTile(page, 11, 11);
  await expect(page.locator('.toast', { hasText: 'Burada başka bir yapı var.' })).toBeVisible();
  const water = await page.evaluate(() => {
    const g = (window as any).__EOV__.store.getState().game; // eslint-disable-line @typescript-eslint/no-explicit-any
    const i = g.provinces[g.homeProvinceId].tiles.findIndex(
      (t: { terrain: string }) => t.terrain === 'water',
    );
    return [i % 24, Math.floor(i / 24)];
  });
  await clickTile(page, water[0]!, water[1]!);
  await expect(page.locator('.toast', { hasText: 'Suyun üstüne inşa edilemez.' })).toBeVisible();
  expect((await snapshot(page)).stocks.wood).toBe(160000);

  // roads + lumber camp
  const plan = await page.evaluate(() => (window as any).__EOV__.plan('lumber_camp')); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.keyboard.press('r');
  for (const [x, y] of plan.roads) await clickTile(page, x, y);
  await page.keyboard.press('b');
  await page.keyboard.press('b');
  await page.getByTestId('build-lumber_camp').click();
  await clickTile(page, plan.x, plan.y);
  s = await snapshot(page);
  expect(s.stocks.wood).toBe(160000 - 30000 - plan.roads.length * 2000);
  const camp = s.buildings.at(-1)!;
  expect(camp).toMatchObject({ definitionId: 'lumber_camp', state: 'construction', x: plan.x, y: plan.y });
  await expect(page.getByTestId('inspector')).toContainText('Oduncu Kampı');

  // construction takes 3 in-game days
  await advance(page, 72);
  await expect(page.getByTestId('inspector')).toContainText('İşçi yok');
  await expect(page.getByTestId('quest-tracker')).toContainText('Çalışan Eller');

  // assign exactly two workers; the third is impossible
  await page.getByTestId('worker-plus').click();
  await page.getByTestId('worker-plus').click();
  await expect(page.getByTestId('worker-count')).toContainText('2 / 2');
  await expect(page.getByTestId('worker-plus')).toBeDisabled();
  await expect(page.getByTestId('res-population')).toContainText('6');

  // unpause at 4x: real time now produces wood and consumes food
  const before = await snapshot(page);
  await page.keyboard.press('3');
  await expect
    .poll(async () => (await snapshot(page)).tick, { timeout: 15000 })
    .toBeGreaterThanOrEqual(before.tick + 24);
  await page.keyboard.press('Space');
  const after = await snapshot(page);
  expect(after.speed).toBe(0);
  expect(after.stocks.wood).toBeGreaterThan(before.stocks.wood);
  expect(after.stocks.food).toBeLessThan(before.stocks.food);
  await page.screenshot({ path: 'test-results/phase1-village.png' });

  // panels are real screens
  await page.getByTestId('panel-economy').click();
  await expect(page.getByRole('dialog')).toContainText('Oduncu Kampı: +4,0');
  await page.keyboard.press('Escape');
  await page.getByTestId('panel-world').click();
  await expect(page.getByRole('dialog')).toContainText('Önizleme');
  await expect(page.getByTestId('province-cinar_ormani')).toHaveAttribute('data-known', 'false');
  await page.keyboard.press('Escape');

  // manual save, reload the page, continue: exact state is restored
  await page.getByRole('button', { name: /Menü/ }).click();
  await page.getByTestId('save-slot1').click();
  await expect(page.locator('.toast', { hasText: 'Oyun kaydedildi: 1. Kayıt' })).toBeVisible();
  const saved = await snapshot(page);
  await page.reload();
  await expect(page.getByTestId('continue')).toBeEnabled();
  await page.getByTestId('continue').click();
  await expect(page.locator('canvas')).toBeVisible();
  const loaded = await snapshot(page);
  expect(JSON.parse(loaded.json)).toEqual(JSON.parse(saved.json));
  expect(loaded.rngState).toBe(saved.rngState);
  expect(loaded.buildings.find((b) => b.id === camp.id)).toMatchObject({
    x: plan.x,
    y: plan.y,
    workers: 2,
    state: 'active',
  });
  expect(loaded.quests.q01!.status).toBe('completed');

  // and the game continues after the reload
  await page.keyboard.press('1');
  await expect.poll(async () => (await snapshot(page)).tick, { timeout: 10000 }).toBeGreaterThan(loaded.tick);
  expect(errors).toEqual([]);
});
