import { describe, expect, it } from 'vitest';
import { BUILDINGS } from './buildings';

describe('faster construction pacing', () => {
  it('finishes early housing and production buildings within a short play session', () => {
    expect(BUILDINGS.hut.levels[0]!.buildTicks).toBe(16);
    expect(BUILDINGS.lumber_camp.levels[0]!.buildTicks).toBe(24);
    expect(BUILDINGS.farm.levels[0]!.buildTicks).toBe(24);
  });

  it('keeps upgrades and established building identifiers intact', () => {
    expect(BUILDINGS.hut.id).toBe('hut');
    expect(BUILDINGS.hut.levels).toHaveLength(5);
    expect(BUILDINGS.hut.levels[2]!.buildTicks).toBe(24);
    expect(BUILDINGS.town_center.levels[0]!.buildTicks).toBe(0);
  });
});
