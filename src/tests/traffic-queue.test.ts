import { describe, expect, it } from 'vitest';
import { queuePositions } from '../game/rendering/cityScenes';
import { emptyCityLife } from '../game/systems/cityLife';
import type { CityJob } from '../game/systems/cityLife';
import { home, newCampaign, tweak } from './helpers';

const job = (id: number, index: number, kind: CityJob['kind'] = 'shopping'): CityJob => ({
  id, kind, source: 'a', target: 'b', slot: 0, index, stage: 'outbound', age: 0,
  path: Array.from({ length: 8 }, (_, k) => ({ x: 2.5 + k, y: 6.5 })),
});

const city = (jobs: CityJob[]) => tweak(newCampaign(), (draft) => {
  const p = home(draft);
  for (let x = 0; x < 12; x++) Object.assign(p.tiles[6 * p.width + x]!, { road: true, paved: true, roadType: 'dirt' });
  draft.cityLife = { ...emptyCityLife(), jobs };
});

describe('journey traffic queue', () => {
  it('spaces cars that share a lane instead of drawing them through each other', () => {
    const s = city([job(1, 3), job(2, 3), job(3, 3)]);
    const moved = queuePositions(s, home(s), 0.5);
    const xs = [1, 2, 3].map((id) => moved.get(id)?.x ?? 3.5 + 2.5);
    xs.sort((a, b) => b - a);
    expect(xs[0]! - xs[1]!).toBeGreaterThanOrEqual(0.49);
    expect(moved.size).toBeGreaterThanOrEqual(1);
  });

  it('leaves cars alone when they are already apart or in opposite lanes', () => {
    const s = city([job(1, 1), job(2, 5)]);
    expect(queuePositions(s, home(s), 0.5).size).toBe(0);
    const opposite = { ...job(3, 3), path: job(3, 3).path.slice().reverse() };
    const t = city([job(1, 4), opposite]);
    expect(queuePositions(t, home(t), 0.5).size).toBe(0);
  });
});
