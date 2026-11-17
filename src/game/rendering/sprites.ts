import type { Graphics } from 'pixi.js';
import type { RoadType, Tile } from '../core/types';
import { FOREST_TILE_MAX, HEIGHT_PX } from '../data/balance';
import { P, TH, TW, shade } from './iso';
import { mix } from './arch/kit';
import type { Pt } from './iso';
import { COLORS } from './palette';
import type { SeasonPalette } from './palette';

export { FOOTPRINT_PX_TOP, buildingArtSeed, drawStyledBuilding, drawStyledConstruction } from './arch/buildings';
export type { SpriteInfo, StyledRef } from './arch/buildings';

const HW = TW / 2;
const HH = TH / 2;
const BRIDGE_DECK_PX = 3;
const BRIDGE_RAIL_PX = 5.5;

/** Deterministic [0,1) hash from tile coordinates + salt. */
export function hash(x: number, y: number, s = 0): number {
  let n = Math.imul(x + 37, 374761393) + Math.imul(y + 17, 668265263) + Math.imul(s + 1, 1442695041);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function diamond(ox: number, oy: number): number[] {
  return [ox, oy, ox + HW, oy + HH, ox, oy + TH, ox - HW, oy + HH];
}

function tileColor(t: Tile, x: number, y: number, pal: SeasonPalette): number {
  const v = (hash(x, y, 1) - 0.5) * 0.08;
  switch (t.terrain) {
    case 'water':
      return shade(pal.water, 0.96 + v * 0.5);
    case 'lake':
      return shade(pal.lake, 0.96 + v * 0.5);
    case 'fertile':
      return shade(pal.fertile, 1 + v);
    case 'forest':
      return shade(pal.forestGround, 1 + v);
    case 'stone':
      return shade(pal.stoneGround, 1 + v);
    case 'mountain': {
      // Natural alpine elevation gradient: slate crags -> highgranite -> snow-dusted peak
      const elev = Math.min(1, Math.max(0, (t.height - 1) / 3.5));
      const base = mix(pal.mountain, 0xd8e0e8, elev * 0.52);
      return shade(base, 0.96 + v * 1.4);
    }
    case 'grass': {
      const base = pal.grass[(x * 3 + y * 5) % pal.grass.length]!;
      return shade(base, 1 + v);
    }
  }
}

/**
 * Draws one terrain tile at its elevated position, plus its front cliff skirts (along +x and +y)
 * where it drops to a lower neighbour or the map edge, plus a thin dark rim on any cliff top edge.
 */
export function drawGroundTile(
  g: Graphics,
  t: Tile,
  x: number,
  y: number,
  hX: number,
  hY: number,
  hNx: number,
  hNy: number,
  waterAdj: number,
  pal: SeasonPalette,
  detail: 0 | 1 | 2,
): void {
  const z = t.height * HEIGHT_PX;
  const [ox, oy] = P(x, y, z);

  // Sculpted natural cliff skirts with vertical rock striations instead of flat blocks
  const dropY = (t.height - hY) * HEIGHT_PX;
  if (dropY > 0) {
    const rocky = t.terrain === 'mountain' || t.terrain === 'stone';
    const col = rocky ? shade(pal.cliffL, 0.94) : pal.cliffL;
    g.poly([ox - HW, oy + HH, ox, oy + TH, ox, oy + TH + dropY, ox - HW, oy + HH + dropY]).fill(col);
    if (detail >= 1 && rocky && dropY >= HEIGHT_PX) {
      // Diagonal rock ridge striations rather than horizontal layer bands
      g.moveTo(ox - HW * 0.65, oy + HH * 1.35)
        .lineTo(ox - HW * 0.45, oy + HH * 1.55 + dropY * 0.85)
        .stroke({ color: shade(col, 0.72), width: 1.3, alpha: 0.65 });
      g.moveTo(ox - HW * 0.25, oy + HH * 1.75)
        .lineTo(ox - HW * 0.15, oy + HH * 1.85 + dropY * 0.8)
        .stroke({ color: shade(col, 1.16), width: 1.1, alpha: 0.55 });
    }
  }
  const dropX = (t.height - hX) * HEIGHT_PX;
  if (dropX > 0) {
    const rocky = t.terrain === 'mountain' || t.terrain === 'stone';
    const col = rocky ? shade(pal.cliffR, 0.92) : pal.cliffR;
    g.poly([ox, oy + TH, ox + HW, oy + HH, ox + HW, oy + HH + dropX, ox, oy + TH + dropX]).fill(col);
    if (detail >= 1 && rocky && dropX >= HEIGHT_PX) {
      g.moveTo(ox + HW * 0.35, oy + HH * 1.65)
        .lineTo(ox + HW * 0.22, oy + HH * 1.78 + dropX * 0.85)
        .stroke({ color: shade(col, 0.7), width: 1.3, alpha: 0.65 });
      g.moveTo(ox + HW * 0.7, oy + HH * 1.3)
        .lineTo(ox + HW * 0.58, oy + HH * 1.42 + dropX * 0.8)
        .stroke({ color: shade(col, 1.14), width: 1.1, alpha: 0.5 });
    }
  }

  g.poly(diamond(ox, oy)).fill(tileColor(t, x, y, pal));

  if (t.terrain === 'water' || t.terrain === 'lake') {
    const deep = t.terrain === 'lake' ? pal.lakeDeep : pal.waterDeep;
    g.poly([ox, oy + 4, ox + HW - 8, oy + HH, ox, oy + TH - 4, ox - HW + 8, oy + HH]).fill({
      color: deep,
      alpha: 0.35,
    });
    // shoreline foam along edges that meet land
    const foam = pal.snow ? 0xdbe9f0 : COLORS.waterFoam;
    if (waterAdj & 1) g.moveTo(ox, oy + 1).lineTo(ox + HW - 1, oy + HH).stroke({ color: foam, width: 2, alpha: 0.7 });
    if (waterAdj & 2) g.moveTo(ox + HW - 1, oy + HH).lineTo(ox, oy + TH - 1).stroke({ color: foam, width: 2, alpha: 0.55 });
    if (waterAdj & 4) g.moveTo(ox, oy + TH - 1).lineTo(ox - HW + 1, oy + HH).stroke({ color: foam, width: 2, alpha: 0.55 });
    if (waterAdj & 8) g.moveTo(ox - HW + 1, oy + HH).lineTo(ox, oy + 1).stroke({ color: foam, width: 2, alpha: 0.7 });
    return;
  }

  // Sculpted 3D mountain peak relief on mountain tiles (replaces flat terraced look)
  if (t.terrain === 'mountain' && !t.road && !t.buildingId) {
    const peakH = 14 + Math.min(3, t.height) * 6 + hash(x, y, 19) * 8;
    const px = ox + (hash(x, y, 23) - 0.5) * 10;
    const py = oy + HH - peakH;
    const snowCap = pal.snow || t.height >= 3;
    const rockBase = tileColor(t, x, y, pal);
    // Left sunlit facet, right shadowed facet, rear ridge facet
    g.poly([px, py, ox - HW + 4, oy + HH + 2, ox, oy + TH - 2]).fill(shade(rockBase, 1.12));
    g.poly([px, py, ox, oy + TH - 2, ox + HW - 4, oy + HH + 2]).fill(shade(rockBase, 0.76));
    g.poly([px, py, ox, oy + 2, ox - HW + 4, oy + HH + 2]).fill(shade(rockBase, 1.02));
    g.poly([px, py, ox + HW - 4, oy + HH + 2, ox, oy + 2]).fill(shade(rockBase, 0.84));
    if (snowCap) {
      const sy = py + peakH * 0.42;
      g.poly([px, py, ox - 11, sy + 2, ox, sy + 6, ox + 11, sy + 2]).fill({ color: 0xf4f8fb, alpha: 0.92 });
    }
    if (detail >= 1) {
      g.moveTo(px, py).lineTo(ox, oy + TH - 2).stroke({ color: shade(rockBase, 0.62), width: 1.1, alpha: 0.6 });
    }
  }

  // Soft slope shading instead of hard black terraced outlines on natural mountains
  const rim = t.terrain === 'mountain' ? shade(pal.mountain, 0.72) : shade(pal.cliffR, 0.75);
  const rimAlpha = t.terrain === 'mountain' ? 0.24 : 0.55;
  if (t.height > hNx) g.moveTo(ox, oy).lineTo(ox + HW, oy + HH).stroke({ color: rim, width: 1.2, alpha: rimAlpha });
  if (t.height > hNy) g.moveTo(ox - HW, oy + HH).lineTo(ox, oy + TH).stroke({ color: rim, width: 1.2, alpha: rimAlpha });
  if (t.height > hX) g.moveTo(ox, oy + TH).lineTo(ox + HW, oy + HH).stroke({ color: rim, width: 1.2, alpha: rimAlpha });
  if (t.height > hY) g.moveTo(ox - HW, oy + HH).lineTo(ox, oy + TH).stroke({ color: rim, width: 1.2, alpha: rimAlpha });

  if (detail === 0 || t.road || t.buildingId) return;

  // deterministic surface detail: grass tufts, flowers, pebbles, fertile furrows
  if (t.terrain === 'fertile') {
    for (let i = -2; i <= 2; i++) {
      const d = i * 5;
      g.moveTo(ox - 14 + d, oy + HH - 4 + d * 0.5)
        .lineTo(ox + 6 + d, oy + HH + 6 + d * 0.5)
        .stroke({ color: pal.furrow, width: 1.3, alpha: 0.5 });
    }
  } else if (t.terrain === 'grass') {
    const n = detail === 2 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const u = hash(x, y, 10 + i) * 0.7 + 0.15;
      const v = hash(x, y, 20 + i) * 0.7 + 0.15;
      const [px, py] = P(x + u, y + v, z);
      g.moveTo(px - 1.5, py).lineTo(px - 2.5, py - 3.5).moveTo(px + 1, py).lineTo(px + 2, py - 3).stroke({
        color: shade(pal.grass[0]!, 0.78),
        width: 1.1,
      });
      if (!pal.snow && detail === 2 && hash(x, y, 30 + i) < 0.22) {
        const fc = pal.flower[(x + y + i) % pal.flower.length]!;
        g.circle(px, py - 2, 1.3).fill(fc);
      }
    }
  } else if (t.terrain === 'stone' || t.terrain === 'mountain') {
    for (let i = 0; i < 2; i++) {
      const u = hash(x, y, 40 + i) * 0.6 + 0.2;
      const v = hash(x, y, 50 + i) * 0.6 + 0.2;
      const [px, py] = P(x + u, y + v, z);
      g.ellipse(px, py, 2.5, 1.4).fill(shade(pal.stoneGround, 0.82));
    }
  }
}

export function drawWaterSparkles(g: Graphics, tiles: [number, number, number][], time: number, snow: boolean): void {
  g.clear();
  if (snow) return;
  const phase = time * 0.0022;
  for (let i = 0; i < tiles.length; i++) {
    const [x, y, h] = tiles[i]!;
    const z = h * HEIGHT_PX;
    const [ox, oy] = P(x, y, z);
    const w = Math.sin(phase + i * 0.9) * 3;
    const a = 0.22 + 0.18 * Math.sin(phase * 1.3 + i * 1.7);
    g.moveTo(ox - 9 + w, oy + HH - 2)
      .lineTo(ox + 2 + w, oy + HH - 2)
      .stroke({ color: COLORS.waterFoam, width: 1.3, alpha: a });
    g.moveTo(ox - 2 - w, oy + HH + 4)
      .lineTo(ox + 8 - w, oy + HH + 4)
      .stroke({ color: COLORS.waterFoam, width: 1.1, alpha: a * 0.8 });
  }
}

/** Draws a single tree centered at (0,0) in local graphics coordinates. */
export function drawSingleTree(g: Graphics, s: number, pine: boolean, variant: number, pal: SeasonPalette): void {
  g.ellipse(0, 1, 7 * s, 3.2 * s).fill({ color: COLORS.shadow, alpha: 0.24 });
  g.rect(-1.6 * s, -9 * s, 3.2 * s, 9 * s).fill(COLORS.trunk);
  if (pine) {
    const c = pal.pine;
    for (let k = 0; k < 3; k++) {
      const w = (10 - k * 2.3) * s;
      const top = (-24 - k * 5) * s;
      const bot = (-8 - k * 5) * s;
      g.poly([0, top, w, bot, -w, bot]).fill(shade(c, 0.9 + k * 0.07));
      if (pal.snow) {
        g.poly([0, top, w * 0.65, (top + bot) * 0.5, -w * 0.65, (top + bot) * 0.5]).fill({
          color: 0xf4f7fa,
          alpha: 0.85,
        });
      }
    }
  } else {
    const base = pal.leaf[variant % pal.leaf.length]!;
    g.circle(-3.5 * s, -14 * s, 6 * s).fill(shade(base, 0.85));
    g.circle(3.5 * s, -13 * s, 5.5 * s).fill(shade(base, 0.95));
    g.circle(0, -18 * s, 6.5 * s).fill(base);
    g.circle(-1.5 * s, -20 * s, 4 * s).fill(shade(base, 1.1));
    if (pal.snow) {
      g.ellipse(0, -21 * s, 5.5 * s, 2.8 * s).fill({ color: 0xf4f7fa, alpha: 0.9 });
    }
  }
}

export function drawTree(g: Graphics, deposit: number, variant: number, pal: SeasonPalette): void {
  const ratio = Math.max(0.25, deposit / FOREST_TILE_MAX);
  const count = ratio > 0.7 ? 3 : ratio > 0.35 ? 2 : 1;
  const spots: [number, number, number][] = [
    [-6, 13, 0.85],
    [7, 17, 0.95],
    [-1, 21, 1.0],
  ];
  for (let i = 0; i < count; i++) {
    const [dx, dy, sc] = spots[i]!;
    const s = sc * (0.75 + 0.25 * ratio);
    const sub = new Graphics();
    drawSingleTree(sub, s, (variant + i) % 3 === 0, variant + i, pal);
    sub.position.set(dx, dy);
    g.addChild(sub);
  }
}

/** Stump left when a forest tile is fully felled. */
export function drawStump(g: Graphics): void {
  for (const [dx, dy] of [
    [-5, 15],
    [6, 19],
  ] as const) {
    g.ellipse(dx, dy + 1, 3.8, 1.8).fill({ color: COLORS.shadow, alpha: 0.22 });
    g.rect(dx - 2.5, dy - 3, 5, 3.5).fill(COLORS.trunk);
    g.ellipse(dx, dy - 3, 2.6, 1.3).fill(0xc9a574);
  }
}

export function drawRocks(g: Graphics, deposit: number, snow: boolean): void {
  const s = 0.65 + 0.35 * Math.min(1, deposit / 200);
  g.ellipse(0, 20, 15 * s, 6 * s).fill({ color: COLORS.shadow, alpha: 0.24 });
  g.poly([-12 * s, 20, -9 * s, 9 * s, 1 * s, 7 * s, 6 * s, 18]).fill(COLORS.rockDark);
  g.poly([-9 * s, 9 * s, 1 * s, 7 * s, -2 * s, 16]).fill(COLORS.rockLight);
  g.poly([1 * s, 21, 4 * s, 12 * s, 12 * s, 13 * s, 14 * s, 21]).fill(COLORS.rock);
  if (snow) {
    g.poly([-9 * s, 9 * s, 1 * s, 7 * s, -2 * s, 11 * s]).fill({ color: 0xf4f7fa, alpha: 0.85 });
  }
}

/** Animated flag: redraw with a time phase to make it wave. */
export function drawFlag(g: Graphics, phase: number, color: number = COLORS.flag): void {
  g.clear();
  const w1 = Math.sin(phase) * 2;
  const w2 = Math.cos(phase + 1.1) * 2.2;
  g.poly([0, 0, 7, 1 + w1 * 0.4, 13, -0.5 + w2, 11, 3 + w2 * 0.5, 13, 6 + w2, 7, 5 + w1 * 0.4, 0, 6]).fill(color);
  g.circle(0, -1, 1.3).fill(0xe8c252);
}

/** Road tile: connections bitmask 1=x-1, 2=x+1, 4=y-1, 8=y+1; bridge over water; stairs/mountain/tunnel variants. */
export function drawRoad(
  g: Graphics,
  ox: number,
  oy: number,
  mask: number,
  bridge: boolean,
  pal: SeasonPalette,
  roadType: RoadType = 'dirt',
  paved = false,
  waterMask = 0,
  detail: 0 | 1 | 2 = 2,
): void {
  const c: Pt = [ox, oy + HH];
  const mids: [number, Pt][] = [
    [1, [ox - HW / 2, oy + HH / 2]],
    [2, [ox + HW / 2, oy + HH + HH / 2]],
    [4, [ox + HW / 2, oy + HH / 2]],
    [8, [ox - HW / 2, oy + HH + HH / 2]],
  ];
  const type: RoadType = bridge ? 'bridge' : roadType;
  if (type === 'bridge') {
    const alongU = ((mask & 3) !== 0 && (mask & 12) === 0) || (!(mask & 15) && (waterMask & 12) !== 0 && (waterMask & 3) === 0);
    const point = (u: number, v: number, z = 0): Pt => [ox + (u - v) * HW, oy + (u + v) * HH - z];
    const poly = (pts: Pt[], color: number, alpha = 1): void => {
      g.poly(pts.flat()).fill({ color, alpha });
    };
    const line = (a: Pt, b: Pt, color: number, width = 1.4, alpha = 1): void => {
      g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ color, width, alpha });
    };
    const landStart = (waterMask & (alongU ? 1 : 4)) === 0;
    const landEnd = (waterMask & (alongU ? 2 : 8)) === 0;
    const lift = (t: number): number => {
      const ramp = 0.24;
      if (landStart && t < ramp) return (t / ramp) * BRIDGE_DECK_PX;
      if (landEnd && t > 1 - ramp) return ((1 - t) / ramp) * BRIDGE_DECK_PX;
      return BRIDGE_DECK_PX;
    };
    const deck = pal.snow ? 0xd9dfe5 : 0x7b838d;
    const curb = 0xcfd6dd;
    const beam = 0x555e68;
    const us = [0, 0.24, 0.5, 0.76, 1];
    const [v0, v1] = [0.22, 0.78];
    const [c0, c1] = [0.16, 0.84];

    // Bridge shadow on the water and piers on water-facing ends.
    poly(
      alongU
        ? [point(0.05, c0, -1), point(0.95, c0, -1), point(0.95, c1, -1), point(0.05, c1, -1)]
        : [point(c0, 0.05, -1), point(c1, 0.05, -1), point(c1, 0.95, -1), point(c0, 0.95, -1)],
      0x102536,
      0.24,
    );
    for (const u of [0.22, 0.78]) {
      const [px, py] = alongU ? point(u, 0.5, 0) : point(0.5, u, 0);
      g.roundRect(px - 3, py - 2, 6, 7, 1).fill(0x69727c);
      g.ellipse(px, py + 5, 5, 1.8).fill({ color: COLORS.waterFoam, alpha: 0.45 });
    }

    for (let i = 1; i < us.length; i++) {
      const a = us[i - 1]!, b = us[i]!;
      const za = lift(a), zb = lift(b);
      if (alongU) {
        poly([point(a, c1, za), point(b, c1, zb), point(b, c1, 0), point(a, c1, 0)], beam);
        poly([point(a, c0, za), point(b, c0, zb), point(b, c1, zb), point(a, c1, za)], curb);
        poly([point(a, v0, za + 0.4), point(b, v0, zb + 0.4), point(b, v1, zb + 0.4), point(a, v1, za + 0.4)], deck);
      } else {
        poly([point(c1, a, za), point(c1, b, zb), point(c1, b, 0), point(c1, a, 0)], beam);
        poly([point(c0, a, za), point(c1, a, za), point(c1, b, zb), point(c0, b, zb)], curb);
        poly([point(v0, a, za + 0.4), point(v1, a, za + 0.4), point(v1, b, zb + 0.4), point(v0, b, zb + 0.4)], deck);
      }
    }

    for (const u0 of [0.12, 0.44, 0.74]) {
      const a = alongU ? point(u0, 0.5, lift(u0) + 0.6) : point(0.5, u0, lift(u0) + 0.6);
      const b = alongU ? point(u0 + 0.14, 0.5, lift(u0 + 0.14) + 0.6) : point(0.5, u0 + 0.14, lift(u0 + 0.14) + 0.6);
      line(a, b, 0xf0db86, 1.3, 0.85);
    }

    for (const edge of [c0, c1]) {
      for (let i = 1; i < us.length; i++) {
        const a = us[i - 1]!, b = us[i]!;
        const pa = alongU ? point(a, edge, lift(a) + BRIDGE_RAIL_PX) : point(edge, a, lift(a) + BRIDGE_RAIL_PX);
        const pb = alongU ? point(b, edge, lift(b) + BRIDGE_RAIL_PX) : point(edge, b, lift(b) + BRIDGE_RAIL_PX);
        line(pa, pb, 0xd8dee4, 1.8);
      }
      for (const u of detail >= 1 ? [0.06, 0.34, 0.66, 0.94] : [0.06, 0.94]) {
        const z = lift(u);
        const base = alongU ? point(u, edge, z) : point(edge, u, z);
        const top = alongU ? point(u, edge, z + BRIDGE_RAIL_PX + 0.8) : point(edge, u, z + BRIDGE_RAIL_PX + 0.8);
        line(base, top, 0x59626c, 1.7);
      }
    }
    return;
  }
  const color =
    type === 'stairs'
      ? 0xc2bcae
      : type === 'mountain'
        ? 0xb3ad9f
        : type === 'tunnel'
          ? 0x6a655c
          : paved
            ? pal.snow
              ? 0xcad0d6
              : 0x5c6168
            : pal.snow
              ? 0xd8c9a8
              : COLORS.road;
  const edge =
    type === 'stairs' || type === 'mountain'
      ? 0x7a756a
      : type === 'tunnel'
        ? 0x3f3c36
        : paved
          ? 0x3b4047
          : COLORS.roadEdge;
  const w = type === 'mountain' ? 8 : paved ? 16 : 12;

  for (const [bit, p] of mids) {
    if (mask & bit) g.moveTo(c[0], c[1]).lineTo(p[0], p[1]).stroke({ color: edge, width: w + 3, cap: 'round' });
  }
  g.circle(c[0], c[1], w * 0.55 + 1.5).fill(edge);
  for (const [bit, p] of mids) {
    if (mask & bit) g.moveTo(c[0], c[1]).lineTo(p[0], p[1]).stroke({ color, width: w, cap: 'round' });
  }
  g.circle(c[0], c[1], w * 0.55).fill(color);

  if (type === 'stairs') {
    // stone steps across the slope
    for (let s = -9; s <= 9; s += 3.5) {
      g.moveTo(c[0] - 6 + s * 0.6, c[1] + s * 0.5 - 2)
        .lineTo(c[0] + 6 + s * 0.6, c[1] + s * 0.5 + 2)
        .stroke({ color: 0x8a8478, width: 1.3 });
    }
  } else if (type === 'tunnel') {
    // arched stone tunnel mouths facing the mountain
    g.circle(c[0], c[1], 7).fill(0x1f1d1a);
    g.circle(c[0], c[1], 7).stroke({ color: 0x9a9488, width: 2.2 });
  } else if (paved && type === 'dirt') {
    // Sidewalk curbstones and dashed center line for modern city streets
    for (const [bit, p] of mids) {
      if (mask & bit) {
        g.moveTo(c[0], c[1])
          .lineTo((c[0] + p[0]) * 0.5, (c[1] + p[1]) * 0.5)
          .stroke({ color: 0xe6d9a2, width: 1.2, alpha: 0.75 });
      }
    }
    if (!mask) g.circle(c[0], c[1], 1.4).fill(0xe6d9a2);
  }
}

export function drawBridgeSpan(
  g: Graphics,
  p: { width: number; height: number; tiles: Tile[] },
  x: number,
  y: number,
  alongX: boolean,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  spanLen: number,
  spanIndex: number,
  pal: SeasonPalette,
  detail: 0 | 1 | 2,
): void {
  const t = p.tiles[y * p.width + x]!;
  const z = t.height * HEIGHT_PX;
  const [ox, oy] = P(x, y, z);
  const d = diamond(ox, oy);
  const type = t.roadType;
  if (type === 'bridge') {
    const point = (g: Graphics, u: number, v: number, zLift = 0): Pt =>
      alongX ? [ox + (u - v) * HW, oy + (u + v) * HH - zLift] : [ox + (v - u) * HW, oy + (u + v) * HH - zLift];
    const poly = (g: Graphics, pts: Pt[], color: number, alpha = 1): void => {
      g.poly(pts.flat()).fill({ color, alpha });
    };
    const line = (g: Graphics, a: Pt, b: Pt, color: number, width = 1.4, alpha = 1): void => {
      g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ color, width, alpha });
    };
    void startX;
    void startY;
    void endX;
    void endY;
    const lift = (u: number): number => {
      const globalU = (spanIndex + u) / Math.max(1, spanLen);
      const arch = Math.sin(globalU * Math.PI) * 5;
      return BRIDGE_DECK_PX + arch;
    };
    const deck = pal.snow ? 0xd9dfe5 : 0x777f88;
    const curb = 0xd2d8de;
    const beam = 0x525a63;
    const us = [0, 0.25, 0.5, 0.75, 1];
    const [v0, v1] = [0.22, 0.78];
    const [c0, c1] = [0.16, 0.84];
    const frontV = alongX ? c1 : c0;
    const back = alongX ? c0 : c1;

    poly(g, [point(g, 0.04, c0, -1), point(g, 0.96, c0, -1), point(g, 0.96, c1, -1), point(g, 0.04, c1, -1)], 0x102536, 0.22);

    if (spanLen <= 2 || spanIndex === 0 || spanIndex === spanLen - 1 || spanIndex % 2 === 1) {
      const [px, py] = point(g, 0.5, 0.5, 0);
      g.roundRect(px - 3.5, py - 2, 7, 8, 1.2).fill(0x67707a);
      g.ellipse(px, py + 6, 5.5, 2).fill({ color: COLORS.waterFoam, alpha: 0.45 });
    }

    for (let i = 1; i < us.length; i++) {
      const a = us[i - 1]!, b = us[i]!;
      const za = lift(a), zb = lift(b);
      poly(g, [point(g, a, frontV, za), point(g, b, frontV, zb), point(g, b, frontV, 0), point(g, a, frontV, 0)], beam);
      poly(g, [point(g, a, c0, za), point(g, b, c0, zb), point(g, b, c1, zb), point(g, a, c1, za)], curb);
      poly(g, [point(g, a, v0, za + 0.4), point(g, b, v0, zb + 0.4), point(g, b, v1, zb + 0.4), point(g, a, v1, za + 0.4)], deck);
    }

    for (const u0 of [0.12, 0.44, 0.74]) {
      line(g, point(g, u0, 0.5, lift(u0)), point(g, u0 + 0.14, 0.5, lift(u0 + 0.14)), 0xf0db86, 1.2, 0.85);
    }
    for (const edge of [back, frontV]) {
      for (let i = 1; i < us.length; i++) {
        const a = us[i - 1]!, b = us[i]!;
        line(g, point(g, a, edge, lift(a) + BRIDGE_RAIL_PX), point(g, b, edge, lift(b) + BRIDGE_RAIL_PX), 0xb7a17e, 2);
      }
      for (const u of detail >= 1 ? [0.04, 0.34, 0.66, 0.96] : [0.04, 0.96]) {
        line(g, point(g, u, edge, lift(u)), point(g, u, edge, lift(u) + BRIDGE_RAIL_PX + 1), 0xe0ceb1, 1.8);
      }
    }
    return;
  }
  const fill =
    type === 'stairs' ? 0xc2bcae : type === 'mountain' ? 0xb3ad9f : type === 'tunnel' ? 0x6a655c : pal.snow ? 0xd8c9a8 : COLORS.road;
  g.poly(d).fill(fill);
  if (type === 'stairs') {
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      g.moveTo(ox - 28 + 28 * t, oy + 16 - 14 * t).lineTo(ox + 28 * t, oy + 30 - 14 * t).stroke({ color: 0x8f897d, width: 1.2 });
    }
  } else if (type === 'mountain') {
    for (const [dx, dy] of [[-12, 15], [10, 19], [2, 9], [-4, 23]] as const) g.circle(ox + dx, oy + dy, 1.6).fill(0x8a8579);
  } else if (type === 'tunnel') {
    // portal arch in the rock
    g.poly([ox - 12, oy + 22, ox - 12, oy + 12, ox - 6, oy + 6, ox + 2, oy + 6, ox + 6, oy + 12, ox + 6, oy + 22]).fill(0x2a2622);
    g.moveTo(ox - 14, oy + 22).lineTo(ox - 14, oy + 11).lineTo(ox - 7, oy + 4).lineTo(ox + 3, oy + 4).lineTo(ox + 8, oy + 11).lineTo(ox + 8, oy + 22).stroke({ color: 0xb9b2a4, width: 2 });
  } else {
    g.circle(ox - 8, oy + 15, 1.5).fill(COLORS.roadEdge);
    g.circle(ox + 9, oy + 18, 1.5).fill(COLORS.roadEdge);
    g.circle(ox + 1, oy + 11, 1.2).fill(COLORS.roadEdge);
  }
}

/** Tiny pseudo-3D citizen with arms, legs, face and side-lit clothing. */
export function drawVillager(g: Graphics, color: number, variant = 0): void {
  const skin = [0xeab995, 0xc78a63, 0xf1ccac, 0x9b654a][Math.abs(variant) % 4]!;
  const hair = [0x372a24, 0x765238, 0xc49a54, 0x252a30][Math.abs(variant + 1) % 4]!;
  const sway = (variant % 3) - 1;
  g.ellipse(0.5, 0, 4.6, 2.1).fill({ color: COLORS.shadow, alpha: 0.24 });
  // Legs and projecting shoes give the figure actual depth cues.
  g.roundRect(-2.6, -4.2, 2, 4, 0.55).fill(0x444c57);
  g.roundRect(0.7, -4.2, 2, 4, 0.55).fill(0x323944);
  g.ellipse(-1.5, -0.5, 1.4, 0.8).fill(0x302b29);
  g.ellipse(2, -0.5, 1.4, 0.8).fill(0x302b29);
  // Coat with separate lit front and darker side panel.
  g.roundRect(-3.5, -10.4, 7, 7.5, 1.6).fill({ color });
  g.poly([0.4, -10.4, 3.5, -9.4, 3.5, -3.1, 0.4, -3.1]).fill({ color: 0x222f38, alpha: 0.2 });
  g.moveTo(-3, -9.5).lineTo(-4.1, -5.5 + sway).stroke({ color: skin, width: 1.8, cap: 'round' });
  g.moveTo(3, -9.5).lineTo(4.1, -5.5 - sway).stroke({ color: skin, width: 1.8, cap: 'round' });
  g.ellipse(0, -12.3, 3, 3.6).fill({ color: skin });
  g.ellipse(-0.7, -14, 2.7, 1.4).fill({ color: hair });
  g.circle(1, -12.4, 0.35).fill(0x403229);
  g.circle(-1, -12.4, 0.35).fill(0x403229);
  g.moveTo(-0.6, -11.2).lineTo(0.6, -11.2).stroke({ color: 0x864f44, width: 0.45 });
}

export function drawCart(g: Graphics, load: number): void {
  g.ellipse(0, 0, 8, 3).fill({ color: COLORS.shadow, alpha: 0.25 });
  g.roundRect(-7, -9, 14, 6, 1.5).fill(COLORS.wood);
  g.roundRect(-5, -12, 10, 4, 1.5).fill(load);
  g.circle(-4, -2, 2.6).fill(0x3a2a1c);
  g.circle(4, -2, 2.6).fill(0x3a2a1c);
}

/**
 * Detailed Damen Shipyards Antalya vessels for the lake and sea with layered V-wake foam:
 * - `fishing`: Damen 1906 SAR Search & Rescue / Patrol Vessel (high-visibility safety orange & navy hull, glazed wheelhouse, radar mast)
 * - `cargo`: Damen FCS 5009 Fast Crew & Cargo Supplier (Sea Axe bow, forward high-visibility bridge, aft cargo containers & crane)
 * - `yacht`: Damen SeaXplorer 58 Luxury Expedition Superyacht (ice-class navy/white hull, multi-deck glass lounges, radar arch & aft helipad)
 */
export function drawBoat(g: Graphics, kind: 'fishing' | 'cargo' | 'yacht'): void {
  // Layered V-shaped water wake & stern propeller foam trailing behind the vessel
  g.moveTo(-7, -0.5).lineTo(-23, -5.2).stroke({ color: 0xe0f2fe, width: 2.1, alpha: 0.65, cap: 'round' });
  g.moveTo(-7, 1.2).lineTo(-22, 5.8).stroke({ color: 0xe0f2fe, width: 2.1, alpha: 0.65, cap: 'round' });
  g.moveTo(-10, 0).lineTo(-19, -2.4).stroke({ color: 0xffffff, width: 1.3, alpha: 0.75, cap: 'round' });
  g.moveTo(-10, 0.8).lineTo(-18, 3.1).stroke({ color: 0xffffff, width: 1.3, alpha: 0.75, cap: 'round' });
  g.ellipse(-13, 0.5, 7, 2.2).fill({ color: 0xbae6fd, alpha: 0.42 });
  g.ellipse(0, 1.4, 12, 3.8).fill({ color: 0x0f172a, alpha: 0.28 });

  if (kind === 'yacht') {
    // Damen SeaXplorer 58 Luxury Expedition Superyacht
    // Sleek ice-class navy & pearl-white hull with plumb Sea Axe bow
    g.poly([-13, -2.2, 14.5, -2.6, 12, 2.6, -11, 2.6]).fill(0x0f172a);
    g.poly([-12.5, -2.4, 14, -2.8, 12.8, -0.2, -11.5, -0.2]).fill(0xf8fafc);
    // Teak aft helipad deck + turquoise helipad circle
    g.poly([-12.5, -2.4, -3.5, -2.4, -4, -0.6, -12, -0.6]).fill(0xd97706);
    g.ellipse(-8.2, -1.6, 3.2, 1.1).fill(0x0284c7).stroke({ color: 0xfacc15, width: 0.7 });
    // Multi-tier superyacht superstructure & panoramic tinted glass decks
    g.roundRect(-4.5, -6.4, 13.5, 4.2, 1.4).fill(0xf8fafc);
    g.rect(-3.2, -5.6, 10.8, 1.5).fill(0x0f172a);
    g.roundRect(-2.2, -9.4, 9.2, 3.2, 1.2).fill(0xf1f5f9);
    g.rect(-1.0, -8.6, 6.8, 1.4).fill(0x0284c7);
    // Satellite radome & radar mast
    g.moveTo(1.8, -9.4).lineTo(0.8, -15.5).stroke({ color: 0xcbd5e1, width: 1.4 });
    g.circle(0.8, -16, 1.6).fill(0xffffff);
    g.circle(4.2, -10.4, 1.2).fill(0xf8fafc);
    return;
  }

  if (kind === 'cargo') {
    // Damen FCS 5009 / Container Freighter with Sea Axe bow
    g.poly([-13.5, -3.2, 14.5, -3.4, 11.5, 2.8, -11.5, 2.8]).fill(0x991b1b);
    g.poly([-13, 0.4, 12.5, 0.4, 11.5, 2.8, -11.5, 2.8]).fill(0x450a0a);
    // White waterline stripe
    g.moveTo(-12, 0.2).lineTo(12.2, 0.2).stroke({ color: 0xf8fafc, width: 0.9 });
    // Aft intermodal cargo containers (orange, blue, emerald, gold)
    g.rect(-11.5, -7.6, 5.2, 4.4).fill(0xea580c).stroke({ color: 0x9a3412, width: 0.6 });
    g.rect(-5.8, -7.6, 5.2, 4.4).fill(0x0284c7).stroke({ color: 0x075985, width: 0.6 });
    g.rect(-5.8, -11.2, 5.2, 3.6).fill(0xfacc15).stroke({ color: 0xca8a04, width: 0.6 });
    g.rect(-0.1, -7.6, 4.6, 4.4).fill(0x16a34a).stroke({ color: 0x166534, width: 0.6 });
    // Forward Damen Sea Axe high-visibility bridge superstructure
    g.poly([4.8, -3.2, 11.8, -3.2, 10.4, -10.8, 5.2, -10.8]).fill(0xf8fafc);
    g.rect(5.8, -9.8, 5.0, 2.0).fill(0x0f172a);
    // Radar mast & navigation lights
    g.moveTo(7.8, -10.8).lineTo(7.8, -15.5).stroke({ color: 0x94a3b8, width: 1.2 });
    g.circle(7.8, -15.8, 1.1).fill(0xfacc15);
    return;
  }

  // Damen 1906 SAR (Search & Rescue) / High-Speed Coastal Vessel
  g.poly([-9.5, -2.2, 11, -2.5, 8.5, 2.3, -8, 2.3]).fill(0x1e3a8a);
  // High-visibility safety orange upper hull & fender collar
  g.poly([-9, -2.4, 10.6, -2.7, 9.6, -0.4, -8.5, -0.4]).fill(0xea580c);
  // White aluminum/composite wheelhouse with forward-raked SAR windows
  g.poly([-3.8, -2.4, 4.8, -2.4, 3.6, -6.8, -3.2, -6.8]).fill(0xf8fafc);
  g.poly([-2.4, -3.6, 3.8, -3.6, 3.1, -5.8, -2.0, -5.8]).fill(0x0284c7);
  // SAR radar arch & orange beacon light
  g.moveTo(-0.5, -6.8).lineTo(-1.2, -11.5).stroke({ color: 0xcbd5e1, width: 1.2 });
  g.circle(-1.2, -12, 1.1).fill(0xf97316);
}

/** Seagull / bird flying over the valley with wing-flapping phase and soft ground shadow. */
export function drawBird(g: Graphics, flap: number): void {
  g.clear();
  const w = Math.sin(flap) * 4.2;
  // Soft shadow cast on the ground below
  g.ellipse(2, 26, 4.5, 2).fill({ color: COLORS.shadow, alpha: 0.16 });
  // Left & right wings
  g.moveTo(-6.5, -w)
    .quadraticCurveTo(-2.5, -1.8 - w * 0.35, 0, 0)
    .quadraticCurveTo(2.5, -1.8 - w * 0.35, 6.5, -w)
    .stroke({ color: 0xf7f9fb, width: 2.1, cap: 'round' });
  g.moveTo(-6.5, -w).lineTo(-7.8, -w + 0.8).stroke({ color: 0x364352, width: 1.6, cap: 'round' });
  g.moveTo(6.5, -w).lineTo(7.8, -w + 0.8).stroke({ color: 0x364352, width: 1.6, cap: 'round' });
  // Body & beak
  g.ellipse(0, 0, 2.3, 1.2).fill(0xfdfefe);
  g.circle(2.4, -0.2, 0.7).fill(0xe8b931);
}