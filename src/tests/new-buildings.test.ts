import { describe, expect, it } from 'vitest';
import { BUILDABLE_IDS, BUILDINGS } from '../game/data/buildings';
import type { BuildingId } from '../game/core/types';
import { dailyOutput, housingCapacity, isHome } from '../game/systems/economy';
import { healthServices } from '../game/systems/health';
import { neighborhoodServices } from '../game/systems/crime';
import { t } from '../i18n';
import { home, newCampaign, tweak } from './helpers';

const NEW: BuildingId[] = ['apartment', 'park', 'gas_station', 'pharmacy', 'bakery', 'bank', 'mall', 'villa', 'tea_garden', 'post_office', 'gym', 'kindergarten', 'university', 'museum', 'bazaar', 'hamam'];

const withBuilding = (id: BuildingId, workers: number, dx = 1) => tweak(newCampaign(), (draft) => {
  const p = home(draft);
  p.population.adults = 40;
  const hut = p.buildings.find((b) => b.definitionId === 'hut')!;
  p.buildings.push({ ...hut, id: `new-${id}`, definitionId: id, x: hut.x + dx, workers, level: 1 });
});

describe('new city buildings', () => {
  it('are buildable with complete Turkish texts', () => {
    for (const id of NEW) {
      expect(BUILDABLE_IDS).toContain(id);
      for (const key of ['name', 'desc', 'effect', 'rule', 'upgrade'] as const)
        expect(t(`building.${id}.${key}` as never), `${id}.${key}`).not.toContain('building.');
    }
  });

  it('apartments house residents and count as homes for services', () => {
    const s = withBuilding('apartment', 0);
    const p = home(s);
    const flat = p.buildings.find((b) => b.definitionId === 'apartment')!;
    expect(isHome(flat)).toBe(true);
    expect(housingCapacity(p)).toBeGreaterThanOrEqual(BUILDINGS.apartment.levels[0]!.housing);
    expect(neighborhoodServices(p).homes.some((h) => h.home.id === flat.id)).toBe(true);
    expect(healthServices(p).homes.some((h) => h.home.id === flat.id)).toBe(true);
  });

  it('villas are homes and social venues lift community happiness while staffed', () => {
    const p = home(withBuilding('villa', 0));
    expect(isHome(p.buildings.find((b) => b.definitionId === 'villa')!)).toBe(true);
    for (const id of ['tea_garden', 'gym', 'kindergarten', 'post_office'] as const) {
      const slots = BUILDINGS[id].levels[0]!.workerSlots;
      expect(neighborhoodServices(home(withBuilding(id, slots))).community, id)
        .toBeGreaterThan(neighborhoodServices(home(withBuilding(id, 0))).community);
    }
  });

  it('pharmacies add health happiness only while staffed', () => {
    const staffed = healthServices(home(withBuilding('pharmacy', 1)));
    const closed = healthServices(home(withBuilding('pharmacy', 0)));
    expect(staffed.pharmacyCoverage).toBeGreaterThan(0);
    expect(staffed.happiness).toBeGreaterThan(closed.happiness);
  });

  it('parks lift community happiness with a gardener', () => {
    expect(neighborhoodServices(home(withBuilding('park', 1))).community)
      .toBeGreaterThan(neighborhoodServices(home(withBuilding('park', 0))).community);
  });

  it('bakeries bake food, banks and gas stations earn gold', () => {
    for (const [id, resource] of [['bakery', 'food'], ['bank', 'gold'], ['gas_station', 'gold'], ['mall', 'gold'], ['university', 'research'], ['museum', 'research'], ['bazaar', 'food'], ['hamam', 'gold']] as const) {
      const s = withBuilding(id, BUILDINGS[id].levels[0]!.workerSlots);
      const b = home(s).buildings.find((x) => x.definitionId === id)!;
      expect(BUILDINGS[id].levels[0]!.produces?.resourceId).toBe(resource);
      expect(dailyOutput(s, home(s), b), id).toBeGreaterThan(0);
    }
  });
});
