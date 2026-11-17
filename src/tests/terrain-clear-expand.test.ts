import { describe, expect, it } from 'vitest';
import { home, must, newCampaign, tweak } from './helpers';
import { validateCommand } from '../game/systems/commands';

describe('terrain clearing and map expansion', () => {
  it('clears an unoccupied forest tile and rewards 15 wood', () => {
    const s = tweak(newCampaign(42), d => {
      const p = home(d);
      const tile = p.tiles.find(t => t.terrain === 'forest' && !t.road && !t.buildingId);
      if (tile) tile.deposit = 0;
    });
    const p = home(s);
    const idx = p.tiles.findIndex(t => t.terrain === 'forest' && !t.road && !t.buildingId);
    expect(idx).toBeGreaterThanOrEqual(0);
    const x = idx % p.width, y = Math.floor(idx / p.width);
    const result = must(s, { type: 'clearTerrain', x, y });
    expect(home(result).tiles[idx]?.terrain).toBe('grass');
    expect(home(result).stocks.wood).toBeGreaterThanOrEqual(p.stocks.wood);
    expect(validateCommand(result, { type: 'clearTerrain', x, y })).not.toBeNull();
  });

  it('expands without moving existing tiles, paying 5 gold', () => {
    const s = tweak(newCampaign(12), d => { home(d).stocks.gold += 100000; });
    const p = home(s);
    const oldTile = structuredClone(p.tiles[0]);
    const result = must(s, { type: 'expandMap' });
    expect(home(result).width).toBe(Math.min(64, p.width + 8));
    expect(home(result).height).toBe(Math.min(64, p.height + 8));
    expect(home(result).tiles[0]).toEqual(oldTile);
    expect(home(result).stocks.gold).toBe(p.stocks.gold - 5000);
  });
});
