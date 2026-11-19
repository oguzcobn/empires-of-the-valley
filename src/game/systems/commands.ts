import { produce } from 'immer';
import { CITY_EDICT_IDS, RESOURCE_IDS } from '../core/types';
import { mulPermille } from '../core/fixed';
import type {
  ArchitectureStyle,
  BuildingId,
  BuildingLook,
  BuildingInstance,
  CityAge,
  CityEdictId,
  CommandResult,
  Cost,
  DiplomacyPact,
  GameSpeed,
  GameState,
  LevelSpec,
  MessageRef,
  Province,
  ResourceId,
  RoadType,
  VesselKind,
  TaxRate,
  TechId,
  TransitCargo,
  TransitKind,
} from '../core/types';
import { CONDITION_MAX, DESIGNABLE, isPlayableStyle } from '../data/architecture';
import { DEMOLISH_REFUND_PERMILLE, ROAD_COSTS, PAVING_COST, TERRACE_COST, TRADE_OFFERS } from '../data/balance';
import { BUILDINGS, defOf, specOf } from '../data/buildings';
import { TECHNOLOGIES } from '../data/technologies';
import { homeProvince, idleWorkers, isBuilt, storageCaps, totalPopulation } from './economy';
import { logEvent } from './events';
import { NEIGHBORS4, buildingById, canLink, footprintTiles, idx, inBounds, refreshConnectivity, tileAt, townCenter, transitOccupies } from './grid';
import { checkRoadSite, checkSite, roadTypeFor } from './placement';
import { investedCost, levelCost, repairCost, restyleCost, sameLook } from './architecture';
import { lookSchema } from '../save/lookSchema';
import { MAX_ORDERS, VESSELS } from '../data/shipyard';
import { fleetCount } from './tourism';
import { evaluateQuests } from './quests';
import { findGroundPath, musterPoint } from '../rendering/armyPath';
import { WORLD_BY_ID } from '../data/worldMap';
import { UNIT_IDS, UNITS, specialistCount } from '../data/units';
import type { UnitId } from '../data/units';
import { forecastBattle } from './combat';
import { huntRoute, planTransit, routeFrom, TRANSIT_COST, transitUnlocked, wildlife } from './frontier';
import { expandProvinceGrid } from './terrain';
import { emptyCityLife } from './cityLife';

export const CITY_AGES = {
  1: { age: 1, name: 'Kuruluş & Köy Çağı', subtitle: 'Toprak yollar ve ilk yerleşimler', cost: {}, minPopulation: 0, rewardGold: 0, rewardResearch: 0 },
  2: { age: 2, name: 'Derebeylik & Ticaret Çağı', subtitle: 'Taş mimari, pazarlar ve ticaret', cost: { wood: 25000, stone: 20000, gold: 15000 }, minPopulation: 14, rewardGold: 12000, rewardResearch: 15000 },
  3: { age: 3, name: 'Sanayi & Denizcilik (Damen) Çağı', subtitle: 'Tersaneler, fabrikalar ve gemi üretimi', cost: { wood: 40000, stone: 40000, gold: 35000, tools: 12000 }, minPopulation: 24, rewardGold: 25000, rewardResearch: 25000 },
  4: { age: 4, name: 'Modern Turizm & Plaza Çağı', subtitle: 'Resortlar, aquapark ve şirket merkezleri', cost: { stone: 60000, gold: 65000, tools: 25000 }, minPopulation: 36, rewardGold: 50000, rewardResearch: 40000 },
} as const;
export const CITY_CONTRACTS = [
  { id: 'damen-1906-sar', title: '1906 SAR Arama & Kurtarma Botu', client: 'Damen Shipyards Antalya', vessel: 'fishing' as const, gold: 28000, tools: 8000, happiness: 4 },
  { id: 'damen-fcs-5009', title: 'FCS 5009 Hızlı Kargo Gemisi', client: 'Damen & ASBAŞ', vessel: 'cargo' as const, gold: 48000, tools: 14000, happiness: 5 },
  { id: 'damen-seaxplorer-58', title: 'SeaXplorer 58 Yat Teslimatı', client: 'Damen Yachting', vessel: 'yacht' as const, gold: 95000, tools: 20000, happiness: 8 },
  { id: 'paloma-tourism-summit', title: 'Paloma Resort & Aquapark Zirvesi', client: 'Paloma Hotels', building: 'hotel' as const, cost: { food: 15000 }, gold: 36000, tools: 6000, happiness: 7 },
  { id: 'asbas-plaza-export', title: 'ASBAŞ Teknoloji & Lojistik Paketi', client: 'ASBAŞ', building: 'corporate_plaza' as const, cost: { tools: 10000, wood: 20000 }, gold: 42000, tools: 12000, happiness: 5 },
] as const;
export const CITY_EDICTS = [
  { id: 'free_zone_tax', title: 'ASBAŞ Serbest Bölge Teşviki', desc: 'Yatırım ve mutluluk kazandırır.' },
  { id: 'shipyard_overtime', title: 'Damen Tersanesi Çift Vardiya', desc: 'Alet ve araştırma kazandırır; mutluluğu azaltır.' },
  { id: 'festival_aquapark', title: 'Palomaqua Şehir Festivali', desc: '5 altın karşılığında mutluluk kazandırır.' },
  { id: 'solar_subsidy', title: 'Çatı GES Teşviki', desc: 'Araştırma ve mutluluk kazandırır.' },
  { id: 'militia_watch', title: 'Liman Gönüllü Muhafızları', desc: 'Milis gücünü artırır.' },
] as const;
export const CITY_DILEMMAS = [
  { id: 'damen-vip-delegation', title: 'Damen Uluslararası Heyeti', desc: 'Heyeti nasıl ağırlayacaksın?', a: { label: 'VIP organizasyon', gold: -8000, tools: 8000, happiness: 6, research: 18000 }, b: { label: 'Teknik saha turu', gold: 10000, tools: 4000, happiness: 1 } },
  { id: 'derby-supporters-wave', title: 'Büyük Maç Günü', desc: 'Taraftar akını için hangi önlemi alacaksın?', a: { label: 'Meydan şenliği', food: -6000, gold: 18000, happiness: 10 }, b: { label: 'Güvenlik koridoru', gold: 24000, happiness: -2 } },
  { id: 'coastal-storm-warning', title: 'Kıyı Fırtınası Uyarısı', desc: 'Liman ve tekneler için karar ver.', a: { label: 'Gemileri korumaya al', gold: -6000, tools: 8000, happiness: 6 }, b: { label: 'Seferleri sürdür', food: 15000, gold: 10000, happiness: -3 } },
] as const;

export type Command =
  | { type: 'renameCitizen'; index: number; name: string }
  | { type: 'foundCompany'; name: string; sector: string; founderIndex: number; buildingId?: string }
  | { type: 'renameCompany'; companyId: string; name: string }
  | { type: 'advanceAge' }
  | { type: 'completeContract'; contractId: string }
  | { type: 'toggleEdict'; edictId: CityEdictId }
  | { type: 'resolveDilemma'; dilemmaId: string; choice: 'a' | 'b' }
  | { type: 'hunt'; x: number; y: number; workers: number }
  | { type: 'buildTransit'; kind: TransitKind }
  | { type: 'setTransitCargo'; kind: TransitKind; cargo: TransitCargo; direction?: 'export' | 'import' }
  | {
      type: 'placeBuilding';
      buildingId: BuildingId;
      x: number;
      y: number;
      /** Defaults to the city's culture. */
      style?: ArchitectureStyle;
      /** Workshop design; null/undefined = culture default. */
      look?: BuildingLook | null;
    }
  | { type: 'setBuildingStyle'; instanceId: string; style: ArchitectureStyle; look: BuildingLook | null }
  | { type: 'restoreBuilding'; instanceId: string }
  | { type: 'setCulture'; style: ArchitectureStyle }
  | { type: 'orderVessel'; kind: VesselKind }
  | { type: 'cancelVessel'; orderId: number }
  | { type: 'sellYacht' }
  | { type: 'dispatchFlight'; airportId: string }
  | { type: 'placeRoad'; x: number; y: number }
  | { type: 'placeRoadRoute'; start: RoadPoint; end: RoadPoint; bridge?: boolean; paved?: boolean }
  | { type: 'paveRoad'; x: number; y: number }
  | { type: 'buildTerrace'; x: number; y: number }
  | { type: 'removeRoad'; x: number; y: number }
  | { type: 'clearTerrain'; x: number; y: number }
  | { type: 'expandMap' }
  | { type: 'cancelConstruction'; instanceId: string }
  | { type: 'upgradeBuilding'; instanceId: string }
  | { type: 'demolishBuilding'; instanceId: string }
  | { type: 'assignWorkers'; instanceId: string; workers: number }
  | { type: 'setTaxRate'; taxRate: TaxRate }
  | { type: 'queueResearch'; techId: TechId }
  | { type: 'dequeueResearch'; techId: TechId }
  | { type: 'trade'; offerId: string }
  | { type: 'setGameSpeed'; speed: GameSpeed }
  | { type: 'setAutoPause'; enabled: boolean }
  | { type: 'redeemCheat'; code: string }
  | { type: 'claimDistrict'; provinceId: string }
  | { type: 'attackDistrict'; provinceId: string }
  | { type: 'signPact'; provinceId: string; pact: DiplomacyPact }
  | { type: 'trainSpecialist'; unit: UnitId }
  | { type: 'recruitMilitia'; amount: number }
  | { type: 'setArmyOrder'; order: 'defend' | 'patrol' }
  | { type: 'moveMilitia'; x: number; y: number };

export const PACT_PRICES: Record<DiplomacyPact, number> = { trade: 10000, non_aggression: 5000, alliance: 15000 };
const COST_KEYS = (cost: Cost): ResourceId[] => Object.keys(cost) as ResourceId[];

export function missingFor(p: Province, cost: Cost): MessageRef | null {
  for (const id of COST_KEYS(cost)) {
    if (p.stocks[id] < (cost[id] ?? 0)) return { key: 'err.cost', params: { resource: `@resource.${id}` } };
  }
  return null;
}

function pay(p: Province, cost: Cost): void {
  for (const id of COST_KEYS(cost)) p.stocks[id] -= cost[id] ?? 0;
}

/** Refunds are limited by free storage; whatever does not fit is lost (documented rule). */
function refund(s: GameState, p: Province, cost: Cost, permille = 1000): void {
  const caps = storageCaps(s, p);
  for (const id of COST_KEYS(cost)) {
    const amount = mulPermille(cost[id] ?? 0, permille);
    p.stocks[id] += Math.max(0, Math.min(amount, caps[id] - p.stocks[id]));
  }
}

/** Requirement check for reaching `spec` (used for upgrades); null when satisfied. */
export function requirementError(s: GameState, spec: LevelSpec): MessageRef | null {
  const p = homeProvince(s);
  const req = spec.requires;
  if (!req) return null;
  if (req.townCenterLevel && (townCenter(p)?.level ?? 0) < req.townCenterLevel)
    return { key: 'err.needTownCenter', params: { level: req.townCenterLevel } };
  if (req.population && totalPopulation(p) < req.population)
    return { key: 'err.needPopulation', params: { n: req.population } };
  if (req.techId && !s.researchedTechIds.includes(req.techId))
    return { key: 'err.needTech', params: { tech: `@tech.${req.techId}.name` } };
  return null;
}

/** Validates a culture/design pair for a building type (untrusted input from UI or imports). */
export function styleError(
  buildingId: BuildingId,
  style: unknown,
  look: unknown,
): MessageRef | null {
  if (!isPlayableStyle(style)) return { key: 'err.styleUnavailable' };
  if (look === null || look === undefined) return null;
  if (!DESIGNABLE.includes(buildingId)) return { key: 'err.notDesignable' };
  return lookSchema.safeParse(look).success ? null : { key: 'err.invalidDesign' };
}

export function validatePlacement(
  s: GameState,
  buildingId: BuildingId,
  x: number,
  y: number,
  style: ArchitectureStyle = s.culture,
  look: BuildingLook | null = null,
): MessageRef | null {
  const def = BUILDINGS[buildingId];
  if (!def?.buildable) return { key: 'err.notBuildable' };
  if (def.era > (s.age ?? 1)) return { key: 'err.needTownCenter', params: { level: def.era } };
  const p = homeProvince(s);
  if (def.landmark && p.buildings.some((b) => b.definitionId === buildingId)) return { key: 'err.landmarkExists' };
  return (
    styleError(buildingId, style, look) ??
    requirementError(s, def.levels[0]!) ??
    checkSite(p, def, x, y) ??
    missingFor(p, levelCost(buildingId, 0, style, look))
  );
}

/** Road structure and price for a tile, or the reason it cannot hold a road. */
export function roadQuote(s: GameState, x: number, y: number, p = homeProvince(s)): { type: RoadType; cost: Cost } | { error: MessageRef } {
  const site = checkRoadSite(p, x, y);
  if (site) return { error: site };
  const type = roadTypeFor(p, x, y)!;
  if (type === 'tunnel' && !s.researchedTechIds.includes('masonry')) return { error: { key: 'err.needMasonryTunnel' } };
  return { type, cost: ROAD_COSTS[type] };
}

export interface RoadPoint {
  x: number;
  y: number;
}

export interface RoadPlan {
  tiles: (RoadPoint & { type: RoadType; paved?: boolean })[];
  paveTiles: RoadPoint[];
  cost: Cost;
  error: MessageRef | null;
  blocked: RoadPoint | null;
}

/** Trace a diagonal or axial street in orthogonal steps that the road network can join. */
export function planRoadRoute(s: GameState, start: RoadPoint, end: RoadPoint, bridge = false, paved = false): RoadPlan {
  const straight = quoteRoadRoute(s, start, end, bridge, paved);
  if (bridge || !straight.blocked || straight.error?.key === 'err.roadNotAdjacent') return straight;
  const p = homeProvince(s);
  const route = routeFrom([start], ({ x, y }) => x === end.x && y === end.y, (from, to) => {
    const a = tileAt(p, from.x, from.y);
    const b = tileAt(p, to.x, to.y);
    if (!a || !b || b.buildingId || transitOccupies(p, to.x, to.y, true)) return false;
    const roadType = b.road ? b.roadType : roadTypeFor(p, to.x, to.y, a);
    if (!roadType || (!b.road && (roadType === 'bridge' || roadType === 'tunnel'))) return false;
    const previousType = a.road ? a.roadType : roadTypeFor(p, from.x, from.y) ?? 'dirt';
    return canLink({ height: a.height, roadType: previousType }, { height: b.height, roadType });
  });
  if (!route) return straight;
  const detour = quoteRoadRoute(s, start, end, false, paved, route);
  return detour.blocked ? straight : detour;
}

function quoteRoadRoute(s: GameState, start: RoadPoint, end: RoadPoint, bridge: boolean, paved: boolean, route?: RoadPoint[]): RoadPlan {
  const p = homeProvince(s);
  const plan: RoadPlan = { tiles: [], paveTiles: [], cost: {}, error: null, blocked: null };
  paved = paved && !bridge;
  for (const point of [start, end]) {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || !inBounds(p, point.x, point.y))
      return { ...plan, error: { key: 'err.outOfBounds' } };
  }

  const preview = { ...p, tiles: [...p.tiles] };
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const stepX = Math.sign(end.x - start.x);
  const stepY = Math.sign(end.y - start.y);
  if (bridge) {
    const banks = [start, end].every(({ x, y }) => {
      const terrain = tileAt(p, x, y)!.terrain;
      return terrain !== 'water' && terrain !== 'lake';
    });
    if (!banks || (dx > 0 && dy > 0) || dx + dy < 2)
      return { ...plan, error: { key: 'err.bridgeBanks' } };
    for (let i = 1; i < dx + dy; i++) {
      const x = start.x + stepX * i;
      const y = start.y + stepY * i;
      if (tileAt(p, x, y)?.terrain !== 'water')
        return { ...plan, error: { key: 'err.bridgeRiver' }, blocked: { x, y } };
    }
  }
  let x = start.x;
  let y = start.y;
  let movedX = 0;
  let movedY = 0;

  const length = route ? route.length : dx + dy + 1;
  for (let i = 0; i < length; i++) {
    if (route) ({ x, y } = route[i]!);
    const index = idx(p, x, y);
    const tile = preview.tiles[index]!;
    if (!tile.road) {
      const quote = roadQuote(s, x, y, preview);
      if ('error' in quote) return { ...plan, error: quote.error, blocked: { x, y } };
      const pave = paved && quote.type === 'dirt';
      plan.tiles.push({ x, y, type: quote.type, ...(pave ? { paved: true } : {}) });
      for (const id of COST_KEYS(quote.cost)) plan.cost[id] = (plan.cost[id] ?? 0) + (quote.cost[id] ?? 0);
      if (pave) for (const id of COST_KEYS(PAVING_COST)) plan.cost[id] = (plan.cost[id] ?? 0) + (PAVING_COST[id] ?? 0);
      preview.tiles[index] = { ...tile, road: true, roadType: quote.type };
    } else if (paved && tile.roadType === 'dirt' && !tile.paved) {
      plan.paveTiles.push({ x, y });
      for (const id of COST_KEYS(PAVING_COST)) plan.cost[id] = (plan.cost[id] ?? 0) + (PAVING_COST[id] ?? 0);
    }
    if (movedX < dx && (movedY === dy || (2 * movedX + 1) * dy <= (2 * movedY + 1) * dx)) {
      x += stepX;
      movedX++;
    } else if (movedY < dy) {
      y += stepY;
      movedY++;
    }
  }

  if (bridge) {
    for (let i = 1; i <= dx + dy; i++) {
      const x = start.x + stepX * i;
      const y = start.y + stepY * i;
      const from = tileAt(preview, x - stepX, y - stepY)!;
      const to = tileAt(preview, x, y)!;
      if (!canLink(from, to))
        return { ...plan, error: { key: 'err.roadTooSteep', params: { n: Math.abs(from.height - to.height) } }, blocked: { x, y } };
    }
  }

  plan.error = plan.tiles.length || plan.paveTiles.length ? missingFor(p, plan.cost) : { key: 'err.routeNoNewRoad' };
  return plan;
}

/** Cost of every construction stage a landmark has paid so far (for cancellation refunds). */
function paidLandmarkCost(b: BuildingInstance): Cost {
  const spec = defOf(b).landmark!;
  const total: Cost = {};
  for (let i = 0; i < b.paidStages; i++) {
    const cost = spec.stages[i]!.cost;
    for (const id of COST_KEYS(cost)) total[id] = (total[id] ?? 0) + (cost[id] ?? 0);
  }
  return total;
}

/** Pure validation: returns the reason a command is refused, or null if it may run. */
export function validateCommand(s: GameState, cmd: Command, roadPlan?: RoadPlan): MessageRef | null {
  const p = homeProvince(s);
  switch (cmd.type) {
    case 'renameCitizen':
      return Number.isInteger(cmd.index) && cmd.index >= 0 && cmd.index < 500 && cmd.name.trim().length >= 2 && cmd.name.trim().length <= 40 ? null : { key: 'err.invalid' };
    case 'foundCompany':
      return cmd.name.trim().length >= 2 && cmd.name.trim().length <= 48 && (s.companies?.length ?? 0) < 48
        ? missingFor(p, { gold: 3000 }) : { key: 'err.invalid' };
    case 'renameCompany':
      return cmd.name.trim().length >= 2 && cmd.name.trim().length <= 48 ? null : { key: 'err.invalid' };
    case 'advanceAge': {
      const age = (s.age ?? 1) as CityAge;
      if (age >= 4) return { key: 'err.maxLevel' };
      const next = CITY_AGES[(age + 1) as CityAge];
      return totalPopulation(p) < next.minPopulation ? { key: 'err.needPopulation', params: { n: next.minPopulation } } : missingFor(p, next.cost);
    }
    case 'completeContract': {
      const c = CITY_CONTRACTS.find((item) => item.id === cmd.contractId);
      if (!c || s.completedContracts?.includes(c.id)) return { key: 'err.invalid' };
      if ('vessel' in c && c.vessel && s.shipyard.fleet[c.vessel] <= 0) return { key: 'err.invalid' };
      if ('building' in c && c.building && !p.buildings.some((b) => (b.definitionId === c.building || (c.building === 'hotel' && b.definitionId === 'aquapark')) && isBuilt(b))) return { key: 'err.invalid' };
      return 'cost' in c && c.cost ? missingFor(p, c.cost) : null;
    }
    case 'toggleEdict':
      if (!CITY_EDICT_IDS.includes(cmd.edictId)) return { key: 'err.invalid' };
      return cmd.edictId === 'festival_aquapark' && !s.edicts?.includes(cmd.edictId) ? missingFor(p, { gold: 5000 }) : null;
    case 'resolveDilemma': {
      const d = CITY_DILEMMAS.find((item) => item.id === cmd.dilemmaId);
      if (!d || s.resolvedDilemmas?.[cmd.dilemmaId] || (cmd.choice !== 'a' && cmd.choice !== 'b')) return { key: 'err.invalid' };
      const choice = cmd.choice === 'a' ? d.a : d.b;
      if (choice.gold && choice.gold < 0 && p.stocks.gold < -choice.gold) return { key: 'err.cost', params: { resource: '@resource.gold' } };
      if ('food' in choice && choice.food && choice.food < 0 && p.stocks.food < -choice.food) return { key: 'err.cost', params: { resource: '@resource.food' } };
      return null;
    }
    case 'hunt':
      if (p.hunt) return { key: 'err.huntBusy' };
      if (!Number.isInteger(cmd.workers) || cmd.workers < 1 || cmd.workers > 4) return { key: 'err.invalid' };
      if (idleWorkers(p) < cmd.workers) return { key: 'err.noIdleWorkers' };
      if (!wildlife(p, s.seed, s.tick).some((animal) => animal.x === cmd.x && animal.y === cmd.y)) return { key: 'err.noAnimal' };
      return huntRoute(p, cmd.x, cmd.y) ? null : { key: 'err.huntRoute' };
    case 'buildTransit':
      if (cmd.kind !== 'rail' && cmd.kind !== 'air') return { key: 'err.invalid' };
      if (p.transit?.[cmd.kind]) return { key: 'err.invalid' };
      if (!transitUnlocked(s, p, cmd.kind)) return { key: cmd.kind === 'air' ? 'err.airUnlock' : 'err.needTownCenter', params: { level: 2 } };
      return missingFor(p, TRANSIT_COST[cmd.kind]) ?? (planTransit(p, cmd.kind) ? null : { key: 'err.transitSite' });
    case 'setTransitCargo':
      return p.transit?.[cmd.kind] && ['passengers', 'stone', 'wood', 'food', 'tools'].includes(cmd.cargo) &&
        (cmd.direction === undefined || cmd.direction === 'export' || cmd.direction === 'import')
        ? null : { key: 'err.invalid' };
    case 'placeBuilding':
      if (!Number.isInteger(cmd.x) || !Number.isInteger(cmd.y)) return { key: 'err.outOfBounds' };
      return validatePlacement(s, cmd.buildingId, cmd.x, cmd.y, cmd.style ?? s.culture, cmd.look ?? null);
    case 'setBuildingStyle': {
      const b = buildingById(p, cmd.instanceId);
      if (!b) return { key: 'err.noBuilding' };
      const bad = styleError(b.definitionId, cmd.style, cmd.look);
      if (bad) return bad;
      if (b.state !== 'active') return { key: 'err.busy' };
      if (b.style === cmd.style && sameLook(b.look, cmd.look)) return { key: 'err.sameStyle' };
      return missingFor(p, restyleCost(b.definitionId, cmd.style, cmd.look));
    }
    case 'restoreBuilding': {
      const b = buildingById(p, cmd.instanceId);
      if (!b) return { key: 'err.noBuilding' };
      if (!isBuilt(b)) return { key: 'err.busy' };
      if (b.condition >= CONDITION_MAX) return { key: 'err.noRepairNeeded' };
      return missingFor(p, repairCost(b));
    }
    case 'setCulture':
      return isPlayableStyle(cmd.style) ? null : { key: 'err.styleUnavailable' };
    case 'orderVessel': {
      const spec = VESSELS[cmd.kind];
      if (!spec) return { key: 'err.invalid' };
      if (!p.buildings.some((b) => b.definitionId === 'shipyard' && isBuilt(b))) return { key: 'err.needShipyard' };
      if (s.shipyard.queue.length >= MAX_ORDERS) return { key: 'err.queueFull', params: { n: MAX_ORDERS } };
      if (fleetCount(s, cmd.kind) >= spec.cap) return { key: 'err.fleetCap', params: { n: spec.cap } };
      return missingFor(p, spec.cost);
    }
    case 'cancelVessel':
      return s.shipyard.queue.some((o) => o.id === cmd.orderId) ? null : { key: 'err.invalid' };
    case 'sellYacht':
      return s.shipyard.fleet.yacht > 0 ? null : { key: 'err.noYacht' };
    case 'dispatchFlight': {
      const b = buildingById(p, cmd.airportId);
      if (!b || b.definitionId !== 'airport' || !isBuilt(b) || !b.connected || b.workers <= 0 || b.unpaid)
        return { key: 'err.invalid' };
      if (s.cityLife?.flights.some((f) => f.airport === b.id) || (s.cityLife?.flights.length ?? 0) >= 4)
        return { key: 'err.busy' };
      return missingFor(p, { gold: 1000 });
    }
    case 'placeRoad': {
      const quote = roadQuote(s, cmd.x, cmd.y);
      return 'error' in quote ? quote.error : missingFor(p, quote.cost);
    }
    case 'placeRoadRoute':
      return (roadPlan ?? planRoadRoute(s, cmd.start, cmd.end, cmd.bridge, cmd.paved)).error;
    case 'paveRoad': {
      if (!Number.isInteger(cmd.x) || !Number.isInteger(cmd.y)) return { key: 'err.invalid' };
      const road = tileAt(p, cmd.x, cmd.y);
      if (!road?.road || road.roadType !== 'dirt' || road.paved) return { key: 'err.invalid' };
      return missingFor(p, PAVING_COST);
    }
    case 'buildTerrace': {
      const t = tileAt(p, cmd.x, cmd.y);
      if (!t) return { key: 'err.outOfBounds' };
      if (t.terrain !== 'hill' || t.road || t.buildingId || transitOccupies(p, cmd.x, cmd.y)) return { key: 'err.notTerraceable' };
      return missingFor(p, TERRACE_COST);
    }
    case 'removeRoad':
      return tileAt(p, cmd.x, cmd.y)?.road ? null : { key: 'err.noRoadHere' };
    case 'clearTerrain': {
      const t = tileAt(p, cmd.x, cmd.y);
      if (!t) return { key: 'err.outOfBounds' };
      if (t.buildingId || t.road || transitOccupies(p, cmd.x, cmd.y)) return { key: 'err.occupied' };
      if (!['forest', 'stone', 'rocky', 'hill', 'mountain'].includes(t.terrain)) return { key: 'err.invalid' };
      return null;
    }
    case 'expandMap': {
      if (p.width >= 96 && p.height >= 96) return { key: 'err.maxLevel' };
      return missingFor(p, { gold: 5000 });
    }
    case 'cancelConstruction': {
      const b = buildingById(p, cmd.instanceId);
      if (!b) return { key: 'err.noBuilding' };
      return b.state === 'active' ? { key: 'err.nothingToCancel' } : null;
    }
    case 'upgradeBuilding': {
      const b = buildingById(p, cmd.instanceId);
      if (!b) return { key: 'err.noBuilding' };
      if (b.state !== 'active') return { key: 'err.busy' };
      const next = defOf(b).levels[b.level];
      if (!next) return { key: 'err.maxLevel' };
      if (!b.connected) return { key: 'err.noRoad' };
      return requirementError(s, next) ?? missingFor(p, levelCost(b.definitionId, b.level, b.style, b.look));
    }
    case 'demolishBuilding': {
      const b = buildingById(p, cmd.instanceId);
      if (!b) return { key: 'err.noBuilding' };
      if (!defOf(b).demolishable) return { key: 'err.notDemolishable' };
      if (b.state !== 'active') return { key: 'err.busy' };
      const capsAfter = storageCaps(s, p, b.id);
      for (const id of COST_KEYS(specOf(b).storage)) {
        if (p.stocks[id] > capsAfter[id])
          return { key: 'err.storageInUse', params: { resource: `@resource.${id}` } };
      }
      return null;
    }
    case 'assignWorkers': {
      const b = buildingById(p, cmd.instanceId);
      if (!b) return { key: 'err.noBuilding' };
      const builders = b.state === 'construction' ? defOf(b).landmark?.builders : undefined;
      if (!isBuilt(b) && builders === undefined) return { key: 'err.busy' };
      const slots = builders ?? specOf(b).workerSlots;
      if (!Number.isInteger(cmd.workers) || cmd.workers < 0 || cmd.workers > slots)
        return { key: 'err.workerSlots', params: { n: slots } };
      if (cmd.workers - b.workers > idleWorkers(p)) return { key: 'err.noIdleWorkers' };
      return null;
    }
    case 'setTaxRate':
      return ['low', 'normal', 'high'].includes(cmd.taxRate) ? null : { key: 'err.invalid' };
    case 'queueResearch': {
      const tech = TECHNOLOGIES[cmd.techId];
      if (!tech) return { key: 'err.invalid' };
      if (s.researchedTechIds.includes(tech.id)) return { key: 'err.alreadyResearched' };
      if (s.researchQueue.includes(tech.id)) return { key: 'err.alreadyQueued' };
      if (!p.buildings.some((b) => b.definitionId === 'school' && isBuilt(b)))
        return { key: 'err.needSchool' };
      const missing = tech.prerequisites.find(
        (id) => !s.researchedTechIds.includes(id) && !s.researchQueue.includes(id),
      );
      return missing ? { key: 'err.needTech', params: { tech: `@tech.${missing}.name` } } : null;
    }
    case 'dequeueResearch': {
      if (!s.researchQueue.includes(cmd.techId)) return { key: 'err.invalid' };
      const dependent = s.researchQueue.find((id) => TECHNOLOGIES[id].prerequisites.includes(cmd.techId));
      return dependent ? { key: 'err.queueDependency', params: { tech: `@tech.${dependent}.name` } } : null;
    }
    case 'trade': {
      const offer = TRADE_OFFERS.find((o) => o.id === cmd.offerId);
      if (!offer) return { key: 'err.invalid' };
      const missing = missingFor(p, offer.give);
      if (missing) return missing;
      const caps = storageCaps(s, p);
      for (const id of COST_KEYS(offer.get)) {
        if (p.stocks[id] + (offer.get[id] ?? 0) > caps[id])
          return { key: 'err.storageFull', params: { resource: `@resource.${id}` } };
      }
      return null;
    }
    case 'claimDistrict': {
      const region = WORLD_BY_ID[cmd.provinceId];
      if (!region || region.id === s.homeProvinceId || s.claimedDistricts?.includes(region.id))
        return { key: 'err.invalid' };
      const owned = [s.homeProvinceId, ...(s.claimedDistricts ?? [])];
      if (!region.neighbors.some((id) => owned.includes(id))) return { key: 'err.invalid' };
      if (s.mode === 'campaign' && !s.completedChapters.includes(1)) return { key: 'err.invalid' };
      if (totalPopulation(p) < 20) return { key: 'err.needPopulation', params: { n: 20 } };
      return missingFor(p, { gold: 20000 + (s.claimedDistricts?.length ?? 0) * 10000 });
    }
    case 'signPact': {
      const region = WORLD_BY_ID[cmd.provinceId];
      if (!region || region.id === s.homeProvinceId || s.claimedDistricts?.includes(region.id) || s.treaties?.[region.id])
        return { key: 'err.invalid' };
      const owned = [s.homeProvinceId, ...(s.claimedDistricts ?? [])];
      if (!region.neighbors.some((id) => owned.includes(id))) return { key: 'err.invalid' };
      const price = PACT_PRICES[cmd.pact];
      if (!Number.isInteger(price)) return { key: 'err.invalid' };
      return missingFor(p, { gold: price });
    }
    case 'attackDistrict': {
      const region = WORLD_BY_ID[cmd.provinceId];
      if (!region || region.id === s.homeProvinceId || s.claimedDistricts?.includes(region.id)) return { key: 'err.invalid' };
      if (s.treaties?.[region.id] === 'non_aggression') return { key: 'err.truceActive' };
      const owned = [s.homeProvinceId, ...(s.claimedDistricts ?? [])];
      if (!region.neighbors.some((id) => owned.includes(id))) return { key: 'err.invalid' };
      if (s.mode === 'campaign' && !s.completedChapters.includes(1)) return { key: 'err.invalid' };
      if ((s.militia ?? 0) < 5) return { key: 'err.needMilitia' };
      return missingFor(p, { gold: 5000, food: 3000 });
    }
    case 'trainSpecialist':
      if (!UNIT_IDS.includes(cmd.unit)) return { key: 'err.invalid' };
      if (!p.buildings.some((b) => b.definitionId === 'barracks' && b.level >= 2 && b.state === 'active' && b.workers > 0 && !b.unpaid))
        return { key: 'err.specialistBarracks' };
      if (specialistCount(s.specialists) >= (s.militia ?? 0)) return { key: 'err.specialistMilitia' };
      return missingFor(p, { gold: UNITS[cmd.unit].gold * 1000 });
    case 'recruitMilitia':
      if (cmd.amount !== 5 || (s.militia ?? 0) + cmd.amount > 100) return { key: 'err.invalid' };
      if (!p.buildings.some((b) => (b.definitionId === 'watchtower' || b.definitionId === 'barracks') && isBuilt(b))) return { key: 'err.invalid' };
      return missingFor(p, { gold: 10000, food: 5000 });
    case 'moveMilitia': {
      if ((s.militia ?? 0) <= 0) return { key: 'err.invalid' };
      if (!Number.isInteger(cmd.x) || !Number.isInteger(cmd.y)) return { key: 'err.invalid' };
      // troops march cross-country to any reachable dry tile (not only along roads)
      const start: [number, number] = s.armyTarget ? [s.armyTarget.x, s.armyTarget.y] : musterPoint(p);
      return findGroundPath(p, start, [cmd.x, cmd.y]) ? null : { key: 'err.armyUnreachable' };
    }
    case 'setArmyOrder':
      return cmd.order === 'defend' || cmd.order === 'patrol' ? null : { key: 'err.invalid' };
    case 'setGameSpeed':
      return [0, 1, 2, 4].includes(cmd.speed) ? null : { key: 'err.invalid' };
    case 'redeemCheat': {
      const code = cmd.code.trim().toUpperCase();
      if (code === 'URETIM10X') return null;
      return code === 'KAYNAK100000' && (s.cheatStorageBonus ?? 0) <= 999900000000
        ? null : { key: 'err.invalid' };
    }
    case 'setAutoPause':
      return typeof cmd.enabled === 'boolean' ? null : { key: 'err.invalid' };
  }
}

function applyCommand(s: GameState, cmd: Command, roadPlan?: RoadPlan): void {
  const p = homeProvince(s);
  switch (cmd.type) {
    case 'renameCitizen':
      (s.citizenNames ??= {})[String(cmd.index)] = cmd.name.trim();
      break;
    case 'foundCompany': {
      pay(p, { gold: 3000 });
      (s.companies ??= []).push({ id: `company-${s.tick}-${s.companies.length + 1}`, name: cmd.name.trim(), sector: cmd.sector.trim() || 'Finans & Yatırım', founderIndex: Math.max(0, cmd.founderIndex), level: 1, employees: 3 });
      break;
    }
    case 'renameCompany': {
      const company = (s.companies ??= []).find((item) => item.id === cmd.companyId);
      if (company) company.name = cmd.name.trim();
      else if (cmd.companyId.startsWith('auto-')) {
        const buildingId = cmd.companyId.slice(5);
        const building = buildingById(p, buildingId);
        if (building) (s.companies ??= []).push({ id: cmd.companyId, name: cmd.name.trim(), sector: 'Finans & Yatırım', founderIndex: 0, buildingId, level: building.level, employees: Math.max(2, building.workers) });
      }
      break;
    }
    case 'advanceAge': {
      const nextAge = (((s.age ?? 1) + 1) as CityAge);
      const spec = CITY_AGES[nextAge];
      pay(p, spec.cost);
      s.age = nextAge;
      p.stocks.gold += spec.rewardGold;
      p.stocks.research += spec.rewardResearch;
      if (nextAge === 3) p.stocks.tools = Math.min(storageCaps(s, p).tools, p.stocks.tools + 10000);
      p.happiness = Math.min(100, p.happiness + (nextAge === 4 ? 10 : 5));
      break;
    }
    case 'completeContract': {
      const c = CITY_CONTRACTS.find((item) => item.id === cmd.contractId)!;
      if ('cost' in c && c.cost) pay(p, c.cost);
      if ('vessel' in c && c.vessel) { s.shipyard.fleet[c.vessel] = Math.max(0, s.shipyard.fleet[c.vessel] - 1); if (c.vessel === 'yacht') s.shipyard.yachtsSold += 1; }
      const caps = storageCaps(s, p);
      p.stocks.gold += c.gold;
      p.stocks.tools = Math.min(caps.tools, p.stocks.tools + c.tools);
      p.happiness = Math.min(100, p.happiness + c.happiness);
      (s.completedContracts ??= []).push(c.id);
      break;
    }
    case 'toggleEdict': {
      const list = (s.edicts ??= []);
      if (list.includes(cmd.edictId)) list.splice(list.indexOf(cmd.edictId), 1);
      else {
        list.push(cmd.edictId);
        const caps = storageCaps(s, p);
        if (cmd.edictId === 'free_zone_tax') { p.stocks.gold += 10000; p.happiness = Math.min(100, p.happiness + 4); }
        if (cmd.edictId === 'shipyard_overtime') { p.stocks.tools = Math.min(caps.tools, p.stocks.tools + 10000); p.stocks.research += 8000; p.happiness = Math.max(0, p.happiness - 2); }
        if (cmd.edictId === 'festival_aquapark') { pay(p, { gold: 5000 }); p.happiness = Math.min(100, p.happiness + 8); }
        if (cmd.edictId === 'solar_subsidy') { p.stocks.research += 12000; p.happiness = Math.min(100, p.happiness + 3); }
        if (cmd.edictId === 'militia_watch') s.militia = Math.min(200, (s.militia ?? 0) + 4);
      }
      break;
    }
    case 'resolveDilemma': {
      const d = CITY_DILEMMAS.find((item) => item.id === cmd.dilemmaId)!;
      const choice = cmd.choice === 'a' ? d.a : d.b;
      const caps = storageCaps(s, p);
      if (choice.gold) p.stocks.gold = Math.max(0, p.stocks.gold + choice.gold);
      if ('food' in choice && choice.food) p.stocks.food = Math.max(0, Math.min(caps.food, p.stocks.food + choice.food));
      if ('tools' in choice && choice.tools) p.stocks.tools = Math.max(0, Math.min(caps.tools, p.stocks.tools + choice.tools));
      if ('research' in choice && choice.research) p.stocks.research += choice.research;
      if (choice.happiness) p.happiness = Math.max(0, Math.min(100, p.happiness + choice.happiness));
      (s.resolvedDilemmas ??= {})[cmd.dilemmaId] = cmd.choice;
      break;
    }
    case 'hunt': {
      const route = huntRoute(p, cmd.x, cmd.y)!;
      p.hunt = { route, workers: cmd.workers, startTick: s.tick, endTick: s.tick + Math.max(12, route.length * 2 + 4) };
      break;
    }
    case 'buildTransit': {
      const route = planTransit(p, cmd.kind)!;
      pay(p, TRANSIT_COST[cmd.kind]);
      (p.transit ??= {})[cmd.kind] = { route, cargo: 'passengers', passengers: 0, earned: 0, shipped: 0 };
      logEvent(s, 'success', 'event.transitBuilt', { name: cmd.kind === 'rail' ? 'Tren istasyonu' : 'Havalimanı' }, route[0]);
      break;
    }
    case 'setTransitCargo': {
      const line = p.transit![cmd.kind]!;
      line.cargo = cmd.cargo;
      if (cmd.direction) line.direction = cmd.direction;
      break;
    }
    case 'placeBuilding': {
      const def = BUILDINGS[cmd.buildingId];
      const style = cmd.style ?? s.culture;
      const look = cmd.look ?? null;
      pay(p, levelCost(def.id, 0, style, look));
      const b: BuildingInstance = {
        id: `b${s.nextBuildingId++}`,
        definitionId: def.id,
        provinceId: p.id,
        x: cmd.x,
        y: cmd.y,
        level: 1,
        workers: 0,
        progressTicks: 0,
        state: 'construction',
        connected: true,
        unpaid: false,
        style,
        look: look ? { ...look } : null,
        condition: CONDITION_MAX,
        paidStages: def.landmark ? 1 : 0,
      };
      p.buildings.push(b);
      for (const [x, y] of footprintTiles(def, cmd.x, cmd.y)) p.tiles[idx(p, x, y)]!.buildingId = b.id;
      break;
    }
    case 'placeRoad': {
      const quote = roadQuote(s, cmd.x, cmd.y) as { type: RoadType; cost: Cost };
      pay(p, quote.cost);
      const t = p.tiles[idx(p, cmd.x, cmd.y)]!;
      t.road = true;
      t.roadType = quote.type;
      refreshConnectivity(p);
      break;
    }
    case 'placeRoadRoute': {
      const plan = roadPlan!;
      pay(p, plan.cost);
      for (const { x, y, type, paved } of plan.tiles) {
        const tile = p.tiles[idx(p, x, y)]!;
        tile.road = true;
        tile.roadType = type;
        tile.paved = !!paved;
      }
      for (const { x, y } of plan.paveTiles) p.tiles[idx(p, x, y)]!.paved = true;
      refreshConnectivity(p);
      break;
    }
    case 'paveRoad': {
      pay(p, PAVING_COST);
      p.tiles[idx(p, cmd.x, cmd.y)]!.paved = true;
      break;
    }
    case 'removeRoad': {
      const t = p.tiles[idx(p, cmd.x, cmd.y)]!;
      t.road = false;
      t.paved = false;
      refund(s, p, ROAD_COSTS[t.roadType], DEMOLISH_REFUND_PERMILLE);
      t.roadType = 'dirt';
      refreshConnectivity(p);
      break;
    }
    case 'clearTerrain': {
      const t = p.tiles[idx(p, cmd.x, cmd.y)]!;
      const wasForest = t.terrain === 'forest';
      t.terrain = 'grass';
      t.deposit = 0;
      if (t.height > 0) {
        const minNeighborH = Math.min(
          t.height,
          ...NEIGHBORS4.map(([dx, dy]) => tileAt(p, cmd.x + dx, cmd.y + dy)?.height ?? t.height),
        );
        t.height = minNeighborH;
      }
      refund(s, p, wasForest ? { wood: 15000 } : { stone: 15000 }, 1000);
      logEvent(s, 'info', 'event.terrainCleared', {}, { x: cmd.x, y: cmd.y });
      break;
    }
    case 'expandMap': {
      pay(p, { gold: 5000 });
      expandProvinceGrid(s.seed, p, 8);
      logEvent(s, 'success', 'event.mapExpanded', { w: p.width, h: p.height });
      break;
    }
    case 'buildTerrace': {
      pay(p, TERRACE_COST);
      p.tiles[idx(p, cmd.x, cmd.y)]!.terrain = 'terrace';
      logEvent(s, 'success', 'event.terraced', {}, { x: cmd.x, y: cmd.y });
      break;
    }
    case 'cancelConstruction': {
      const b = buildingById(p, cmd.instanceId)!;
      if (b.state === 'upgrading') {
        refund(s, p, levelCost(b.definitionId, b.level, b.style, b.look));
        b.state = 'active';
        b.progressTicks = 0;
      } else {
        refund(s, p, defOf(b).landmark ? paidLandmarkCost(b) : levelCost(b.definitionId, 0, b.style, b.look));
        for (const [x, y] of footprintTiles(defOf(b), b.x, b.y)) p.tiles[idx(p, x, y)]!.buildingId = null;
        p.buildings.splice(p.buildings.indexOf(b), 1);
      }
      break;
    }
    case 'upgradeBuilding': {
      const b = buildingById(p, cmd.instanceId)!;
      pay(p, levelCost(b.definitionId, b.level, b.style, b.look));
      b.state = 'upgrading';
      b.progressTicks = 0;
      break;
    }
    case 'demolishBuilding': {
      const b = buildingById(p, cmd.instanceId)!;
      for (const [x, y] of footprintTiles(defOf(b), b.x, b.y)) p.tiles[idx(p, x, y)]!.buildingId = null;
      p.buildings.splice(p.buildings.indexOf(b), 1);
      refund(s, p, investedCost(b), DEMOLISH_REFUND_PERMILLE);
      logEvent(s, 'info', 'event.demolished', { building: `@building.${b.definitionId}.name` });
      break;
    }
    case 'assignWorkers':
      buildingById(p, cmd.instanceId)!.workers = cmd.workers;
      break;
    case 'setBuildingStyle': {
      const b = buildingById(p, cmd.instanceId)!;
      pay(p, restyleCost(b.definitionId, cmd.style, cmd.look));
      b.style = cmd.style;
      b.look = cmd.look ? { ...cmd.look } : null;
      logEvent(s, 'success', 'event.restyled', {
        building: `@building.${b.definitionId}.name`,
        style: `@style.${cmd.style}`,
      });
      break;
    }
    case 'restoreBuilding': {
      const b = buildingById(p, cmd.instanceId)!;
      pay(p, repairCost(b));
      b.condition = CONDITION_MAX;
      logEvent(s, 'success', 'event.restored', { building: `@building.${b.definitionId}.name` }, { x: b.x, y: b.y });
      break;
    }
    case 'setCulture':
      s.culture = cmd.style;
      break;
    case 'orderVessel':
      pay(p, VESSELS[cmd.kind].cost);
      s.shipyard.queue.push({ id: s.shipyard.nextOrderId++, kind: cmd.kind, progress: 0 });
      break;
    case 'cancelVessel': {
      const i = s.shipyard.queue.findIndex((o) => o.id === cmd.orderId);
      const order = s.shipyard.queue[i]!;
      // untouched orders are refunded in full, started hulls return half of their materials
      refund(s, p, VESSELS[order.kind].cost, order.progress > 0 ? 500 : 1000);
      s.shipyard.queue.splice(i, 1);
      break;
    }
    case 'sellYacht':
      s.shipyard.fleet.yacht -= 1;
      s.shipyard.yachtsSold += 1;
      p.stocks.gold += VESSELS.yacht.salePrice ?? 0;
      logEvent(s, 'success', 'event.yachtSold', { gold: (VESSELS.yacht.salePrice ?? 0) / 1000 });
      break;
    case 'dispatchFlight': {
      const life = (s.cityLife ??= emptyCityLife());
      pay(p, { gold: 1000 });
      p.today.consumed.gold += 1000;
      life.operatingCosts += 1000;
      life.flights.push({ airport: cmd.airportId, phase: 'landing', age: 0, passengers: 0 });
      break;
    }
    case 'setTaxRate':
      p.taxRate = cmd.taxRate;
      break;
    case 'queueResearch':
      s.researchQueue.push(cmd.techId);
      break;
    case 'dequeueResearch': {
      const index = s.researchQueue.indexOf(cmd.techId);
      if (index === 0) {
        // invested points return to the research pool; nothing is lost or created
        p.stocks.research += s.researchProgress;
        s.researchProgress = 0;
      }
      s.researchQueue.splice(index, 1);
      break;
    }
    case 'trade': {
      const offer = TRADE_OFFERS.find((o) => o.id === cmd.offerId)!;
      pay(p, offer.give);
      for (const id of COST_KEYS(offer.get)) p.stocks[id] += offer.get[id] ?? 0;
      break;
    }
    case 'claimDistrict': {
      const cost = 20000 + (s.claimedDistricts?.length ?? 0) * 10000;
      pay(p, { gold: cost });
      (s.claimedDistricts ??= []).push(cmd.provinceId);
      if (s.treaties) delete s.treaties[cmd.provinceId];
      if (!s.revealedProvinceIds.includes(cmd.provinceId)) s.revealedProvinceIds.push(cmd.provinceId);
      expandProvinceGrid(s.seed, p, 4);
      logEvent(s, 'success', 'event.districtClaimed', { n: s.claimedDistricts.length });
      break;
    }
    case 'signPact': {
      pay(p, { gold: PACT_PRICES[cmd.pact] });
      (s.treaties ??= {})[cmd.provinceId] = cmd.pact;
      if (!s.revealedProvinceIds.includes(cmd.provinceId)) s.revealedProvinceIds.push(cmd.provinceId);
      logEvent(s, 'success', 'event.pactSigned', { pact: cmd.pact });
      break;
    }
    case 'attackDistrict': {
      const battle = forecastBattle(s, cmd.provinceId)!;
      pay(p, { gold: 5000, food: 3000 });
      s.militia = Math.max(0, (s.militia ?? 0) - battle.casualties);
      let excess = specialistCount(s.specialists) - s.militia;
      for (const id of UNIT_IDS) {
        const count = s.specialists?.[id] ?? 0;
        if (excess <= 0 || count === 0) continue;
        const lost = Math.min(excess, count);
        s.specialists![id] = count - lost;
        excess -= lost;
      }
      if (battle.victory) {
        (s.claimedDistricts ??= []).push(cmd.provinceId);
        if (s.treaties) delete s.treaties[cmd.provinceId];
        if (!s.revealedProvinceIds.includes(cmd.provinceId)) s.revealedProvinceIds.push(cmd.provinceId);
        expandProvinceGrid(s.seed, p, 4);
        logEvent(s, 'success', 'event.battleWon', { losses: battle.casualties });
      } else {
        logEvent(s, 'warning', 'event.battleLost', { losses: battle.casualties });
      }
      break;
    }
    case 'trainSpecialist': {
      pay(p, { gold: UNITS[cmd.unit].gold * 1000 });
      const specialists = s.specialists ??= {};
      specialists[cmd.unit] = (specialists[cmd.unit] ?? 0) + 1;
      logEvent(s, 'success', 'event.specialistTrained', { unit: UNITS[cmd.unit].name });
      break;
    }
    case 'recruitMilitia':
      pay(p, { gold: 10000, food: 5000 });
      s.militia = (s.militia ?? 0) + cmd.amount;
      logEvent(s, 'success', 'event.militiaRecruited', { n: s.militia });
      break;
    case 'setArmyOrder':
      s.armyOrder = cmd.order;
      break;
    case 'moveMilitia':
      s.armyTarget = { x: cmd.x, y: cmd.y };
      s.armyOrder = 'patrol';
      break;
    case 'setGameSpeed':
      s.speed = cmd.speed;
      break;
    case 'redeemCheat': {
      if (cmd.code.trim().toUpperCase() === 'URETIM10X') {
        // Idempotent: entering the same code again never stacks it to 100x.
        s.cheatProduction10x = true;
        break;
      }
      const amount = 100000 * 1000;
      // Raise finite storage capacity first; the reward is then safe to autosave.
      s.cheatStorageBonus = (s.cheatStorageBonus ?? 0) + amount;
      for (const id of RESOURCE_IDS) p.stocks[id] += amount;
      break;
    }
    case 'setAutoPause':
      s.settings.autoPauseOnMilestone = cmd.enabled;
      break;
  }
}

/**
 * The only way player intent changes the game. A refused command returns the untouched input
 * state together with a user-facing reason; an accepted one returns a new state.
 */
export function executeCommand(state: GameState, cmd: Command): CommandResult {
  const roadPlan = cmd.type === 'placeRoadRoute' ? planRoadRoute(state, cmd.start, cmd.end, cmd.bridge, cmd.paved) : undefined;
  const error = validateCommand(state, cmd, roadPlan);
  if (error) return { ok: false, error };
  return {
    ok: true,
    state: produce(state, (draft) => {
      applyCommand(draft, cmd, roadPlan);
      evaluateQuests(draft);
    }),
  };
}
