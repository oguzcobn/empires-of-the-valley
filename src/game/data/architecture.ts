import type {
  ArchitectureStyle,
  BalconyType,
  BuildingId,
  BuildingLook,
  ChimneyType,
  CourtyardType,
  DecorType,
  DoorType,
  FacadeColor,
  GardenType,
  ResourceId,
  RoofMaterial,
  RoofType,
  TowerType,
  WallMaterial,
  WindowType,
} from '../core/types';

/**
 * Architecture data: cultures, workshop options and material rules. Everything that changes the
 * simulation (cost, durability, culture bonuses) is a number here, so balance stays testable and
 * new cultures are content, not code.
 */

export const ALL_STYLES: readonly ArchitectureStyle[] = ['scottish', 'turkish', 'japanese', 'medieval_european'];

export const ROOF_TYPES: readonly RoofType[] = ['gable', 'crow_step', 'hip', 'pyramid', 'flat', 'dome'];
export const ROOF_MATERIALS: readonly RoofMaterial[] = ['slate', 'clay', 'thatch', 'shingle', 'lead', 'earth'];
export const WALL_MATERIALS: readonly WallMaterial[] = [
  'granite',
  'sandstone',
  'harl',
  'timber_frame',
  'stone_timber',
  'plaster',
  'brick',
  'wood',
];
export const FACADE_COLORS: readonly FacadeColor[] = [
  'white',
  'cream',
  'ochre',
  'rose',
  'sky',
  'sage',
  'grey',
  'honey',
  'terracotta',
  'umber',
];
export const WINDOW_TYPES: readonly WindowType[] = ['sash', 'small', 'arched', 'latticed', 'bay'];
export const DOOR_TYPES: readonly DoorType[] = ['plank', 'arched', 'double', 'fanlight'];
export const TOWER_TYPES: readonly TowerType[] = ['none', 'turret', 'square', 'clock', 'bell'];
export const BALCONY_TYPES: readonly BalconyType[] = ['none', 'cumba', 'iron', 'gallery'];
export const CHIMNEY_TYPES: readonly ChimneyType[] = ['none', 'gable', 'twin', 'central'];
export const GARDEN_TYPES: readonly GardenType[] = ['none', 'hedge', 'orchard', 'flowers'];
export const COURTYARD_TYPES: readonly CourtyardType[] = ['none', 'avlu', 'well'];
export const DECOR_TYPES: readonly DecorType[] = ['none', 'flowerboxes', 'lanterns', 'banners'];
export const FLOOR_OPTIONS: readonly BuildingLook['floors'][] = [1, 2, 3, 4];

/** Facade paint colours (lime wash, harling and plaster tones). Rendering only. */
export const FACADE_HEX: Record<FacadeColor, number> = {
  white: 0xf3efe6,
  cream: 0xeee2c4,
  ochre: 0xd9b56e,
  rose: 0xe3b7a6,
  sky: 0xb9d1dc,
  sage: 0xbdc9a6,
  grey: 0xb9b9b2,
  honey: 0xe2c07c,
  terracotta: 0xc9805e,
  umber: 0x9a7356,
};

/** Material rules: cost multipliers (permille) and durability (decay multiplier, permille). */
export interface MaterialRule {
  cost: Partial<Record<ResourceId, number>>;
  decay: number;
}

export const WALL_RULES: Record<WallMaterial, MaterialRule> = {
  granite: { cost: { stone: 1150, wood: 900 }, decay: 700 },
  sandstone: { cost: { stone: 1100, wood: 900 }, decay: 800 },
  harl: { cost: { stone: 1050, wood: 950 }, decay: 850 },
  brick: { cost: { stone: 1050 }, decay: 900 },
  plaster: { cost: {}, decay: 1000 },
  stone_timber: { cost: { wood: 1050 }, decay: 950 },
  timber_frame: { cost: { wood: 1100, stone: 900 }, decay: 1100 },
  wood: { cost: { wood: 1150, stone: 850 }, decay: 1200 },
};

export const ROOF_RULES: Record<RoofMaterial, MaterialRule> = {
  slate: { cost: { stone: 1050 }, decay: 900 },
  clay: { cost: {}, decay: 1000 },
  lead: { cost: { gold: 1100 }, decay: 850 },
  shingle: { cost: { wood: 1050 }, decay: 1100 },
  thatch: { cost: { wood: 950 }, decay: 1200 },
  earth: { cost: { wood: 950, stone: 950 }, decay: 1150 },
};

/** Base structural decay in basis points per day (10000 = full condition). */
export const BASE_DECAY_PER_DAY = 14;
export const CONDITION_MAX = 10000;
/** Below these thresholds a worn building produces less (never stops: no death spiral). */
export const CONDITION_WORN = 5000;
export const CONDITION_POOR = 2500;
/** Repairing from 0 to full costs this share of the building's level-1 cost (wood/stone) plus gold. */
export const REPAIR_COST_PERMILLE = 400;
export const REPAIR_GOLD_PER_FULL = 4000;
/** Changing an existing building's culture or design costs this share of its level-1 cost. */
export const RESTYLE_COST_PERMILLE = 250;
export const RESTYLE_GOLD = 2000;

export interface CultureBonuses {
  /** Multiplies decay of every building in this style. */
  decayPermille: number;
  /** Multiplies repair costs. */
  repairPermille: number;
  /** Multiplies research output of schools in this style. */
  schoolPermille: number;
  /** Multiplies market gold income (market buildings arrive with the tourism update). */
  marketPermille: number;
  /** Extra beds per inn level. */
  innBeds: number;
  /** Extra tiles of watchtower safety radius. */
  watchRadius: number;
}

export interface CultureDefinition {
  id: ArchitectureStyle;
  implemented: boolean;
  /** Accent colours for flags, UI chips and previews. */
  accent: number;
  flag: number;
  bonuses: CultureBonuses;
}

const NEUTRAL: CultureBonuses = {
  decayPermille: 1000,
  repairPermille: 1000,
  schoolPermille: 1000,
  marketPermille: 1000,
  innBeds: 0,
  watchRadius: 0,
};

/**
 * Bonuses are small and asymmetric but deliberately balanced: Scotland favours long-lived stone
 * towns, defence and learning; Turkey favours trade, hospitality and cheap craftsmanship.
 */
export const CULTURES: Record<ArchitectureStyle, CultureDefinition> = {
  scottish: {
    id: 'scottish',
    implemented: true,
    accent: 0x3d5a80,
    flag: 0x2f5fa7,
    bonuses: { ...NEUTRAL, decayPermille: 750, schoolPermille: 1100, watchRadius: 1 },
  },
  turkish: {
    id: 'turkish',
    implemented: true,
    accent: 0xb5452f,
    flag: 0xd23a32,
    bonuses: { ...NEUTRAL, repairPermille: 750, marketPermille: 1200, innBeds: 2 },
  },
  japanese: { id: 'japanese', implemented: false, accent: 0x8a3a3a, flag: 0xc0392b, bonuses: NEUTRAL },
  medieval_european: {
    id: 'medieval_european',
    implemented: false,
    accent: 0x6b5b3a,
    flag: 0x8e6c2f,
    bonuses: NEUTRAL,
  },
};

/** Cultures with complete content. Extend this union when a new culture is finished. */
export type PlayableStyle = Extract<ArchitectureStyle, 'scottish' | 'turkish'>;
export const PLAYABLE_STYLES = ALL_STYLES.filter((s) => CULTURES[s].implemented) as readonly PlayableStyle[];
export const isPlayableStyle = (s: unknown): s is ArchitectureStyle =>
  typeof s === 'string' && (PLAYABLE_STYLES as readonly string[]).includes(s);

/** Culture for buildings that come from saves made before architecture existed. */
export const LEGACY_STYLE: ArchitectureStyle = 'turkish';

const look = (l: Partial<BuildingLook> & Pick<BuildingLook, 'wall' | 'roofMaterial'>): BuildingLook => ({
  floors: 1,
  roof: 'gable',
  facade: 'cream',
  windows: 'small',
  door: 'plank',
  tower: 'none',
  balcony: 'none',
  chimney: 'none',
  garden: 'none',
  courtyard: 'none',
  decor: 'none',
  ...l,
});

type LookTable = Record<BuildingId, readonly BuildingLook[]>;

/** Default looks per building and level (index = level - 1). Last entry repeats for higher levels. */
export const DEFAULT_LOOKS: Partial<Record<ArchitectureStyle, LookTable>> = {
  scottish: {
    // Highland stone cottage -> stone farmhouse -> Georgian town house
    hut: [
      look({ wall: 'granite', roofMaterial: 'thatch', roof: 'gable', chimney: 'gable', facade: 'grey' }),
      look({
        floors: 2,
        wall: 'granite',
        roofMaterial: 'slate',
        roof: 'gable',
        windows: 'sash',
        chimney: 'twin',
        garden: 'hedge',
        facade: 'grey',
      }),
      look({
        floors: 3,
        wall: 'sandstone',
        roofMaterial: 'slate',
        roof: 'hip',
        windows: 'sash',
        door: 'fanlight',
        chimney: 'twin',
        decor: 'flowerboxes',
        facade: 'honey',
      }),
    ],
    town_center: [
      look({
        floors: 2,
        wall: 'harl',
        roofMaterial: 'slate',
        roof: 'crow_step',
        windows: 'sash',
        tower: 'clock',
        chimney: 'gable',
        facade: 'white',
      }),
      look({
        floors: 3,
        wall: 'sandstone',
        roofMaterial: 'slate',
        roof: 'crow_step',
        windows: 'sash',
        door: 'arched',
        tower: 'clock',
        chimney: 'twin',
        decor: 'banners',
        facade: 'honey',
      }),
    ],
    warehouse: [
      look({ floors: 2, wall: 'granite', roofMaterial: 'slate', roof: 'gable', door: 'double', facade: 'grey' }),
      look({ floors: 2, wall: 'sandstone', roofMaterial: 'slate', roof: 'gable', door: 'double', windows: 'sash', facade: 'honey' }),
    ],
    granary: [
      look({ floors: 2, wall: 'harl', roofMaterial: 'slate', roof: 'crow_step', door: 'plank', facade: 'white' }),
      look({ floors: 2, wall: 'granite', roofMaterial: 'slate', roof: 'crow_step', door: 'double', facade: 'grey' }),
    ],
    school: [
      look({ floors: 1, wall: 'harl', roofMaterial: 'slate', roof: 'gable', windows: 'arched', door: 'arched', tower: 'bell', facade: 'white' }),
      look({ floors: 2, wall: 'sandstone', roofMaterial: 'slate', roof: 'gable', windows: 'arched', door: 'arched', tower: 'bell', chimney: 'gable', facade: 'honey' }),
    ],
    lumber_camp: [
      look({ wall: 'wood', roofMaterial: 'slate', roof: 'gable', facade: 'umber' }),
      look({ wall: 'wood', roofMaterial: 'slate', roof: 'gable', chimney: 'gable', facade: 'umber' }),
    ],
    farm: [
      look({ wall: 'granite', roofMaterial: 'slate', roof: 'gable', door: 'double', facade: 'grey' }),
      look({ floors: 2, wall: 'granite', roofMaterial: 'slate', roof: 'gable', door: 'double', facade: 'grey' }),
    ],
    quarry: [
      look({ wall: 'granite', roofMaterial: 'slate', roof: 'gable', facade: 'grey' }),
      look({ wall: 'granite', roofMaterial: 'slate', roof: 'gable', chimney: 'gable', facade: 'grey' }),
    ],
  },
  turkish: {
    // Anatolian village house -> Black Sea timber house -> Safranbolu mansion
    hut: [
      look({ wall: 'plaster', roofMaterial: 'earth', roof: 'flat', windows: 'small', facade: 'ochre', chimney: 'central' }),
      look({
        floors: 2,
        wall: 'stone_timber',
        roofMaterial: 'shingle',
        roof: 'hip',
        windows: 'latticed',
        chimney: 'central',
        garden: 'orchard',
        facade: 'umber',
      }),
      look({
        floors: 3,
        wall: 'timber_frame',
        roofMaterial: 'clay',
        roof: 'hip',
        windows: 'latticed',
        balcony: 'cumba',
        door: 'double',
        chimney: 'central',
        decor: 'flowerboxes',
        facade: 'white',
      }),
    ],
    town_center: [
      look({
        floors: 2,
        wall: 'plaster',
        roofMaterial: 'clay',
        roof: 'hip',
        windows: 'arched',
        door: 'arched',
        tower: 'clock',
        courtyard: 'well',
        facade: 'cream',
      }),
      look({
        floors: 3,
        wall: 'sandstone',
        roofMaterial: 'clay',
        roof: 'hip',
        windows: 'arched',
        door: 'arched',
        tower: 'clock',
        balcony: 'gallery',
        courtyard: 'avlu',
        decor: 'banners',
        facade: 'honey',
      }),
    ],
    warehouse: [
      look({ floors: 2, wall: 'sandstone', roofMaterial: 'clay', roof: 'hip', door: 'arched', windows: 'small', facade: 'honey' }),
      look({ floors: 2, wall: 'sandstone', roofMaterial: 'lead', roof: 'dome', door: 'arched', windows: 'arched', facade: 'honey' }),
    ],
    granary: [
      // the serender: a Black Sea granary raised on posts
      look({ floors: 1, wall: 'wood', roofMaterial: 'shingle', roof: 'hip', door: 'plank', facade: 'umber' }),
      look({ floors: 2, wall: 'stone_timber', roofMaterial: 'clay', roof: 'hip', door: 'double', facade: 'umber' }),
    ],
    school: [
      // the medrese: a courtyard school with domes and arched cells
      look({ floors: 1, wall: 'sandstone', roofMaterial: 'lead', roof: 'dome', windows: 'arched', door: 'arched', courtyard: 'avlu', facade: 'honey' }),
      look({ floors: 2, wall: 'sandstone', roofMaterial: 'lead', roof: 'dome', windows: 'arched', door: 'arched', courtyard: 'avlu', decor: 'lanterns', facade: 'honey' }),
    ],
    lumber_camp: [
      look({ wall: 'wood', roofMaterial: 'shingle', roof: 'hip', facade: 'umber' }),
      look({ wall: 'wood', roofMaterial: 'clay', roof: 'hip', chimney: 'central', facade: 'umber' }),
    ],
    farm: [
      look({ wall: 'stone_timber', roofMaterial: 'clay', roof: 'hip', door: 'double', facade: 'umber' }),
      look({ floors: 2, wall: 'stone_timber', roofMaterial: 'clay', roof: 'hip', door: 'double', facade: 'umber' }),
    ],
    quarry: [
      look({ wall: 'sandstone', roofMaterial: 'clay', roof: 'hip', facade: 'honey' }),
      look({ wall: 'sandstone', roofMaterial: 'clay', roof: 'hip', chimney: 'central', facade: 'honey' }),
    ],
  },
};

export function defaultLook(style: ArchitectureStyle, id: BuildingId, level: number): BuildingLook {
  const table = (DEFAULT_LOOKS[style] ?? DEFAULT_LOOKS[LEGACY_STYLE])!;
  const levels = table[id];
  return levels[Math.max(0, Math.min(levels.length - 1, level - 1))]!;
}

/** Building types whose appearance the Architecture Workshop can design. */
export const DESIGNABLE: readonly BuildingId[] = ['hut', 'warehouse', 'granary', 'school'];
