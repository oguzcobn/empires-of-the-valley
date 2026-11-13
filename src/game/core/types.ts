import type { TKey } from '../../i18n/tr';
import type { CityId } from '../data/cities';

export type ResourceId = 'wood' | 'stone' | 'food' | 'gold' | 'tools' | 'research';
export const RESOURCE_IDS: readonly ResourceId[] = ['wood', 'stone', 'food', 'gold', 'tools', 'research'];

export type LandmarkId =
  | 'edinburgh_castle'
  | 'stirling_castle'
  | 'scott_monument'
  | 'sumela_monastery'
  | 'galata_tower'
  | 'selimiye_mosque'
  | 'trabzon_stadium';

export type BuildingId =
  | 'town_center'
  | 'hut'
  | 'warehouse'
  | 'lumber_camp'
  | 'farm'
  | 'quarry'
  | 'granary'
  | 'school'
  | 'terrace_farm'
  | 'market'
  | 'inn'
  | 'watchtower'
  | 'shipyard'
  | LandmarkId;

export type VesselKind = 'fishing' | 'cargo' | 'yacht';

/**
 * Terrain. `water` is a river (bridgeable), `lake` is still water (not bridgeable); `hill`,
 * `rocky` and `mountain` are raised ground; `terrace` is a hill tile levelled behind a stone
 * retaining wall by the player.
 */
export type TerrainId =
  | 'grass'
  | 'fertile'
  | 'forest'
  | 'water'
  | 'stone'
  | 'sand'
  | 'hill'
  | 'rocky'
  | 'mountain'
  | 'terrace'
  | 'lake';

/** Road structure chosen automatically from the terrain it crosses. */
export type RoadType = 'dirt' | 'bridge' | 'stairs' | 'mountain' | 'tunnel';

/**
 * Architectural cultures. The union already names the next cultures so content can be added
 * without a save-format change; only cultures marked `implemented` in data/architecture.ts are
 * playable (validated on every command and save).
 */
export type ArchitectureStyle = 'scottish' | 'turkish' | 'japanese' | 'medieval_european';

export type RoofType = 'gable' | 'crow_step' | 'hip' | 'pyramid' | 'flat' | 'dome';
export type RoofMaterial = 'slate' | 'clay' | 'thatch' | 'shingle' | 'lead' | 'earth';
export type WallMaterial =
  | 'granite'
  | 'sandstone'
  | 'harl'
  | 'timber_frame'
  | 'stone_timber'
  | 'plaster'
  | 'brick'
  | 'wood';
export type FacadeColor =
  'white' | 'cream' | 'ochre' | 'rose' | 'sky' | 'sage' | 'grey' | 'honey' | 'terracotta' | 'umber';
export type WindowType = 'sash' | 'small' | 'arched' | 'latticed' | 'bay';
export type DoorType = 'plank' | 'arched' | 'double' | 'fanlight';
export type TowerType = 'none' | 'turret' | 'square' | 'clock' | 'bell';
export type BalconyType = 'none' | 'cumba' | 'iron' | 'gallery';
export type ChimneyType = 'none' | 'gable' | 'twin' | 'central';
export type GardenType = 'none' | 'hedge' | 'orchard' | 'flowers';
export type CourtyardType = 'none' | 'avlu' | 'well';
export type DecorType = 'none' | 'flowerboxes' | 'lanterns' | 'banners';

/** Parametric appearance of a building. Materials also change cost and durability (data-driven). */
export interface BuildingLook {
  floors: 1 | 2 | 3 | 4;
  roof: RoofType;
  roofMaterial: RoofMaterial;
  wall: WallMaterial;
  facade: FacadeColor;
  windows: WindowType;
  door: DoorType;
  tower: TowerType;
  balcony: BalconyType;
  chimney: ChimneyType;
  garden: GardenType;
  courtyard: CourtyardType;
  decor: DecorType;
}
export type TechId = 'basic_agriculture' | 'forestry' | 'masonry' | 'storage' | 'literacy' | 'architecture';
export type QuestId = 'q01' | 'q02' | 'q03' | 'q04' | 'q05' | 'q06' | 'q07' | 'q08' | 'q09' | 'q10' | 'q11' | 'q12' | 'q13' | 'q14' | 'q15' | 'q16';
export type ProvinceId = string;
export type FactionId = string;
export type GameSpeed = 0 | 1 | 2 | 4;
export type TaxRate = 'low' | 'normal' | 'high';
export type GameMode = 'campaign' | 'sandbox';

/** Quantities are integer milli-units (see core/fixed.ts). */
export type ResourceMap = Record<ResourceId, number>;
export type Cost = Partial<ResourceMap>;

export interface Tile {
  terrain: TerrainId;
  /** Remaining harvestable stock (wood for forest, stone for deposits), milli-units. */
  deposit: number;
  road: boolean;
  /** Structure of the road on this tile (meaningful when `road`). */
  roadType: RoadType;
  /** Optional paved overlay; old saves remain valid as unpaved roads. */
  paved?: boolean;
  buildingId: string | null;
  /** Visual variation only (0..3). */
  variant: number;
  /** Ground elevation in levels (0 = valley floor .. 4 = high mountain). */
  height: number;
}

// ---------------------------------------------------------------- content definitions (immutable)

export interface LevelRequirement {
  townCenterLevel?: number;
  population?: number;
  techId?: TechId;
}

export interface LevelSpec {
  cost: Cost;
  buildTicks: number;
  workerSlots: number;
  housing: number;
  /** Total storage granted at this level. */
  storage: Cost;
  /** Output per day with all worker slots filled. */
  produces?: { resourceId: ResourceId; perDay: number };
  /** Gold per day generated without workers (town center). */
  goldIncome: number;
  /** Gold per day at normal tax when fully occupied (housing). */
  taxIncome: number;
  upkeepGold: number;
  requires?: LevelRequirement;
}

export type BuildingCategory =
  'housing' | 'production' | 'storage' | 'education' | 'governance' | 'landmark';

/** Special terrain rule of a landmark, checked for real by placement (see systems/placement.ts). */
export type SiteRule =
  'crag' | 'castleHill' | 'cityGarden' | 'mountainside' | 'hilltopWater' | 'grandPlain' | 'coastalPlain';

export interface LandmarkStage {
  cost: Cost;
  days: number;
}

export interface LandmarkSpec {
  /** Culture the monument belongs to (Atlas collection). */
  culture: ArchitectureStyle;
  site: SiteRule;
  /** Construction stages; stage 1 is paid on placement, later ones when the previous finishes. */
  stages: readonly LandmarkStage[];
  /** Builders needed for full construction speed (progress scales with assigned builders). */
  builders: number;
  requires: LevelRequirement;
  /** Tourism attraction points when complete and in good repair. */
  attraction: number;
  /** Culture points per day. */
  culturePerDay: number;
  /** Safety it adds to the city (castles, watch towers). */
  safety: number;
  /** Happiness for the whole city while in good repair. */
  happiness: number;
  /** Extra gold per visitor (museums, guided tours). */
  museumGold: number;
  /** Research per day (monastery libraries). */
  researchPerDay: number;
}

export interface BuildingDefinition {
  id: BuildingId;
  category: BuildingCategory;
  era: number;
  footprint: readonly [number, number];
  validTerrains: readonly TerrainId[];
  /** Deposit terrain that must exist within `radius` tiles and that the building harvests. */
  harvests?: { terrain: TerrainId; radius: number };
  seasonal: boolean;
  usesTools: boolean;
  buildable: boolean;
  demolishable: boolean;
  levels: readonly LevelSpec[];
  /** Footprint may span tiles of different heights (landmarks that terrace into slopes). */
  allowSlope?: boolean;
  /** Must stand next to river or lake water (shipyards). */
  needsWater?: boolean;
  /** Tourism and city services (data-driven; see systems/tourism.ts). */
  services?: {
    beds?: number;
    attraction?: number;
    marketGold?: number;
    safety?: number;
    safetyRadius?: number;
  };
  landmark?: LandmarkSpec;
}

export type TechEffect =
  | { type: 'outputMultiplier'; buildingId: BuildingId; permille: number }
  | { type: 'storageMultiplier'; permille: number }
  | { type: 'forestRegrowMultiplier'; permille: number };

export interface Technology {
  id: TechId;
  era: number;
  branch: 'agriculture' | 'engineering' | 'economy' | 'governance';
  cost: number;
  prerequisites: readonly TechId[];
  effects: readonly TechEffect[];
}

export type Objective =
  | { type: 'buildingCount'; buildingId: BuildingId; count: number }
  | { type: 'staffedBuilding'; buildingId: BuildingId; workers: number }
  | { type: 'resourceGathered'; resourceId: ResourceId; amount: number }
  | { type: 'foodBalanceStreak'; days: number }
  | { type: 'population'; count: number }
  | { type: 'districtCount'; count: number }
  | { type: 'militiaCount'; count: number }
  | { type: 'techResearched'; techId: TechId }
  | { type: 'prosperityStreak'; happiness: number; days: number };

export type Effect =
  | { type: 'addResource'; resourceId: ResourceId; amount: number }
  | { type: 'revealProvince'; provinceId: ProvinceId }
  | { type: 'completeChapter'; chapter: number };

export interface Quest {
  id: QuestId;
  chapter: number;
  prerequisites: readonly QuestId[];
  objectives: readonly Objective[];
  rewards: readonly Effect[];
}

export interface TradeOffer {
  id: string;
  give: Cost;
  get: Cost;
}

// ---------------------------------------------------------------- runtime state (serializable)

export type BuildingState = 'construction' | 'active' | 'upgrading';

export interface BuildingInstance {
  id: string;
  definitionId: BuildingId;
  provinceId: ProvinceId;
  x: number;
  y: number;
  /** Completed level (1-based). During first construction this is 1 and state is 'construction'. */
  level: number;
  workers: number;
  progressTicks: number;
  state: BuildingState;
  /** Touches a road that leads to the town center. */
  connected: boolean;
  /** Upkeep could not be paid this tick; the building is idle. */
  unpaid: boolean;
  /** Architectural culture of this building (kept per building, so districts can differ). */
  style: ArchitectureStyle;
  /** Custom appearance from the Architecture Workshop; null = the culture's default look. */
  look: BuildingLook | null;
  /** Structural condition in basis points (10000 = perfect). Decays daily; restored by repairs. */
  condition: number;
  /** Landmarks: construction stages already paid for (0 for ordinary buildings). */
  paidStages: number;
}

export interface Population {
  children: number;
  adults: number;
  elders: number;
  lastGrowthDay: number;
  lastMaturationDay: number;
  /** Consecutive days that ended with unmet food demand. */
  starvationDays: number;
  /** Unmet food demand accumulated today (milli-units). */
  shortfallToday: number;
}

export interface Ledger {
  produced: ResourceMap;
  consumed: ResourceMap;
}

export interface Province {
  id: ProvinceId;
  name: string;
  biome: string;
  neighbors: ProvinceId[];
  ownerFactionId: FactionId | null;
  loyalty: number;
  unrest: number;
  width: number;
  height: number;
  tiles: Tile[];
  buildings: BuildingInstance[];
  stocks: ResourceMap;
  population: Population;
  happiness: number;
  taxRate: TaxRate;
  today: Ledger;
  yesterday: Ledger;
}

export type QuestStatus = 'locked' | 'active' | 'completed';

export interface QuestProgress {
  status: QuestStatus;
  /** One counter per objective index (streaks, gathered amounts). */
  counters: number[];
  rewardGranted: boolean;
  completedTick: number | null;
}

export type EventKind = 'info' | 'success' | 'warning' | 'danger' | 'quest';
/** Param values starting with '@' are translation keys resolved by the UI. */
export type MessageParams = Record<string, string | number>;

export interface GameEvent {
  id: number;
  tick: number;
  kind: EventKind;
  key: TKey;
  params?: MessageParams;
  at?: { x: number; y: number };
}

export interface TourismState {
  /** Accumulated culture points (milli-units). */
  culture: number;
  /** Visitor satisfaction 0..100 (smoothed, also the city's reputation). */
  satisfaction: number;
  visitorsYesterday: number;
  demandYesterday: number;
  incomeYesterday: number;
  totalVisitors: number;
}

export interface VesselOrder {
  id: number;
  kind: VesselKind;
  /** Shipwright-hours invested. */
  progress: number;
}

export interface ShipyardState {
  queue: VesselOrder[];
  fleet: Record<VesselKind, number>;
  nextOrderId: number;
  yachtsSold: number;
}

export interface GameSettings {
  autoPauseOnMilestone: boolean;
}

export interface GameState {
  schemaVersion: number;
  gameVersion: string;
  seed: number;
  /** Full PRNG state; restoring it reproduces all future randomness. */
  rngState: number;
  mode: GameMode;
  tick: number;
  speed: GameSpeed;
  playerFactionId: FactionId;
  /** Default culture for new buildings. Each building also stores its own style. */
  culture: ArchitectureStyle;
  /** Starting city, unchanged when a building is restyled. Optional for legacy saves. */
  cityId?: CityId;
  /** Strategically secured surrounding districts, as world province IDs. */
  claimedDistricts?: ProvinceId[];
  /** Trained guards who can hold or patrol newly secured districts. */
  militia?: number;
  armyOrder?: 'defend' | 'patrol';
  /** Last commanded road position of the local militia. */
  armyTarget?: { x: number; y: number };
  homeProvinceId: ProvinceId;
  provinces: Record<ProvinceId, Province>;
  revealedProvinceIds: ProvinceId[];
  researchedTechIds: TechId[];
  researchQueue: TechId[];
  /** Research points already invested in researchQueue[0] (milli-units). */
  researchProgress: number;
  questProgress: Partial<Record<QuestId, QuestProgress>>;
  completedChapters: number[];
  eventLog: GameEvent[];
  nextEventId: number;
  nextBuildingId: number;
  settings: GameSettings;
  tourism: TourismState;
  shipyard: ShipyardState;
}

export interface MessageRef {
  key: TKey;
  params?: MessageParams;
}

export type CommandResult = { ok: true; state: GameState } | { ok: false; error: MessageRef };
