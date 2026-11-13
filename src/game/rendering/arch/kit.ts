import type { Graphics } from 'pixi.js';
import type {
  BuildingLook,
  DoorType,
  FacadeColor,
  RoofMaterial,
  RoofType,
  WallMaterial,
  WindowType,
} from '../../core/types';
import { FACADE_HEX } from '../../data/architecture';
import { P, shade } from '../iso';
import type { Pt } from '../iso';

/**
 * Architecture kit: procedural 2.5D primitives for original isometric buildings.
 * Everything is drawn in local tile space (u, v, z) with P(); light comes from the upper left,
 * so the left face (plane v = v1) is lit and the right face (plane u = u1) is in shade.
 * Detail levels: 0 = flat colours (low quality), 1 = materials, 2 = materials + fine texture.
 */

export interface DrawCtx {
  g: Graphics;
  detail: 0 | 1 | 2;
  seed: number;
  snow: boolean;
  /** Window/lantern quads that glow at night (screen space, local to the sprite). */
  lights: Pt[][];
  /** Chimney tops that emit smoke. */
  smoke: Pt[];
  /** Flag poles (animated by the renderer). */
  flags: { at: Pt; color: number }[];
  /** Highest screen y reached (most negative), for picking and badges. */
  topY: number;
  /** Wear 0 (new) .. 2 (poor): streaks, moss and missing tiles. */
  wear: 0 | 1 | 2;
}

export function newCtx(
  g: Graphics,
  detail: 0 | 1 | 2,
  seed: number,
  snow: boolean,
  wear: 0 | 1 | 2 = 0,
  illuminated = false,
): DrawCtx {
  const lights: Pt[][] = [];
  if (illuminated) {
    // Paint each lit window at its original point in the building's draw order.
    // Roofs, balconies, walls and towers painted later naturally occlude it.
    // A separate overlay of all windows would incorrectly shine through roofs.
    const append = lights.push.bind(lights);
    lights.push = (...panes: Pt[][]): number => {
      for (const pane of panes) g.poly(pane.flat()).fill({ color: 0xffe08a, alpha: 0.98 });
      return append(...panes);
    };
  }
  return { g, detail, seed, snow, lights, smoke: [], flags: [], topY: 0, wear };
}

// ------------------------------------------------------------------ low level

export const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number): number => (c >> s) & 255;
  const m = (s: number): number => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** Deterministic hash in [0, 1) — texture variation without touching the simulation RNG. */
export function rnd(seed: number, i: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 10007) / 10007;
}

export function poly(ctx: DrawCtx, pts: Pt[], color: number, alpha = 1): void {
  for (const p of pts) if (p[1] < ctx.topY) ctx.topY = p[1];
  ctx.g.poly(pts.flat()).fill({ color, alpha });
}

export function line(ctx: DrawCtx, a: Pt, b: Pt, color: number, width = 1, alpha = 1): void {
  ctx.g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ color, width, alpha });
}

// ------------------------------------------------------------------ faces

/** A vertical wall plane. L: plane v = const, parameter runs along u. R: plane u = const, along v. */
export interface Face {
  side: 'L' | 'R';
  plane: number;
  a: number;
  b: number;
  light: number;
}

export const faceL = (u0: number, u1: number, v1: number): Face => ({ side: 'L', plane: v1, a: u0, b: u1, light: 1 });
export const faceR = (v0: number, v1: number, u1: number): Face => ({ side: 'R', plane: u1, a: v0, b: v1, light: 0.8 });
export const fp = (f: Face, t: number, z: number): Pt => (f.side === 'L' ? P(t, f.plane, z) : P(f.plane, t, z));

export function quad(ctx: DrawCtx, f: Face, t0: number, t1: number, z0: number, z1: number, color: number, alpha = 1): void {
  poly(ctx, [fp(f, t0, z0), fp(f, t1, z0), fp(f, t1, z1), fp(f, t0, z1)], color, alpha);
}

/** Screen pixels per tile unit along a wall (the diagonal of half a tile). */
const PX = Math.hypot(32, 16);

/** Box with materials on both visible faces and a plain top. */
export function box(ctx: DrawCtx, u0: number, v0: number, u1: number, v1: number, z0: number, z1: number, color: number): void {
  poly(ctx, [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)], color);
  poly(ctx, [P(u1, v1, z0), P(u1, v0, z0), P(u1, v0, z1), P(u1, v1, z1)], shade(color, 0.78));
  poly(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], shade(color, 1.1));
}

// ------------------------------------------------------------------ palette

export const STONE = {
  granite: 0xa3a49d,
  graniteMortar: 0x7f817b,
  sandstone: 0xd8bc84,
  sandMortar: 0xeadcbc,
  brick: 0xb0553c,
  brickMortar: 0xd6b9a4,
  timber: 0x5a3a24,
  wood: 0x8f5f3b,
  quoin: 0xbfb6a2,
  plinth: 0x9c968a,
};

export const ROOF_HEX: Record<RoofMaterial, number> = {
  slate: 0x4d5a68,
  clay: 0xc15a3c,
  thatch: 0xc9a25a,
  shingle: 0x8a5d3d,
  lead: 0x8d98a2,
  earth: 0x9a7b55,
};

export function wallBase(wall: WallMaterial, facade: FacadeColor): number {
  const paint = FACADE_HEX[facade];
  switch (wall) {
    case 'granite':
      return mix(STONE.granite, paint, 0.12);
    case 'sandstone':
      return mix(STONE.sandstone, paint, 0.25);
    case 'brick':
      return mix(STONE.brick, paint, 0.1);
    case 'wood':
      return mix(STONE.wood, paint, 0.3);
    case 'stone_timber':
      return mix(0xb3ada1, paint, 0.15);
    default:
      return paint;
  }
}

// ------------------------------------------------------------------ walls

const FLOOR_H = 11;
export const floorHeight = FLOOR_H;

function courses(
  ctx: DrawCtx,
  f: Face,
  z0: number,
  z1: number,
  rowH: number,
  minLen: number,
  varLen: number,
  base: number,
  mortar: number,
  spread: number,
  salt: number,
): void {
  quad(ctx, f, f.a, f.b, z0, z1, shade(mortar, f.light));
  let row = 0;
  for (let z = z0; z < z1 - 0.5; z += rowH, row++) {
    const zt = Math.min(z1, z + rowH);
    let t = f.a - (row % 2 ? minLen * 0.5 : 0);
    let i = 0;
    while (t < f.b) {
      const len = minLen + varLen * rnd(ctx.seed + salt, row * 97 + i);
      const ta = Math.max(f.a, t + 0.006);
      const tb = Math.min(f.b, t + len - 0.006);
      if (tb > ta) {
        const tone = 1 - spread / 2 + spread * rnd(ctx.seed + salt + 7, row * 131 + i);
        quad(ctx, f, ta, tb, z + 0.45, zt - 0.45, shade(base, f.light * tone));
      }
      t += len;
      i++;
    }
  }
}

/** Paints a wall face with its material. `floors` is used for timber framing and floor bands. */
export function paintWall(
  ctx: DrawCtx,
  f: Face,
  z0: number,
  z1: number,
  wall: WallMaterial,
  facade: FacadeColor,
): void {
  const base = wallBase(wall, facade);
  const lit = shade(base, f.light);
  const d = ctx.detail;
  const salt = f.side === 'L' ? 11 : 23;
  if (d === 0) {
    quad(ctx, f, f.a, f.b, z0, z1, lit);
  } else if (wall === 'granite') {
    courses(ctx, f, z0, z1, 4.2, 0.13, 0.12, base, STONE.graniteMortar, 0.18, salt);
  } else if (wall === 'sandstone') {
    courses(ctx, f, z0, z1, 3.6, 0.2, 0.04, base, STONE.sandMortar, 0.08, salt);
  } else if (wall === 'brick') {
    courses(ctx, f, z0, z1, 2.2, 0.07, 0.01, base, STONE.brickMortar, 0.12, salt);
  } else if (wall === 'wood') {
    quad(ctx, f, f.a, f.b, z0, z1, lit);
    for (let z = z0 + 2.6; z < z1; z += 2.6) line(ctx, fp(f, f.a, z), fp(f, f.b, z), shade(base, f.light * 0.72), 0.8, 0.8);
    quad(ctx, f, f.a, f.a + 0.025, z0, z1, shade(base, f.light * 0.8));
    quad(ctx, f, f.b - 0.025, f.b, z0, z1, shade(base, f.light * 0.8));
  } else if (wall === 'timber_frame') {
    const groundTop = z1 - z0 > FLOOR_H * 1.5 ? z0 + FLOOR_H : z0;
    if (groundTop > z0) courses(ctx, f, z0, groundTop, 3.6, 0.18, 0.06, STONE.sandstone, STONE.sandMortar, 0.1, salt);
    quad(ctx, f, f.a, f.b, groundTop, z1, lit);
    const timber = shade(STONE.timber, f.light);
    const step = 0.2;
    const n = Math.max(1, Math.round((f.b - f.a) / step));
    for (let k = 0; k <= n; k++) {
      const t = f.a + ((f.b - f.a) * k) / n;
      quad(ctx, f, Math.max(f.a, t - 0.012), Math.min(f.b, t + 0.012), groundTop, z1, timber);
    }
    for (let z = groundTop; z <= z1 + 0.1; z += FLOOR_H) quad(ctx, f, f.a, f.b, Math.max(groundTop, z - 0.9), Math.min(z1, z + 0.9), timber);
    if (d >= 1)
      for (let k = 0; k < n; k++) {
        if ((k + Math.round(rnd(ctx.seed, k) * 2)) % 2) continue;
        const ta = f.a + ((f.b - f.a) * k) / n;
        const tb = f.a + ((f.b - f.a) * (k + 1)) / n;
        for (let z = groundTop; z < z1 - 2; z += FLOOR_H) {
          const zt = Math.min(z1, z + FLOOR_H);
          line(ctx, fp(f, ta, z + 0.8), fp(f, tb, zt - 0.8), timber, 1.3);
        }
      }
  } else if (wall === 'stone_timber') {
    // "göz dolma": a timber grid packed with field stones
    quad(ctx, f, f.a, f.b, z0, z1, shade(STONE.timber, f.light));
    const cols = Math.max(2, Math.round((f.b - f.a) / 0.15));
    for (let c = 0; c < cols; c++) {
      const ta = f.a + ((f.b - f.a) * c) / cols + 0.012;
      const tb = f.a + ((f.b - f.a) * (c + 1)) / cols - 0.012;
      for (let z = z0, r = 0; z < z1 - 1; z += 5.5, r++) {
        const zt = Math.min(z1, z + 5.5);
        quad(ctx, f, ta, tb, z + 0.8, zt - 0.8, shade(base, f.light * (0.9 + rnd(ctx.seed, c * 31 + r) * 0.2)));
        if (d >= 2) {
          const tm = ta + (tb - ta) * (0.35 + rnd(ctx.seed, c * 7 + r) * 0.3);
          line(ctx, fp(f, tm, z + 0.8), fp(f, tm, zt - 0.8), shade(base, f.light * 0.7), 0.6, 0.7);
        }
      }
    }
  } else {
    // harl (lime roughcast) and plaster: paint, a stone plinth and stone quoins for harl
    quad(ctx, f, f.a, f.b, z0, z1, lit);
    quad(ctx, f, f.a, f.b, z0, z0 + 3.2, shade(STONE.plinth, f.light));
    if (wall === 'harl') {
      for (let z = z0 + 3.2, i = 0; z < z1; z += 3.4, i++) {
        const w = i % 2 ? 0.05 : 0.085;
        quad(ctx, f, f.a, f.a + w, z, Math.min(z1, z + 3), shade(STONE.quoin, f.light));
        quad(ctx, f, f.b - w, f.b, z, Math.min(z1, z + 3), shade(STONE.quoin, f.light));
      }
    }
    if (d >= 2) {
      const n = Math.floor(((f.b - f.a) * (z1 - z0)) / 2.4);
      for (let i = 0; i < n; i++) {
        const t = f.a + (f.b - f.a) * rnd(ctx.seed + salt, i);
        const z = z0 + 3.5 + (z1 - z0 - 4) * rnd(ctx.seed + salt + 3, i);
        const p = fp(f, t, z);
        ctx.g.circle(p[0], p[1], 0.45).fill({ color: shade(base, 0.75), alpha: 0.45 });
      }
    }
  }
  // ambient occlusion at the foot of the wall and under the eaves
  quad(ctx, f, f.a, f.b, z0, z0 + 2.2, 0x000000, 0.13);
  quad(ctx, f, f.a, f.b, z1 - 2.2, z1, 0x000000, 0.12);
  if (ctx.wear > 0) weather(ctx, f, z0, z1, salt);
}

/** Rain streaks and moss on worn walls. */
function weather(ctx: DrawCtx, f: Face, z0: number, z1: number, salt: number): void {
  const n = ctx.wear === 2 ? 7 : 3;
  for (let i = 0; i < n; i++) {
    const t = f.a + (f.b - f.a) * rnd(ctx.seed + salt + 41, i);
    const len = (z1 - z0) * (0.35 + rnd(ctx.seed + salt + 43, i) * 0.5);
    quad(ctx, f, t, Math.min(f.b, t + 0.018), z1 - len, z1 - 1, 0x2e2a22, ctx.wear === 2 ? 0.28 : 0.16);
  }
  if (ctx.wear === 2) quad(ctx, f, f.a, f.b, z0, z0 + 4, 0x4f6b2f, 0.28);
}

// ------------------------------------------------------------------ openings

const GLASS = 0x3b5266;
const GLASS_HI = 0x9cc2d6;

function arch(f: Face, tc: number, halfW: number, zSpring: number, steps = 6): Pt[] {
  const rz = halfW * PX;
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI - (Math.PI * i) / steps;
    out.push(fp(f, tc + halfW * Math.cos(a), zSpring + rz * Math.sin(a)));
  }
  return out;
}

/** One window centred at parameter tc with its sill at z. */
export function drawWindow(ctx: DrawCtx, f: Face, tc: number, z: number, type: WindowType, frame = 0xf2eee4): void {
  const L = f.light;
  const w = type === 'small' ? 0.045 : type === 'latticed' ? 0.06 : type === 'bay' ? 0.065 : 0.05;
  const h = type === 'small' ? 5 : type === 'sash' || type === 'bay' ? 8 : 7.5;
  const t0 = tc - w;
  const t1 = tc + w;
  if (type === 'arched') {
    const pts = [fp(f, t1, z), fp(f, t0, z), ...arch(f, tc, w, z + h - w * PX)];
    const outer = [fp(f, t1 + 0.012, z - 0.8), fp(f, t0 - 0.012, z - 0.8), ...arch(f, tc, w + 0.012, z + h - w * PX)];
    poly(ctx, outer, shade(STONE.quoin, L));
    poly(ctx, pts, GLASS);
    ctx.lights.push(pts);
    if (ctx.detail >= 1) line(ctx, fp(f, tc, z + 0.5), fp(f, tc, z + h - 0.6), shade(frame, L * 0.9), 0.7);
    return;
  }
  if (type === 'small') {
    quad(ctx, f, t0 - 0.012, t1 + 0.012, z + h, z + h + 1.6, shade(STONE.quoin, L));
    quad(ctx, f, t0 - 0.008, t1 + 0.008, z - 1.2, z, shade(STONE.quoin, L));
  } else {
    quad(ctx, f, t0 - 0.012, t1 + 0.012, z - 0.9, z + h + 0.9, shade(frame, L));
    quad(ctx, f, t0 - 0.02, t1 + 0.02, z - 1.6, z - 0.6, shade(STONE.quoin, L * 0.95));
  }
  const glass = [fp(f, t0, z), fp(f, t1, z), fp(f, t1, z + h), fp(f, t0, z + h)];
  poly(ctx, glass, type === 'small' ? shade(GLASS, 0.8) : GLASS);
  ctx.lights.push(glass);
  if (ctx.detail >= 1) {
    poly(ctx, [fp(f, t0, z + h * 0.55), fp(f, t0 + w * 0.7, z + h), fp(f, t0, z + h)], GLASS_HI, 0.35);
    if (type === 'sash' || type === 'bay') {
      line(ctx, fp(f, t0, z + h / 2), fp(f, t1, z + h / 2), shade(frame, L), 0.9);
      line(ctx, fp(f, tc, z), fp(f, tc, z + h), shade(frame, L), 0.7);
    } else if (type === 'latticed') {
      const wood = shade(0x6b4428, L);
      for (let k = 1; k < 4; k++) line(ctx, fp(f, t0, z + (h * k) / 4), fp(f, t1, z + (h * k) / 4), wood, 0.6);
      for (let k = 1; k < 3; k++) line(ctx, fp(f, t0 + ((t1 - t0) * k) / 3, z), fp(f, t0 + ((t1 - t0) * k) / 3, z + h), wood, 0.6);
    }
  }
}

const DOOR_COLORS = [0x2f4f7a, 0x7a2f2f, 0x2f5f45, 0x3d3a3a];

export function drawDoor(ctx: DrawCtx, f: Face, tc: number, z0: number, type: DoorType, look?: BuildingLook): void {
  const L = f.light;
  const w = type === 'double' ? 0.075 : 0.055;
  const h = type === 'double' ? 11 : 9.5;
  const t0 = tc - w;
  const t1 = tc + w;
  const wood = shade(0x5c3b23, L);
  quad(ctx, f, t0 - 0.02, t1 + 0.02, z0, z0 + 1.2, shade(0xb9b2a4, L)); // step
  if (type === 'arched') {
    const outer = [fp(f, t1 + 0.016, z0), fp(f, t0 - 0.016, z0), ...arch(f, tc, w + 0.016, z0 + h - w * PX)];
    poly(ctx, outer, shade(STONE.quoin, L));
    poly(ctx, [fp(f, t1, z0 + 1.2), fp(f, t0, z0 + 1.2), ...arch(f, tc, w, z0 + h - w * PX)], wood);
    line(ctx, fp(f, tc, z0 + 1.2), fp(f, tc, z0 + h), shade(0x3a2515, L), 0.8);
    return;
  }
  if (type === 'fanlight') {
    const paint = DOOR_COLORS[Math.floor(rnd(ctx.seed, 77) * DOOR_COLORS.length) % DOOR_COLORS.length]!;
    void look;
    quad(ctx, f, t0 - 0.016, t1 + 0.016, z0, z0 + h + 0.6, shade(STONE.quoin, L));
    poly(ctx, arch(f, tc, w + 0.016, z0 + h), shade(STONE.quoin, L));
    poly(ctx, arch(f, tc, w * 0.8, z0 + h + 0.4), GLASS_HI);
    quad(ctx, f, t0, t1, z0 + 1.2, z0 + h, shade(paint, L));
    if (ctx.detail >= 1) {
      quad(ctx, f, t0 + 0.01, t1 - 0.01, z0 + 2.5, z0 + 5.5, shade(paint, L * 0.85));
      quad(ctx, f, t0 + 0.01, t1 - 0.01, z0 + 6.5, z0 + h - 1, shade(paint, L * 0.85));
      const knob = fp(f, t1 - 0.015, z0 + 5);
      ctx.g.circle(knob[0], knob[1], 0.6).fill(0xd9b84a);
    }
    return;
  }
  quad(ctx, f, t0 - 0.012, t1 + 0.012, z0 + 1.2, z0 + h + 1, shade(STONE.quoin, L * 0.9));
  quad(ctx, f, t0, t1, z0 + 1.2, z0 + h, wood);
  if (ctx.detail >= 1) {
    if (type === 'double') line(ctx, fp(f, tc, z0 + 1.2), fp(f, tc, z0 + h), shade(0x2e1d10, L), 0.9);
    else
      for (let k = 1; k < 3; k++)
        line(ctx, fp(f, t0 + ((t1 - t0) * k) / 3, z0 + 1.2), fp(f, t0 + ((t1 - t0) * k) / 3, z0 + h), shade(0x3a2515, L), 0.6);
    line(ctx, fp(f, t0, z0 + h * 0.35), fp(f, t1, z0 + h * 0.35), shade(0x3a2515, L), 0.6);
  }
}

/** Windows on every floor of a face, leaving room for a door on the ground floor. */
export function windowRows(
  ctx: DrawCtx,
  f: Face,
  z0: number,
  floors: number,
  type: WindowType,
  doorAt: number | null,
  frame?: number,
  spacing = 0.27,
): void {
  const len = f.b - f.a;
  const n = Math.max(1, Math.floor(len / spacing));
  for (let fl = 0; fl < floors; fl++) {
    const z = z0 + fl * FLOOR_H + (fl === 0 ? 3.2 : 2.4);
    for (let i = 0; i < n; i++) {
      const tc = f.a + ((i + 0.5) * len) / n;
      if (fl === 0 && doorAt !== null && Math.abs(tc - doorAt) < 0.11) continue;
      drawWindow(ctx, f, tc, z, type, frame);
    }
  }
}

export function flowerBoxes(ctx: DrawCtx, f: Face, z0: number, floors: number, spacing = 0.27): void {
  const len = f.b - f.a;
  const n = Math.max(1, Math.floor(len / spacing));
  const colors = [0xd9466f, 0xe86a3a, 0xf2c94c, 0xc24bd6];
  for (let fl = 1; fl < floors; fl++) {
    const z = z0 + fl * FLOOR_H + 1.2;
    for (let i = 0; i < n; i++) {
      const tc = f.a + ((i + 0.5) * len) / n;
      quad(ctx, f, tc - 0.055, tc + 0.055, z - 1.4, z, shade(0x7a4a2a, f.light));
      for (let k = 0; k < 4; k++) {
        const p = fp(f, tc - 0.045 + k * 0.03, z + 0.6);
        ctx.g.circle(p[0], p[1], 1).fill(colors[(i + k + fl) % colors.length]!);
      }
    }
  }
}

// ------------------------------------------------------------------ roofs

export interface RoofBox {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Wall top (eave base). */
  z: number;
}

export interface RoofResult {
  ridgeZ: number;
  /** Ridge line end points in tile space (for chimneys and bell cotes). */
  ridge: [number, number, number, number];
  axis: 'u' | 'v';
}

function slopeTexture(ctx: DrawCtx, e0: Pt, e1: Pt, r1: Pt, r0: Pt, material: RoofMaterial, base: number): void {
  const d = ctx.detail;
  if (d === 0) return;
  const len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
  const depth = Math.hypot(r0[0] - e0[0], r0[1] - e0[1]);
  if (material === 'slate' || material === 'shingle') {
    const rows = Math.max(2, Math.round(depth / (material === 'slate' ? 2.6 : 3.2)));
    for (let k = 1; k < rows; k++) {
      const a = lerp(e0, r0, k / rows);
      const b = lerp(e1, r1, k / rows);
      line(ctx, a, b, shade(base, 0.72), 0.7, 0.75);
      if (d >= 2) {
        const ticks = Math.floor(len / 4);
        for (let j = 0; j < ticks; j++) {
          const s = (j + (k % 2) * 0.5) / ticks;
          if (s >= 1) continue;
          const p = lerp(a, b, s);
          const q = lerp(lerp(e0, r0, (k + 1) / rows), lerp(e1, r1, (k + 1) / rows), s);
          line(ctx, p, q, shade(base, 0.78), 0.5, 0.6);
        }
      }
    }
  } else if (material === 'clay') {
    // Turkish channel tiles: alternating light and dark barrels from eave to ridge
    const ch = Math.max(3, Math.round(len / 2.6));
    for (let j = 0; j <= ch; j++) {
      const s = j / ch;
      line(ctx, lerp(e0, e1, s), lerp(r0, r1, s), j % 2 ? shade(base, 1.18) : shade(base, 0.8), 1.1, 0.85);
    }
    if (d >= 2) {
      const rows = Math.max(2, Math.round(depth / 4));
      for (let k = 1; k < rows; k++) line(ctx, lerp(e0, r0, k / rows), lerp(e1, r1, k / rows), shade(base, 0.75), 0.5, 0.5);
    }
    line(ctx, e0, e1, shade(base, 0.62), 1.4); // tile ends at the eave
  } else if (material === 'thatch') {
    const n = Math.floor((len * depth) / 9);
    for (let i = 0; i < n; i++) {
      const s = rnd(ctx.seed, i * 3);
      const k = rnd(ctx.seed, i * 3 + 1);
      const p = lerp(lerp(e0, e1, s), lerp(r0, r1, s), k);
      const q = lerp(lerp(e0, e1, s), lerp(r0, r1, s), Math.max(0, k - 0.18));
      line(ctx, p, q, rnd(ctx.seed, i * 3 + 2) > 0.5 ? shade(base, 0.78) : shade(base, 1.12), 0.8, 0.8);
    }
    line(ctx, e0, e1, shade(base, 1.15), 2.4); // thick rounded eave
  } else if (material === 'lead') {
    const ch = Math.max(2, Math.round(len / 5));
    for (let j = 1; j < ch; j++) line(ctx, lerp(e0, e1, j / ch), lerp(r0, r1, j / ch), shade(base, 1.15), 0.7, 0.8);
  }
}

function slope(ctx: DrawCtx, e0: Pt, e1: Pt, r1: Pt, r0: Pt, material: RoofMaterial, light: number): void {
  const base = shade(ROOF_HEX[material], light);
  poly(ctx, [e0, e1, r1, r0], base);
  slopeTexture(ctx, e0, e1, r1, r0, material, base);
  if (ctx.snow) poly(ctx, [lerp(e0, r0, 0.25), lerp(e1, r1, 0.25), r1, r0], 0xf4f7fa, 0.88);
  if (ctx.wear === 2 && ctx.detail >= 1)
    for (let i = 0; i < 4; i++) {
      const s = rnd(ctx.seed, 300 + i);
      const k = rnd(ctx.seed, 310 + i) * 0.7 + 0.1;
      const p = lerp(lerp(e0, e1, s), lerp(r0, r1, s), k);
      ctx.g.circle(p[0], p[1], 1.6).fill({ color: 0x2e2a22, alpha: 0.4 });
    }
}

function tri(ctx: DrawCtx, a: Pt, b: Pt, apex: Pt, material: RoofMaterial, light: number): void {
  const base = shade(ROOF_HEX[material], light);
  poly(ctx, [a, b, apex], base);
  slopeTexture(ctx, a, b, apex, apex, material, base);
  if (ctx.snow) poly(ctx, [lerp(a, apex, 0.25), lerp(b, apex, 0.25), apex], 0xf4f7fa, 0.88);
}

/** Stepped (crow-stepped) gable wall in a plane, rising a little above the roof line. */
function steppedGable(
  ctx: DrawCtx,
  side: 'L' | 'R',
  plane: number,
  a: number,
  b: number,
  z: number,
  rise: number,
  color: number,
  light: number,
): void {
  const f: Face = { side, plane, a, b, light };
  const n = 4;
  const m = (a + b) / 2;
  const dv = (m - a) / n;
  const pts: Pt[] = [fp(f, a, z)];
  for (let i = 0; i < n; i++) {
    const zs = z + (rise * (i + 1)) / n + 2;
    pts.push(fp(f, a + i * dv, zs), fp(f, a + (i + 1) * dv, zs));
  }
  for (let i = n - 1; i >= 0; i--) {
    const zs = z + (rise * (i + 1)) / n + 2;
    pts.push(fp(f, b - (i + 1) * dv, zs), fp(f, b - i * dv, zs));
  }
  pts.push(fp(f, b, z));
  poly(ctx, pts, shade(color, light));
  if (ctx.detail >= 1)
    for (let i = 0; i < n; i++) {
      const zs = z + (rise * (i + 1)) / n + 2;
      quad(ctx, f, a + i * dv, a + (i + 1) * dv + 0.01, zs - 0.2, zs + 1, shade(STONE.quoin, light * 1.05));
      quad(ctx, f, b - (i + 1) * dv - 0.01, b - i * dv, zs - 0.2, zs + 1, shade(STONE.quoin, light * 1.05));
    }
}

export function drawRoof(
  ctx: DrawCtx,
  r: RoofBox,
  type: RoofType,
  material: RoofMaterial,
  wallColor: number,
  opts: { axis?: 'u' | 'v'; overhang?: number; pitch?: number } = {},
): RoofResult {
  const du = r.u1 - r.u0;
  const dv = r.v1 - r.v0;
  const axis = opts.axis ?? (du >= dv ? 'u' : 'v');
  const half = (axis === 'u' ? dv : du) / 2;
  if (type === 'flat' || type === 'dome') {
    const top = shade(ROOF_HEX[material], 1.06);
    poly(ctx, [P(r.u0, r.v0, r.z), P(r.u1, r.v0, r.z), P(r.u1, r.v1, r.z), P(r.u0, r.v1, r.z)], top);
    if (material === 'earth' && ctx.detail >= 1) {
      for (let i = 0; i < 6; i++) {
        const p = P(r.u0 + du * rnd(ctx.seed, 500 + i), r.v0 + dv * rnd(ctx.seed, 510 + i), r.z);
        ctx.g.ellipse(p[0], p[1], 2.2, 1).fill({ color: 0x7d8f4a, alpha: 0.55 });
      }
    }
    if (ctx.snow) poly(ctx, [P(r.u0, r.v0, r.z), P(r.u1, r.v0, r.z), P(r.u1, r.v1, r.z), P(r.u0, r.v1, r.z)], 0xf4f7fa, 0.8);
    // parapet rim on the visible edges
    const rim = shade(wallColor, 0.95);
    poly(ctx, [P(r.u0, r.v1, r.z), P(r.u1, r.v1, r.z), P(r.u1, r.v1, r.z + 1.8), P(r.u0, r.v1, r.z + 1.8)], rim);
    poly(ctx, [P(r.u1, r.v1, r.z), P(r.u1, r.v0, r.z), P(r.u1, r.v0, r.z + 1.8), P(r.u1, r.v1, r.z + 1.8)], shade(rim, 0.8));
    return { ridgeZ: r.z, ridge: [r.u0, r.v0, r.u1, r.v1], axis };
  }
  const pitch = opts.pitch ?? (type === 'crow_step' ? 34 : material === 'thatch' ? 32 : type === 'hip' ? 15 : 26);
  const rise = Math.max(6, half * pitch);
  const o = opts.overhang ?? (type === 'hip' || type === 'pyramid' ? (material === 'clay' || material === 'shingle' ? 0.11 : 0.06) : 0.05);
  const ze = r.z - (rise / half) * o * 0.6;
  const zr = r.z + rise;
  if (type === 'hip' || type === 'pyramid') {
    const R = { u0: r.u0 - o, v0: r.v0 - o, u1: r.u1 + o, v1: r.v1 + o };
    const hd = (axis === 'u' ? R.v1 - R.v0 : R.u1 - R.u0) / 2;
    const um = (R.u0 + R.u1) / 2;
    const vm = (R.v0 + R.v1) / 2;
    let a: [number, number];
    let b: [number, number];
    if (type === 'pyramid') a = b = [um, vm];
    else if (axis === 'u') {
      const s = Math.min(hd, (R.u1 - R.u0) / 2);
      a = [R.u0 + s, vm];
      b = [R.u1 - s, vm];
    } else {
      const s = Math.min(hd, (R.v1 - R.v0) / 2);
      a = [um, R.v0 + s];
      b = [um, R.v1 - s];
    }
    const A = P(a[0], a[1], zr);
    const B = P(b[0], b[1], zr);
    const c00 = P(R.u0, R.v0, ze);
    const c10 = P(R.u1, R.v0, ze);
    const c11 = P(R.u1, R.v1, ze);
    const c01 = P(R.u0, R.v1, ze);
    if (axis === 'u') {
      slope(ctx, c00, c10, B, A, material, 0.78);
      tri(ctx, c00, c01, A, material, 0.95);
      slope(ctx, c01, c11, B, A, material, 1.0);
      tri(ctx, c11, c10, B, material, 0.8);
    } else {
      slope(ctx, c00, c01, B, A, material, 0.95);
      tri(ctx, c00, c10, A, material, 0.78);
      slope(ctx, c10, c11, B, A, material, 0.8);
      tri(ctx, c01, c11, B, material, 1.0);
    }
    // fascia: the thick edge of the wide eaves
    const fascia = shade(material === 'clay' ? 0x8a3d28 : 0x3a2a1c, 0.9);
    poly(ctx, [c01, c11, [c11[0], c11[1] + 1.6], [c01[0], c01[1] + 1.6]], fascia);
    poly(ctx, [c11, c10, [c10[0], c10[1] + 1.6], [c11[0], c11[1] + 1.6]], shade(fascia, 0.8));
    return { ridgeZ: zr, ridge: [a[0], a[1], b[0], b[1]], axis };
  }
  // gable and crow-stepped gable
  const og = type === 'crow_step' ? 0 : 0.04;
  if (axis === 'u') {
    const vm = (r.v0 + r.v1) / 2;
    if (type === 'crow_step') steppedGable(ctx, 'R', r.u0, r.v0, r.v1, r.z, rise, wallColor, 0.72);
    const e0 = P(r.u0 - og, r.v0 - o, ze);
    const e1 = P(r.u1 + og, r.v0 - o, ze);
    const r0 = P(r.u0 - og, vm, zr);
    const r1 = P(r.u1 + og, vm, zr);
    slope(ctx, e0, e1, r1, r0, material, 0.8);
    if (type !== 'crow_step')
      poly(ctx, [P(r.u1, r.v0, r.z), P(r.u1, r.v1, r.z), P(r.u1, vm, zr)], shade(wallColor, 0.78));
    slope(ctx, P(r.u0 - og, r.v1 + o, ze), P(r.u1 + og, r.v1 + o, ze), r1, r0, material, 1.0);
    if (type === 'crow_step') steppedGable(ctx, 'R', r.u1, r.v0, r.v1, r.z, rise, wallColor, 0.8);
    else line(ctx, P(r.u1 + og, r.v0 - o, ze), r1, shade(ROOF_HEX[material], 0.6), 1.1);
    line(ctx, r0, r1, shade(ROOF_HEX[material], 0.6), 1.4);
    if (type !== 'crow_step') line(ctx, r1, P(r.u1 + og, r.v1 + o, ze), shade(ROOF_HEX[material], 0.55), 1.1);
    return { ridgeZ: zr, ridge: [r.u0, vm, r.u1, vm], axis };
  }
  const um = (r.u0 + r.u1) / 2;
  if (type === 'crow_step') steppedGable(ctx, 'L', r.v0, r.u0, r.u1, r.z, rise, wallColor, 0.9);
  const r0 = P(um, r.v0 - og, zr);
  const r1 = P(um, r.v1 + og, zr);
  slope(ctx, P(r.u0 - o, r.v0 - og, ze), P(r.u0 - o, r.v1 + og, ze), r1, r0, material, 1.06);
  if (type !== 'crow_step') poly(ctx, [P(r.u0, r.v1, r.z), P(r.u1, r.v1, r.z), P(um, r.v1, zr)], wallColor);
  slope(ctx, P(r.u1 + o, r.v0 - og, ze), P(r.u1 + o, r.v1 + og, ze), r1, r0, material, 0.8);
  if (type === 'crow_step') steppedGable(ctx, 'L', r.v1, r.u0, r.u1, r.z, rise, wallColor, 1);
  line(ctx, r0, r1, shade(ROOF_HEX[material], 0.6), 1.4);
  return { ridgeZ: zr, ridge: [um, r.v0, um, r.v1], axis };
}

/** A lead dome with drum and finial (alem), centred on (cu, cv) at height z. */
export function drawDome(ctx: DrawCtx, cu: number, cv: number, z: number, r: number, color = ROOF_HEX.lead): void {
  const c = P(cu, cv, z + 2.5);
  const rx = r * 45;
  const ry = r * 22.6;
  const hz = rx * 0.92;
  // drum
  const base = P(cu, cv, z);
  ctx.g.ellipse(base[0], base[1], rx * 1.02, ry * 1.02).fill(shade(0xd8c79e, 0.85));
  poly(ctx, [[base[0] - rx, base[1]], [base[0] + rx, base[1]], [c[0] + rx, c[1]], [c[0] - rx, c[1]]], shade(0xd8c79e, 0.92));
  const pts: Pt[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = (Math.PI * i) / 14;
    pts.push([c[0] - rx * Math.cos(a), c[1] - hz * Math.sin(a)]);
  }
  for (let i = 0; i <= 10; i++) {
    const a = (Math.PI * i) / 10;
    pts.push([c[0] + rx * Math.cos(a), c[1] + ry * Math.sin(a)]);
  }
  poly(ctx, pts, shade(color, 0.86));
  // lit crescent on the upper left
  const lit: Pt[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.5 + (Math.PI * 0.55 * i) / 10;
    lit.push([c[0] + rx * Math.cos(a) * 0.98, c[1] - hz * Math.sin(a) * 0.98]);
  }
  for (let i = 10; i >= 0; i--) {
    const a = Math.PI * 0.5 + (Math.PI * 0.55 * i) / 10;
    lit.push([c[0] + rx * 0.45 * Math.cos(a), c[1] - hz * 0.92 * Math.sin(a)]);
  }
  poly(ctx, lit, shade(color, 1.18), 0.9);
  if (ctx.detail >= 1)
    for (const k of [-0.5, 0, 0.5]) {
      const seam: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = (Math.PI * 0.5 * i) / 8;
        seam.push([c[0] + rx * k * Math.cos(a), c[1] - hz * Math.sin(a)]);
      }
      for (let i = 1; i < seam.length; i++) line(ctx, seam[i - 1]!, seam[i]!, shade(color, 0.7), 0.5, 0.6);
    }
  if (ctx.snow) ctx.g.ellipse(c[0] - rx * 0.1, c[1] - hz * 0.75, rx * 0.6, hz * 0.28).fill({ color: 0xf4f7fa, alpha: 0.85 });
  const tip: Pt = [c[0], c[1] - hz];
  line(ctx, tip, [tip[0], tip[1] - 5], 0xc9a23a, 1.2);
  ctx.g.circle(tip[0], tip[1] - 6, 1.4).fill(0xd9b84a);
  if (tip[1] - 8 < ctx.topY) ctx.topY = tip[1] - 8;
}

// ------------------------------------------------------------------ attachments

export function drawChimney(ctx: DrawCtx, u: number, v: number, z0: number, z1: number, color: number, pots = true): void {
  box(ctx, u - 0.05, v - 0.05, u + 0.05, v + 0.05, z0, z1, color);
  box(ctx, u - 0.06, v - 0.06, u + 0.06, v + 0.06, z1, z1 + 1.5, shade(color, 1.08));
  if (pots) {
    box(ctx, u - 0.03, v - 0.03, u, v, z1 + 1.5, z1 + 4, 0xc0703f);
    box(ctx, u + 0.005, v + 0.005, u + 0.035, v + 0.035, z1 + 1.5, z1 + 4, 0xb4663a);
  }
  ctx.smoke.push(P(u, v, z1 + 4));
}

/** Round corbelled turret with a conical cap (Scottish bartizan). */
export function drawTurret(ctx: DrawCtx, u: number, v: number, z0: number, z1: number, r: number, wall: number, roof: number): void {
  const b = P(u, v, z0);
  const t = P(u, v, z1);
  const rx = r * 45;
  const ry = r * 22.6;
  // corbel
  poly(ctx, [[b[0] - rx, b[1]], [b[0] + rx, b[1]], [b[0] + rx * 0.3, b[1] + 6], [b[0] - rx * 0.3, b[1] + 6]], shade(wall, 0.8));
  poly(ctx, [[b[0] - rx, b[1]], [t[0] - rx, t[1]], [t[0], t[1]], [b[0], b[1] + ry]], shade(wall, 1.02));
  poly(ctx, [[b[0], b[1] + ry], [t[0], t[1]], [t[0] + rx, t[1]], [b[0] + rx, b[1]]], shade(wall, 0.8));
  ctx.g.ellipse(b[0], b[1], rx, ry).fill({ color: shade(wall, 0.9), alpha: 0.0 });
  const win: Pt[] = [
    [b[0] - rx * 0.35, b[1] - (z1 - z0) * 0.35],
    [b[0] - rx * 0.05, b[1] - (z1 - z0) * 0.35 + 1],
    [b[0] - rx * 0.05, b[1] - (z1 - z0) * 0.65 + 1],
    [b[0] - rx * 0.35, b[1] - (z1 - z0) * 0.65],
  ];
  poly(ctx, win, GLASS);
  ctx.lights.push(win);
  const apex: Pt = [t[0], t[1] - r * 120];
  poly(ctx, [[t[0] - rx - 1, t[1]], [t[0] + rx + 1, t[1]], apex], shade(roof, 0.85));
  poly(ctx, [[t[0] - rx - 1, t[1]], [t[0] - rx * 0.1, t[1] + 1], apex], shade(roof, 1.1));
  if (ctx.snow) poly(ctx, [[t[0] - rx * 0.45, t[1] - r * 60], [t[0] + rx * 0.45, t[1] - r * 60], apex], 0xf4f7fa, 0.85);
  line(ctx, apex, [apex[0], apex[1] - 4], 0x3a3a3a, 1);
  if (apex[1] - 5 < ctx.topY) ctx.topY = apex[1] - 5;
}

/** Clock face on a wall. */
export function drawClock(ctx: DrawCtx, f: Face, tc: number, z: number, size = 3.2): void {
  const c = fp(f, tc, z);
  ctx.g.ellipse(c[0], c[1], size + 0.8, size + 0.8).fill(shade(0xc9a23a, f.light));
  ctx.g.ellipse(c[0], c[1], size, size).fill(0xf6f1e2);
  line(ctx, c, [c[0], c[1] - size * 0.8], 0x2a2a2a, 0.8);
  line(ctx, c, [c[0] + size * 0.6, c[1] + size * 0.15], 0x2a2a2a, 0.8);
}

/** Registers an animated flag; the renderer draws a 16 px pole and cloth from `at` upwards. */
export function drawFlagPole(ctx: DrawCtx, at: Pt, color: number, extraPole = 0): void {
  if (extraPole > 0) line(ctx, at, [at[0], at[1] - extraPole], 0x4a3a2a, 1.3);
  const base: Pt = [at[0], at[1] - extraPole];
  ctx.flags.push({ at: base, color });
  if (base[1] - 18 < ctx.topY) ctx.topY = base[1] - 18;
}

export function shadowFor(ctx: DrawCtx, u0: number, v0: number, u1: number, v1: number, height: number): void {
  const k = Math.min(0.9, height / 60);
  const pts: Pt[] = [P(u0, v1), P(u1, v1), P(u1 + k * 0.9, v1 - k * 0.2), P(u1 + k * 0.9, v0 - k * 0.2 + 0.05), P(u1, v0)];
  poly(ctx, pts, 0x1b2a1a, 0.15);
  if (ctx.detail >= 2) {
    const soft: Pt[] = [P(u0 - 0.03, v1 + 0.03), P(u1 + 0.03, v1 + 0.03), P(u1 + k * 1.15, v1 - k * 0.22), P(u1 + k * 1.15, v0 - k * 0.25), P(u1 + 0.03, v0 - 0.03)];
    poly(ctx, soft, 0x1b2a1a, 0.07);
  }
}

export { FLOOR_H };
