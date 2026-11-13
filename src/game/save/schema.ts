import { z } from 'zod';
import type { GameState } from '../core/types';
import { BUILDING_IDS } from '../data/buildings';
import { QUESTS } from '../data/quests';
import { TECH_IDS } from '../data/technologies';
import { ALL_STYLES, CONDITION_MAX } from '../data/architecture';
import { lookSchema } from './lookSchema';
import { MAX_HEIGHT } from '../data/balance';

const int = z.number().int();
const nat = int.nonnegative();
const resourceMap = z
  .object({ wood: nat, stone: nat, food: nat, gold: nat, tools: nat, research: nat })
  .strict();
const buildingId = z.enum(BUILDING_IDS as [string, ...string[]]);
const techId = z.enum(TECH_IDS as [string, ...string[]]);
const questId = z.enum(QUESTS.map((q) => q.id) as [string, ...string[]]);
const shortText = z.string().max(80);
const style = z.enum(ALL_STYLES as unknown as [string, ...string[]]);

const tile = z
  .object({
    terrain: z.enum(['grass', 'fertile', 'forest', 'water', 'stone', 'sand', 'hill', 'rocky', 'mountain', 'terrace', 'lake']),
    deposit: nat,
    road: z.boolean(),
    roadType: z.enum(['dirt', 'bridge', 'stairs', 'mountain', 'tunnel']),
    paved: z.boolean().optional(),
    buildingId: shortText.nullable(),
    variant: nat.max(3),
    height: nat.max(MAX_HEIGHT),
  })
  .strict();

const building = z
  .object({
    id: shortText,
    definitionId: buildingId,
    provinceId: shortText,
    x: nat,
    y: nat,
    level: int.min(1).max(5),
    workers: nat,
    progressTicks: nat,
    state: z.enum(['construction', 'active', 'upgrading']),
    connected: z.boolean(),
    unpaid: z.boolean(),
    style,
    look: lookSchema.nullable(),
    condition: nat.max(CONDITION_MAX),
    paidStages: nat.max(8),
  })
  .strict();

const ledger = z.object({ produced: resourceMap, consumed: resourceMap }).strict();

const province = z
  .object({
    id: shortText,
    name: shortText,
    biome: shortText,
    neighbors: z.array(shortText).max(12),
    ownerFactionId: shortText.nullable(),
    loyalty: int.min(0).max(100),
    unrest: int.min(0).max(100),
    width: int.min(8).max(64),
    height: int.min(8).max(64),
    tiles: z.array(tile).max(64 * 64),
    buildings: z.array(building).max(2000),
    stocks: resourceMap,
    population: z
      .object({
        children: nat,
        adults: nat,
        elders: nat,
        lastGrowthDay: nat,
        lastMaturationDay: nat,
        starvationDays: nat,
        shortfallToday: nat,
      })
      .strict(),
    happiness: int.min(0).max(100),
    taxRate: z.enum(['low', 'normal', 'high']),
    today: ledger,
    yesterday: ledger,
  })
  .strict();

const questProgress = z
  .object({
    status: z.enum(['locked', 'active', 'completed']),
    counters: z.array(nat).max(8),
    rewardGranted: z.boolean(),
    completedTick: nat.nullable(),
  })
  .strict();

const gameEvent = z
  .object({
    id: nat,
    tick: nat,
    kind: z.enum(['info', 'success', 'warning', 'danger', 'quest']),
    key: z.string().max(60),
    params: z.record(z.union([z.string().max(80), z.number()])).optional(),
    at: z.object({ x: nat, y: nat }).strict().optional(),
  })
  .strict();

export const gameStateSchema = z
  .object({
    schemaVersion: int,
    gameVersion: shortText,
    seed: nat,
    rngState: nat.max(0xffffffff),
    mode: z.enum(['campaign', 'sandbox']),
    tick: nat,
    speed: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4)]),
    playerFactionId: shortText,
    culture: style,
    cityId: z.enum(['trabzon', 'edinburgh']).optional(),
    claimedDistricts: z.array(shortText).max(24).optional(),
    militia: nat.max(200).optional(),
    armyOrder: z.enum(['defend', 'patrol']).optional(),
    armyTarget: z.object({ x: nat, y: nat }).strict().optional(),
    homeProvinceId: shortText,
    provinces: z.record(province),
    revealedProvinceIds: z.array(shortText).max(64),
    researchedTechIds: z.array(techId).max(200),
    researchQueue: z.array(techId).max(200),
    researchProgress: nat,
    questProgress: z.record(questId, questProgress),
    completedChapters: z.array(int).max(10),
    eventLog: z.array(gameEvent).max(500),
    nextEventId: nat,
    nextBuildingId: nat,
    settings: z.object({ autoPauseOnMilestone: z.boolean() }).strict(),
    tourism: z
      .object({
        culture: nat,
        satisfaction: int.min(0).max(100),
        visitorsYesterday: nat,
        demandYesterday: nat,
        incomeYesterday: nat,
        totalVisitors: nat,
      })
      .strict(),
    shipyard: z
      .object({
        queue: z
          .array(z.object({ id: nat, kind: z.enum(['fishing', 'cargo', 'yacht']), progress: nat }).strict())
          .max(8),
        fleet: z.object({ fishing: nat.max(20), cargo: nat.max(20), yacht: nat.max(20) }).strict(),
        nextOrderId: nat,
        yachtsSold: nat,
      })
      .strict(),
  })
  .strict();

/** Structural validation of untrusted data. Unknown keys are rejected, strings are never executed. */
export function parseGameState(
  data: unknown,
): { ok: true; state: GameState } | { ok: false; issues: string[] } {
  const result = gameStateSchema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  return { ok: true, state: result.data as unknown as GameState };
}
