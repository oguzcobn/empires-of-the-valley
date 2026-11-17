import type { UnitId } from '../data/units';
export const RESOURCE_IDS = ['wood', 'stone', 'food', 'gold', 'tools', 'research'] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];
export type ResourceStock = Record<ResourceId, number>;
export type Cost = Partial<Record<ResourceId, number>>;

export type TerrainId = 'grass' | 'forest' | 'stone' | 'water' | 'fertile' | 'sand' | 'hill' | 'rocky' | 'mountain' | 'lake' | 'terrace';

export type RoadType = 'dirt' | 'stairs' | 'bridge' | 'mountain' | 'tunnel';

export type BuildingCategory = 'housing' | 'production' | 'storage' | 'civic' | 'defense' | 'landmark';

export type BuildingId =
  | 'town_center'
  | 'hut'
  | 'lumber_camp'
  | 'farm'
  | 'quarry'
  | 'warehouse'
  | 'granary'
  | 'school'
  | 'market'
  | 'inn'
  | 'watchtower'
  | 'barracks'
  | 'mosque'
  | 'church'
  | 'theatre'
  | 'cinema'
  | 'hospital'
  | 'factory'
  | 'hotel'
  | 'club'
  | 'restaurant'
  | 'airport'
  | 'police_station'
  | 'fire_station'
  | 'shipyard'
  | 'terrace_farm'
  | 'edinburgh_castle'
  | 'stirling_castle'
  | 'scott_monument'
  | 'sumela_monastery'
  | 'galata_tower'
  | 'selimiye_mosque'
  | 'trabzon_stadium';

export const ARCHITECTURE_STYLES = [
  'scottish',
  'turkish',
  'japanese',
  'medieval_european',
  'ottoman',
  'byzantine',
  'nordic',
  'mediterranean',
] as const;
export type ArchitectureStyle = (typeof ARCHITECTURE_STYLES)[number];

export type RoofShape = 'gable' | 'hip' | 'crow_step' | 'flat' | 'pyramid' | 'dome';
export type RoofMaterial = 'slate' | 'clay' | 'thatch' | 'lead' | 'copper';
export type WallMaterial = 'granite' | 'sandstone' | 'brick' | 'plaster' | 'timber' | 'ashlar';
export type FacadeTint = 'natural' | 'ochre' | 'terracotta' | 'cream' | 'white' | 'sage' | 'sky' | 'rose' | 'honey';
export type WindowStyle = 'small' | 'arched' | 'sash' | 'lattice';
export type DoorStyle = 'plank' | 'arched' | 'double' | 'carved';
export type ChimneyStyle = 'none' | 'single' | 'double' | 'tall';
export type BalconyStyle = 'none' | 'wood' | 'stone' | 'cumba' | 'iron';
export type GardenStyle = 'none' | 'flowers' | 'hedge' | 'courtyard' | 'orchard';
export type DecorStyle = 'none' | 'lanterns' | 'banners' | 'awnings' | 'ivy' | 'SHUTTERS';
export type TowerFeature = 'none' | 'turret' | 'bartizan' | 'minaret' | 'cupola';

/** Player-customised appearance for a building (bounded enums only — never free text or paths). */
export interface BuildingLook {
  roof: RoofShape;
  roofMaterial: RoofMaterial;
  wall: WallMaterial;
  facade: FacadeTint;
  floors: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  windows: WindowStyle;
  door: DoorStyle;
  chimney: ChimneyStyle;
  balcony: BalconyStyle;
  garden: GardenStyle;
  decor: DecorStyle;
  tower: TowerFeature;
}

export type VesselKind = 'fishing' | 'cargo' | 'yacht';

export interface ShipyardOrder {
  id: number;
  kind: VesselKind;
  /** Ticks of shipwright labour invested so far. */
  progress: number;
}

export interface ShipyardState {
  nextOrderId: number;
  queue: ShipyardOrder[];
  fleet: Record<VesselKind, number>;
  yachtsSold: number;
}

export interface TourismState {
  /** Visitors currently staying in the valley (integer headcount). */
  visitors: number;
  /** Peak visitors reached on any day (for milestone tracking). */
  peakVisitors: number;
  /** Cumulative visitors welcomed. */
  totalVisitors: number;
}

export type TechBranch = 'agriculture' | 'engineering' | 'economy' | 'governance';
export type TechId = 'basic_agriculture' | 'forestry' | 'masonry' | 'storage' | 'literacy';

export type TaxRate = 'low' | 'normal' | 'high';
export type GameSpeed = 0 | 1 | 2 | 4;
export type GameMode = 'campaign' | 'sandbox';
export type CityId = 'trabzon' | 'edinburgh' | 'kyoto' | 'prague';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type DiplomacyPact = 'trade' | 'non_aggression' | 'alliance';

export interface Tile {
  terrain: TerrainId;
  /** Remaining harvestable wood or stone on this tile (permille resource units). */
  deposit: number;
  road: boolean;
  /** Structure of the road on this tile (meaningful when `road` is true; defaults to 'dirt'). */
  roadType: RoadType;
  /** True when a dirt street has been upgraded to an asphalt road with sidewalks. */
  paved?: boolean;
  /** Building instance id occupying this tile, if any. */
  buildingId: string | null;
  /** Visual variant 0..3, deterministic from seed. */
  variant: number;
  /** Elevation step 0..4 (0 = valley floor / water level). */
  height: number;
}

export type BuildingState = 'construction' | 'active' | 'upgrading';

export interface BuildingInstance {
  id: string;
  definitionId: BuildingId;
  provinceId: string;
  /** Top-left tile of the footprint. */
  x: number;
  y: number;
  /** 1-based level. During initial construction this is 1. */
  level: number;
  workers: number;
  /** Ticks accumulated toward current construction or upgrade. */
  progressTicks: number;
  state: BuildingState;
  /** Cached road connectivity to the province's Town Center. */
  connected: boolean;
  /** Set when hourly gold upkeep could not be paid on the most recent tick. */
  unpaid: boolean;
  /** Architectural culture this instance is built in. */
  style: ArchitectureStyle;
  /** Optional custom appearance; null means the culture's default look for this building & level. */
  look: BuildingLook | null;
  /** Structural condition 0..10000 (10000 = pristine). Below 2500 the building is worn and less effective. */
  condition: number;
  /** For multi-stage landmarks: how many stage costs have been paid so far (1..stages.length). */
  paidStages: number;
}

export interface Population {
  children: number;
  adults: number;
  elders: number;
  /** Progress toward next immigrant arrival (ticks). */
  immigrationTicks: number;
  /** Consecutive days with zero food at day-end. */
  starvationDays: number;
  /** Progress toward next demographic aging step (days). */
  agingDays: number;
}

export interface DailyLedger {
  produced: ResourceStock;
  consumed: ResourceStock;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface HuntParty {
  route: MapPoint[];
  workers: number;
  startTick: number;
  endTick: number;
}

export type TransitKind = 'rail' | 'air';
export type TransitCargo = 'passengers' | 'stone' | 'wood' | 'food' | 'tools';

export interface TransitLine {
  route: MapPoint[];
  cargo: TransitCargo;
  direction?: 'export' | 'import';
  passengers: number;
  earned: number;
  shipped: number;
}

export interface Province {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: Tile[];
  buildings: BuildingInstance[];
  stocks: ResourceStock;
  population: Population;
  /** 0..100 integer. */
  happiness: number;
  taxRate: TaxRate;
  /** Current day's running ledger (reset at hour 0). */
  today: DailyLedger;
  /** Completed ledger from the previous day, shown in UI. */
  yesterday: DailyLedger;
  /** Consecutive days at end-of-day with net food >= 0 (for quests). */
  positiveFoodDays: number;
  /** Consecutive days at end-of-day with happiness >= 75 (for quests). */
  highHappinessDays: number;
  hunt?: HuntParty | null;
  transit?: Partial<Record<TransitKind, TransitLine>>;
}

export type QuestStatus = 'locked' | 'active' | 'completed';

export interface QuestProgress {
  id: string;
  status: QuestStatus;
  completedTick: number | null;
}

export type EventCategory = 'info' | 'warning' | 'danger' | 'success';

export interface EventEntry {
  id: number;
  tick: number;
  category: EventCategory;
  key: string;
  params?: Record<string, string | number>;
  location?: { x: number; y: number };
}

export interface GameSettings {
  autoPauseOnMilestone: boolean;
}

export interface GameState {
  schemaVersion: number;
  seed: number;
  /** Internal PRNG state (uint32). */
  rngState: number;
  mode: GameMode;
  cityId?: CityId;
  difficulty?: Difficulty;
  /** Default architectural culture of the city (new buildings inherit this unless overridden). */
  culture: ArchitectureStyle;
  /** Total elapsed simulation ticks (1 tick = 1 in-game hour, 24 ticks = 1 day). */
  tick: number;
  speed: GameSpeed;
  homeProvinceId: string;
  provinces: Record<string, Province>;
  revealedProvinceIds: string[];
  claimedDistricts?: string[];
  treaties?: Partial<Record<string, DiplomacyPact>>;
  militia?: number;
  specialists?: Partial<Record<UnitId, number>>;
  armyOrder?: 'defend' | 'patrol';
  armyTarget?: { x: number; y: number } | null;
  researchedTechIds: TechId[];
  researchQueue: TechId[];
  /** Research points (permille) accumulated toward researchQueue[0]. */
  researchProgress: number;
  questProgress: Record<string, QuestProgress>;
  completedChapters: number[];
  eventLog: EventEntry[];
  nextBuildingId: number;
  nextEventId: number;
  /** Extra storage capacity (permille) granted by entering the resource cheat code. */
  cheatStorageBonus?: number;
  /** True after entering the 10x production cheat code (`URETIM10X`). */
  cheatProduction10x?: boolean;
  cityLife?: import('../systems/cityLife').CityLifeState;
  shipyard: ShipyardOrderState;
  tourism: TourismState;
  settings: GameSettings;
}

export type ShipyardOrderState = ShipyardState;

export interface MessageRef {
  key: string;
  params?: Record<string, string | number>;
}

export type CommandResult = { ok: true; state: GameState } | { ok: false; error: MessageRef };