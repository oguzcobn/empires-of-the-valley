import { Container, Graphics } from 'pixi.js';
import type { BuildingInstance, GameEvent, GameState, Province } from '../core/types';
import { HEIGHT_PX } from '../data/balance';
import { defOf } from '../data/buildings';
import { isOperating } from '../systems/economy';
import { footprintTiles, tileAt } from '../systems/grid';
import { isoX, isoY } from './iso';
import { SERVICE_BAYS, fleetSize } from './serviceBays';
import type { ServiceVehicle } from './serviceBays';
import { beatTiles, findDrivePath, gateTiles, laneWaypoints, roadNear } from './serviceRoutes';
import type { GridPoint, Waypoint } from './serviceRoutes';
import { drawBeacon, drawServiceVehicle } from './trafficSprites';

/** Event keys that send an ambulance or a patrol car to the scene. */
const AMBULANCE_CALLS = new Set<string>(['event.emergencyIllnessTreated', 'event.emergencyAccidentTreated']);
const POLICE_CALLS = new Set<string>(['event.crimePatrol', 'event.crimeTheft', 'event.crimeVandalism']);

/** Tiles per second (before the game-speed factor). Ordinary traffic runs at about 0.6. */
const SIREN_SPEED = 1.7;
const PATROL_SPEED = 0.75;
/** Real milliseconds spent at an emergency scene, and parked between patrols. */
const SCENE_MS = 2600;
const REST_MS = 3500;
/** Road tiles visited by one patrol before the car returns to the station. */
const PATROL_LEGS = 4;
const FLASH_MS = 190;

/** Marks the off-road forecourt points at either end of a route. */
const BAY_TILE: GridPoint = [-1, -1];

type Mode = 'parked' | 'call' | 'scene' | 'patrol' | 'return';

interface ServiceCar {
  kind: ServiceVehicle;
  buildingId: string;
  bay: number;
  c: Container;
  body: Graphics;
  beacon: Graphics;
  heading: string;
  mode: Mode;
  route: Waypoint[];
  seg: number;
  t: number;
  waitMs: number;
  legs: number;
  x: number;
  y: number;
  flash: number;
  flashPhase: 0 | 1;
  beaconSig: string;
}

/** Screen heading (dominant tile axis) for a movement vector. */
function headingOf(vx: number, vy: number): [number, number] {
  if (Math.abs(vx) >= Math.abs(vy)) return [vx < 0 ? -1 : 1, 0];
  return [0, vy < 0 ? -1 : 1];
}

/**
 * Emergency fleet: ambulances parked at hospitals and patrol cars at police stations, each
 * owned by a staffed bay. Purely visual — calls come from events the simulation already logged,
 * so the fleet never changes the game.
 */
export class ServiceFleet {
  private cars: ServiceCar[] = [];
  private lastEventId = -1;
  private rand = 0x9e3779b9;

  constructor(private layer: Container) {}

  get count(): number {
    return this.cars.length;
  }

  /** Cars currently running with lights (for tests and stats). */
  get active(): number {
    return this.cars.filter((car) => car.mode !== 'parked').length;
  }

  destroy(): void {
    for (const car of this.cars) car.c.destroy({ children: true });
    this.cars = [];
  }

  setTint(tint: number): void {
    for (const car of this.cars) car.body.tint = tint;
  }

  private random(): number {
    this.rand = (Math.imul(this.rand ^ (this.rand >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return this.rand / 0x100000000;
  }

  update(
    game: GameState, p: Province, dt: number, motion: boolean, speedFactor: number, night: number, leftSide: boolean,
  ): void {
    this.syncCars(p);
    this.dispatch(game, p, leftSide);
    const step = motion ? (dt / 1000) * speedFactor : 0;
    for (const car of this.cars) {
      const home = p.buildings.find((b) => b.id === car.buildingId);
      if (!home) continue;
      this.advance(car, home, p, step, dt, motion && speedFactor > 0, leftSide);
      this.place(car, home, p);
      this.paintBeacon(car, dt, motion, night);
    }
  }

  /** One car per staffed bay of every operating service building. */
  private syncCars(p: Province): void {
    const wanted = new Map<string, number>();
    for (const b of p.buildings) {
      if (!SERVICE_BAYS[b.definitionId]) continue;
      wanted.set(b.id, isOperating(b) ? fleetSize(b.definitionId, b.workers) : 0);
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i]!;
      if (car.bay >= (wanted.get(car.buildingId) ?? 0)) {
        car.c.destroy({ children: true });
        this.cars.splice(i, 1);
      }
    }
    for (const [buildingId, n] of wanted) {
      const b = p.buildings.find((x) => x.id === buildingId)!;
      for (let bay = 0; bay < n; bay++) {
        if (this.cars.some((car) => car.buildingId === buildingId && car.bay === bay)) continue;
        const kind = SERVICE_BAYS[b.definitionId]!.vehicle;
        const c = new Container();
        const body = new Graphics();
        const beacon = new Graphics();
        c.addChild(body, beacon);
        c.cullable = true;
        this.layer.addChild(c);
        const [bu, bv] = SERVICE_BAYS[b.definitionId]!.bays[bay]!;
        const car: ServiceCar = {
          kind, buildingId, bay, c, body, beacon, heading: '', mode: 'parked', route: [], seg: 0, t: 0,
          // stagger the first patrols so a station does not empty at once
          waitMs: kind === 'police' ? 1200 + bay * 2600 : 0,
          legs: 0, x: b.x + bu, y: b.y + bv, flash: 0, flashPhase: 0, beaconSig: '',
        };
        this.cars.push(car);
      }
    }
  }

  /**
   * Off-road legs between the bay and its gate road. Bays sit on the front forecourt; a gate
   * behind or beside the building is reached by the side corridor of the footprint, never
   * through the building.
   */
  private yardLegs(car: ServiceCar, home: BuildingInstance, gate: GridPoint): Waypoint[] {
    const bay = this.bayPoint(car, home);
    const [w, h] = defOf(home).footprint;
    const gx = gate[0] + 0.5, gy = gate[1] + 0.5;
    const inside = (v: number, lo: number, hi: number): number => Math.max(lo + 0.08, Math.min(hi - 0.08, v));
    if (gate[1] >= home.y + h) {
      const x = inside(gx, home.x, home.x + w);
      return [bay, { x, y: bay.y, tile: BAY_TILE }, { x, y: gy, tile: BAY_TILE }];
    }
    const right = gate[0] >= home.x + w || (gate[0] >= home.x && gx > home.x + w / 2);
    const sx = right ? home.x + w - 0.08 : home.x + 0.08;
    return [bay, { x: sx, y: bay.y, tile: BAY_TILE }, { x: sx, y: gy, tile: BAY_TILE }];
  }

  private bayPoint(car: ServiceCar, home: BuildingInstance): Waypoint {
    const [u, v] = SERVICE_BAYS[home.definitionId]!.bays[car.bay]!;
    return { x: home.x + u, y: home.y + v, tile: BAY_TILE };
  }

  /** Route from the car's bay (or its current spot) along the roads to `goal`. */
  private routeTo(car: ServiceCar, home: BuildingInstance, p: Province, goal: GridPoint, leftSide: boolean): Waypoint[] | null {
    const parked = car.mode === 'parked';
    const from: GridPoint = parked
      ? gateTiles(p, home, [car.x, car.y])[0] ?? [-1, -1]
      : [Math.floor(car.x), Math.floor(car.y)];
    const tiles = findDrivePath(p, from, goal);
    if (!tiles) return null;
    const lanes = laneWaypoints(tiles, leftSide);
    return parked ? [...this.yardLegs(car, home, from), ...lanes] : [{ x: car.x, y: car.y, tile: from }, ...lanes];
  }

  private routeHome(car: ServiceCar, home: BuildingInstance, p: Province, leftSide: boolean): Waypoint[] | null {
    const here: GridPoint = [Math.floor(car.x), Math.floor(car.y)];
    const bay = this.bayPoint(car, home);
    const gate = gateTiles(p, home, [bay.x, bay.y])[0];
    if (!gate) return null;
    const tiles = findDrivePath(p, here, gate);
    if (!tiles) return null;
    return [{ x: car.x, y: car.y, tile: here }, ...laneWaypoints(tiles, leftSide), ...this.yardLegs(car, home, gate).reverse()];
  }

  /** Answer new emergency and crime events with the nearest free vehicle. */
  private dispatch(game: GameState, p: Province, leftSide: boolean): void {
    const log = game.eventLog;
    const newest = log.length ? log[log.length - 1]!.id : -1;
    if (this.lastEventId < 0 || newest < this.lastEventId) {
      // first frame or a loaded save: past events are history, not live calls
      this.lastEventId = newest;
      return;
    }
    const fresh: GameEvent[] = log.filter((e) => e.id > this.lastEventId);
    this.lastEventId = newest;
    for (const event of fresh) {
      if (!event.at) continue;
      const kind: ServiceVehicle | null = AMBULANCE_CALLS.has(event.key) ? 'ambulance' : POLICE_CALLS.has(event.key) ? 'police' : null;
      if (!kind) continue;
      const scene = roadNear(p, event.at);
      if (!scene) continue;
      const free = this.cars
        .filter((car) => car.kind === kind && car.mode !== 'call' && car.mode !== 'scene')
        .map((car) => ({ car, d: Math.abs(car.x - event.at!.x) + Math.abs(car.y - event.at!.y) }))
        .sort((a, b) => a.d - b.d);
      for (const { car } of free) {
        const home = p.buildings.find((b) => b.id === car.buildingId);
        const route = home && this.routeTo(car, home, p, scene, leftSide);
        if (!route) continue;
        this.start(car, 'call', route);
        break;
      }
    }
  }

  private start(car: ServiceCar, mode: Mode, route: Waypoint[]): void {
    car.mode = mode;
    car.route = route;
    car.seg = 0;
    car.t = 0;
  }

  private park(car: ServiceCar, home: BuildingInstance): void {
    const bay = this.bayPoint(car, home);
    car.mode = 'parked';
    car.route = [];
    car.x = bay.x;
    car.y = bay.y;
    car.waitMs = car.kind === 'police' ? REST_MS + this.random() * REST_MS : 0;
  }

  private advance(
    car: ServiceCar, home: BuildingInstance, p: Province, step: number, dt: number, running: boolean, leftSide: boolean,
  ): void {
    if (car.mode === 'parked') {
      if (car.kind !== 'police' || !running) return;
      car.waitMs -= dt;
      if (car.waitMs > 0) return;
      const beat = beatTiles(p, home, defOf(home).services?.patrolRadius ?? 5);
      const goal = beat[Math.floor(this.random() * beat.length)];
      const route = goal && this.routeTo(car, home, p, goal, leftSide);
      if (route && route.length > 2) {
        car.legs = 0;
        this.start(car, 'patrol', route);
      } else {
        car.waitMs = REST_MS;
      }
      return;
    }
    if (car.mode === 'scene') {
      if (!running) return;
      car.waitMs -= dt;
      if (car.waitMs > 0) return;
      const route = this.routeHome(car, home, p, leftSide);
      if (route) this.start(car, 'return', route);
      else this.park(car, home);
      return;
    }
    // A demolished road under the route sends the car straight back to its bay.
    if (car.route.slice(car.seg + 1).some((w) => w.tile !== BAY_TILE && !tileAt(p, w.tile[0], w.tile[1])?.road)) {
      this.park(car, home);
      return;
    }
    if (this.blocked(car)) return;
    const speed = car.mode === 'patrol' ? PATROL_SPEED : SIREN_SPEED;
    let budget = step * speed;
    while (budget > 0 && car.seg < car.route.length - 1) {
      const a = car.route[car.seg]!;
      const b = car.route[car.seg + 1]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
      const left = (1 - car.t) * length;
      if (budget < left) {
        car.t += budget / length;
        budget = 0;
      } else {
        budget -= left;
        car.seg += 1;
        car.t = 0;
      }
    }
    if (car.seg >= car.route.length - 1) {
      const end = car.route[car.route.length - 1]!;
      car.x = end.x;
      car.y = end.y;
      this.arrive(car, home, p, leftSide);
      return;
    }
    const a = car.route[car.seg]!;
    const b = car.route[car.seg + 1]!;
    car.x = a.x + (b.x - a.x) * car.t;
    car.y = a.y + (b.y - a.y) * car.t;
  }

  /** Direction of travel on the current route segment (unit vector), or null when stopped. */
  private direction(car: ServiceCar): [number, number] | null {
    if (car.mode === 'parked' || car.mode === 'scene' || car.seg >= car.route.length - 1) return null;
    const a = car.route[car.seg]!, b = car.route[car.seg + 1]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return length > 1e-6 ? [(b.x - a.x) / length, (b.y - a.y) / length] : null;
  }

  /** Keeps a gap to a service car just ahead in the same lane instead of driving through it. */
  private blocked(car: ServiceCar): boolean {
    const dir = this.direction(car);
    if (!dir) return false;
    return this.cars.some((other) => {
      if (other === car) return false;
      const ox = other.x - car.x, oy = other.y - car.y;
      const distance = Math.hypot(ox, oy);
      if (distance > 0.42 || distance < 1e-6 || ox * dir[0] + oy * dir[1] <= distance * 0.7) return false;
      const theirs = this.direction(other);
      // only queue behind cars going the same way (or stopped in our lane at a scene)
      return theirs ? theirs[0] * dir[0] + theirs[1] * dir[1] > 0.5 : other.mode === 'scene';
    });
  }

  private arrive(car: ServiceCar, home: BuildingInstance, p: Province, leftSide: boolean): void {
    if (car.mode === 'call') {
      car.mode = 'scene';
      car.waitMs = SCENE_MS;
      return;
    }
    if (car.mode === 'patrol' && ++car.legs < PATROL_LEGS) {
      const beat = beatTiles(p, home, defOf(home).services?.patrolRadius ?? 5);
      const goal = beat[Math.floor(this.random() * beat.length)];
      const route = goal && this.routeTo(car, home, p, goal, leftSide);
      if (route && route.length > 1) {
        const legs = car.legs;
        this.start(car, 'patrol', route);
        car.legs = legs;
        return;
      }
    }
    if (car.mode === 'patrol') {
      const route = this.routeHome(car, home, p, leftSide);
      if (route) {
        this.start(car, 'return', route);
        return;
      }
    }
    this.park(car, home);
  }

  private place(car: ServiceCar, home: BuildingInstance, p: Province): void {
    let vx = 1, vy = 0;
    if (car.mode !== 'parked' && car.route.length > 1) {
      const i = Math.min(car.seg, car.route.length - 2);
      vx = car.route[i + 1]!.x - car.route[i]!.x;
      vy = car.route[i + 1]!.y - car.route[i]!.y;
    }
    const [dx, dy] = headingOf(vx, vy);
    const heading = `${dx},${dy}`;
    if (heading !== car.heading) {
      car.heading = heading;
      car.body.clear();
      drawServiceVehicle(car.body, car.kind, dx, dy);
      car.beaconSig = '';
    }
    const [fw, fh] = defOf(home).footprint;
    const onSite = car.mode === 'parked' ||
      (car.x >= home.x && car.x < home.x + fw && car.y >= home.y && car.y < home.y + fh);
    // Only the forecourt lies in front of the building; in the side corridors the building may
    // hide the car, which reads better than a car painted across the roof.
    const inFront = car.mode === 'parked' || car.y - home.y >= fh - 0.75;
    const ground = onSite
      ? Math.min(...footprintTiles(defOf(home), home.x, home.y).map(([x, y]) => tileAt(p, x, y)?.height ?? 0))
      : tileAt(p, Math.floor(car.x), Math.floor(car.y))?.height ?? 0;
    car.c.position.set(isoX(car.x, car.y), isoY(car.x, car.y) - ground * HEIGHT_PX);
    const [w, h] = defOf(home).footprint;
    // On the forecourt the car must draw over its own building, which shares the footprint.
    car.c.zIndex = onSite && inFront ? home.x + w + home.y + h - 1 + 0.02 : car.x + car.y + 0.04;
  }

  private paintBeacon(car: ServiceCar, dt: number, motion: boolean, night: number): void {
    const active = car.mode === 'call' || car.mode === 'scene' || car.mode === 'patrol' ||
      (car.mode === 'return' && car.kind === 'police');
    if (active && motion) {
      car.flash += dt;
      if (car.flash >= FLASH_MS) {
        car.flash = 0;
        car.flashPhase = car.flashPhase ? 0 : 1;
      }
    }
    const [dx, dy] = car.heading.split(',').map(Number) as [number, number];
    const sig = `${car.heading}|${active}|${car.flashPhase}|${Math.round(night * 4)}`;
    if (sig === car.beaconSig) return;
    car.beaconSig = sig;
    drawBeacon(car.beacon, car.kind, dx, dy, car.flashPhase, active, night);
  }
}
