import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../game/data/buildings';
import { CULTURES, DEFAULT_LOOKS, defaultLook, isPlayableStyle } from '../game/data/architecture';
import type { ArchitectureStyle, BuildingId } from '../game/core/types';
import { levelCost } from '../game/systems/architecture';

const upcoming: ArchitectureStyle[] = ['japanese', 'medieval_european'];
const essentials: BuildingId[] = ['town_center', 'hut', 'warehouse', 'granary', 'school', 'lumber_camp', 'farm', 'terrace_farm', 'quarry', 'market', 'inn', 'watchtower', 'shipyard'];

describe('new culture content packs', () => {
  it.each(upcoming)('%s has authored looks for every ordinary building', (style) => {
    for (const id of essentials) {
      expect(DEFAULT_LOOKS[style]?.[id]?.length).toBeGreaterThan(0);
      const appearance = defaultLook(style, id, 1);
      expect(appearance.wall).toBeTruthy();
      expect(appearance.roofMaterial).toBeTruthy();
      expect(appearance.floors).toBeGreaterThan(0);
      expect(BUILDINGS[id]).toBeDefined();
      expect(levelCost(id, 0, style)).toBeDefined();
    }
  });

  it('new culture bonuses are distinct and preserve existing playable cities', () => {
    expect(CULTURES.japanese.bonuses.schoolPermille).toBe(1100);
    expect(CULTURES.medieval_european.bonuses.watchRadius).toBe(1);
    expect(isPlayableStyle('turkish')).toBe(true);
    expect(isPlayableStyle('scottish')).toBe(true);
    expect(isPlayableStyle('japanese')).toBe(true);
    expect(isPlayableStyle('medieval_european')).toBe(true);
  });
});
