import { u } from '../core/fixed';
import type { BuildingDefinition, Cost, BuildingId, BuildingInstance, LandmarkId, LevelSpec, TerrainId } from '../core/types';
import { LANDMARKS } from './landmarks';

// Construction-only day length: shorten waiting without changing production, seasons or saves.
const DAY = 8;
const LAND: readonly TerrainId[] = ['grass', 'fertile', 'sand'];
/** Small buildings may also stand on hills and on terraces (flat footprint required). */
const LAND_AND_HILLS: readonly TerrainId[] = ['grass', 'fertile', 'sand', 'hill', 'terrace'];

function level(partial: Partial<LevelSpec> & Pick<LevelSpec, 'cost' | 'buildTicks'>): LevelSpec {
  return { workerSlots: 0, housing: 0, storage: {}, goldIncome: 0, taxIncome: 0, upkeepGold: 0, ...partial };
}

/** Data-driven building catalog: the village (Phase 1), terraces and the historic landmarks. */
const CORE: Record<Exclude<BuildingId, LandmarkId>, BuildingDefinition> = {
  hospital: {
    id: 'hospital', category: 'civic', era: 2,
    footprint: [2, 2], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: { community: 4, safety: 4, safetyRadius: 5, healthRadius: 8 },
    levels: [level({ cost: { wood: u(45), stone: u(40), gold: u(25), tools: u(10) },
      buildTicks: 4 * DAY, workerSlots: 4, upkeepGold: u(0.5),

      requires: { population: 20 } })],
  },
  factory: {
    id: 'factory', category: 'production', era: 2,
    footprint: [3, 3], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: {  },
    levels: [level({ cost: { wood: u(45), stone: u(40), gold: u(25), tools: u(10) },
      buildTicks: 4 * DAY, workerSlots: 4, upkeepGold: u(0.5),
      produces: { resourceId: 'tools', perDay: u(3) },
      requires: { population: 20 } })],
  },
  hotel: {
    id: 'hotel', category: 'housing', era: 2,
    footprint: [2, 2], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: { beds: 20, attraction: 5 },
    levels: [level({ cost: { wood: u(45), stone: u(40), gold: u(25), tools: u(10) },
      buildTicks: 4 * DAY, workerSlots: 2, upkeepGold: u(0.5),

      requires: { population: 20 } })],
  },
  club: {
    id: 'club', category: 'civic', era: 2,
    footprint: [2, 2], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: { community: 4, attraction: 8 },
    levels: [level({ cost: { wood: u(45), stone: u(40), gold: u(25), tools: u(10) },
      buildTicks: 4 * DAY, workerSlots: 2, upkeepGold: u(0.5),

      requires: { population: 20 } })],
  },
  restaurant: {
    id: 'restaurant', category: 'civic', era: 1,
    footprint: [2, 2], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: { community: 3, attraction: 5 },
    levels: [level({ cost: { wood: u(45), stone: u(40), gold: u(25), tools: u(10) },
      buildTicks: 4 * DAY, workerSlots: 2, upkeepGold: u(0.5),

      requires: { population: 20 } })],
  },
  airport: {
    id: 'airport', category: 'civic', era: 3,
    footprint: [8, 4], validTerrains: LAND, seasonal: false, usesTools: false,
    buildable: true, demolishable: true, services: { attraction: 6 },
    levels: [level({ cost: { wood: u(100), stone: u(120), gold: u(100), tools: u(10) },
      buildTicks: 8 * DAY, workerSlots: 4, upkeepGold: u(2),

      requires: { population: 30 } })],
  },
  apartment: {
    id: 'apartment', category: 'housing', era: 2, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    levels: [
      level({ cost: { wood: u(40), stone: u(55), gold: u(20) }, buildTicks: 4 * DAY, housing: 14, taxIncome: u(1.4), upkeepGold: u(0.2), requires: { population: 20 } }),
      level({ cost: { wood: u(50), stone: u(70), gold: u(30), tools: u(6) }, buildTicks: 4 * DAY, housing: 24, taxIncome: u(2.4), upkeepGold: u(0.3), requires: { townCenterLevel: 2 } }),
    ],
  },
  park: {
    id: 'park', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 5, attraction: 3 },
    levels: [level({ cost: { wood: u(20), stone: u(15), gold: u(8) }, buildTicks: 2 * DAY, workerSlots: 1, upkeepGold: u(0.1) })],
  },
  gas_station: {
    id: 'gas_station', category: 'production', era: 3, footprint: [2, 2], validTerrains: LAND,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { marketGold: u(1) },
    levels: [level({ cost: { wood: u(25), stone: u(40), gold: u(30), tools: u(8) }, buildTicks: 3 * DAY, workerSlots: 2,
      produces: { resourceId: 'gold', perDay: u(2.5) }, upkeepGold: u(0.25), requires: { population: 24 } })],
  },
  pharmacy: {
    id: 'pharmacy', category: 'civic', era: 1, footprint: [1, 1], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { pharmacyRadius: 4, community: 1 },
    levels: [level({ cost: { wood: u(12), stone: u(18), gold: u(12) }, buildTicks: 2 * DAY, workerSlots: 1, upkeepGold: u(0.12), requires: { population: 16 } })],
  },
  bakery: {
    id: 'bakery', category: 'production', era: 1, footprint: [1, 1], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    levels: [
      level({ cost: { wood: u(18), stone: u(14), gold: u(6) }, buildTicks: 2 * DAY, workerSlots: 2, produces: { resourceId: 'food', perDay: u(4) }, upkeepGold: u(0.1), requires: { population: 10 } }),
      level({ cost: { wood: u(22), stone: u(20), gold: u(12) }, buildTicks: 2 * DAY, workerSlots: 3, produces: { resourceId: 'food', perDay: u(7) }, upkeepGold: u(0.15), requires: { townCenterLevel: 2 } }),
    ],
  },
  bank: {
    id: 'bank', category: 'governance', era: 2, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { safety: 2, safetyRadius: 3 },
    levels: [level({ cost: { wood: u(25), stone: u(65), gold: u(40) }, buildTicks: 4 * DAY, workerSlots: 3,
      produces: { resourceId: 'gold', perDay: u(3.5) }, storage: { gold: u(150) }, upkeepGold: u(0.3), requires: { population: 22 } })],
  },
  mall: {
    id: 'mall', category: 'civic', era: 4, footprint: [3, 3], validTerrains: LAND,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 6, attraction: 12, marketGold: u(4) },
    levels: [level({ cost: { wood: u(60), stone: u(110), gold: u(80), tools: u(20) }, buildTicks: 6 * DAY, workerSlots: 6,
      produces: { resourceId: 'gold', perDay: u(5) }, upkeepGold: u(0.8), requires: { population: 36 } })],
  },
  villa: {
    id: 'villa', category: 'housing', era: 2, footprint: [1, 1], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    levels: [level({ cost: { wood: u(25), stone: u(30), gold: u(25) }, buildTicks: 3 * DAY, housing: 5, taxIncome: u(1.3), upkeepGold: u(0.12), requires: { population: 18 } })],
  },
  tea_garden: {
    id: 'tea_garden', category: 'civic', era: 1, footprint: [1, 1], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 3, attraction: 2 },
    levels: [level({ cost: { wood: u(15), stone: u(6), gold: u(5) }, buildTicks: 2 * DAY, workerSlots: 1, upkeepGold: u(0.06) })],
  },
  post_office: {
    id: 'post_office', category: 'governance', era: 2, footprint: [1, 1], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 2 },
    levels: [level({ cost: { wood: u(14), stone: u(20), gold: u(12) }, buildTicks: 2 * DAY, workerSlots: 2,
      produces: { resourceId: 'gold', perDay: u(1.5) }, upkeepGold: u(0.1), requires: { population: 16 } })],
  },
  gym: {
    id: 'gym', category: 'civic', era: 3, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 5, attraction: 2 },
    levels: [level({ cost: { wood: u(30), stone: u(45), gold: u(25), tools: u(6) }, buildTicks: 3 * DAY, workerSlots: 2,
      produces: { resourceId: 'gold', perDay: u(1.2) }, upkeepGold: u(0.2), requires: { population: 24 } })],
  },
  kindergarten: {
    id: 'kindergarten', category: 'education', era: 2, footprint: [1, 1], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 3 },
    levels: [level({ cost: { wood: u(18), stone: u(18), gold: u(10) }, buildTicks: 2 * DAY, workerSlots: 2, upkeepGold: u(0.12), requires: { population: 18 } })],
  },
  university: {
    id: 'university', category: 'education', era: 3, footprint: [3, 3], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 3, attraction: 4 },
    levels: [level({ cost: { wood: u(60), stone: u(110), gold: u(60), tools: u(15) }, buildTicks: 6 * DAY, workerSlots: 6,
      produces: { resourceId: 'research', perDay: u(9) }, upkeepGold: u(0.7), requires: { population: 32 } })],
  },
  museum: {
    id: 'museum', category: 'civic', era: 2, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 3, attraction: 9 },
    levels: [level({ cost: { wood: u(30), stone: u(70), gold: u(35) }, buildTicks: 4 * DAY, workerSlots: 2,
      produces: { resourceId: 'research', perDay: u(1.5) }, upkeepGold: u(0.3), requires: { population: 22 } })],
  },
  bazaar: {
    id: 'bazaar', category: 'production', era: 1, footprint: [2, 2], validTerrains: LAND,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { marketGold: u(1.2), community: 2 },
    levels: [level({ cost: { wood: u(25), stone: u(8), gold: u(8) }, buildTicks: 2 * DAY, workerSlots: 3,
      produces: { resourceId: 'food', perDay: u(5) }, upkeepGold: u(0.1), requires: { population: 12 } })],
  },
  hamam: {
    id: 'hamam', category: 'civic', era: 2, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 5, attraction: 5 },
    levels: [level({ cost: { wood: u(25), stone: u(60), gold: u(25) }, buildTicks: 4 * DAY, workerSlots: 2,
      produces: { resourceId: 'gold', perDay: u(1.4) }, upkeepGold: u(0.2), requires: { population: 20 } })],
  },
  library: {
    id: 'library', category: 'education', era: 2, footprint: [1, 1], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 2 },
    levels: [level({ cost: { wood: u(20), stone: u(22), gold: u(10) }, buildTicks: 2 * DAY, workerSlots: 1,
      produces: { resourceId: 'research', perDay: u(1.5) }, upkeepGold: u(0.1), requires: { population: 14 } })],
  },
  wind_turbine: {
    id: 'wind_turbine', category: 'production', era: 3, footprint: [1, 1], validTerrains: ['grass', 'fertile', 'sand', 'hill', 'terrace', 'rocky'],
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    levels: [level({ cost: { wood: u(10), stone: u(30), gold: u(25), tools: u(10) }, buildTicks: 3 * DAY, workerSlots: 1,
      produces: { resourceId: 'gold', perDay: u(1.6) }, upkeepGold: u(0.08), requires: { population: 20 } })],
  },
  solar_farm: {
    id: 'solar_farm', category: 'production', era: 3, footprint: [2, 2], validTerrains: LAND,
    seasonal: true, usesTools: false, buildable: true, demolishable: true,
    levels: [level({ cost: { wood: u(15), stone: u(30), gold: u(35), tools: u(14) }, buildTicks: 3 * DAY, workerSlots: 1,
      produces: { resourceId: 'gold', perDay: u(3) }, upkeepGold: u(0.1), requires: { population: 22 } })],
  },
  bus_depot: {
    id: 'bus_depot', category: 'governance', era: 3, footprint: [2, 2], validTerrains: LAND,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 3 },
    levels: [level({ cost: { wood: u(25), stone: u(50), gold: u(35), tools: u(10) }, buildTicks: 3 * DAY, workerSlots: 3, upkeepGold: u(0.3), requires: { population: 26 } })],
  },
  aquapark: {
    id: 'aquapark', category: 'civic', era: 4, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 7, attraction: 14, marketGold: u(2.5) },
    levels: [level({ cost: { wood: u(40), stone: u(45), gold: u(30) }, buildTicks: 4 * DAY, workerSlots: 3,
      produces: { resourceId: 'gold', perDay: u(3) }, upkeepGold: u(0.35), requires: { population: 18 } }),
      level({ cost: { wood: u(55), stone: u(65), gold: u(45) }, buildTicks: 4 * DAY, workerSlots: 5,
        produces: { resourceId: 'gold', perDay: u(6) }, upkeepGold: u(0.5), requires: { townCenterLevel: 2 } })],
  },
  corporate_plaza: {
    id: 'corporate_plaza', category: 'civic', era: 4, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 5, attraction: 8, marketGold: u(3) },
    levels: [level({ cost: { wood: u(35), stone: u(45), gold: u(20) }, buildTicks: 3 * DAY, workerSlots: 4,
      produces: { resourceId: 'gold', perDay: u(4) }, taxIncome: u(0.8), upkeepGold: u(0.3) }),
      level({ cost: { wood: u(45), stone: u(65), gold: u(35) }, buildTicks: 4 * DAY, workerSlots: 6,
        produces: { resourceId: 'gold', perDay: u(7) }, taxIncome: u(1.2), upkeepGold: u(0.45), requires: { townCenterLevel: 2 } })],
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
    levels: [
      level({ cost: {}, buildTicks: 0, goldIncome: u(1) }),
      level({
        cost: { wood: u(80), stone: u(60), gold: u(20) },
        buildTicks: 6 * DAY,
        goldIncome: u(2),
        requires: { population: 16 },
      }),
    ],
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
    levels: [
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
    ],
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
    levels: [
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
    ],
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
    levels: [
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
    ],
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
    levels: [
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
    ],
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
    levels: [
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
    ],
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
    levels: [
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
    ],
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
    levels: [
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
    ],
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
    levels: [
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
    ],
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
    levels: [
      level({ cost: { wood: u(15), stone: u(25) }, buildTicks: 3 * DAY, workerSlots: 1, upkeepGold: u(0.2) }),
      level({
        cost: { wood: u(20), stone: u(40) },
        buildTicks: 3 * DAY,
        workerSlots: 1,
        upkeepGold: u(0.25),
        requires: { techId: 'masonry' },
      }),
    ],
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
    levels: [
      level({ cost: { wood: u(50), stone: u(35), gold: u(15) }, buildTicks: 4 * DAY, workerSlots: 2, upkeepGold: u(0.4), requires: { population: 16 } }),
      level({ cost: { wood: u(60), stone: u(50), gold: u(25) }, buildTicks: 4 * DAY, workerSlots: 3, upkeepGold: u(0.6), requires: { townCenterLevel: 2 } }),
    ],
  },
  mosque: {
    id: 'mosque', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 3 },
    levels: [level({ cost: { wood: u(24), stone: u(32), gold: u(8) }, buildTicks: 3 * DAY, workerSlots: 1, upkeepGold: u(0.12) })],
  },
  church: {
    id: 'church', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 3 },
    levels: [level({ cost: { wood: u(24), stone: u(32), gold: u(8) }, buildTicks: 3 * DAY, workerSlots: 1, upkeepGold: u(0.12) })],
  },
  theatre: {
    id: 'theatre', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 5, attraction: 8 },
    levels: [level({ cost: { wood: u(45), stone: u(36), gold: u(15) }, buildTicks: 4 * DAY, workerSlots: 2, upkeepGold: u(0.25), requires: { population: 20 } })],
  },
  cinema: {
    id: 'cinema', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 6, attraction: 10 },
    levels: [level({ cost: { wood: u(48), stone: u(45), gold: u(25), tools: u(12) }, buildTicks: 5 * DAY, workerSlots: 2, upkeepGold: u(0.35), requires: { townCenterLevel: 2 } })],
  },
  police_station: {
    id: 'police_station', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { patrolRadius: 5 },
    levels: [level({ cost: { wood: u(30), stone: u(26), gold: u(8) }, buildTicks: 3 * DAY, workerSlots: 2, upkeepGold: u(0.22) })],
  },
  fire_station: {
    id: 'fire_station', category: 'civic', era: 1, footprint: [2, 2], validTerrains: LAND_AND_HILLS,
    seasonal: false, usesTools: false, buildable: true, demolishable: true,
    services: { community: 3 },
    levels: [level({ cost: { wood: u(26), stone: u(28), gold: u(10) }, buildTicks: 3 * DAY, workerSlots: 2, upkeepGold: u(0.25) })],
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
    levels: [
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
    ],
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
    levels: [
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
    ],
  },
};

/** Every ordinary building can be raised to this level; landmarks keep their staged build. */
export const MAX_LEVEL = 5;

/** Population the town square needs for each of its levels 3..5. */
const TOWN_POPULATION: Record<number, number> = { 3: 40, 4: 80, 5: 140 };

const scale = (n: number, k: number): number => Math.round(n * k);
const scaleCost = (c: Cost, k: number): Cost =>
  Object.fromEntries(Object.entries(c).map(([id, n]) => [id, scale((n as number | undefined) ?? 0, k)])) as Cost;

/**
 * Levels beyond the ones written out above, up to MAX_LEVEL. Each step costs about 1.6 times the
 * previous one (with a little gold from level 3 on), takes a bit longer to build and gives about
 * a quarter more of everything the building does. Level n of a building needs a town square of
 * level n; the town square itself needs a bigger population.
 */
function extendLevels(def: BuildingDefinition): BuildingDefinition {
  const levels = [...def.levels];
  while (levels.length < MAX_LEVEL) {
    const n = levels.length + 1;
    const prev = levels[levels.length - 1]!;
    const base = Object.keys(prev.cost).length ? prev.cost : { wood: u(60), stone: u(50), gold: u(20) };
    const cost = scaleCost(base, 1.6);
    if (n >= 3 && !cost.gold) cost.gold = u(10 * (n - 2));
    levels.push({
      cost,
      buildTicks: Math.max(2 * DAY, scale(prev.buildTicks, 1.2)),
      workerSlots: prev.workerSlots ? prev.workerSlots + 1 : 0,
      housing: prev.housing ? Math.ceil(prev.housing * 1.3) : 0,
      storage: scaleCost(prev.storage, 1.3),
      ...(prev.produces ? { produces: { ...prev.produces, perDay: scale(prev.produces.perDay, 1.25) } } : {}),
      goldIncome: scale(prev.goldIncome, 1.3),
      taxIncome: scale(prev.taxIncome, 1.3),
      upkeepGold: scale(prev.upkeepGold, 1.2),
      requires: def.id === 'town_center'
        ? { population: TOWN_POPULATION[n] ?? 40 * (n - 2) }
        : { ...(prev.requires?.techId ? { techId: prev.requires.techId } : {}), townCenterLevel: n },
    });
  }
  return { ...def, levels };
}

const RAISED = Object.fromEntries(
  Object.entries(CORE).map(([id, def]) => [id, extendLevels(def)]),
) as typeof CORE;

export const BUILDINGS: Record<BuildingId, BuildingDefinition> = { ...RAISED, ...LANDMARKS };


export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const BUILDABLE_IDS = BUILDING_IDS.filter((id) => BUILDINGS[id].buildable);

export const defOf = (b: Pick<BuildingInstance, 'definitionId'>): BuildingDefinition =>
  BUILDINGS[b.definitionId];
/** Spec of the building's current completed level. */
export const specOf = (b: Pick<BuildingInstance, 'definitionId' | 'level'>): LevelSpec =>
  BUILDINGS[b.definitionId].levels[b.level - 1]!;
