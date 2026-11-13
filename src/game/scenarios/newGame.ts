import { seedToState } from '../core/rng';
import type { ArchitectureStyle, GameMode, GameState } from '../core/types';
import { LEGACY_STYLE, isPlayableStyle } from '../data/architecture';
import { cityForCulture, CITIES } from '../data/cities';
import {
  GAME_VERSION,
  MAP_SIZE,
  SCHEMA_VERSION,
  START_HAPPINESS,
  START_POPULATION,
  START_STOCKS,
} from '../data/balance';
import { HOME_PROVINCE_ID, WORLD_BY_ID } from '../data/worldMap';
import { emptyResourceMap } from '../systems/economy';
import { logEvent } from '../systems/events';
import { refreshConnectivity } from '../systems/grid';
import { initialQuestProgress } from '../systems/quests';
import { generateValley } from '../systems/terrain';
import { emptyShipyard, emptyTourism } from '../systems/tourism';

export interface NewGameOptions {
  seed: number;
  mode: GameMode;
  /** Culture of the starting hamlet and default for new buildings. */
  culture?: ArchitectureStyle;
}

/** Builds the Phase 1 starting state: Bereket Vadisi, 12 settlers, hamlet, road and stocks. */
export function createNewGame({ seed, mode, culture = LEGACY_STYLE }: NewGameOptions): GameState {
  if (!isPlayableStyle(culture)) throw new Error(`culture ${culture} is not playable`);
  const safeSeed = Math.abs(Math.trunc(seed)) % 2147483647;
  const world = WORLD_BY_ID[HOME_PROVINCE_ID]!;
  const valley = generateValley(safeSeed, HOME_PROVINCE_ID, culture);
  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
    seed: safeSeed,
    rngState: seedToState(safeSeed),
    mode,
    tick: 0,
    speed: 0,
    playerFactionId: 'player',
    culture,
    cityId: cityForCulture(culture),
    claimedDistricts: [],
    homeProvinceId: HOME_PROVINCE_ID,
    provinces: {
      [HOME_PROVINCE_ID]: {
        id: HOME_PROVINCE_ID,
        name: CITIES[cityForCulture(culture)].name,
        biome: 'fertile_plain',
        neighbors: [...world.neighbors],
        ownerFactionId: 'player',
        loyalty: 100,
        unrest: 0,
        width: MAP_SIZE,
        height: MAP_SIZE,
        tiles: valley.tiles,
        buildings: valley.buildings,
        stocks: { ...START_STOCKS },
        population: {
          ...START_POPULATION,
          lastGrowthDay: 0,
          lastMaturationDay: 0,
          starvationDays: 0,
          shortfallToday: 0,
        },
        happiness: START_HAPPINESS,
        taxRate: 'normal',
        today: { produced: emptyResourceMap(), consumed: emptyResourceMap() },
        yesterday: { produced: emptyResourceMap(), consumed: emptyResourceMap() },
      },
    },
    revealedProvinceIds: [HOME_PROVINCE_ID],
    researchedTechIds: [],
    researchQueue: [],
    researchProgress: 0,
    questProgress: mode === 'campaign' ? initialQuestProgress() : {},
    completedChapters: [],
    eventLog: [],
    nextEventId: 1,
    nextBuildingId: valley.buildings.length + 1,
    settings: { autoPauseOnMilestone: true },
    tourism: emptyTourism(),
    shipyard: emptyShipyard(),
  };
  refreshConnectivity(state.provinces[HOME_PROVINCE_ID]!);
  logEvent(state, 'info', mode === 'campaign' ? 'event.welcome' : 'event.welcomeSandbox');
  return state;
}
