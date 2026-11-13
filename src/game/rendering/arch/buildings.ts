import type { Graphics } from 'pixi.js';
import type { ArchitectureStyle, BuildingId, BuildingLook, RoofType, WindowType } from '../../core/types';
import { CULTURES } from '../../data/architecture';
import { renderLook } from '../../systems/architecture';
import { P, shade } from '../iso';
import type { Pt } from '../iso';
import type { SeasonPalette } from '../palette';
import { COLORS } from '../palette';
import {
  FLOOR_H,
  ROOF_HEX,
  STONE,
  box,
  drawChimney,
  drawClock,
  drawDome,
  drawDoor,
  drawFlagPole,
  drawRoof,
  drawTurret,
  drawWindow,
  faceL,
  faceR,
  flowerBoxes,
  fp,
  line,
  newCtx,
  paintWall,
  poly,
  quad,
  rnd,
  shadowFor,
  wallBase,
  windowRows,
} from './kit';
import type { DrawCtx, RoofResult } from './kit';
import { drawLandmark } from './landmarks';

/**
 * Culture-aware building compositions. Each building type is assembled from the kit using its
 * effective look (workshop design or culture default), so materials, roofs and openings follow the
 * same data that decides cost and durability.
 */

export interface StyledRef {
  definitionId: BuildingId;
  style: ArchitectureStyle;
  look: BuildingLook | null;
  level: number;
  condition: number;
}

export interface SpriteInfo {
  lights: Pt[][];
  smoke: Pt[];
  flags: { at: Pt; color: number }[];
  /** Height in px above the footprint's top (back) vertex: -min(y). Used for picking and badges. */
  height: number;
}

interface MassOpts {
  floors?: number;
  z0?: number;
  axis?: 'u' | 'v';
  roof?: RoofType;
  door?: 'L' | 'R' | null;
  doorT?: number;
  windows?: WindowType;
  spacing?: number;
  chimneys?: boolean;
  pitch?: number;
  overhang?: number;
  balcony?: boolean;
}

/** One building volume: walls with materials, openings, balcony, roof and chimneys. */
function mass(
  ctx: DrawCtx,
  look: BuildingLook,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  o: MassOpts = {},
): { roof: RoofResult; zTop: number } {
  const floors = o.floors ?? look.floors;
  const z0 = o.z0 ?? 0;
  const zTop = z0 + floors * FLOOR_H + 2;
  const wallColor = wallBase(look.wall, look.facade);
  const L = faceL(u0, u1, v1);
  const R = faceR(v0, v1, u1);
  paintWall(ctx, L, z0, zTop, look.wall, look.facade);
  paintWall(ctx, R, z0, zTop, look.wall, look.facade);
  const doorSide = o.door === undefined ? 'L' : o.door;
  const doorT = o.doorT ?? (doorSide === 'R' ? (v0 + v1) / 2 : (u0 + u1) / 2);
  const windows = o.windows ?? look.windows;
  const frame = look.wall === 'timber_frame' || look.wall === 'wood' ? 0x7a5232 : 0xf2eee4;
  windowRows(ctx, L, z0, floors, windows, doorSide === 'L' ? doorT : null, frame, o.spacing);
  windowRows(ctx, R, z0, floors, windows, doorSide === 'R' ? doorT : null, frame, o.spacing);
  if (doorSide) drawDoor(ctx, doorSide === 'L' ? L : R, doorT, z0, look.door, look);
  if (look.decor === 'flowerboxes') {
    flowerBoxes(ctx, L, z0, floors, o.spacing);
  }
  if (look.decor === 'lanterns' && doorSide) {
    const f = doorSide === 'L' ? L : R;
    for (const dt of [-0.1, 0.1]) {
      const p = fp(f, doorT + dt, z0 + 8);
      ctx.g.rect(p[0] - 1, p[1] - 2, 2, 3).fill(0x2a2a2a);
      const glow: Pt[] = [
        [p[0] - 0.9, p[1] - 1.6],
        [p[0] + 0.9, p[1] - 1.6],
        [p[0] + 0.9, p[1] + 0.6],
        [p[0] - 0.9, p[1] + 0.6],
      ];
      poly(ctx, glow, 0xf6d46b);
      ctx.lights.push(glow);
    }
  }
  if (look.decor === 'banners') {
    const flag = CULTURES[look.wall === 'harl' || look.wall === 'granite' ? 'scottish' : 'turkish'].flag;
    for (const k of [0.25, 0.75]) {
      const t = u0 + (u1 - u0) * k;
      poly(ctx, [fp(L, t - 0.03, zTop - 2), fp(L, t + 0.03, zTop - 2), fp(L, t + 0.03, zTop - 9), fp(L, t, zTop - 11), fp(L, t - 0.03, zTop - 9)], flag);
    }
  }
  if ((o.balcony ?? true) && floors >= 2) balcony(ctx, look, u0, v0, u1, v1, z0, zTop, floors);
  const roofType = o.roof ?? look.roof;
  const roof = drawRoof(
    ctx,
    { u0, v0, u1, v1, z: zTop },
    roofType === 'dome' ? 'flat' : roofType,
    roofType === 'dome' ? 'lead' : look.roofMaterial,
    wallColor,
    { axis: o.axis, pitch: o.pitch, overhang: o.overhang },
  );
  if (roofType === 'dome') domes(ctx, u0, v0, u1, v1, zTop);
  if (o.chimneys ?? true) chimneys(ctx, look, roof, zTop, wallColor);
  if (look.tower === 'turret') drawTurret(ctx, u1 - 0.02, v1 - 0.02, zTop - FLOOR_H + 2, zTop + 5, 0.085, wallColor, ROOF_HEX.slate);
  if (look.tower === 'bell') bellCote(ctx, roof, wallColor);
  return { roof, zTop };
}

function domes(ctx: DrawCtx, u0: number, v0: number, u1: number, v1: number, z: number): void {
  const nu = Math.max(1, Math.round((u1 - u0) / 0.62));
  const nv = Math.max(1, Math.round((v1 - v0) / 0.62));
  const cw = (u1 - u0) / nu;
  const cv = (v1 - v0) / nv;
  const r = Math.min(cw, cv) * 0.4;
  const cells: [number, number][] = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) cells.push([u0 + cw * (i + 0.5), v0 + cv * (j + 0.5)]);
  cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [cu, cvv] of cells) drawDome(ctx, cu, cvv, z, r);
}

function chimneys(ctx: DrawCtx, look: BuildingLook, roof: RoofResult, zTop: number, wallColor: number): void {
  if (look.chimney === 'none') return;
  const [au, av, bu, bv] = roof.ridge;
  const stone = look.wall === 'timber_frame' || look.wall === 'wood' ? STONE.sandstone : shade(wallColor, 0.95);
  const top = roof.ridgeZ + 5;
  if (look.chimney === 'central') {
    drawChimney(ctx, (au + bu) / 2 + 0.04, (av + bv) / 2 - 0.04, zTop, roof.ridgeZ + 3, stone, false);
    return;
  }
  const inset = 0.07;
  const end = (u: number, v: number, dirU: number, dirV: number): [number, number] => [u - dirU * inset, v - dirV * inset];
  const du = Math.sign(bu - au);
  const dv = Math.sign(bv - av);
  const [eu, ev] = end(bu, bv, du, dv);
  drawChimney(ctx, eu, ev, zTop, top, stone);
  if (look.chimney === 'twin') {
    const [su, sv] = end(au, av, -du, -dv);
    drawChimney(ctx, su, sv, zTop, top, stone);
  }
}

function bellCote(ctx: DrawCtx, roof: RoofResult, wall: number): void {
  const [, , bu, bv] = roof.ridge;
  const u = roof.axis === 'u' ? bu - 0.02 : bu;
  const v = roof.axis === 'u' ? bv : bv - 0.02;
  const z = roof.ridgeZ - 1;
  box(ctx, u - 0.05, v - 0.05, u + 0.05, v + 0.05, z, z + 9, shade(wall, 0.98));
  const f = faceL(u - 0.05, u + 0.05, v + 0.05);
  quad(ctx, f, u - 0.025, u + 0.025, z + 2, z + 7, 0x2b2b2b);
  const bell = fp(f, u, z + 4.5);
  ctx.g.circle(bell[0], bell[1], 1.6).fill(0xd2a53a);
  poly(ctx, [P(u - 0.065, v - 0.065, z + 9), P(u + 0.065, v + 0.065, z + 9), P(u, v, z + 15)], ROOF_HEX.slate);
}

function balcony(
  ctx: DrawCtx,
  look: BuildingLook,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  z0: number,
  zTop: number,
  floors: number,
): void {
  if (look.balcony === 'cumba') {
    // Ottoman projecting upper floor with brackets
    const ua = u0 + (u1 - u0) * 0.28;
    const ub = u0 + (u1 - u0) * 0.78;
    const d = 0.12;
    const zb = z0 + FLOOR_H;
    for (const k of [0.1, 0.5, 0.9]) {
      const t = ua + (ub - ua) * k;
      line(ctx, P(t, v1, zb - 4.5), P(t, v1 + d, zb), shade(STONE.timber, 1), 1.2);
    }
    const Lc = faceL(ua, ub, v1 + d);
    const Rc = faceR(v1, v1 + d, ub);
    const wall = look.wall === 'timber_frame' || look.wall === 'stone_timber' ? 'plaster' : look.wall;
    paintWall(ctx, Lc, zb, zTop - 1, wall, look.facade);
    paintWall(ctx, Rc, zb, zTop - 1, wall, look.facade);
    for (let fl = 1; fl < floors; fl++) {
      const z = z0 + fl * FLOOR_H + 2.4;
      for (const k of [0.25, 0.5, 0.75]) drawWindow(ctx, Lc, ua + (ub - ua) * k, z, 'latticed', 0x7a5232);
    }
    quad(ctx, Lc, ua, ub, zTop - 2, zTop - 1, shade(STONE.timber, 1));
    poly(ctx, [P(ua, v1, zTop - 1), P(ub, v1, zTop - 1), P(ub, v1 + d, zTop - 1), P(ua, v1 + d, zTop - 1)], shade(STONE.timber, 1.1));
  } else if (look.balcony === 'iron') {
    const z = z0 + FLOOR_H + 0.5;
    const ua = u0 + (u1 - u0) * 0.25;
    const ub = u0 + (u1 - u0) * 0.75;
    poly(ctx, [P(ua, v1, z), P(ub, v1, z), P(ub, v1 + 0.06, z), P(ua, v1 + 0.06, z)], shade(STONE.quoin, 1.1));
    const f = faceL(ua, ub, v1 + 0.06);
    line(ctx, fp(f, ua, z + 4), fp(f, ub, z + 4), 0x2a2a2a, 0.9);
    for (let t = ua; t <= ub + 1e-6; t += (ub - ua) / 6) line(ctx, fp(f, t, z), fp(f, t, z + 4), 0x2a2a2a, 0.6);
  } else if (look.balcony === 'gallery') {
    const z = z0 + FLOOR_H;
    const u = u1 + 0.08;
    poly(ctx, [P(u1, v0, z), P(u, v0, z), P(u, v1, z), P(u1, v1, z)], shade(STONE.wood, 1));
    const f = faceR(v0, v1, u);
    for (let t = v0; t <= v1 + 1e-6; t += (v1 - v0) / 5) {
      line(ctx, fp(f, t, z), fp(f, t, z + FLOOR_H - 1), shade(STONE.timber, 0.85), 1);
      line(ctx, fp(f, t, 0), fp(f, t, z), shade(STONE.timber, 0.85), 1);
    }
    line(ctx, fp(f, v0, z + 4), fp(f, v1, z + 4), shade(STONE.timber, 0.85), 0.9);
  }
}

/** Square tower behind a building (clock tower, keep). Returns its top z. */
function tower(
  ctx: DrawCtx,
  look: BuildingLook,
  style: ArchitectureStyle,
  u0: number,
  v0: number,
  w: number,
  height: number,
  clock: boolean,
): number {
  const u1 = u0 + w;
  const v1 = v0 + w;
  const wall = look.wall === 'timber_frame' || look.wall === 'stone_timber' || look.wall === 'wood' ? 'sandstone' : look.wall;
  const L = faceL(u0, u1, v1);
  const R = faceR(v0, v1, u1);
  paintWall(ctx, L, 0, height, wall, look.facade);
  paintWall(ctx, R, 0, height, wall, look.facade);
  for (let z = 8; z < height - 14; z += FLOOR_H + 2) {
    drawWindow(ctx, L, (u0 + u1) / 2, z, style === 'turkish' ? 'arched' : 'small');
    drawWindow(ctx, R, (v0 + v1) / 2, z, style === 'turkish' ? 'arched' : 'small');
  }
  if (clock) {
    drawClock(ctx, L, (u0 + u1) / 2, height - 7, 3.4);
    drawClock(ctx, R, (v0 + v1) / 2, height - 7, 3.4);
  }
  if (style === 'turkish') {
    // gallery band and a pointed lead cap with finial
    box(ctx, u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, height, height + 2, shade(STONE.quoin, 1));
    const apex = P((u0 + u1) / 2, (v0 + v1) / 2, height + 2 + w * 70);
    poly(ctx, [P(u0 - 0.02, v1 + 0.02, height + 2), P(u1 + 0.02, v1 + 0.02, height + 2), apex], shade(ROOF_HEX.lead, 1.05));
    poly(ctx, [P(u1 + 0.02, v1 + 0.02, height + 2), P(u1 + 0.02, v0 - 0.02, height + 2), apex], shade(ROOF_HEX.lead, 0.8));
    line(ctx, apex, [apex[0], apex[1] - 5], 0xc9a23a, 1.2);
    ctx.g.circle(apex[0], apex[1] - 6, 1.3).fill(0xd9b84a);
    return height + 2 + w * 70;
  }
  // Scottish steeple: corbelled parapet and a slender slate spire with weathervane
  box(ctx, u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, height, height + 3, shade(STONE.quoin, 1));
  const apex = P((u0 + u1) / 2, (v0 + v1) / 2, height + 3 + w * 110);
  poly(ctx, [P(u0, v1, height + 3), P(u1, v1, height + 3), apex], shade(ROOF_HEX.slate, 1.05));
  poly(ctx, [P(u1, v1, height + 3), P(u1, v0, height + 3), apex], shade(ROOF_HEX.slate, 0.8));
  if (ctx.snow) poly(ctx, [lerpPt(P(u0, v1, height + 3), apex, 0.5), lerpPt(P(u1, v1, height + 3), apex, 0.5), apex], 0xf4f7fa, 0.8);
  line(ctx, apex, [apex[0], apex[1] - 6], 0x2a2a2a, 1);
  line(ctx, [apex[0] - 3, apex[1] - 5], [apex[0] + 3, apex[1] - 5], 0x2a2a2a, 0.8);
  return height + 3 + w * 110;
}

const lerpPt = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ------------------------------------------------------------------ ground dressing

function groundPad(ctx: DrawCtx, w: number, h: number, color: number, alpha: number): void {
  poly(ctx, [P(0.05, 0.05), P(w - 0.05, 0.05), P(w - 0.05, h - 0.05), P(0.05, h - 0.05)], color, alpha);
}

function smallTree(ctx: DrawCtx, u: number, v: number, s: number, pal: SeasonPalette, fruit: boolean): void {
  const p = P(u, v);
  ctx.g.ellipse(p[0], p[1], 5 * s, 2.2 * s).fill({ color: COLORS.shadow, alpha: 0.18 });
  ctx.g.rect(p[0] - 1 * s, p[1] - 7 * s, 2 * s, 7 * s).fill(COLORS.trunk);
  if (pal.snow) {
    ctx.g.circle(p[0], p[1] - 10 * s, 4 * s).fill(0xe9eef2);
    return;
  }
  const leaf = pal.leaf[0]!;
  ctx.g.circle(p[0] - 2 * s, p[1] - 10 * s, 4.2 * s).fill(shade(leaf, 0.88));
  ctx.g.circle(p[0] + 2 * s, p[1] - 11 * s, 4.2 * s).fill(leaf);
  if (fruit) for (const [dx, dy] of [[-2, -11], [2, -9], [1, -13]] as const) ctx.g.circle(p[0] + dx * s, p[1] + dy * s, 0.9 * s).fill(0xd8432f);
  if (p[1] - 15 * s < ctx.topY) ctx.topY = p[1] - 15 * s;
}

function hedgeRow(ctx: DrawCtx, a: [number, number], b: [number, number], pal: SeasonPalette): void {
  const color = pal.snow ? 0xdfe7ea : shade(pal.pine, 1.15);
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.12));
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 0.85) / n;
    const u0 = a[0] + (b[0] - a[0]) * t0;
    const v0 = a[1] + (b[1] - a[1]) * t0;
    const u1 = a[0] + (b[0] - a[0]) * t1;
    const v1 = a[1] + (b[1] - a[1]) * t1;
    box(ctx, Math.min(u0, u1) - 0.02, Math.min(v0, v1) - 0.02, Math.max(u0, u1) + 0.02, Math.max(v0, v1) + 0.02, 0, 3.5, color);
  }
}

function flowers(ctx: DrawCtx, u0: number, v0: number, u1: number, v1: number): void {
  const colors = [0xe0507a, 0xf2c94c, 0xffffff, 0xb05ad6, 0xe86a3a];
  for (let i = 0; i < 14; i++) {
    const p = P(u0 + (u1 - u0) * rnd(ctx.seed, 600 + i), v0 + (v1 - v0) * rnd(ctx.seed, 620 + i), 1);
    ctx.g.circle(p[0], p[1], 1.1).fill(colors[i % colors.length]!);
  }
}

/** Dressing behind the building (drawn first). */
function dressBack(ctx: DrawCtx, look: BuildingLook, w: number, _h: number, pal: SeasonPalette): void {
  if (look.garden === 'orchard') smallTree(ctx, w * 0.12, 0.12, 0.8, pal, true);
}

/** Dressing in front of the building (drawn last). */
function dressFront(ctx: DrawCtx, look: BuildingLook, w: number, h: number, pal: SeasonPalette): void {
  if (look.garden === 'hedge') {
    hedgeRow(ctx, [0.06, h - 0.05], [w * 0.35, h - 0.05], pal);
    hedgeRow(ctx, [w - 0.05, 0.08], [w - 0.05, h * 0.4], pal);
  } else if (look.garden === 'flowers' && !pal.snow) {
    flowers(ctx, 0.08, h - 0.14, w * 0.45, h - 0.04);
    flowers(ctx, w - 0.14, 0.1, w - 0.04, h * 0.45);
  } else if (look.garden === 'orchard') {
    smallTree(ctx, w - 0.08, h * 0.22, 0.75, pal, true);
  }
  if (look.courtyard === 'well') {
    const u = w - 0.16;
    const v = h - 0.14;
    box(ctx, u - 0.07, v - 0.07, u + 0.07, v + 0.07, 0, 3.5, STONE.granite);
    poly(ctx, [P(u - 0.05, v - 0.05, 3.5), P(u + 0.05, v - 0.05, 3.5), P(u + 0.05, v + 0.05, 3.5), P(u - 0.05, v + 0.05, 3.5)], 0x3f8fc0);
    line(ctx, P(u - 0.06, v, 3.5), P(u - 0.06, v, 10), STONE.timber, 1);
    line(ctx, P(u + 0.06, v, 3.5), P(u + 0.06, v, 10), STONE.timber, 1);
    poly(ctx, [P(u - 0.09, v - 0.08, 10), P(u + 0.09, v + 0.08, 10), P(u, v, 14)], ROOF_HEX.clay);
  } else if (look.courtyard === 'avlu') {
    // courtyard wall with a gate along the front edges
    const stone = STONE.sandstone;
    const L = faceL(0.05, w - 0.05, h - 0.04);
    const R = faceR(0.05, h - 0.04, w - 0.04);
    const gate = w * 0.55;
    quad(ctx, L, 0.05, gate - 0.08, 0, 5, shade(stone, 1));
    quad(ctx, L, gate + 0.08, w - 0.05, 0, 5, shade(stone, 1));
    quad(ctx, R, 0.05, h - 0.04, 0, 5, shade(stone, 0.8));
    quad(ctx, L, 0.05, w - 0.05, 5, 6, shade(STONE.quoin, 1.05));
    poly(ctx, [fp(L, gate - 0.09, 5), fp(L, gate + 0.09, 5), fp(L, gate, 9)], ROOF_HEX.clay);
  }
}

// ------------------------------------------------------------------ building types

function house(ctx: DrawCtx, look: BuildingLook, style: ArchitectureStyle, pal: SeasonPalette): void {
  const big = look.floors >= 3;
  const [u0, v0, u1, v1] = big ? [0.13, 0.15, 0.87, 0.85] : look.floors === 2 ? [0.16, 0.18, 0.84, 0.82] : [0.18, 0.22, 0.82, 0.8];
  shadowFor(ctx, u0, v0, u1, v1, look.floors * FLOOR_H + 12);
  dressBack(ctx, look, 1, 1, pal);
  mass(ctx, look, u0, v0, u1, v1, {
    axis: style === 'scottish' ? 'u' : undefined,
    spacing: big ? 0.24 : 0.3,
  });
  dressFront(ctx, look, 1, 1, pal);
}

function townCenter(ctx: DrawCtx, look: BuildingLook, style: ArchitectureStyle, level: number, pal: SeasonPalette): void {
  groundPad(ctx, 2, 2, style === 'turkish' ? 0xd9c49a : 0xb9b4a6, 0.85);
  if (ctx.detail >= 1) {
    // paving setts
    for (let i = 1; i < 8; i++) line(ctx, P(0.1, i * 0.24), P(1.9, i * 0.24), 0x000000, 0.4, 0.12);
  }
  const flag = CULTURES[style].flag;
  if (style === 'scottish') {
    // tolbooth: steeple at the back, harled hall with crow-stepped gables, mercat cross in front
    const top = tower(ctx, look, style, 0.22, 0.22, 0.42, level >= 2 ? 62 : 52, true);
    shadowFor(ctx, 0.2, 0.85, 1.85, 1.75, 30);
    mass(ctx, look, 0.62, 0.9, 1.85, 1.72, { axis: 'u', door: 'L', doorT: 1.24, spacing: 0.26 });
    const flagAt = P(0.43, 0.43, top);
    drawFlagPole(ctx, flagAt, flag, 0);
    // mercat cross: stepped base, shaft and unicorn-style finial (original simplified form)
    const cu = 1.45;
    const cv = 0.42;
    box(ctx, cu - 0.14, cv - 0.14, cu + 0.14, cv + 0.14, 0, 2.5, STONE.granite);
    box(ctx, cu - 0.09, cv - 0.09, cu + 0.09, cv + 0.09, 2.5, 5, STONE.granite);
    box(ctx, cu - 0.025, cv - 0.025, cu + 0.025, cv + 0.025, 5, 22, STONE.sandstone);
    const c = P(cu, cv, 24);
    ctx.g.circle(c[0], c[1], 2.2).fill(0xe7e2d6);
  } else {
    // fountain (şadırvan) and clock tower stand in front of the konak's left end: draw them first
    const cu = 0.5;
    const cv = 0.55;
    box(ctx, cu - 0.16, cv - 0.16, cu + 0.16, cv + 0.16, 0, 3, STONE.sandstone);
    poly(ctx, [P(cu - 0.12, cv - 0.12, 3), P(cu + 0.12, cv - 0.12, 3), P(cu + 0.12, cv + 0.12, 3), P(cu - 0.12, cv + 0.12, 3)], pal.snow ? 0xcfe7f2 : 0x4fa9d6);
    box(ctx, cu - 0.03, cv - 0.03, cu + 0.03, cv + 0.03, 3, 8, STONE.quoin);
    const top = tower(ctx, look, style, 0.32, 1.18, 0.3, level >= 2 ? 64 : 54, true);
    drawFlagPole(ctx, P(0.47, 1.33, top - 0.3 * 70 + 2), flag, 0);
    // konak (government house) with wide eaves
    shadowFor(ctx, 0.85, 0.15, 1.85, 1.85, 34);
    mass(ctx, look, 0.9, 0.2, 1.85, 1.82, { axis: 'v', door: 'L', doorT: 1.38, spacing: 0.26 });
  }
}

function warehouse(ctx: DrawCtx, look: BuildingLook, style: ArchitectureStyle, pal: SeasonPalette): void {
  shadowFor(ctx, 0.16, 0.22, 1.84, 1.78, 30);
  dressBack(ctx, look, 2, 2, pal);
  mass(ctx, look, 0.16, 0.26, 1.84, 1.76, {
    axis: 'u',
    door: 'L',
    doorT: 1.0,
    spacing: 0.42,
    balcony: false,
    roof: look.roof,
    overhang: style === 'turkish' ? 0.1 : undefined,
  });
  // crates and sacks by the door
  box(ctx, 0.3, 1.8, 0.5, 1.96, 0, 6, COLORS.plank);
  box(ctx, 0.54, 1.82, 0.68, 1.96, 0, 4.5, shade(COLORS.plank, 0.88));
  const sack = P(1.5, 1.88, 2);
  ctx.g.ellipse(sack[0], sack[1], 4, 3).fill(0xd8c79c);
  dressFront(ctx, look, 2, 2, pal);
}

function granary(ctx: DrawCtx, look: BuildingLook, style: ArchitectureStyle, level: number, pal: SeasonPalette): void {
  groundPad(ctx, 2, 2, 0xd8c79c, 0.5);
  if (style === 'turkish' && level === 1) {
    // serender: Black Sea granary raised on posts with flat "mushroom" stones against rodents
    const [u0, v0, u1, v1] = [0.42, 0.42, 1.58, 1.58];
    shadowFor(ctx, u0, v0, u1, v1, 40);
    for (const [u, v] of [
      [u0 + 0.06, v0 + 0.06],
      [u1 - 0.06, v0 + 0.06],
      [u0 + 0.06, v1 - 0.06],
      [u1 - 0.06, v1 - 0.06],
    ] as const) {
      box(ctx, u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0, 12, STONE.timber);
      box(ctx, u - 0.1, v - 0.1, u + 0.1, v + 0.1, 12, 14, STONE.granite);
    }
    mass(ctx, { ...look, floors: 1 }, u0 + 0.04, v0 + 0.04, u1 - 0.04, v1 - 0.04, {
      z0: 14,
      door: 'L',
      windows: 'small',
      spacing: 0.6,
      axis: 'u',
      overhang: 0.1,
      pitch: 24,
      chimneys: false,
    });
    // ladder
    for (let z = 2; z < 14; z += 3) line(ctx, P(0.85, v1 + 0.08, z), P(1.15, v1 + 0.08, z), STONE.timber, 1);
    line(ctx, P(0.85, v1 + 0.08, 0), P(0.85, v1 + 0.02, 15), STONE.timber, 1);
    line(ctx, P(1.15, v1 + 0.08, 0), P(1.15, v1 + 0.02, 15), STONE.timber, 1);
    return;
  }
  shadowFor(ctx, 0.3, 0.3, 1.7, 1.7, 44);
  mass(ctx, look, 0.32, 0.32, 1.68, 1.68, { door: 'L', windows: 'small', spacing: 0.5, axis: 'u', balcony: false });
  // hoist beam for the loft door
  line(ctx, P(1.0, 1.68, 24), P(1.0, 1.82, 24), STONE.timber, 1.6);
  line(ctx, P(1.0, 1.82, 24), P(1.0, 1.82, 14), 0x3a2a1c, 0.7);
  dressFront(ctx, look, 2, 2, pal);
}

function school(ctx: DrawCtx, look: BuildingLook, style: ArchitectureStyle, level: number, pal: SeasonPalette): void {
  groundPad(ctx, 2, 2, 0xd8c79c, 0.55);
  if (style === 'turkish') {
    // medrese: domed cells around a courtyard, a large dome over the lecture hall and a carved portal
    shadowFor(ctx, 0.15, 0.15, 1.85, 1.85, 30);
    mass(ctx, look, 0.15, 0.15, 1.85, 0.68, { floors: 1, door: null, windows: 'arched', spacing: 0.34, roof: 'dome', chimneys: false, balcony: false });
    mass(ctx, look, 1.32, 0.68, 1.85, 1.85, { floors: 1, door: null, windows: 'arched', spacing: 0.34, roof: 'dome', chimneys: false, balcony: false });
    drawDome(ctx, 0.66, 0.42, FLOOR_H + 2 + 0.5, 0.3);
    // courtyard with a fountain
    poly(ctx, [P(0.2, 0.7), P(1.3, 0.7), P(1.3, 1.8), P(0.2, 1.8)], 0xe8dcbf, 0.9);
    const c = P(0.75, 1.25, 0);
    ctx.g.ellipse(c[0], c[1], 10, 5).fill(shade(STONE.sandstone, 0.95));
    ctx.g.ellipse(c[0], c[1] - 1, 8, 4).fill(pal.snow ? 0xcfe7f2 : 0x4fa9d6);
    // portal (taç kapı)
    const ph = level >= 2 ? 30 : 26;
    const L = faceL(0.42, 0.92, 1.86);
    const R = faceR(1.62, 1.86, 0.92);
    paintWall(ctx, L, 0, ph, 'sandstone', look.facade);
    paintWall(ctx, R, 0, ph, 'sandstone', look.facade);
    drawDoor(ctx, L, 0.67, 0, 'arched', look);
    if (ctx.detail >= 1) {
      // muqarnas niche hint: nested arches above the door
      for (let k = 0; k < 3; k++) quad(ctx, L, 0.55 + k * 0.01, 0.79 - k * 0.01, 13 + k * 3, 14 + k * 3, shade(STONE.sandMortar, 0.9));
      quad(ctx, L, 0.47, 0.87, ph - 3, ph - 1.5, shade(0x3b7f9c, 1));
    }
    poly(ctx, [P(0.42, 1.62, ph), P(0.92, 1.62, ph), P(0.92, 1.86, ph), P(0.42, 1.86, ph)], shade(STONE.sandstone, 1.1));
    if (look.decor === 'lanterns') {
      const p = fp(L, 0.67, 22);
      ctx.g.circle(p[0], p[1], 1.6).fill(0xf6d46b);
      ctx.lights.push([[p[0] - 1, p[1] - 1], [p[0] + 1, p[1] - 1], [p[0] + 1, p[1] + 1], [p[0] - 1, p[1] + 1]]);
    }
    return;
  }
  // Scottish parish school with a bell cote on the gable
  shadowFor(ctx, 0.3, 0.45, 1.75, 1.65, 34);
  mass(ctx, look, 0.3, 0.5, 1.75, 1.6, { axis: 'u', door: 'L', doorT: 0.62, spacing: 0.3 });
  // porch
  box(ctx, 0.48, 1.6, 0.76, 1.8, 0, 9, wallBase(look.wall, look.facade));
  drawRoof(ctx, { u0: 0.48, v0: 1.6, u1: 0.76, v1: 1.8, z: 9 }, 'gable', look.roofMaterial, wallBase(look.wall, look.facade), { axis: 'v' });
  // playground slate fence
  line(ctx, P(0.1, 1.92, 4), P(1.9, 1.92, 4), STONE.timber, 1.2);
  for (let u = 0.1; u <= 1.91; u += 0.3) line(ctx, P(u, 1.92, 0), P(u, 1.92, 6), STONE.timber, 1.2);
}

function lumberCamp(ctx: DrawCtx, look: BuildingLook, level: number): void {
  groundPad(ctx, 2, 2, COLORS.earth, 0.55);
  const s = level >= 2 ? 1.1 : 0.95;
  shadowFor(ctx, 0.16, 0.16, s, s, 22);
  mass(ctx, look, 0.16, 0.16, s, s, { floors: 1, door: 'L', windows: 'small', spacing: 0.4, axis: 'u' });
  const logs = level >= 2 ? 4 : 3;
  for (let i = 0; i < logs; i++) {
    const v = 0.26 + i * 0.17;
    box(ctx, 1.22, v, 1.86, v + 0.13, 0, 5, COLORS.trunk);
    poly(ctx, [P(1.86, v, 0.5), P(1.86, v + 0.13, 0.5), P(1.86, v + 0.13, 4.5), P(1.86, v, 4.5)], 0xe0bd86);
  }
  box(ctx, 1.3, 0.34, 1.86, 0.47, 5, 10, COLORS.trunk);
  box(ctx, 1.3, 0.51, 1.86, 0.64, 5, 10, COLORS.trunk);
  box(ctx, 1.18, 1.26, 1.8, 1.7, 0, level >= 2 ? 8 : 5, COLORS.plank);
  box(ctx, 0.42, 1.36, 0.6, 1.54, 0, 6, COLORS.trunk);
  line(ctx, P(0.5, 1.45, 6), P(0.62, 1.38, 15), 0x6b6f75, 2);
  ctx.smoke.push(P(0.5, 1.45, 8));
}

function farm(ctx: DrawCtx, look: BuildingLook, style: ArchitectureStyle, level: number, pal: SeasonPalette): void {
  poly(ctx, [P(0.04, 0.04), P(1.96, 0.04), P(1.96, 1.96), P(0.04, 1.96)], pal.furrow);
  for (let v = 0.12; v < 1.9; v += 0.25) {
    const uStart = 0.1;
    const uEnd = v < 0.95 ? 1.05 : 1.9;
    const z = pal.cropHeight;
    poly(ctx, [P(uStart, v), P(uEnd, v), P(uEnd, v + 0.14), P(uStart, v + 0.14)], shade(pal.fertile, 0.92));
    if (z > 0) {
      poly(ctx, [P(uStart, v + 0.14, 0), P(uEnd, v + 0.14, 0), P(uEnd, v + 0.14, z), P(uStart, v + 0.14, z)], shade(pal.crop, 0.85));
      poly(ctx, [P(uStart, v, z), P(uEnd, v, z), P(uEnd, v + 0.14, z), P(uStart, v + 0.14, z)], pal.crop);
      if (ctx.detail >= 2)
        for (let u = uStart + 0.05; u < uEnd; u += 0.09) {
          const p = P(u, v + 0.07, z + 1);
          ctx.g.circle(p[0], p[1], 0.8).fill(shade(pal.crop, 1.2));
        }
    } else if (pal.snow) {
      poly(ctx, [P(uStart, v), P(uEnd, v), P(uEnd, v + 0.07), P(uStart, v + 0.07)], 0xf4f7f9, 0.9);
    }
  }
  if (style === 'scottish') {
    // dry-stone dyke instead of a fence
    box(ctx, 0.04, 1.9, 1.96, 1.98, 0, 4, STONE.granite);
    box(ctx, 1.9, 0.9, 1.98, 1.9, 0, 4, STONE.granite);
  } else {
    line(ctx, P(0.04, 1.96, 5), P(1.96, 1.96, 5), COLORS.woodDark, 1.5);
    line(ctx, P(1.96, 0.9, 5), P(1.96, 1.96, 5), COLORS.woodDark, 1.5);
    for (let u = 0.04; u <= 1.97; u += 0.32) line(ctx, P(u, 1.96, 0), P(u, 1.96, 7), COLORS.woodDark, 1.5);
  }
  shadowFor(ctx, 1.16, 0.14, 1.86, 0.86, 22);
  mass(ctx, look, 1.16, 0.14, 1.86, 0.86, { floors: level >= 2 ? 2 : 1, door: 'L', windows: 'small', spacing: 0.45, axis: 'v', balcony: false });
  if (level >= 2) {
    // hay stack
    const c = P(0.4, 0.4, 0);
    ctx.g.ellipse(c[0], c[1] - 6, 11, 9).fill(pal.snow ? 0xe9eef2 : 0xd9b65c);
    ctx.g.ellipse(c[0] - 3, c[1] - 9, 5, 3).fill({ color: 0xffffff, alpha: 0.2 });
  }
}

function quarry(ctx: DrawCtx, look: BuildingLook, level: number): void {
  poly(ctx, [P(0.05, 0.05), P(1.95, 0.05), P(1.95, 1.95), P(0.05, 1.95)], 0x8d8f8a);
  poly(ctx, [P(0.9, 0.9), P(1.8, 0.9), P(1.8, 1.8), P(0.9, 1.8)], 0x6f726e);
  box(ctx, 0.1, 0.1, 1.2, 0.8, 0, 12, COLORS.rock);
  box(ctx, 0.1, 0.1, 0.8, 0.5, 12, 22, shade(COLORS.rock, 1.05));
  if (level >= 2) box(ctx, 0.1, 0.1, 0.45, 0.32, 22, 30, shade(COLORS.rock, 1.1));
  box(ctx, 1.2, 1.3, 1.5, 1.6, 0, 7, 0xc9cdd2);
  box(ctx, 1.55, 1.05, 1.78, 1.28, 0, 5, 0xb9bdc2);
  mass(ctx, look, 0.15, 1.05, 0.7, 1.6, { floors: 1, door: 'L', windows: 'small', spacing: 0.5, axis: 'u', balcony: false });
  line(ctx, P(1.5, 0.5, 0), P(1.5, 0.5, 34), COLORS.woodDark, 3);
  line(ctx, P(1.5, 0.5, 34), P(1.2, 1.2, 28), COLORS.woodDark, 2.5);
  line(ctx, P(1.2, 1.2, 28), P(1.2, 1.2, 10), 0x3a2a1c, 1);
  box(ctx, 1.12, 1.12, 1.28, 1.28, 5, 10, 0xc9cdd2);
  if (P(1.5, 0.5, 34)[1] < ctx.topY) ctx.topY = P(1.5, 0.5, 34)[1];
}

function terraceFarm(ctx: DrawCtx, look: BuildingLook, level: number, pal: SeasonPalette): void {
  // three stepped strips held by dry-stone retaining walls, crops on each
  for (let k = 0; k < 3; k++) {
    const v0 = 0.08 + k * 0.62;
    const v1 = v0 + 0.56;
    const z = (2 - k) * 4;
    const wall = faceL(0.06, 1.94, v1);
    paintWall(ctx, wall, 0, z + 3, 'granite', 'grey');
    poly(ctx, [P(0.06, v0, z + 3), P(1.94, v0, z + 3), P(1.94, v1, z + 3), P(0.06, v1, z + 3)], pal.furrow);
    for (let v = v0 + 0.06; v < v1 - 0.08; v += 0.16) {
      const zc = z + 3 + pal.cropHeight * 0.8;
      if (pal.cropHeight > 0) {
        poly(ctx, [P(0.12, v + 0.1, z + 3), P(1.88, v + 0.1, z + 3), P(1.88, v + 0.1, zc), P(0.12, v + 0.1, zc)], shade(pal.crop, 0.85));
        poly(ctx, [P(0.12, v, zc), P(1.88, v, zc), P(1.88, v + 0.1, zc), P(0.12, v + 0.1, zc)], pal.crop);
      } else if (pal.snow) {
        poly(ctx, [P(0.12, v, z + 3), P(1.88, v, z + 3), P(1.88, v + 0.1, z + 3), P(0.12, v + 0.1, z + 3)], 0xf4f7f9, 0.9);
      }
    }
  }
  mass(ctx, look, 1.5, 0.1, 1.92, 0.5, { z0: 11, floors: 1, door: 'L', windows: 'small', spacing: 0.5, axis: 'v', balcony: false, chimneys: level >= 2 });
}

function awning(ctx: DrawCtx, u0: number, u1: number, v: number, z: number, a: number, b: number): void {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t0 = u0 + ((u1 - u0) * i) / n;
    const t1 = u0 + ((u1 - u0) * (i + 1)) / n;
    poly(ctx, [P(t0, v, z), P(t1, v, z), P(t1, v + 0.16, z - 4), P(t0, v + 0.16, z - 4)], i % 2 ? a : b);
  }
}

function stall(ctx: DrawCtx, u: number, v: number, color: number, goods: number[]): void {
  box(ctx, u, v, u + 0.3, v + 0.2, 0, 4, COLORS.plank);
  goods.forEach((c, i) => box(ctx, u + 0.03 + i * 0.09, v + 0.04, u + 0.1 + i * 0.09, v + 0.16, 4, 6, c));
  for (const du of [0.02, 0.28]) line(ctx, P(u + du, v + 0.2, 0), P(u + du, v + 0.2, 10), STONE.timber, 1);
  poly(ctx, [P(u - 0.03, v - 0.02, 11), P(u + 0.33, v - 0.02, 11), P(u + 0.33, v + 0.24, 9), P(u - 0.03, v + 0.24, 9)], color);
}

function market(ctx: DrawCtx, look: BuildingLook, style: ArchitectureStyle, level: number, pal: SeasonPalette): void {
  groundPad(ctx, 2, 2, style === 'turkish' ? 0xdcc9a0 : 0xb9b4a6, 0.9);
  if (style === 'turkish') {
    // arasta: a vaulted row of shops with domes, and a striped awning over the stalls
    shadowFor(ctx, 0.15, 0.15, 1.85, 0.85, 22);
    mass(ctx, look, 0.15, 0.15, 1.85, 0.85, { floors: 1, door: 'L', doorT: 1.0, windows: 'arched', spacing: 0.24, chimneys: false, balcony: false });
    awning(ctx, 0.15, 1.85, 0.85, 10, 0xc0392b, 0xf3ead8);
    if (level >= 2) mass(ctx, look, 1.3, 0.85, 1.85, 1.6, { floors: 1, door: 'L', windows: 'arched', spacing: 0.3, chimneys: false, balcony: false });
    stall(ctx, 0.3, 1.25, 0xd9852a, [0xd23a32, 0xe8b23a, 0x6fae4a]);
    stall(ctx, 0.75, 1.5, 0x3d7fb5, [0x8a5a36, 0xe0d2b4, 0xc94f8e]);
  } else {
    // covered market hall at the back, a mercat cross and stalls in the square
    shadowFor(ctx, 0.15, 0.2, 1.85, 0.9, 26);
    mass(ctx, look, 0.15, 0.2, 1.85, 0.9, { door: 'L', doorT: 1.0, windows: 'arched', spacing: 0.3, axis: 'u', balcony: false });
    const cu = 1.4;
    const cv = 1.35;
    box(ctx, cu - 0.12, cv - 0.12, cu + 0.12, cv + 0.12, 0, 2.5, STONE.granite);
    box(ctx, cu - 0.025, cv - 0.025, cu + 0.025, cv + 0.025, 2.5, 20, STONE.sandstone);
    const c = P(cu, cv, 22);
    ctx.g.circle(c[0], c[1], 2).fill(0xe7e2d6);
    stall(ctx, 0.3, 1.2, 0x2f5fa7, [0xe8b23a, 0x6fae4a, 0xd23a32]);
    stall(ctx, 0.55, 1.6, 0xf3ead8, [0x8a5a36, 0xd9852a, 0x3d7fb5]);
  }
  void pal;
}

function inn(ctx: DrawCtx, look: BuildingLook, style: ArchitectureStyle, level: number, pal: SeasonPalette): void {
  if (style === 'turkish') {
    // kervansaray: walled courtyard with rooms behind a tall carved portal
    groundPad(ctx, 2, 2, 0xdcc9a0, 0.7);
    shadowFor(ctx, 0.1, 0.1, 1.9, 1.9, 24);
    const walls = level >= 2 ? 2 : 1;
    mass(ctx, look, 0.1, 0.1, 1.9, 0.6, { floors: walls, door: null, windows: 'small', spacing: 0.3, chimneys: false, balcony: false });
    mass(ctx, look, 1.4, 0.6, 1.9, 1.9, { floors: walls, door: null, windows: 'small', spacing: 0.3, chimneys: false, balcony: false });
    for (const [u, v] of [
      [0.5, 0.35],
      [1.0, 0.35],
      [1.65, 1.0],
    ] as const)
      drawDome(ctx, u, v, walls * FLOOR_H + 2, 0.12);
    poly(ctx, [P(0.15, 0.65), P(1.35, 0.65), P(1.35, 1.85), P(0.15, 1.85)], 0xe8dcbf, 0.95);
    const c = P(0.75, 1.2, 0);
    ctx.g.ellipse(c[0], c[1], 9, 4.5).fill(shade(STONE.sandstone, 0.95));
    ctx.g.ellipse(c[0], c[1] - 1, 7, 3.5).fill(pal.snow ? 0xcfe7f2 : 0x4fa9d6);
    const L = faceL(0.1, 1.4, 1.9);
    paintWall(ctx, L, 0, 9, 'sandstone', look.facade);
    const P0 = faceL(0.5, 1.0, 1.92);
    paintWall(ctx, P0, 0, walls * FLOOR_H + 10, 'sandstone', look.facade);
    drawDoor(ctx, P0, 0.75, 0, 'arched', look);
    if (ctx.detail >= 1) for (let k = 0; k < 3; k++) quad(ctx, P0, 0.6 + k * 0.012, 0.9 - k * 0.012, 12 + k * 3, 13 + k * 3, shade(STONE.sandMortar, 0.85));
    poly(ctx, [P(0.5, 1.7, walls * FLOOR_H + 10), P(1.0, 1.7, walls * FLOOR_H + 10), P(1.0, 1.92, walls * FLOOR_H + 10), P(0.5, 1.92, walls * FLOOR_H + 10)], shade(STONE.sandstone, 1.1));
    return;
  }
  // coaching inn with a stable block and a hanging sign
  groundPad(ctx, 2, 2, 0xb9b4a6, 0.6);
  shadowFor(ctx, 0.2, 0.25, 1.4, 1.6, 36);
  mass(ctx, look, 0.2, 0.3, 1.4, 1.55, { axis: 'u', door: 'L', doorT: 0.8, spacing: 0.26 });
  mass(ctx, { ...look, floors: 1, wall: 'granite', chimney: 'none', decor: 'none', tower: 'none' }, 1.5, 0.3, 1.9, 1.55, { door: 'L', windows: 'small', spacing: 0.4, axis: 'v', balcony: false });
  const sign = P(0.45, 1.6, 15);
  line(ctx, sign, [sign[0] - 6, sign[1] + 3], STONE.timber, 1.2);
  ctx.g.rect(sign[0] - 9, sign[1] + 3, 7, 6).fill(0x7a2f2f);
  ctx.g.rect(sign[0] - 8, sign[1] + 4, 5, 4).fill(0xd9b84a);
}

function watchtower(ctx: DrawCtx, look: BuildingLook, style: ArchitectureStyle): void {
  const h = look.floors * FLOOR_H + 6;
  shadowFor(ctx, 0.25, 0.25, 0.75, 0.75, h);
  const L = faceL(0.25, 0.75, 0.75);
  const R = faceR(0.25, 0.75, 0.75);
  paintWall(ctx, L, 0, h, look.wall, look.facade);
  paintWall(ctx, R, 0, h, look.wall, look.facade);
  drawDoor(ctx, L, 0.5, 0, 'arched', look);
  for (let z = 14; z < h - 6; z += FLOOR_H) {
    drawWindow(ctx, L, 0.5, z, look.windows);
    drawWindow(ctx, R, 0.5, z, look.windows);
  }
  const wallColor = wallBase(look.wall, look.facade);
  // corbelled battlements
  box(ctx, 0.2, 0.2, 0.8, 0.8, h, h + 2, shade(wallColor, 1.05));
  for (const f of [faceL(0.2, 0.8, 0.8), faceR(0.2, 0.8, 0.8)])
    for (let i = 0; i < 5; i += 2) quad(ctx, f, f.a + (0.6 * i) / 5, f.a + (0.6 * (i + 1)) / 5, h + 2, h + 5, shade(wallColor, f.light));
  if (style === 'scottish') {
    drawRoof(ctx, { u0: 0.3, v0: 0.3, u1: 0.7, v1: 0.7, z: h + 2 }, 'pyramid', 'slate', wallColor, { pitch: 40, overhang: 0 });
    if (look.tower === 'turret') drawTurret(ctx, 0.78, 0.78, h - 6, h + 6, 0.07, wallColor, ROOF_HEX.slate);
  } else {
    drawRoof(ctx, { u0: 0.3, v0: 0.3, u1: 0.7, v1: 0.7, z: h + 2 }, 'pyramid', 'lead', wallColor, { pitch: 46, overhang: 0 });
  }
  drawFlagPole(ctx, P(0.5, 0.5, h + 16), CULTURES[style].flag, 2);
}

function shipyard(ctx: DrawCtx, look: BuildingLook, level: number): void {
  // timber slipway sloping to the water, a ship on the stocks, a crane and the shipwrights' shed
  poly(ctx, [P(0.05, 0.05), P(1.95, 0.05), P(1.95, 1.95), P(0.05, 1.95)], 0xcbb38a, 0.9);
  for (let v = 0.9; v <= 1.95; v += 0.12) poly(ctx, [P(0.35, v), P(1.95, v), P(1.95, v + 0.05), P(0.35, v + 0.05)], shade(COLORS.plank, 0.85));
  shadowFor(ctx, 0.1, 0.1, 0.95, 0.8, 24);
  mass(ctx, look, 0.1, 0.1, 0.95, 0.8, { door: 'L', windows: 'small', spacing: 0.4, axis: 'u', balcony: false });
  box(ctx, 1.1, 0.2, 1.5, 0.45, 0, 5, COLORS.trunk);
  box(ctx, 1.1, 0.48, 1.5, 0.7, 0, 4, COLORS.plank);
  // hull on the stocks
  const hull = 0x7a4a2a;
  const keel: Pt[] = [P(0.55, 1.42, 4), P(1.85, 1.42, 4), P(1.95, 1.42, 12), P(0.45, 1.42, 12)];
  poly(ctx, keel, shade(hull, 0.9));
  poly(ctx, [P(0.45, 1.42, 12), P(1.95, 1.42, 12), P(1.85, 1.2, 14), P(0.55, 1.2, 14)], shade(hull, 1.15));
  for (let u = 0.6; u < 1.85; u += 0.18) line(ctx, P(u, 1.42, 4), P(u, 1.42, 12), shade(hull, 0.7), 0.7);
  if (level >= 2) {
    box(ctx, 1.05, 1.25, 1.35, 1.4, 14, 20, 0xeee2c4);
    line(ctx, P(1.2, 1.32, 20), P(1.2, 1.32, 44), STONE.timber, 1.4);
  }
  for (const u of [0.6, 1.0, 1.4, 1.8]) line(ctx, P(u, 1.6, 0), P(u, 1.45, 6), STONE.timber, 1.2);
  // crane
  line(ctx, P(1.75, 0.6, 0), P(1.75, 0.6, 40), COLORS.woodDark, 2.5);
  line(ctx, P(1.75, 0.6, 40), P(1.2, 1.25, 34), COLORS.woodDark, 2);
  line(ctx, P(1.2, 1.25, 34), P(1.2, 1.25, 18), 0x3a2a1c, 0.8);
  if (P(1.75, 0.6, 40)[1] < ctx.topY) ctx.topY = P(1.75, 0.6, 40)[1];
}

// ------------------------------------------------------------------ entry point

export const FOOTPRINT_PX_TOP = 0;

/**
 * Draws a building into `g` (local tile space, origin at the footprint's top vertex) and returns
 * the anchors the renderer animates. Pure function of its inputs: same data, same picture.
 */
export function drawStyledBuilding(
  g: Graphics,
  b: StyledRef,
  pal: SeasonPalette,
  detail: 0 | 1 | 2,
  seed: number,
): SpriteInfo {
  const wear = b.condition >= 5000 ? 0 : b.condition >= 2500 ? 1 : 2;
  const ctx = newCtx(g, detail, seed, pal.snow, wear);
  const look = renderLook(b);
  switch (b.definitionId) {
    case 'hut':
      house(ctx, look, b.style, pal);
      break;
    case 'town_center':
      townCenter(ctx, look, b.style, b.level, pal);
      break;
    case 'warehouse':
      warehouse(ctx, look, b.style, pal);
      break;
    case 'granary':
      granary(ctx, look, b.style, b.level, pal);
      break;
    case 'school':
      school(ctx, look, b.style, b.level, pal);
      break;
    case 'lumber_camp':
      lumberCamp(ctx, look, b.level);
      break;
    case 'farm':
      farm(ctx, look, b.style, b.level, pal);
      break;
    case 'quarry':
      quarry(ctx, look, b.level);
      break;
    case 'terrace_farm':
      terraceFarm(ctx, look, b.level, pal);
      break;
    case 'market':
      market(ctx, look, b.style, b.level, pal);
      break;
    case 'inn':
      inn(ctx, look, b.style, b.level, pal);
      break;
    case 'watchtower':
      watchtower(ctx, look, b.style);
      break;
    case 'shipyard':
      shipyard(ctx, look, b.level);
      break;
    default:
      drawLandmark(ctx, b.definitionId, pal);
  }
  void rnd;
  return { lights: ctx.lights, smoke: ctx.smoke, flags: ctx.flags, height: -ctx.topY };
}

/** Construction site in the building's culture: foundations, rising walls, scaffolding, materials. */
export function drawStyledConstruction(
  g: Graphics,
  w: number,
  h: number,
  progress: number,
  style: ArchitectureStyle,
  detail: 0 | 1 | 2,
  seed: number,
): SpriteInfo {
  const ctx = newCtx(g, detail, seed, false, 0);
  poly(ctx, [P(0.04, 0.04), P(w - 0.04, 0.04), P(w - 0.04, h - 0.04), P(0.04, h - 0.04)], 0xc9b089);
  const wall = style === 'scottish' ? 'granite' : 'stone_timber';
  const top = 3 + 24 * Math.min(1, progress);
  const [u0, v0, u1, v1] = [0.2, 0.2, w - 0.2, h - 0.2];
  paintWall(ctx, faceL(u0, u1, v1), 0, top, wall, 'cream');
  paintWall(ctx, faceR(v0, v1, u1), 0, top, wall, 'cream');
  poly(ctx, [P(u0, v0, top), P(u1, v0, top), P(u1, v1, top), P(u0, v1, top)], 0xd9c7a1);
  for (const [u, v] of [
    [0.12, h - 0.12],
    [w - 0.12, h - 0.12],
    [w - 0.12, 0.12],
  ] as const)
    line(ctx, P(u, v, 0), P(u, v, 34), COLORS.woodDark, 2);
  for (const z of [12, 24]) {
    line(ctx, P(0.12, h - 0.12, z), P(w - 0.12, h - 0.12, z), COLORS.woodDark, 1.5);
    line(ctx, P(w - 0.12, h - 0.12, z), P(w - 0.12, 0.12, z), COLORS.woodDark, 1.5);
  }
  line(ctx, P(0.12, h - 0.12, 0), P(w - 0.12, h - 0.12, 12), COLORS.woodDark, 1);
  // material piles: stone blocks and timber
  box(ctx, w - 0.42, h - 0.18, w - 0.2, h - 0.04, 0, 4, style === 'scottish' ? STONE.granite : STONE.sandstone);
  box(ctx, 0.08, h - 0.16, 0.4, h - 0.06, 0, 3, COLORS.plank);
  return { lights: [], smoke: [], flags: [], height: Math.max(36, -ctx.topY) };
}
