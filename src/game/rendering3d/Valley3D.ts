import { CityActors3D } from './cityActors3d';
import * as THREE from 'three';
import type { BuildingId, BuildingInstance, Province, Tile } from '../core/types';
import { calendar, clockHour } from '../core/time';
import type { Season } from '../core/time';
import { MAX_HEIGHT } from '../data/balance';
import { BUILDINGS, defOf, specOf } from '../data/buildings';
import { validatePlacement } from '../systems/commands';
import { homeProvince, isBuilt } from '../systems/economy';
import { buildingById, footprintTiles, tileAt, tilesInRange } from '../systems/grid';
import { checkRoadSite } from '../systems/placement';
import { requiredTicks } from '../systems/tick';
import { conditionBand } from '../systems/architecture';
import { COLORS, SEASON_PALETTE } from '../rendering/palette';
import type { SeasonPalette } from '../rendering/palette';
import { nightFactor, weatherFor } from '../rendering/weather';
import type { Weather } from '../rendering/weather';
import type { RendererHost, RendererOptions, RendererStats, RendererView } from '../rendering/ValleyRenderer';
import type { ValleyView } from '../rendering/view';
import { Actors3D } from './actors3d';
import { buildModel, buildSite } from './buildings3d';
import { Builder, LEVEL_H, mixHex } from './geo';
import { Terrain3D, standY } from './terrain3d';
import { TiltShift } from './tiltShift';

const FOV = 26;
const ELEVATION = (40 * Math.PI) / 180;
const MIN_DIST = 5;
/** Unit vector from the look-at point towards the camera (tile x runs right-down, y left-down). */
const VIEW_DIR = new THREE.Vector3(Math.cos(ELEVATION) * Math.SQRT1_2, Math.sin(ELEVATION), Math.cos(ELEVATION) * Math.SQRT1_2);

interface BuildingView3D {
  group: THREE.Group;
  body: THREE.Mesh;
  lit: THREE.Mesh;
  badge: THREE.Sprite;
  barBack: THREE.Sprite;
  bar: THREE.Sprite;
  sig: string;
  height: number;
}

type BadgeKind = 'none' | 'disconnected' | 'unpaid' | 'unstaffed';

function badgeTexture(kind: Exclude<BadgeKind, 'none'>): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.lineWidth = 5;
  g.strokeStyle = '#ffffff';
  if (kind === 'disconnected') {
    g.fillStyle = '#e5484d';
    g.beginPath();
    g.moveTo(32, 4);
    g.lineTo(60, 32);
    g.lineTo(32, 60);
    g.lineTo(4, 32);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(22, 22);
    g.lineTo(42, 42);
    g.moveTo(42, 22);
    g.lineTo(22, 42);
    g.stroke();
  } else if (kind === 'unpaid') {
    g.fillStyle = '#e08a2e';
    g.beginPath();
    g.roundRect(6, 6, 52, 52, 10);
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(32, 32, 13, 0, Math.PI * 2);
    g.stroke();
  } else {
    g.fillStyle = '#f2c230';
    g.beginPath();
    g.arc(32, 32, 26, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#3a2a1c';
    g.fillRect(28, 14, 8, 22);
    g.beginPath();
    g.arc(32, 46, 5, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Three.js view of the home province: real perspective, sun shadows and depth-of-field. Like the
 * 2D renderer it never mutates game state — input is reported through RendererHost callbacks.
 */
export class Valley3D implements ValleyView {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 500);
  private sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  private hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6f7a55, 1.25);
  private fog = new THREE.Fog(0xbfe3f2, 30, 200);
  private terrain = new Terrain3D();
  private actors = new Actors3D();
  private cityActors = new CityActors3D();
  private post: TiltShift | null = null;
  /** Countryside beyond the playable map, so the valley does not float in the sky. */
  private apron = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: 0x6fae4a }));
  private buildingMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffc56b, emissiveIntensity: 0 });
  private ghostMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
  private overlayMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  private overlay = new THREE.Mesh(new THREE.BufferGeometry(), this.overlayMat);
  private ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat);
  private buildings = new THREE.Group();
  private buildingViews = new Map<string, BuildingView3D>();
  private badges = new Map<string, THREE.SpriteMaterial>();
  private barMats = [new THREE.SpriteMaterial({ color: 0x2a2118, depthTest: false }), new THREE.SpriteMaterial({ color: 0x8fe06a, depthTest: false })];
  private raycaster = new THREE.Raycaster();
  private target = new THREE.Vector3(16, 0, 16);
  private dist = 40;
  private maxDist = 80;
  private width = 2;
  private depth = 2;
  private viewport = { width: 0, height: 0 };
  private canvasSize = { width: 1, height: 1 };
  private opts: RendererOptions = { resolution: 2, antialias: true, cacheBodies: false };
  private shadows = true;
  private host!: HTMLElement;
  private raf = 0;
  private lastFrame = 0;
  private time = 0;
  private fps = 60;
  private fpsSamples: number[] = [];
  private lowFpsAt = -1e9;
  private night = 0;
  private weather: Weather = 'clear';
  private lastTiles: Tile[] | null = null;
  private lastSeason: Season | null = null;
  private overlaySig = '';
  private ghostSig = '';
  private hover: { x: number; y: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { lastX: number; lastY: number; total: number; button: number; paint: boolean } | null = null;
  private pinch: { dist: number } | null = null;
  private lastPaint = '';
  private destroyed = false;
  private cleanup: (() => void)[] = [];

  private constructor(private cb: RendererHost) {}

  static async create(host: HTMLElement, cb: RendererHost, opts?: Partial<RendererOptions>): Promise<Valley3D> {
    const r = new Valley3D(cb);
    r.opts = { ...r.opts, ...opts };
    r.host = host;
    // Expensive depth-of-field is reserved for Ultra; medium draws without shadows.
    const usePost = r.opts.resolution > 2;
    r.shadows = r.opts.resolution >= 2;
    const renderer = new THREE.WebGLRenderer({ antialias: r.opts.antialias && !usePost, powerPreference: 'high-performance' });
    r.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, r.opts.resolution, 1.5));
    renderer.shadowMap.enabled = r.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    if (usePost) r.post = new TiltShift(0);
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('aria-label', 'Vadi haritası (3D)');
    host.appendChild(canvas);

    r.scene.fog = r.fog;
    r.scene.background = new THREE.Color(0xbfe3f2);
    r.sun.castShadow = r.shadows;
    const mapSize = r.opts.resolution > 2 ? 2048 : 1024;
    r.sun.shadow.mapSize.set(mapSize, mapSize);
    r.sun.shadow.bias = -0.0006;
    r.sun.shadow.normalBias = 0.03;
    r.apron.rotation.x = Math.PI / 2;
    r.apron.position.y = -0.02;
    (r.apron.material as THREE.Material).side = THREE.DoubleSide;
    r.apron.receiveShadow = r.shadows;
    r.overlay.renderOrder = 3;
    r.ghost.visible = false;
    r.terrain.setShadows(r.shadows);
    r.actors.setShadows(r.shadows);
    r.scene.add(r.hemi, r.sun, r.sun.target, r.apron, r.terrain.group, r.buildings, r.actors.group, r.cityActors.group, r.overlay, r.ghost);

    r.bindInput(canvas);
    r.resize();
    r.resetCamera();
    const observer = new ResizeObserver(() => r.resize());
    observer.observe(host);
    r.cleanup.push(() => observer.disconnect());
    r.lastFrame = performance.now();
    r.raf = requestAnimationFrame(r.frame);
    return r;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanup) fn();
    for (const view of this.buildingViews.values()) this.disposeBuilding(view);
    this.buildingViews.clear();
    this.terrain.dispose();
    this.actors.dispose();
    this.cityActors.dispose();
    this.post?.dispose();
    this.overlay.geometry.dispose();
    this.ghost.geometry.dispose();
    this.apron.geometry.dispose();
    (this.apron.material as THREE.Material).dispose();
    for (const m of [this.buildingMat, this.litMat, this.ghostMat, this.overlayMat, ...this.barMats]) m.dispose();
    for (const m of this.badges.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  getStats(): RendererStats {
    return {
      fps: Math.round(this.fps),
      night: Math.round(this.night * 100) / 100,
      weather: this.weather,
      textures: this.renderer.info.memory.textures,
      buildings: this.buildingViews.size,
      props: this.terrain.propCount,
      walkers: this.actors.count,
      particles: 0,
    };
  }

  // ------------------------------------------------------------------ camera

  private resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.canvasSize = { width, height };
    this.renderer.setSize(width, height, false);
    const ratio = this.renderer.getPixelRatio();
    this.post?.setSize(Math.round(width * ratio), Math.round(height * ratio));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private placeCamera(): void {
    this.target.x = Math.max(0, Math.min(this.width, this.target.x));
    this.target.z = Math.max(0, Math.min(this.depth, this.target.z));
    this.dist = Math.max(MIN_DIST, Math.min(this.maxDist, this.dist));
    this.camera.position.copy(this.target).addScaledVector(VIEW_DIR, this.dist);
    this.camera.near = Math.max(0.5, this.dist * 0.12);
    this.camera.far = this.dist * 6 + 120;
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  resetCamera(): void {
    const { width, height } = this.canvasSize;
    this.viewport = { width, height };
    const tan = Math.tan((FOV * Math.PI) / 360);
    const diagonal = Math.hypot(this.width, this.depth);
    // keep room for the top HUD and the bottom toolbar, like the 2D view does
    const usable = Math.max(0.35, (height - 146) / height);
    const fitWidth = (diagonal * 1.04) / (2 * tan * (width / height));
    const fitHeight = (diagonal * Math.sin(ELEVATION) + MAX_HEIGHT * LEVEL_H) / (2 * tan * usable);
    this.maxDist = Math.max(fitWidth, fitHeight) * 1.25;
    this.dist = Math.max(fitWidth, fitHeight);
    this.target.set(this.width / 2, 0, this.depth / 2);
    this.placeCamera();
  }

  centerOnTile(x: number, y: number): void {
    this.target.set(x, 0, y);
    this.placeCamera();
  }

  tileToClient(x: number, y: number): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const view = this.cb.getView();
    const h = view ? standY(tileAt(homeProvince(view.game), x, y)) : 0;
    const v = new THREE.Vector3(x + 0.5, h, y + 0.5).project(this.camera);
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  private setRay(sx: number, sy: number): THREE.Ray {
    const { width, height } = this.canvasSize;
    this.raycaster.setFromCamera(new THREE.Vector2((sx / width) * 2 - 1, 1 - (sy / height) * 2), this.camera);
    return this.raycaster.ray;
  }

  /** Point where the view ray through a canvas pixel meets the plane y = `level`. */
  private groundPoint(sx: number, sy: number, level = 0): THREE.Vector3 | null {
    const ray = this.setRay(sx, sy);
    if (ray.direction.y >= -1e-4) return null;
    const t = (level - ray.origin.y) / ray.direction.y;
    return ray.origin.clone().addScaledVector(ray.direction, t);
  }

  zoomBy(factor: number, sx = this.canvasSize.width / 2, sy = this.canvasSize.height / 2): void {
    const before = this.groundPoint(sx, sy);
    this.dist /= factor;
    this.placeCamera();
    const after = this.groundPoint(sx, sy);
    if (before && after) {
      this.target.add(before.sub(after));
      this.placeCamera();
    }
  }

  panBy(dx: number, dy: number): void {
    const perPixel = (2 * this.dist * Math.tan((FOV * Math.PI) / 360)) / this.canvasSize.height;
    // screen-right on the ground is (+x, -z); screen-up is away from the camera (-x, -z)
    this.target.x += (-dx * Math.SQRT1_2 - (dy * Math.SQRT1_2) / Math.sin(ELEVATION)) * perPixel;
    this.target.z += (dx * Math.SQRT1_2 - (dy * Math.SQRT1_2) / Math.sin(ELEVATION)) * perPixel;
    this.placeCamera();
  }

  // ------------------------------------------------------------------ input

  private tileFromEvent(e: { clientX: number; clientY: number }): { fx: number; fy: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const view = this.cb.getView();
    const flat = this.groundPoint(sx, sy);
    if (view) {
      // raised ground: the first level (from the top) whose tile really is that high is what we see
      const p = homeProvince(view.game);
      for (let h = MAX_HEIGHT; h >= 0; h--) {
        const hit = this.groundPoint(sx, sy, h * LEVEL_H);
        if (hit && tileAt(p, Math.floor(hit.x), Math.floor(hit.z))?.height === h) return { fx: hit.x, fy: hit.z };
      }
    }
    return flat ? { fx: flat.x, fy: flat.z } : { fx: -1, fy: -1 };
  }

  private pickBuilding(e: { clientX: number; clientY: number }): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.setRay(e.clientX - rect.left, e.clientY - rect.top);
    const hit = this.raycaster.intersectObjects([...this.buildingViews.values()].map((v) => v.body), false)[0];
    return (hit?.object.userData.buildingId as string | undefined) ?? null;
  }

  private setHover(tile: { x: number; y: number } | null): void {
    if (tile?.x === this.hover?.x && tile?.y === this.hover?.y) return;
    this.hover = tile;
    this.cb.onHover(tile);
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void => {
      canvas.addEventListener(type, fn, opts);
      this.cleanup.push(() => canvas.removeEventListener(type, fn, opts));
    };
    const paint = (e: PointerEvent): void => {
      const { fx, fy } = this.tileFromEvent(e);
      const key = `${Math.floor(fx)},${Math.floor(fy)}`;
      if (key === this.lastPaint) return;
      this.lastPaint = key;
      this.cb.onRoadPaint(Math.floor(fx), Math.floor(fy));
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
      const inside = tx >= 0 && ty >= 0 && tx < this.width && ty < this.depth;
      if (e.pointerType === 'mouse' || this.drag?.paint) this.setHover(inside ? { x: tx, y: ty } : null);
      if (!this.pointers.has(e.pointerId)) return;
      const prev = this.pointers.get(e.pointerId)!;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const rect = canvas.getBoundingClientRect();
        this.zoomBy(dist / Math.max(1, this.pinch.dist), (a!.x + b!.x) / 2 - rect.left, (a!.y + b!.y) / 2 - rect.top);
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
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      const pickTall = view.tool.kind === 'select' || view.tool.kind === 'demolish';
      const buildingId = (pickTall ? this.pickBuilding(e) : null) ?? tileAt(p, x, y)?.buildingId ?? null;
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

  private frame = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    const view = this.cb.getView();
    const elapsed = now - this.lastFrame;
    this.lastFrame = now;
    if (!view) return;
    const dt = Math.min(Math.max(elapsed, 0), 100);
    if (elapsed > 0) this.fps += (1000 / elapsed - this.fps) * 0.08;
    this.time += dt;
    const p = homeProvince(view.game);
    if (this.canvasSize.width !== this.viewport.width || this.canvasSize.height !== this.viewport.height) this.resetCamera();
    if (p.width !== this.width || p.height !== this.depth) {
      this.width = p.width;
      this.depth = p.height;
      // a huge plain with a hole exactly where the map is (lakes and rivers lie below its level)
      const land = new THREE.Shape([new THREE.Vector2(-450, -450), new THREE.Vector2(450 + p.width, -450), new THREE.Vector2(450 + p.width, 450 + p.height), new THREE.Vector2(-450, 450 + p.height)]);
      land.holes.push(new THREE.Path([new THREE.Vector2(0, 0), new THREE.Vector2(0, p.height), new THREE.Vector2(p.width, p.height), new THREE.Vector2(p.width, 0)]));
      this.apron.geometry.dispose();
      this.apron.geometry = new THREE.ShapeGeometry(land);
      this.resetCamera();
    }
    const cal = calendar(view.game.tick);
    const pal = SEASON_PALETTE[cal.season];
    const motion = !view.reducedMotion;

    if (p.tiles !== this.lastTiles || cal.season !== this.lastSeason) {
      const previous = this.lastTiles;
      const groundChanged =
        !previous || cal.season !== this.lastSeason || previous.length !== p.tiles.length ||
        p.tiles.some((tile, i) => {
          const old = previous[i]!;
          return tile !== old && (tile.terrain !== old.terrain || tile.variant !== old.variant || tile.height !== old.height ||
            tile.road !== old.road || tile.roadType !== old.roadType || tile.paved !== old.paved);
        });
      if (groundChanged) {
        this.terrain.syncGround(p, pal);
        (this.apron.material as THREE.MeshLambertMaterial).color.setHex(mixHex(pal.grass[0]!, 0x000000, 0.06));
      }
      this.terrain.syncProps(p, pal);
      this.lastTiles = p.tiles;
      this.lastSeason = cal.season;
    }
    this.updateLight(view, pal, cal.day, cal.season, dt);
    this.syncBuildings(p);
    this.cityActors.update(view.game, p, dt, !motion);
    this.terrain.update(this.night, dt, motion);
    this.actors.update(
      {
        game: view.game,
        huntMode: view.tool.kind === 'hunt',
        leftSideDriving: view.game.cityId === 'edinburgh' || (!view.game.cityId && view.game.culture === 'scottish'),
      },
      p, dt, motion,
    );
    this.drawOverlays(view, p);
    this.watchFps(view);

    if (this.post) this.post.render(this.renderer, this.scene, this.camera, this.dist, view.detail >= 2 ? 9 : 6);
    else this.renderer.render(this.scene, this.camera);
  };

  private watchFps(view: RendererView): void {
    if (!view.autoQuality) return;
    this.fpsSamples.push(this.fps);
    if (this.fpsSamples.length < 120) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples = [];
    if (avg < 30 && this.time - this.lowFpsAt > 20000) {
      this.lowFpsAt = this.time;
      this.cb.onLowFps?.(Math.round(avg));
    }
  }

  /** Sun, sky and fog follow the HUD clock, the season and the day's weather. */
  private updateLight(view: RendererView, pal: SeasonPalette, day: number, season: Season, dt: number): void {
    const hour = clockHour(view.game.tick);
    const goal = view.dayNight ? nightFactor(hour) : 0;
    this.night += (goal - this.night) * (view.reducedMotion ? 1 : Math.min(1, dt / 420));
    if (Math.abs(this.night - goal) < 0.004) this.night = goal;
    this.weather = view.weather ? weatherFor(view.game.seed, day, season) : 'clear';
    const dull = this.weather === 'overcast' || this.weather === 'rain' || this.weather === 'snow' ? 1 : 0;
    const n = this.night;
    const sky = mixHex(mixHex(pal.sky, 0xb8c0c8, dull * 0.55), 0x0b1426, n * 0.92);
    (this.scene.background as THREE.Color).setHex(sky);
    this.fog.color.setHex(sky);
    this.fog.near = this.dist * 1.15;
    this.fog.far = this.dist * 4.2 + 30;
    this.sun.color.setHex(mixHex(mixHex(0xfff1d6, 0xdfe6ee, dull), 0x7f9fe0, n));
    this.sun.intensity = (2.3 - dull * 0.9) * (1 - n * 0.86);
    this.hemi.color.setHex(mixHex(0xcfe6ff, 0x32456f, n));
    this.hemi.groundColor.setHex(mixHex(0x6f7a55, 0x1b2233, n));
    this.hemi.intensity = (1.2 + dull * 0.35) * (1 - n * 0.42);
    this.litMat.emissiveIntensity = n * 0.95;
    // light from the upper left of the screen, swinging a little through the day
    const swing = Math.sin(((Math.min(19, Math.max(6, hour)) - 12.5) / 13) * Math.PI);
    const dir = new THREE.Vector3(-0.35 + swing * 0.45, 1.15, 0.85 - Math.abs(swing) * 0.2).normalize();
    this.sun.target.position.copy(this.target);
    this.sun.position.copy(this.target).addScaledVector(dir, 90);
    if (this.shadows) {
      const half = Math.max(8, Math.min(46, this.dist * 0.62));
      const cam = this.sun.shadow.camera;
      if (cam.right !== half) {
        cam.left = cam.bottom = -half;
        cam.right = cam.top = half;
        cam.near = 1;
        cam.far = 220;
        cam.updateProjectionMatrix();
      }
    }
  }

  // ------------------------------------------------------------------ buildings

  private badge(kind: BadgeKind): THREE.SpriteMaterial | null {
    if (kind === 'none') return null;
    let m = this.badges.get(kind);
    if (!m) this.badges.set(kind, (m = new THREE.SpriteMaterial({ map: badgeTexture(kind), depthTest: false, transparent: true })));
    return m;
  }

  private disposeBuilding(view: BuildingView3D): void {
    this.buildings.remove(view.group);
    view.body.geometry.dispose();
    view.lit.geometry.dispose();
  }

  private syncBuildings(p: Province): void {
    const seen = new Set<string>();
    for (const b of p.buildings) {
      seen.add(b.id);
      let bv = this.buildingViews.get(b.id);
      if (!bv) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BufferGeometry(), this.buildingMat);
        const lit = new THREE.Mesh(new THREE.BufferGeometry(), this.litMat);
        body.castShadow = body.receiveShadow = this.shadows;
        body.userData.buildingId = b.id;
        const badge = new THREE.Sprite(this.barMats[0]);
        const barBack = new THREE.Sprite(this.barMats[0]);
        const bar = new THREE.Sprite(this.barMats[1]);
        for (const s of [badge, barBack, bar]) s.renderOrder = 4;
        bar.center.set(0, 0.5);
        group.add(body, lit, badge, barBack, bar);
        const base = Math.min(...footprintTiles(defOf(b), b.x, b.y).map(([fx, fy]) => tileAt(p, fx, fy)?.height ?? 0));
        group.position.set(b.x, base * LEVEL_H, b.y);
        this.buildings.add(group);
        bv = { group, body, lit, badge, barBack, bar, sig: '', height: 0.6 };
        this.buildingViews.set(b.id, bv);
      }
      const ratio = b.state === 'active' ? 1 : Math.min(1, b.progressTicks / Math.max(1, requiredTicks(b)));
      const staffed = specOf(b).workerSlots === 0 || b.workers > 0;
      const stage = b.state === 'construction' ? Math.floor(ratio * 6) : 0;
      const sig = `${b.level}|${b.state}|${stage}|${b.style}|${b.look ? JSON.stringify(b.look) : ''}|${conditionBand(b.condition)}`;
      if (sig !== bv.sig) {
        bv.sig = sig;
        const model = b.state === 'construction' ? buildSite(b, ratio) : buildModel(b);
        bv.body.geometry.dispose();
        bv.lit.geometry.dispose();
        bv.body.geometry = model.body;
        bv.lit.geometry = model.lit;
        bv.height = model.height;
      }
      const [w, d] = defOf(b).footprint;
      const top = bv.height + 0.22;
      const kind: BadgeKind = !b.connected ? 'disconnected' : isBuilt(b) && b.unpaid ? 'unpaid' : isBuilt(b) && !staffed ? 'unstaffed' : 'none';
      const mat = this.badge(kind);
      bv.badge.visible = !!mat;
      if (mat) {
        bv.badge.material = mat;
        const size = Math.max(0.3, this.dist * 0.022);
        bv.badge.scale.set(size, size, 1);
        bv.badge.position.set(w / 2, top + size * 0.9, d / 2);
      }
      const working = b.state !== 'active';
      bv.barBack.visible = bv.bar.visible = working;
      if (working) {
        const len = Math.max(0.6, this.dist * 0.04);
        const thick = len * 0.16;
        bv.barBack.scale.set(len * 1.06, thick * 1.5, 1);
        bv.barBack.position.set(w / 2, top, d / 2);
        bv.bar.scale.set(Math.max(0.02, len * ratio), thick, 1);
        // the bar is anchored at its left end; shift it left along the screen's right vector
        bv.bar.position.set(w / 2 - (len / 2) * Math.SQRT1_2, top, d / 2 + (len / 2) * Math.SQRT1_2);
      }
    }
    for (const [id, bv] of this.buildingViews)
      if (!seen.has(id)) {
        this.disposeBuilding(bv);
        this.buildingViews.delete(id);
      }
  }

  // ------------------------------------------------------------------ overlays

  private drawOverlays(view: RendererView, p: Province): void {
    const { tool } = view;
    const hover = this.hover;
    const selected = view.selectedBuildingId ? buildingById(p, view.selectedBuildingId) : undefined;
    this.overlayMat.opacity = view.reducedMotion ? 0.6 : 0.52 + Math.sin(this.time / 260) * 0.12;
    const plan = tool.kind === 'roadPlan' ? view.roadPlan : null;
    const planSig = plan ? `${plan.tiles.length}|${plan.paveTiles.length}|${plan.error?.key ?? ''}|${plan.blocked?.x},${plan.blocked?.y}|${plan.tiles.at(-1)?.x},${plan.tiles.at(-1)?.y}` : '';
    const toolSig = tool.kind === 'build' ? `${tool.buildingId}|${tool.style ?? ''}|${tool.look ? JSON.stringify(tool.look) : ''}` : tool.kind === 'roadPlan' ? `${tool.start?.x},${tool.start?.y}` : '';
    const sig = `${tool.kind}|${toolSig}|${hover?.x},${hover?.y}|${selected?.id ?? ''}|${planSig}|${view.game.tick}`;
    if (sig === this.overlaySig) return;
    this.overlaySig = sig;

    const b = new Builder();
    const yAt = (x: number, y: number): number => standY(tileAt(p, x, y)) + 0.05;
    const fill = (x: number, y: number, color: number): void => {
      if (tileAt(p, x, y)) b.quad(x + 0.04, y + 0.04, x + 0.96, y + 0.96, yAt(x, y), color);
    };
    const outline = (x: number, y: number, w: number, h: number, color: number, width = 0.07): void => {
      const cy = yAt(Math.max(0, Math.min(p.width - 1, x)), Math.max(0, Math.min(p.height - 1, y))) + 0.012;
      b.ribbon([[x, cy, y], [x + w, cy, y]], width, color);
      b.ribbon([[x + w, cy, y], [x + w, cy, y + h]], width, color);
      b.ribbon([[x + w, cy, y + h], [x, cy, y + h]], width, color);
      b.ribbon([[x, cy, y + h], [x, cy, y]], width, color);
    };
    const range = (id: BuildingId, x: number, y: number): void => {
      const def = BUILDINGS[id];
      const [w, h] = def.footprint;
      if (def.services?.patrolRadius) {
        const r = def.services.patrolRadius;
        for (let dy = -r; dy < h + r; dy++)
          for (let dx = -r; dx < w + r; dx++)
            if (Math.max(-dx, dx - w + 1, 0) + Math.max(-dy, dy - h + 1, 0) <= r) fill(x + dx, y + dy, mixHex(COLORS.range, 0x000000, 0.25));
      }
      if (!def.harvests) return;
      const r = def.harvests.radius;
      outline(x - r, y - r, w + 2 * r, h + 2 * r, COLORS.range);
      for (const i of tilesInRange(p, def, x, y)) if (p.tiles[i]!.deposit > 0) fill(i % p.width, Math.floor(i / p.width), COLORS.range);
    };

    if (selected) {
      const [w, h] = defOf(selected).footprint;
      range(selected.definitionId, selected.x, selected.y);
      outline(selected.x, selected.y, w, h, COLORS.select, 0.09);
    }
    let ghostSig = '';
    if (tool.kind === 'roadPlan') {
      if (plan) {
        const color = plan.error ? COLORS.bad : COLORS.ok;
        for (const { x, y, paved } of plan.tiles) fill(x, y, paved ? 0x58c6ce : color);
        for (const { x, y } of plan.paveTiles) fill(x, y, 0x58c6ce);
        if (plan.blocked) fill(plan.blocked.x, plan.blocked.y, COLORS.bad);
      }
      const anchor = tool.start ?? hover;
      if (anchor) outline(anchor.x, anchor.y, 1, 1, COLORS.select, 0.09);
    } else if (hover) {
      const t = tileAt(p, hover.x, hover.y);
      const mark = (ok: boolean): void => {
        fill(hover.x, hover.y, ok ? COLORS.ok : COLORS.bad);
        outline(hover.x, hover.y, 1, 1, ok ? COLORS.ok : COLORS.bad);
      };
      if (tool.kind === 'build') {
        const def = BUILDINGS[tool.buildingId];
        const ok = validatePlacement(view.game, tool.buildingId, hover.x, hover.y, tool.style ?? view.game.culture, tool.look ?? null) === null;
        range(tool.buildingId, hover.x, hover.y);
        for (const [x, y] of footprintTiles(def, hover.x, hover.y)) fill(x, y, ok ? COLORS.ok : COLORS.bad);
        outline(hover.x, hover.y, def.footprint[0], def.footprint[1], ok ? COLORS.ok : COLORS.bad);
        ghostSig = toolSig;
        if (ghostSig !== this.ghostSig) {
          const model = buildModel({ definitionId: tool.buildingId, style: tool.style ?? view.game.culture, look: tool.look ?? null, level: 1 });
          model.lit.dispose();
          this.ghost.geometry.dispose();
          this.ghost.geometry = model.body;
        }
        this.ghost.position.set(hover.x, standY(t), hover.y);
        this.ghostMat.color.setHex(ok ? 0xffffff : 0xff8a8a);
        this.ghostMat.opacity = ok ? 0.72 : 0.42;
      } else if (tool.kind === 'pave') mark(!!t?.road && t.roadType === 'dirt' && !t.paved);
      else if (tool.kind === 'terrace') mark(!!t && t.terrain === 'hill' && !t.road && !t.buildingId);
      else if (tool.kind === 'army') mark(!!t?.road && (view.game.militia ?? 0) > 0);
      else if (tool.kind === 'road') mark(checkRoadSite(p, hover.x, hover.y) === null);
      else {
        const hb: BuildingInstance | undefined = t?.buildingId ? buildingById(p, t.buildingId) : undefined;
        const color = tool.kind === 'demolish' ? COLORS.bad : 0xffffff;
        if (hb) outline(hb.x, hb.y, defOf(hb).footprint[0], defOf(hb).footprint[1], color);
        else outline(hover.x, hover.y, 1, 1, color, 0.05);
      }
    }
    this.ghost.visible = !!ghostSig;
    this.ghostSig = ghostSig;
    this.overlay.geometry.dispose();
    this.overlay.geometry = b.build();
  }
}
