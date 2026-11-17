import { expect, test } from '@playwright/test';

test('recovers a missing 3D module without losing the 2D game', async ({ page }) => {
  // GitHub Pages deployments replace content-hashed modules.
  await page.route(/Valley3D-[^/]+[.]js/, (route) => route.abort());
  await page.goto('./?debug=1');
  await page.getByTestId('new-campaign').click();
  await page.getByTestId('start-game').click();
  await page.getByTestId('intro-start').click();
  await expect(page.locator('.valley-canvas canvas')).toBeVisible();
  await page.getByTestId('toggle-3d').click();
  await expect(page.getByTestId('toggle-3d')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.valley-canvas canvas')).toBeVisible();
  await expect(page.locator('.canvas-error')).toHaveCount(0);
});
