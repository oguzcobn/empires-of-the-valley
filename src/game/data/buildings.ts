import { u } from '../core/fixed';
import type { BuildingDefinition, BuildingId, BuildingInstance, LandmarkId, LevelSpec, TerrainId } from '../core/types';
import { LANDMARKS } from './landmarks';

const DAY = 24;
const LAND: readonly TerrainId[] = ['grass', 'fertile', 'sand'];
/** Small buildings may also stand on hills and on terraces (flat footprint required). */
const LAND_AND_HILLS: readonly TerrainId[] = ['grass', 'fertile', 'sand', 'hill', 'terrace'];

function level(partial: Partial<LevelSpec> & Pick<LevelSpec, 'cost' | 'buildTicks'>): LevelSpec {
  return { workerSlots: 0, housing: 0, storage: {}, goldIncome: 0, taxIncome: 0, upkeepGold: 0, ...partial };
}

/** Data-driven building catalog: the village (Phase 1), terraces and the historic landmarks. */
const CORE: Record<Exclude<BuildingId, LandmarkId>, BuildingDefinition> = {
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

export const BUILDINGS: Record<BuildingId, BuildingDefinition> = { ...CORE, ...LANDMARKS };

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const BUILDABLE_IDS = BUILDING_IDS.filter((id) => BUILDINGS[id].buildable);

export const defOf = (b: Pick<BuildingInstance, 'definitionId'>): BuildingDefinition =>
  BUILDINGS[b.definitionId];
/** Spec of the building's current completed level. */
export const specOf = (b: Pick<BuildingInstance, 'definitionId' | 'level'>): LevelSpec =>
  BUILDINGS[b.definitionId].levels[b.level - 1]!;
