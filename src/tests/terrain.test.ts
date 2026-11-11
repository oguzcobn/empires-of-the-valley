import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../game/data/buildings';
import { createNewGame } from '../game/scenarios/newGame';
import { findSite } from '../game/systems/placement';
import { generateValley } from '../game/systems/terrain';
import { expectValid, home } from './helpers';

describe('terrain generation', () => {
  it('is deterministic per seed', () => {
    expect(generateValley(1234, 'p')).toEqual(generateValley(1234, 'p'));
    expect(generateValley(1, 'p').tiles).not.toEqual(generateValley(2, 'p').tiles);
  });

  it('guarantees a playable start for many seeds', () => {
    for (let seed = 0; seed < 120; seed++) {
      const state = createNewGame({ seed, mode: 'campaign' });
      expectValid(state);
      const p = home(state);
      expect(p.tiles).toHaveLength(24 * 24);
      for (const id of ['lumber_camp', 'farm', 'quarry', 'school', 'granary', 'hut'] as const) {
        expect(findSite(p, BUILDINGS[id]), `seed ${seed} ${id}`).not.toBeNull();
      }
      expect(p.tiles.some((t) => t.terrain === 'water')).toBe(true);
      expect(p.buildings.every((b) => b.connected)).toBe(true);
    }
  });

  it('starts with the specified hamlet and stocks', () => {
    const p = home(createNewGame({ seed: 5, mode: 'campaign' }));
    expect(p.buildings.map((b) => b.definitionId).sort()).toEqual([
      'hut',
      'hut',
      'hut',
      'hut',
      'town_center',
      'warehouse',
    ]);
    expect(p.stocks).toEqual({
      wood: 160000,
      food: 90000,
      stone: 70000,
      gold: 40000,
      tools: 20000,
      research: 0,
    });
    expect(p.population).toMatchObject({ children: 3, adults: 8, elders: 1 });
    expect(p.happiness).toBe(70);
  });
});
