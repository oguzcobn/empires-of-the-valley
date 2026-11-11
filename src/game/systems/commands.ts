import { produce } from 'immer';
import { mulPermille } from '../core/fixed';
import type {
  BuildingId,
  BuildingInstance,
  CommandResult,
  Cost,
  GameSpeed,
  GameState,
  LevelSpec,
  MessageRef,
  Province,
  ResourceId,
  TaxRate,
  TechId,
} from '../core/types';
import { DEMOLISH_REFUND_PERMILLE, ROAD_COST_WOOD, ROAD_REFUND_WOOD, TRADE_OFFERS } from '../data/balance';
import { BUILDINGS, defOf, specOf } from '../data/buildings';
import { TECHNOLOGIES } from '../data/technologies';
import { homeProvince, idleWorkers, isBuilt, storageCaps, totalPopulation } from './economy';
import { logEvent } from './events';
import { buildingById, footprintTiles, idx, refreshConnectivity, tileAt, townCenter } from './grid';
import { checkRoadSite, checkSite } from './placement';
import { evaluateQuests } from './quests';

export type Command =
  | { type: 'placeBuilding'; buildingId: BuildingId; x: number; y: number }
  | { type: 'placeRoad'; x: number; y: number }
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
  | { type: 'setAutoPause'; enabled: boolean };

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

export function validatePlacement(
  s: GameState,
  buildingId: BuildingId,
  x: number,
  y: number,
): MessageRef | null {
  const def = BUILDINGS[buildingId];
  if (!def.buildable) return { key: 'err.notBuildable' };
  const p = homeProvince(s);
  return checkSite(p, def, x, y) ?? missingFor(p, def.levels[0]!.cost);
}

/** Total cost invested in a building up to its current level. */
function investedCost(b: BuildingInstance): Cost {
  const total: Cost = {};
  for (let l = 0; l < b.level; l++) {
    const cost = BUILDINGS[b.definitionId].levels[l]!.cost;
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
      return validatePlacement(s, cmd.buildingId, cmd.x, cmd.y);
    case 'placeRoad':
      return checkRoadSite(p, cmd.x, cmd.y) ?? missingFor(p, { wood: ROAD_COST_WOOD });
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
      return requirementError(s, next) ?? missingFor(p, next.cost);
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
      if (!isBuilt(b)) return { key: 'err.busy' };
      const slots = specOf(b).workerSlots;
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
      pay(p, def.levels[0]!.cost);
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
      };
      p.buildings.push(b);
      for (const [x, y] of footprintTiles(def, cmd.x, cmd.y)) p.tiles[idx(p, x, y)]!.buildingId = b.id;
      break;
    }
    case 'placeRoad':
      pay(p, { wood: ROAD_COST_WOOD });
      p.tiles[idx(p, cmd.x, cmd.y)]!.road = true;
      refreshConnectivity(p);
      break;
    case 'removeRoad':
      p.tiles[idx(p, cmd.x, cmd.y)]!.road = false;
      refund(s, p, { wood: ROAD_REFUND_WOOD });
      refreshConnectivity(p);
      break;
    case 'cancelConstruction': {
      const b = buildingById(p, cmd.instanceId)!;
      if (b.state === 'upgrading') {
        refund(s, p, defOf(b).levels[b.level]!.cost);
        b.state = 'active';
        b.progressTicks = 0;
      } else {
        refund(s, p, defOf(b).levels[0]!.cost);
        for (const [x, y] of footprintTiles(defOf(b), b.x, b.y)) p.tiles[idx(p, x, y)]!.buildingId = null;
        p.buildings.splice(p.buildings.indexOf(b), 1);
      }
      break;
    }
    case 'upgradeBuilding': {
      const b = buildingById(p, cmd.instanceId)!;
      pay(p, defOf(b).levels[b.level]!.cost);
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
