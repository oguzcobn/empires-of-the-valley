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


/**
 * Forty independently placeable historic landmarks from the city-expansion package.
 * The data uses the package's original footprints, culture/site requirements, tourism,
 * culture, safety, happiness, museum and research values; construction stages match
 * the supplied three-stage specification. Existing IDs and saves remain unchanged.
 */
const CITY_LANDMARK_DATA = [
  ["trabzon_ayasofya",3,3,"turkish","grandPlain",24,4,0,4,0.35,0.5],
  ["ataturk_kosku",2,2,"turkish","cityGarden",20,3,0,5,0.3,0],
  ["trabzon_kalesi",3,3,"turkish","grandPlain",26,3,22,3,0.28,0],
  ["gulbahar_hatun",3,3,"turkish","grandPlain",25,4,0,5,0.26,0.4],
  ["bedesten_trabzon",3,2,"turkish","cityGarden",21,3,0,3,0.45,0],
  ["kizlar_manastiri",3,2,"turkish","grandPlain",22,4,0,3,0.3,0.6],
  ["vazelon_manastiri",3,2,"turkish","grandPlain",23,4,0,3,0.3,0.8],
  ["kostaki_konagi",2,2,"turkish","cityGarden",19,4,0,4,0.34,0.4],
  ["ortahisar_fatih",3,3,"turkish","grandPlain",24,4,0,4,0.28,0.3],
  ["alacahan_trabzon",3,2,"turkish","cityGarden",20,3,0,3,0.42,0],
  ["holyrood_palace",3,3,"scottish","grandPlain",28,4,10,5,0.4,0],
  ["st_giles_cathedral",3,3,"scottish","grandPlain",26,5,0,5,0.32,0.5],
  ["national_monument_calton",3,2,"scottish","grandPlain",24,4,0,4,0.3,0.4],
  ["nelson_monument",2,2,"scottish","cityGarden",18,3,8,3,0.25,0],
  ["craigmillar_castle",3,3,"scottish","grandPlain",23,3,20,3,0.28,0],
  ["balmoral_clock",2,2,"scottish","cityGarden",22,3,0,4,0.42,0],
  ["national_gallery_scotland",3,2,"scottish","cityGarden",25,5,0,5,0.36,0.7],
  ["dugald_stewart",2,2,"scottish","cityGarden",17,4,0,4,0.24,0.3],
  ["forth_bridge_tower",3,2,"scottish","grandPlain",27,4,0,4,0.44,0.6],
  ["dean_village_mill",2,2,"scottish","cityGarden",19,3,0,4,0.3,0],
  ["kinkakuji",3,3,"japanese","grandPlain",32,5,0,6,0.45,0.5],
  ["kiyomizu_dera",3,3,"japanese","grandPlain",30,5,0,5,0.42,0.5],
  ["fushimi_inari",3,2,"japanese","grandPlain",29,4,0,5,0.4,0],
  ["ginkakuji",2,2,"japanese","cityGarden",24,5,0,5,0.34,0.6],
  ["toji_pagoda",2,2,"japanese","grandPlain",27,4,0,4,0.35,0.4],
  ["nijo_castle",3,3,"japanese","grandPlain",28,4,18,4,0.38,0],
  ["yasaka_pagoda",2,2,"japanese","cityGarden",23,4,0,4,0.32,0],
  ["heian_shrine",3,2,"japanese","grandPlain",26,4,0,5,0.36,0.3],
  ["byodoin_phoenix",3,2,"japanese","grandPlain",27,5,0,5,0.38,0.4],
  ["ryoanji_garden",2,2,"japanese","cityGarden",22,5,0,6,0.3,0.8],
  ["prague_castle",3,3,"medieval_european","grandPlain",32,5,22,5,0.45,0.4],
  ["st_vitus_cathedral",3,3,"medieval_european","grandPlain",31,5,0,5,0.4,0.6],
  ["charles_bridge_tower",2,2,"medieval_european","cityGarden",26,4,12,4,0.38,0],
  ["astronomical_clock",2,2,"medieval_european","cityGarden",29,5,0,5,0.44,0.8],
  ["tyn_church",3,2,"medieval_european","grandPlain",27,4,0,4,0.35,0.3],
  ["powder_tower",2,2,"medieval_european","cityGarden",22,3,14,3,0.3,0],
  ["dancing_house",2,2,"medieval_european","cityGarden",24,4,0,4,0.42,0.5],
  ["petrin_tower",2,2,"medieval_european","grandPlain",23,3,6,4,0.36,0.4],
  ["vysehrad_basilica",3,2,"medieval_european","grandPlain",25,4,10,4,0.32,0.3],
  ["national_theatre_prague",3,2,"medieval_european","cityGarden",28,5,0,6,0.42,0.5],
] as const;

for (const [id, width, depth, culture, site, attraction, culturePerDay, safety, happiness, museumGold, researchPerDay] of CITY_LANDMARK_DATA) {
  LANDMARKS[id] = landmark(id, [width, depth], ['grass', 'fertile', 'sand', 'hill', 'terrace'], {
    culture, site, builders: 5,
    requires: { townCenterLevel: 2, population: 30, techId: 'architecture' },
    stages: [
      stage(6, { stone: u(75), wood: u(35), gold: u(25), research: u(10) }),
      stage(6, { stone: u(80), wood: u(35), gold: u(30) }),
      stage(6, { stone: u(60), wood: u(30), gold: u(35) }),
    ],
    attraction, culturePerDay: u(culturePerDay), safety, happiness,
    museumGold: u(museumGold), researchPerDay: u(researchPerDay),
  });
}

export const LANDMARK_IDS = Object.keys(LANDMARKS) as LandmarkId[];
export const isLandmarkId = (id: string): id is LandmarkId => id in LANDMARKS;
