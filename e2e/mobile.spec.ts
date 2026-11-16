import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

async function expectScrollable(element: Locator): Promise<void> {
  await expect.poll(() => element.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 667, height: 375 },
]) {
  test.describe(`${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test('scrolls menus, places a building and resumes a save with touch', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('./?debug=1');
      await page.getByTestId('new-campaign').tap();
      await expectScrollable(page.locator('.modal-body'));
      await page.getByTestId('seed-input').fill('42');
      await page.getByTestId('start-game').tap();
      const prompt = page.getByTestId('mobile-landscape-prompt');
      if (viewport.height > viewport.width) {
        await prompt.getByRole('button', { name: 'Dikey Devam Et' }).tap();
      }
      await page.getByTestId('intro-start').tap();
      const canvas = page.locator('.valley-canvas canvas');
      await expect(canvas).toBeVisible();
      expect(await canvas.boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);

      const menuTrigger = page.locator('.game-menu-trigger');
      await menuTrigger.tap();
      const menu = page.locator('#game-menu');
      await expect(menu).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: test.info().outputPath("game-menu.png") });
      await menu.getByRole('button', { name: 'Menüyü kapat' }).tap();
      await menuTrigger.tap();
      await menu.getByLabel('Yönetim paneli').selectOption('help');
      await expectScrollable(page.locator('.modal-body'));
      await page.getByRole('button', { name: 'Kapat', exact: true }).tap();

      await page.getByTestId('tool-build').tap();
      await expectScrollable(page.locator('.left-column'));
      const campButton = page.getByTestId('build-lumber_camp');
      await campButton.tap();
      await expect(campButton).toBeHidden();

      // Read the simulation's starting road and a legal construction site.
      const plan = await page.evaluate(() => {
        const debug = (window as unknown as {
          __EOV__: { plan(id: string): { x: number; y: number; roads: [number, number][] } };
        }).__EOV__;
        return debug.plan('lumber_camp');
      });
      const tapTile = async (x: number, y: number) => {
        const point = await page.evaluate(([tx, ty]) => {
          const debug = (window as unknown as {
            __EOV__: {
              store: { getState(): { focusOn(x: number, y: number): void } };
              tilePoint(x: number, y: number): { x: number; y: number };
            };
          }).__EOV__;
          debug.store.getState().focusOn(tx!, ty!);
          return new Promise<{ x: number; y: number }>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(debug.tilePoint(tx!, ty!)))),
          );
        }, [x, y]);
        await page.touchscreen.tap(point.x, point.y);
      };
      if (plan.roads.length > 0) {
        await menuTrigger.tap();
        await menu.getByLabel('Harita aracı').selectOption('road');
        for (const [x, y] of plan.roads) await tapTile(x, y);
        await page.getByTestId('tool-build').tap();
        await campButton.tap();
      }
      await tapTile(plan.x, plan.y);
      await page.getByRole('button', { name: 'Buraya inşa et' }).tap();
      await expect(page.getByTestId('inspector')).toContainText('Oduncu Kampı');
      await page.screenshot({ path: test.info().outputPath("construction.png") });

      await page.locator('.hud-menu').tap();
      await page.getByTestId('save-slot1').tap();
      await expect(page.locator('.toast')).toContainText('Oyun kaydedildi');
      await page.reload();
      await page.getByTestId('continue').tap();
      await expect(canvas).toBeVisible();
      await expect.poll(() => page.evaluate(() => {
        const debug = (window as unknown as {
          __EOV__: { store: { getState(): { game: { provinces: Record<string, { buildings: { definitionId: string }[] }> } } } };
        }).__EOV__;
        return Object.values(debug.store.getState().game.provinces)
          .some((province) => province.buildings.some((building) => building.definitionId === 'lumber_camp'));
      })).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}
