import { u } from '../core/fixed';
import type { BuildingDefinition, BuildingId, BuildingInstance, LandmarkId, LevelSpec, TerrainId } from '../core/types';
import { LANDMARKS } from './landmarks';

// Construction-only day length: shorten waiting without changing production, seasons or saves.
const DAY = 8;
const LAND: readonly TerrainId[] = ['grass', 'fertile', 'sand'];
/** Small buildings may also stand on hills and on terraces (flat footprint required). */
const LAND_AND_HILLS: readonly TerrainId[] = ['grass', 'fertile', 'sand', 'hill', 'terrace'];

function level(partial: Partial<LevelSpec> & Pick<LevelSpec, 'cost' | 'buildTicks'>): LevelSpec {
  return { workerSlots: 0, housing: 0, storage: {}, goldIncome: 0, taxIncome: 0, upkeepGold: 0, ...partial };
}

/** Pads a building's levels array up to 5 progressive upgrade tiers while preserving existing initial levels verbatim. */
function fiveLevels(baseLevels: LevelSpec[]): LevelSpec[] {
  const out = [...baseLevels];
  while (out.length < 5) {
    const prev = out[out.length - 1]!;
    const nextIdx = out.length + 1; // 1-based level number (e.g., 2, 3, 4, 5)
    const scale = nextIdx === 2 ? 1.35 : nextIdx === 3 ? 1.3 : nextIdx === 4 ? 1.28 : 1.25;
    const roundResource = (v?: number): number | undefined =>
      v ? Math.max(u(5), Math.round((v * scale) / u(5)) * u(5)) : undefined;
    const nextCost = {
      ...(prev.cost.wood ? { wood: roundResource(prev.cost.wood) } : {}),
      ...(prev.cost.stone ? { stone: roundResource(prev.cost.stone) } : {}),
      ...(prev.cost.gold ? { gold: roundResource(prev.cost.gold) } : { gold: u(nextIdx * 4) }),
      ...(prev.cost.tools ? { tools: roundResource(prev.cost.tools) } : {}),
    };
    const nextStorage: LevelSpec['storage'] = {};
    for (const [k, val] of Object.entries(prev.storage)) {
      if (val) nextStorage[k as keyof LevelSpec['storage']] = Math.round((val * 1.35) / u(25)) * u(25);
    }
    out.push(
      level({
        cost: nextCost,
        buildTicks: Math.min(8 * DAY, prev.buildTicks + DAY),
        workerSlots: prev.workerSlots > 0 ? prev.workerSlots + 1 : 0,
        housing: prev.housing > 0 ? prev.housing + (nextIdx >= 4 ? 5 : 4) : 0,
        storage: nextStorage,
        goldIncome: prev.goldIncome > 0 ? prev.goldIncome + u(1.5) : 0,
        taxIncome: prev.taxIncome > 0 ? prev.taxIncome + u(0.2) : 0,
        upkeepGold: prev.upkeepGold > 0 ? prev.upkeepGold + u(0.1) : 0,
        produces: prev.produces
          ? {
              resourceId: prev.produces.resourceId,
              perDay: prev.produces.perDay + Math.max(u(2), Math.round((prev.produces.perDay * 0.35) / u(1)) * u(1)),
            }
          : undefined,
        requires: { townCenterLevel: Math.min(2, nextIdx >= 2 ? 2 : 1) },
      }),
    );
  }
  return out;
}

/** Data-driven building catalog: every non-landmark building upgrades across 5 distinct levels. */
const CORE: Record<Exclude<BuildingId, LandmarkId>, BuildingDefinition> = {
  hospital: {
    id: 'hospital', category: 'civic', era: 1,
    footprint: [2, 2], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: { community: 4, safety: 4, safetyRadius: 5 },
    levels: fiveLevels([
      level({ cost: { wood: u(45), stone: u(40), gold: u(25), tools: u(10) },
        buildTicks: 4 * DAY, workerSlots: 4, upkeepGold: u(0.5),
        requires: { population: 20 } }),
    ]),
  },
  factory: {
    id: 'factory', category: 'production', era: 1,
    footprint: [3, 3], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: {},
    levels: fiveLevels([
      level({ cost: { wood: u(45), stone: u(40), gold: u(25), tools: u(10) },
        buildTicks: 4 * DAY, workerSlots: 4, upkeepGold: u(0.5),
        produces: { resourceId: 'tools', perDay: u(3) },
        requires: { population: 20 } }),
    ]),
  },
  hotel: {
    id: 'hotel', category: 'housing', era: 1,
    footprint: [2, 2], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: { beds: 20, attraction: 5 },
    levels: fiveLevels([
      level({ cost: { wood: u(45), stone: u(40), gold: u(25), tools: u(10) },
        buildTicks: 4 * DAY, workerSlots: 2, upkeepGold: u(0.5),
        requires: { population: 20 } }),
    ]),
  },
  club: {
    id: 'club', category: 'civic', era: 1,
    footprint: [2, 2], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: { community: 4, attraction: 8 },
    levels: fiveLevels([
      level({ cost: { wood: u(45), stone: u(40), gold: u(25), tools: u(10) },
        buildTicks: 4 * DAY, workerSlots: 2, upkeepGold: u(0.5),
        requires: { population: 20 } }),
    ]),
  },
  restaurant: {
    id: 'restaurant', category: 'civic', era: 1,
    footprint: [2, 2], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: { community: 3, attraction: 5 },
    levels: fiveLevels([
      level({ cost: { wood: u(45), stone: u(40), gold: u(25), tools: u(10) },
        buildTicks: 4 * DAY, workerSlots: 2, upkeepGold: u(0.5),
        requires: { population: 20 } }),
    ]),
  },
  airport: {
    id: 'airport', category: 'civic', era: 1,
    footprint: [8, 4], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: { attraction: 6 },
    levels: fiveLevels([
      level({ cost: { wood: u(100), stone: u(120), gold: u(100), tools: u(10) },
        buildTicks: 8 * DAY, workerSlots: 4, upkeepGold: u(2),
        requires: { population: 30 } }),
    ]),
  },
  aquapark: {
    id: 'aquapark',
    category: 'civic',
    era: 1,
    footprint: [2, 2],
    validTerrains: LAND_AND_HILLS,
    seasonal: false,
    usesTools: false,
    buildable: true,
    demolishable: true,
    services: { community: 7, attraction: 14, marketGold: u(2.5) },
    levels: fiveLevels([
      level({
        cost: { wood: u(40), stone: u(45), gold: u(30) },
        buildTicks: 4 * DAY,
        workerSlots: 3,
        produces: { resourceId: 'gold', perDay: u(3) },
        upkeepGold: u(0.35),
        requires: { population: 18 },
      }),
      level({
        cost: { wood: u(55), stone: u(65), gold: u(45) },
        buildTicks: 4 * DAY,
        workerSlots: 5,
        produces: { resourceId: 'gold', perDay: u(6) },
        upkeepGold: u(0.5),
        requires: { townCenterLevel: 2 },
      }),
    ]),
  },
  corporate_plaza: {
    id: 'corporate_plaza',
    category: 'civic',
    era: 1,
    footprint: [2, 2],
    validTerrains: LAND_AND_HILLS,
    seasonal: false,
    usesTools: false,
    buildable: true,
    demolishable: true,
    services: { community: 5, attraction: 8, marketGold: u(3) },
    levels: [
      level({
        cost: { wood: u(35), stone: u(45), gold: u(20) },
        buildTicks: 3 * DAY,
        workerSlots: 4,
        produces: { resourceId: 'gold', perDay: u(4) },
        taxIncome: u(0.8),
        upkeepGold: u(0.3),
      }),
      level({
        cost: { wood: u(45), stone: u(65), gold: u(35) },
        buildTicks: 4 * DAY,
        workerSlots: 6,
        produces: { resourceId: 'gold', perDay: u(7) },
        taxIncome: u(1.2),
        upkeepGold: u(0.45),
        requires: { townCenterLevel: 2 },
      }),
      level({
        cost: { wood: u(60), stone: u(90), gold: u(55), tools: u(10) },
        buildTicks: 4 * DAY,
        workerSlots: 8,
        produces: { resourceId: 'gold', perDay: u(11) },
        taxIncome: u(1.8),
        upkeepGold: u(0.6),
        requires: { townCenterLevel: 2 },
      }),
      level({
        cost: { wood: u(80), stone: u(120), gold: u(80), tools: u(15) },
        buildTicks: 5 * DAY,
        workerSlots: 11,
        produces: { resourceId: 'gold', perDay: u(16) },
        taxIncome: u(2.5),
        upkeepGold: u(0.8),
        requires: { townCenterLevel: 2 },
      }),
      level({
        cost: { wood: u(100), stone: u(160), gold: u(110), tools: u(25) },
        buildTicks: 5 * DAY,
        workerSlots: 15,
        produces: { resourceId: 'gold', perDay: u(22) },
        taxIncome: u(3.5),
        upkeepGold: u(1.0),
        requires: { townCenterLevel: 2 },
      }),
    ],
  },
  town_center: {
    id: 'town_center',
    category: 'governance',
    era: 1,
    footprint: [2, 2],
    validTerrains: LAND,
    seasonal: false,
    usesTools: false,
    buildable: false,
    demolishable: false,
    levels: fiveLevels([
      level({ cost: {}, buildTicks: 0, goldIncome: u(1) }),
      level({
        cost: { wood: u(80), stone: u(60), gold: u(20) },
        buildTicks: 6 * DAY,
        goldIncome: u(2),
        requires: { population: 16 },
      }),
    ]),
  },
  hut: {
    id: 'hut',
    category: 'housing',
    era: 1,
    footprint: [1, 1],
    validTerrains: LAND_AND_HILLS,
    seasonal: false,
    usesTools: false,
    buildable: true,
    demolishable: true,
    levels: [
      level({ cost: { wood: u(20), stone: u(5) }, buildTicks: 2 * DAY, housing: 5, taxIncome: u(0.2) }),
      level({
        cost: { wood: u(30), stone: u(15) },
        buildTicks: 2 * DAY,
        housing: 8,
        taxIncome: u(0.3),
        requires: { townCenterLevel: 2 },
      }),
      level({
        cost: { wood: u(40), stone: u(30), gold: u(5) },
        buildTicks: 3 * DAY,
        housing: 12,
        taxIncome: u(0.45),
        requires: { townCenterLevel: 2, techId: 'masonry' },
      }),
      level({
        cost: { wood: u(50), stone: u(45), gold: u(12) },
        buildTicks: 3 * DAY,
        housing: 17,
        taxIncome: u(0.7),
        requires: { townCenterLevel: 2, techId: 'masonry' },
      }),
      level({
        cost: { wood: u(65), stone: u(65), gold: u(22), tools: u(5) },
        buildTicks: 4 * DAY,
        housing: 24,
        taxIncome: u(1.05),
        requires: { townCenterLevel: 2, techId: 'masonry' },
      }),
    ],
  },
  warehouse: {
    id: 'warehouse',
    category: 'storage',
    era: 1,
    footprint: [2, 2],
    validTerrains: LAND,
    seasonal: false,
    usesTools: false,
    buildable: true,
    demolishable: true,
    levels: fiveLevels([
      level({
        cost: { wood: u(40), stone: u(20) },
        buildTicks: 4 * DAY,
        storage: { wood: u(300), food: u(250), stone: u(250), tools: u(100) },
        upkeepGold: u(0.1),
      }),
      level({
        cost: { wood: u(60), stone: u(45) },
        buildTicks: 4 * DAY,
        storage: { wood: u(450), food: u(375), stone: u(375), tools: u(150) },
        upkeepGold: u(0.15),
        requires: { townCenterLevel: 2 },
      }),
    ]),
  },
  lumber_camp: {
    id: 'lumber_camp',
    category: 'production',
    era: 1,
    footprint: [2, 2],
    validTerrains: LAND,
    harvests: { terrain: 'forest', radius: 3 },
    seasonal: false,
    usesTools: true,
    buildable: true,
    demolishable: true,
    levels: fiveLevels([
      level({
        cost: { wood: u(30), stone: u(10) },
        buildTicks: 3 * DAY,
        workerSlots: 2,
        produces: { resourceId: 'wood', perDay: u(4) },
        upkeepGold: u(0.1),
      }),
      level({
        cost: { wood: u(45), stone: u(25) },
        buildTicks: 3 * DAY,
        workerSlots: 3,
        produces: { resourceId: 'wood', perDay: u(7) },
        upkeepGold: u(0.15),
        requires: { townCenterLevel: 2 },
      }),
    ]),
  },
  farm: {
    id: 'farm',
    category: 'production',
    era: 1,
    footprint: [2, 2],
    validTerrains: ['fertile'],
    seasonal: true,
    usesTools: true,
    buildable: true,
    demolishable: true,
    levels: fiveLevels([
      level({
        cost: { wood: u(25), stone: u(10) },
        buildTicks: 3 * DAY,
        workerSlots: 3,
        produces: { resourceId: 'food', perDay: u(6) },
        upkeepGold: u(0.1),
      }),
      level({
        cost: { wood: u(40), stone: u(20) },
        buildTicks: 3 * DAY,
        workerSlots: 4,
        produces: { resourceId: 'food', perDay: u(10) },
        upkeepGold: u(0.15),
        requires: { townCenterLevel: 2 },
      }),
    ]),
  },
  quarry: {
    id: 'quarry',
    category: 'production',
    era: 1,
    footprint: [2, 2],
    validTerrains: LAND,
    harvests: { terrain: 'stone', radius: 3 },
    seasonal: false,
    usesTools: true,
    buildable: true,
    demolishable: true,
    levels: fiveLevels([
      level({
        cost: { wood: u(35), stone: u(15) },
        buildTicks: 4 * DAY,
        workerSlots: 2,
        produces: { resourceId: 'stone', perDay: u(3) },
        upkeepGold: u(0.1),
      }),
      level({
        cost: { wood: u(50), stone: u(30) },
        buildTicks: 4 * DAY,
        workerSlots: 3,
        produces: { resourceId: 'stone', perDay: u(5) },
        upkeepGold: u(0.15),
        requires: { townCenterLevel: 2 },
      }),
    ]),
  },
  granary: {
    id: 'granary',
    category: 'storage',
    era: 1,
    footprint: [2, 2],
    validTerrains: LAND,
    seasonal: false,
    usesTools: false,
    buildable: true,
    demolishable: true,
    levels: fiveLevels([
      level({
        cost: { wood: u(25), stone: u(15) },
        buildTicks: 3 * DAY,
        storage: { food: u(150) },
        upkeepGold: u(0.1),
      }),
      level({
        cost: { wood: u(40), stone: u(30) },
        buildTicks: 3 * DAY,
        storage: { food: u(300) },
        upkeepGold: u(0.15),
        requires: { townCenterLevel: 2 },
      }),
    ]),
  },
  school: {
    id: 'school',
    category: 'education',
    era: 1,
    footprint: [2, 2],
    validTerrains: LAND,
    seasonal: false,
    usesTools: false,
    buildable: true,
    demolishable: true,
    levels: fiveLevels([
      level({
        cost: { wood: u(40), stone: u(25), gold: u(10) },
        buildTicks: 6 * DAY,
        workerSlots: 1,
        produces: { resourceId: 'research', perDay: u(2) },
        upkeepGold: u(0.4),
      }),
      level({
        cost: { wood: u(60), stone: u(45), gold: u(25) },
        buildTicks: 6 * DAY,
        workerSlots: 2,
        produces: { resourceId: 'research', perDay: u(5) },
        upkeepGold: u(0.8),
        requires: { townCenterLevel: 2 },
      }),
    ]),
  },
  market: {
    id: 'market',
    category: 'governance',
    era: 1,
    footprint: [2, 2],
    validTerrains: LAND,
    seasonal: false,
    usesTools: false,
    buildable: true,
    demolishable: true,
    services: { attraction: 3, marketGold: u(1.5) },
    levels: fiveLevels([
      level({
        cost: { wood: u(40), stone: u(30), gold: u(10) },
        buildTicks: 4 * DAY,
        workerSlots: 2,
        upkeepGold: u(0.2),
        requires: { population: 18 },
      }),
      level({
        cost: { wood: u(60), stone: u(50), gold: u(20) },
        buildTicks: 4 * DAY,
        workerSlots: 3,
        upkeepGold: u(0.3),
        requires: { townCenterLevel: 2 },
      }),
    ]),
  },
  inn: {
    id: 'inn',
    category: 'housing',
    era: 1,
    footprint: [2, 2],
    validTerrains: LAND_AND_HILLS,
    seasonal: false,
    usesTools: false,
    buildable: true,
    demolishable: true,
    services: { beds: 8 },
    levels: fiveLevels([
      level({
        cost: { wood: u(50), stone: u(40), gold: u(15) },
        buildTicks: 5 * DAY,
        workerSlots: 2,
        upkeepGold: u(0.5),
        requires: { population: 20 },
      }),
      level({
        cost: { wood: u(70), stone: u(60), gold: u(25) },
        buildTicks: 5 * DAY,
        workerSlots: 3,
        upkeepGold: u(0.7),
        requires: { townCenterLevel: 2 },
      }),
    ]),
  },
  watchtower: {
    id: 'watchtower',
    category: 'governance',
    era: 1,
    footprint: [1, 1],
    validTerrains: ['grass', 'fertile', 'sand', 'hill', 'terrace', 'rocky'],
    seasonal: false,
    usesTools: false,
    buildable: true,
    demolishable: true,
    services: { safety: 12, safetyRadius: 4 },
    levels: fiveLevels([
      level({ cost: { wood: u(15), stone: u(25) }, buildTicks: 3 * DAY, workerSlots: 1, upkeepGold: u(0.2) }),
      level({
        cost: { wood: u(20), stone: u(40) },
        buildTicks: 3 * DAY,
        workerSlots: 1,
        upkeepGold: u(0.25),
        requires: { techId: 'masonry' },
      }),
    ]),
  },
  barracks: {
    id: 'barracks',
    category: 'governance',
    era: 1,
    footprint: [2, 2],
    validTerrains: LAND_AND_HILLS,
    seasonal: false,
    usesTools: false,
    buildable: true,
    demolishable: true,
    levels: fiveLevels([
      level({ cost: { wood: u(50), stone: u(35), gold: u(15) }, buildTicks: 4 * DAY, workerSlots: 2, upkeepGold: u(0.4), requires: { population: 16 } }),
      level({ cost: { wood: u(60), stone: u(50), gold: u(25) }, buildTicks: 4 * DAY, workerSlots: 3, upkeepGold: u(0.6), requires: { townCenterLevel: 2 } }),
    ]),
  },
  mosque: {
    id: 'mosque', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 3 },
    levels: fiveLevels([level({ cost: { wood: u(24), stone: u(32), gold: u(8) }, buildTicks: 3 * DAY, workerSlots: 1, upkeepGold: u(0.12) })]),
  },
  church: {
    id: 'church', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 3 },
    levels: fiveLevels([level({ cost: { wood: u(24), stone: u(32), gold: u(8) }, buildTicks: 3 * DAY, workerSlots: 1, upkeepGold: u(0.12) })]),
  },
  theatre: {
    id: 'theatre', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 5, attraction: 8 },
    levels: fiveLevels([level({ cost: { wood: u(45), stone: u(36), gold: u(15) }, buildTicks: 4 * DAY, workerSlots: 2, upkeepGold: u(0.25), requires: { population: 20 } })]),
  },
  cinema: {
    id: 'cinema', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 6, attraction: 10 },
    levels: fiveLevels([level({ cost: { wood: u(48), stone: u(45), gold: u(25), tools: u(12) }, buildTicks: 5 * DAY, workerSlots: 2, upkeepGold: u(0.35), requires: { townCenterLevel: 2 } })]),
  },
  police_station: {
    id: 'police_station', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { patrolRadius: 5 },
    levels: fiveLevels([level({ cost: { wood: u(30), stone: u(26), gold: u(8) }, buildTicks: 3 * DAY, workerSlots: 2, upkeepGold: u(0.22) })]),
  },
  fire_station: {
    id: 'fire_station', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { patrolRadius: 7, community: 3 },
    levels: fiveLevels([level({ cost: { wood: u(26), stone: u(28), gold: u(10) }, buildTicks: 3 * DAY, workerSlots: 2, upkeepGold: u(0.25) })]),
  },
  shipyard: {
    id: 'shipyard',
    category: 'production',
    era: 1,
    footprint: [2, 2],
    validTerrains: ['grass', 'sand'],
    needsWater: true,
    seasonal: false,
    usesTools: true,
    buildable: true,
    demolishable: true,
    levels: fiveLevels([
      level({
        cost: { wood: u(70), stone: u(30), tools: u(10) },
        buildTicks: 6 * DAY,
        workerSlots: 4,
        upkeepGold: u(0.4),
        requires: { population: 25 },
      }),
      level({
        cost: { wood: u(90), stone: u(60), tools: u(15), gold: u(30) },
        buildTicks: 6 * DAY,
        workerSlots: 6,
        upkeepGold: u(0.6),
        requires: { townCenterLevel: 2 },
      }),
    ]),
  },
  terrace_farm: {
    id: 'terrace_farm',
    category: 'production',
    era: 1,
    footprint: [2, 2],
    validTerrains: ['terrace'],
    seasonal: true,
    usesTools: true,
    buildable: true,
    demolishable: true,
    levels: fiveLevels([
      level({
        cost: { wood: u(20), stone: u(15) },
        buildTicks: 3 * DAY,
        workerSlots: 2,
        produces: { resourceId: 'food', perDay: u(5) },
        upkeepGold: u(0.1),
      }),
      level({
        cost: { wood: u(30), stone: u(25) },
        buildTicks: 3 * DAY,
        workerSlots: 3,
        produces: { resourceId: 'food', perDay: u(8) },
        upkeepGold: u(0.15),
        requires: { townCenterLevel: 2 },
      }),
    ]),
  },
};

export const BUILDINGS: Record<BuildingId, BuildingDefinition> = { ...CORE, ...LANDMARKS };

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const BUILDABLE_IDS = BUILDING_IDS.filter((id) => BUILDINGS[id].buildable);

export const defOf = (b: Pick<BuildingInstance, 'definitionId'>): BuildingDefinition =>
  BUILDINGS[b.definitionId];

export const specOf = (b: Pick<BuildingInstance, 'definitionId' | 'level'>): LevelSpec => {
  const def = BUILDINGS[b.definitionId];
  return def.levels[Math.min(b.level, def.levels.length) - 1]!;
};