import { expect, test } from '@playwright/test';

test('opens the same city in 3D and returns to the playable map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto('./');
  await page.getByTestId('new-campaign').click();
  await page.getByTestId('start-game').click();
  await page.getByTestId('intro-start').click();
  await page.getByRole('button', { name: '3D şehir görünümü' }).click();
  const canvas = page.locator('canvas[aria-label="Vadi haritası (3D)"]');
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Kamera eğimini değiştir' }).click();
  await page.screenshot({ path: test.info().outputPath('world-3d.png') });
  await page.getByRole('button', { name: '3D şehir görünümü' }).click();
  await expect(canvas).toHaveCount(0);
  await expect(page.locator('.valley-canvas canvas')).toBeVisible();
  expect(errors).toEqual([]);
});
