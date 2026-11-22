import { MILITIA_CAP, specialistCount } from '../data/units';
import { z } from 'zod';
import type { GameState } from '../core/types';
import { BUILDING_IDS } from '../data/buildings';
import { QUESTS } from '../data/quests';
import { TECH_IDS } from '../data/technologies';
import { ALL_STYLES, CONDITION_MAX } from '../data/architecture';
import { lookSchema } from './lookSchema';
import { MAX_HEIGHT } from '../data/balance';
import { CITY_EDICT_IDS } from '../core/types';

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

const mapPoint = z.object({ x: nat.max(95), y: nat.max(95) }).strict();
const journey = z.array(mapPoint).min(1).max(9216);
const transitLine = z.object({
  route: journey.min(2),
  cargo: z.enum(['passengers', 'stone', 'wood', 'food', 'tools']),
  passengers: nat,
  shipped: nat,
  earned: nat,
  direction: z.enum(['export', 'import']).optional(),
  spent: nat.optional(),
}).strict();
const province = z
  .object({
    id: shortText,
    name: shortText,
    biome: shortText,
    neighbors: z.array(shortText).max(12),
    ownerFactionId: shortText.nullable(),
    loyalty: int.min(0).max(100),
    unrest: int.min(0).max(100),
    width: int.min(8).max(96),
    height: int.min(8).max(96),
    tiles: z.array(tile).max(96 * 96),
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
    hunt: z.object({ route: journey, workers: int.min(1).max(4), startTick: nat, endTick: nat }).strict().optional(),
    depletedHunts: z.record(z.string().regex(/^\d{1,2},\d{1,2}$/), nat).optional(),
    transit: z.object({ rail: transitLine.optional(), air: transitLine.optional() }).strict().optional(),
  })
  .strict()
  .refine((p) => [p.hunt?.route, p.transit?.rail?.route, p.transit?.air?.route].every((route) =>
    !route || route.every((point, i) => point.x < p.width && point.y < p.height &&
      (i === 0 || Math.abs(point.x - route[i - 1]!.x) + Math.abs(point.y - route[i - 1]!.y) === 1))),
    'Invalid hunt or transport route');

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
    difficulty: z.enum(['easy', 'normal', 'hard']).optional(),
    cheatStorageBonus: nat.max(1000000000000).optional(),
    cheatProduction10x: z.boolean().optional(),
    playerFactionId: shortText,
    culture: style,
    cityId: z.enum(['trabzon', 'edinburgh', 'kyoto', 'prague']).optional(),
    claimedDistricts: z.array(shortText).max(24).optional(),
    treaties: z.record(z.enum(['trade', 'non_aggression', 'alliance'])).optional(),
    militia: nat.max(MILITIA_CAP).optional(),
    specialists: z.object({ infantry: nat.max(100).optional(), scout: nat.max(100).optional(), medic: nat.max(100).optional(), signals: nat.max(100).optional(), engineer: nat.max(100).optional() }).strict().optional(),
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
    surprise: z.object({
      kind: z.enum(['ufo', 'pirates']), startedAt: nat,
      approach: z.array(z.tuple([nat.max(95), nat.max(95)])).min(1).max(9216),
      walk: z.array(z.tuple([nat.max(95), nat.max(95)])).min(1).max(9216),
      defense: z.array(z.tuple([nat.max(95), nat.max(95)])).max(9216),
      defenders: nat.max(MILITIA_CAP).optional(),
      outcome: z.enum(['repelled', 'breached']).optional(),
      damage: z.array(z.tuple([nat.max(95), nat.max(95)])).max(2).optional(),
    }).strict().optional(),
    nextSurpriseTick: nat.optional(),
    nextSurpriseKind: z.enum(['ufo', 'pirates']).optional(),
    cityLife: z.object({
      nextId: nat, completedTrips: nat, completedFlights: nat, passengers: nat, revenue: nat, operatingCosts: nat,
      jobs: z.array(z.object({
        id: nat, kind: z.enum(['shopping','ambulance','patrol','fire','delivery','dining','nightlife','hotel']),
        source: shortText, target: shortText, slot: nat.max(2),
        path: z.array(z.object({x:z.number().finite().min(0).max(96),y:z.number().finite().min(0).max(96)}).strict()).min(1).max(9228),
        index: nat, stage: z.enum(['outbound','park','walkIn','inside','walkOut','return']), age: nat,
      }).strict().refine(j=>j.index<j.path.length)).max(24),
      flights: z.array(z.object({airport:shortText,phase:z.enum(['landing','taxiIn','terminal','taxiOut','takeoff']),age:nat.max(3),passengers:nat.max(8)}).strict()).max(4),
    }).strict().optional(),
    age: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    citizenNames: z.record(z.string().regex(/^\d{1,3}$/), z.string().min(2).max(40)).optional(),
    companies: z.array(z.object({ id: shortText, name: z.string().min(2).max(48), sector: z.string().max(80), founderIndex: nat.max(499), buildingId: shortText.optional(), level: int.min(1).max(5), employees: nat.max(1000) }).strict()).max(48).optional(),
    edicts: z.array(z.enum(CITY_EDICT_IDS)).max(CITY_EDICT_IDS.length).optional(),
    edictChangedAt: z.record(z.enum(CITY_EDICT_IDS), nat).optional(),
    completedContracts: z.array(shortText).max(32).optional(),
    resolvedDilemmas: z.record(z.enum(['a', 'b'])).optional(),
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
  const state = result.data as unknown as GameState;
  if (specialistCount(state.specialists) > (state.militia ?? 0))
    return { ok: false, issues: ['specialists: exceeds total militia'] };
  return { ok: true, state };
}
