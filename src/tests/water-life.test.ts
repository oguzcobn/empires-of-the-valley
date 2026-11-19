import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { WaterLife, shoreTiles } from '../game/rendering/waterLife';
import { home, newCampaign, tweak } from './helpers';

const lakeside = () => tweak(newCampaign(), (draft) => {
  const p = home(draft);
  for (const t of p.tiles) Object.assign(t, { terrain: 'grass', road: false, buildingId: null, height: 0 });
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) p.tiles[y * p.width + x]!.terrain = 'lake';
  for (let x = 4; x < 16; x++) p.tiles[15 * p.width + x]!.terrain = 'sand';
});

describe('beach and lake life', () => {
  it('finds sandy shores and the shallows in front of them', () => {
    const { beach, shallows } = shoreTiles(home(lakeside()));
    expect(beach.length).toBe(10);
    expect(shallows.length).toBe(10);
  });

  it('fills the beach on summer days, empties it otherwise, and sails the lake', () => {
    const p = home(lakeside());
    const life = new WaterLife(new Container());
    life.update(p, p.tiles, 'summer', 13, false, 16, true);
    const summer = life.count;
    expect(summer).toBeGreaterThan(5);
    life.update(p, p.tiles, 'summer', 13, true, 16, true);
    expect(life.count).toBeLessThan(summer);
    life.update(p, p.tiles, 'winter', 13, false, 16, true);
    expect(life.count).toBe(0);
    life.destroy();
  });
});
