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
import { FOREST_TILE_MAX, HEIGHT_PX, MAX_HEIGHT } from '../data/balance';
import { BUILDINGS, defOf, specOf } from '../data/buildings';
import type { RoadPlan, RoadPoint } from '../systems/commands';
import { validatePlacement } from '../systems/commands';
import { homeProvince, isBuilt, isOperating, totalPopulation } from '../systems/economy';
import { NEIGHBORS4, buildingById, tileAt, tilesInRange } from '../systems/grid';
import { checkRoadSite } from '../systems/placement';
import { requiredTicks } from '../systems/tick';
import { TH, TW, isoX, isoY, P, worldToTile } from './iso';
import { COLORS, SEASON_PALETTE } from './palette';
import type { SeasonPalette } from './palette';
import { drawBird, drawBoat, drawCart, drawFlag, drawGroundTile, drawRocks, drawStump, drawTree } from './sprites';
import { buildingArtSeed, drawStyledBuilding, drawStyledConstruction } from './arch/buildings';
import type { SpriteInfo } from './arch/buildings';
import { CULTURES } from '../data/architecture';
import { conditionBand } from '../systems/architecture';
import { findGroundPath, marchable, musterPoint } from './armyPath';
import { getPavedLinks } from './roadGeometry';
import { matchDayFor } from '../data/matchDays';
import type { MatchDay } from '../data/matchDays';
import { drawFootballSupporter, drawSupporterFlare } from './trafficSprites';
import { drawHeadlights, drawTrafficVehicle, modelLength, modelSpeed, trafficModel } from './vehicles';
import { WALK_FRAMES, drawPedestrian, randomPedLook } from './pedestrians';
import { trafficShare, walkerShare, windowLight } from './dayRhythm';
import { TrafficLights } from './trafficLights';
import { PERSON_SCALE, SOLDIER_SCALE, VEHICLE_SCALE } from './scale';
import { drawSoldier, kitFor } from './soldiers';
import { StreetFurniture } from './streetFurniture';
import { Fireworks } from './fireworks';
import { WaterLife } from './waterLife';
import { CitySurpriseScenes } from './citySurpriseScenes';
import type { PedLook } from './pedestrians';
import { pedestrianSidewalkOffset, smoothVehicleTurnOffset } from './trafficMath';
import { blocksFollowing, bodiesOverlap, heldByFollowing, junctionClear } from './trafficRules';
import { buildingDepths } from './depthSort';
import { markPerson, pickPerson, setActivity } from './people';
import type { PersonPick } from './people';
import { citizenAt } from '../data/citizens';
import { footprintOf, footprintTilesOf, isSwapped, rotTile, rotateAnimals, rotateGame, rotPoint, rotRect, unrotPoint, unrotRect, unrotTile } from './rotation';
import type { Rotation } from './rotation';
import { wildlife } from '../systems/frontier';
import type { TrafficAgent } from './trafficRules';
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
  placement?: { x: number; y: number } | null;
}

export interface RendererOptions {
  /** Canvas resolution multiplier cap and antialiasing (fixed for the renderer's lifetime). */
  resolution: number;
  antialias: boolean;
  /** Cache building bodies as textures (cheaper frames, used on low/medium quality). */
  cacheBodies: boolean;
  /** Quarter turns of the camera (see rotation.ts); fixed for the renderer's lifetime. */
  rotation?: Rotation;
  /** Start the camera here (true map tile coordinates and world scale) instead of fitting the map. */
  camera?: { x: number; y: number; zoom: number } | null;
}

export interface RendererHost {
  getView(): RendererView | null;
  onTileClick(x: number, y: number, buildingId: string | null, touch: boolean): void;
  /** A person on the map was tapped (select tool only). */
  onPersonClick?(person: PersonPick): void;
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
  /** Moving street vehicles (ambient traffic), for the soundscape. */
  traffic?: number;
  trafficMoving?: number;
  trafficOverlaps?: number;
  trafficStep?: number;
  /** Beach-goers, swimmers and sailing boats. */
  waterLife?: number;
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
  /** Definition id and art seed, used for the hour-by-hour window lights. */
  kind: string;
  seed: number;
  /** Turbine rotors, rotated every frame. */
  rotors: Graphics[];
}
interface PropView {
  c: Container;
  sway: Container | null;
  sig: string;
  phase: number;
}
interface Walker {
  c: Container;
  /** Animated townsperson (absent for carts and supporters). */
  body?: Graphics;
  look?: PedLook;
  shown?: string;
  /** Standing at a kerb for the lights. */
  waiting?: boolean;
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
  /** Who this is (citizen number). */
  citizen: number;
  child: boolean;
}
interface TrafficCar {
  id: number;
  /** Farm pickup on any road, including dirt lanes (street traffic keeps to asphalt). */
  rural: boolean;
  /** Produce colour for farm pickups. */
  load: number;
  /** Real ms spent held by other traffic (not by red lights): long jams despawn the car. */
  waited: number;
  /** Throttle 0..1: vehicles pull away gently instead of jumping to full speed. */
  v: number;
  /** Last drawn centre and heading, the input to the right-of-way rules. */
  px: number;
  py: number;
  hx: number;
  hy: number;
  c: Container;
  sprite: Graphics;
  /** Headlight beams on the road ahead, shown after dusk. */
  beam: Graphics;
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
/**
 * Body heading of a vehicle `t` into a segment that turns off the previous one: it swings from the
 * old direction to the new over the first part of the segment, in steps of about 9 degrees so the
 * sprite is only redrawn a few times per turn. Straight on and U-turns keep the new heading.
 */
export function turnHeading(pdx: number, pdy: number, dx: number, dy: number, t: number): [number, number] {
  if (!dx && !dy) return [pdx || 1, pdy];
  const turning = (pdx || pdy) && pdx * dx + pdy * dy === 0;
  if (!turning || t >= 0.45) return [dx, dy];
  const k = Math.max(0, t) / 0.45;
  const blend = k * k * (3 - 2 * k);
  const a0 = Math.atan2(pdy, pdx);
  let d = Math.atan2(dy, dx) - a0;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  const step = Math.PI / 20;
  const a = a0 + Math.round((d * blend) / step) * step;
  return [Math.cos(a), Math.sin(a)];
}

/** What a townsperson out walking is doing at this hour. */
function walkerActivity(hour: number, child: boolean): string {
  if (hour >= 7 && hour < 9) return child ? 'Okula gidiyor' : 'İşe gidiyor';
  if (hour >= 12 && hour < 13) return 'Öğle arasında dışarıda';
  if (hour >= 16 && hour < 19) return child ? 'Okuldan eve dönüyor' : 'İşten eve dönüyor';
  if (hour >= 19 && hour < 23) return 'Akşam yürüyüşünde';
  if (hour >= 23 || hour < 6) return 'Gece eve dönüyor';
  return 'Şehirde dolaşıyor';
}

export class ValleyRenderer {
  private app = new Application();
  private world = new Container();
  private ground = new Graphics();
  private waterFx = new Graphics();
  private under = new Graphics();
  private transportGround = new Graphics();
  private objects = new Container();
  private readonly airLayer = new Container();
  private trafficCacheTiles: Province['tiles'] | null = null;
  private cachedLinkedRoads: [number, number][] = [];
  private cachedLaneRoads: [number, number][] = [];
  private citySurprises = new CitySurpriseScenes(this.objects, this.airLayer);
  private cityScenes = new CityScenes(this.objects);
  private workScenes = new WorkerScenes(this.objects);
  private frontier = new FrontierScenes(this.transportGround, this.objects);
  private signals = new TrafficLights(this.objects);
  private furniture = new StreetFurniture(this.objects);
  private fireworks = new Fireworks(this.objects);
  private waterLife = new WaterLife(this.objects);
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
  private rot: Rotation = 0;
  private rotatedFor: { view: RendererView; out: RendererView } | null = null;
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
  private birds: BirdSprite[] = [];
  private lastTiles: Tile[] | null = null;
  private lastSeason: Season | null = null;
  private waterTiles: [number, number][] = [];
  private roadTiles: [number, number][] = [];
  private hover: { x: number; y: number } | null = null;
  private time = 0;
  private waterTimer = 0;
  private flagTimer = 0;
  /** Building layout the current draw order was computed for. */
  private depthKey = '';
  private ghostSig = '';
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { lastX: number; lastY: number; moved: boolean; button: number; paint: boolean } | null = null;
  private pinch: { dist: number } | null = null;
  private lastPaint = '';
  private destroyed = false;
  private ready = false;
  private cleanup: (() => void)[] = [];

  private constructor(private cb: RendererHost) {}

  /** The host's view as the camera sees it: every map position turned by the camera rotation. */
  private view(): RendererView | null {
    const v = this.cb.getView();
    if (!v || this.rot === 0) return v;
    const hit = this.rotatedFor;
    if (hit && hit.view.game === v.game && hit.view.roadPlan === v.roadPlan && hit.view.tool === v.tool &&
      hit.view.selectedBuildingId === v.selectedBuildingId && hit.view.detail === v.detail && hit.view.reducedMotion === v.reducedMotion)
      return hit.out.placement === v.placement ? hit.out : { ...hit.out, placement: v.placement };
    const home = homeProvince(v.game);
    const t = <Q extends { x: number; y: number }>(q: Q): Q => {
      const [x, y] = rotTile(q.x, q.y, home.width, home.height, this.rot);
      return { ...q, x, y };
    };
    const plan = v.roadPlan
      ? { ...v.roadPlan, tiles: v.roadPlan.tiles.map(t), paveTiles: v.roadPlan.paveTiles.map(t), blocked: v.roadPlan.blocked ? t(v.roadPlan.blocked) : null }
      : v.roadPlan;
    const tool = v.tool.kind === 'roadPlan'
      ? { ...v.tool, ...(v.tool.start ? { start: t(v.tool.start) } : {}), ...(v.tool.end ? { end: t(v.tool.end) } : {}) }
      : v.tool;
    const out: RendererView = { ...v, game: rotateGame(v.game, this.rot), roadPlan: plan, tool };
    this.rotatedFor = { view: v, out };
    return out;
  }

  /** True (unrotated) map size of the home province. */
  private trueSize(): [number, number] {
    const v = this.cb.getView();
    if (!v) return [this.size, this.size];
    const p = homeProvince(v.game);
    return [p.width, p.height];
  }

  /** True map point -> the point drawn on screen. */
  private toView(x: number, y: number): [number, number] {
    const [w, h] = this.trueSize();
    return rotPoint(x, y, w, h, this.rot);
  }

  /** Camera centre in true tile coordinates and zoom, for keeping the view across a rotation. */
  getCamera(): { x: number; y: number; zoom: number } {
    const { width, height } = this.app.screen;
    const s = this.world.scale.x;
    const t = worldToTile((width / 2 - this.world.x) / s, (height / 2 - this.world.y) / s);
    const [w, h] = this.trueSize();
    const [x, y] = unrotPoint(t.x, t.y, w, h, this.rot);
    return { x, y, zoom: s };
  }

  get rotation(): Rotation {
    return this.rot;
  }

  static async create(host: HTMLElement, cb: RendererHost, opts?: Partial<RendererOptions>): Promise<ValleyRenderer> {
    const r = new ValleyRenderer(cb);
    r.opts = { ...r.opts, ...opts };
    r.rot = r.opts.rotation ?? 0;
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
    r.world.addChild(r.ground, r.waterFx, r.transportGround, r.under, r.objects, r.airLayer, r.ghost);
    r.app.stage.addChild(r.world, r.fx);
    r.bindInput(canvas);
    const first = r.view();
    if (first) r.size = homeProvince(first.game).width;
    r.resetCamera();
    const cam = r.opts.camera;
    if (cam) {
      r.world.scale.set(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom)));
      r.centerOnTile(cam.x, cam.y);
    }
    r.app.ticker.add(r.frame);
    return r;
  }

  destroy(): void {
    this.destroyed = true;
    for (const fn of this.cleanup) fn();
    if (this.ready) {
      this.app.ticker.remove(this.frame);
      this.cityScenes.destroy();
      this.citySurprises.destroy();
      this.workScenes.destroy();
      this.frontier.destroy();
      this.signals.destroy();
      this.furniture.destroy();
      this.fireworks.destroy();
      this.waterLife.destroy();
      for (const bv of this.buildingViews.values()) {
        if (bv.body.isCachedAsTexture) bv.body.cacheAsTexture(false);
      }
      this.buildingViews.clear();
      this.propViews.clear();
      this.walkers.length = 0;
      this.matchFans.length = 0;
      this.trafficCars.length = 0;
      this.fadingCars.length = 0;
      this.militiaSprites.length = 0;
      this.particles.length = 0;
      this.boats.length = 0;
      this.birds.length = 0;
      this.prov = null;
      this.cleanup.length = 0;
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
      walkers: this.walkers.length + this.workScenes.count + this.birds.length,
      particles: this.particles.length,
      traffic: this.trafficCars.length,
      trafficMoving: this.trafficMoving,
      trafficOverlaps: this.trafficOverlaps,
      trafficStep: Math.round(this.trafficStep * 1000) / 1000,
      waterLife: this.waterLife.count,
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
    this.centerView(this.size / 2, this.size / 2 + 0.5);
  }

  centerOnTile(tx: number, ty: number): void {
    const [x, y] = this.toView(tx, ty);
    this.centerView(x, y);
  }

  /** Centres the camera on a point of the drawn (rotated) map. */
  private centerView(x: number, y: number): void {
    const { width, height } = this.app.screen;
    const s = this.world.scale.x;
    this.world.position.set(width / 2 - isoX(x, y) * s, height / 2 - isoY(x, y) * s);
    this.clampCamera();
  }

  /** Client (viewport) coordinates of a tile centre — used by automated browser tests. */
  tileToClient(tx: number, ty: number): { x: number; y: number } {
    const [x, y] = this.toView(tx + 0.5, ty + 0.5).map((n) => n - 0.5) as [number, number];
    const rect = this.app.canvas.getBoundingClientRect();
    const s = this.world.scale.x;
    const view = this.view();
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
    const view = this.view();
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

  /** Footprint of the building being placed, as drawn in this rotation. */
  private toolFootprint(id: BuildingId): [number, number] {
    const [w, h] = BUILDINGS[id].footprint;
    return this.rot % 2 ? [h, w] : [w, h];
  }

  /**
   * A drawn tile as the game knows it. While placing a building the hovered tile is the drawn
   * top corner of its footprint, so the true anchor is that rectangle's true top corner.
   */
  private outTile(x: number, y: number): { x: number; y: number } {
    if (this.rot === 0) return { x, y };
    const tool = this.cb.getView()?.tool;
    const [W, H] = this.trueSize();
    if (tool?.kind === 'build') {
      const [fw, fh] = this.toolFootprint(tool.buildingId);
      const r = unrotRect(x, y, fw, fh, W, H, this.rot);
      return { x: r.x, y: r.y };
    }
    const [tx, ty] = unrotTile(x, y, W, H, this.rot);
    return { x: tx, y: ty };
  }

  private setHover(tile: { x: number; y: number } | null): void {
    if (tile?.x === this.hover?.x && tile?.y === this.hover?.y) return;
    this.hover = tile;
    this.cb.onHover(tile ? this.outTile(tile.x, tile.y) : null);
  }

  private pickBuilding(p: Province, fx: number, fy: number): string | null {
    for (const k of [2, 1.5, 1, 0.5]) {
      const id = tileAt(p, Math.floor(fx + k), Math.floor(fy + k))?.buildingId;
      if (!id) continue;
      const b = buildingById(p, id);
      if (!b) continue;
      const [w, h] = footprintOf(b);
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
      const out = this.outTile(x, y);
      this.cb.onRoadPaint(out.x, out.y);
    };
    on('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
        this.drag = null;
        return;
      }
      const view = this.view();
      const isPaint = (view?.tool.kind === 'road' || view?.tool.kind === 'pave') && e.button === 0 && e.pointerType === 'mouse';
      this.drag = { lastX: e.clientX, lastY: e.clientY, moved: false, button: e.button, paint: isPaint };
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
          (a!.x + b!.x - e.clientX + prev.x) / 2 - rect.left,
          (a!.y + b!.y - e.clientY + prev.y) / 2 - rect.top,
        );
        this.pinch.dist = dist;
        this.panBy((e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
        return;
      }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.lastX;
      const dy = e.clientY - this.drag.lastY;
      const threshold = e.pointerType === 'mouse' ? 5 : 9;
      if (!this.drag.paint && !this.drag.moved && Math.hypot(dx, dy) < threshold) return;
      this.drag.moved = true;
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
      if (this.drag.paint) paint(e);
      else this.panBy(dx, dy);
    });
    const up = (e: PointerEvent): void => {
      const drag = this.drag;
      const wasSingle = this.pointers.size === 1 && this.pointers.has(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      this.drag = null;
      if (!drag || !wasSingle || e.type !== 'pointerup') return;
      if (drag.paint || drag.moved || Math.hypot(e.clientX - drag.lastX, e.clientY - drag.lastY) >= (e.pointerType === 'mouse' ? 5 : 9)) return;
      if (drag.button === 2) {
        this.cb.onCancel();
        return;
      }
      if (drag.button !== 0) return;
      const view = this.view();
      if (!view) return;
      if (view.tool.kind === 'road' || view.tool.kind === 'pave') {
        paint(e);
        return;
      }
      if (view.tool.kind === 'select' && this.cb.onPersonClick) {
        const rect = canvas.getBoundingClientRect();
        const person = pickPerson(e.clientX - rect.left, e.clientY - rect.top, e.pointerType === 'mouse' ? 5 : 9);
        if (person) {
          this.cb.onPersonClick(person);
          return;
        }
      }
      const { fx, fy } = this.tileFromEvent(e);
      const p = homeProvince(view.game);
      const pickTall = view.tool.kind === 'select' || view.tool.kind === 'demolish';
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      const buildingId = pickTall ? this.pickBuilding(p, fx, fy) : (tileAt(p, x, y)?.buildingId ?? null);
      if (e.pointerType !== 'mouse') this.setHover(tileAt(p, x, y) ? { x, y } : null);
      const out = this.outTile(x, y);
      this.cb.onTileClick(out.x, out.y, buildingId, e.pointerType !== 'mouse');
    };
    on('pointerup', up);
    on('pointercancel', up);
    on('lostpointercapture', up);
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
    const view = this.view();
    if (!view || this.destroyed) return;
    const dt = Math.min(ticker.deltaMS, 100);
    this.time += dt;
    const p = homeProvince(view.game);
    this.prov = p;
    // Respond to parent-iframe resizing; do not reset the user's zoom on
    // every simulation tick or React state update.
    if (this.app.screen.width !== this.cameraViewport.width ||
        this.app.screen.height !== this.cameraViewport.height) {
      if (this.cameraViewport.width === 0 || this.cameraViewport.height === 0) {
        this.resetCamera();
      } else {
        const dx = (this.app.screen.width - this.cameraViewport.width) / 2;
        const dy = (this.app.screen.height - this.cameraViewport.height) / 2;
        this.cameraViewport = { width: this.app.screen.width, height: this.app.screen.height };
        this.world.x += dx;
        this.world.y += dy;
        this.clampCamera();
      }
    }
    if (p.width !== this.size) {
      this.size = p.width;
      this.resetCamera();
    }
    const cal = calendar(view.game.tick);
    const pal = SEASON_PALETTE[cal.season];
    const motion = !view.reducedMotion;

    if (p.tiles !== this.lastTiles || cal.season !== this.lastSeason) {
      const seasonChanged = this.lastSeason !== null && cal.season !== this.lastSeason;
      const previous = this.lastTiles;
      const groundChanged = !previous || seasonChanged || previous.length !== p.tiles.length ||
        p.tiles.some((tile, i) => {
          const old = previous[i]!;
          return tile !== old && (tile.terrain !== old.terrain || tile.variant !== old.variant ||
            tile.height !== old.height || tile.road !== old.road || tile.roadType !== old.roadType || tile.paved !== old.paved);
        });
      if (groundChanged) {
        this.syncGround(p, pal);
        this.signals.sync(p);
      }
      this.furniture.sync(p, cal.season, view.game.culture);
      this.tintKey = -1;
      this.syncProps(p, pal, cal.season);
      if (seasonChanged) this.pruneAtlas(cal.season);
      this.lastTiles = p.tiles;
      this.lastSeason = cal.season;
    }
    // Lighting follows the exact clock displayed by the HUD. Keeping a
    // separate visual hour previously left the city sunny after 19:00.
    this.updateLight(view, clockHour(view.game.tick), dt);
    this.updateWeather(view, cal.day, cal.season, dt, motion);
    this.watchFps(view);
    this.syncBuildings(view, p, pal, cal.season, dt, motion);
    const workerStep = motion ? (dt / 1000) * Math.min(1.35, SPEED_FACTOR[view.game.speed] ?? 0) : 0;
    this.workScenes.update(p, cal.season, view.selectedBuildingId, workerStep, !motion);
    {
      const trueGame = this.cb.getView()!.game;
      const trueP = homeProvince(trueGame);
      this.frontier.update(view.game, p, workerStep, view.tool.kind === 'hunt',
        this.rot ? rotateAnimals(wildlife(trueP, trueGame.seed, trueGame.tick), trueP, this.rot) : undefined);
    }
    this.updateWalkers(view, p, dt, motion);
    this.signals.update(this.time, this.night);
    this.furniture.setNight(this.night);
    this.updateFireworks(view, p, motion ? dt : 0);
    this.updateTraffic(view, p, dt, motion);
    this.cityScenes.update(view.game, p, dt, !motion);
    this.updateMilitia(view, p, dt);
    this.citySurprises.update(view.game, p, dt, !motion, this.night);
    this.updateBoats(view, p, dt, motion);
    this.waterLife.update(p, p.tiles, cal.season, clockHour(view.game.tick), this.dropKind === 'rain', dt, motion && view.game.speed > 0);
    this.updateBirds(p, dt, motion);
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
    const detail = this.view()?.detail ?? 2;
    for (let sum = 0; sum <= p.width + p.height - 2; sum++)
      for (let x = Math.max(0, sum - p.height + 1); x <= Math.min(p.width - 1, sum); x++) {
        const y = sum - x;
        const t = p.tiles[y * p.width + x]!;
        const alongY = t.road && t.roadType === 'bridge'
          ? Number(!!tileAt(p, x, y - 1)?.road) + Number(!!tileAt(p, x, y + 1)?.road) >
            Number(!!tileAt(p, x - 1, y)?.road) + Number(!!tileAt(p, x + 1, y)?.road)
          : false;
        const landRoad = (nx: number, ny: number): boolean => {
          const n = tileAt(p, nx, ny);
          return !!n?.road && n.roadType !== 'bridge';
        };
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
            // built-up ground and streets are held up by masonry, not bare earth
            urban: t.road || !!t.buildingId || !!tileAt(p, x, y + 1)?.road || !!tileAt(p, x + 1, y)?.road,
          },
          t.roadType,
          detail,
          t.paved ?? false,
          t.paved ? getPavedLinks(p, x, y) : {
            negX: !!tileAt(p, x - 1, y)?.road,
            posX: !!tileAt(p, x + 1, y)?.road,
            negY: !!tileAt(p, x, y - 1)?.road,
            posY: !!tileAt(p, x, y + 1)?.road,
          },
          alongY,
          t.road && t.roadType === 'bridge'
            ? { start: landRoad(alongY ? x : x - 1, alongY ? y - 1 : y), end: landRoad(alongY ? x : x + 1, alongY ? y + 1 : y) }
            : undefined,
        );
        if ((t.terrain === 'water' || t.terrain === 'lake') && !t.road) this.waterTiles.push([x, y]);
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
      const [w, h] = footprintOf(b);
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
        const base = Math.min(...footprintTilesOf(b).map(([fx, fy]) => tileAt(p, fx, fy)?.height ?? 0));
        c.position.set(isoX(b.x, b.y), isoY(b.x, b.y) - base * HEIGHT_PX);
        c.zIndex = b.x + w + b.y + h - 1;
        // a non-square building seen from the side: its art mirrored swaps width and depth
        if (isSwapped(b)) c.scale.x = -1;
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
          kind: b.definitionId,
          seed: buildingArtSeed(b.id),
          rotors: [],
        };
        this.buildingViews.set(b.id, bv);
      }
      const staffed = specOf(b).workerSlots === 0 || b.workers > 0;
      const progress = b.state === 'active' ? 0 : b.progressTicks;
      const lookChanged = (bv as unknown as { lookRef?: unknown }).lookRef !== b.look;
      if (lookChanged) (bv as unknown as { lookRef?: unknown; lookKey?: string }).lookKey = b.look ? JSON.stringify(b.look) : '';
      (bv as unknown as { lookRef?: unknown }).lookRef = b.look;
      const look = (bv as unknown as { lookKey?: string }).lookKey ?? '';
      const sig = `${b.level}|${b.state}|${b.connected}|${b.unpaid}|${staffed}|${progress}|${season}|${b.style}|${look}|${conditionBand(b.condition)}|${view.detail}`;
      if (sig !== bv.sig) {
        bv.sig = sig;
        this.redrawBuilding(bv, b, pal, view.detail);
      }
      // wind turbines turn while they are staffed and the game runs
      if (bv.rotors.length && motion && view.game.speed > 0 && isOperating(b)) {
        for (const rotor of bv.rotors) rotor.rotation += (dt / 1000) * 2.4 * (SPEED_FACTOR[view.game.speed] ?? 1);
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
          g.position.set(bv.c.x + anchor[0] * bv.c.scale.x, bv.c.y + anchor[1]);
          g.zIndex = bv.c.zIndex + 0.5;
          this.objects.addChild(g);
          this.particles.push({ g, life: 1 });
        }
      }
    }
    const depthKey = p.buildings.map((b) => `${b.id}:${b.x},${b.y}`).join('|');
    if (depthKey !== this.depthKey) {
      this.depthKey = depthKey;
      const depths = buildingDepths(p.buildings.map((b) => {
        const [w, h] = footprintOf(b);
        return { id: b.id, x: b.x, y: b.y, w, h };
      }));
      for (const b of p.buildings) {
        const bv = this.buildingViews.get(b.id);
        if (bv) bv.c.zIndex = depths.get(b.id) ?? bv.c.zIndex;
      }
    }
    for (const [id, bv] of this.buildingViews) {
      if (!seen.has(id)) {
        if (bv.body.isCachedAsTexture) bv.body.cacheAsTexture(false);
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
    const seed = buildingArtSeed(b.id);
    const landmarkSite = b.state === 'construction' && !!def.landmark;
    bv.info =
      b.state === 'construction' && !landmarkSite
        ? drawStyledConstruction(g, w, h, b.progressTicks / Math.max(1, requiredTicks(b)), b.style, detail, seed)
        : drawStyledBuilding(g, b, pal, detail, seed, false, isSwapped(b));
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
    if (isBuilt(b) && !landmarkSite) drawStyledBuilding(bv.glow, b, pal, detail, seed, true, isSwapped(b));
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

    for (const rotor of bv.rotors) rotor.destroy();
    bv.rotors = [];
    if (isBuilt(b)) for (const spin of bv.info.spinners ?? []) {
      const rotor = new Graphics();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        const tip = [c * spin.r, s * spin.r], l = [-s * 1.6, c * 1.6], r = [s * 0.8, -c * 0.8];
        rotor.poly([l[0]!, l[1]!, tip[0]! + l[0]! * 0.2, tip[1]! + l[1]! * 0.2, tip[0]!, tip[1]!, r[0]!, r[1]!]).fill(0xf4f6f7);
      }
      rotor.circle(0, 0, 1.8).fill(0xd9dee1);
      rotor.position.set(spin.at[0], spin.at[1]);
      rotor.rotation = bv.seed % 7;
      // outside the body, which may be cached as a texture
      bv.c.addChild(rotor);
      bv.rotors.push(rotor);
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
    const key = Math.round(this.night * 40) + (this.dropKind === 'overcast' || this.dropKind === 'rain' ? 100 : 0) + hour * 1000;
    if (key === this.tintKey) return;
    this.tintKey = key;
    let tint = mix(0xffffff, 0x283959, this.night * 0.92);
    const goldenHour = hour === 5 || hour === 6 || hour === 18 || hour === 19;
    if (goldenHour && this.dropKind !== 'rain') tint = mix(tint, 0xffcfa3, 0.22);
    if (this.dropKind === 'overcast' || this.dropKind === 'rain') tint = mix(tint, 0xb8c0c8, 0.25);
    this.ground.tint = tint;
    this.waterFx.tint = tint;
    this.workScenes.setTint(tint);
    this.frontier.setTint(tint);
    for (const pv of this.propViews.values()) pv.c.tint = tint;
    for (const w of this.walkers) w.c.tint = tint;
    for (const w of this.matchFans) w.c.tint = tint;
    for (const car of this.trafficCars) car.sprite.tint = tint;
    this.furniture.setTint(tint);
    this.waterLife.setTint(tint);
    for (const guard of this.militiaSprites) guard.tint = tint;
    for (const b of this.boats) b.c.tint = tint;
    for (const bird of this.birds) bird.c.tint = tint;
    for (const bv of this.buildingViews.values()) {
      bv.body.tint = tint;
      for (const rotor of bv.rotors) rotor.tint = tint;
      bv.glow.tint = 0xffffff;
      bv.glow.alpha = Math.min(0.65, this.night * 0.65) * windowLight(bv.kind, hour, bv.seed);
      // Do not light unbuilt or road-disconnected buildings.
      bv.glow.visible = this.night > 0.02 && bv.info.lights.length > 0 && bv.glow.alpha > 0.01;
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

  private spawnWalker(cart: boolean, fanMatch?: MatchDay, index = 0, s?: GameState): Walker | null {
    const starts = fanMatch && this.pavedRoadTiles.length ? this.pavedRoadTiles : this.roadTiles;
    if (!starts.length) return null;
    const start = starts[Math.floor(Math.random() * starts.length)]!;
    const c = new Container();
    const g = new Graphics();
    if (fanMatch) drawFootballSupporter(g, fanMatch, index);
    else if (cart) drawCart(g, [0xb98a5a, 0xe2bb45, 0x9aa0a6][Math.floor(Math.random() * 3)]!);
    // every walker is a real townsperson: their figure follows their age and sex
    const game = s ?? this.view()?.game;
    const total = game ? totalPopulation(homeProvince(game)) : 0;
    const adults = game ? homeProvince(game).population.adults : 0;
    const citizen = total ? Math.floor(Math.random() * (fanMatch ? Math.max(1, adults) : total)) : 0;
    const who = game && total ? citizenAt(game, citizen) : null;
    const look = !fanMatch && !cart
      ? randomPedLook(Math.random, this.dropKind === 'rain', who ? { kind: who.stage === 'child' ? 'child' : who.stage === 'elder' ? 'elder' : who.woman ? 'woman' : 'man', woman: who.woman } : undefined)
      : undefined;
    if (look) drawPedestrian(g, look, 0);
    c.addChild(g);
    const flare = fanMatch ? new Graphics() : undefined;
    if (flare) c.addChild(flare);
    c.scale.set(cart ? 0.72 : fanMatch ? 0.6 : PERSON_SCALE);
    c.cullable = true;
    this.objects.addChild(c);
    this.tintKey = -1;
    if (!cart) markPerson(c, { kind: 'citizen', index: citizen }, fanMatch ? 'Maç günü taraftar korteji ile yürüyor' : 'Şehirde yürüyor', fanMatch ? 30 : 22);
    return {
      citizen,
      child: who?.stage === 'child',
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
      ...(look ? { body: g, look } : {}),
    };
  }

  /**
   * Local militia visually follows connected roads (BFS), respecting the city's
   * road network instead of cutting through buildings or water.
   * Abstract tactical patrols are kept separate from the economy clock.
   */
  private updateMilitia(view: RendererView, p: Province, dt: number): void {
    const count = view.game.surprise?.kind === 'pirates' ? 0 : Math.min(8, Math.ceil((view.game.militia ?? 0) / 5));
    while (this.militiaSprites.length > count) {
      this.militiaSprites.pop()!.destroy({ children: true });
    }
    while (this.militiaSprites.length < count) {
      const i = this.militiaSprites.length;
      const c = new Container();
      const soldier = new Graphics();
      drawSoldier(soldier, kitFor(view.game.culture, i), 0);
      c.addChild(soldier);
      c.scale.set(SOLDIER_SCALE);
      c.cullable = true;
      this.objects.addChild(c);
      this.militiaSprites.push(c);
      markPerson(c, { kind: 'soldier', index: i }, 'Nöbet tutuyor', 34);
    }
    if (!count) return;
    const goal = view.game.armyTarget;
    if (this.militiaPos === null) {
      this.militiaPos = goal ? [goal.x, goal.y] : musterPoint(p);
      this.militiaTargetKey = goal ? `${goal.x},${goal.y}` : '';
    }
    const key = goal ? `${goal.x},${goal.y}` : '';
    if (key !== this.militiaTargetKey) {
      this.militiaTargetKey = key;
      this.militiaRoute = goal
        ? findGroundPath(p, this.militiaPos, [goal.x, goal.y]) ?? []
        : [];
      this.militiaRouteStep = 0;
      this.militiaRouteT = 0;
    }
    let pos: GridPoint = this.militiaPos;
    let heading: GridPoint = [0, 0];
    if (this.militiaRoute.length > 1 && this.militiaRouteStep < this.militiaRoute.length - 1) {
      if (view.game.speed !== 0 && !view.reducedMotion) this.militiaRouteT += dt / 650;
      while (this.militiaRouteT >= 1 && this.militiaRouteStep < this.militiaRoute.length - 1) {
        this.militiaRouteT -= 1;
        this.militiaRouteStep++;
      }
      const curr = this.militiaRoute[this.militiaRouteStep]!;
      const next = this.militiaRoute[Math.min(this.militiaRouteStep + 1, this.militiaRoute.length - 1)]!;
      this.militiaPos = curr;
      heading = [next[0] - curr[0], next[1] - curr[1]];
      pos = [curr[0] + (next[0] - curr[0]) * this.militiaRouteT,
        curr[1] + (next[1] - curr[1]) * this.militiaRouteT];
      if (this.militiaRouteStep >= this.militiaRoute.length - 1) {
        pos = next;
        this.militiaPos = next;
        this.militiaRoute = [];
      }
    }
    // march in a column of twos along the heading; stand in two ranks when halted
    const z = this.hz(p, Math.floor(pos[0]), Math.floor(pos[1]));
    const marching = heading[0] !== 0 || heading[1] !== 0;
    const [fx, fy] = marching ? heading : [1, 0];
    const frame = marching && view.game.speed !== 0 && !view.reducedMotion ? Math.floor(this.time / 120) % 8 : 0;
    for (let i = 0; i < this.militiaSprites.length; i++) {
      const c = this.militiaSprites[i]!;
      const rank = Math.floor(i / 2), file = i % 2 ? 0.14 : -0.14;
      // marching: a column of twos behind the leader; halted: two ranks side by side
      const along = marching ? -rank * 0.17 : (i % 2 ? -0.1 : 0.1);
      const across = marching ? file : (rank - 1.5) * 0.17;
      // offsets in tile space: `along` the heading, `across` it
      const u = pos[0] + 0.5 + fx * along - fy * across;
      const v = pos[1] + 0.5 + fy * along + fx * across;
      c.position.set(isoX(u, v), isoY(u, v) - z);
      c.zIndex = u + v + 0.05;
      setActivity(c, marching ? 'Emredilen noktaya yürüyor' : 'Nöbet tutuyor, silahı hazır');
      const soldier = c.children[0] as Graphics;
      const key = `${frame}|${marching ? `${fx},${fy}` : 'halt'}|${view.game.culture}`;
      if (soldier.label !== key) {
        soldier.label = key;
        drawSoldier(soldier, kitFor(view.game.culture, i), frame + (i % 2) * 4, marching ? fx : 0, marching ? fy : 0);
      }
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
    const wantVillagers = Math.round(Math.min(18, Math.max(0, Math.floor(totalPopulation(p) / 2) - this.workScenes.count)) * walkerShare(clockHour(view.game.tick)));
    const wantCarts = 0; // farm pickups drive with the street traffic (updateTraffic)
    const count = (cart: boolean): number => this.walkers.filter((w) => w.cart === cart).length;
    for (const cart of [false, true]) {
      const want = cart ? wantCarts : wantVillagers;
      while (count(cart) < want) {
        const w = this.spawnWalker(cart, undefined, 0, view.game);
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
          const fan = this.spawnWalker(false, match, i, view.game);
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
      // pedestrians wait at the kerb while the junction ahead shows red for their direction
      const nextT = w.t + step * w.speed;
      const kerb = 0.32;
      const waiting = !w.cart && w.t <= kerb + 1e-3 && nextT > kerb &&
        !this.signals.mayEnter(p, w.to[0], w.to[1], w.to[0] - w.from[0], w.to[1] - w.from[1], this.time);
      w.t = waiting ? Math.max(w.t, kerb) : nextT;
      if (waiting !== w.waiting && !w.cart)
        setActivity(w.c, waiting ? 'Karşıya geçmek için yeşil ışığı bekliyor' : walkerActivity(clockHour(view.game.tick), w.child));
      w.waiting = waiting;
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
      const bob = step > 0 && !w.cart && !w.waiting ? Math.sin(this.time / 90 + w.phase) * 0.9 : 0;
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
      if (w.body && w.look) {
        // stride frame follows real walking speed; standing figures hold frame 0
        const frame = step > 0 && !w.waiting ? Math.floor(this.time / (95 / Math.max(0.5, w.speed)) + w.phase * 3) % WALK_FRAMES : 0;
        const key = `${frame}|${dx},${dy}`;
        if (key !== w.shown) {
          w.shown = key;
          drawPedestrian(w.body, w.look, frame, dx, dy);
        }
      }
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
  /**
   * Fireworks after dark on match days (over the stadium) and while a city festival is on
   * (over the aquapark or the town centre).
   */
  private updateFireworks(view: RendererView, p: Province, dt: number): void {
    const hour = clockHour(view.game.tick);
    const evening = this.night > 0.5 && (hour >= 20 || hour < 1);
    const match = !!matchDayFor(view.game);
    const festival = !!view.game.edicts?.includes('festival_aquapark');
    const venue = (match && p.buildings.find((b) => b.definitionId === 'trabzon_stadium' && isBuilt(b))) ||
      (festival && p.buildings.find((b) => b.definitionId === 'aquapark' && isBuilt(b))) ||
      p.buildings.find((b) => b.definitionId === 'town_center');
    if (!venue) return;
    const [w, h] = footprintOf(venue);
    const cx = venue.x + w / 2, cy = venue.y + h / 2;
    this.fireworks.update(evening && (match || festival) && dt > 0, isoX(cx, cy), isoY(cx, cy) - this.hz(p, venue.x, venue.y) - 40, dt);
  }

  private updateTraffic(view: RendererView, p: Province, dt: number, motion: boolean): void {
    const isPaved = (x: number, y: number): boolean => {
      const t = tileAt(p, x, y);
      return !!t?.road && (t.roadType === 'bridge' || (!!t.paved && t.roadType === 'dirt'));
    };
    const isLane = (x: number, y: number): boolean => {
      const t = tileAt(p, x, y);
      return !!t?.road && t.roadType !== 'stairs' && t.roadType !== 'tunnel';
    };
    const drivable = (rural: boolean) => (rural ? isLane : isPaved);
    const neighbors = (x: number, y: number, rural: boolean): [number, number][] => {
      const ok = drivable(rural);
      const h = tileAt(p, x, y)?.height ?? 0;
      return NEIGHBORS4.map(([dx, dy]) => [x + dx, y + dy] as [number, number]).filter(([nx, ny]) => {
        if (!ok(nx, ny)) return false;
        const dh = Math.abs((tileAt(p, nx, ny)?.height ?? 0) - h);
        return rural ? dh <= 1 : dh === 0;
      });
    };
    /** Junctions and corners need a clear box before a vehicle turns into them. */
    const isJunction = (x: number, y: number, rural: boolean): boolean => {
      const n = neighbors(x, y, rural);
      if (n.length !== 2) return n.length > 2;
      return n[0]![0] !== n[1]![0] && n[0]![1] !== n[1]![1];
    };
    if (this.trafficCacheTiles !== p.tiles) {
      this.trafficCacheTiles = p.tiles;
      this.cachedLinkedRoads = this.roadTiles.filter(([x, y]) => isPaved(x, y) && neighbors(x, y, false).length > 0);
      this.cachedLaneRoads = this.roadTiles.filter(([x, y]) => isLane(x, y) && neighbors(x, y, true).length > 0);
    }
    const linked = this.cachedLinkedRoads;
    const lanes = this.cachedLaneRoads;
    // rush hours fill the streets, nights empty them (see dayRhythm.ts)
    const desired = Math.round(Math.min(14, Math.floor(linked.length / 3)) * trafficShare(clockHour(view.game.tick)));
    const desiredCarts = lanes.length ? Math.min(3, p.buildings.filter((b) => specOf(b).produces && isOperating(b)).length) : 0;
    const remove = (car: TrafficCar): void => {
      // fade out where it stands rather than vanish in a blink
      this.fadingCars.push(car.c);
      this.trafficCars.splice(this.trafficCars.indexOf(car), 1);
    };
    for (const c of [...this.fadingCars]) {
      c.alpha -= dt / 450;
      if (c.alpha <= 0) {
        c.destroy({ children: true });
        this.fadingCars.splice(this.fadingCars.indexOf(c), 1);
      }
    }
    // Deleted or demolished roads must immediately release their vehicles.
    for (const car of [...this.trafficCars])
      if (!drivable(car.rural)(car.from[0], car.from[1]) || !drivable(car.rural)(car.to[0], car.to[1])) remove(car);
    const count = (rural: boolean): number => this.trafficCars.filter((c) => c.rural === rural).length;
    for (const rural of [false, true]) {
      const want = rural ? desiredCarts : desired;
      while (count(rural) > want) remove(this.trafficCars.find((c) => c.rural === rural)!);
      const pool = rural ? lanes : linked;
      let attempts = 0;
      while (count(rural) < want && attempts++ < 18 && pool.length) {
        const start = pool[Math.floor(Math.random() * pool.length)]!;
        const possible = neighbors(start[0], start[1], rural);
        if (!possible.length) continue;
        // never spawn on top of another vehicle
        if (this.trafficCars.some((car) => Math.hypot(car.px - start[0] - 0.5, car.py - start[1] - 0.5) < 0.8)) continue;
        const to = possible[Math.floor(Math.random() * possible.length)]!;
        this.trafficCars.push(this.makeVehicle(view, p, rural, linked.length, start, to));
      }
    }
    const uk = view.game.cityId === 'edinburgh' ||
      (!view.game.cityId && view.game.culture === 'scottish');
    const lengthOf = (car: TrafficCar): number => {
      if (car.rural) return 0.44;
      const m = modelLength(car.variant);
      return m === 2 ? 0.66 : m === 0 ? 0.22 : 0.42;
    };
    const agents: TrafficAgent[] = this.trafficCars.map((car) => ({ id: car.id, x: car.px, y: car.py, hx: car.hx, hy: car.hy, len: lengthOf(car) }));
    // journey vehicles (ambulances, deliveries, visitors) keep their schedule: everyone gives way to them
    const journeys: TrafficAgent[] = this.cityScenes.drivers.map((d, i) => ({ id: -1 - i, ...d }));
    const all = [...agents, ...journeys];
    const held = heldByFollowing(all);
    for (const a of agents) if (journeys.some((j) => blocksFollowing(a, j))) held.add(a.id);
    const running = motion && view.game.speed !== 0;
    const startT = new Map(this.trafficCars.map((c) => [c.id, c.t]));
    let step = 0;
    for (const car of [...this.trafficCars]) {
      const me = agents.find((a) => a.id === car.id)!;
      if (running) {
        if (held.has(car.id)) {
          car.waited += dt;
          car.v = 0;
        }
        else {
          // pull away smoothly: the throttle opens over about half a second
          car.v = Math.min(1, car.v + dt / 550);
          const next = car.t + Math.min(0.12, dt / 1000) * car.speed * (0.25 + 0.75 * car.v);
          const stop = modelLength(car.variant) === 2 && !car.rural ? 0.18 : 0.3;
          const crossing = car.t <= stop + 1e-3 && next > stop;
          const red = crossing && !this.signals.mayEnter(p, car.to[0], car.to[1], car.to[0] - car.from[0], car.to[1] - car.from[1], this.time);
          const boxBlocked = crossing && !red && isJunction(car.to[0], car.to[1], car.rural) && !junctionClear(me, all, car.to[0], car.to[1]);
          if (red || boxBlocked) {
            car.t = Math.max(car.t, stop);
            car.v = 0;
          }
          else {
            // last guard: never drive into another body, whatever the rules above missed
            const [nx, ny] = this.lanePoint(car, Math.min(next, 1), uk);
            const moved = { ...me, x: nx, y: ny };
            const hit = all.some((o) => o.id !== me.id && bodiesOverlap(moved, o) && !bodiesOverlap(me, o));
            if (hit) {
              car.waited += dt;
              car.v = 0;
            } else car.t = next;
          }
          // a red light is a normal wait; only jams count towards giving up
          if (boxBlocked) car.waited += dt;
          else if (!red && car.t === next) car.waited = 0;
        }
        // gridlock: the vehicle turns off the map rather than drive through another one
        if (car.waited > 9000) {
          remove(car);
          continue;
        }
      }
      if (car.t >= 1) {
        car.prev = car.from;
        car.from = car.to;
        const directions = neighbors(car.from[0], car.from[1], car.rural);
        const forward = directions.filter(([x, y]) => x !== car.prev[0] || y !== car.prev[1]);
        const choice = forward.length ? forward : directions;
        car.to = choice.length ? choice[Math.floor(Math.random() * choice.length)]! : car.from;
        car.t = 0;
      }
      this.placeVehicle(view, p, car, uk);
      if (car.c.alpha >= 1) step = Math.max(step, Math.hypot(car.px - me.x, car.py - me.y));
      // later cars this frame see where this one is now
      me.x = car.px;
      me.y = car.py;
      me.hx = car.hx;
      me.hy = car.hy;
    }
    this.cityScenes.obstacles = this.trafficCars.map((c) => ({ x: c.px, y: c.py, hx: c.hx, hy: c.hy }));
    this.trafficMoving = this.trafficCars.filter((c) => c.t !== startT.get(c.id)).length;
    let overlaps = 0;
    for (let i = 0; i < agents.length; i++)
      for (let j = i + 1; j < all.length; j++) if (bodiesOverlap(agents[i]!, all[j]!)) overlaps++;
    this.trafficOverlaps = overlaps;
    // largest move of a vehicle in one frame (tiles), ambient and journeys: a jump shows up here
    this.trafficStep = Math.max(step, this.cityScenes.maxStep);
  }

  private nextVehicleId = 1;
  private fadingCars: Container[] = [];
  /** Vehicles that moved in the last frame and body overlaps left on screen (stats, tests). */
  private trafficMoving = 0;
  private trafficOverlaps = 0;
  private trafficStep = 0;

  private makeVehicle(view: RendererView, p: Province, rural: boolean, roads: number, start: [number, number], to: [number, number]): TrafficCar {
    const holder = new Container();
    const body = new Graphics();
    const paints = [0xe4e7ec, 0xbe4741, 0x345a89, 0x364b54, 0xe4b755, 0x7d9a75];
    const n = this.trafficCars.length;
    const paint = paints[n % paints.length]!;
    const electric = !rural && n % 3 === 0;
    const cal = calendar(view.game.tick);
    const variant = rural ? 4 : trafficModel(n, start[0] * 5 + start[1] * 7, roads, clockHour(view.game.tick), cal.season, this.dropKind === 'snow',
      p.buildings.some((b) => b.definitionId === 'bus_depot' && isOperating(b)));
    const load = [0xc9a24a, 0x7c9b47, 0xa8743f][Math.floor(Math.random() * 3)]!;
    const beam = new Graphics();
    holder.addChild(beam, body);
    holder.scale.set(VEHICLE_SCALE);
    holder.cullable = true;
    holder.alpha = 0;
    this.objects.addChild(holder);
    const car: TrafficCar = {
      id: this.nextVehicleId++, rural, load, waited: 0, v: 0,
      px: start[0] + 0.5, py: start[1] + 0.5, hx: to[0] - start[0], hy: to[1] - start[1],
      c: holder, sprite: body, beam, paint, electric, variant, heading: '',
      from: [start[0], start[1]], to,
      prev: [start[0], start[1]], t: 0,
      speed: rural ? 0.5 : (0.5 + Math.random() * 0.22) * modelSpeed(variant),
    };
    this.tintKey = -1;
    return car;
  }

  /** Lane position (tile coordinates) of a vehicle at progress t on its current segment. */
  private lanePoint(car: TrafficCar, t: number, uk: boolean): [number, number] {
    const dx = car.to[0] - car.from[0], dy = car.to[1] - car.from[1];
    const [lx, ly] = smoothVehicleTurnOffset(car.from[0] - car.prev[0], car.from[1] - car.prev[1], dx, dy, t, uk);
    return [car.from[0] + dx * t + 0.5 + lx, car.from[1] + dy * t + 0.5 + ly];
  }

  /** Redraws a vehicle for its heading and moves it into its lane. */
  private placeVehicle(view: RendererView, p: Province, car: TrafficCar, uk: boolean): void {
    const dx = car.to[0] - car.from[0];
    const dy = car.to[1] - car.from[1];
    const prevDx0 = car.from[0] - car.prev[0];
    const prevDy0 = car.from[1] - car.prev[1];
    // turn the body through the corner instead of snapping it round at the junction centre
    const [hx, hy] = turnHeading(prevDx0, prevDy0, dx, dy, car.t);
    const heading = `${Math.round(hx * 40)},${Math.round(hy * 40)}`;
    if (car.heading !== heading && (dx !== 0 || dy !== 0)) {
      car.sprite.clear();
      if (car.rural) drawCart(car.sprite, car.load, hx, hy);
      else drawTrafficVehicle(car.sprite, car.variant, car.paint, car.electric, hx, hy, view.game.culture);
      car.beam.clear();
      drawHeadlights(car.beam, hx, hy, car.rural ? 0.4 : modelLength(car.variant) === 2 ? 0.62 : modelLength(car.variant) === 0 ? 0.25 : 0.4);
      car.heading = heading;
    }
    car.beam.visible = this.night > 0.3;
    car.beam.alpha = Math.min(1, (this.night - 0.3) * 2);
    const x = car.from[0] + dx * car.t + 0.5;
    const y = car.from[1] + dy * car.t + 0.5;
    const prevDx = car.from[0] - car.prev[0];
    const prevDy = car.from[1] - car.prev[1];
    const [laneX, laneY] = smoothVehicleTurnOffset(prevDx, prevDy, dx, dy, car.t, uk);
    const lift = this.hz(p, car.from[0], car.from[1]) * (1 - car.t) + this.hz(p, car.to[0], car.to[1]) * car.t;
    car.px = x + laneX;
    car.py = y + laneY;
    if (dx || dy) {
      car.hx = dx;
      car.hy = dy;
    }
    car.c.position.set(isoX(car.px, car.py), isoY(car.px, car.py) - lift);
    if (car.c.alpha < 1) car.c.alpha = Math.min(1, car.c.alpha + 0.06);
    car.c.zIndex = car.px + car.py + 0.035;
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
    const [w, h] = this.rot % 2 === 1 ? [def.footprint[1], def.footprint[0]] : def.footprint;
    if (def.services?.patrolRadius) {
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
    this.outline(g, x - r, y - r, w + 2 * r, h + 2 * r, COLORS.range, 2, 0.7);
    for (const i of tilesInRange(p, def, x, y)) {
      if (p.tiles[i]!.deposit > 0) this.tileFill(g, i % p.width, Math.floor(i / p.width), COLORS.range, 0.32);
    }
  }

  private drawOverlays(view: RendererView, p: Province, pal: SeasonPalette): void {
    const g = this.under;
    g.clear();
    const { tool } = view;
    let hover = this.hover;
    if (tool.kind === 'build' && view.placement) {
      const [width, height] = this.trueSize();
      const footprint = BUILDINGS[tool.buildingId].footprint;
      hover = rotRect(view.placement.x, view.placement.y, ...footprint, width, height, this.rot);
    }
    let ghostSig = '';

    const selected = view.selectedBuildingId ? buildingById(p, view.selectedBuildingId) : undefined;
    if (selected) {
      const [w, h] = footprintOf(selected);
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
          this.outline(g, x, y, 1, 1, 0x58c6ce, 2, 0.92);
        }
        if (plan.blocked) {
          this.tileFill(g, plan.blocked.x, plan.blocked.y, COLORS.bad, 0.6);
        }
      }
      const anchor = tool.start ?? hover;
      if (anchor) this.outline(g, anchor.x, anchor.y, 1, 1, COLORS.select, 3, 0.95);
    } else if (hover) {
      if (tool.kind === 'build') {
        const [fw, fh] = this.toolFootprint(tool.buildingId);
        const trueAnchor = this.outTile(hover.x, hover.y);
        const trueGame = this.cb.getView()?.game ?? view.game;
        const ok =
          validatePlacement(trueGame, tool.buildingId, trueAnchor.x, trueAnchor.y, tool.style ?? view.game.culture, tool.look ?? null) ===
          null;
        this.drawRange(g, p, tool.buildingId, hover.x, hover.y);
        for (let y = hover.y; y < hover.y + fh; y++)
          for (let x = hover.x; x < hover.x + fw; x++)
            if (tileAt(p, x, y)) this.tileFill(g, x, y, ok ? COLORS.ok : COLORS.bad, 0.5);
        this.outline(g, hover.x, hover.y, fw, fh, ok ? COLORS.ok : COLORS.bad, 2, 0.95);
        const mirrored = fw !== BUILDINGS[tool.buildingId].footprint[0];
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
            false,
            mirrored,
          );
          this.ghost.scale.x = mirrored ? -1 : 1;
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
        const ok = !!t && marchable(p, hover.x, hover.y, [hover.x, hover.y]) && (view.game.militia ?? 0) > 0;
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
        if (b) this.outline(g, b.x, b.y, footprintOf(b)[0], footprintOf(b)[1], color, 2, 0.85);
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