import type { Graphics } from 'pixi.js';
import type { BuildingId, TerrainId } from '../core/types';
import { COLORS } from './palette';
import type { SeasonPalette } from './palette';
import { P, shade } from './iso';
import type { Pt } from './iso';

/**
 * Procedural, original placeholder art (Phase 1). Every sprite is drawn with vector primitives in
 * local tile space, so the atlas names (building id + level) stay stable when hand-made sprites
 * replace them later. See docs/ART_GUIDE.md for the asset specification.
 */

const flat = (pts: Pt[]): number[] => pts.flat();
const fill = (g: Graphics, pts: Pt[], color: number, alpha = 1): void => {
  g.poly(flat(pts)).fill({ color, alpha });
};
const line = (g: Graphics, a: Pt, b: Pt, color: number, width = 1.5, alpha = 1): void => {
  g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ color, width, alpha });
};

/** Axis-aligned box in tile space; left face lit, right face shaded. */
function box(
  g: Graphics,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  z0: number,
  z1: number,
  color: number,
): void {
  fill(g, [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)], color);
  fill(g, [P(u1, v1, z0), P(u1, v0, z0), P(u1, v0, z1), P(u1, v1, z1)], shade(color, 0.78));
  fill(g, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], shade(color, 1.12));
}

/** Gable roof. axis 'u': ridge runs along u (gable end faces right). axis 'v': ridge along v. */
function gable(
  g: Graphics,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  z: number,
  rise: number,
  roof: number,
  wall: number,
  axis: 'u' | 'v' = 'u',
): void {
  if (axis === 'u') {
    const vm = (v0 + v1) / 2;
    const r0 = P(u0, vm, z + rise);
    const r1 = P(u1, vm, z + rise);
    fill(g, [P(u0, v0, z), P(u1, v0, z), r1, r0], shade(roof, 0.8));
    fill(g, [P(u1, v0, z), P(u1, v1, z), r1], shade(wall, 0.78));
    fill(g, [P(u0, v1, z), P(u1, v1, z), r1, r0], roof);
    line(g, r0, r1, shade(roof, 0.7), 1.5);
  } else {
    const um = (u0 + u1) / 2;
    const r0 = P(um, v0, z + rise);
    const r1 = P(um, v1, z + rise);
    fill(g, [P(u0, v0, z), P(u0, v1, z), r1, r0], shade(roof, 1.08));
    fill(g, [P(u0, v1, z), P(u1, v1, z), r1], wall);
    fill(g, [P(u1, v0, z), P(u1, v1, z), r1, r0], shade(roof, 0.82));
    line(g, r0, r1, shade(roof, 0.7), 1.5);
  }
}

function hip(
  g: Graphics,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  z: number,
  rise: number,
  roof: number,
): void {
  const apex = P((u0 + u1) / 2, (v0 + v1) / 2, z + rise);
  fill(g, [P(u0, v0, z), P(u1, v0, z), apex], shade(roof, 0.75));
  fill(g, [P(u0, v0, z), P(u0, v1, z), apex], shade(roof, 0.95));
  fill(g, [P(u0, v1, z), P(u1, v1, z), apex], roof);
  fill(g, [P(u1, v1, z), P(u1, v0, z), apex], shade(roof, 0.8));
}

/** Rectangle on the lit left face (plane v = v1). */
const onLeft = (
  g: Graphics,
  v1: number,
  ua: number,
  ub: number,
  za: number,
  zb: number,
  color: number,
): void => fill(g, [P(ua, v1, za), P(ub, v1, za), P(ub, v1, zb), P(ua, v1, zb)], color);
/** Rectangle on the shaded right face (plane u = u1). */
const onRight = (
  g: Graphics,
  u1: number,
  va: number,
  vb: number,
  za: number,
  zb: number,
  color: number,
): void => fill(g, [P(u1, va, za), P(u1, vb, za), P(u1, vb, zb), P(u1, va, zb)], color);

function groundShadow(g: Graphics, w: number, h: number): void {
  fill(g, [P(0.05, 0.05), P(w - 0.02, 0.05), P(w + 0.12, h + 0.12), P(0.05, h - 0.02)], COLORS.shadow, 0.16);
}

function dirtPad(g: Graphics, w: number, h: number, color: number = COLORS.earth, alpha = 0.55): void {
  fill(g, [P(0.06, 0.06), P(w - 0.06, 0.06), P(w - 0.06, h - 0.06), P(0.06, h - 0.06)], color, alpha);
}

// ---------------------------------------------------------------- buildings

function drawHut(g: Graphics, level: number): void {
  groundShadow(g, 1, 1);
  if (level === 1) {
    box(g, 0.2, 0.2, 0.82, 0.82, 0, 12, COLORS.wood);
    onLeft(g, 0.82, 0.42, 0.6, 0, 9, COLORS.door);
    gable(g, 0.12, 0.12, 0.9, 0.9, 12, 13, COLORS.thatch, COLORS.wood);
  } else if (level === 2) {
    box(g, 0.16, 0.16, 0.86, 0.86, 0, 17, COLORS.plaster);
    onLeft(g, 0.86, 0.2, 0.26, 0, 17, COLORS.woodDark);
    onLeft(g, 0.86, 0.76, 0.82, 0, 17, COLORS.woodDark);
    onLeft(g, 0.86, 0.42, 0.6, 0, 10, COLORS.door);
    onRight(g, 0.86, 0.38, 0.6, 7, 13, COLORS.window);
    box(g, 0.58, 0.28, 0.72, 0.42, 17, 34, COLORS.rock);
    gable(g, 0.08, 0.08, 0.94, 0.94, 17, 14, COLORS.shingle, COLORS.plaster);
  } else {
    box(g, 0.12, 0.12, 0.9, 0.9, 0, 28, COLORS.stoneWall);
    onLeft(g, 0.9, 0.12, 0.9, 13, 15, COLORS.woodDark);
    onLeft(g, 0.9, 0.42, 0.6, 0, 10, COLORS.door);
    onLeft(g, 0.9, 0.24, 0.38, 18, 24, COLORS.window);
    onLeft(g, 0.9, 0.64, 0.78, 18, 24, COLORS.window);
    onRight(g, 0.9, 0.3, 0.46, 6, 12, COLORS.window);
    onRight(g, 0.9, 0.56, 0.72, 18, 24, COLORS.window);
    box(g, 0.56, 0.24, 0.72, 0.4, 28, 48, COLORS.rock);
    gable(g, 0.04, 0.04, 0.98, 0.98, 28, 15, COLORS.tile, COLORS.stoneWall);
  }
}

function drawTownCenter(g: Graphics, level: number): void {
  groundShadow(g, 2, 2);
  dirtPad(g, 2, 2, 0xd8c79c, 0.9);
  const towerH = level >= 2 ? 62 : 50;
  // watch tower (back corner)
  box(g, 0.2, 0.2, 0.86, 0.86, 0, towerH, COLORS.stoneWall);
  onLeft(g, 0.86, 0.44, 0.62, towerH - 16, towerH - 6, COLORS.door);
  onRight(g, 0.86, 0.44, 0.62, towerH - 16, towerH - 6, shade(COLORS.door, 0.8));
  if (level >= 2) onLeft(g, 0.86, 0.2, 0.86, 24, 27, COLORS.rockDark);
  hip(g, 0.1, 0.1, 0.96, 0.96, towerH, 18, COLORS.slate);
  // great hall (right wing)
  box(g, 1.0, 0.2, 1.84, 1.84, 0, 22, COLORS.plaster);
  onLeft(g, 1.84, 1.28, 1.56, 0, 14, COLORS.door);
  onRight(g, 1.84, 0.4, 0.62, 8, 16, COLORS.window);
  onRight(g, 1.84, 0.84, 1.06, 8, 16, COLORS.window);
  onRight(g, 1.84, 1.28, 1.5, 8, 16, COLORS.window);
  box(g, 1.3, 0.34, 1.46, 0.5, 22, 46, COLORS.rock);
  gable(g, 0.92, 0.1, 1.92, 1.92, 22, 20, level >= 2 ? COLORS.tile : 0xc9793f, COLORS.plaster, 'v');
  // courtyard well and market stall
  box(g, 0.34, 1.24, 0.6, 1.5, 0, 6, COLORS.rock);
  fill(g, [P(0.36, 1.26, 6), P(0.58, 1.26, 6), P(0.58, 1.48, 6), P(0.36, 1.48, 6)], 0x3f8fc0);
  if (level >= 2) {
    box(g, 0.2, 1.62, 0.8, 1.8, 0, 7, COLORS.plank);
    fill(g, [P(0.14, 1.52, 16), P(0.86, 1.52, 16), P(0.86, 1.86, 13), P(0.14, 1.86, 13)], 0xd9463e);
    fill(g, [P(0.38, 1.52, 16), P(0.62, 1.52, 16), P(0.62, 1.86, 13), P(0.38, 1.86, 13)], 0xf2ead2);
  }
}

function drawWarehouse(g: Graphics, level: number): void {
  groundShadow(g, 2, 2);
  const h = level >= 2 ? 24 : 17;
  if (level >= 2) box(g, 0.14, 0.14, 1.86, 1.86, 0, 6, COLORS.rock);
  box(g, 0.16, 0.16, 1.84, 1.84, level >= 2 ? 6 : 0, h, 0xc79a63);
  for (let u = 0.3; u < 1.8; u += 0.3) onLeft(g, 1.84, u, u + 0.03, 0, h, 0xa87c4a);
  onLeft(g, 1.84, 0.74, 1.26, 0, 13, COLORS.door);
  onLeft(g, 1.84, 0.98, 1.02, 0, 13, 0x7a5232);
  onRight(g, 1.84, 0.8, 1.2, h - 8, h - 3, 0x5a3b22);
  gable(g, 0.06, 0.06, 1.94, 1.94, h, 17, 0x8f5d3a, 0xc79a63);
  // crates and a barrel by the door
  box(g, 0.2, 1.86, 0.44, 2.0, 0, 7, COLORS.plank);
  box(g, 0.48, 1.88, 0.66, 2.0, 0, 5, shade(COLORS.plank, 0.9));
}

function drawLumberCamp(g: Graphics, level: number): void {
  groundShadow(g, 2, 2);
  dirtPad(g, 2, 2);
  const s = level >= 2 ? 1.1 : 0.95;
  box(g, 0.16, 0.16, s, s, 0, 13, COLORS.wood);
  onLeft(g, s, 0.4, 0.66, 0, 10, COLORS.door);
  gable(g, 0.08, 0.08, s + 0.08, s + 0.08, 13, 11, 0x6d8a4a, COLORS.wood);
  // stacked logs
  const logs = level >= 2 ? 4 : 3;
  for (let i = 0; i < logs; i++) {
    const v = 0.26 + i * 0.17;
    box(g, 1.22, v, 1.86, v + 0.13, 0, 5, COLORS.trunk);
    fill(g, [P(1.86, v, 0.5), P(1.86, v + 0.13, 0.5), P(1.86, v + 0.13, 4.5), P(1.86, v, 4.5)], 0xe0bd86);
  }
  box(g, 1.3, 0.34, 1.86, 0.47, 5, 10, COLORS.trunk);
  box(g, 1.3, 0.51, 1.86, 0.64, 5, 10, COLORS.trunk);
  // sawn planks and chopping block
  box(g, 1.18, 1.26, 1.8, 1.7, 0, level >= 2 ? 8 : 5, COLORS.plank);
  box(g, 0.42, 1.36, 0.6, 1.54, 0, 6, COLORS.trunk);
  line(g, P(0.5, 1.45, 6), P(0.62, 1.38, 15), 0x6b6f75, 2);
}

function drawFarm(g: Graphics, level: number, pal: SeasonPalette): void {
  fill(g, [P(0.04, 0.04), P(1.96, 0.04), P(1.96, 1.96), P(0.04, 1.96)], pal.furrow);
  for (let v = 0.12; v < 1.9; v += 0.25) {
    const uStart = 0.1;
    const uEnd = v < 0.95 ? 1.05 : 1.9;
    const z = pal.cropHeight;
    fill(g, [P(uStart, v), P(uEnd, v), P(uEnd, v + 0.14), P(uStart, v + 0.14)], shade(pal.fertile, 0.92));
    if (z > 0) {
      fill(
        g,
        [P(uStart, v + 0.14, 0), P(uEnd, v + 0.14, 0), P(uEnd, v + 0.14, z), P(uStart, v + 0.14, z)],
        shade(pal.crop, 0.85),
      );
      fill(g, [P(uStart, v, z), P(uEnd, v, z), P(uEnd, v + 0.14, z), P(uStart, v + 0.14, z)], pal.crop);
    } else if (pal.snow) {
      fill(g, [P(uStart, v), P(uEnd, v), P(uEnd, v + 0.07), P(uStart, v + 0.07)], 0xf4f7f9, 0.9);
    }
  }
  // fence
  line(g, P(0.04, 1.96, 5), P(1.96, 1.96, 5), COLORS.woodDark, 1.5);
  line(g, P(1.96, 0.9, 5), P(1.96, 1.96, 5), COLORS.woodDark, 1.5);
  for (let u = 0.04; u <= 1.97; u += 0.32) line(g, P(u, 1.96, 0), P(u, 1.96, 7), COLORS.woodDark, 1.5);
  // barn
  box(g, 1.16, 0.14, 1.86, 0.86, 0, 15, 0xb5533c);
  onLeft(g, 0.86, 1.38, 1.64, 0, 10, 0xf2ead2);
  onLeft(g, 0.86, 1.42, 1.6, 0, 9, COLORS.door);
  gable(g, 1.08, 0.06, 1.94, 0.94, 15, 12, 0x6b4a3a, 0xb5533c);
  if (level >= 2) {
    box(g, 0.2, 0.2, 0.56, 0.56, 0, 30, 0xd9d4c7);
    hip(g, 0.14, 0.14, 0.62, 0.62, 30, 10, 0xb5533c);
  }
}

function drawQuarry(g: Graphics, level: number): void {
  fill(g, [P(0.05, 0.05), P(1.95, 0.05), P(1.95, 1.95), P(0.05, 1.95)], 0x8d8f8a);
  fill(g, [P(0.9, 0.9), P(1.8, 0.9), P(1.8, 1.8), P(0.9, 1.8)], 0x6f726e);
  box(g, 0.1, 0.1, 1.2, 0.8, 0, 12, COLORS.rock);
  box(g, 0.1, 0.1, 0.8, 0.5, 12, 22, shade(COLORS.rock, 1.05));
  if (level >= 2) box(g, 0.1, 0.1, 0.45, 0.32, 22, 30, shade(COLORS.rock, 1.1));
  box(g, 0.14, 0.95, 0.6, 1.5, 0, 8, shade(COLORS.rock, 0.95));
  box(g, 1.2, 1.3, 1.5, 1.6, 0, 7, 0xc9cdd2);
  box(g, 1.55, 1.05, 1.78, 1.28, 0, 5, 0xb9bdc2);
  // wooden crane
  line(g, P(1.5, 0.5, 0), P(1.5, 0.5, 34), COLORS.woodDark, 3);
  line(g, P(1.5, 0.5, 34), P(1.2, 1.2, 28), COLORS.woodDark, 2.5);
  line(g, P(1.2, 1.2, 28), P(1.2, 1.2, 10), 0x3a2a1c, 1);
  box(g, 1.12, 1.12, 1.28, 1.28, 5, 10, 0xc9cdd2);
  if (level >= 2) {
    box(g, 0.7, 1.55, 1.0, 1.8, 2, 8, COLORS.wood);
    g.circle(P(0.74, 1.8, 2)[0], P(0.74, 1.8, 2)[1], 3).fill(0x3a2a1c);
    g.circle(P(0.96, 1.8, 2)[0], P(0.96, 1.8, 2)[1], 3).fill(0x3a2a1c);
  }
}

function drawGranary(g: Graphics, level: number): void {
  groundShadow(g, 2, 2);
  dirtPad(g, 2, 2, 0xd8c79c, 0.5);
  const h = level >= 2 ? 32 : 26;
  if (level >= 2) box(g, 0.24, 0.24, 1.76, 1.76, 0, 7, COLORS.rock);
  else
    for (const [u, v] of [
      [0.34, 0.34],
      [1.56, 0.34],
      [0.34, 1.56],
      [1.56, 1.56],
    ] as const)
      box(g, u, v, u + 0.1, v + 0.1, 0, 7, COLORS.woodDark);
  box(g, 0.28, 0.28, 1.72, 1.72, 7, h, 0xc99a5b);
  for (let z = 12; z < h; z += 6) onLeft(g, 1.72, 0.28, 1.72, z, z + 1, shade(0xc99a5b, 0.8));
  onLeft(g, 1.72, 0.84, 1.16, 9, 21, COLORS.door);
  line(g, P(0.9, 1.95, 0), P(0.9, 1.72, 9), COLORS.woodDark, 2);
  line(g, P(1.1, 1.95, 0), P(1.1, 1.72, 9), COLORS.woodDark, 2);
  hip(g, 0.16, 0.16, 1.84, 1.84, h, 20, COLORS.thatch);
}

function drawSchool(g: Graphics, level: number): void {
  groundShadow(g, 2, 2);
  dirtPad(g, 2, 2, 0xd8c79c, 0.6);
  const h = level >= 2 ? 28 : 21;
  box(g, 0.18, 0.18, 1.82, 1.82, 0, h, 0xf0e4c8);
  onLeft(g, 1.82, 0.86, 1.14, 0, 13, COLORS.door);
  for (const u of [0.36, 1.34]) onLeft(g, 1.82, u, u + 0.28, h - 13, h - 5, COLORS.window);
  for (const v of [0.4, 0.86, 1.32]) onRight(g, 1.82, v, v + 0.26, h - 13, h - 5, COLORS.window);
  if (level >= 2) onLeft(g, 1.82, 0.18, 1.82, 13, 15, COLORS.slate);
  gable(g, 0.1, 0.1, 1.9, 1.9, h, 17, COLORS.slate, 0xf0e4c8);
  // bell turret on the ridge
  box(g, 0.84, 0.84, 1.16, 1.16, h + 12, h + 26, 0xf0e4c8);
  onLeft(g, 1.16, 0.92, 1.08, h + 15, h + 23, 0xd9a93a);
  hip(g, 0.78, 0.78, 1.22, 1.22, h + 26, 10, COLORS.slate);
}

export function drawBuilding(g: Graphics, id: BuildingId, level: number, pal: SeasonPalette): void {
  switch (id) {
    case 'hut':
      return drawHut(g, level);
    case 'town_center':
      return drawTownCenter(g, level);
    case 'warehouse':
      return drawWarehouse(g, level);
    case 'lumber_camp':
      return drawLumberCamp(g, level);
    case 'farm':
      return drawFarm(g, level, pal);
    case 'quarry':
      return drawQuarry(g, level);
    case 'granary':
      return drawGranary(g, level);
    case 'school':
      return drawSchool(g, level);
  }
}

/** Construction site: foundation, rising timber frame and scaffolding. progress in [0, 1]. */
export function drawConstruction(g: Graphics, w: number, h: number, progress: number): void {
  fill(g, [P(0.04, 0.04), P(w - 0.04, 0.04), P(w - 0.04, h - 0.04), P(0.04, h - 0.04)], 0xc9b089);
  const top = 6 + 22 * progress;
  box(g, 0.2, 0.2, w - 0.2, h - 0.2, 0, top, 0xe3c58f);
  for (const [u, v] of [
    [0.12, h - 0.12],
    [w - 0.12, h - 0.12],
    [w - 0.12, 0.12],
  ] as const) {
    line(g, P(u, v, 0), P(u, v, 34), COLORS.woodDark, 2);
  }
  line(g, P(0.12, h - 0.12, 14), P(w - 0.12, h - 0.12, 14), COLORS.woodDark, 1.5);
  line(g, P(0.12, h - 0.12, 28), P(w - 0.12, h - 0.12, 28), COLORS.woodDark, 1.5);
  line(g, P(w - 0.12, h - 0.12, 14), P(w - 0.12, 0.12, 14), COLORS.woodDark, 1.5);
  line(g, P(w - 0.12, h - 0.12, 28), P(w - 0.12, 0.12, 28), COLORS.woodDark, 1.5);
  line(g, P(0.12, h - 0.12, 0), P(w - 0.12, h - 0.12, 14), COLORS.woodDark, 1);
}

/** Approximate sprite heights (px) used for click picking and badge placement. */
export const BUILDING_HEIGHT: Record<BuildingId, number> = {
  hut: 30,
  town_center: 70,
  warehouse: 36,
  lumber_camp: 26,
  farm: 14,
  quarry: 26,
  granary: 48,
  school: 54,
};

/** Chimney / fire positions that emit smoke while the building is in use. */
export function smokeAnchor(id: BuildingId, level: number): Pt | null {
  if (id === 'hut') return level === 2 ? P(0.65, 0.35, 36) : level === 3 ? P(0.64, 0.32, 50) : null;
  if (id === 'town_center') return P(1.38, 0.42, 48);
  if (id === 'lumber_camp') return P(0.5, 1.45, 8);
  return null;
}

export function flagAnchor(id: BuildingId, level: number): Pt | null {
  if (id === 'town_center') return P(0.53, 0.53, (level >= 2 ? 62 : 50) + 18);
  if (id === 'school') return P(1, 1, (level >= 2 ? 28 : 21) + 36);
  return null;
}

export function drawFlag(g: Graphics, phase: number, color: number): void {
  g.clear();
  line(g, [0, 0], [0, -16], 0x4a3a2a, 1.5);
  const w1 = Math.sin(phase) * 1.5;
  const w2 = Math.sin(phase + 1.2) * 2;
  g.poly([0, -16, 7, -15 + w1, 14, -13 + w2, 7, -9 + w1, 0, -9]).fill(color);
}

// ---------------------------------------------------------------- terrain props

export function drawTree(g: Graphics, pal: SeasonPalette, kind: number, scale: number): void {
  g.ellipse(0, 0, 9 * scale, 4 * scale).fill({ color: COLORS.shadow, alpha: 0.18 });
  if (kind % 2 === 0) {
    // conifer
    g.rect(-1.5 * scale, -8 * scale, 3 * scale, 8 * scale).fill(COLORS.trunk);
    for (let i = 0; i < 3; i++) {
      const y = -6 * scale - i * 8 * scale;
      const w = (11 - i * 2.5) * scale;
      g.poly([-w, y, w, y, 0, y - 13 * scale]).fill(shade(pal.pine, 1 + i * 0.08));
      if (pal.snow)
        g.poly([-w * 0.45, y - 7 * scale, w * 0.45, y - 7 * scale, 0, y - 13 * scale]).fill(0xf7fafc);
    }
  } else {
    g.rect(-2 * scale, -12 * scale, 4 * scale, 12 * scale).fill(COLORS.trunk);
    if (pal.snow) {
      line(g, [0, -12 * scale], [-7 * scale, -22 * scale], COLORS.trunk, 1.5 * scale);
      line(g, [0, -12 * scale], [6 * scale, -23 * scale], COLORS.trunk, 1.5 * scale);
      line(g, [0, -14 * scale], [0, -26 * scale], COLORS.trunk, 1.5 * scale);
      g.ellipse(-4 * scale, -21 * scale, 4 * scale, 1.6 * scale).fill(0xf7fafc);
      g.ellipse(4 * scale, -23 * scale, 4 * scale, 1.6 * scale).fill(0xf7fafc);
    } else {
      const c = pal.leaf[kind % pal.leaf.length]!;
      const base = pal.leaf[0]!;
      g.circle(-5 * scale, -17 * scale, 8 * scale).fill(shade(base, 0.9));
      g.circle(5 * scale, -18 * scale, 8 * scale).fill(shade(base, 0.82));
      g.circle(0, -24 * scale, 9 * scale).fill(base);
      g.circle(-3 * scale, -26 * scale, 4 * scale).fill(shade(c, 1.1));
    }
  }
}

export function drawStump(g: Graphics): void {
  g.ellipse(0, -1, 4, 2).fill(COLORS.trunk);
  g.rect(-4, -4, 8, 3).fill(COLORS.trunk);
  g.ellipse(0, -4, 4, 2).fill(0xe0bd86);
}

export function drawRocks(g: Graphics, variant: number, rich: boolean): void {
  g.ellipse(0, 0, 18, 7).fill({ color: COLORS.shadow, alpha: 0.16 });
  const rock = (x: number, y: number, w: number, h: number, c: number): void => {
    g.poly([
      x - w,
      y,
      x - w * 0.6,
      y - h,
      x + w * 0.3,
      y - h * 1.15,
      x + w,
      y - h * 0.35,
      x + w * 0.8,
      y,
    ]).fill(c);
    g.poly([x - w, y, x - w * 0.6, y - h, x - w * 0.1, y - h * 0.5, x - w * 0.2, y]).fill(shade(c, 1.15));
  };
  if (!rich) {
    rock(-6, 2, 5, 4, COLORS.rockDark);
    rock(7, 3, 4, 3, COLORS.rock);
    return;
  }
  rock(-8 + variant, 1, 10, 13, COLORS.rock);
  rock(8, 3, 9, 9 + variant, COLORS.rockDark);
  rock(-1, 6, 6, 5, 0xb5bac0);
}

/** One ground tile: diamond with seasonal colour and per-terrain texture. */
export function drawGroundTile(
  g: Graphics,
  x: number,
  y: number,
  terrain: TerrainId,
  variant: number,
  road: boolean,
  pal: SeasonPalette,
): void {
  const ox = (x - y) * 32;
  const oy = (x + y) * 16;
  const diamond = [ox, oy, ox + 32, oy + 16, ox, oy + 32, ox - 32, oy + 16];
  const grass = pal.grass[(variant + ((x + y) & 1) * 2) % pal.grass.length]!;
  let color = grass;
  if (terrain === 'fertile') color = pal.fertile;
  else if (terrain === 'sand') color = pal.sand;
  else if (terrain === 'water') color = pal.water;
  else if (terrain === 'stone') color = shade(grass, 0.94);
  else if (terrain === 'forest') color = shade(grass, 0.9);
  g.poly(diamond).fill(color);
  if (terrain === 'fertile') {
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      g.moveTo(ox - 32 * t, oy + 16 * t)
        .lineTo(ox + 32 * (1 - t), oy + 16 * (1 + t))
        .stroke({ color: pal.furrow, width: 1.5, alpha: 0.7 });
    }
  } else if (terrain === 'grass' && variant === 0 && !pal.snow) {
    g.poly([ox - 6, oy + 18, ox - 4, oy + 13, ox - 2, oy + 18]).fill(shade(grass, 0.86));
    g.poly([ox + 5, oy + 22, ox + 7, oy + 17, ox + 9, oy + 22]).fill(shade(grass, 0.86));
  } else if (terrain === 'grass' && variant === 3 && !pal.snow) {
    g.circle(ox + 8, oy + 12, 1.6).fill(0xfff4b8);
    g.circle(ox - 9, oy + 19, 1.6).fill(0xf7c6d9);
  }
  if (road) {
    const inset = 0.12;
    g.poly([
      ox,
      oy + 32 * inset,
      ox + 32 * (1 - inset),
      oy + 16,
      ox,
      oy + 32 * (1 - inset),
      ox - 32 * (1 - inset),
      oy + 16,
    ]).fill(pal.snow ? 0xd8c9a8 : COLORS.road);
    g.circle(ox - 8, oy + 15, 1.5).fill(COLORS.roadEdge);
    g.circle(ox + 9, oy + 18, 1.5).fill(COLORS.roadEdge);
    g.circle(ox + 1, oy + 11, 1.2).fill(COLORS.roadEdge);
  }
}

export function drawVillager(g: Graphics, color: number): void {
  g.ellipse(0, 0, 4, 2).fill({ color: COLORS.shadow, alpha: 0.25 });
  g.roundRect(-2.5, -9, 5, 8, 2).fill(color);
  g.circle(0, -11.5, 2.6).fill(COLORS.skin);
}

export function drawCart(g: Graphics, load: number): void {
  g.ellipse(0, 0, 8, 3).fill({ color: COLORS.shadow, alpha: 0.25 });
  g.roundRect(-7, -9, 14, 6, 1.5).fill(COLORS.wood);
  g.roundRect(-5, -12, 10, 4, 1.5).fill(load);
  g.circle(-4, -2, 2.6).fill(0x3a2a1c);
  g.circle(4, -2, 2.6).fill(0x3a2a1c);
}
