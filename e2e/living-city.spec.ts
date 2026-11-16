/* eslint-disable @typescript-eslint/no-explicit-any -- Existing test-only debug hook is intentionally dynamically typed. */
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { GameState, BuildingId, BuildingInstance } from '../src/game/core/types';
import { BUILDINGS } from '../src/game/data/buildings';

for (const view of ['2d', '3d'])
  test(`living city ${view}: services, flights, mobile and frame samples`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto(`./?debug=1&view=${view}`);
    await page.getByTestId('new-campaign').click();
    await page.getByTestId('seed-input').fill('42');
    await page.getByTestId('start-game').click();
    await page.getByTestId('intro-start').click();
    await expect(page.locator('canvas').first()).toBeVisible();
    const specs = [
      ['hut', 2, 5],
      ['hospital', 4, 4],
      ['police_station', 7, 4],
      ['market', 10, 4],
      ['restaurant', 13, 4],
      ['club', 16, 4],
      ['hotel', 19, 4],
      ['factory', 22, 3],
      ['airport', 10, 9],
    ] as const;
    await page.evaluate(
      ({ specs, definitions }) => {
        // Test fixture uses the real store and tick; it does not replace any simulation function.
        const api = (window as any).__EOV__;
        const game = structuredClone(api.store.getState().game) as GameState;
        const p = game.provinces[game.homeProvinceId]!;
        p.buildings = [];
        for (const t of p.tiles) {
          t.terrain = 'grass';
          t.height = 0;
          t.road = false;
          t.paved = false;
          t.buildingId = null;
          t.roadType = 'dirt';
        }
        p.stocks = {
          wood: 1000000,
          stone: 1000000,
          food: 1000000,
          gold: 1000000,
          tools: 1000000,
          research: 1000000,
        };
        p.population.adults = 100;
        const add = (id: BuildingId, x: number, y: number) => {
          const d = definitions[id];
          const b: BuildingInstance = {
            id: `${id}-${x}`,
            definitionId: id,
            provinceId: p.id,
            x,
            y,
            level: 1,
            workers: d.levels[0]!.workerSlots,
            state: 'active',
            connected: true,
            unpaid: false,
            style: 'turkish',
            look: null,
            condition: 10000,
            progressTicks: 0,
            paidStages: 0,
          };
          p.buildings.push(b);
          for (let dy = 0; dy < d.footprint[1]; dy++)
            for (let dx = 0; dx < d.footprint[0]; dx++)
              p.tiles[(y + dy) * p.width + x + dx]!.buildingId = b.id;
        };
        add('town_center', 0, 4);
        for (const [id, x, y] of specs) add(id, x, y);
        for (let x = 0; x < 28; x++) {
          const t = p.tiles[6 * p.width + x]!;
          t.road = t.paved = true;
        }
        for (let y = 6; y <= 13; y++) {
          const t = p.tiles[y * p.width + 9]!;
          t.road = t.paved = true;
        }
        for (let x = 9; x <= 18; x++) {
          const t = p.tiles[13 * p.width + x]!;
          t.road = t.paved = true;
        }
        const bridge = p.tiles[6 * p.width + 26]!;
        bridge.terrain = 'water';
        bridge.roadType = 'bridge';
        game.cityLife = undefined;
        game.speed = 0;
        game.settings.autoPauseOnMilestone = false;
        api.store.setState({ game });
        api.store.getState().updateSettings({ graphics: 'medium', showPerf: true });
        api.store.getState().focusOn(12, 7);
      },
      { specs, definitions: BUILDINGS },
    );
    await page.evaluate(() => {
      const api = (window as any).__EOV__;
      api.advance(24);
    });
    await page.waitForTimeout(1000);
    const result = await page.evaluate(() => {
      const api = (window as any).__EOV__;
      const g = api.store.getState().game;
      return { jobs: g.cityLife.jobs.length, flights: g.cityLife.flights.length, stats: api.stats() };
    });
    expect(result.jobs).toBeGreaterThan(0);
    expect(result.flights).toBe(1);
    await page.screenshot({ path: testInfo.outputPath(`living-city-${view}.png`) });
    await page.evaluate(() => {
      const api = (window as any).__EOV__;
      const game = api.store.getState().game;
      api.store.setState({ game: { ...game, speed: 1 } });
    });
    for (let i = 0; i < 7; i++) await page.keyboard.press('=');
    for (const [label, x, y] of [
      ['services', 7, 5],
      ['hospitality', 18, 5],
      ['airport', 14, 11],
    ] as const) {
      await page.evaluate(([x, y]) => (window as any).__EOV__.store.getState().focusOn(x, y), [x, y]);
      await page.waitForTimeout(250);
      await page.screenshot({ path: testInfo.outputPath(`${view}-${label}-detail.png`) });
    }
    const performance = await page.evaluate(async () => {
      let last = globalThis.performance.now();
      const samples: number[] = [];
      await new Promise<void>((resolve) => {
        const frame = (now: number) => {
          samples.push(now - last);
          last = now;
          if (samples.length < 90) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      samples.sort((a, b) => a - b);
      return {
        fps: 1000 / (samples.reduce((a, b) => a + b, 0) / samples.length),
        p95ms: samples[Math.floor(samples.length * 0.95)],
      };
    });
    writeFileSync(
      testInfo.outputPath('frame-samples.json'),
      JSON.stringify({ view, ...performance, ...result, motion: 'running' }, null, 2),
    );
    await testInfo.attach('software-renderer-frame-samples', {
      body: JSON.stringify({ view, ...performance, ...result }, null, 2),
      contentType: 'application/json',
    });
    await page.evaluate(() => {
      const api = (window as any).__EOV__;
      const game = api.store.getState().game;
      api.store.setState({ game: { ...game, speed: 0 } });
      api.advance(72);
    });
    const after = await page.evaluate(() => {
      const g = (window as any).__EOV__.store.getState().game;
      return g.cityLife;
    });
    expect(after.completedTrips).toBeGreaterThan(0);
    expect(after.completedFlights).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: testInfo.outputPath(`living-city-${view}-portrait.png`) });
  });
