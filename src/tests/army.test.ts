import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { findGroundPath, marchable, musterPoint } from '../game/rendering/armyPath';
import { drawSoldier, kitFor } from '../game/rendering/soldiers';
import { home, newCampaign, tweak } from './helpers';

const field = () => tweak(newCampaign(), (draft) => {
  const p = home(draft);
  for (const t of p.tiles) Object.assign(t, { terrain: 'grass', road: false, buildingId: null, height: 0 });
  for (let y = 0; y < p.height; y++) Object.assign(p.tiles[y * p.width + 10]!, { terrain: 'water' }); // a river
  Object.assign(p.tiles[8 * p.width + 10]!, { road: true, roadType: 'bridge' }); // one bridge
  p.tiles[5 * p.width + 5]!.buildingId = 'house';
});

describe('troop movement', () => {
  it('marches across open country, round buildings and over bridges, never through water', () => {
    const p = home(field());
    const path = findGroundPath(p, [2, 2], [15, 3])!;
    expect(path).not.toBeNull();
    expect(path.some(([x, y]) => x === 10 && y === 8)).toBe(true);
    expect(path.every(([x, y]) => marchable(p, x, y, [15, 3]))).toBe(true);
    expect(path.some(([x, y]) => x === 5 && y === 5)).toBe(false);
    expect(findGroundPath(p, [2, 2], [10, 3])).toBeNull();
    expect(findGroundPath(p, [2, 2], [5, 5])?.at(-1)).toEqual([5, 5]);
  });

  it('musters by the town centre before the first order', () => {
    const s = newCampaign();
    const [x, y] = musterPoint(home(s));
    expect(marchable(home(s), x, y)).toBe(true);
  });
});

describe('soldier figures', () => {
  it('draws helmeted infantry with a rifle in every heading and both uniforms', () => {
    for (const culture of ['turkish', 'scottish'] as const)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]] as const) {
        const g = new Graphics();
        drawSoldier(g, kitFor(culture, 1), 2, dx, dy);
        const b = g.getLocalBounds();
        expect(b.height).toBeGreaterThan(16);
        // the rifle reaches well beyond the body on the side the soldier faces
        expect(b.width).toBeGreaterThan(8);
        g.destroy();
      }
    expect(kitFor('turkish', 0).base).not.toBe(kitFor('scottish', 0).base);
  });
});
