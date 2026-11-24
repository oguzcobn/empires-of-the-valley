import * as THREE from 'three';
import type { GameState, MapPoint, Province, TransitLine, VesselKind } from '../core/types';
import { TICKS_PER_DAY } from '../core/time';
import { totalPopulation } from '../systems/economy';
import { wildlife } from '../systems/frontier';
import type { AnimalKind } from '../systems/frontier';
import { NEIGHBORS4, tileAt } from '../systems/grid';
import { findRoadPath } from '../rendering/armyPath';
import type { GridPoint } from '../rendering/armyPath';
import { VILLAGER_COLORS } from '../rendering/palette';
import { matchDayFor } from '../data/matchDays';
import type { MatchDay } from '../data/matchDays';
import { Builder, LEVEL_H } from './geo';
import { DIRS, drivableLinks, lanePoint, opposite, roadNode } from './roads3d';
import { standY } from './terrain3d';

const SPEED_FACTOR: Record<number, number> = { 0: 0, 1: 1, 2: 1.6, 4: 2.4 };
const CAR_PAINTS = [0xe4e7ec, 0xbe4741, 0x345a89, 0x364b54, 0xe4b755, 0x7d9a75, 0xd9632f, 0x8d5aa8];
type CarType = 'sedan' | 'van' | 'pickup';
const CAR_TYPES: readonly CarType[] = ['sedan', 'sedan', 'van', 'pickup'];

interface Shape {
  body: THREE.BufferGeometry;
  lit: THREE.BufferGeometry;
}

/** Low-poly vehicle facing +x, resting on y = 0. */
function carShape(type: CarType, paint: number): Shape {
  const b = new Builder();
  const lit = new Builder();
  const len = type === 'van' ? 0.3 : type === 'pickup' ? 0.29 : 0.25;
  const wid = 0.115;
  const glass = 0x2b4256;
  for (const x of [-len * 0.3, len * 0.3]) for (const z of [-wid / 2, wid / 2]) b.cyl(x, 0, z, 0.026, 0.026, 0.001, 0x15191d, 8).box(x, 0, z, 0.05, 0.05, 0.022, 0x15191d);
  b.box(0, 0.022, 0, len, 0.05, wid, paint);
  if (type === 'van') {
    b.box(-0.015, 0.072, 0, len * 0.86, 0.07, wid * 0.96, paint);
    b.box(len * 0.34, 0.078, 0, 0.03, 0.045, wid * 0.86, glass);
    b.box(0.02, 0.095, 0, len * 0.5, 0.03, wid * 0.98, glass);
  } else if (type === 'pickup') {
    b.box(len * 0.12, 0.072, 0, len * 0.34, 0.055, wid * 0.94, glass);
    b.box(len * 0.12, 0.127, 0, len * 0.32, 0.008, wid * 0.9, paint);
    b.box(-len * 0.3, 0.072, 0, len * 0.38, 0.022, wid * 0.96, paint);
    b.box(-len * 0.3, 0.072, 0, len * 0.34, 0.024, wid * 0.8, 0x2a2e33);
  } else {
    b.box(-0.01, 0.072, 0, len * 0.52, 0.048, wid * 0.9, glass);
    b.box(-0.01, 0.12, 0, len * 0.46, 0.008, wid * 0.86, paint);
  }
  for (const z of [-wid * 0.32, wid * 0.32]) {
    lit.box(len / 2 + 0.002, 0.04, z, 0.006, 0.018, 0.026, 0xfff4cf);
    lit.box(-len / 2 - 0.002, 0.045, z, 0.006, 0.016, 0.024, 0xd2332b);
  }
  return { body: b.build(), lit: lit.build() };
}

function personShape(shirt: number, trousers = 0x3a4250, hat?: number): THREE.BufferGeometry {
  const b = new Builder();
  b.box(-0.011, 0, 0, 0.016, 0.05, 0.02, trousers).box(0.011, 0, 0, 0.016, 0.05, 0.02, trousers);
  b.box(0, 0.05, 0, 0.046, 0.055, 0.03, shirt);
  b.sphere(0, 0.126, 0, 0.02, 0xf0c9a0, 1, 6);
  if (hat !== undefined) b.cyl(0, 0.138, 0, 0.022, 0.026, 0.012, hat, 6);
  return b.build();
}

function boatShape(kind: VesselKind): THREE.BufferGeometry {
  const b = new Builder();
  const len = kind === 'cargo' ? 0.66 : kind === 'yacht' ? 0.52 : 0.38;
  const wid = kind === 'cargo' ? 0.21 : 0.145;
  const hull = kind === 'yacht' ? 0xf4f4f0 : kind === 'cargo' ? 0x6b2232 : 0x8f5f3b;
  // V-shaped water wake foam trailing behind the vessel
  b.box(-len * 0.48, 0.004, -wid * 0.58, len * 0.42, 0.006, 0.025, 0xe8f7fb, 0.24);
  b.box(-len * 0.48, 0.004, wid * 0.58, len * 0.42, 0.006, 0.025, 0xe8f7fb, -0.24);
  b.box(-len * 0.38, 0.005, 0, len * 0.28, 0.005, wid * 0.55, 0xd8f1f8);
  // Hull & prow
  b.box(0, -0.02, 0, len * 0.72, 0.08, wid, hull);
  b.box(len * 0.4, -0.02, 0, wid * 0.72, 0.08, wid * 0.72, hull, Math.PI / 4);
  b.box(0, 0.06, 0, len * 0.7, 0.012, wid * 0.9, kind === 'yacht' ? 0xd9b98a : 0xb98a5a);
  if (kind === 'cargo') {
    b.box(-len * 0.24, 0.072, 0, 0.13, 0.12, wid * 0.72, 0xe8e2d2);
    b.box(-len * 0.19, 0.14, 0, 0.03, 0.035, wid * 0.65, 0x2b4256);
    b.cyl(-len * 0.27, 0.19, 0, 0.018, 0.022, 0.06, 0xc94a3a, 6);
    for (let i = 0; i < 3; i++) b.box(0.02 + i * 0.1, 0.072, 0, 0.085, 0.065, wid * 0.64, [0xc94a3a, 0x3f7fb5, 0xe3b23c][i]!);
  } else if (kind === 'yacht') {
    b.box(-0.03, 0.072, 0, 0.17, 0.055, wid * 0.64, 0xe8ecef);
    b.box(0.03, 0.095, 0, 0.06, 0.025, wid * 0.58, 0x2b4256);
    b.cyl(0.04, 0.072, 0, 0.006, 0.008, 0.46, 0x6a5a48, 5);
    b.gable(-0.12, -0.004, 0.04, 0.004, 0.14, 0.38, 0xfbfaf4, true);
  } else {
    b.cyl(0, 0.072, 0, 0.006, 0.008, 0.28, 0x6a5a48, 5);
    b.box(-0.06, 0.072, 0, 0.11, 0.045, wid * 0.55, 0x6a8a9a);
    b.gable(-0.08, -0.004, 0.02, 0.004, 0.11, 0.2, 0xf2ead8, true);
  }
  return b.build();
}

function animalShape(kind: AnimalKind): THREE.BufferGeometry {
  const b = new Builder();
  const hare = kind === 'hare';
  const deer = kind === 'deer';
  const body = hare ? 0xc7b297 : deer ? 0xb78251 : 0x8b6655;
  const l = hare ? 0.07 : 0.15;
  const h = hare ? 0.03 : deer ? 0.09 : 0.06;
  for (const x of [-l * 0.35, l * 0.35]) for (const z of [-0.018, 0.018]) b.box(x, 0, z, 0.012, h, 0.012, body);
  b.box(0, h, 0, l, hare ? 0.04 : 0.06, hare ? 0.04 : 0.055, body);
  b.box(l * 0.55, h + (deer ? 0.05 : 0.02), 0, 0.04, 0.04, 0.035, body);
  if (deer) for (const z of [-0.014, 0.014]) b.box(l * 0.55, h + 0.09, z, 0.008, 0.06, 0.008, 0xe8dcc4);
  if (hare) for (const z of [-0.008, 0.008]) b.box(l * 0.5, h + 0.06, z, 0.008, 0.035, 0.006, body);
  return b.build();
}

interface Roamer {
  mesh: THREE.Object3D;
  tx: number;
  ty: number;
  entry: number;
  exit: number;
  t: number;
  speed: number;
  phase: number;
  side: number;
}
interface Boat {
  mesh: THREE.Mesh;
  kind: VesselKind;
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
}
interface Bird {
  root: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  angle: number;
  speed: number;
  alt: number;
  phase: number;
}

const yawOf = (hx: number, hz: number): number => Math.atan2(-hz, hx);

function along(route: MapPoint[], progress: number): [MapPoint, MapPoint, number] {
  const pos = Math.min(route.length - 1, Math.max(0, progress));
  const i = Math.floor(pos);
  const a = route[i]!;
  return [a, route[i + 1] ?? a, pos - i];
}

export interface ActorView {
  game: GameState;
  huntMode: boolean;
  leftSideDriving: boolean;
}

/**
 * Everything that moves: traffic, pedestrians, the fleet, the militia, wildlife, hunters, flying
 * bird flocks, and the rail/air links. Visual only — the simulation never reads any of it.
 */
export class Actors3D {
  readonly group = new THREE.Group();
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true });
  private litMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  private glowMat = new THREE.MeshBasicMaterial({ color: 0xffdb9b });
  private transitMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private shapes = new Map<string, Shape>();
  private single = new Map<string, THREE.BufferGeometry>();
  private cars: Roamer[] = [];
  private walkers: Roamer[] = [];
  private cortegeFans: THREE.Group[] = [];
  private cortegeLeader: Roamer | null = null;
  private activeCortegeKey = '';
  private boats: Boat[] = [];
  private birds: Bird[] = [];
  private soldiers: THREE.Mesh[] = [];
  private militiaPos: GridPoint | null = null;
  private militiaRoute: GridPoint[] = [];
  private militiaStep = 0;
  private militiaT = 0;
  private militiaKey = '';
  private animals = new Map<string, THREE.Mesh>();
  private hunters: THREE.Mesh[] = [];
  private transitStatic = new THREE.Mesh(new THREE.BufferGeometry(), this.transitMat);
  private trains: THREE.Mesh[] = [];
  private plane: THREE.Mesh | null = null;
  private railRoute?: MapPoint[];
  private airRoute?: MapPoint[];
  private lastTick = -1;
  private lastTiles: unknown = null;
  private tickOffset = 0;
  private time = 0;
  private shadows = true;

  constructor() {
    this.transitStatic.receiveShadow = true;
    this.group.add(this.transitStatic);
  }

  get count(): number {
    return this.cars.length + this.walkers.length + this.boats.length + this.soldiers.length + this.birds.length;
  }

  setShadows(on: boolean): void {
    this.shadows = on;
  }

  private geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.single.get(key);
    if (!g) this.single.set(key, (g = make()));
    return g;
  }

  private spawn(geo: THREE.BufferGeometry, material: THREE.Material = this.mat): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = this.shadows;
    this.group.add(mesh);
    return mesh;
  }

  private drop(obj: THREE.Object3D): void {
    this.group.remove(obj);
  }

  // ---------------------------------------------------------------- birds / seagulls

  private updateBirds(p: Province, dtMs: number, motion: boolean): void {
    const desired = 7;
    if (this.birds.length < desired) {
      const bodyGeo = this.geo('bird-body', () => {
        const b = new Builder();
        b.box(0, 0, 0, 0.14, 0.035, 0.045, 0xf7f9fb);
        b.box(0.08, 0.01, 0, 0.035, 0.022, 0.025, 0xe8b931);
        b.box(-0.08, 0.005, 0, 0.05, 0.015, 0.065, 0x6b7b8c);
        return b.build();
      });
      const wingLGeo = this.geo('bird-wing-l', () => {
        const b = new Builder();
        b.box(0, 0, -0.09, 0.065, 0.012, 0.18, 0xeef3f7);
        b.box(-0.01, 0, -0.17, 0.045, 0.012, 0.05, 0x3b4856);
        return b.build();
      });
      const wingRGeo = this.geo('bird-wing-r', () => {
        const b = new Builder();
        b.box(0, 0, 0.09, 0.065, 0.012, 0.18, 0xeef3f7);
        b.box(-0.01, 0, 0.17, 0.045, 0.012, 0.05, 0x3b4856);
        return b.build();
      });
      while (this.birds.length < desired) {
        const i = this.birds.length;
        const root = new THREE.Group();
        const body = new THREE.Mesh(bodyGeo, this.mat);
        const wingL = new THREE.Mesh(wingLGeo, this.mat);
        const wingR = new THREE.Mesh(wingRGeo, this.mat);
        body.castShadow = this.shadows;
        wingL.castShadow = this.shadows;
        wingR.castShadow = this.shadows;
        root.add(body, wingL, wingR);
        this.group.add(root);
        this.birds.push({
          root,
          wingL,
          wingR,
          cx: p.width * (0.28 + ((i * 19) % 45) / 100),
          cz: p.height * (0.25 + ((i * 31) % 50) / 100),
          rx: 4.5 + (i % 4) * 1.6,
          rz: 3.6 + ((i + 2) % 4) * 1.4,
          angle: (i * Math.PI * 2) / desired,
          speed: 0.28 + (i % 3) * 0.06,
          alt: 2.3 + (i % 3) * 0.45,
          phase: i * 1.3,
        });
      }
    }
    const sec = motion ? dtMs / 1000 : 0;
    for (const b of this.birds) {
      b.angle += sec * b.speed;
      const x = b.cx + Math.cos(b.angle) * b.rx;
      const z = b.cz + Math.sin(b.angle) * b.rz;
      const vx = -Math.sin(b.angle) * b.rx;
      const vz = Math.cos(b.angle) * b.rz;
      const flap = motion ? Math.sin(this.time * 9.5 + b.phase) * 0.48 : 0.1;
      b.wingL.rotation.x = flap;
      b.wingR.rotation.x = -flap;
      b.root.position.set(x, b.alt + Math.sin(this.time * 2.2 + b.phase) * 0.12, z);
      b.root.rotation.y = yawOf(vx, vz);
      b.root.rotation.z = -0.14;
    }
  }

  // ---------------------------------------------------------------- traffic

  private newCar(index: number): THREE.Object3D {
    const type = CAR_TYPES[index % CAR_TYPES.length]!;
    const paint = CAR_PAINTS[(index * 3 + 1) % CAR_PAINTS.length]!;
    const key = `${type}|${paint}`;
    let shape = this.shapes.get(key);
    if (!shape) this.shapes.set(key, (shape = carShape(type, paint)));
    const holder = new THREE.Group();
    const body = new THREE.Mesh(shape.body, this.mat);
    body.castShadow = this.shadows;
    holder.add(body, new THREE.Mesh(shape.lit, this.litMat));
    this.group.add(holder);
    return holder;
  }

  /** Moves a roamer along its lane; returns false when it has left the network. */
  private advance(r: Roamer, step: number, links: (x: number, y: number) => number[]): boolean {
    r.t += step;
    let guard = 0;
    while (r.t >= 1 && guard++ < 4) {
      r.t -= 1;
      if (r.exit < 0) {
        // dead end: turn round and leave by the only way out
        const out = links(r.tx, r.ty);
        if (!out.length) return false;
        r.entry = -1;
        r.exit = out[Math.floor(Math.random() * out.length)]!;
        continue;
      }
      const [dx, dy] = DIRS[r.exit]!;
      r.tx += dx;
      r.ty += dy;
      r.entry = opposite(r.exit);
      const out = links(r.tx, r.ty).filter((s) => s !== r.entry);
      r.exit = out.length ? out[Math.floor(Math.random() * out.length)]! : -1;
    }
    return links(r.tx, r.ty).length > 0 || r.exit < 0;
  }

  private updateCars(view: ActorView, p: Province, seconds: number, drivable: [number, number][]): void {
    const links = (x: number, y: number): number[] => drivableLinks(p, x, y);
    const desired = Math.min(22, Math.floor(drivable.length / 3));
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i]!;
      if (i >= desired || !roadNode(p, car.tx, car.ty) || !links(car.tx, car.ty).length) {
        this.drop(car.mesh);
        this.cars.splice(i, 1);
      }
    }
    let attempts = 0;
    while (this.cars.length < desired && attempts++ < 12) {
      const [x, y] = drivable[Math.floor(Math.random() * drivable.length)]!;
      const out = links(x, y);
      if (!out.length || this.cars.some((c) => c.tx === x && c.ty === y)) continue;
      this.cars.push({
        mesh: this.newCar(this.cars.length + Math.floor(Math.random() * 97)),
        tx: x, ty: y, entry: -1, exit: out[Math.floor(Math.random() * out.length)]!,
        t: Math.random(), speed: 0.75 + Math.random() * 0.45, phase: 0, side: 1,
      });
    }
    const lane = view.leftSideDriving ? -0.11 : 0.11;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i]!;
      // keep a gap to the vehicle ahead in the same lane
      const blocked = this.cars.some((o) => o !== car && o.tx === car.tx && o.ty === car.ty && o.exit === car.exit && o.t > car.t && o.t - car.t < 0.42);
      if (!this.advance(car, blocked ? 0 : seconds * car.speed, links)) {
        this.drop(car.mesh);
        this.cars.splice(i, 1);
        continue;
      }
      const node = roadNode(p, car.tx, car.ty);
      if (!node) continue;
      const at = lanePoint(car.tx, car.ty, node, car.entry, car.exit, car.t, lane);
      car.mesh.position.set(at.x, at.y + 0.03, at.z);
      car.mesh.rotation.y = yawOf(at.hx, at.hz);
    }
  }

  private buildSupporter3D(match: MatchDay, idx: number): THREE.Group {
    const g = new THREE.Group();
    const b = new Builder();
    // Trousers, team jersey with stripe, scarf, head, raised arms, flagpole + team flag
    b.box(-0.012, 0, 0, 0.017, 0.05, 0.022, 0x252d38).box(0.012, 0, 0, 0.017, 0.05, 0.022, 0x252d38);
    b.box(0, 0.05, 0, 0.05, 0.058, 0.032, match.jersey);
    b.box(0, 0.052, 0.002, 0.018, 0.056, 0.034, match.stripe);
    b.box(0, 0.104, 0, 0.054, 0.014, 0.036, match.scarf);
    b.sphere(0, 0.13, 0, 0.021, 0xf0c9a0, 1, 6);
    if (idx % 2 === 0) b.cyl(0, 0.142, 0, 0.022, 0.024, 0.014, match.jersey, 6);
    // Left arm & flagpole + waving team flag
    b.box(-0.032, 0.095, 0, 0.014, 0.045, 0.014, match.jersey);
    b.cyl(-0.036, 0.09, 0, 0.004, 0.004, 0.22, 0xd6c7b2, 5);
    b.box(-0.036, 0.25, -0.045, 0.008, 0.075, 0.09, match.jersey);
    b.box(-0.036, 0.25, -0.045, 0.01, 0.026, 0.092, match.stripe);
    // Right arm & flare handle
    b.box(0.032, 0.098, 0, 0.014, 0.048, 0.014, match.jersey);
    b.cyl(0.036, 0.135, 0, 0.006, 0.006, 0.035, 0xc0392b, 5);
    const bodyMesh = new THREE.Mesh(b.build(), this.mat);
    bodyMesh.castShadow = this.shadows;
    // Glowing flare core + 3 rising smoke puffs
    const litB = new Builder();
    litB.sphere(0.036, 0.18, 0, 0.024, 0xff4d29, 1, 6);
    litB.sphere(0.036, 0.18, 0, 0.014, 0xfff7c2, 1, 5);
    const flareMesh = new THREE.Mesh(litB.build(), this.litMat);
    flareMesh.name = 'flare';
    const smokeGroup = new THREE.Group();
    smokeGroup.name = 'smoke';
    for (let s = 0; s < 3; s++) {
      const sb = new Builder();
      const col = s === 0 ? match.jersey : s === 1 ? match.stripe : 0xe2e8f0;
      sb.sphere(0, 0, 0, 0.032 + s * 0.014, col, 0.85, 6);
      const sm = new THREE.Mesh(sb.build(), this.litMat);
      sm.name = `puff:${s}`;
      smokeGroup.add(sm);
    }
    g.add(bodyMesh, flareMesh, smokeGroup);
    this.group.add(g);
    return g;
  }

  private updateMatchCortege(view: ActorView, p: Province, seconds: number, roads: [number, number][]): void {
    const match = matchDayFor(view.game);
    const key = match ? `${match.team}:${match.day}` : '';
    const links = (x: number, y: number): number[] => {
      const node = roadNode(p, x, y);
      return node ? [0, 1, 2, 3].filter((s) => node.links[s]) : [];
    };
    if (this.activeCortegeKey !== key) {
      for (const fan of this.cortegeFans) this.drop(fan);
      this.cortegeFans = [];
      this.cortegeLeader = null;
      this.activeCortegeKey = key;
      if (match && roads.length > 0) {
        const start = roads[Math.floor(Math.random() * roads.length)]!;
        const out = links(start[0], start[1]);
        if (out.length) {
          this.cortegeLeader = {
            mesh: new THREE.Object3D(),
            tx: start[0],
            ty: start[1],
            entry: -1,
            exit: out[0]!,
            t: 0,
            speed: 0.42,
            phase: 0,
            side: 1,
          };
          for (let i = 0; i < 10; i++) {
            this.cortegeFans.push(this.buildSupporter3D(match, i));
          }
        }
      }
    }
    if (!this.cortegeLeader || !this.cortegeFans.length || !roads.length) return;
    if (!roadNode(p, this.cortegeLeader.tx, this.cortegeLeader.ty) || !this.advance(this.cortegeLeader, seconds * this.cortegeLeader.speed, links)) {
      const start = roads[Math.floor(Math.random() * roads.length)]!;
      const out = links(start[0], start[1]);
      if (!out.length) return;
      this.cortegeLeader.tx = start[0];
      this.cortegeLeader.ty = start[1];
      this.cortegeLeader.entry = -1;
      this.cortegeLeader.exit = out[0]!;
      this.cortegeLeader.t = 0;
    }
    const node = roadNode(p, this.cortegeLeader.tx, this.cortegeLeader.ty);
    if (!node) return;
    const at = lanePoint(this.cortegeLeader.tx, this.cortegeLeader.ty, node, this.cortegeLeader.entry, this.cortegeLeader.exit, this.cortegeLeader.t, 0);
    const len = Math.hypot(at.hx, at.hz) || 1;
    const fx = at.hx / len;
    const fz = at.hz / len;
    const rx = -fz;
    const rz = fx;
    this.cortegeFans.forEach((fan, idx) => {
      const row = Math.floor(idx / 2);
      const col = idx % 2 === 0 ? -1 : 1;
      const px = at.x - fx * row * 0.14 + rx * col * 0.09;
      const pz = at.z - fz * row * 0.14 + rz * col * 0.09;
      const bob = Math.abs(Math.sin(this.time * 10 + idx * 0.7)) * 0.015;
      fan.position.set(px, at.y + 0.016 + bob, pz);
      fan.rotation.y = yawOf(fx, fz);
      const smoke = fan.getObjectByName('smoke');
      if (smoke) {
        for (let s = 0; s < 3; s++) {
          const puff = smoke.getObjectByName(`puff:${s}`);
          if (puff) {
            const age = (this.time * 0.9 + idx * 0.3 + s * 0.33) % 1;
            puff.position.set(0.036 + Math.sin(this.time * 3 + idx + s) * 0.03, 0.2 + age * 0.38, -age * 0.12);
            puff.scale.setScalar(0.7 + age * 1.4);
          }
        }
      }
    });
  }

  private updateWalkers(p: Province, seconds: number, roads: [number, number][]): void {
    const links = (x: number, y: number): number[] => {
      const node = roadNode(p, x, y);
      return node ? [0, 1, 2, 3].filter((s) => node.links[s]) : [];
    };
    const desired = roads.length < 2 ? 0 : Math.min(26, Math.max(2, Math.ceil(totalPopulation(p) / 3)), roads.length);
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i]!;
      if (i >= desired || !roadNode(p, w.tx, w.ty)) {
        this.drop(w.mesh);
        this.walkers.splice(i, 1);
      }
    }
    let attempts = 0;
    while (this.walkers.length < desired && attempts++ < 10) {
      const [x, y] = roads[Math.floor(Math.random() * roads.length)]!;
      const out = links(x, y);
      if (!out.length) continue;
      const n = this.walkers.length;
      const shirt = VILLAGER_COLORS[n % VILLAGER_COLORS.length]!;
      const mesh = this.spawn(this.geo(`person|${shirt}`, () => personShape(shirt, n % 2 ? 0x4a4038 : 0x3a4250)));
      mesh.userData.person = { ref: {kind: 'citizen', index: n}, activity: 'Yürüyor' };
      this.walkers.push({
        mesh, tx: x, ty: y, entry: -1, exit: out[Math.floor(Math.random() * out.length)]!,
        t: Math.random(), speed: 0.3 + Math.random() * 0.14, phase: Math.random() * 6, side: n % 2 ? 1 : -1,
      });
    }
    for (let i = this.walkers.length - 1; i >= 0; i--) {
      const w = this.walkers[i]!;
      if (!this.advance(w, seconds * w.speed, links)) {
        this.drop(w.mesh);
        this.walkers.splice(i, 1);
        continue;
      }
      const node = roadNode(p, w.tx, w.ty);
      if (!node) continue;
      const kerb = node.kind === 'paved' ? 0.37 : node.kind === 'bridge' ? 0.12 : 0.1;
      const at = lanePoint(w.tx, w.ty, node, w.entry, w.exit, w.t, kerb * w.side);
      w.mesh.position.set(at.x, at.y + 0.014 + Math.abs(Math.sin(this.time * 9 + w.phase)) * 0.008, at.z);
      w.mesh.rotation.y = yawOf(at.hx, at.hz);
      w.mesh.rotation.z = Math.sin(this.time * 9 + w.phase) * 0.06;
    }
  }

  // ---------------------------------------------------------------- water

  private updateBoats(view: ActorView, p: Province, seconds: number): void {
    const want: VesselKind[] = [];
    for (const kind of ['fishing', 'cargo', 'yacht'] as const)
      for (let i = 0; i < Math.min(3, view.game.shipyard.fleet[kind]); i++) want.push(kind);
    const isWater = (x: number, y: number): boolean => {
      const t = tileAt(p, x, y);
      return !!t && (t.terrain === 'lake' || t.terrain === 'water') && !t.road;
    };
    if (want.join() !== this.boats.map((b) => b.kind).join()) {
      for (const b of this.boats) this.drop(b.mesh);
      this.boats = [];
      const water: [number, number][] = [];
      for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (isWater(x, y)) water.push([x, y]);
      const lake = water.filter(([x, y]) => tileAt(p, x, y)?.terrain === 'lake');
      const pool = lake.length ? lake : water;
      want.forEach((kind, i) => {
        const at = pool[(i * 7) % Math.max(1, pool.length)];
        if (!at) return;
        this.boats.push({ mesh: this.spawn(this.geo(`boat|${kind}`, () => boatShape(kind))), kind, x: at[0], y: at[1], tx: at[0], ty: at[1], t: 1 });
      });
    }
    for (const b of this.boats) {
      b.t += seconds * 0.35;
      if (b.t >= 1) {
        b.x = b.tx;
        b.y = b.ty;
        const options = NEIGHBORS4.map(([dx, dy]) => [b.x + dx, b.y + dy] as [number, number]).filter(([x, y]) => isWater(x, y));
        const next = options.length ? options[Math.floor(Math.random() * options.length)]! : ([b.x, b.y] as [number, number]);
        b.tx = next[0];
        b.ty = next[1];
        b.t = 0;
      }
      const fx = b.x + (b.tx - b.x) * b.t + 0.5;
      const fy = b.y + (b.ty - b.y) * b.t + 0.5;
      const level = (tileAt(p, b.x, b.y)?.height ?? 0) * LEVEL_H - 0.07;
      b.mesh.position.set(fx, level + Math.sin(this.time * 2 + b.x) * 0.008, fy);
      if (b.tx !== b.x || b.ty !== b.y) {
        const target = yawOf(b.tx - b.x, b.ty - b.y);
        let diff = target - b.mesh.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        b.mesh.rotation.y += diff * Math.min(1, seconds * 3 + 0.02);
      }
    }
  }

  // ---------------------------------------------------------------- militia

  private updateMilitia(view: ActorView, p: Province, dtMs: number, roads: [number, number][], motion: boolean): void {
    const count = Math.min(8, Math.ceil((view.game.militia ?? 0) / 5));
    while (this.soldiers.length > count) this.drop(this.soldiers.pop()!);
    while (this.soldiers.length < count) {
      const i = this.soldiers.length;
      this.soldiers.push(this.spawn(this.geo(`soldier|${i % 2}`, () => personShape(i % 2 ? 0x416080 : 0x385675, 0x2f3a4a, 0x333a48))));
    }
    if (!count || !roads.length) return;
    const goal = view.game.armyTarget;
    if (this.militiaPos === null) {
      this.militiaPos = goal ? [goal.x, goal.y] : roads[0]!;
      this.militiaKey = goal ? `${goal.x},${goal.y}` : '';
    }
    const key = goal ? `${goal.x},${goal.y}` : '';
    if (key !== this.militiaKey) {
      this.militiaKey = key;
      this.militiaRoute = goal ? (findRoadPath(p, this.militiaPos, [goal.x, goal.y]) ?? []) : [];
      this.militiaStep = 0;
      this.militiaT = 0;
    }
    let pos: GridPoint = this.militiaPos;
    let heading: [number, number] = [1, 0];
    if (this.militiaRoute.length > 1 && this.militiaStep < this.militiaRoute.length - 1) {
      if (view.game.speed !== 0 && motion) this.militiaT += dtMs / 650;
      while (this.militiaT >= 1 && this.militiaStep < this.militiaRoute.length - 1) {
        this.militiaT -= 1;
        this.militiaStep++;
      }
      const curr = this.militiaRoute[this.militiaStep]!;
      const next = this.militiaRoute[Math.min(this.militiaStep + 1, this.militiaRoute.length - 1)]!;
      this.militiaPos = curr;
      pos = [curr[0] + (next[0] - curr[0]) * this.militiaT, curr[1] + (next[1] - curr[1]) * this.militiaT];
      if (next[0] !== curr[0] || next[1] !== curr[1]) heading = [next[0] - curr[0], next[1] - curr[1]];
      if (this.militiaStep >= this.militiaRoute.length - 1) {
        pos = next;
        this.militiaPos = next;
        this.militiaRoute = [];
      }
    }
    const y = standY(tileAt(p, Math.round(pos[0]), Math.round(pos[1])));
    this.soldiers.forEach((mesh, i) => {
      mesh.userData.person ??= { ref: {kind: 'soldier', index: i}, activity: 'Devriyede' };
      const col = (i % 4) - 1.5;
      const row = Math.floor(i / 4) - 0.5;
      mesh.position.set(pos[0] + 0.5 + col * 0.09 * -heading[1] + row * 0.1 * heading[0], y + 0.014, pos[1] + 0.5 + col * 0.09 * heading[0] + row * 0.1 * heading[1]);
      mesh.rotation.y = yawOf(heading[0], heading[1]);
    });
  }

  // ---------------------------------------------------------------- frontier

  private updateWildlife(view: ActorView, p: Province): void {
    const s = view.game;
    if (this.lastTick !== s.tick || this.lastTiles !== p.tiles) {
      const seen = new Set<string>();
      for (const spot of wildlife(p, s.seed, s.tick)) {
        const key = `${spot.x},${spot.y}`;
        seen.add(key);
        if (this.animals.has(key)) continue;
        const mesh = this.spawn(this.geo(`animal|${spot.kind}`, () => animalShape(spot.kind)));
        mesh.position.set(spot.x + 0.5, standY(tileAt(p, spot.x, spot.y)), spot.y + 0.5);
        mesh.rotation.y = ((spot.x * 7 + spot.y * 13) % 6) * 1.05;
        this.animals.set(key, mesh);
      }
      for (const [key, mesh] of this.animals)
        if (!seen.has(key)) {
          this.drop(mesh);
          this.animals.delete(key);
        }
    }
    for (const mesh of this.animals.values()) {
      const scale = view.huntMode ? 2.6 + Math.sin(this.time * 4 + mesh.position.x) * 0.2 : 1.5;
      mesh.scale.setScalar(scale);
      mesh.material = view.huntMode ? this.glowMat : this.mat;
    }
    const hunt = p.hunt;
    while (this.hunters.length > (hunt?.workers ?? 0)) this.drop(this.hunters.pop()!);
    if (!hunt) return;
    while (this.hunters.length < hunt.workers) this.hunters.push(this.spawn(this.geo('hunter', () => personShape(0x886349, 0x4a4038, 0x5a4a32))));
    const runtime = Math.min(1, (s.tick + this.tickOffset - hunt.startTick) / Math.max(1, hunt.endTick - hunt.startTick));
    const progress = Math.min(1, Math.max(0, (runtime > 0.5 ? 1 - runtime : runtime) * 2.45));
    this.hunters.forEach((mesh, i) => {
      const [a, b, t] = along(hunt.route, progress * (hunt.route.length - 1) - i * 0.19);
      const ya = standY(tileAt(p, a.x, a.y));
      const yb = standY(tileAt(p, b.x, b.y));
      mesh.position.set(a.x + (b.x - a.x) * t + 0.5 + i * 0.05, ya + (yb - ya) * t + 0.014, a.y + (b.y - a.y) * t + 0.5);
      if (a !== b) mesh.rotation.y = yawOf((b.x - a.x) * (runtime > 0.5 ? -1 : 1), (b.y - a.y) * (runtime > 0.5 ? -1 : 1));
    });
  }

  private buildTransit(p: Province): void {
    const b = new Builder();
    for (const kind of ['rail', 'air'] as const) {
      const route = p.transit?.[kind]?.route;
      if (!route?.length) continue;
      const pts = route.map((m) => [m.x + 0.5, standY(tileAt(p, m.x, m.y)), m.y + 0.5] as [number, number, number]);
      if (kind === 'rail') {
        b.ribbon(pts, 0.34, 0x685744, 0.014);
        for (const side of [-0.07, 0.07]) {
          const rail = pts.map(([x, y, z], i) => {
            const n = pts[Math.min(pts.length - 1, i + 1)]!;
            const q = pts[Math.max(0, i - 1)]!;
            const dx = n[0] - q[0], dz = n[2] - q[2];
            const len = Math.hypot(dx, dz) || 1;
            return [x + (dz / len) * side, y, z - (dx / len) * side] as [number, number, number];
          });
          b.ribbon(rail, 0.022, 0xb0b8b8, 0.03);
        }
      } else {
        const first = pts[0]!, last = pts.at(-1)!;
        const dx = Math.sign(last[0] - first[0]), dz = Math.sign(last[2] - first[2]);
        const a: [number, number, number] = [first[0] - dx * 0.5, first[1], first[2] - dz * 0.5];
        const e: [number, number, number] = [last[0] + dx * 0.5, last[1], last[2] + dz * 0.5];
        b.ribbon([a, e], 0.86, 0xc2b89e, 0.012);
        b.ribbon([a, e], 0.7, 0x404953, 0.02);
        for (let i = 0; i < route.length * 2; i++) {
          const f0 = (i + 0.25) / (route.length * 2), f1 = (i + 0.7) / (route.length * 2);
          b.ribbon(
            [[a[0] + (e[0] - a[0]) * f0, a[1], a[2] + (e[2] - a[2]) * f0], [a[0] + (e[0] - a[0]) * f1, a[1], a[2] + (e[2] - a[2]) * f1]],
            0.03, 0xeee8c8, 0.027,
          );
        }
      }
      // station / terminal beside the first tile of the line
      const site = route[0]!;
      const next = route[1] ?? site;
      const ax = next.x - site.x, az = next.y - site.y;
      const sx = site.x + 0.5 - az * 0.62, sz = site.y + 0.5 + ax * 0.62, sy = standY(tileAt(p, site.x, site.y));
      b.at(sx, sy, sz);
      b.box(0, 0, 0, 0.6, 0.03, 0.4, 0xa29578);
      b.box(0, 0.03, 0, 0.5, 0.2, 0.3, kind === 'rail' ? 0xd9c9a8 : 0xdfe6ea);
      b.gable(-0.28, -0.18, 0.28, 0.18, 0.23, 0.1, kind === 'rail' ? 0x9c4e43 : 0xb8c7c9, true);
      if (kind === 'air') {
        b.cyl(0.36, 0, 0.1, 0.05, 0.06, 0.55, 0xb5a993, 8);
        b.cyl(0.36, 0.55, 0.1, 0.1, 0.08, 0.1, 0x6f95ac, 8);
      }
      b.at(0, 0, 0);
    }
    this.transitStatic.geometry.dispose();
    this.transitStatic.geometry = b.build();
  }

  private trainShape(engine: boolean): THREE.BufferGeometry {
    const b = new Builder();
    b.box(0, 0.03, 0, 0.44, 0.03, 0.16, 0x2a2e33);
    if (engine) {
      b.box(0.03, 0.06, 0, 0.3, 0.12, 0.15, 0x8f2f2a).box(-0.15, 0.06, 0, 0.12, 0.17, 0.16, 0x7a2824);
      b.cyl(0.13, 0.18, 0, 0.025, 0.03, 0.07, 0x2a2e33, 7);
    } else {
      b.box(0, 0.06, 0, 0.42, 0.13, 0.15, 0x4f6f5a).box(0, 0.19, 0, 0.44, 0.015, 0.17, 0x3a4a40);
      for (const x of [-0.13, 0, 0.13]) for (const z of [-0.078, 0.078]) b.box(x, 0.11, z, 0.07, 0.05, 0.006, 0xeed297);
    }
    return b.build();
  }

  private planeShape(): THREE.BufferGeometry {
    const b = new Builder();
    b.box(0, 0.05, 0, 0.6, 0.085, 0.085, 0xf2f4f6);
    b.sphere(0.3, 0.092, 0, 0.043, 0xf2f4f6, 1, 7);
    b.box(-0.02, 0.075, 0, 0.14, 0.012, 0.74, 0xdfe4e8);
    b.box(-0.27, 0.09, 0, 0.08, 0.012, 0.26, 0xdfe4e8);
    b.box(-0.28, 0.1, 0, 0.09, 0.13, 0.012, 0x2f5fa7);
    for (const z of [-0.2, 0.2]) b.box(0.01, 0.045, z, 0.1, 0.035, 0.04, 0x8d98a2);
    b.box(0.05, 0.1, 0, 0.42, 0.016, 0.088, 0x4b6a84);
    return b.build();
  }

  private updateTransit(view: ActorView, p: Province): void {
    const s = view.game;
    if (this.railRoute !== p.transit?.rail?.route || this.airRoute !== p.transit?.air?.route) {
      this.railRoute = p.transit?.rail?.route;
      this.airRoute = p.transit?.air?.route;
      this.buildTransit(p);
    }
    const phase = ((s.tick + this.tickOffset) % TICKS_PER_DAY) / TICKS_PER_DAY;
    const direction = phase <= 0.5 ? 1 : -1;
    const trip = (phase <= 0.5 ? phase : 1 - phase) * 2;
    const rail = p.transit?.rail;
    if (!rail) while (this.trains.length) this.drop(this.trains.pop()!);
    else {
      while (this.trains.length < 4) this.trains.push(this.spawn(this.geo(`train|${this.trains.length === 0}`, () => this.trainShape(this.trains.length === 0))));
      this.trains.forEach((mesh, i) => {
        const position = trip * (rail.route.length - 1) - direction * i * 0.5;
        const [a, b, t] = along(rail.route, position);
        mesh.visible = position >= 0 && position < rail.route.length - 1;
        mesh.position.set(a.x + (b.x - a.x) * t + 0.5, standY(tileAt(p, a.x, a.y)) + 0.02, a.y + (b.y - a.y) * t + 0.5);
        if (a !== b) mesh.rotation.y = yawOf((b.x - a.x) * direction, (b.y - a.y) * direction);
      });
    }
    const air: TransitLine | undefined = p.transit?.air;
    if (!air) {
      if (this.plane) this.drop(this.plane);
      this.plane = null;
    } else {
      this.plane ??= this.spawn(this.geo('plane', () => this.planeShape()));
      const a = air.route[0]!;
      const last = air.route.at(-1)!;
      const dx = Math.sign(last.x - a.x), dy = Math.sign(last.y - a.y);
      // roll along the runway, rotate, then climb out beyond the map edge
      const run = air.route.length - 1;
      const dist = trip * (run + 9);
      const climb = Math.max(0, dist - run * 0.8);
      this.plane.position.set(a.x + 0.5 + dx * dist, standY(tileAt(p, a.x, a.y)) + 0.03 + climb * climb * 0.06, a.y + 0.5 + dy * dist);
      this.plane.rotation.y = yawOf(dx * direction, dy * direction);
      this.plane.rotation.z = (direction > 0 ? 1 : -1) * Math.min(0.22, climb * 0.08);
      this.plane.visible = trip < 0.98;
    }
  }

  update(view: ActorView, p: Province, dtMs: number, motion: boolean): void {
    const factor = SPEED_FACTOR[view.game.speed] ?? 0;
    const seconds = motion ? (dtMs / 1000) * factor : 0;
    this.time += motion ? dtMs / 1000 : 0;
    if (this.lastTick !== view.game.tick) this.tickOffset = 0;
    this.tickOffset = Math.min(0.95, this.tickOffset + (motion ? (dtMs / 1000) * Math.min(1.35, factor) * 1.75 : 0));
    const roads: [number, number][] = [];
    const drivable: [number, number][] = [];
    for (let y = 0; y < p.height; y++)
      for (let x = 0; x < p.width; x++) {
        const t = p.tiles[y * p.width + x]!;
        if (!t.road) continue;
        roads.push([x, y]);
        if (drivableLinks(p, x, y).length) drivable.push([x, y]);
      }
    this.updateCars(view, p, seconds, drivable);
    this.updateWalkers(p, seconds, roads);
    this.updateMatchCortege(view, p, seconds, roads);
    this.updateBoats(view, p, seconds);
    this.updateMilitia(view, p, dtMs, roads, motion);
    this.updateWildlife(view, p);
    this.updateTransit(view, p);
    this.updateBirds(p, dtMs, motion);
    this.lastTick = view.game.tick;
    this.lastTiles = p.tiles;
  }

  dispose(): void {
    for (const s of this.shapes.values()) {
      s.body.dispose();
      s.lit.dispose();
    }
    for (const g of this.single.values()) g.dispose();
    this.transitStatic.geometry.dispose();
    for (const m of [this.mat, this.litMat, this.glowMat, this.transitMat]) m.dispose();
  }
}