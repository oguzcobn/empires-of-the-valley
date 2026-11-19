import type { Cost, GameState, MapPoint, Province, Tile, TransitKind, TransitLine } from '../core/types';
import { TICKS_PER_DAY } from '../core/time';
import { storageCaps, totalPopulation } from './economy';
import { logEvent } from './events';
import { NEIGHBORS4, connectedRoads, tileAt, townCenter, transitOccupies } from './grid';

export type AnimalKind = 'deer' | 'boar' | 'hare';
export interface Animal extends MapPoint { kind: AnimalKind }

const ANIMALS = ['deer', 'boar', 'hare'] as const;
const TRAVEL_GOLD = { rail: 1000, air: 2000 };
export const TRANSIT_COST: Record<TransitKind, Cost> = {
  rail: { wood: 40000, stone: 55000, gold: 30000 },
  air: { wood: 60000, stone: 90000, gold: 55000 },
};

const keyOf = ({ x, y }: MapPoint): string => `${x},${y}`;
const dryLand = (t?: Tile): t is Tile => !!t && !t.buildingId && !['lake', 'water', 'mountain'].includes(t.terrain);

export function wildlife(p: Province, seed: number, tick: number): Animal[] {
  const animals: Animal[] = [];
  for (let cy = 2; cy < p.height - 2; cy += 6) {
    for (let cx = 2; cx < p.width - 2; cx += 6) {
      const h = Math.imul((cx + 11 * cy) ^ seed, 0x85ebca6b) >>> 0;
      for (let i = 0; i < 9; i++) {
        const x = cx + ((h + i) % 3);
        const y = cy + (Math.floor((h + i) / 3) % 3);
        const tile = tileAt(p, x, y);
        if (!tile || !['forest', 'grass', 'hill', 'fertile'].includes(tile.terrain)) continue;
        const spot = { x, y };
        if (dryLand(tile) && !tile.road && !transitOccupies(p, x, y) && (p.depletedHunts?.[keyOf(spot)] ?? 0) <= tick) {
          animals.push({ ...spot, kind: ANIMALS[h % ANIMALS.length]! });
        }
        break;
      }
    }
  }
  return animals;
}

export function routeFrom(
  starts: MapPoint[],
  destination: (point: MapPoint) => boolean,
  canEnter: (from: MapPoint, to: MapPoint) => boolean,
): MapPoint[] | null {
  const queue = [...starts];
  const parents = new Map(starts.map((point) => [keyOf(point), null as MapPoint | null]));
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i]!;
    if (destination(from)) {
      const route = [from];
      for (let prev = parents.get(keyOf(from)); prev; prev = parents.get(keyOf(prev))) route.push(prev);
      return route.reverse();
    }
    for (const [dx, dy] of NEIGHBORS4) {
      const to = { x: from.x + dx, y: from.y + dy };
      const key = keyOf(to);
      if (parents.has(key) || !canEnter(from, to)) continue;
      queue.push(to);
      parents.set(key, from);
    }
  }
  return null;
}

export function huntRoute(p: Province, x: number, y: number): MapPoint[] | null {
  const tc = townCenter(p);
  if (!tc) return null;
  const starts: MapPoint[] = [];
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -1; dx <= 2; dx++) {
      if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) continue;
      const pt = { x: tc.x + dx, y: tc.y + dy };
      if (dryLand(tileAt(p, pt.x, pt.y))) starts.push(pt);
    }
  }
  return routeFrom(starts, (point) => point.x === x && point.y === y, (from, to) => {
    const tile = tileAt(p, to.x, to.y);
    return dryLand(tile) && Math.abs(tile.height - tileAt(p, from.x, from.y)!.height) <= 1;
  });
}

export function transitUnlocked(s: GameState, p: Province, kind: TransitKind): boolean {
  return (townCenter(p)?.level ?? 0) >= 2 && (kind === 'rail' || s.researchedTechIds.includes('architecture'));
}

/** Select a clear site near the connected city streets, then lay track to a map exit or reserve a runway. */
export function planTransit(p: Province, kind: TransitKind): MapPoint[] | null {
  const tc = townCenter(p);
  if (!tc) return null;
  const roads = [...connectedRoads(p)];
  const available = (x: number, y: number): boolean => {
    const tile = tileAt(p, x, y);
    return dryLand(tile) && tile.height === 0 && !transitOccupies(p, x, y);
  };
  const sites: MapPoint[] = [];
  for (let y = 1; y < p.height - 1; y++) {
    for (let x = 1; x < p.width - 1; x++) {
      const tile = tileAt(p, x, y)!;
      if (!available(x, y) || tile.road || !['grass', 'sand'].includes(tile.terrain)) continue;
      if (roads.some((i) => Math.abs(i % p.width - x) + Math.abs(Math.floor(i / p.width) - y) <= 3)) sites.push({ x, y });
    }
  }
  sites.sort((a, b) => Math.abs(a.x - tc.x) + Math.abs(a.y - tc.y) - Math.abs(b.x - tc.x) - Math.abs(b.y - tc.y));
  if (kind === 'rail') {
    return routeFrom(sites, ({ x, y }) => x === p.width - 1 || y === p.height - 1 || x === 0 || y === 0,
      (_from, to) => available(to.x, to.y));
  }
  for (const site of sites) {
    for (const [dx, dy] of NEIGHBORS4) {
      const runway = Array.from({ length: 5 }, (_, i) => ({ x: site.x + dx * i, y: site.y + dy * i }));
      if (runway.every(({ x, y }) => available(x, y) && !tileAt(p, x, y)!.road)) return runway;
    }
  }
  return null;
}

export function resolveHunt(s: GameState, p: Province): void {
  const hunt = p.hunt;
  if (!hunt || s.tick < hunt.endTick) return;
  const site = hunt.route.at(-1)!;
  if (!dryLand(tileAt(p, site.x, site.y))) {
    delete p.hunt;
    logEvent(s, 'warning', 'event.huntCancelled', {}, site);
    return;
  }
  const food = Math.max(0, Math.min(hunt.workers * 7000, storageCaps(s, p).food - p.stocks.food));
  p.stocks.food += food;
  p.today.produced.food += food;
  const depleted = p.depletedHunts ??= {};
  for (const [key, until] of Object.entries(depleted)) if (until <= s.tick) delete depleted[key];
  depleted[keyOf(site)] = s.tick + 5 * TICKS_PER_DAY;
  delete p.hunt;
  logEvent(s, 'success', 'event.huntReturn', { n: food / 1000 }, site);
}

export function shipment(s: GameState, p: Province, kind: TransitKind, line: TransitLine): { amount: number; gold: number } {
  const cargo = line.cargo;
  if (cargo === 'passengers') return { amount: 0, gold: 0 };
  const capacity = kind === 'rail' ? 12000 : 8000;
  if (line.direction === 'import') {
    const price = cargo === 'tools' ? 3 : 2;
    const amount = Math.max(0, Math.min(capacity, storageCaps(s, p)[cargo] - p.stocks[cargo], Math.floor(p.stocks.gold / price)));
    return { amount, gold: amount * price };
  }
  const amount = Math.min(capacity, Math.max(0, p.stocks[cargo] - 20000));
  return { amount, gold: Math.floor(amount * (cargo === 'tools' ? 2 : 1.25)) };
}

export function transitDayEnd(s: GameState, p: Province): void {
  for (const kind of ['rail', 'air'] as const) {
    const line = p.transit?.[kind];
    if (!line) continue;
    if (line.cargo === 'passengers') {
      const riders = Math.max(1, Math.min(kind === 'rail' ? 18 : 30, Math.floor(totalPopulation(p) / 4)));
      const fares = riders * TRAVEL_GOLD[kind];
      line.passengers += riders;
      line.earned += fares;
      p.stocks.gold += fares;
      p.today.produced.gold += fares;
      s.tourism.totalVisitors += riders;
    } else {
      const { amount, gold } = shipment(s, p, kind, line);
      line.shipped += amount;
      if (line.direction === 'import') {
        p.stocks[line.cargo] += amount;
        p.today.produced[line.cargo] += amount;
        p.stocks.gold -= gold;
        p.today.consumed.gold += gold;
        line.spent = (line.spent ?? 0) + gold;
      } else {
        p.stocks[line.cargo] -= amount;
        p.today.consumed[line.cargo] += amount;
        p.stocks.gold += gold;
        p.today.produced.gold += gold;
        line.earned += gold;
      }
    }
  }
}
