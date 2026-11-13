import { produce } from 'immer';
import { mulPermille } from '../core/fixed';
import type {
  ArchitectureStyle,
  BuildingId,
  BuildingLook,
  BuildingInstance,
  CommandResult,
  Cost,
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
} from '../core/types';
import { CONDITION_MAX, DESIGNABLE, isPlayableStyle } from '../data/architecture';
import { DEMOLISH_REFUND_PERMILLE, ROAD_COSTS, TERRACE_COST, TRADE_OFFERS } from '../data/balance';
import { BUILDINGS, defOf, specOf } from '../data/buildings';
import { TECHNOLOGIES } from '../data/technologies';
import { homeProvince, idleWorkers, isBuilt, storageCaps, totalPopulation } from './economy';
import { logEvent } from './events';
import { buildingById, footprintTiles, idx, refreshConnectivity, tileAt, townCenter } from './grid';
import { checkRoadSite, checkSite, roadTypeFor } from './placement';
import { investedCost, levelCost, repairCost, restyleCost, sameLook } from './architecture';
import { lookSchema } from '../save/lookSchema';
import { MAX_ORDERS, VESSELS } from '../data/shipyard';
import { fleetCount } from './tourism';
import { evaluateQuests } from './quests';
import { WORLD_BY_ID } from '../data/worldMap';

export type Command =
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
  | { type: 'placeRoad'; x: number; y: number }
  | { type: 'buildTerrace'; x: number; y: number }
  | { type: 'removeRoad'; x: number; y: number }
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
  | { type: 'claimDistrict'; provinceId: string }
  | { type: 'recruitMilitia'; amount: number }
  | { type: 'setArmyOrder'; order: 'defend' | 'patrol' }
  | { type: 'moveMilitia'; x: number; y: number };

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
export function roadQuote(s: GameState, x: number, y: number): { type: RoadType; cost: Cost } | { error: MessageRef } {
  const p = homeProvince(s);
  const site = checkRoadSite(p, x, y);
  if (site) return { error: site };
  const type = roadTypeFor(p, x, y)!;
  if (type === 'tunnel' && !s.researchedTechIds.includes('masonry')) return { error: { key: 'err.needMasonryTunnel' } };
  return { type, cost: ROAD_COSTS[type] };
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
export function validateCommand(s: GameState, cmd: Command): MessageRef | null {
  const p = homeProvince(s);
  switch (cmd.type) {
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
    case 'placeRoad': {
      const quote = roadQuote(s, cmd.x, cmd.y);
      return 'error' in quote ? quote.error : missingFor(p, quote.cost);
    }
    case 'buildTerrace': {
      const t = tileAt(p, cmd.x, cmd.y);
      if (!t) return { key: 'err.outOfBounds' };
      if (t.terrain !== 'hill' || t.road || t.buildingId) return { key: 'err.notTerraceable' };
      return missingFor(p, TERRACE_COST);
    }
    case 'removeRoad':
      return tileAt(p, cmd.x, cmd.y)?.road ? null : { key: 'err.noRoadHere' };
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
    case 'recruitMilitia':
      if (cmd.amount !== 5 || (s.militia ?? 0) + cmd.amount > 100) return { key: 'err.invalid' };
      if (!p.buildings.some((b) => b.definitionId === 'watchtower' && isBuilt(b))) return { key: 'err.invalid' };
      return missingFor(p, { gold: 10000, food: 5000 });
    case 'moveMilitia': {
      if ((s.militia ?? 0) <= 0) return { key: 'err.invalid' };
      if (!Number.isInteger(cmd.x) || !Number.isInteger(cmd.y)) return { key: 'err.invalid' };
      return tileAt(p, cmd.x, cmd.y)?.road ? null : { key: 'err.invalid' };
    }
    case 'setArmyOrder':
      return cmd.order === 'defend' || cmd.order === 'patrol' ? null : { key: 'err.invalid' };
    case 'setGameSpeed':
      return [0, 1, 2, 4].includes(cmd.speed) ? null : { key: 'err.invalid' };
    case 'setAutoPause':
      return typeof cmd.enabled === 'boolean' ? null : { key: 'err.invalid' };
  }
}

function applyCommand(s: GameState, cmd: Command): void {
  const p = homeProvince(s);
  switch (cmd.type) {
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
    case 'removeRoad': {
      const t = p.tiles[idx(p, cmd.x, cmd.y)]!;
      t.road = false;
      refund(s, p, ROAD_COSTS[t.roadType], DEMOLISH_REFUND_PERMILLE);
      t.roadType = 'dirt';
      refreshConnectivity(p);
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
      if (!s.revealedProvinceIds.includes(cmd.provinceId)) s.revealedProvinceIds.push(cmd.provinceId);
      logEvent(s, 'success', 'event.districtClaimed', { n: s.claimedDistricts.length });
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
  const error = validateCommand(state, cmd);
  if (error) return { ok: false, error };
  return {
    ok: true,
    state: produce(state, (draft) => {
      applyCommand(draft, cmd);
      evaluateQuests(draft);
    }),
  };
}
