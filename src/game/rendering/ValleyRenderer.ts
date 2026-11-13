import 'pixi.js/unsafe-eval';
import { Application, Container, CullerPlugin, Graphics, Sprite, extensions } from 'pixi.js';
import type { Texture, Ticker } from 'pixi.js';
import { mix } from './arch/kit';
import { nightFactor, weatherFor } from './weather';
import type { Weather } from './weather';

extensions.add(CullerPlugin);
import { calendar, clockHour } from '../core/time';
import { advanceVisualHour } from './visualClock';
import type { Season } from '../core/time';
import type { ArchitectureStyle, BuildingId, BuildingInstance, BuildingLook, GameState, Province, Tile } from '../core/types';
import { FOREST_TILE_MAX, HEIGHT_PX, MAX_HEIGHT } from '../data/balance';
import { BUILDINGS, defOf, specOf } from '../data/buildings';
import { validatePlacement } from '../systems/commands';
import { homeProvince, isBuilt, isOperating, totalPopulation } from '../systems/economy';
import { NEIGHBORS4, buildingById, footprintTiles, tileAt, tilesInRange } from '../systems/grid';
import { checkRoadSite } from '../systems/placement';
import { requiredTicks } from '../systems/tick';
import { TH, TW, isoX, isoY, P, worldToTile } from './iso';
import { COLORS, SEASON_PALETTE, VILLAGER_COLORS } from './palette';
import type { SeasonPalette } from './palette';
import { drawBoat, drawCart, drawFlag, drawGroundTile, drawRocks, drawStump, drawTree, drawVillager } from './sprites';
import { drawStyledBuilding, drawStyledConstruction } from './arch/buildings';
import type { SpriteInfo } from './arch/buildings';
import { CULTURES } from '../data/architecture';
import { conditionBand } from '../systems/architecture';
import { findRoadPath } from './armyPath';
import { matchDayFor } from '../data/matchDays';
import type { MatchDay } from '../data/matchDays';
import { drawCityCar, drawFootballSupporter, drawSupporterFlare } from './trafficSprites';
import { pedestrianSidewalkOffset, vehicleLaneOffset } from './trafficMath';
import type { GridPoint } from './armyPath';

export type Tool =
  | { kind: 'select' }
  | { kind: 'build'; buildingId: BuildingId; style?: ArchitectureStyle; look?: BuildingLook | null }
  | { kind: 'road' }
  | { kind: 'pave' }
  | { kind: 'terrace' }
  | { kind: 'demolish' }
  | { kind: 'army' };

/** Detail level of procedural art: 0 flat, 1 materials, 2 fine texture. */
export type ArtDetail = 0 | 1 | 2;

const hashId = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

export interface RendererView {
  game: GameState;
  tool: Tool;
  selectedBuildingId: string | null;
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
  private objects = new Container();
  private ghost = new Graphics();
  private fx = new Container();
  private drops: { g: Graphics; x: number; y: number; v: number; d: number }[] = [];
  private dropKind: Weather = 'clear';
  private atlas = new Map<string, { tex: Texture; x: number; y: number }>();
  private night = 0;
  /** Visual-only sky clock; faster game speed never makes day/night strobe. */
  private visualHour: number | null = null;
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
  private boats: { c: Container; kind: 'fishing' | 'cargo' | 'yacht'; x: number; y: number; tx: number; ty: number; t: number }[] = [];
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

  static async create(host: HTMLElement, cb: RendererHost, opts?: Partial<RendererOptions>): Promise<ValleyRenderer> {
    const r = new ValleyRenderer(cb);
    r.opts = { ...r.opts, ...opts };
    await r.app.init({
      resizeTo: host,
      antialias: r.opts.antialias,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, r.opts.resolution),
      autoDensity: true,
      preference: 'webgl',
    });
    if (r.destroyed) {
      r.app.destroy({ removeView: true }, { children: true });
      return r;
    }
    r.ready = true;
    const canvas = r.app.canvas;
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    canvas.setAttribute('aria-label', 'Vadi haritası');
    host.appendChild(canvas);
    r.objects.sortableChildren = true;
    r.world.addChild(r.ground, r.waterFx, r.under, r.objects, r.ghost);
    r.app.stage.addChild(r.world, r.fx);
    r.bindInput(canvas);
    r.resetCamera();
    r.app.ticker.add(r.frame);
    return r;
  }

  destroy(): void {
    this.destroyed = true;
    for (const fn of this.cleanup) fn();
    if (this.ready) {
      this.app.ticker.remove(this.frame);
      for (const a of this.atlas.values()) a.tex.destroy(true);
      this.atlas.clear();
      // Never pass `true` as the first argument: it releases Pixi's global resources and breaks the
      // other live renderers (workshop preview, offscreen thumbnails).
      this.app.destroy({ removeView: true }, { children: true, texture: true });
    }
  }

  getStats(): RendererStats {
    return {
      fps: Math.round(this.app.ticker.FPS),
      night: Math.round(this.night * 100) / 100,
      weather: this.dropKind,
      textures: this.atlas.size,
      buildings: this.buildingViews.size,
      props: this.propViews.size,
      walkers: this.walkers.length,
      particles: this.particles.length,
    };
  }

  // ------------------------------------------------------------------ camera

  resetCamera(): void {
    const { width, height } = this.app.screen;
    // Fit the complete isometric diamond, including mountains, into the
    // available iframe/viewport. Keep room for the top HUD and bottom tools.
    const usableWidth = Math.max(160, width - 48);
    const usableHeight = Math.max(160, height - 146);
    const boundsWidth = this.size * TW;
    const boundsHeight = this.size * TH + MAX_HEIGHT * HEIGHT_PX;
    const scale = Math.max(MIN_ZOOM, Math.min(1.2, usableWidth / boundsWidth, usableHeight / boundsHeight));
    this.world.scale.set(scale);
    this.cameraViewport = { width, height };
    this.centerOnTile(this.size / 2, this.size / 2 + 0.5);
  }

  centerOnTile(x: number, y: number): void {
    const { width, height } = this.app.screen;
    const s = this.world.scale.x;
    this.world.position.set(width / 2 - isoX(x, y) * s, height / 2 - isoY(x, y) * s);
    this.clampCamera();
  }

  /** Client (viewport) coordinates of a tile centre — used by automated browser tests. */
  tileToClient(x: number, y: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const s = this.world.scale.x;
    const view = this.cb.getView();
    const h = view ? this.hz(homeProvince(view.game), x, y) : 0;
    return {
      x: rect.left + this.world.x + isoX(x + 0.5, y + 0.5) * s,
      y: rect.top + this.world.y + (isoY(x + 0.5, y + 0.5) - h) * s,
    };
  }

  /** Elevation of a tile in screen pixels. */
  private hz(p: Province, x: number, y: number): number {
    return (tileAt(p, x, y)?.height ?? 0) * HEIGHT_PX;
  }

  zoomBy(factor: number, sx = this.app.screen.width / 2, sy = this.app.screen.height / 2): void {
    const old = this.world.scale.x;
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, old * factor));
    const wx = (sx - this.world.x) / old;
    const wy = (sy - this.world.y) / old;
    this.world.scale.set(next);
    this.world.position.set(sx - wx * next, sy - wy * next);
    this.clampCamera();
  }

  panBy(dx: number, dy: number): void {
    this.world.x += dx;
    this.world.y += dy;
    this.clampCamera();
  }

  /** Keeps the valley on screen: the view centre may not leave the map's bounding box. */
  private clampCamera(): void {
    const { width, height } = this.app.screen;
    const s = this.world.scale.x;
    const cx = (width / 2 - this.world.x) / s;
    const cy = (height / 2 - this.world.y) / s;
    const half = (this.size * TW) / 2;
    const ccx = Math.max(-half, Math.min(half, cx));
    const ccy = Math.max(0, Math.min(this.size * TH, cy));
    this.world.position.set(width / 2 - ccx * s, height / 2 - ccy * s);
  }

  // ------------------------------------------------------------------ input

  private tileFromEvent(e: { clientX: number; clientY: number }): { fx: number; fy: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const s = this.world.scale.x;
    const px = (e.clientX - rect.left - this.world.x) / s;
    const py = (e.clientY - rect.top - this.world.y) / s;
    const view = this.cb.getView();
    const flat = worldToTile(px, py);
    if (!view) return { fx: flat.x, fy: flat.y };
    // raised ground: the visible tile is the front-most one whose top surface is under the pointer
    const p = homeProvince(view.game);
    let best: { x: number; y: number } | null = null;
    for (let h = MAX_HEIGHT; h >= 0; h--) {
      const t = worldToTile(px, py + h * HEIGHT_PX);
      const tile = tileAt(p, Math.floor(t.x), Math.floor(t.y));
      if (tile && tile.height === h && (!best || t.x + t.y > best.x + best.y)) best = t;
    }
    const t = best ?? flat;
    return { fx: t.x, fy: t.y };
  }

  private setHover(tile: { x: number; y: number } | null): void {
    if (tile?.x === this.hover?.x && tile?.y === this.hover?.y) return;
    this.hover = tile;
    this.cb.onHover(tile);
  }

  private pickBuilding(p: Province, fx: number, fy: number): string | null {
    for (const k of [2, 1.5, 1, 0.5]) {
      const id = tileAt(p, Math.floor(fx + k), Math.floor(fy + k))?.buildingId;
      if (!id) continue;
      const b = buildingById(p, id);
      if (!b) continue;
      const [w, h] = defOf(b).footprint;
      // apparent height above the footprint centre (sprite heights are measured from its top vertex)
      const height = (this.buildingViews.get(id)?.info.height ?? 14) + (w + h) * 8;
      if (height >= 32 * k - 6) return id;
    }
    return tileAt(p, Math.floor(fx), Math.floor(fy))?.buildingId ?? null;
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      canvas.addEventListener(type, fn, opts);
      this.cleanup.push(() => canvas.removeEventListener(type, fn, opts));
    };
    const paint = (e: PointerEvent): void => {
      const { fx, fy } = this.tileFromEvent(e);
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      const key = `${x},${y}`;
      if (key === this.lastPaint) return;
      this.lastPaint = key;
      this.cb.onRoadPaint(x, y);
    };
    on('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
        this.drag = null;
        return;
      }
      const view = this.cb.getView();
      const isPaint = (view?.tool.kind === 'road' || view?.tool.kind === 'pave') && e.button === 0;
      this.drag = { lastX: e.clientX, lastY: e.clientY, total: 0, button: e.button, paint: isPaint };
      this.lastPaint = '';
      if (isPaint) paint(e);
    });
    on('pointermove', (e) => {
      const { fx, fy } = this.tileFromEvent(e);
      const tx = Math.floor(fx);
      const ty = Math.floor(fy);
      const inside = tx >= 0 && ty >= 0 && tx < this.size && ty < this.size;
      if (e.pointerType === 'mouse' || this.drag?.paint) this.setHover(inside ? { x: tx, y: ty } : null);
      if (!this.pointers.has(e.pointerId)) return;
      const prev = this.pointers.get(e.pointerId)!;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const rect = canvas.getBoundingClientRect();
        this.zoomBy(
          dist / Math.max(1, this.pinch.dist),
          (a!.x + b!.x) / 2 - rect.left,
          (a!.y + b!.y) / 2 - rect.top,
        );
        this.pinch.dist = dist;
        this.panBy((e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
        return;
      }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.lastX;
      const dy = e.clientY - this.drag.lastY;
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
      this.drag.total += Math.abs(dx) + Math.abs(dy);
      if (this.drag.paint) paint(e);
      else if (this.drag.total > 5) this.panBy(dx, dy);
    });
    const up = (e: PointerEvent): void => {
      const drag = this.drag;
      const wasSingle = this.pointers.size === 1 && this.pointers.has(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      this.drag = null;
      if (!drag || !wasSingle || e.type === 'pointercancel') return;
      if (drag.paint || drag.total > 5) return;
      if (drag.button === 2) {
        this.cb.onCancel();
        return;
      }
      if (drag.button !== 0) return;
      const view = this.cb.getView();
      if (!view) return;
      const { fx, fy } = this.tileFromEvent(e);
      const p = homeProvince(view.game);
      const pickTall = view.tool.kind === 'select' || view.tool.kind === 'demolish';
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      const buildingId = pickTall ? this.pickBuilding(p, fx, fy) : (tileAt(p, x, y)?.buildingId ?? null);
      if (e.pointerType !== 'mouse') this.setHover(tileAt(p, x, y) ? { x, y } : null);
      this.cb.onTileClick(x, y, buildingId);
    };
    on('pointerup', up);
    on('pointercancel', up);
    on('pointerleave', () => {
      if (!this.drag) this.setHover(null);
    });
    on('contextmenu', (e) => e.preventDefault());
    on(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
      },
      { passive: false },
    );
  }

  // ------------------------------------------------------------------ frame

  private frame = (ticker: Ticker): void => {
    const view = this.cb.getView();
    if (!view || this.destroyed) return;
    const dt = Math.min(ticker.deltaMS, 100);
    this.time += dt;
    const p = homeProvince(view.game);
    this.prov = p;
    // Respond to parent-iframe resizing; do not reset the user's zoom on
    // every simulation tick or React state update.
    if (this.app.screen.width !== this.cameraViewport.width ||
        this.app.screen.height !== this.cameraViewport.height) this.resetCamera();
    if (p.width !== this.size) {
      this.size = p.width;
      this.resetCamera();
    }
    const cal = calendar(view.game.tick);
    const pal = SEASON_PALETTE[cal.season];
    const motion = !view.reducedMotion;

    if (p.tiles !== this.lastTiles || cal.season !== this.lastSeason) {
      const seasonChanged = this.lastSeason !== null && cal.season !== this.lastSeason;
      this.syncGround(p, pal);
      this.syncProps(p, pal, cal.season);
      if (seasonChanged) this.pruneAtlas(cal.season);
      this.lastTiles = p.tiles;
      this.lastSeason = cal.season;
    }
    // Keep the visual sky on its own slow clock; changing speed never
    // causes rapid flashing or affects the real game calendar.
    // A continuous hour also avoids sudden jumps at discrete tick boundaries.
    this.visualHour = advanceVisualHour(this.visualHour, clockHour(view.game.tick), dt, view.game.speed);
    this.updateLight(view, this.visualHour, dt);
    this.updateWeather(view, cal.day, cal.season, dt, motion);
    this.watchFps(view);
    this.syncBuildings(view, p, pal, cal.season, dt, motion);
    this.updateWalkers(view, p, dt, motion);
    this.updateTraffic(view, p, dt, motion);
    this.updateMilitia(view, p, dt);
    this.updateBoats(view, p, dt, motion);
    this.updateParticles(dt);
    this.drawOverlays(view, p, pal);

    if (motion) {
      this.waterTimer += dt;
      if (this.waterTimer > 140) {
        this.waterTimer = 0;
        this.drawWater(pal);
      }
      for (const prop of this.propViews.values()) {
        if (prop.sway) prop.sway.skew.x = Math.sin(this.time / 900 + prop.phase) * 0.035;
      }
    }
  };

  private syncGround(p: Province, pal: SeasonPalette): void {
    const g = this.ground;
    g.clear();
    this.waterTiles = [];
    this.roadTiles = [];
    this.pavedRoadTiles = [];
    // painter's order along diagonals so raised tiles and their cliffs overlap correctly
    const detail = this.cb.getView()?.detail ?? 2;
    for (let sum = 0; sum <= p.width + p.height - 2; sum++)
      for (let x = Math.max(0, sum - p.height + 1); x <= Math.min(p.width - 1, sum); x++) {
        const y = sum - x;
        const t = p.tiles[y * p.width + x]!;
        drawGroundTile(
          g,
          x,
          y,
          t.terrain,
          t.variant,
          t.road,
          pal,
          {
            height: t.height,
            frontLeft: tileAt(p, x, y + 1)?.height ?? -1,
            frontRight: tileAt(p, x + 1, y)?.height ?? -1,
          },
          t.roadType,
          detail,
          t.paved ?? false,
        );
        if (t.terrain === 'water' || t.terrain === 'lake') this.waterTiles.push([x, y]);
        if (t.road) this.roadTiles.push([x, y]);
        if (t.road && t.paved && t.roadType === 'dirt') this.pavedRoadTiles.push([x, y]);
      }
    this.drawWater(pal);
  }

  private drawWater(pal: SeasonPalette): void {
    const g = this.waterFx;
    g.clear();
    // Three layered travelling ripples + a shoreline foam response. Visual
    // wave physics only; water tiles remain deterministic for game simulation.
    const t = this.time / 1300;
    const p = this.prov;
    for (const [x, y] of this.waterTiles) {
      const ox = isoX(x, y);
      const oy = isoY(x, y);
      const phase = t + x * 0.42 + y * 0.65;
      const swell = Math.sin(phase) * 2.5;
      for (let layer = 0; layer < 3; layer++) {
        const shift = Math.sin(phase + layer * 1.3) * (2.5 + layer);
        const yy = oy + 8 + layer * 6 + swell * 0.5;
        g.moveTo(ox - 14 + shift, yy)
          .lineTo(ox - 4 + shift, yy + 4.5)
          .lineTo(ox + 8 + shift, yy - 0.2)
          .stroke({ color: pal.waterLight, width: layer === 1 ? 1.45 : 0.85,
            alpha: 0.18 + (Math.sin(phase + layer) + 1) * 0.17 });
      }
      if (p) {
        const coast = (dx: number, dy: number): boolean => {
          const a = tileAt(p, x + dx, y + dy);
          return !!a && a.terrain !== 'water' && a.terrain !== 'lake';
        };
        const foamAlpha = 0.22 + Math.abs(Math.sin(phase)) * 0.22;
        if (coast(0, -1)) g.moveTo(ox, oy + 2).lineTo(ox + 19, oy + 12)
          .stroke({ color: 0xe9f8fb, width: 1.5, alpha: foamAlpha });
        if (coast(-1, 0)) g.moveTo(ox - 19, oy + 12).lineTo(ox, oy + 2)
          .stroke({ color: 0xe9f8fb, width: 1.5, alpha: foamAlpha });
      }
    }
  }

  private syncProps(p: Province, pal: SeasonPalette, season: Season): void {
    const alive = new Set<number>();
    for (let i = 0; i < p.tiles.length; i++) {
      const t = p.tiles[i]!;
      if (t.terrain !== 'forest' && t.terrain !== 'stone') continue;
      alive.add(i);
      const x = i % p.width;
      const y = Math.floor(i / p.width);
      const bucket =
        t.terrain === 'forest'
          ? t.deposit >= FOREST_TILE_MAX * 0.6
            ? 3
            : t.deposit >= FOREST_TILE_MAX * 0.2
              ? 2
              : t.deposit > 0
                ? 1
                : 0
          : t.deposit > 0
            ? 1
            : 0;
      const sig = `${t.terrain}|${bucket}|${season}`;
      let view = this.propViews.get(i);
      if (view?.sig === sig) continue;
      if (view) view.c.destroy({ children: true });
      const c = new Container();
      c.position.set(isoX(x + 0.5, y + 0.5), isoY(x + 0.5, y + 0.5) - t.height * HEIGHT_PX);
      c.zIndex = x + y + 1;
      let sway: Container | null = null;
      c.cullable = true;
      if (t.terrain === 'stone') {
        c.addChild(this.sprite(`rock|${t.variant}|${bucket > 0}`, (g) => drawRocks(g, t.variant, bucket > 0)));
      } else {
        const stumps = new Container();
        sway = new Container();
        const spots: [number, number, number][] = [
          [-9 + t.variant, -3, 1],
          [9 - t.variant, 4, 0.82],
        ];
        spots.forEach(([sx, sy, scale], n) => {
          const standing = bucket === 3 || (bucket === 2 && n === 0) || (bucket === 1 && n === 1);
          if (standing) {
            const kind = (t.variant + n + x) % pal.leaf.length;
            const s = bucket === 1 ? 0.7 : scale;
            const holder = new Container();
            holder.addChild(this.sprite(`tree|${season}|${kind}|${s}`, (g) => drawTree(g, pal, kind, s)));
            holder.position.set(sx, sy);
            sway!.addChild(holder);
          } else {
            const holder = new Container();
            holder.addChild(this.sprite('stump', (g) => drawStump(g)));
            holder.position.set(sx, sy);
            stumps.addChild(holder);
          }
        });
        c.addChild(stumps, sway);
      }
      this.objects.addChild(c);
      view = { c, sway, sig, phase: (x * 7 + y * 13) % 6 };
      this.propViews.set(i, view);
    }
    for (const [i, view] of this.propViews) {
      if (!alive.has(i)) {
        view.c.destroy({ children: true });
        this.propViews.delete(i);
      }
    }
  }

  private syncBuildings(
    view: RendererView,
    p: Province,
    pal: SeasonPalette,
    season: Season,
    dt: number,
    motion: boolean,
  ): void {
    const seen = new Set<string>();
    this.flagTimer += dt;
    const flagNow = this.flagTimer > 90;
    if (flagNow) this.flagTimer = 0;
    for (const b of p.buildings) {
      seen.add(b.id);
      const def = defOf(b);
      const [w, h] = def.footprint;
      let bv = this.buildingViews.get(b.id);
      if (!bv) {
        const c = new Container();
        const body = new Container();
        const g = new Graphics();
        const glow = new Graphics();
        // The night version is a complete depth-correct building, not an
        // always-on-top glow pass that leaks through roofs.
        const extra = new Graphics();
        body.addChild(g);
        c.addChild(body, glow, extra);
        c.cullable = true;
        const base = Math.min(...footprintTiles(def, b.x, b.y).map(([fx, fy]) => tileAt(p, fx, fy)?.height ?? 0));
        c.position.set(isoX(b.x, b.y), isoY(b.x, b.y) - base * HEIGHT_PX);
        c.zIndex = b.x + w + b.y + h - 1;
        this.objects.addChild(c);
        bv = {
          c,
          body,
          glow,
          g,
          extra,
          flags: [],
          mask: null,
          info: { lights: [], smoke: [], flags: [], height: 30 },
          sig: '',
          smokeTimer: Math.random() * 400,
        };
        this.buildingViews.set(b.id, bv);
      }
      const staffed = specOf(b).workerSlots === 0 || b.workers > 0;
      const progress = b.state === 'active' ? 0 : b.progressTicks;
      const look = b.look ? JSON.stringify(b.look) : '';
      const sig = `${b.level}|${b.state}|${b.connected}|${b.unpaid}|${staffed}|${progress}|${season}|${b.style}|${look}|${conditionBand(b.condition)}|${view.detail}`;
      if (sig !== bv.sig) {
        bv.sig = sig;
        this.redrawBuilding(bv, b, pal, view.detail);
      }
      if (flagNow && motion)
        bv.flags.forEach((fg, i) => drawFlag(fg, this.time / 160 + b.x + i, bv!.info.flags[i]?.color ?? COLORS.flag));

      // chimney smoke while the building is in use
      const anchor = isBuilt(b) && b.connected ? (bv.info.smoke[0] ?? null) : null;
      const inUse = b.definitionId === 'lumber_camp' ? isOperating(b) : true;
      if (anchor && inUse && motion && view.game.speed > 0 && this.particles.length < 90) {
        bv.smokeTimer -= dt;
        if (bv.smokeTimer <= 0) {
          bv.smokeTimer = 420 + Math.random() * 260;
          const g = new Graphics().circle(0, 0, 2.6).fill({ color: COLORS.smoke, alpha: 0.8 });
          g.position.set(bv.c.x + anchor[0], bv.c.y + anchor[1]);
          g.zIndex = bv.c.zIndex + 0.5;
          this.objects.addChild(g);
          this.particles.push({ g, life: 1 });
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

  private redrawBuilding(bv: BuildingView, b: BuildingInstance, pal: SeasonPalette, detail: ArtDetail): void {
    const def = defOf(b);
    const [w, h] = def.footprint;
    const { g, extra } = bv;
    g.clear();
    extra.clear();
    const seed = hashId(b.id);
    const landmarkSite = b.state === 'construction' && !!def.landmark;
    bv.info =
      b.state === 'construction' && !landmarkSite
        ? drawStyledConstruction(g, w, h, b.progressTicks / Math.max(1, requiredTicks(b)), b.style, detail, seed)
        : drawStyledBuilding(g, b, pal, detail, seed);
    if (bv.mask) {
      bv.body.mask = null;
      bv.mask.destroy();
      bv.mask = null;
    }
    if (landmarkSite) {
      // the monument rises stage by stage: reveal it from the ground up, scaffolding on top
      const ratio = Math.min(1, b.progressTicks / Math.max(1, requiredTicks(b)));
      const bounds = g.getLocalBounds();
      const shown = 0.12 + 0.88 * ratio;
      const mask = new Graphics()
        .rect(bounds.x - 4, bounds.y + bounds.height * (1 - shown) - 2, bounds.width + 8, bounds.height * shown + 8)
        .fill(0xffffff);
      bv.c.addChild(mask);
      bv.body.mask = mask;
      bv.mask = mask;
      const topY = bounds.y + bounds.height * (1 - shown);
      for (let k = 0; k <= 6; k++) {
        const x = bounds.x + (bounds.width * k) / 6;
        extra.moveTo(x, bounds.y + bounds.height).lineTo(x, topY).stroke({ color: COLORS.woodDark, width: 1.6, alpha: 0.9 });
      }
      for (let y = bounds.y + bounds.height - 10; y > topY; y -= 12)
        extra.moveTo(bounds.x, y).lineTo(bounds.x + bounds.width, y).stroke({ color: COLORS.woodDark, width: 1.2, alpha: 0.8 });
      // a crane over the site
      const cx = bounds.x + bounds.width * 0.75;
      extra.moveTo(cx, bounds.y + bounds.height).lineTo(cx, topY - 26).lineTo(cx - 34, topY - 22).stroke({ color: 0xb5892f, width: 2 });
      extra.moveTo(cx - 30, topY - 22).lineTo(cx - 30, topY - 4).stroke({ color: 0x3a2a1c, width: 0.8 });
    }
    bv.glow.clear();
    // The illuminated version paints each window before subsequent roof/occluder
    // geometry. Alpha blends with the unlit version, preserving all window depth.
    if (isBuilt(b) && !landmarkSite) drawStyledBuilding(bv.glow, b, pal, detail, seed, true);
    bv.glow.alpha = Math.min(1, this.night * 1.1);
    bv.glow.visible = this.night > 0.02 && isBuilt(b) && b.connected;
    if (this.opts.cacheBodies && landmarkSite && bv.body.isCachedAsTexture) bv.body.cacheAsTexture(false);
    if (this.opts.cacheBodies && !landmarkSite) {
      if (bv.body.isCachedAsTexture) bv.body.updateCacheTexture();
      else bv.body.cacheAsTexture({ resolution: 2, antialias: true });
    }
    this.tintKey = -1;
    const height = bv.info.height;
    const top: [number, number] = [P(w / 2, h / 2)[0], -height - 6];
    g.alpha = b.connected ? 1 : 0.7;

    if (b.state !== 'active') {
      const ratio = Math.min(1, b.progressTicks / Math.max(1, requiredTicks(b)));
      if (b.state === 'upgrading') {
        // scaffolding around the existing building
        for (const [u, v] of [
          [0.02, h - 0.02],
          [w - 0.02, h - 0.02],
          [w - 0.02, 0.02],
        ] as const) {
          const a = P(u, v, 0);
          const c = P(u, v, height * 0.8);
          extra.moveTo(a[0], a[1]).lineTo(c[0], c[1]).stroke({ color: COLORS.woodDark, width: 2 });
        }
        const l = P(0.02, h - 0.02, height * 0.5);
        const m = P(w - 0.02, h - 0.02, height * 0.5);
        const r = P(w - 0.02, 0.02, height * 0.5);
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
    const rate = view.reducedMotion ? 1 : Math.min(1, dt / 1400);
    this.night += (target - this.night) * rate;
    if (Math.abs(this.night - target) < 0.004) this.night = target;
    const key = Math.round(this.night * 40) + (this.dropKind === 'overcast' || this.dropKind === 'rain' ? 100 : 0);
    if (key === this.tintKey) return;
    this.tintKey = key;
    let tint = mix(0xffffff, 0x6f7fb8, this.night * 0.72);
    if (this.dropKind === 'overcast' || this.dropKind === 'rain') tint = mix(tint, 0xb8c0c8, 0.25);
    this.ground.tint = tint;
    this.waterFx.tint = tint;
    for (const pv of this.propViews.values()) pv.c.tint = tint;
    for (const w of this.walkers) w.c.tint = tint;
    for (const b of this.boats) b.c.tint = tint;
    for (const bv of this.buildingViews.values()) {
      bv.body.tint = tint;
      bv.glow.tint = tint;
      bv.glow.alpha = Math.min(1, this.night * 1.1);
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
    const flare = fanMatch && index % 3 === 0 ? new Graphics() : undefined;
    if (flare) c.addChild(flare);
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

  /** The city's fleet sails the lake and river (visual only, one sprite per vessel up to 9). */
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
        this.boats.push({ c, kind, x: at[0], y: at[1], tx: at[0], ty: at[1], t: 1 });
      });
    }
    const step = motion ? (dt / 1000) * 0.35 * (SPEED_FACTOR[view.game.speed] ?? 0) : 0;
    const isWater = (x: number, y: number): boolean => {
      const t = tileAt(p, x, y);
      return !!t && (t.terrain === 'lake' || t.terrain === 'water') && !t.road;
    };
    for (const b of this.boats) {
      b.t += step;
      if (b.t >= 1) {
        b.x = b.tx;
        b.y = b.ty;
        const options = NEIGHBORS4.map(([dx, dy]) => [b.x + dx, b.y + dy] as [number, number]).filter(([x, y]) => isWater(x, y));
        const next = options.length ? options[Math.floor(Math.random() * options.length)]! : [b.x, b.y];
        b.tx = next[0];
        b.ty = next[1];
        b.t = 0;
      }
      const fx = b.x + (b.tx - b.x) * b.t + 0.5;
      const fy = b.y + (b.ty - b.y) * b.t + 0.5;
      b.c.position.set(isoX(fx, fy), isoY(fx, fy) + Math.sin(this.time / 500 + b.x) * 0.8);
      b.c.zIndex = fx + fy;
      b.c.scale.x = b.tx - b.x - (b.ty - b.y) < 0 ? -1 : 1;
    }
  }

  /** Visual-only villagers and carts wandering the road network. The economy never reads them. */
  private updateWalkers(view: RendererView, p: Province, dt: number, motion: boolean): void {
    const wantVillagers = Math.min(10, Math.floor(totalPopulation(p) / 2));
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
    // Simulated match days attract a small crowd in local or visiting kit.
    // Match days are fictional world events, not imported real match schedules.
    const match = matchDayFor(view.game);
    const key = match ? `${match.team}:${match.day}` : '';
    if (this.activeFanMatch !== key) {
      for (const fan of this.matchFans) fan.c.destroy({ children: true });
      this.matchFans = [];
      this.activeFanMatch = key;
      if (match) {
        const fans = Math.min(12, Math.max(3, Math.floor(totalPopulation(p) / 4)));
        for (let i = 0; i < fans; i++) {
          const fan = this.spawnWalker(false, match, i);
          if (fan) this.matchFans.push(fan);
        }
      }
    }
    const isRoad = (x: number, y: number): boolean => !!tileAt(p, x, y)?.road;
    // Movement animation stays comfortable even at 4x world-simulation speed.
    const step = motion ? (dt / 1000) * Math.min(1.35, SPEED_FACTOR[view.game.speed] ?? 0) : 0;
    for (const w of [...this.walkers, ...this.matchFans]) {
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
        const eligible = w.fan
          ? forward.filter(([x, y]) => tileAt(p, x, y)?.paved) : forward;
        const pool = eligible.length ? eligible : forward.length ? forward : options;
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
      // Two protected sidewalk offsets, one on each edge of a paved tile.
      // Pedestrians never stand in the centre of a vehicle's lane.
      const sidewalk = paved && !w.cart && (dx !== 0 || dy !== 0);
      const [wx, wy] = sidewalk ? pedestrianSidewalkOffset(dx, dy, w.side) : [0, 0];
      w.c.position.set(
        isoX(fx + wx, fy + wy) + (sidewalk ? 0 : w.side),
        isoY(fx + wx, fy + wy) + bob + (sidewalk ? 0 : w.side * 0.25) - lift,
      );
      w.c.zIndex = fx + fy + 0.015;
      if (w.cart) w.c.scale.x = dx - dy < 0 ? -1 : 1;
      if (w.flare) drawSupporterFlare(w.flare, motion ? this.time : 0, w.phase);
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
      return !!t?.road && !!t.paved && t.roadType === 'dirt';
    };
    const neighbors = (x: number, y: number): [number, number][] =>
      (NEIGHBORS4.map(([dx, dy]) => [x + dx, y + dy] as [number, number]))
        .filter(([nx, ny]) =>
          isPaved(nx, ny) &&
          tileAt(p, nx, ny)?.height === tileAt(p, x, y)?.height);
    const linked = this.pavedRoadTiles.filter(([x, y]) => neighbors(x, y).length > 0);
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
      drawCityCar(body, paints[this.trafficCars.length % paints.length]!, this.trafficCars.length % 3 === 0);
      holder.addChild(body);
      holder.cullable = true;
      this.objects.addChild(holder);
      this.trafficCars.push({
        c: holder, from: [start[0], start[1]], to,
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
      const x = car.from[0] + dx * car.t + 0.5;
      const y = car.from[1] + dy * car.t + 0.5;
      const [laneX, laneY] = vehicleLaneOffset(dx, dy, uk);
      const lift = this.hz(p, car.from[0], car.from[1]);
      car.c.position.set(isoX(x + laneX, y + laneY), isoY(x + laneX, y + laneY) - lift);
      car.c.rotation = Math.atan2(isoY(dx, dy), isoX(dx, dy));
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

    if (hover) {
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
      } else if (tool.kind === 'terrace') {
        const t = tileAt(p, hover.x, hover.y);
        const ok = !!t && t.terrain === 'hill' && !t.road && !t.buildingId;
        this.tileFill(g, hover.x, hover.y, ok ? COLORS.ok : COLORS.bad, 0.5);
        this.outline(g, hover.x, hover.y, 1, 1, ok ? COLORS.ok : COLORS.bad, 2, 0.95);
      } else if (tool.kind === 'army') {
        const t = tileAt(p, hover.x, hover.y);
        const ok = !!t?.road && (view.game.militia ?? 0) > 0;
        this.tileFill(g, hover.x, hover.y, ok ? COLORS.ok : COLORS.bad, 0.4);
        this.outline(g, hover.x, hover.y, 1, 1, ok ? COLORS.ok : COLORS.bad, 2.2, 0.9);
      } else if (tool.kind === 'road') {
        const ok = checkRoadSite(p, hover.x, hover.y) === null;
        this.tileFill(g, hover.x, hover.y, ok ? COLORS.ok : COLORS.bad, 0.5);
        this.outline(g, hover.x, hover.y, 1, 1, ok ? COLORS.ok : COLORS.bad, 2, 0.95);
      } else {
        const t = tileAt(p, hover.x, hover.y);
        const b = t?.buildingId ? buildingById(p, t.buildingId) : undefined;
        const color = tool.kind === 'demolish' ? COLORS.bad : 0xffffff;
        if (b) this.outline(g, b.x, b.y, defOf(b).footprint[0], defOf(b).footprint[1], color, 2, 0.85);
        else
          this.outline(
            g,
            hover.x,
            hover.y,
            1,
            1,
            color,
            1.5,
            tool.kind === 'demolish' && !t?.road ? 0.35 : 0.7,
          );
      }
    }
    if (!ghostSig && this.ghostSig) this.ghost.clear();
    this.ghostSig = ghostSig;
  }
}
