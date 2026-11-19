import { Graphics, GraphicsContext } from 'pixi.js';
import { markPerson, setActivity } from './people';
import type { Container } from 'pixi.js';
import type { BuildingId, BuildingInstance, Province, Tile } from '../core/types';
import type { Season } from '../core/time';
import { HEIGHT_PX } from '../data/balance';
import { defOf } from '../data/buildings';
import { isOperating } from '../systems/economy';
import { canLink, NEIGHBORS4, perimeterTiles, tileAt, tilesInRange } from '../systems/grid';
import { isoX, isoY } from './iso';
import { drawWorker, WORKER_FRAMES } from './workerSprites';
import type { WorkerJob, WorkerPose } from './workerSprites';

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
  siteDepth?: number;
}

interface Worker {
  sprite: Graphics;
  time: number;
  route: WorkRoute;
  poseKey: string;
  job: WorkerJob;
  variant: number;
  priority: number;
}

const MAX_VISIBLE_WORKERS = 36;
const WALK_SPEED = 1.35;
const WORK_TIME = 3.3;
const JOBS: Partial<Record<BuildingId, WorkerJob>> = {
  farm: 'farming',
  terrace_farm: 'farming',
  lumber_camp: 'logging',
  quarry: 'quarrying',
};

export const workerJob = (id: BuildingId): WorkerJob | undefined => JOBS[id];

function walkable(tile: Tile | undefined): tile is Tile {
  return !!tile && !tile.buildingId && (
    tile.road || (tile.terrain !== 'water' && tile.terrain !== 'lake' && tile.terrain !== 'mountain')
  );
}

function walkableStep(from: Tile, to: Tile): boolean {
  if (from.road && to.road) return canLink(from, to);
  return Math.abs(from.height - to.height) <= 1 &&
    to.terrain !== 'water' && to.terrain !== 'lake';
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
        height: p.tiles[index]!.height * HEIGHT_PX,
      }));
      const first = points[0]!;
      const base = (tileAt(p, b.x, b.y)?.height ?? 0) * HEIGHT_PX;
      // Start inside the yard on the chosen side so the worker emerges from the camp.
      points.unshift({
        x: Math.max(b.x + 0.14, Math.min(first.x, b.x + w - 0.14)),
        y: Math.max(b.y + 0.14, Math.min(first.y, b.y + h - 0.14)),
        height: base,
      });
      const last = points.at(-1)!;
      last.x += 0.19;
      last.y += 0.23;
      const length = points.slice(1).reduce((sum, point, j) =>
        sum + Math.hypot(point.x - points[j]!.x, point.y - points[j]!.y), 0);
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
    tileAt(p, b.x, b.y)!.height, tileAt(p, b.x + 1, b.y)!.height,
    tileAt(p, b.x, b.y + 1)!.height, tileAt(p, b.x + 1, b.y + 1)!.height,
  ) * HEIGHT_PX;
  const siteDepth = b.x + b.y + 3.09;
  if (job === 'quarrying') {
    const [x, y] = ([[1.14, 0.98], [1.52, 1.65], [1.64, 0.82]] as const)[worker % 3]!;
    return { length: 0, siteDepth, points: [{ x: b.x + x, y: b.y + y, height: base }] };
  }
  const terrace = b.definitionId === 'terrace_farm';
  const [x, y] = ([[0.24, 0.58], [0.91, 1.08], [0.3, 1.57], [1.1, 1.68]] as const)[worker % 4]!;
  const row = terrace ? [0.48, 1.1, 1.72][worker % 3]! : y;
  const height = base + (terrace ? [11, 7, 3][worker % 3]! : 0);
  const point = { x: b.x + x, y: b.y + row, height };
  return { length: 0.46, siteDepth, points: [point, { ...point, x: point.x + 0.46 }] };
}

const WORK_ACTIVITY: Record<WorkerJob, string> = {
  farming: 'Tarlada çalışıyor',
  logging: 'Ağaç kesiyor',
  quarrying: 'Taş kırıyor',
};

export class WorkerScenes {
  private workers = new Map<string, Worker>();
  private frames = new Map<string, GraphicsContext>();
  private province?: Province;
  private season?: Season;
  private selection: string | null = null;
  private tint = 0xffffff;

  constructor(private layer: Container) {}

  get count(): number { return this.workers.size; }

  setTint(tint: number): void {
    this.tint = tint;
    for (const worker of this.workers.values()) worker.sprite.tint = tint;
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
        const current = this.workers.get(key);
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
          continue;
        }
        const variant = (b.x + b.y + i) % 2;
        const sprite = new Graphics(this.frameFor(job, 'walk', 0, variant));
        sprite.scale.set(0.6);
        markPerson(sprite, { kind: 'worker', buildingId: b.id, slot: i }, 'İşe yürüyor', 30);
        sprite.tint = this.tint;
        sprite.cullable = true;
        this.layer.addChild(sprite);
        this.workers.set(key, { sprite, route, job, variant, time: i * 0.83, poseKey: '', priority: i });
      }
    }
    for (const [key, worker] of this.workers) {
      if (kept.has(key)) continue;
      worker.sprite.destroy();
      this.workers.delete(key);
    }
  }

  private frameFor(job: WorkerJob, pose: WorkerPose, frame: number, variant: number): GraphicsContext {
    const key = `${job}:${pose}:${frame}:${variant}`;
    let ctx = this.frames.get(key);
    if (!ctx) {
      ctx = new GraphicsContext();
      drawWorker(ctx, job, pose, frame, variant);
      this.frames.set(key, ctx);
    }
    return ctx;
  }

  update(p: Province, season: Season, selected: string | null, seconds: number, reducedMotion: boolean): void {
    this.sync(p, season, selected);
    for (const worker of this.workers.values()) {
      const { route, sprite, job, variant, priority } = worker;
      const travel = route.length / WALK_SPEED;
      const cycle = WORK_TIME + travel * 2;
      worker.time = (worker.time + seconds) % cycle;
      const t = reducedMotion ? travel + 0.42 : worker.time;
      const walkingOut = t < travel;
      const returning = t >= travel + WORK_TIME && travel > 0;
      const pose: WorkerPose = walkingOut ? 'walk' : returning ? 'carry' : 'work';
      const frame = Math.floor(t * WORKER_FRAMES * (pose === 'work' ? 1.05 : 1.8)) % WORKER_FRAMES;
      const key = `${pose}:${frame}`;
      if (worker.poseKey !== key) {
        sprite.context = this.frameFor(job, pose, frame, variant);
        worker.poseKey = key;
      }

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
      const spread = job === 'logging' ? (priority % 3 - 1) * 0.065 : 0;
      const x = point.x + dx * ratio + spread;
      const y = point.y + dy * ratio - spread;
      const height = point.height + (next.height - point.height) * ratio;
      sprite.position.set(isoX(x, y), isoY(x, y) - height);
      sprite.zIndex = route.siteDepth ?? x + y + 0.03;
      sprite.scale.x = (pose === 'work' ? job === 'quarrying' : (dx - dy) * (returning ? -1 : 1) < 0) ? -0.6 : 0.6;
      if (worker.poseKey === key) setActivity(sprite, pose === 'walk' ? 'İşe yürüyor' : pose === 'carry' ? 'Ürünü depoya taşıyor' : WORK_ACTIVITY[job]);
    }
  }

  destroy(): void {
    for (const worker of this.workers.values()) worker.sprite.destroy();
    for (const frame of this.frames.values()) frame.destroy();
    this.workers.clear();
    this.frames.clear();
  }
}
