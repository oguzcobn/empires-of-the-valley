import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDABLE_IDS } from './buildings';

const newBuildings = ['skyscraper', 'port', 'clothing_store', 'tech_store', 'coffee_shop', 'grand_mall', 'barber_shop', 'government_hall', 'high_school'] as const;

describe('additional city buildings', () => {
  it('registers all nine functional buildings for construction', () => {
    for (const id of newBuildings) {
      const def = BUILDINGS[id];
      expect(def.id).toBe(id);
      expect(def.levels[0]!.buildTicks).toBeGreaterThan(0);
      expect(def.footprint[0]).toBeGreaterThan(0);
      expect(def.footprint[1]).toBeGreaterThan(0);
      expect(BUILDABLE_IDS).toContain(id);
    }
  });

  it('adds economic, educational and government benefits', () => {
    expect(BUILDINGS.skyscraper.levels[0]!.housing).toBe(16);
    expect(BUILDINGS.port.levels[0]!.storage.food).toBeGreaterThan(0);
    expect(BUILDINGS.grand_mall.levels[0]!.produces?.resourceId).toBe('gold');
    expect(BUILDINGS.government_hall.levels[0]!.produces?.resourceId).toBe('research');
    expect(BUILDINGS.high_school.levels[0]!.produces?.resourceId).toBe('research');
  });

  it('keeps established construction and save identifiers', () => {
    for (const id of ['town_center', 'hut', 'shipyard', 'hospital', 'airport'] as const)
      expect(BUILDINGS[id].id).toBe(id);
  });
});
