import * as THREE from 'three';
import type { BuildingId, BuildingInstance, Province, Tile } from '../core/types';
import type { Season } from '../core/time';
import { defOf } from '../data/buildings';
import { isOperating } from '../systems/economy';
import { canLink, NEIGHBORS4, perimeterTiles, tileAt, tilesInRange } from '../systems/grid';
import { standY } from './terrain3d';

export type WorkerJob = 'farming' | 'logging' | 'quarrying';

interface WorkPoint {
  x: number;
  y: number;
  height: number;
}

interface WorkRoute {
  points: WorkPoint[];
  length: number;
  forestTile?: number;
  steps?: number[];
}

interface WorkerActor {
  root: THREE.Group;
  route: WorkRoute;
  job: WorkerJob;
  variant: number;
  time: number;
  priority: number;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  tool: THREE.Object3D;
  cargo: THREE.Object3D;
}

const MAX_VISIBLE_WORKERS = 32;
const WALK_SPEED = 1.35;
const WORK_TIME = 3.3;
const JOBS: Partial<Record<BuildingId, WorkerJob>> = {
  farm: 'farming',
  terrace_farm: 'farming',
  lumber_camp: 'logging',
  quarry: 'quarrying',
};

function workerJob(id: BuildingId): WorkerJob | undefined {
  return JOBS[id];
}

function walkable(tile: Tile | undefined): tile is Tile {
  return !!tile && !tile.buildingId && (
    tile.road || (tile.terrain !== 'water' && tile.terrain !== 'lake' && tile.terrain !== 'mountain')
  );
}

function walkableStep(from: Tile, to: Tile): boolean {
  if (from.road && to.road) return canLink(from, to);
  return Math.abs(from.height - to.height) <= 1 && to.terrain !== 'water' && to.terrain !== 'lake';
}

function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

function logRoutes(p: Province, b: BuildingInstance): WorkRoute[] {
  const def = defOf(b);
  const [w, h] = def.footprint;
  const dist = def.harvests!.radius + 2;
  const parents = new Map<number, number>();
  const queue: number[] = [];
  for (const [x, y] of perimeterTiles(def, b.x, b.y)) {
    const tile = tileAt(p, x, y);
    const edge = tileAt(p, Math.max(b.x, Math.min(x, b.x + w - 1)), Math.max(b.y, Math.min(y, b.y + h - 1)));
    if (!walkable(tile) || !edge || !walkableStep(edge, tile)) continue;
    const i = y * p.width + x;
    parents.set(i, -1);
    queue.push(i);
  }
  const forest = new Set(tilesInRange(p, def, b.x, b.y).filter((i) => p.tiles[i]!.deposit > 0 && walkable(p.tiles[i])));
  const routes: WorkRoute[] = [];
  for (let n = 0; n < queue.length; n++) {
    const i = queue[n]!;
    const x = i % p.width;
    const y = Math.floor(i / p.width);
    if (forest.has(i)) {
      const steps = [i];
      for (let prev = parents.get(i)!; prev >= 0; prev = parents.get(prev)!) steps.unshift(prev);
      const points = steps.map((index) => ({
        x: index % p.width + 0.5,
        y: Math.floor(index / p.width) + 0.5,
        height: standY(p.tiles[index]),
      }));
      const first = points[0]!;
      const base = standY(tileAt(p, b.x, b.y));
      points.unshift({
        x: Math.max(b.x + 0.18, Math.min(first.x, b.x + w - 0.18)),
        y: Math.max(b.y + 0.18, Math.min(first.y, b.y + h - 0.18)),
        height: base,
      });
      const last = points.at(-1)!;
      last.x += 0.19;
      last.y += 0.23;
      const length = points.slice(1).reduce((sum, point, j) => sum + Math.hypot(point.x - points[j]!.x, point.y - points[j]!.y), 0);
      routes.push({ points, length, forestTile: i, steps });
      if (routes.length >= b.workers) break;
    }
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < b.x - dist || nx >= b.x + w + dist || ny < b.y - dist || ny >= b.y + h + dist) continue;
      const next = tileAt(p, nx, ny);
      const nextIndex = ny * p.width + nx;
      if (walkable(next) && !parents.has(nextIndex) && walkableStep(p.tiles[i]!, next)) {
        parents.set(nextIndex, i);
        queue.push(nextIndex);
      }
    }
  }
  return routes;
}

function routeStillOpen(p: Province, route: WorkRoute): boolean {
  if (route.forestTile === undefined) return true;
  if (!(p.tiles[route.forestTile]?.deposit > 0)) return false;
  return route.steps!.every((i, index, steps) => {
    const tile = p.tiles[i];
    return walkable(tile) && (index === 0 || walkableStep(p.tiles[steps[index - 1]!]!, tile));
  });
}

function siteRoute(p: Province, b: BuildingInstance, job: WorkerJob, worker: number): WorkRoute {
  const base = Math.min(
    tileAt(p, b.x, b.y)?.height ?? 0,
    tileAt(p, b.x + 1, b.y)?.height ?? 0,
    tileAt(p, b.x, b.y + 1)?.height ?? 0,
    tileAt(p, b.x + 1, b.y + 1)?.height ?? 0,
  );
  const baseY = standY({ ...(tileAt(p, b.x, b.y) ?? p.tiles[0]!), height: base });
  if (job === 'quarrying') {
    const [x, y] = ([[1.14, 0.98], [1.52, 1.65], [1.64, 0.82]] as const)[worker % 3]!;
    return { length: 0, points: [{ x: b.x + x, y: b.y + y, height: baseY }] };
  }
  const terrace = b.definitionId === 'terrace_farm';
  const [x, y] = ([[0.24, 0.58], [0.91, 1.08], [0.3, 1.57], [1.1, 1.68]] as const)[worker % 4]!;
  const row = terrace ? [0.48, 1.1, 1.72][worker % 3]! : y;
  const height = baseY + (terrace ? [0.16, 0.1, 0.05][worker % 3]! : 0);
  const point = { x: b.x + x, y: b.y + row, height };
  return { length: 0.46, points: [point, { ...point, x: point.x + 0.46 }] };
}

export class WorkerActors3D {
  readonly group = new THREE.Group();
  private actors = new Map<string, WorkerActor>();
  private paints = new Map<number, THREE.MeshStandardMaterial>();
  private box = new THREE.BoxGeometry(1, 1, 1);
  private shadows = true;
  private province?: Province;
  private season?: Season;
  private selection: string | null = null;

  get count(): number {
    return this.actors.size;
  }

  setShadows(on: boolean): void {
    this.shadows = on;
  }

  private material(color: number): THREE.MeshStandardMaterial {
    let mat = this.paints.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color });
      this.paints.set(color, mat);
    }
    return mat;
  }

  private part(
    g: THREE.Object3D,
    color: number,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    name?: string,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.box, this.material(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = this.shadows;
    if (name) mesh.name = name;
    g.add(mesh);
    return mesh;
  }

  private buildTool(job: WorkerJob): THREE.Group {
    const tool = new THREE.Group();
    tool.name = 'tool';
    if (job === 'logging') {
      this.part(tool, 0xc7b293, 0, 0.055, 0, 0.012, 0.16, 0.012);
      this.part(tool, 0x8b8f94, 0.012, 0.105, 0, 0.035, 0.06, 0.014);
    } else if (job === 'quarrying') {
      this.part(tool, 0xba9b6a, 0, 0.065, 0, 0.012, 0.18, 0.012);
      this.part(tool, 0x8d98a2, 0, 0.135, 0, 0.072, 0.018, 0.018);
    } else {
      this.part(tool, 0xba9b6a, 0, 0.07, 0, 0.012, 0.19, 0.012);
      this.part(tool, 0x6f7a55, 0.02, 0.145, 0, 0.05, 0.014, 0.016);
    }
    return tool;
  }

  private buildCargo(job: WorkerJob): THREE.Group {
    const cargo = new THREE.Group();
    cargo.name = 'cargo';
    cargo.visible = false;
    if (job === 'logging') {
      for (let i = -1; i <= 1; i++) this.part(cargo, 0x8b5b3e, i * 0.02, 0.11, 0, 0.055, 0.02, 0.02);
    } else if (job === 'quarrying') {
      this.part(cargo, 0x7b8791, 0, 0.11, 0, 0.08, 0.05, 0.05);
      this.part(cargo, 0xb0bac3, -0.02, 0.13, 0.02, 0.03, 0.02, 0.03);
      this.part(cargo, 0x94a0ab, 0.02, 0.128, -0.02, 0.026, 0.018, 0.026);
    } else {
      this.part(cargo, 0xe1c95f, 0, 0.115, 0, 0.06, 0.08, 0.04);
      this.part(cargo, 0xb08a46, 0, 0.09, 0, 0.02, 0.05, 0.02);
    }
    return cargo;
  }

  private buildWorker(job: WorkerJob, variant: number): WorkerActor {
    const root = new THREE.Group();
    const skin = [0xe8bf98, 0xd49a74, 0xf0c9a0][variant % 3]!;
    const shirt = job === 'logging'
      ? [0x5e7b4b, 0x6f8c55, 0x728a48][variant % 3]!
      : job === 'quarrying'
        ? [0x6f8097, 0x5d738b, 0x77899e][variant % 3]!
        : [0xb28c4d, 0x739467, 0xaf915d][variant % 3]!;
    const trousers = [0x3b4552, 0x4d4339, 0x394451][variant % 3]!;
    const hat = job === 'logging' ? 0x624a2e : job === 'quarrying' ? 0x5c6470 : 0x8a6f34;

    const legL = new THREE.Group();
    legL.name = 'legL';
    legL.position.set(-0.018, 0.03, 0);
    this.part(legL, trousers, 0, -0.03, 0, 0.018, 0.06, 0.02);
    root.add(legL);

    const legR = new THREE.Group();
    legR.name = 'legR';
    legR.position.set(0.018, 0.03, 0);
    this.part(legR, trousers, 0, -0.03, 0, 0.018, 0.06, 0.02);
    root.add(legR);

    this.part(root, shirt, 0, 0.082, 0, 0.056, 0.072, 0.034, 'torso');

    const armL = new THREE.Group();
    armL.name = 'armL';
    armL.position.set(-0.036, 0.108, 0);
    this.part(armL, shirt, 0, -0.034, 0, 0.016, 0.068, 0.016);
    root.add(armL);

    const armR = new THREE.Group();
    armR.name = 'armR';
    armR.position.set(0.036, 0.108, 0);
    this.part(armR, shirt, 0, -0.034, 0, 0.016, 0.068, 0.016);
    root.add(armR);

    this.part(root, skin, 0, 0.142, 0, 0.038, 0.04, 0.038, 'head');
    this.part(root, hat, 0, 0.17, 0, 0.044, 0.016, 0.044, 'hat');

    const tool = this.buildTool(job);
    tool.position.set(0.045, 0.07, 0.012);
    root.add(tool);

    const cargo = this.buildCargo(job);
    cargo.position.set(0.028, 0, 0.012);
    root.add(cargo);

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) obj.castShadow = this.shadows;
    });
    this.group.add(root);
    return { root, route: { points: [], length: 0 }, job, variant, time: 0, priority: 0, armL, armR, legL, legR, tool, cargo };
  }

  private sync(p: Province, season: Season, selected: string | null): void {
    if (this.province?.buildings === p.buildings && this.province.tiles === p.tiles &&
        this.season === season && this.selection === selected) return;
    this.province = p;
    this.season = season;
    this.selection = selected;
    const kept = new Set<string>();
    const buildings = [...p.buildings].sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
    for (const b of buildings) {
      const job = workerJob(b.definitionId);
      if (!job || !isOperating(b) || (season === 'winter' && defOf(b).seasonal)) continue;
      if (job === 'quarrying' && !tilesInRange(p, defOf(b), b.x, b.y).some((i) => p.tiles[i]!.deposit > 0)) continue;
      let logging: WorkRoute[] | undefined;
      for (let i = 0; i < b.workers && kept.size < MAX_VISIBLE_WORKERS; i++) {
        const key = `${b.id}:${i}`;
        const current = this.actors.get(key);
        if (current && routeStillOpen(p, current.route)) {
          kept.add(key);
          continue;
        }
        if (job === 'logging') logging ??= logRoutes(p, b);
        const route = logging?.length ? logging[i % logging.length] : job === 'logging' ? undefined : siteRoute(p, b, job, i);
        if (!route) continue;
        kept.add(key);
        if (current) {
          current.route = route;
          current.time = i * 0.83;
          current.job = job;
          current.priority = i;
          continue;
        }
        const actor = this.buildWorker(job, (b.x + b.y + i) % 3);
        actor.root.userData.person = { ref: {kind: 'worker', buildingId: b.id, slot: i}, activity: 'Çalışıyor' };
        actor.route = route;
        actor.time = i * 0.83;
        actor.priority = i;
        this.actors.set(key, actor);
      }
    }
    for (const [key, actor] of this.actors) {
      if (kept.has(key)) continue;
      actor.root.removeFromParent();
      this.actors.delete(key);
    }
  }

  private animateActor(actor: WorkerActor, pose: 'walk' | 'carry' | 'work', phase: number, reducedMotion: boolean): void {
    const swing = reducedMotion ? 0 : Math.sin(phase);
    const lift = reducedMotion ? 0 : Math.abs(Math.sin(phase));
    actor.cargo.visible = pose === 'carry';
    if (pose === 'walk') {
      actor.legL.rotation.x = swing * 0.7;
      actor.legR.rotation.x = -swing * 0.7;
      actor.armL.rotation.x = -swing * 0.55;
      actor.armR.rotation.x = swing * 0.55;
      actor.tool.rotation.z = actor.job === 'logging' ? 0.1 : actor.job === 'quarrying' ? -0.2 : 0.35;
      actor.root.position.y += lift * 0.018;
    } else if (pose === 'carry') {
      actor.legL.rotation.x = swing * 0.45;
      actor.legR.rotation.x = -swing * 0.45;
      actor.armL.rotation.x = -0.95;
      actor.armR.rotation.x = -0.95;
      actor.tool.rotation.z = 0;
      actor.root.position.y += lift * 0.012;
    } else {
      actor.legL.rotation.x = 0;
      actor.legR.rotation.x = 0;
      if (actor.job === 'logging') {
        actor.armL.rotation.x = -0.6;
        actor.armR.rotation.x = -0.4 + swing * 0.95;
        actor.tool.rotation.z = -0.35 + swing * 0.95;
      } else if (actor.job === 'quarrying') {
        actor.armL.rotation.x = -0.4;
        actor.armR.rotation.x = -0.9 + swing * 1.1;
        actor.tool.rotation.z = -1.1 + swing * 1.05;
      } else {
        actor.armL.rotation.x = -0.25;
        actor.armR.rotation.x = -0.55 + swing * 0.65;
        actor.tool.rotation.z = 0.55 + swing * 0.4;
      }
      actor.root.position.y += lift * 0.008;
    }
  }

  update(p: Province, season: Season, selected: string | null, seconds: number, reducedMotion: boolean): void {
    this.sync(p, season, selected);
    for (const actor of this.actors.values()) {
      const { route } = actor;
      const travel = route.length / WALK_SPEED;
      const cycle = WORK_TIME + travel * 2;
      actor.time = (actor.time + seconds) % cycle;
      const t = reducedMotion ? travel + 0.42 : actor.time;
      const walkingOut = t < travel;
      const returning = t >= travel + WORK_TIME && travel > 0;
      const pose = (walkingOut ? 'walk' : returning ? 'carry' : 'work') as 'walk' | 'carry' | 'work';

      let distance = walkingOut ? t * WALK_SPEED : returning ? (cycle - t) * WALK_SPEED : route.length;
      let point = route.points[0]!;
      let next = point;
      for (let i = 1; i < route.points.length; i++) {
        next = route.points[i]!;
        const length = Math.hypot(next.x - point.x, next.y - point.y);
        if (distance <= length + 1e-8) break;
        distance -= length;
        point = next;
      }
      const dx = next.x - point.x;
      const dy = next.y - point.y;
      const segment = Math.hypot(dx, dy);
      const ratio = segment > 0 ? Math.min(1, distance / segment) : 0;
      const spread = actor.job === 'logging' ? (actor.priority % 3 - 1) * 0.05 : 0;
      const x = point.x + dx * ratio + spread;
      const y = point.y + dy * ratio - spread;
      const height = point.height + (next.height - point.height) * ratio;
      actor.root.position.set(x, height + 0.01, y);
      if (dx !== 0 || dy !== 0) {
        actor.root.rotation.y = pose === 'work' && actor.job === 'quarrying' ? actor.root.rotation.y : yawOf(dx * (returning ? -1 : 1), dy * (returning ? -1 : 1));
      }
      actor.root.rotation.z = 0;
      actor.legL.rotation.z = actor.legR.rotation.z = 0;
      actor.armL.rotation.z = actor.armR.rotation.z = 0;
      const phase = t * (pose === 'work' ? 4.2 : 7.8) + actor.priority * 0.6;
      this.animateActor(actor, pose, phase, reducedMotion);
    }
  }

  dispose(): void {
    this.group.clear();
    this.actors.clear();
    this.province = undefined;
    this.box.dispose();
    for (const mat of this.paints.values()) mat.dispose();
    this.paints.clear();
  }
}