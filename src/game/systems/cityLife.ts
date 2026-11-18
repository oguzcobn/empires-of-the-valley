import type { BuildingInstance, GameState, MapPoint, Province, Tile } from '../core/types';
import { clockHour } from '../core/time';
import { defOf } from '../data/buildings';
import { canLink, perimeterTiles, tileAt } from './grid';
import { beds } from './tourism';
import { isOperating, isBuilt, storageCaps } from './economy';
import { logEvent } from './events';

export type CityJobKind = 'shopping' | 'ambulance' | 'patrol' | 'fire' | 'delivery' | 'dining' | 'nightlife' | 'hotel';
export type CityStage = 'outbound' | 'park' | 'walkIn' | 'inside' | 'walkOut' | 'return';
export interface CityJob {
  id: number;
  kind: CityJobKind;
  source: string;
  target: string;
  slot: number;
  path: MapPoint[];
  index: number;
  stage: CityStage;
  age: number;
}
export interface Flight {
  airport: string;
  phase: 'landing' | 'taxiIn' | 'terminal' | 'taxiOut' | 'takeoff';
  age: number;
  passengers: number;
}
export interface CityLifeState {
  nextId: number;
  jobs: CityJob[];
  flights: Flight[];
  completedTrips: number;
  completedFlights: number;
  passengers: number;
  revenue: number;
  operatingCosts: number;
}
export const emptyCityLife = (): CityLifeState => ({
  nextId: 1,
  jobs: [],
  flights: [],
  completedTrips: 0,
  completedFlights: 0,
  passengers: 0,
  revenue: 0,
  operatingCosts: 0,
});
export const driveable = (t?: Tile): boolean =>
  !!t?.road && (t.roadType === 'bridge' || (t.roadType === 'dirt' && !!t.paved));
const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;
const center = (x: number, y: number): MapPoint => ({ x: x + 0.5, y: y + 0.5 });

/** Multi-source BFS: only a connected asphalt/bridge route can create a journey. */
export function cityRoute(
  p: Province,
  source: BuildingInstance,
  target: BuildingInstance,
): MapPoint[] | null {
  const starts = perimeterTiles(defOf(source), source.x, source.y).filter(([x, y]) =>
    driveable(tileAt(p, x, y)),
  );
  const goals = new Set(
    perimeterTiles(defOf(target), target.x, target.y)
      .filter(([x, y]) => driveable(tileAt(p, x, y)))
      .map(([x, y]) => y * p.width + x),
  );
  const parents = new Map<number, number>();
  const queue: number[] = [];
  for (const [x, y] of starts) {
    const n = y * p.width + x;
    parents.set(n, -1);
    queue.push(n);
  }
  for (let q = 0; q < queue.length; q++) {
    const n = queue[q]!,
      x = n % p.width,
      y = Math.floor(n / p.width);
    if (goals.has(n)) {
      const path = [n];
      let prev = parents.get(n)!;
      while (prev !== -1) {
        path.unshift(prev);
        prev = parents.get(prev)!;
      }
      return path.map((i) => center(i % p.width, Math.floor(i / p.width)));
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx,
        ny = y + dy,
        t = tileAt(p, nx, ny),
        at = tileAt(p, x, y)!;
      const k = ny * p.width + nx;
      if (driveable(t) && t && canLink(at, t) && t.height === at.height && !parents.has(k)) {
        parents.set(k, n);
        queue.push(k);
      }
    }
  }
  return null;
}
export function bay(b: BuildingInstance, slot = 0): MapPoint {
  return { x: b.x + 0.42 + slot * 0.55, y: b.y + defOf(b).footprint[1] - 0.25 };
}
export function door(b: BuildingInstance): MapPoint {
  return { x: b.x + defOf(b).footprint[0] / 2, y: b.y + Math.min(1.23, defOf(b).footprint[1] - 0.1) };
}
/** Keep cars outside the building volume while crossing their own forecourt. */
function access(b: BuildingInstance, road: MapPoint, slot: number): MapPoint[] {
  const [w, h] = defOf(b).footprint;
  const park = bay(b, slot);
  if (road.y >= b.y + h) return [{ x: park.x, y: b.y + h - 0.05 }, park];
  const edge = road.x < b.x + w / 2 ? b.x + 0.05 : b.x + w - 0.05;
  return [
    { x: edge, y: Math.max(b.y + 0.05, Math.min(b.y + h - 0.05, road.y)) },
    { x: edge, y: b.y + h - 0.08 },
    { x: park.x, y: b.y + h - 0.08 },
    park,
  ];
}
export function validCityJob(p: Province, j: CityJob): boolean {
  const source = p.buildings.find((b) => b.id === j.source),
    target = p.buildings.find((b) => b.id === j.target);
  if (!source || !target || !source.connected || !target.connected || !isBuilt(source) || !isBuilt(target))
    return false;
  const service = ['ambulance', 'patrol', 'fire', 'delivery'].includes(j.kind) ? source : target;
  if (!isOperating(service)) return false;
  return j.path.every((at) => {
    const t = tileAt(p, Math.floor(at.x), Math.floor(at.y));
    return t && (t.buildingId === source.id || t.buildingId === target.id || driveable(t));
  });
}
const phases: Flight['phase'][] = ['landing', 'taxiIn', 'terminal', 'taxiOut', 'takeoff'];
const duration: Record<Flight['phase'], number> = {
  landing: 3,
  taxiIn: 2,
  terminal: 3,
  taxiOut: 2,
  takeoff: 3,
};
export const flightDuration = (phase: Flight['phase']): number => duration[phase];

/** Saved deterministic service jobs; never advanced by render FPS. */
export function cityLifeTick(s: GameState, p: Province): void {
  const venues = p.buildings.filter(
    (b) =>
      isOperating(b) &&
      ['hospital', 'police_station', 'fire_station', 'factory', 'market', 'restaurant', 'club', 'hotel', 'airport'].includes(
        b.definitionId,
      ),
  );
  if (!s.cityLife && !venues.length) return;
  const life = (s.cityLife ??= emptyCityLife());
  life.jobs = life.jobs.filter((j) => validCityJob(p, j));
  for (const j of life.jobs) {
    j.age++;
    if (j.stage === 'outbound' || j.stage === 'return') {
      if (j.index < j.path.length - 1) j.index++;
      else if (j.stage === 'outbound') {
        j.stage = 'park';
        j.age = 0;
      } else {
        j.age = -1;
        life.completedTrips++;
      }
    } else {
      const sequence: CityStage[] = ['park', 'walkIn', 'inside', 'walkOut', 'return'];
      if (j.age >= (j.stage === 'inside' ? (j.kind === 'fire' ? 3 : 2) : 1)) {
        if (j.stage === 'inside') {
          if (j.kind === 'fire') {
            const targetBld = p.buildings.find((b) => b.id === j.target);
            if (targetBld) {
              targetBld.condition = Math.min(10000, targetBld.condition + 1500);
              logEvent(
                s,
                'success',
                'event.fireExtinguished',
                { building: `@building.${targetBld.definitionId}.name` },
                { x: targetBld.x, y: targetBld.y },
              );
            }
          } else {
            const amount =
              j.kind === 'shopping' ? 100 : j.kind === 'dining' ? 180 : j.kind === 'hotel' ? 250 : 0;
            if (amount && p.stocks.food >= 100) {
              p.stocks.food -= 100;
              p.today.consumed.food += 100;
              p.stocks.gold += amount;
              p.today.produced.gold += amount;
              life.revenue += amount;
            }
          }
        }
        j.stage = sequence[sequence.indexOf(j.stage) + 1]!;
        j.age = 0;
        if (j.stage === 'return') {
          j.path.reverse();
          j.index = 0;
        }
      }
    }
  }
  life.jobs = life.jobs.filter((j) => j.age >= 0);
  // One runway reservation per airport. A completed landing admits bounded passengers once.
  life.flights = life.flights.filter((f) => venues.some((b) => b.id === f.airport));
  for (const f of life.flights) {
    f.age++;
    if (f.age >= duration[f.phase]) {
      f.age = 0;
      const next = phases[phases.indexOf(f.phase) + 1];
      if (!next) {
        life.completedFlights++;
        f.age = -1;
        continue;
      }
      f.phase = next;
      if (next === 'terminal') {
        const seats = Math.min(8, Math.floor(beds(p) / 2));
        const n = Math.min(seats, Math.floor(p.stocks.food / 200));
        f.passengers = n;
        p.stocks.food -= n * 200;
        p.today.consumed.food += n * 200;
        const income = n * 500;
        const cap = storageCaps(s, p).gold;
        const added = Math.max(0, Math.min(income, cap - p.stocks.gold));
        p.stocks.gold += added;
        p.today.produced.gold += added;
        life.revenue += added;
        life.passengers += n;
        s.tourism.totalVisitors += n;
      }
    }
  }
  life.flights = life.flights.filter((f) => f.age >= 0);
  for (const b of venues) {
    if (b.definitionId === 'airport') {
      if (
        s.tick % 18 === 0 &&
        !life.flights.some((f) => f.airport === b.id) &&
        life.flights.length < 4 &&
        beds(p) > 0 &&
        p.stocks.gold >= 1000
      ) {
        p.stocks.gold -= 1000;
        p.today.consumed.gold += 1000;
        life.operatingCosts += 1000;
        life.flights.push({ airport: b.id, phase: 'landing', age: 0, passengers: 0 });
      }
      continue;
    }
    if (life.jobs.length >= 24 || s.tick % 4 !== 0) continue;
    if (b.definitionId === 'club' && clockHour(s.tick) < 18 && clockHour(s.tick) > 4) continue;
    const service = ['hospital', 'police_station', 'fire_station', 'factory'].includes(b.definitionId);
    const candidates = p.buildings.filter(
      (other) =>
        other.id !== b.id &&
        isBuilt(other) &&
        other.connected &&
        (b.definitionId === 'factory'
          ? ['market', 'warehouse'].includes(other.definitionId)
          : b.definitionId === 'fire_station'
            ? other.definitionId !== 'town_center'
            : other.definitionId === 'hut'),
    );
    if (!candidates.length) continue;
    const other = candidates[(Math.floor(s.tick / 4) + b.x) % candidates.length]!;
    const source = service ? b : other,
      target = service ? other : b;
    const used = life.jobs.filter((j) => (service ? j.source === b.id : j.target === b.id));
    const occupied = life.jobs.filter((j) => j.target === target.id);
    const slot = [0, 1, 2].find((n) => !occupied.some((j) => j.slot === n));
    if (slot === undefined || used.length >= (service ? 1 : 3)) continue;
    const route = cityRoute(p, source, target);
    if (!route) continue;
    const kind: CityJobKind =
      b.definitionId === 'hospital'
        ? 'ambulance'
        : b.definitionId === 'police_station'
          ? 'patrol'
          : b.definitionId === 'fire_station'
            ? 'fire'
            : b.definitionId === 'factory'
              ? 'delivery'
              : b.definitionId === 'restaurant'
                ? 'dining'
                : b.definitionId === 'club'
                  ? 'nightlife'
                  : b.definitionId === 'hotel'
                    ? 'hotel'
                    : 'shopping';
    if (kind === 'fire') {
      target.condition = Math.max(2500, target.condition - 600);
      logEvent(
        s,
        'warning',
        'event.fireOutbreak',
        { building: `@building.${target.definitionId}.name` },
        { x: target.x, y: target.y },
      );
    }
    const sourceAccess = service ? access(source, route[0]!, 0).reverse() : [];
    const destinationAccess = [
      'market',
      'restaurant',
      'club',
      'hotel',
      'factory',
      'hospital',
      'police_station',
      'fire_station',
    ].includes(target.definitionId)
      ? access(target, route.at(-1)!, slot)
      : [];
    const path = [...sourceAccess, ...route, ...destinationAccess];
    life.jobs.push({
      id: life.nextId++,
      kind,
      source: source.id,
      target: target.id,
      slot,
      path,
      index: 0,
      stage: 'outbound',
      age: 0,
    });
  }
}
/**
 * Sends one service vehicle from `source` to `target` now (used by emergencies). Returns false
 * when the city is at its journey limit, the vehicle is already out or no asphalt route exists.
 */
export function dispatchService(
  s: GameState,
  p: Province,
  source: BuildingInstance,
  target: BuildingInstance,
  kind: 'ambulance' | 'patrol' | 'fire',
): boolean {
  const life = (s.cityLife ??= emptyCityLife());
  if (life.jobs.length >= 24 || life.jobs.some((j) => j.source === source.id && j.kind === kind)) return false;
  const route = cityRoute(p, source, target);
  if (!route) return false;
  life.jobs.push({
    id: life.nextId++,
    kind,
    source: source.id,
    target: target.id,
    slot: 0,
    path: [...access(source, route[0]!, 0).reverse(), ...route],
    index: 0,
    stage: 'outbound',
    age: 0,
  });
  return true;
}
