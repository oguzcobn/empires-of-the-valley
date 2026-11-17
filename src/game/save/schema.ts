import { z } from 'zod';
import { ARCHITECTURE_STYLES, RESOURCE_IDS } from '../core/types';
import { CONDITION_MAX } from '../data/architecture';
import { BUILDING_IDS } from '../data/buildings';
import { TECH_IDS } from '../data/technologies';
import { UNIT_IDS } from '../data/units';
import { SCHEMA_VERSION } from '../data/balance';
import type { GameState } from '../core/types';
import { lookSchema } from './lookSchema';

const nonNegInt = z.number().int().min(0).max(2_000_000_000);

const resourceStock = z.object(
  Object.fromEntries(RESOURCE_IDS.map((id) => [id, nonNegInt])) as Record<(typeof RESOURCE_IDS)[number], typeof nonNegInt>,
).strict();

const buildingId = z.enum(BUILDING_IDS as [string, ...string[]]);
const techId = z.enum(TECH_IDS as [string, ...string[]]);
const unitId = z.enum(UNIT_IDS as unknown as [string, ...string[]]);
const archStyle = z.enum(ARCHITECTURE_STYLES);

const tileSchema = z.object({
  terrain: z.enum(['grass', 'forest', 'stone', 'water', 'fertile', 'sand', 'hill', 'rocky', 'mountain', 'lake', 'terrace']),
  deposit: nonNegInt,
  road: z.boolean(),
  roadType: z.enum(['dirt', 'stairs', 'bridge', 'mountain', 'tunnel']),
  paved: z.boolean().optional(),
  buildingId: z.string().max(32).nullable(),
  variant: z.number().int().min(0).max(7),
  height: z.number().int().min(0).max(4),
}).strict();

const buildingInstanceSchema = z.object({
  id: z.string().min(1).max(32),
  definitionId: buildingId,
  provinceId: z.string().min(1).max(32),
  x: z.number().int().min(0).max(128),
  y: z.number().int().min(0).max(128),
  level: z.number().int().min(1).max(5),
  workers: z.number().int().min(0).max(32),
  progressTicks: nonNegInt,
  state: z.enum(['construction', 'active', 'upgrading']),
  connected: z.boolean(),
  unpaid: z.boolean(),
  style: archStyle,
  look: lookSchema.nullable(),
  condition: z.number().int().min(0).max(CONDITION_MAX),
  paidStages: z.number().int().min(0).max(8),
}).strict();

const dailyLedgerSchema = z.object({
  produced: resourceStock,
  consumed: resourceStock,
}).strict();

const mapPoint = z.object({ x: z.number().int().min(0).max(95), y: z.number().int().min(0).max(95) }).strict();
const huntSchema = z.object({
  route: z.array(mapPoint).min(2).max(128),
  workers: z.number().int().min(1).max(4),
  startTick: nonNegInt,
  endTick: nonNegInt,
}).strict();
const transitLineSchema = z.object({
  route: z.array(mapPoint).min(4).max(32),
  cargo: z.enum(['passengers', 'stone', 'wood', 'food', 'tools']),
  direction: z.enum(['export', 'import']).optional(),
  passengers: nonNegInt,
  earned: nonNegInt,
  shipped: nonNegInt,
}).strict();

const provinceSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().min(1).max(64),
  width: z.number().int().min(8).max(96),
  height: z.number().int().min(8).max(96),
  tiles: z.array(tileSchema).max(96 * 96),
  buildings: z.array(buildingInstanceSchema).max(1024),
  stocks: resourceStock,
  population: z.object({
    children: z.number().int().min(0).max(100_000),
    adults: z.number().int().min(0).max(100_000),
    elders: z.number().int().min(0).max(100_000),
    immigrationTicks: nonNegInt,
    starvationDays: nonNegInt,
    agingDays: nonNegInt,
  }).strict(),
  happiness: z.number().int().min(0).max(100),
  taxRate: z.enum(['low', 'normal', 'high']),
  today: dailyLedgerSchema,
  yesterday: dailyLedgerSchema,
  positiveFoodDays: nonNegInt,
  highHappinessDays: nonNegInt,
  hunt: huntSchema.nullable().optional(),
  transit: z.object({ rail: transitLineSchema.optional(), air: transitLineSchema.optional() }).strict().optional(),
}).strict();

const companySchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().min(1).max(64),
  sector: z.string().min(1).max(48),
  founderIndex: nonNegInt,
  buildingId: z.string().max(32).optional(),
  level: z.number().int().min(1).max(5),
  employees: nonNegInt,
}).strict();

export const gameStateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  seed: z.number().int().min(0).max(2_147_483_647),
  rngState: z.number().int().min(0).max(4_294_967_295),
  mode: z.enum(['campaign', 'sandbox']),
  cityId: z.enum(['trabzon', 'edinburgh', 'kyoto', 'prague']).optional(),
  difficulty: z.enum(['easy', 'normal', 'hard']).optional(),
  culture: archStyle,
  tick: nonNegInt,
  speed: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4)]),
  homeProvinceId: z.string().min(1).max(32),
  provinces: z.record(z.string().max(32), provinceSchema),
  revealedProvinceIds: z.array(z.string().max(32)).max(64),
  claimedDistricts: z.array(z.string().max(32)).max(64).optional(),
  treaties: z.record(z.string().max(32), z.enum(['trade', 'non_aggression', 'alliance'])).optional(),
  militia: z.number().int().min(0).max(500).optional(),
  specialists: z.record(unitId, z.number().int().min(0).max(500)).optional(),
  armyOrder: z.enum(['defend', 'patrol']).optional(),
  armyTarget: z.object({ x: z.number().int().min(0).max(95), y: z.number().int().min(0).max(95) }).strict().nullable().optional(),
  researchedTechIds: z.array(techId).max(64),
  researchQueue: z.array(techId).max(64),
  researchProgress: nonNegInt,
  questProgress: z.record(
    z.string().max(32),
    z.object({
      id: z.string().max(32),
      status: z.enum(['locked', 'active', 'completed']),
      completedTick: nonNegInt.nullable(),
    }).strict(),
  ),
  completedChapters: z.array(z.number().int().min(1).max(10)).max(10),
  eventLog: z.array(
    z.object({
      id: nonNegInt,
      tick: nonNegInt,
      category: z.enum(['info', 'warning', 'danger', 'success']),
      key: z.string().max(64),
      params: z.record(z.string().max(32), z.union([z.string().max(64), z.number()])).optional(),
      location: z.object({ x: z.number().int().min(0).max(128), y: z.number().int().min(0).max(128) }).strict().optional(),
    }).strict(),
  ).max(200),
  nextBuildingId: nonNegInt,
  nextEventId: nonNegInt,
  cheatStorageBonus: nonNegInt.optional(),
  cheatProduction10x: z.boolean().optional(),
  citizenNames: z.record(z.string().max(16), z.string().min(1).max(48)).optional(),
  companies: z.array(companySchema).max(64).optional(),
  cityLife: z.object({
    nextId: nonNegInt,
    jobs: z.array(z.object({
      id: nonNegInt,
      kind: z.enum(['shopping', 'ambulance', 'patrol', 'fire', 'delivery', 'dining', 'nightlife', 'hotel', 'business']),
      source: z.string().min(1).max(32),
      target: z.string().min(1).max(32),
      slot: z.number().int().min(0).max(2),
      path: z.array(z.object({ x: z.number().min(0).max(96), y: z.number().min(0).max(96) }).strict()).min(1).max(256),
      index: z.number().int().min(0).max(255),
      stage: z.enum(['outbound', 'park', 'walkIn', 'inside', 'walkOut', 'return']),
      age: z.number().int().min(0).max(64),
    }).strict().refine((j) => j.index < j.path.length, 'job index out of range')).max(32),
    flights: z.array(z.object({
      airport: z.string().min(1).max(32),
      phase: z.enum(['landing', 'taxiIn', 'terminal', 'taxiOut', 'takeoff']),
      age: z.number().int().min(0).max(64),
      passengers: z.number().int().min(0).max(32),
    }).strict()).max(8),
    completedTrips: nonNegInt,
    completedFlights: nonNegInt,
    passengers: nonNegInt,
    revenue: nonNegInt,
    operatingCosts: nonNegInt,
  }).strict().optional(),
  shipyard: z.object({
    nextOrderId: nonNegInt,
    queue: z.array(z.object({ id: nonNegInt, kind: z.enum(['fishing', 'cargo', 'yacht']), progress: nonNegInt }).strict()).max(16),
    fleet: z.object({ fishing: nonNegInt, cargo: nonNegInt, yacht: nonNegInt }).strict(),
    yachtsSold: nonNegInt,
  }).strict(),
  tourism: z.object({
    visitors: nonNegInt,
    peakVisitors: nonNegInt,
    totalVisitors: nonNegInt,
  }).strict(),
  settings: z.object({
    autoPauseOnMilestone: z.boolean(),
  }).strict(),
}).strict();

export const saveEnvelopeSchema = z.object({
  format: z.literal('empires-of-the-valley-save'),
  meta: z.object({
    savedAt: z.string().max(64),
    schemaVersion: z.number().int().min(1).max(100),
    day: nonNegInt,
    population: nonNegInt,
    seed: nonNegInt,
    mode: z.enum(['campaign', 'sandbox']),
  }).strict(),
  state: gameStateSchema,
}).strict();

/** Cross-field invariants that a structural schema alone cannot express. */
export function checkInvariants(s: GameState): string | null {
  const home = s.provinces[s.homeProvinceId];
  if (!home) return 'homeProvinceId missing from provinces';
  if (home.tiles.length !== home.width * home.height) return 'tile count does not match width*height';

  const seenIds = new Set<string>();
  for (const b of home.buildings) {
    if (seenIds.has(b.id)) return `duplicate building id ${b.id}`;
    seenIds.add(b.id);
    if (b.x + 1 > home.width || b.y + 1 > home.height) return `building ${b.id} out of bounds`;
  }
  for (const t of home.tiles) {
    if (t.buildingId !== null && !seenIds.has(t.buildingId)) {
      return `tile references unknown building ${t.buildingId}`;
    }
  }
  const employed = home.buildings.reduce((acc, b) => acc + b.workers, 0) + (home.hunt?.workers ?? 0);
  if (employed > home.population.adults) return 'more employed workers than adult population';
  return null;
}

export function parseGameState(raw: unknown): { ok: true; state: GameState } | { ok: false; reason: string } {
  const res = gameStateSchema.safeParse(raw);
  if (!res.success) return { ok: false, reason: res.error.issues[0]?.message ?? 'schema mismatch' };
  const state = res.data as unknown as GameState;
  const inv = checkInvariants(state);
  if (inv) return { ok: false, reason: inv };
  return { ok: true, state };
}