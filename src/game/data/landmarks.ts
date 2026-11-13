import { u } from '../core/fixed';
import type { BuildingDefinition, Cost, LandmarkId, LandmarkSpec, TerrainId } from '../core/types';

/**
 * Historic landmarks. They are inspired by real monuments (simplified, original sprites), need
 * special terrain that placement really checks, are built in paid stages by assigned builders and
 * feed tourism and culture. One of each per city.
 */
const DAY = 24;

function landmark(
  id: LandmarkId,
  footprint: readonly [number, number],
  validTerrains: readonly TerrainId[],
  spec: LandmarkSpec,
  slope = false,
  curators = 2,
): BuildingDefinition {
  const first: Cost = spec.stages[0]!.cost;
  return {
    id,
    category: 'landmark',
    era: 1,
    footprint,
    validTerrains,
    seasonal: false,
    usesTools: false,
    buildable: true,
    demolishable: false,
    allowSlope: slope,
    landmark: spec,
    levels: [
      {
        cost: first,
        buildTicks: spec.stages.reduce((sum, st) => sum + st.days * DAY, 0),
        workerSlots: curators,
        housing: 0,
        storage: {},
        goldIncome: 0,
        taxIncome: 0,
        upkeepGold: u(0.6),
        requires: spec.requires,
      },
    ],
  };
}

const stage = (days: number, cost: Cost): { days: number; cost: Cost } => ({ days, cost });

export const LANDMARKS = {
  edinburgh_castle: landmark('edinburgh_castle', [3, 3], ['rocky'], {
    culture: 'scottish',
    site: 'crag',
    builders: 6,
    requires: { townCenterLevel: 2, population: 45, techId: 'architecture' },
    stages: [
      stage(8, { stone: u(100), wood: u(30), gold: u(25), research: u(15) }),
      stage(8, { stone: u(110), wood: u(40), gold: u(25) }),
      stage(8, { stone: u(100), wood: u(50), gold: u(30) }),
      stage(8, { stone: u(60), wood: u(30), gold: u(40) }),
    ],
    attraction: 30,
    culturePerDay: u(3),
    safety: 25,
    happiness: 3,
    museumGold: u(0.35),
    researchPerDay: 0,
  }),
  stirling_castle: landmark('stirling_castle', [3, 3], ['rocky', 'hill'], {
    culture: 'scottish',
    site: 'castleHill',
    builders: 5,
    requires: { townCenterLevel: 2, population: 35, techId: 'architecture' },
    stages: [
      stage(7, { stone: u(90), wood: u(40), gold: u(20), research: u(10) }),
      stage(7, { stone: u(90), wood: u(50), gold: u(20) }),
      stage(7, { stone: u(70), wood: u(40), gold: u(30) }),
    ],
    attraction: 22,
    culturePerDay: u(2),
    safety: 20,
    happiness: 2,
    museumGold: u(0.3),
    researchPerDay: 0,
  }),
  scott_monument: landmark('scott_monument', [2, 2], ['grass'], {
    culture: 'scottish',
    site: 'cityGarden',
    builders: 4,
    requires: { townCenterLevel: 2, population: 30, techId: 'architecture' },
    stages: [
      stage(6, { stone: u(60), wood: u(20), gold: u(25), research: u(10) }),
      stage(6, { stone: u(70), wood: u(15), gold: u(25) }),
      stage(6, { stone: u(50), gold: u(30) }),
    ],
    attraction: 16,
    culturePerDay: u(4),
    safety: 0,
    happiness: 4,
    museumGold: u(0.2),
    researchPerDay: 0,
  }),
  sumela_monastery: landmark(
    'sumela_monastery',
    [3, 2],
    ['rocky', 'mountain'],
    {
      culture: 'turkish',
      site: 'mountainside',
      builders: 6,
      requires: { townCenterLevel: 2, population: 40, techId: 'architecture' },
      stages: [
        stage(8, { stone: u(90), wood: u(60), gold: u(20), research: u(15) }),
        stage(8, { stone: u(90), wood: u(60), gold: u(25) }),
        stage(8, { stone: u(70), wood: u(50), gold: u(30) }),
        stage(8, { stone: u(40), wood: u(40), gold: u(35) }),
      ],
      attraction: 28,
      culturePerDay: u(4),
      safety: 0,
      happiness: 2,
      museumGold: u(0.3),
      researchPerDay: u(1),
    },
    true,
  ),
  galata_tower: landmark('galata_tower', [2, 2], ['hill', 'rocky'], {
    culture: 'turkish',
    site: 'hilltopWater',
    builders: 4,
    requires: { townCenterLevel: 2, population: 30, techId: 'architecture' },
    stages: [
      stage(7, { stone: u(80), wood: u(20), gold: u(20), research: u(10) }),
      stage(7, { stone: u(80), wood: u(20), gold: u(25) }),
      stage(7, { stone: u(40), wood: u(30), gold: u(30) }),
    ],
    attraction: 20,
    culturePerDay: u(2),
    safety: 12,
    happiness: 2,
    museumGold: u(0.25),
    researchPerDay: 0,
  }),
  selimiye_mosque: landmark('selimiye_mosque', [4, 4], ['grass', 'fertile', 'sand', 'terrace'], {
    culture: 'turkish',
    site: 'grandPlain',
    builders: 8,
    requires: { townCenterLevel: 2, population: 50, techId: 'architecture' },
    stages: [
      stage(9, { stone: u(120), wood: u(40), gold: u(30), research: u(20) }),
      stage(9, { stone: u(120), wood: u(40), gold: u(35) }),
      stage(9, { stone: u(110), wood: u(30), gold: u(40) }),
      stage(9, { stone: u(70), wood: u(20), gold: u(50) }),
    ],
    attraction: 32,
    culturePerDay: u(5),
    safety: 0,
    happiness: 5,
    museumGold: u(0.25),
    researchPerDay: 0,
  }),
} as Record<LandmarkId, BuildingDefinition>;

// modern-era addition: a football stadium on reclaimed coastal land (inspired by Trabzon's)
LANDMARKS.trabzon_stadium = landmark('trabzon_stadium', [4, 4], ['grass', 'sand'], {
  culture: 'turkish',
  site: 'coastalPlain',
  builders: 8,
  requires: { townCenterLevel: 2, population: 55, techId: 'architecture' },
  stages: [
    stage(8, { stone: u(120), wood: u(40), gold: u(40), research: u(15) }),
    stage(8, { stone: u(120), wood: u(60), gold: u(45) }),
    stage(8, { stone: u(80), wood: u(80), gold: u(50), tools: u(20) }),
  ],
  attraction: 18,
  culturePerDay: u(2),
  safety: 0,
  happiness: 6,
  museumGold: u(0.45),
  researchPerDay: 0,
});

export const LANDMARK_IDS = Object.keys(LANDMARKS) as LandmarkId[];
export const isLandmarkId = (id: string): id is LandmarkId => id in LANDMARKS;
