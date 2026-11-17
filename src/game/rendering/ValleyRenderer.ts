import 'pixi.js/unsafe-eval';
import { Application, Container, CullerPlugin, Graphics, Sprite, extensions } from 'pixi.js';
import type { Texture, Ticker } from 'pixi.js';
import { mix } from './arch/kit';
import { nightFactor, weatherFor } from './weather';
import type { Weather } from './weather';

extensions.add(CullerPlugin);
import { calendar, clockHour } from '../core/time';
import type { Season } from '../core/time';
import type { ArchitectureStyle, BuildingId, BuildingInstance, BuildingLook, GameState, Province, Tile } from '../core/types';
import { HEIGHT_PX, MAX_HEIGHT } from '../data/balance';
import { BUILDINGS, defOf, specOf } from '../data/buildings';
import type { RoadPlan, RoadPoint } from '../systems/commands';
import { validatePlacement } from '../systems/commands';
import { homeProvince, isBuilt, isOperating, totalPopulation } from '../systems/economy';
import { NEIGHBORS4, buildingById, footprintTiles, tileAt, tilesInRange } from '../systems/grid';
import { checkRoadSite } from '../systems/placement';
import { requiredTicks } from '../systems/tick';
import { TH, isoX, isoY, P, worldToTile } from './iso';
import { COLORS, SEASON_PALETTE, VILLAGER_COLORS } from './palette';
import type { SeasonPalette } from './palette';
import { drawBird, drawBoat, drawCart, drawFlag, drawGroundTile, drawRocks, drawStump, drawTree, drawVillager } from './sprites';
import { buildingArtSeed, drawStyledBuilding, drawStyledConstruction } from './arch/buildings';
import type { SpriteInfo } from './arch/buildings';
import { CULTURES } from '../data/architecture';
import { conditionBand } from '../systems/architecture';
import { findRoadPath } from './armyPath';
import { getPavedLinks } from './roadGeometry';
import { matchDayFor } from '../data/matchDays';
import type { MatchDay } from '../data/matchDays';
import { drawCityCar, drawFootballSupporter, drawSupporterFlare } from './trafficSprites';
import { pedestrianSidewalkOffset, smoothVehicleTurnOffset } from './trafficMath';
import type { GridPoint } from './armyPath';
import { CityScenes } from './cityScenes';
import { WorkerScenes } from './workerScenes';
import { FrontierScenes } from './frontierScenes';

export type Tool =
  | { kind: 'select' }
  | { kind: 'build'; buildingId: BuildingId; style?: ArchitectureStyle; look?: BuildingLook | null }
  | { kind: 'road' }
  | { kind: 'roadPlan'; start?: RoadPoint; end?: RoadPoint; bridge?: boolean; paved?: boolean }
  | { kind: 'pave' }
  | { kind: 'terrace' }
  | { kind: 'demolish' }
  | { kind: 'army' }
  | { kind: 'hunt'; workers: number };

/** Detail level of procedural art: 0 flat, 1 materials, 2 fine texture. */
export type ArtDetail = 0 | 1 | 2;

export interface RendererView {
  game: GameState;
  tool: Tool;
  selectedBuildingId: string | null;
  roadPlan?: RoadPlan | null;
  reducedMotion: boolean;
  detail: ArtDetail;
  dayNight: boolean;
  weather: boolean;
  /** True when the quality setting is Auto (the FPS watchdog may lower it). */
  autoQuality: boolean;
}

export interface RendererOptions {
  /** Canvas resolution multiplier cap and antialiasing (fixed for the renderer's lifetime). */
  resolution: number;
  antialias: boolean;
  /** Cache building bodies as textures (cheaper frames, used on low/medium quality). */
  cacheBodies: boolean;
}

export interface RendererHost {
  getView(): RendererView | null;
  onTileClick(x: number, y: number, buildingId: string | null): void;
  onRoadPaint(x: number, y: number): void;
  onHover(tile: { x: number; y: number } | null): void;
  onCancel(): void;
  /** Sustained low frame rate on Auto quality. */
  onLowFps?(fps: number): void;
}

export interface RendererStats {
  fps: number;
  night: number;
  weather: Weather;
  textures: number;
  buildings: number;
  props: number;
  walkers: number;
  particles: number;
}

interface BuildingView {
  c: Container;
  body: Container;
  glow: Graphics;
  g: Graphics;
  extra: Graphics;
  flags: Graphics[];
  mask: Graphics | null;
  info: SpriteInfo;
  sig: string;
  smokeTimer: number;
}
interface PropView {
  c: Container;
  sway: Container | null;
  sig: string;
  phase: number;
}
interface Walker {
  c: Container;
  from: [number, number];
  to: [number, number];
  prev: [number, number];
  t: number;
  speed: number;
  phase: number;
  side: number;
  cart: boolean;
  fan?: boolean;
  flare?: Graphics;
}
interface TrafficCar {
  c: Container;
  sprite: Graphics;
  paint: number;
  electric: boolean;
  variant: number;
  heading: string;
  from: [number, number];
  to: [number, number];
  prev: [number, number];
  t: number;
  speed: number;
}
interface Particle {
  g: Graphics;
  life: number;
}
interface BirdSprite {
  c: Container;
  g: Graphics;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
  speed: number;
  phase: number;
}

const MIN_ZOOM = 0.24;
const MAX_ZOOM = 2.6;
const SPEED_FACTOR: Record<number, number> = { 0: 0, 1: 1, 2: 1.6, 4: 2.4 };

/**
 * Read-only PixiJS view of the home province. It never mutates game state: all input is
 * reported through RendererHost callbacks and turned into commands by the app layer.
 * Layers (bottom to top): ground, water fx, ground overlays, depth-sorted objects, ghost.
 */
export class ValleyRenderer {
  private app = new Application();
  private world = new Container();
  private ground = new Graphics();
  private waterFx = new Graphics();
  private under = new Graphics();
  private transportGround = new Graphics();
  private objects = new Container();
  private cityScenes = new CityScenes(this.objects);
  private workScenes = new WorkerScenes(this.objects);
  private frontier = new FrontierScenes(this.transportGround, this.objects);
  private ghost = new Graphics();
  private fx = new Container();
  private drops: { g: Graphics; x: number; y: number; v: number; d: number }[] = [];
  private dropKind: Weather = 'clear';
  private atlas = new Map<string, { tex: Texture; x: number; y: number }>();
  private night = 0;
  private tintKey = -1;
  private fpsSamples: number[] = [];
  private lowFpsAt = -1e9;
  private size = 32;
  private cameraViewport = { width: 0, height: 0 };
  private prov: Province | null = null;
  private opts: RendererOptions = { resolution: 2, antialias: true, cacheBodies: false };
  private buildingViews = new Map<string, BuildingView>();
  private propViews = new Map<number, PropView>();
  private walkers: Walker[] = [];
  private matchFans: Walker[] = [];
  private activeFanMatch = '';
  private trafficCars: TrafficCar[] = [];
  private pavedRoadTiles: [number, number][] = [];
  private militiaSprites: Container[] = [];
  private militiaPos: GridPoint | null = null;
  private militiaRoute: GridPoint[] = [];
  private militiaRouteStep = 0;
  private militiaRouteT = 0;
  private militiaTargetKey = '';
  private particles: Particle[] = [];
  private boats: { c: Container; kind: 'fishing' | 'cargo' | 'yacht'; px: number; py: number; x: number; y: number; tx: number; ty: number; t: number }[] = [];
  private birds: BirdSprite[] = [];
  private lastTiles: Tile[] | null = null;
  private lastSeason: Season | null = null;
  private waterTiles: [number, number][] = [];
  private roadTiles: [number, number][] = [];
  private hover: { x: number; y: number } | null = null;
  private time = 0;
  private waterTimer = 0;
  private flagTimer = 0;
  private ghostSig = '';
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { lastX: number; lastY: number; total: number; button: number; paint: boolean } | null = null;
  private pinch: { dist: number } | null = null;
  private lastPaint = '';
  private destroyed = false;
  private ready = false;
  private cleanup: (() => void)[] = [];

  private constructor(private cb: RendererHost) {}

  static async create(parent: HTMLElement, cb: RendererHost, opts: RendererOptions): Promise<ValleyRenderer> {
    const r = new ValleyRenderer(cb);
    r.opts = opts;
    const dpr = Math.min(opts.resolution, window.devicePixelRatio || 1);
    await r.app.init({
      resizeTo: parent,
      background: COLORS.bg,
      antialias: opts.antialias,
      resolution: dpr,
      autoDensity: true,
    });
    if (r.destroyed) {
      r.app.destroy(true);
      return r;
    }
    r.ready = true;
    parent.appendChild(r.app.canvas);
    r.objects.sortableChildren = true;
    r.world.addChild(r.ground, r.waterFx, r.transportGround, r.under, r.objects, r.ghost);
    r.app.stage.addChild(r.world, r.fx);
    const view = cb.getView();
    if (view) r.size = homeProvince(view.game).width;
    r.centerCamera();
    r.bindInput(r.app.canvas);
    r.app.ticker.add(r.onFrame);
    return r;
  }

  centerCamera(): void {
    if (!this.ready) return;
    const { width, height } = this.app.screen;
    this.cameraViewport = { width, height };
    const midY = (this.size * TH) / 2;
    this.world.scale.set(1);
    this.world.position.set(width / 2, height / 2 - midY * 0.85);
  }

  private keepCameraCenteredOnResize(): void {
    const { width, height } = this.app.screen;
    const prev = this.cameraViewport;
    if (width <= 0 || height <= 0) return;
    if (prev.width === 0 || prev.height === 0) {
      this.centerCamera();
      return;
    }
    if (prev.width === width && prev.height === height) return;
    this.world.position.x += (width - prev.width) / 2;
    this.world.position.y += (height - prev.height) / 2;
    this.cameraViewport = { width, height };
  }

  zoomBy(factor: number, cx?: number, cy?: number): void {
    if (!this.ready) return;
    const x = cx ?? this.app.screen.width / 2;
    const y = cy ?? this.app.screen.height / 2;
    const old = this.world.scale.x;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, old * factor));
    const wx = (x - this.world.x) / old;
    const wy = (y - this.world.y) / old;
    this.world.scale.set(next);
    this.world.position.set(x - wx * next, y - wy * next);
  }

  panBy(dx: number, dy: number): void {
    if (!this.ready) return;
    this.world.x += dx;
    this.world.y += dy;
  }

  getStats(): RendererStats {
    return {
      fps: this.ready ? Math.round(this.app.ticker.FPS) : 0,
      night: Math.round(this.night * 100),
      weather: this.dropKind,
      textures: this.atlas.size,
      buildings: this.buildingViews.size,
      props: this.propViews.size,
      walkers:
        this.walkers.length +
        this.matchFans.length +
        this.trafficCars.length +
        this.cityScenes.count +
        this.workScenes.count +
        this.birds.length,
      particles: this.particles.length + this.drops.length,
    };
  }

  destroy(): void {
    this.destroyed = true;
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.cityScenes.destroy();
    this.workScenes.destroy();
    this.frontier.destroy();
    for (const e of this.atlas.values()) e.tex.destroy(true);
    this.atlas.clear();
    if (this.ready) {
      this.app.ticker.remove(this.onFrame);
      this.app.destroy(true, { children: true });
      this.ready = false;
    }
  }

  private hz(p: Province, x: number, y: number): number {
    return (tileAt(p, x, y)?.height ?? 0) * HEIGHT_PX;
  }

  private screenToTile(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const wx = (sx - this.world.x) / this.world.scale.x;
    const wy = (sy - this.world.y) / this.world.scale.y;

    const p = this.prov;
    if (p) {
      for (const bv of this.buildingViews.values()) {
        const b = bv.c;
        const dx = wx - b.x;
        const dy = wy - b.y;
        const w = (bv.info.height > 0 ? 48 : 32);
        if (dx >= -w && dx <= w && dy >= -bv.info.height && dy <= 32) {
          for (const inst of p.buildings) {
            if (this.buildingViews.get(inst.id) === bv) return { x: inst.x, y: inst.y };
          }
        }
      }
      // Height-aware ray pick: test from highest terrace down so raised tiles win over tiles behind them.
      for (let h = MAX_HEIGHT; h >= 0; h--) {
        const t = worldToTile(wx, wy + h * HEIGHT_PX);
        const tile = tileAt(p, t.x, t.y);
        if (tile && tile.height === h) return t;
      }
    }
    const t = worldToTile(wx, wy);
    if (t.x < 0 || t.y < 0 || t.x >= this.size || t.y >= this.size) return null;
    return t;
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    const onDown = (e: PointerEvent): void => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
        this.drag = null;
        return;
      }
      const view = this.cb.getView();
      const paint = e.button === 0 && view?.tool.kind === 'road';
      this.drag = { lastX: e.clientX, lastY: e.clientY, total: 0, button: e.button, paint };
      this.lastPaint = '';
      if (paint) {
        const t = this.screenToTile(e.clientX, e.clientY);
        if (t) {
          this.lastPaint = `${t.x},${t.y}`;
          this.cb.onRoadPaint(t.x, t.y);
        }
      }
    };

    const onMove = (e: PointerEvent): void => {
      if (this.pointers.has(e.pointerId)) {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (this.pinch.dist > 8) {
          const rect = canvas.getBoundingClientRect();
          const cx = (a!.x + b!.x) / 2 - rect.left;
          const cy = (a!.y + b!.y) / 2 - rect.top;
          this.zoomBy(dist / this.pinch.dist, cx, cy);
        }
        this.pinch.dist = dist;
        return;
      }
      const t = this.screenToTile(e.clientX, e.clientY);
      if (t?.x !== this.hover?.x || t?.y !== this.hover?.y) {
        this.hover = t;
        this.cb.onHover(t);
      }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.lastX;
      const dy = e.clientY - this.drag.lastY;
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
      this.drag.total += Math.abs(dx) + Math.abs(dy);
      if (this.drag.paint) {
        if (t) {
          const key = `${t.x},${t.y}`;
          if (key !== this.lastPaint) {
            this.lastPaint = key;
            this.cb.onRoadPaint(t.x, t.y);
          }
        }
      } else {
        this.world.x += dx;
        this.world.y += dy;
      }
    };

    const onUp = (e: PointerEvent): void => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.button === 2 && d.total < 6) {
        this.cb.onCancel();
        return;
      }
      if (d.button === 0 && !d.paint && d.total < 6) {
        const t = this.screenToTile(e.clientX, e.clientY);
        const view = this.cb.getView();
        if (t && view) {
          const p = homeProvince(view.game);
          const tile = tileAt(p, t.x, t.y);
          this.cb.onTileClick(t.x, t.y, tile?.buildingId ?? null);
        }
      }
    };

    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    };

    const onCtx = (e: MouseEvent): void => e.preventDefault();

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onCtx);
    this.cleanup.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onCtx);
    });
  }

  private onFrame = (ticker: Ticker): void => {
    this.keepCameraCenteredOnResize();
    const view = this.cb.getView();
    if (!view) return;
    const dt = ticker.deltaMS;
    const motion = !view.reducedMotion;
    if (motion) this.time += dt;

    const p = homeProvince(view.game);
    this.prov = p;
    if (this.size !== p.width) {
      this.size = p.width;
      this.centerCamera();
    }
    const { season, day } = calendar(view.game.tick);
    const pal = SEASON_PALETTE[season];

    if (this.lastTiles !== p.tiles || this.lastSeason !== season) {
      if (this.lastSeason !== null && this.lastSeason !== season) this.pruneAtlas(season);
      this.lastTiles = p.tiles;
      this.lastSeason = season;
      this.drawGround(p, pal, view.detail);
    }

    this.waterTimer += dt;
    if (motion && this.waterTimer > 110) {
      this.waterTimer = 0;
      this.animateWater(p);
    }

    this.flagTimer += dt;
    const tickFlags = motion && this.flagTimer > 70;
    if (tickFlags) this.flagTimer = 0;

    this.syncProps(p, season, pal, view.detail, motion);
    this.syncBuildings(p, season, pal, view.detail, motion, tickFlags, dt);
    this.cityScenes.update(view.game, p, dt, !motion);
    this.workScenes.update(view.game, p, dt, !motion);
    this.frontier.update(view.game, p, dt, view.tool.kind === 'hunt');
    this.updateWalkers(view, p, dt, motion);
    this.updateTraffic(view, p, dt, motion);
    this.updateMilitia(view, p, dt);
    this.updateBoats(view, p, dt, motion);
    this.updateBirds(p, dt, motion);
    this.updateParticles(dt);
    this.updateLight(view, clockHour(view.game.tick), dt);
    this.updateWeather(view, day, season, dt, motion);
    this.drawOverlays(view, p, pal);
    this.watchFps(view);
  };

  private drawGround(p: Province, pal: SeasonPalette, detail: ArtDetail): void {
    const g = this.ground;
    g.clear();
    this.waterTiles = [];
    this.roadTiles = [];
    this.pavedRoadTiles = [];

    const hAt = (x: number, y: number): number => tileAt(p, x, y)?.height ?? 0;
    const isWater = (x: number, y: number): boolean => {
      const tr = tileAt(p, x, y)?.terrain;
      return tr === 'water' || tr === 'lake';
    };

    // Draw back-to-front so elevated tiles and cliffs occlude lower tiles behind them.
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const t = p.tiles[y * p.width + x]!;
        let waterAdj = 0;
        if (t.terrain === 'water' || t.terrain === 'lake') {
          this.waterTiles.push([x, y]);
          if (!isWater(x, y - 1)) waterAdj |= 1;
          if (!isWater(x + 1, y)) waterAdj |= 2;
          if (!isWater(x, y + 1)) waterAdj |= 4;
          if (!isWater(x - 1, y)) waterAdj |= 8;
        }
        drawGroundTile(
          g,
          t,
          x,
          y,
          hAt(x + 1, y),
          hAt(x, y + 1),
          hAt(x, y - 1),
          hAt(x - 1, y),
          waterAdj,
          pal,
          detail,
        );
        if (t.road) {
          this.roadTiles.push([x, y]);
          if (t.paved) this.pavedRoadTiles.push([x, y]);
          const z = t.height * HEIGHT_PX;
          const [ox, oy] = P(x, y, z);
          const mask = getPavedLinks(p, x, y);
          let waterMask = 0;
          if (isWater(x - 1, y)) waterMask |= 1;
          if (isWater(x + 1, y)) waterMask |= 2;
          if (isWater(x, y - 1)) waterMask |= 4;
          if (isWater(x, y + 1)) waterMask |= 8;
          drawRoad(
            g,
            ox,
            oy,
            mask,
            t.terrain === 'water' || t.terrain === 'lake' || t.roadType === 'bridge',
            pal,
            t.roadType,
            t.paved,
            waterMask,
            detail,
          );
        } else if (t.terrace) {
          const z = t.height * HEIGHT_PX;
          const [ox, oy] = P(x, y, z);
          g.moveTo(ox - 28, oy + 18)
            .lineTo(ox, oy + 30)
            .lineTo(ox + 28, oy + 18)
            .stroke({ color: 0x7c7466, width: 3 });
        }
      }
    }
    this.animateWater(p);
  }

  private animateWater(p: Province): void {
    const g = this.waterFx;
    g.clear();
    const phase = this.time / 480;
    for (let k = 0; k < this.waterTiles.length; k++) {
      const [x, y] = this.waterTiles[k]!;
      const [ox, oy] = P(x, y, this.hz(p, x, y));
      const s = Math.sin(phase + k * 0.7) * 3;
      g.moveTo(ox - 10 + s, oy + 14)
        .lineTo(ox + 2 + s, oy + 14)
        .stroke({ color: COLORS.waterFoam, width: 1.3, alpha: 0.32 });
      g.moveTo(ox - 2 - s, oy + 20)
        .lineTo(ox + 9 - s, oy + 20)
        .stroke({ color: COLORS.waterFoam, width: 1.2, alpha: 0.24 });
    }
  }

  /** Syncs trees, stumps, and rock outcrops. Unchanged tiles reuse their Container across ticks. */
  private syncProps(p: Province, season: Season, pal: SeasonPalette, detail: ArtDetail, motion: boolean): void {
    const live = new Set<number>();
    for (let i = 0; i < p.tiles.length; i++) {
      const t = p.tiles[i]!;
      if (t.buildingId || t.road) continue;
      const isForest = t.terrain === 'forest';
      const isStone = t.terrain === 'stone' && t.deposit > 0;
      if (!isForest && !isStone) continue;

      live.add(i);
      const x = i % p.width;
      const y = (i - x) / p.width;
      const band = isForest ? (t.deposit <= 0 ? 0 : t.deposit > 125 ? 3 : t.deposit > 60 ? 2 : 1) : Math.ceil(t.deposit / 70);
      const sig = `${season}|${t.terrain}|${band}|${t.height}|${detail}`;

      let pv = this.propViews.get(i);
      if (!pv || pv.sig !== sig) {
        if (pv) pv.c.destroy({ children: true });
        const c = new Container();
        c.cullable = true;
        let sway: Container | null = null;
        if (isForest && band === 0) {
          c.addChild(this.sprite(`stump|${season}`, (g) => drawStump(g)));
        } else if (isForest) {
          sway = new Container();
          sway.pivot.set(0, 18);
          sway.position.set(0, 18);
          const v = (x * 7 + y * 13) & 3;
          const dep = band === 3 ? 180 : band === 2 ? 100 : 40;
          sway.addChild(this.sprite(`tree|${season}|${band}|${v}`, (g) => drawTree(g, dep, v, pal)));
          c.addChild(sway);
        } else {
          c.addChild(this.sprite(`rock|${season}|${band}`, (g) => drawRocks(g, band * 70, pal.snow)));
        }
        const z = t.height * HEIGHT_PX;
        c.position.set(isoX(x, y), isoY(x, y) - z);
        c.zIndex = x + y + 0.01;
        this.objects.addChild(c);
        pv = { c, sway, sig, phase: (x * 1.3 + y * 0.9) % 6.28 };
        this.propViews.set(i, pv);
        this.tintKey = -1;
      }
      if (pv.sway) {
        pv.sway.rotation = motion ? Math.sin(this.time / 950 + pv.phase) * 0.025 : 0;
      }
    }
    for (const [i, pv] of this.propViews) {
      if (!live.has(i)) {
        pv.c.destroy({ children: true });
        this.propViews.delete(i);
      }
    }
  }

  /** Syncs building views; body Graphics is only redrawn when level/built/season/detail changes. */
  private syncBuildings(
    p: Province,
    season: Season,
    pal: SeasonPalette,
    detail: ArtDetail,
    motion: boolean,
    tickFlags: boolean,
    dt: number,
  ): void {
    const seen = new Set<string>();
    for (const b of p.buildings) {
      seen.add(b.id);
      const def = defOf(b);
      const [w, h] = def.footprint;
      const built = isBuilt(b);
      const z = this.hz(p, b.x, b.y);
      const progBand = built ? 10 : Math.floor((b.buildProgress / requiredTicks(b)) * 10);
      const wearBand = conditionBand(b.condition);
      const lookKey = b.look ? JSON.stringify(b.look) : '';
      const sig = `${b.definitionId}|${b.level}|${progBand}|${wearBand}|${b.style}|${lookKey}|${season}|${detail}|${z}`;

      let bv = this.buildingViews.get(b.id);
      if (!bv) {
        const c = new Container();
        c.cullable = true;
        const body = new Container();
        const glow = new Graphics();
        const g = new Graphics();
        const extra = new Graphics();
        body.addChild(g);
        c.addChild(body, glow, extra);
        this.objects.addChild(c);
        bv = {
          c,
          body,
          glow,
          g,
          extra,
          flags: [],
          mask: null,
          info: { lights: [], smoke: [], flags: [], height: 40 },
          sig: '',
          smokeTimer: 0,
        };
        this.buildingViews.set(b.id, bv);
      }

      bv.c.position.set(isoX(b.x, b.y), isoY(b.x, b.y) - z);
      bv.c.zIndex = b.x + b.y + w + h - 1;

      if (bv.sig !== sig) {
        bv.sig = sig;
        bv.body.cacheAsTexture(false);
        bv.g.clear();
        bv.glow.clear();
        if (bv.mask) {
          bv.body.mask = null;
          bv.mask.destroy();
          bv.mask = null;
        }
        const ratio = b.buildProgress / requiredTicks(b);
        const seed = buildingArtSeed(b.id);
        bv.info = built
          ? drawStyledBuilding(bv.g, b, pal, detail, seed, isOperating(b))
          : drawStyledConstruction(bv.g, w, h, ratio, b.style, detail, seed);
        for (const poly of bv.info.lights) {
          bv.glow.poly(poly.flat()).fill({ color: COLORS.windowGlow, alpha: 0.9 });
        }
        if (this.opts.cacheBodies && built) bv.body.cacheAsTexture({ resolution: 2, antialias: true });
        this.tintKey = -1;
      }

      this.drawBuildingBadges(bv, b, w, h);

      if (tickFlags && built) {
        bv.info.flags.forEach((a, idx) => {
          const fg = bv!.flags[idx];
          if (fg) drawFlag(fg, this.time / 180 + b.x, a.color ?? CULTURES[b.style].flag);
        });
      }

      // Chimney smoke when operating
      if (motion && built && isOperating(b) && bv.info.smoke.length > 0) {
        bv.smokeTimer += dt;
        if (bv.smokeTimer > 520 && this.particles.length < 70) {
          bv.smokeTimer = 0;
          const s = bv.info.smoke[Math.floor(Math.random() * bv.info.smoke.length)]!;
          const pg = new Graphics();
          pg.circle(0, 0, 3.2).fill({ color: COLORS.smoke, alpha: 0.55 });
          pg.position.set(bv.c.x + s[0], bv.c.y + s[1]);
          pg.zIndex = bv.c.zIndex + 0.1;
          this.objects.addChild(pg);
          this.particles.push({ g: pg, life: 1 });
        }
      }
    }

    for (const [id, bv] of this.buildingViews) {
      if (!seen.has(id)) {
        bv.c.destroy({ children: true });
        this.buildingViews.delete(id);
      }
    }
  }

  private drawBuildingBadges(bv: BuildingView, b: BuildingInstance, w: number, h: number): void {
    const extra = bv.extra;
    extra.clear();
    const top = P(w / 2, h / 2, bv.info.height + 8);

    if (!isBuilt(b)) {
      const ratio = Math.min(1, b.buildProgress / requiredTicks(b));
      // wooden scaffolding poles around footprint
      const corners: [number, number][] = [
        [0.08, h - 0.08],
        [w - 0.08, h - 0.08],
        [w - 0.08, 0.08],
      ];
      for (const [u, v] of corners) {
        const p0 = P(u, v, 0);
        const p1 = P(u, v, bv.info.height * 0.75);
        extra.moveTo(p0[0], p0[1]).lineTo(p1[0], p1[1]).stroke({ color: COLORS.woodDark, width: 2 });
      }
      for (let z = 12; z < bv.info.height * 0.7; z += 14) {
        const l = P(0.08, h - 0.08, z);
        const m = P(w - 0.08, h - 0.08, z);
        const r = P(w - 0.08, 0.08, z);
        extra
          .moveTo(l[0], l[1])
          .lineTo(m[0], m[1])
          .lineTo(r[0], r[1])
          .stroke({ color: COLORS.woodDark, width: 1.5 });
      }
      extra.roundRect(top[0] - 18, top[1], 36, 7, 3).fill({ color: 0x2a2118, alpha: 0.85 });
      extra.roundRect(top[0] - 16, top[1] + 2, Math.max(1, 32 * ratio), 3, 1.5).fill(0x8fe06a);
    }

    // status badges: distinct shape + colour so they do not rely on colour alone
    const bx = top[0];
    const by = top[1] - 10;
    if (!b.connected) {
      extra
        .poly([bx, by - 9, bx + 9, by, bx, by + 9, bx - 9, by])
        .fill(COLORS.bad)
        .stroke({ color: 0xffffff, width: 1.5 });
      extra
        .moveTo(bx - 3, by - 3)
        .lineTo(bx + 3, by + 3)
        .moveTo(bx + 3, by - 3)
        .lineTo(bx - 3, by + 3)
        .stroke({ color: 0xffffff, width: 2 });
    } else if (isBuilt(b) && b.unpaid) {
      extra
        .roundRect(bx - 8, by - 8, 16, 16, 3)
        .fill(0xe08a2e)
        .stroke({ color: 0xffffff, width: 1.5 });
      extra.circle(bx, by, 4).stroke({ color: 0xffffff, width: 2 });
    } else if (isBuilt(b) && specOf(b).workerSlots > 0 && b.workers === 0) {
      extra.circle(bx, by, 8).fill(0xf2c230).stroke({ color: 0xffffff, width: 1.5 });
      extra.roundRect(bx - 1.3, by - 5, 2.6, 6, 1).fill(0x3a2a1c);
      extra.circle(bx, by + 4, 1.4).fill(0x3a2a1c);
    }

    const anchors = isBuilt(b) ? bv.info.flags : [];
    while (bv.flags.length < anchors.length) {
      const fg = new Graphics();
      bv.c.addChild(fg);
      bv.flags.push(fg);
    }
    bv.flags.forEach((fg, i) => {
      const a = anchors[i];
      fg.visible = !!a;
      if (a) {
        fg.position.set(a.at[0], a.at[1]);
        drawFlag(fg, 0, a.color ?? CULTURES[b.style].flag);
      }
    });
  }

  /** Pre-rendered texture for a repeated prop (trees, rocks): one draw call batch, not a Graphics each. */
  private sprite(key: string, draw: (g: Graphics) => void): Sprite {
    let entry = this.atlas.get(key);
    if (!entry) {
      const g = new Graphics();
      draw(g);
      const bounds = g.getLocalBounds();
      const tex = this.app.renderer.generateTexture({ target: g, resolution: 2, antialias: true });
      g.destroy();
      entry = { tex, x: bounds.x, y: bounds.y };
      this.atlas.set(key, entry);
    }
    const s = new Sprite(entry.tex);
    s.position.set(entry.x, entry.y);
    return s;
  }

  /** Frees textures of other seasons once nothing uses them. */
  private pruneAtlas(season: Season): void {
    for (const [key, entry] of this.atlas) {
      if (key.startsWith('tree|') && !key.startsWith(`tree|${season}|`)) {
        entry.tex.destroy(true);
        this.atlas.delete(key);
      }
    }
  }

  /** Day/night: tints the world (not the window glows) and fades lit windows in. */
  private updateLight(view: RendererView, hour: number, dt: number): void {
    const target = view.dayNight ? nightFactor(hour) : 0;
    const rate = view.reducedMotion ? 1 : Math.min(1, dt / 420);
    this.night += (target - this.night) * rate;
    if (Math.abs(this.night - target) < 0.004) this.night = target;
    const key = Math.round(this.night * 40) + (this.dropKind === 'overcast' || this.dropKind === 'rain' ? 100 : 0);
    if (key === this.tintKey) return;
    this.tintKey = key;
    let tint = mix(0xffffff, 0x283959, this.night * 0.92);
    if (this.dropKind === 'overcast' || this.dropKind === 'rain') tint = mix(tint, 0xb8c0c8, 0.25);
    this.ground.tint = tint;
    this.waterFx.tint = tint;
    this.workScenes.setTint(tint);
    this.frontier.setTint(tint);
    for (const pv of this.propViews.values()) pv.c.tint = tint;
    for (const w of this.walkers) w.c.tint = tint;
    for (const w of this.matchFans) w.c.tint = tint;
    for (const car of this.trafficCars) car.c.tint = tint;
    for (const guard of this.militiaSprites) guard.tint = tint;
    for (const b of this.boats) b.c.tint = tint;
    for (const bird of this.birds) bird.c.tint = tint;
    for (const bv of this.buildingViews.values()) {
      bv.body.tint = tint;
      bv.glow.tint = 0xffffff;
      bv.glow.alpha = Math.min(0.65, this.night * 0.65);
      // Do not light unbuilt or road-disconnected buildings.
      bv.glow.visible = this.night > 0.02 && bv.info.lights.length > 0;
    }
  }

  /** Rain and snow in screen space; deterministic per day, purely visual. */
  private updateWeather(view: RendererView, day: number, season: Season, dt: number, motion: boolean): void {
    const kind: Weather = view.weather ? weatherFor(view.game.seed, day, season) : 'clear';
    const { width, height } = this.app.screen;
    const want = !motion || (kind !== 'rain' && kind !== 'snow') ? 0 : Math.round((width * height) / (kind === 'rain' ? 7000 : 9000) * (this.opts.cacheBodies ? 0.5 : 1));
    if (kind !== this.dropKind) {
      for (const d of this.drops) d.g.destroy();
      this.drops = [];
      this.dropKind = kind;
      this.tintKey = -1;
    }
    while (this.drops.length < want) {
      const g = new Graphics();
      if (kind === 'rain') g.moveTo(0, 0).lineTo(-2, 9).stroke({ color: 0xcfe3f2, width: 1.1, alpha: 0.55 });
      else g.circle(0, 0, 1.6 + Math.random()).fill({ color: 0xffffff, alpha: 0.9 });
      const d = { g, x: Math.random() * width, y: Math.random() * height, v: kind === 'rain' ? 0.55 + Math.random() * 0.25 : 0.035 + Math.random() * 0.03, d: Math.random() * 6 };
      g.position.set(d.x, d.y);
      this.fx.addChild(g);
      this.drops.push(d);
    }
    while (this.drops.length > want) this.drops.pop()!.g.destroy();
    const speed = Math.max(0.6, SPEED_FACTOR[view.game.speed] ?? 1);
    for (const d of this.drops) {
      d.y += d.v * dt * speed;
      d.x += kind === 'rain' ? -0.12 * dt * speed : Math.sin(this.time / 900 + d.d) * 0.25;
      if (d.y > height + 10) {
        d.y = -10;
        d.x = Math.random() * width;
      }
      if (d.x < -10) d.x = width + 5;
      d.g.position.set(d.x, d.y);
    }
  }

  /** Auto quality: a sustained low frame rate asks the app to step quality down. */
  private watchFps(view: RendererView): void {
    if (!view.autoQuality) return;
    this.fpsSamples.push(this.app.ticker.FPS);
    if (this.fpsSamples.length < 300) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples = [];
    if (avg < 30 && this.time - this.lowFpsAt > 20000) {
      this.lowFpsAt = this.time;
      this.cb.onLowFps?.(Math.round(avg));
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i]!;
      part.life -= dt / 2600;
      part.g.y -= dt * 0.012;
      part.g.x += dt * 0.004;
      part.g.alpha = Math.max(0, part.life) * 0.7;
      part.g.scale.set(1 + (1 - part.life) * 1.6);
      if (part.life <= 0) {
        part.g.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  /** Seagull / bird flocks circling over the coast and valley center. */
  private updateBirds(p: Province, dt: number, motion: boolean): void {
    const desired = 7;
    while (this.birds.length < desired) {
      const i = this.birds.length;
      const c = new Container();
      const g = new Graphics();
      drawBird(g, i);
      c.addChild(g);
      c.cullable = true;
      this.objects.addChild(c);
      this.birds.push({
        c,
        g,
        cx: p.width * (0.28 + ((i * 19) % 44) / 100),
        cy: p.height * (0.24 + ((i * 29) % 48) / 100),
        rx: 4.2 + (i % 4) * 1.5,
        ry: 3.4 + ((i + 2) % 4) * 1.3,
        angle: (i * Math.PI * 2) / desired,
        speed: 0.26 + (i % 3) * 0.06,
        phase: i * 1.2,
      });
    }
    const sec = motion ? dt / 1000 : 0;
    for (const b of this.birds) {
      b.angle += sec * b.speed;
      const fx = b.cx + Math.cos(b.angle) * b.rx;
      const fy = b.cy + Math.sin(b.angle) * b.ry;
      if (motion) drawBird(b.g, this.time / 110 + b.phase);
      b.c.position.set(isoX(fx, fy), isoY(fx, fy) - 52 + Math.sin(this.time / 650 + b.phase) * 3.5);
      b.c.zIndex = fx + fy + 80;
    }
  }

  private spawnWalker(cart: boolean, fanMatch?: MatchDay, index = 0): Walker | null {
    const starts = fanMatch && this.pavedRoadTiles.length ? this.pavedRoadTiles : this.roadTiles;
    if (!starts.length) return null;
    const start = starts[Math.floor(Math.random() * starts.length)]!;
    const c = new Container();
    const g = new Graphics();
    if (fanMatch) drawFootballSupporter(g, fanMatch, index);
    else if (cart) drawCart(g, [0xb98a5a, 0xe2bb45, 0x9aa0a6][Math.floor(Math.random() * 3)]!);
    else drawVillager(g, VILLAGER_COLORS[Math.floor(Math.random() * VILLAGER_COLORS.length)]!, Math.floor(Math.random() * 8));
    c.addChild(g);
    const flare = fanMatch ? new Graphics() : undefined;
    if (flare) c.addChild(flare);
    c.scale.set(cart ? 0.82 : fanMatch ? 0.84 : 0.66);
    c.cullable = true;
    this.objects.addChild(c);
    this.tintKey = -1;
    return {
      c,
      from: [start[0], start[1]],
      to: [start[0], start[1]],
      prev: [start[0], start[1]],
      t: 1,
      speed: fanMatch ? 0.48 + Math.random() * 0.26 : cart ? 0.55 : 0.7 + Math.random() * 0.4,
      phase: Math.random() * 6,
      side: (Math.random() < 0.5 ? -1 : 1) * (2.5 + Math.random() * 2),
      cart,
      fan: !!fanMatch,
      flare,
    };
  }

  /**
   * Local militia visually follows connected roads (BFS), respecting the city's
   * road network instead of cutting through buildings or water.
   * Abstract tactical patrols are kept separate from the economy clock.
   */
  private updateMilitia(view: RendererView, p: Province, dt: number): void {
    const count = Math.min(8, Math.ceil((view.game.militia ?? 0) / 5));
    while (this.militiaSprites.length > count) {
      this.militiaSprites.pop()!.destroy({ children: true });
    }
    while (this.militiaSprites.length < count) {
      const i = this.militiaSprites.length;
      const c = new Container();
      const soldier = new Graphics();
      drawVillager(soldier, i % 2 ? 0x416080 : 0x385675, i + 1);
      soldier.ellipse(0, -15.3, 3.6, 1.4).fill(0x333a48);
      soldier.moveTo(4.4, -9).lineTo(4.4, -2).stroke({ color: 0x858c96, width: 1 });
      soldier.circle(-3.5, -6, 2.3).fill({ color: 0x65778b, alpha: 0.9 });
      c.addChild(soldier);
      c.scale.set(0.68);
      c.cullable = true;
      this.objects.addChild(c);
      this.militiaSprites.push(c);
    }
    if (!count || !this.roadTiles.length) return;
    const goal = view.game.armyTarget;
    if (this.militiaPos === null) {
      this.militiaPos = goal ? [goal.x, goal.y] : this.roadTiles[0]!;
      this.militiaTargetKey = goal ? `${goal.x},${goal.y}` : '';
    }
    const key = goal ? `${goal.x},${goal.y}` : '';
    if (key !== this.militiaTargetKey) {
      this.militiaTargetKey = key;
      this.militiaRoute = goal
        ? findRoadPath(p, this.militiaPos, [goal.x, goal.y]) ?? []
        : [];
      this.militiaRouteStep = 0;
      this.militiaRouteT = 0;
    }
    let pos: GridPoint = this.militiaPos;
    if (this.militiaRoute.length > 1 && this.militiaRouteStep < this.militiaRoute.length - 1) {
      if (view.game.speed !== 0 && !view.reducedMotion) this.militiaRouteT += dt / 650;
      while (this.militiaRouteT >= 1 && this.militiaRouteStep < this.militiaRoute.length - 1) {
        this.militiaRouteT -= 1;
        this.militiaRouteStep++;
      }
      const curr = this.militiaRoute[this.militiaRouteStep]!;
      const next = this.militiaRoute[Math.min(this.militiaRouteStep + 1, this.militiaRoute.length - 1)]!;
      this.militiaPos = curr;
      pos = [curr[0] + (next[0] - curr[0]) * this.militiaRouteT,
        curr[1] + (next[1] - curr[1]) * this.militiaRouteT];
      if (this.militiaRouteStep >= this.militiaRoute.length - 1) {
        pos = next;
        this.militiaPos = next;
        this.militiaRoute = [];
      }
    }
    const z = this.hz(p, Math.floor(pos[0]), Math.floor(pos[1]));
    for (let i = 0; i < this.militiaSprites.length; i++) {
      const c = this.militiaSprites[i]!;
      const ox = (i % 4 - 1.5) * 5.5;
      const oy = Math.floor(i / 4) * 4;
      c.position.set(isoX(pos[0] + 0.5, pos[1] + 0.5) + ox,
        isoY(pos[0] + 0.5, pos[1] + 0.5) + oy - z);
      c.zIndex = pos[0] + pos[1] + 0.15 + i * 0.001;
    }
  }

  /** The city's fleet sails the lake and sea smoothly along forward-preferring sea routes. */
  private updateBoats(view: RendererView, p: Province, dt: number, motion: boolean): void {
    const want: ('fishing' | 'cargo' | 'yacht')[] = [];
    for (const kind of ['fishing', 'cargo', 'yacht'] as const)
      for (let i = 0; i < Math.min(3, view.game.shipyard.fleet[kind]); i++) want.push(kind);
    const sig = want.join(',');
    if (sig !== this.boats.map((b) => b.kind).join(',')) {
      for (const b of this.boats) b.c.destroy({ children: true });
      this.boats = [];
      const lake = this.waterTiles.filter(([x, y]) => tileAt(p, x, y)?.terrain === 'lake');
      const pool = lake.length ? lake : this.waterTiles;
      want.forEach((kind, i) => {
        const at = pool[(i * 7) % Math.max(1, pool.length)];
        if (!at) return;
        const c = new Container();
        const g = new Graphics();
        drawBoat(g, kind);
        c.addChild(g);
        c.cullable = true;
        this.objects.addChild(c);
        this.boats.push({ c, kind, px: at[0], py: at[1], x: at[0], y: at[1], tx: at[0], ty: at[1], t: 1 });
      });
    }
    const baseStep = motion ? (dt / 1000) * 0.38 * (SPEED_FACTOR[view.game.speed] ?? 0) : 0;
    const isWater = (x: number, y: number): boolean => {
      const t = tileAt(p, x, y);
      return !!t && (t.terrain === 'lake' || t.terrain === 'water') && !t.road;
    };
    for (const b of this.boats) {
      const speedMult = b.kind === 'fishing' ? 1.15 : b.kind === 'yacht' ? 1.0 : 0.82;
      b.t += baseStep * speedMult;
      if (b.t >= 1) {
        const prevDx = b.tx - b.x;
        const prevDy = b.ty - b.y;
        b.px = b.x;
        b.py = b.y;
        b.x = b.tx;
        b.y = b.ty;
        const options = NEIGHBORS4.map(([dx, dy]) => [b.x + dx, b.y + dy] as [number, number]).filter(([x, y]) => isWater(x, y));
        // Prefer continuing straight ahead on open water, then gentle turns, avoiding abrupt 180-degree reversals
        const straight = options.filter(([x, y]) => x - b.x === prevDx && y - b.y === prevDy);
        const forward = options.filter(([x, y]) => x !== b.px || y !== b.py);
        const pool = straight.length && Math.random() < 0.72 ? straight : forward.length ? forward : options;
        const next = pool.length ? pool[Math.floor(Math.random() * pool.length)]! : [b.x, b.y];
        b.tx = next[0];
        b.ty = next[1];
        b.t = 0;
      }
      const fx = b.x + (b.tx - b.x) * b.t + 0.5;
      const fy = b.y + (b.ty - b.y) * b.t + 0.5;
      const waveBob = Math.sin(this.time / 420 + b.x * 0.8 + b.y * 0.5) * 1.05;
      b.c.position.set(isoX(fx, fy), isoY(fx, fy) + waveBob);
      b.c.zIndex = fx + fy;
      const isoDx = (b.tx - b.x) - (b.ty - b.y);
      const isoDy = (b.tx - b.x) + (b.ty - b.y);
      if (isoDx !== 0) b.c.scale.x = isoDx < 0 ? -1 : 1;
      b.c.rotation = (isoDy * 0.12 * b.c.scale.x) + (motion ? Math.sin(this.time / 520 + b.x) * 0.035 : 0);
    }
  }

  /** Visual-only villagers and carts wandering the road network. The economy never reads them. */
  private updateWalkers(view: RendererView, p: Province, dt: number, motion: boolean): void {
    const wantVillagers = Math.min(10, Math.max(0, Math.floor(totalPopulation(p) / 2) - this.workScenes.count));
    const wantCarts = Math.min(3, p.buildings.filter((b) => specOf(b).produces && isOperating(b)).length);
    const count = (cart: boolean): number => this.walkers.filter((w) => w.cart === cart).length;
    for (const cart of [false, true]) {
      const want = cart ? wantCarts : wantVillagers;
      while (count(cart) < want) {
        const w = this.spawnWalker(cart);
        if (!w) break;
        this.walkers.push(w);
      }
      while (count(cart) > want) {
        const i = this.walkers.findIndex((w) => w.cart === cart);
        this.walkers[i]!.c.destroy({ children: true });
        this.walkers.splice(i, 1);
      }
    }
    // Match Days: 10 supporters march together as a single synchronized cortege (5 rows x 2 columns)
    // waving team flags and holding burning flares with dense billowing smoke!
    const match = matchDayFor(view.game);
    const key = match ? `${match.team}:${match.day}` : '';
    if (this.activeFanMatch !== key) {
      for (const fan of this.matchFans) fan.c.destroy({ children: true });
      this.matchFans = [];
      this.activeFanMatch = key;
      if (match) {
        const fans = 10;
        let leaderStart: [number, number] | null = null;
        for (let i = 0; i < fans; i++) {
          const fan = this.spawnWalker(false, match, i);
          if (!fan) continue;
          if (!leaderStart) leaderStart = [fan.from[0], fan.from[1]];
          fan.from = [leaderStart[0], leaderStart[1]];
          fan.to = [leaderStart[0], leaderStart[1]];
          fan.prev = [leaderStart[0], leaderStart[1]];
          fan.speed = 0.56;
          fan.phase = i * 0.65;
          this.matchFans.push(fan);
        }
      }
    }
    const isRoad = (x: number, y: number): boolean => !!tileAt(p, x, y)?.road;
    // Movement animation stays comfortable even at 4x world-simulation speed.
    const step = motion ? (dt / 1000) * Math.min(1.35, SPEED_FACTOR[view.game.speed] ?? 0) : 0;
    for (const w of this.walkers) {
      if (!isRoad(w.to[0], w.to[1]) && this.roadTiles.length) {
        const r = this.roadTiles[Math.floor(Math.random() * this.roadTiles.length)]!;
        w.from = [r[0], r[1]];
        w.to = [r[0], r[1]];
        w.t = 1;
      }
      w.t += step * w.speed;
      if (w.t >= 1) {
        const options = (
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const
        )
          .map(([dx, dy]) => [w.to[0] + dx, w.to[1] + dy] as [number, number])
          .filter(([x, y]) => isRoad(x, y));
        const forward = options.filter(([x, y]) => x !== w.from[0] || y !== w.from[1]);
        const pool = forward.length ? forward : options;
        w.prev = w.from;
        w.from = w.to;
        if (pool.length) w.to = pool[Math.floor(Math.random() * pool.length)]!;
        w.t = 0;
      }
      const fx = w.from[0] + (w.to[0] - w.from[0]) * w.t + 0.5;
      const fy = w.from[1] + (w.to[1] - w.from[1]) * w.t + 0.5;
      const bob = step > 0 && !w.cart ? Math.sin(this.time / 90 + w.phase) * 0.9 : 0;
      const lift = this.hz(p, w.from[0], w.from[1]) * (1 - w.t) + this.hz(p, w.to[0], w.to[1]) * w.t;
      const dx = w.to[0] - w.from[0];
      const dy = w.to[1] - w.from[1];
      const paved = !!tileAt(p, w.from[0], w.from[1])?.paved && !!tileAt(p, w.to[0], w.to[1])?.paved;
      const sidewalk = paved && !w.cart && (dx !== 0 || dy !== 0);
      const [wx, wy] = sidewalk ? pedestrianSidewalkOffset(dx, dy, w.side) : [0, 0];
      w.c.position.set(
        isoX(fx + wx, fy + wy) + (sidewalk ? 0 : w.side),
        isoY(fx + wx, fy + wy) + bob + (sidewalk ? 0 : w.side * 0.25) - lift,
      );
      w.c.zIndex = fx + fy + 0.015;
      if (w.cart) w.c.scale.x = dx - dy < 0 ? -1 : 1;
    }

    // Update the 10-supporter match-day cortege marching together as a single convoy
    if (this.matchFans.length > 0 && match) {
      const leader = this.matchFans[0]!;
      if (!isRoad(leader.to[0], leader.to[1]) && this.roadTiles.length) {
        const starts = this.pavedRoadTiles.length ? this.pavedRoadTiles : this.roadTiles;
        const r = starts[Math.floor(Math.random() * starts.length)]!;
        leader.from = [r[0], r[1]];
        leader.to = [r[0], r[1]];
        leader.prev = [r[0], r[1]];
        leader.t = 1;
      }
      leader.t += step * leader.speed;
      if (leader.t >= 1) {
        const options = (
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const
        )
          .map(([dx, dy]) => [leader.to[0] + dx, leader.to[1] + dy] as [number, number])
          .filter(([x, y]) => isRoad(x, y));
        const forward = options.filter(([x, y]) => x !== leader.from[0] || y !== leader.from[1]);
        const eligible = forward.filter(([x, y]) => tileAt(p, x, y)?.paved);
        const pool = eligible.length ? eligible : forward.length ? forward : options;
        leader.prev = leader.from;
        leader.from = leader.to;
        if (pool.length) leader.to = pool[Math.floor(Math.random() * pool.length)]!;
        leader.t = 0;
      }
      const dx = leader.to[0] - leader.from[0];
      const dy = leader.to[1] - leader.from[1];
      const baseFx = leader.from[0] + dx * leader.t + 0.5;
      const baseFy = leader.from[1] + dy * leader.t + 0.5;
      const lift =
        this.hz(p, leader.from[0], leader.from[1]) * (1 - leader.t) +
        this.hz(p, leader.to[0], leader.to[1]) * leader.t;
      const dirX = dx || (leader.from[0] - leader.prev[0]) || 1;
      const dirY = dy || (leader.from[1] - leader.prev[1]) || 0;
      const perpX = -dirY;
      const perpY = dirX;

      this.matchFans.forEach((fan, idx) => {
        const row = Math.floor(idx / 2); // 0..4 (5 rows)
        const col = (idx % 2) === 0 ? -1 : 1; // 2 columns marching side by side
        const alongOffset = -row * 0.16;
        const sideOffset = col * 0.11;
        const fx = baseFx + dirX * alongOffset + perpX * sideOffset;
        const fy = baseFy + dirY * alongOffset + perpY * sideOffset;
        const bob = step > 0 ? Math.sin(this.time / 75 + fan.phase) * 1.3 : 0;
        const sx = isoX(fx, fy);
        const sy = isoY(fx, fy) + bob - lift;
        fan.c.position.set(sx, sy);
        fan.c.zIndex = fx + fy + 0.03 + idx * 0.001;
        if (fan.flare) {
          drawSupporterFlare(fan.flare, motion ? this.time : 0, fan.phase, match.jersey, match.stripe);
        }
        // Emit dense world-space flare smoke particles rising above the cortege
        if (motion && step > 0 && this.particles.length < 95 && Math.random() < 0.22) {
          const pg = new Graphics();
          const smokeCol = idx % 3 === 0 ? match.jersey : idx % 3 === 1 ? match.stripe : 0xe2e8f0;
          pg.circle(0, 0, 3.8 + Math.random() * 3.5).fill({ color: smokeCol, alpha: 0.55 });
          pg.position.set(sx + 4 + (Math.random() - 0.5) * 6, sy - 22 - Math.random() * 6);
          pg.zIndex = fx + fy + 25;
          this.objects.addChild(pg);
          this.particles.push({ g: pg, life: 0.85 + Math.random() * 0.45 });
        }
      });
    }
  }

  /**
   * Small visual traffic sim: vehicles only spawn on linked paved streets,
   * stay on their legal road tiles and use opposite lanes for UK vs Türkiye.
   * It deliberately does not drive on stairs, bridges or mountain trails.
   */
  private updateTraffic(view: RendererView, p: Province, dt: number, motion: boolean): void {
    const isPaved = (x: number, y: number): boolean => {
      const t = tileAt(p, x, y);
      return !!t?.road && (t.roadType === 'bridge' || (!!t.paved && t.roadType === 'dirt'));
    };
    const neighbors = (x: number, y: number): [number, number][] =>
      (NEIGHBORS4.map(([dx, dy]) => [x + dx, y + dy] as [number, number]))
        .filter(([nx, ny]) =>
          isPaved(nx, ny) &&
          tileAt(p, nx, ny)?.height === tileAt(p, x, y)?.height);
    const linked = this.roadTiles.filter(([x, y]) => neighbors(x, y).length > 0);
    const desired = Math.min(8, Math.floor(linked.length / 4));
    // Deleted or demolished paved roads must immediately release their cars.
    for (let i = this.trafficCars.length - 1; i >= 0; i--) {
      const car = this.trafficCars[i]!;
      if (!isPaved(car.from[0], car.from[1]) || !isPaved(car.to[0], car.to[1])) {
        car.c.destroy({ children: true });
        this.trafficCars.splice(i, 1);
      }
    }
    while (this.trafficCars.length > desired) this.trafficCars.pop()!.c.destroy({ children: true });
    let attempts = 0;
    while (this.trafficCars.length < desired && attempts++ < 18) {
      if (!linked.length) break;
      const start = linked[Math.floor(Math.random() * linked.length)]!;
      const possible = neighbors(start[0], start[1]);
      if (!possible.length) continue;
      if (this.trafficCars.some((car) => car.from[0] === start[0] && car.from[1] === start[1])) continue;
      const to = possible[Math.floor(Math.random() * possible.length)]!;
      const holder = new Container();
      const body = new Graphics();
      const paints = [0xe4e7ec, 0xbe4741, 0x345a89, 0x364b54, 0xe4b755, 0x7d9a75];
      const paint = paints[this.trafficCars.length % paints.length]!;
      const electric = this.trafficCars.length % 3 === 0;
      const variant = (start[0] * 5 + start[1] * 7 + this.trafficCars.length) % 6;
      const dx = to[0] - start[0], dy = to[1] - start[1];
      drawCityCar(body, paint, electric, dx, dy, variant);
      holder.addChild(body);
      holder.cullable = true;
      this.objects.addChild(holder);
      this.trafficCars.push({
        c: holder, sprite: body, paint, electric, variant, heading: `${dx},${dy}`,
        from: [start[0], start[1]], to,
        prev: [start[0], start[1]], t: 0,
        speed: 0.5 + Math.random() * 0.24,
      });
    }
    const uk = view.game.cityId === 'edinburgh' ||
      (!view.game.cityId && view.game.culture === 'scottish');
    for (const car of this.trafficCars) {
      if (!isPaved(car.from[0], car.from[1]) || !isPaved(car.to[0], car.to[1])) {
        car.c.visible = false;
        car.t = 1;
        continue;
      }
      car.c.visible = true;
      const carAhead = this.trafficCars.some((other) =>
        other !== car && other.from[0] === car.from[0] &&
        other.from[1] === car.from[1] && other.to[0] === car.to[0] &&
        other.to[1] === car.to[1] && other.t > car.t && other.t - car.t < 0.36);
      if (!carAhead && motion && view.game.speed !== 0)
        car.t += Math.min(0.12, dt / 1000) * car.speed;
      if (car.t >= 1) {
        car.prev = car.from;
        car.from = car.to;
        const directions = neighbors(car.from[0], car.from[1]);
        const forward = directions.filter(([x, y]) => x !== car.prev[0] || y !== car.prev[1]);
        const choice = forward.length ? forward : directions;
        car.to = choice.length ? choice[Math.floor(Math.random() * choice.length)]! : car.from;
        car.t = 0;
      }
      const dx = car.to[0] - car.from[0];
      const dy = car.to[1] - car.from[1];
      const heading = `${dx},${dy}`;
      if (car.heading !== heading && (dx !== 0 || dy !== 0)) {
        car.sprite.clear();
        drawCityCar(car.sprite, car.paint, car.electric, dx, dy, car.variant);
        car.heading = heading;
      }
      const x = car.from[0] + dx * car.t + 0.5;
      const y = car.from[1] + dy * car.t + 0.5;
      const prevDx = car.from[0] - car.prev[0];
      const prevDy = car.from[1] - car.prev[1];
      const [laneX, laneY] = smoothVehicleTurnOffset(prevDx, prevDy, dx, dy, car.t, uk);
      const lift = this.hz(p, car.from[0], car.from[1]);
      car.c.position.set(
        isoX(x + laneX, y + laneY),
        isoY(x + laneX, y + laneY) - lift + (motion ? Math.sin(this.time / 330 + car.t) * 0.23 : 0),
      );
      car.c.zIndex = x + y + 0.035;
    }
  }

  private outline(
    g: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    width: number,
    alpha: number,
  ): void {
    const z = this.prov ? this.hz(this.prov, Math.max(0, Math.min(this.size - 1, x)), Math.max(0, Math.min(this.size - 1, y))) : 0;
    const a = P(x, y, z);
    const b = P(x + w, y, z);
    const c = P(x + w, y + h, z);
    const d = P(x, y + h, z);
    g.poly([a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]]).stroke({ color, width, alpha });
  }

  private tileFill(g: Graphics, x: number, y: number, color: number, alpha: number): void {
    const a = P(x, y, this.prov ? this.hz(this.prov, x, y) : 0);
    g.poly([a[0], a[1], a[0] + 32, a[1] + 16, a[0], a[1] + 32, a[0] - 32, a[1] + 16]).fill({ color, alpha });
  }

  private drawRange(g: Graphics, p: Province, id: BuildingId, x: number, y: number): void {
    const def = BUILDINGS[id];
    if (def.services?.patrolRadius) {
      const [w, h] = def.footprint;
      const r = def.services.patrolRadius;
      for (let dy = -r; dy < h + r; dy++) {
        for (let dx = -r; dx < w + r; dx++) {
          const distance = Math.max(-dx, dx - w + 1, 0) + Math.max(-dy, dy - h + 1, 0);
          if (distance <= r && tileAt(p, x + dx, y + dy))
            this.tileFill(g, x + dx, y + dy, COLORS.range, 0.23);
        }
      }
    }
    if (!def.harvests) return;
    const r = def.harvests.radius;
    this.outline(g, x - r, y - r, def.footprint[0] + 2 * r, def.footprint[1] + 2 * r, COLORS.range, 2, 0.7);
    for (const i of tilesInRange(p, def, x, y)) {
      if (p.tiles[i]!.deposit > 0) this.tileFill(g, i % p.width, Math.floor(i / p.width), COLORS.range, 0.32);
    }
  }

  private drawOverlays(view: RendererView, p: Province, pal: SeasonPalette): void {
    const g = this.under;
    g.clear();
    const { tool } = view;
    const hover = this.hover;
    let ghostSig = '';

    const selected = view.selectedBuildingId ? buildingById(p, view.selectedBuildingId) : undefined;
    if (selected) {
      const [w, h] = defOf(selected).footprint;
      this.drawRange(g, p, selected.definitionId, selected.x, selected.y);
      const pulse = view.reducedMotion ? 0.9 : 0.65 + Math.sin(this.time / 260) * 0.3;
      this.outline(g, selected.x, selected.y, w, h, COLORS.select, 3, pulse);
    }

    if (tool.kind === 'roadPlan') {
      const plan = view.roadPlan;
      if (plan) {
        const color = plan.error ? COLORS.bad : COLORS.ok;
        for (const { x, y, paved } of plan.tiles) {
          const routeColor = paved ? 0x58c6ce : color;
          this.tileFill(g, x, y, routeColor, 0.48);
          this.outline(g, x, y, 1, 1, routeColor, 2, 0.92);
        }
        for (const { x, y } of plan.paveTiles) {
          this.tileFill(g, x, y, 0x58c6ce, 0.48);
          this.outline(g, x, y, 1, 1, routeColor(true), 2, 0.92);
        }
        if (plan.blocked) {
          this.tileFill(g, plan.blocked.x, plan.blocked.y, COLORS.bad, 0.6);
        }
      }
      const anchor = tool.start ?? hover;
      if (anchor) this.outline(g, anchor.x, anchor.y, 1, 1, COLORS.select, 3, 0.95);
    } else if (hover) {
      if (tool.kind === 'build') {
        const def = BUILDINGS[tool.buildingId];
        const ok =
          validatePlacement(view.game, tool.buildingId, hover.x, hover.y, tool.style ?? view.game.culture, tool.look ?? null) ===
          null;
        this.drawRange(g, p, tool.buildingId, hover.x, hover.y);
        for (const [x, y] of footprintTiles(def, hover.x, hover.y)) {
          if (tileAt(p, x, y)) this.tileFill(g, x, y, ok ? COLORS.ok : COLORS.bad, 0.5);
        }
        this.outline(
          g,
          hover.x,
          hover.y,
          def.footprint[0],
          def.footprint[1],
          ok ? COLORS.ok : COLORS.bad,
          2,
          0.95,
        );
        ghostSig = `${tool.buildingId}|${hover.x}|${hover.y}|${ok}|${tool.style ?? ''}|${tool.look ? JSON.stringify(tool.look) : ''}`;
        if (ghostSig !== this.ghostSig) {
          this.ghost.clear();
          drawStyledBuilding(
            this.ghost,
            {
              definitionId: tool.buildingId,
              style: tool.style ?? view.game.culture,
              look: tool.look ?? null,
              level: 1,
              condition: 10000,
            },
            pal,
            view.detail,
            7,
          );
          this.ghost.position.set(isoX(hover.x, hover.y), isoY(hover.x, hover.y) - this.hz(p, hover.x, hover.y));
          this.ghost.alpha = ok ? 0.7 : 0.35;
        }
      } else if (tool.kind === 'pave') {
        const t = tileAt(p, hover.x, hover.y);
        const canPave = !!t?.road && t.roadType === 'dirt' && !t.paved;
        this.tileFill(g, hover.x, hover.y, canPave ? COLORS.ok : COLORS.bad, 0.44);
        this.outline(g, hover.x, hover.y, 1, 1, canPave ? COLORS.ok : COLORS.bad, 2, 0.92);
      } else if (tool.kind === 'road' || tool.kind === 'terrace') {
        const ok =
          tool.kind === 'road'
            ? checkRoadSite(p, hover.x, hover.y, 'dirt') === null
            : (() => {
                const t = tileAt(p, hover.x, hover.y);
                return !!t && !t.buildingId && !t.road && !t.terrace && t.terrain !== 'water' && t.terrain !== 'lake';
              })();
        this.tileFill(g, hover.x, hover.y, ok ? COLORS.ok : COLORS.bad, 0.44);
        this.outline(g, hover.x, hover.y, 1, 1, ok ? COLORS.ok : COLORS.bad, 2, 0.92);
      } else if (tool.kind === 'demolish') {
        const t = tileAt(p, hover.x, hover.y);
        const b = t?.buildingId ? buildingById(p, t.buildingId) : undefined;
        if (b && b.definitionId !== 'town_center') {
          const [w, h] = defOf(b).footprint;
          for (const [x, y] of footprintTiles(defOf(b), b.x, b.y)) {
            this.tileFill(g, x, y, COLORS.bad, 0.5);
          }
          this.outline(g, b.x, b.y, w, h, COLORS.bad, 3, 0.95);
        } else if (t?.road || t?.terrace || (t && !t.buildingId && (t.terrain === 'forest' || t.terrain === 'stone' || t.terrain === 'mountain'))) {
          this.tileFill(g, hover.x, hover.y, COLORS.bad, 0.5);
          this.outline(g, hover.x, hover.y, 1, 1, COLORS.bad, 2, 0.95);
        }
      } else {
        this.outline(g, hover.x, hover.y, 1, 1, 0xffffff, 1.5, 0.45);
      }
    }

    if (ghostSig !== this.ghostSig) {
      this.ghostSig = ghostSig;
      if (!ghostSig) this.ghost.clear();
    }
  }
}

const routeColor = (paved: boolean): number => (paved ? 0x58c6ce : COLORS.ok);