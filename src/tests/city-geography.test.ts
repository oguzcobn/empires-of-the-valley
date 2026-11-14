import { describe, expect, it } from 'vitest';
import { createNewGame } from '../game/scenarios/newGame';
import { generateValley } from '../game/systems/terrain';
import { expectValid, home } from './helpers';

const at = (tiles: ReturnType<typeof generateValley>['tiles'], x: number, y: number) => tiles[y * 32 + x]!;

describe('city-specific coastal landscapes', () => {
  it('gives Trabzon a northern Black Sea coast and a southeastern mountain flank', () => {
    const tr = generateValley(42, 'p', 'turkish').tiles;
    expect(at(tr, 8, 0).terrain).toBe('lake');
    expect(at(tr, 8, 3).terrain).toBe('sand');
    expect(at(tr, 31, 30).terrain).toBe('mountain');
    expect(at(tr, 31, 30).height).toBeGreaterThan(1);
  });

  it('gives Edinburgh a Firth coast and eastern Arthur Seat crags', () => {
    const sc = generateValley(42, 'p', 'scottish').tiles;
    expect(at(sc, 8, 0).terrain).toBe('lake');
    expect(at(sc, 8, 2).terrain).toBe('sand');
    expect(at(sc, 31, 19).terrain).toBe('mountain');
    expect(at(sc, 31, 19).height).toBe(3);
  });

  it('preserves playable starting settlements across a range of seeds', () => {
    for (const culture of ['turkish', 'scottish'] as const) {
      for (let seed = 0; seed < 15; seed++) {
        const s = createNewGame({ seed, mode: 'sandbox', culture });
        expectValid(s);
        expect(home(s).buildings).toHaveLength(6);
        expect(at(home(s).tiles, 15, 15).height).toBe(0);
      }
    }
  });
});
