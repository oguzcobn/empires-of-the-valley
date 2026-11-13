import type { LandmarkId } from '../../core/types';
import { P, shade } from '../iso';
import type { Pt } from '../iso';
import type { SeasonPalette } from '../palette';
import {
  ROOF_HEX,
  STONE,
  box,
  drawDome,
  drawRoof,
  drawTurret,
  drawWindow,
  faceL,
  faceR,
  fp,
  line,
  paintWall,
  poly,
  quad,
  rnd,
} from './kit';
import type { DrawCtx } from './kit';

/**
 * Original simplified portraits of six historic monuments. Each keeps the silhouette features
 * that make the real building recognisable (crag and round battery, golden great hall, Gothic
 * spire, cliff-face monastery, conical tower, four slender minarets) without copying any artwork.
 */

// ------------------------------------------------------------------ helpers

function cylinder(ctx: DrawCtx, cu: number, cv: number, z0: number, z1: number, r: number, color: number): { top: Pt; rx: number; ry: number } {
  const b = P(cu, cv, z0);
  const t = P(cu, cv, z1);
  const rx = r * 45;
  const ry = r * 22.6;
  const body: Pt[] = [[t[0] - rx, t[1]], [b[0] - rx, b[1]]];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI - (Math.PI * i) / 12;
    body.push([b[0] + rx * Math.cos(a), b[1] + ry * Math.sin(a)]);
  }
  body.push([t[0] + rx, t[1]]);
  poly(ctx, body, shade(color, 0.86));
  const lit: Pt[] = [[t[0] - rx, t[1]], [b[0] - rx, b[1]]];
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI - (Math.PI * 0.5 * i) / 6;
    lit.push([b[0] + rx * Math.cos(a), b[1] + ry * Math.sin(a)]);
  }
  lit.push([t[0] - rx * 0.1, t[1] + ry]);
  poly(ctx, lit, shade(color, 1.06));
  ctx.g.ellipse(t[0], t[1], rx, ry).fill(shade(color, 1.12));
  if (ctx.detail >= 1)
    for (let z = z0 + 4; z < z1 - 1; z += 4.2) {
      const c = P(cu, cv, z);
      line(ctx, [c[0] - rx, c[1]], [c[0] + rx, c[1]], shade(color, 0.7), 0.5, 0.5);
    }
  if (t[1] - ry < ctx.topY) ctx.topY = t[1] - ry;
  return { top: t, rx, ry };
}

function cone(ctx: DrawCtx, top: Pt, rx: number, ry: number, h: number, color: number): Pt {
  const apex: Pt = [top[0], top[1] - h];
  const base: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (Math.PI * i) / 12;
    base.push([top[0] + rx * Math.cos(a), top[1] + ry * Math.sin(a)]);
  }
  poly(ctx, [...base, apex], shade(color, 0.85));
  poly(ctx, [[top[0] - rx, top[1]], [top[0] - rx * 0.15, top[1] + ry], apex], shade(color, 1.12));
  if (ctx.snow) poly(ctx, [[top[0] - rx * 0.4, top[1] - h * 0.55], [top[0] + rx * 0.4, top[1] - h * 0.55], apex], 0xf4f7fa, 0.85);
  if (apex[1] < ctx.topY) ctx.topY = apex[1];
  return apex;
}

/** Crenellated parapet along the two visible faces of a box top. */
function battlements(ctx: DrawCtx, u0: number, v0: number, u1: number, v1: number, z: number, color: number): void {
  const L = faceL(u0, u1, v1);
  const R = faceR(v0, v1, u1);
  for (const f of [L, R]) {
    const n = Math.max(2, Math.round((f.b - f.a) / 0.1));
    for (let i = 0; i < n; i += 2) {
      const ta = f.a + ((f.b - f.a) * i) / n;
      const tb = f.a + ((f.b - f.a) * (i + 1)) / n;
      quad(ctx, f, ta, tb, z, z + 3, shade(color, f.light));
    }
  }
}

function rockBase(ctx: DrawCtx, u0: number, v0: number, u1: number, v1: number, h: number, color: number): void {
  // irregular volcanic rock: lumpy faces in two tones plus cracks
  const L = faceL(u0, u1, v1);
  const R = faceR(v0, v1, u1);
  for (const f of [L, R]) {
    const n = 7;
    const pts: Pt[] = [fp(f, f.a, 0)];
    for (let i = 0; i <= n; i++) pts.push(fp(f, f.a + ((f.b - f.a) * i) / n, h * (0.75 + rnd(ctx.seed, i + (f.side === 'L' ? 0 : 20)) * 0.3)));
    pts.push(fp(f, f.b, 0));
    poly(ctx, pts, shade(color, f.light));
    if (ctx.detail >= 1)
      for (let i = 1; i < n; i++) {
        const t = f.a + ((f.b - f.a) * i) / n;
        line(ctx, fp(f, t, 0), fp(f, t + 0.03, h * 0.7), shade(color, f.light * 0.7), 0.7, 0.7);
      }
  }
  poly(ctx, [P(u0, v0, h), P(u1, v0, h), P(u1, v1, h), P(u0, v1, h)], shade(color, 1.1));
}

function block(
  ctx: DrawCtx,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  z0: number,
  z1: number,
  wall: Parameters<typeof paintWall>[4],
  facade: Parameters<typeof paintWall>[5],
  windows: 'sash' | 'small' | 'arched',
  spacing = 0.22,
): void {
  const L = faceL(u0, u1, v1);
  const R = faceR(v0, v1, u1);
  paintWall(ctx, L, z0, z1, wall, facade);
  paintWall(ctx, R, z0, z1, wall, facade);
  for (const f of [L, R]) {
    const n = Math.max(1, Math.floor((f.b - f.a) / spacing));
    for (let z = z0 + 3; z < z1 - 7; z += 9)
      for (let i = 0; i < n; i++) drawWindow(ctx, f, f.a + ((i + 0.5) * (f.b - f.a)) / n, z, windows);
  }
}

// ------------------------------------------------------------------ the six monuments

function edinburgh(ctx: DrawCtx): void {
  const rock = 0x5b5852;
  rockBase(ctx, 0.15, 0.15, 2.85, 2.85, 20, rock);
  const z = 20;
  const stone = 0x9b958a;
  // palace block with a tower at the back
  block(ctx, 0.45, 0.35, 1.55, 1.05, z, z + 26, 'granite', 'grey', 'small');
  drawRoof(ctx, { u0: 0.45, v0: 0.35, u1: 1.55, v1: 1.05, z: z + 26 }, 'crow_step', 'slate', stone, { axis: 'u' });
  box(ctx, 0.25, 0.3, 0.55, 0.6, z, z + 38, stone);
  battlements(ctx, 0.25, 0.3, 0.55, 0.6, z + 38, stone);
  // great hall along the ridge
  block(ctx, 1.6, 0.35, 2.6, 0.95, z, z + 18, 'sandstone', 'grey', 'arched', 0.3);
  drawRoof(ctx, { u0: 1.6, v0: 0.35, u1: 2.6, v1: 0.95, z: z + 18 }, 'gable', 'slate', 0xb0a796, { axis: 'u' });
  // long barracks block in front
  block(ctx, 0.4, 1.2, 1.9, 1.75, z, z + 15, 'granite', 'grey', 'small', 0.25);
  drawRoof(ctx, { u0: 0.4, v0: 1.2, u1: 1.9, v1: 1.75, z: z + 15 }, 'gable', 'slate', stone, { axis: 'u' });
  // curtain wall with battlements along the front edges
  const wallH = 12;
  paintWall(ctx, faceL(0.2, 2.1, 2.75), z - 2, z + wallH, 'granite', 'grey');
  paintWall(ctx, faceR(1.95, 2.75, 2.1), z - 2, z + wallH, 'granite', 'grey');
  battlements(ctx, 0.2, 2.6, 2.1, 2.75, z + wallH, stone);
  // the round Half Moon Battery facing the town
  const bat = cylinder(ctx, 2.35, 2.05, z - 4, z + 14, 0.42, stone);
  void bat;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.05 + (i * 0.9) / 6);
    const c = P(2.35, 2.05, z + 14);
    const rx = 0.42 * 45;
    const ry = 0.42 * 22.6;
    ctx.g.rect(c[0] + rx * Math.cos(a) - 1.5, c[1] + ry * Math.sin(a) - 3, 3, 3).fill(shade(stone, 0.95));
  }
  // gatehouse with turrets
  box(ctx, 0.9, 2.55, 1.35, 2.85, z - 2, z + 22, stone);
  drawTurret(ctx, 0.92, 2.83, z + 14, z + 24, 0.07, stone, ROOF_HEX.slate);
  drawTurret(ctx, 1.33, 2.83, z + 14, z + 24, 0.07, stone, ROOF_HEX.slate);
  const gate = faceL(0.9, 1.35, 2.85);
  quad(ctx, gate, 1.05, 1.2, z - 2, z + 6, 0x2a221a);
  ctx.flags.push({ at: P(0.4, 0.45, z + 41), color: 0x2f5fa7 });
}

function stirling(ctx: DrawCtx): void {
  const rock = 0x6a6358;
  rockBase(ctx, 0.15, 0.15, 2.85, 2.85, 10, rock);
  const z = 10;
  const stone = 0xa79f90;
  // royal palace (grey) at the back
  block(ctx, 0.4, 0.35, 1.4, 1.2, z, z + 22, 'sandstone', 'grey', 'sash');
  drawRoof(ctx, { u0: 0.4, v0: 0.35, u1: 1.4, v1: 1.2, z: z + 22 }, 'gable', 'slate', stone, { axis: 'v' });
  // the Great Hall in golden limewash, its signature colour
  const gold = 0xe0b54a;
  const L = faceL(1.45, 2.6, 1.3);
  const R = faceR(0.4, 1.3, 2.6);
  paintWall(ctx, L, z, z + 22, 'harl', 'honey');
  paintWall(ctx, R, z, z + 22, 'harl', 'honey');
  quad(ctx, L, L.a, L.b, z + 3, z + 22, gold, 0.55);
  quad(ctx, R, R.a, R.b, z + 3, z + 22, gold, 0.55);
  for (const t of [1.6, 1.85, 2.1, 2.35]) drawWindow(ctx, L, t, z + 9, 'arched');
  drawWindow(ctx, R, 0.65, z + 9, 'arched');
  drawWindow(ctx, R, 1.05, z + 9, 'arched');
  drawRoof(ctx, { u0: 1.45, v0: 0.4, u1: 2.6, v1: 1.3, z: z + 22 }, 'gable', 'slate', 0xd9b56e, { axis: 'u', pitch: 32 });
  drawTurret(ctx, 2.58, 1.28, z + 14, z + 28, 0.07, 0xd9b56e, ROOF_HEX.slate);
  // curtain wall and the Forework gatehouse with round towers
  paintWall(ctx, faceL(0.2, 2.75, 2.7), z - 2, z + 10, 'granite', 'grey');
  paintWall(ctx, faceR(1.6, 2.7, 2.75), z - 2, z + 10, 'granite', 'grey');
  battlements(ctx, 0.2, 2.55, 2.75, 2.7, z + 10, stone);
  for (const u of [0.8, 1.6]) {
    const tw = cylinder(ctx, u, 2.62, z - 2, z + 20, 0.17, stone);
    cone(ctx, tw.top, tw.rx + 1, tw.ry + 0.5, 14, ROOF_HEX.slate);
  }
  const gate = faceL(0.95, 1.45, 2.72);
  paintWall(ctx, gate, z - 2, z + 16, 'granite', 'grey');
  quad(ctx, gate, 1.12, 1.28, z - 2, z + 7, 0x2a221a);
  ctx.flags.push({ at: P(0.9, 0.8, z + 36), color: 0xd8b13a });
}

function scott(ctx: DrawCtx, pal: SeasonPalette): void {
  // garden: lawn, paths and a few shrubs
  poly(ctx, [P(0.05, 0.05), P(1.95, 0.05), P(1.95, 1.95), P(0.05, 1.95)], pal.snow ? 0xe9eef2 : shade(pal.grass[0]!, 1.05));
  poly(ctx, [P(0.9, 0.05), P(1.1, 0.05), P(1.1, 1.95), P(0.9, 1.95)], 0xd9c7a1);
  poly(ctx, [P(0.05, 0.9), P(1.95, 0.9), P(1.95, 1.1), P(0.05, 1.1)], 0xd9c7a1);
  const dark = 0x5d5448; // sandstone blackened by a century of smoke
  const c = 1;
  // stepped plinth
  box(ctx, c - 0.5, c - 0.5, c + 0.5, c + 0.5, 0, 3, shade(dark, 1.15));
  // four corner piers of the open base, each with a pinnacle
  for (const [u, v] of [
    [c - 0.42, c - 0.42],
    [c + 0.28, c - 0.42],
    [c - 0.42, c + 0.28],
    [c + 0.28, c + 0.28],
  ] as const) {
    box(ctx, u, v, u + 0.14, v + 0.14, 3, 38, dark);
    poly(ctx, [P(u, v + 0.14, 38), P(u + 0.14, v + 0.14, 38), P(u + 0.07, v + 0.07, 52)], shade(dark, 1.1));
  }
  // statue of the writer under the canopy (white marble)
  const st = P(c, c, 6);
  ctx.g.roundRect(st[0] - 3, st[1] - 14, 6, 11, 2).fill(0xf1eee6);
  ctx.g.circle(st[0], st[1] - 16, 2.4).fill(0xf1eee6);
  // canopy arches and the tapering spire in tiers
  let half = 0.42;
  let z = 38;
  for (let tier = 0; tier < 5; tier++) {
    const hgt = tier === 0 ? 8 : 12 - tier;
    box(ctx, c - half, c - half, c + half, c + half, z, z + hgt, shade(dark, 1 + tier * 0.03));
    const L = faceL(c - half, c + half, c + half);
    const R = faceR(c - half, c + half, c + half);
    if (ctx.detail >= 1)
      for (const f of [L, R]) {
        quad(ctx, f, c - half * 0.4, c + half * 0.4, z + 1.5, z + hgt - 1.5, 0x241f19);
        line(ctx, fp(f, c - half * 0.4, z + hgt - 1.5), fp(f, c, z + hgt + 1.5), shade(dark, 1.2), 0.8);
        line(ctx, fp(f, c + half * 0.4, z + hgt - 1.5), fp(f, c, z + hgt + 1.5), shade(dark, 1.2), 0.8);
      }
    for (const [u, v] of [
      [c - half, c + half],
      [c + half, c + half],
      [c + half, c - half],
    ] as const) {
      const p = P(u, v, z + hgt);
      poly(ctx, [[p[0] - 1.4, p[1]], [p[0] + 1.4, p[1]], [p[0], p[1] - 7]], shade(dark, 1.15));
    }
    z += hgt;
    half *= 0.78;
  }
  const apex = P(c, c, z + 26);
  poly(ctx, [P(c - half, c + half, z), P(c + half, c + half, z), apex], shade(dark, 1.08));
  poly(ctx, [P(c + half, c + half, z), P(c + half, c - half, z), apex], shade(dark, 0.85));
  line(ctx, apex, [apex[0], apex[1] - 4], 0x3a3a3a, 1);
  if (apex[1] - 4 < ctx.topY) ctx.topY = apex[1] - 4;
}

function sumela(ctx: DrawCtx, pal: SeasonPalette): void {
  // the sheer cliff the monastery is built into, rising behind it
  const rock = 0x7d776c;
  const cliff: Pt[] = [P(0, 0.2, 0), P(3, 0.2, 0)];
  for (let i = 0; i <= 8; i++) cliff.push(P(3 - (3 * i) / 8, 0.2, 70 + rnd(ctx.seed, i) * 22));
  poly(ctx, cliff, shade(rock, 0.95));
  if (ctx.detail >= 1)
    for (let i = 0; i < 9; i++) {
      const u = 0.2 + i * 0.33;
      line(ctx, P(u, 0.2, 10), P(u + 0.1, 0.2, 60 + rnd(ctx.seed, i + 40) * 20), shade(rock, 0.72), 1, 0.7);
    }
  // a cave mouth darkens the centre of the rock face
  ctx.g.ellipse(...P(1.6, 0.2, 58), 22, 12).fill({ color: 0x2b2722, alpha: 0.8 });
  // terraces with retaining walls
  for (let k = 0; k < 3; k++) {
    const v1 = 0.75 + k * 0.42;
    paintWall(ctx, faceL(0.15, 2.85, v1 + 0.4), k * 8, k * 8 + 8, 'granite', 'grey');
  }
  // the monastery: tall cream facades with rows of windows and red roofs, stacked up the rock
  const cream = 'cream';
  const levels: [number, number, number, number, number][] = [
    [0.4, 0.3, 1.5, 0.75, 52],
    [1.5, 0.3, 2.6, 0.7, 46],
    [0.7, 0.75, 2.2, 1.15, 34],
  ];
  for (const [u0, v0, u1, v1, h] of levels) {
    const zb = 12;
    block(ctx, u0, v0, u1, v1, zb, zb + h, 'plaster', cream, 'arched', 0.18);
    drawRoof(ctx, { u0, v0, u1, v1, z: zb + h }, 'hip', 'clay', 0xeee2c4, { axis: 'u', overhang: 0.05, pitch: 12 });
  }
  // aqueduct arches on the left, bringing water along the cliff
  for (let i = 0; i < 4; i++) {
    const u = 0.1 + i * 0.12;
    box(ctx, u, 1.6, u + 0.05, 1.7, 0, 24, STONE.granite);
  }
  box(ctx, 0.08, 1.58, 0.6, 1.72, 24, 28, STONE.granite);
  // forest at the foot
  for (const [u, v] of [
    [2.5, 1.7],
    [2.8, 1.5],
    [0.3, 1.85],
  ] as const) {
    const p = P(u, v);
    for (let i = 0; i < 3; i++) poly(ctx, [[p[0] - 7 + i, p[1] - i * 6], [p[0] + 7 - i, p[1] - i * 6], [p[0], p[1] - 12 - i * 6]], pal.snow ? 0xdfe8e4 : shade(pal.pine, 1 + i * 0.08));
  }
}

function galata(ctx: DrawCtx): void {
  const stone = 0xc2b39a;
  box(ctx, 0.35, 0.35, 1.65, 1.65, 0, 4, shade(stone, 0.95));
  const body = cylinder(ctx, 1, 1, 4, 74, 0.5, stone);
  // narrow windows spiralling up the shaft
  if (ctx.detail >= 1)
    for (let z = 14; z < 66; z += 12) {
      const c = P(1, 1, z);
      ctx.g.rect(c[0] - 8 + ((z / 12) % 2) * 6, c[1] - 6, 2.2, 5).fill(0x2f2a25);
    }
  // the gallery: arched openings and a balcony ring under the cone
  const g0 = P(1, 1, 74);
  ctx.g.ellipse(g0[0], g0[1] + 1, body.rx + 4, body.ry + 2).fill(shade(stone, 0.8));
  const gal = cylinder(ctx, 1, 1, 74, 86, 0.47, shade(stone, 1.05));
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.08 + (i * 0.84) / 6);
    const c = P(1, 1, 76);
    const x = c[0] + gal.rx * Math.cos(a);
    const y = c[1] + gal.ry * Math.sin(a);
    ctx.g.roundRect(x - 2, y - 8, 4, 8, 2).fill(0x2a2a30);
    ctx.lights.push([[x - 1.5, y - 7], [x + 1.5, y - 7], [x + 1.5, y - 1], [x - 1.5, y - 1]]);
  }
  ctx.g.ellipse(gal.top[0], gal.top[1], gal.rx + 3, gal.ry + 1.5).fill(shade(stone, 0.9));
  const apex = cone(ctx, gal.top, gal.rx + 3, gal.ry + 1.5, 42, 0x6c7b8a);
  line(ctx, apex, [apex[0], apex[1] - 6], 0xc9a23a, 1.2);
  ctx.g.circle(apex[0], apex[1] - 7, 1.2).fill(0xd9b84a);
  if (apex[1] - 8 < ctx.topY) ctx.topY = apex[1] - 8;
}

function minaret(ctx: DrawCtx, u: number, v: number, z0: number, h: number, stone: number): void {
  const shaft = cylinder(ctx, u, v, z0, z0 + h, 0.06, stone);
  for (const k of [0.55, 0.72, 0.88]) {
    const c = P(u, v, z0 + h * k);
    ctx.g.ellipse(c[0], c[1], shaft.rx + 2.2, shaft.ry + 1.1).fill(shade(stone, 0.85));
    line(ctx, [c[0] - shaft.rx - 2, c[1] - 1.5], [c[0] + shaft.rx + 2, c[1] - 1.5], shade(stone, 0.7), 0.6);
  }
  const apex = cone(ctx, shaft.top, shaft.rx + 0.6, shaft.ry + 0.3, 20, ROOF_HEX.lead);
  line(ctx, apex, [apex[0], apex[1] - 4], 0xc9a23a, 1);
  if (apex[1] - 5 < ctx.topY) ctx.topY = apex[1] - 5;
}

function selimiye(ctx: DrawCtx): void {
  const stone = 0xe6d5b0;
  // courtyard with arcade domes in front (low), prayer hall behind
  poly(ctx, [P(0.1, 2.4), P(3.9, 2.4), P(3.9, 3.9), P(0.1, 3.9)], 0xeadfc6);
  const arcade = faceL(0.15, 3.85, 3.85);
  paintWall(ctx, arcade, 0, 9, 'sandstone', 'cream');
  for (let i = 0; i < 9; i++) {
    const t = 0.35 + i * 0.4;
    quad(ctx, arcade, t - 0.1, t + 0.1, 0, 6, 0x5b4a36);
  }
  paintWall(ctx, faceR(2.4, 3.85, 3.85), 0, 9, 'sandstone', 'cream');
  const sad = P(2, 3.15, 0);
  ctx.g.ellipse(sad[0], sad[1], 12, 6).fill(shade(stone, 0.92));
  ctx.g.ellipse(sad[0], sad[1] - 4, 9, 4.5).fill(ROOF_HEX.lead);
  // the prayer hall: square base, buttress turrets, octagonal drum, semi-domes and the great dome
  minaret(ctx, 0.35, 0.35, 0, 120, stone);
  minaret(ctx, 3.65, 0.35, 0, 120, stone);
  const L = faceL(0.6, 3.4, 2.4);
  const R = faceR(0.6, 2.4, 3.4);
  paintWall(ctx, L, 0, 30, 'sandstone', 'cream');
  paintWall(ctx, R, 0, 30, 'sandstone', 'cream');
  for (const f of [L, R]) {
    const n = Math.round((f.b - f.a) / 0.32);
    for (let i = 0; i < n; i++) {
      const tc = f.a + ((i + 0.5) * (f.b - f.a)) / n;
      drawWindow(ctx, f, tc, 6, 'arched');
      drawWindow(ctx, f, tc, 19, 'arched');
    }
  }
  poly(ctx, [P(0.6, 0.6, 30), P(3.4, 0.6, 30), P(3.4, 2.4, 30), P(0.6, 2.4, 30)], ROOF_HEX.lead);
  for (const [u, v] of [
    [0.8, 0.8],
    [3.2, 0.8],
    [0.8, 2.2],
    [3.2, 2.2],
  ] as const) {
    const t = cylinder(ctx, u, v, 30, 42, 0.09, stone);
    cone(ctx, t.top, t.rx, t.ry, 8, ROOF_HEX.lead);
  }
  drawDome(ctx, 2, 2.15, 30, 0.42);
  drawDome(ctx, 3.0, 1.5, 30, 0.38);
  // octagonal drum carrying the great dome
  const drum = cylinder(ctx, 2, 1.5, 30, 46, 0.78, stone);
  if (ctx.detail >= 1)
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.06 + (i * 0.88) / 8);
      const x = drum.top[0] + drum.rx * Math.cos(a);
      const y = drum.top[1] + drum.ry * Math.sin(a) + 10;
      ctx.g.roundRect(x - 1.6, y - 7, 3.2, 7, 1.6).fill(0x3b5266);
      ctx.lights.push([[x - 1.2, y - 6], [x + 1.2, y - 6], [x + 1.2, y - 1], [x - 1.2, y - 1]]);
    }
  drawDome(ctx, 2, 1.5, 46, 0.74);
  minaret(ctx, 0.35, 2.65, 0, 120, stone);
  minaret(ctx, 3.65, 2.65, 0, 120, stone);
}

export function drawLandmark(ctx: DrawCtx, id: LandmarkId, pal: SeasonPalette): void {
  switch (id) {
    case 'edinburgh_castle':
      return edinburgh(ctx);
    case 'stirling_castle':
      return stirling(ctx);
    case 'scott_monument':
      return scott(ctx, pal);
    case 'sumela_monastery':
      return sumela(ctx, pal);
    case 'galata_tower':
      return galata(ctx);
    case 'selimiye_mosque':
      return selimiye(ctx);
  }
}
