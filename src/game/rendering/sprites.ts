import type { Graphics } from 'pixi.js';
import type { RoadType, TerrainId } from '../core/types';
import { COLORS } from './palette';
import type { SeasonPalette } from './palette';
import { shade } from './iso';
import type { Pt } from './iso';

/**
 * Terrain props, villagers and flags. Buildings live in ./arch (culture-aware kit).
 * Procedural, original art. Every sprite is drawn with vector primitives in
 * local tile space, so the atlas names (building id + level) stay stable when hand-made sprites
 * replace them later. See docs/ART_GUIDE.md for the asset specification.
 */

const line = (g: Graphics, a: Pt, b: Pt, color: number, width = 1.5, alpha = 1): void => {
  g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ color, width, alpha });
};

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

/** Neighbour heights needed to draw a tile's visible cliff faces (front-left, front-right). */
export interface TileContext {
  height: number;
  /** Height of the tile in front-left (x, y+1); -1 = map edge. */
  frontLeft: number;
  /** Height of the tile in front-right (x+1, y); -1 = map edge. */
  frontRight: number;
}

const LEVEL = 12;

function cliffColor(terrain: TerrainId): number {
  if (terrain === 'terrace') return 0xa9a497;
  if (terrain === 'rocky' || terrain === 'mountain' || terrain === 'stone') return 0x8a8579;
  return 0x8a6a45;
}

/** One ground tile at its elevation: top diamond with seasonal colour and texture, cliffs, road. */
export function drawGroundTile(
  g: Graphics,
  x: number,
  y: number,
  terrain: TerrainId,
  variant: number,
  road: boolean,
  pal: SeasonPalette,
  ctx: TileContext = { height: 0, frontLeft: 0, frontRight: 0 },
  roadType: RoadType = 'dirt',
  detail = 2,
  paved = false,
): void {
  const h = ctx.height;
  const z = h * LEVEL;
  const ox = (x - y) * 32;
  const oy = (x + y) * 16 - z;
  // cliffs first (they hang below this tile's top)
  const edge = (to: number): number => (to < 0 ? -20 / LEVEL : to);
  const fl = edge(ctx.frontLeft);
  if (fl < h) {
    const zb = fl * LEVEL;
    const c = cliffColor(terrain);
    const pts = [ox - 32, oy + 16, ox, oy + 32, ox, oy + 32 + (z - zb), ox - 32, oy + 16 + (z - zb)];
    g.poly(pts).fill(c);
    if (detail >= 1) cliffTexture(g, ox - 32, oy + 16, ox, oy + 32, z - zb, terrain, c);
  }
  const fr = edge(ctx.frontRight);
  if (fr < h) {
    const zb = fr * LEVEL;
    const c = shade(cliffColor(terrain), 0.78);
    const pts = [ox, oy + 32, ox + 32, oy + 16, ox + 32, oy + 16 + (z - zb), ox, oy + 32 + (z - zb)];
    g.poly(pts).fill(c);
    if (detail >= 1) cliffTexture(g, ox, oy + 32, ox + 32, oy + 16, z - zb, terrain, c);
  }
  const diamond = [ox, oy, ox + 32, oy + 16, ox, oy + 32, ox - 32, oy + 16];
  const grass = pal.grass[(variant + ((x + y) & 1) * 2) % pal.grass.length]!;
  let color = grass;
  if (terrain === 'fertile') color = pal.fertile;
  else if (terrain === 'sand') color = pal.sand;
  else if (terrain === 'water') color = pal.water;
  else if (terrain === 'lake') color = shade(pal.water, 0.9);
  else if (terrain === 'stone') color = shade(grass, 0.94);
  else if (terrain === 'forest') color = shade(grass, 0.9 - h * 0.02);
  else if (terrain === 'hill') color = shade(grass, 0.97 - h * 0.03);
  else if (terrain === 'rocky') color = pal.snow ? 0xd9dde0 : 0x9d988c;
  else if (terrain === 'mountain') color = pal.snow || h >= 4 ? 0xe7ebee : 0x8b867b;
  else if (terrain === 'terrace') color = pal.snow ? 0xe4e8ea : shade(pal.fertile, 1.08);
  g.poly(diamond).fill(color);
  if (terrain === 'fertile' || terrain === 'terrace') {
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      g.moveTo(ox - 32 * t, oy + 16 * t)
        .lineTo(ox + 32 * (1 - t), oy + 16 * (1 + t))
        .stroke({ color: terrain === 'terrace' ? shade(pal.grass[0]!, 0.9) : pal.furrow, width: 1.5, alpha: 0.7 });
    }
  } else if ((terrain === 'rocky' || terrain === 'mountain') && detail >= 1) {
    const rock = terrain === 'mountain' ? 0x6f6a60 : 0x7d786d;
    g.poly([ox - 10, oy + 18, ox - 4, oy + 12, ox + 2, oy + 17]).fill(pal.snow ? 0xc9cfd3 : rock);
    g.poly([ox + 4, oy + 22, ox + 10, oy + 15, ox + 15, oy + 21]).fill(pal.snow ? 0xc0c7cc : shade(rock, 0.9));
    if (terrain === 'mountain' && h >= 3 && !pal.snow) g.poly([ox - 6, oy + 12, ox, oy + 6, ox + 6, oy + 12]).fill(0xf1f4f6);
  } else if (terrain === 'hill' && !pal.snow && detail >= 1) {
    g.ellipse(ox - 6, oy + 18, 7, 2.5).fill({ color: shade(grass, 1.08), alpha: 0.7 });
    g.ellipse(ox + 8, oy + 14, 6, 2).fill({ color: shade(grass, 0.9), alpha: 0.7 });
  } else if (terrain === 'grass' && variant === 0 && !pal.snow) {
    g.poly([ox - 6, oy + 18, ox - 4, oy + 13, ox - 2, oy + 18]).fill(shade(grass, 0.86));
    g.poly([ox + 5, oy + 22, ox + 7, oy + 17, ox + 9, oy + 22]).fill(shade(grass, 0.86));
  } else if (terrain === 'grass' && variant === 3 && !pal.snow) {
    g.circle(ox + 8, oy + 12, 1.6).fill(0xfff4b8);
    g.circle(ox - 9, oy + 19, 1.6).fill(0xf7c6d9);
  }
  if (road) drawRoad(g, ox, oy, roadType, pal, detail, paved);
}

function cliffTexture(g: Graphics, ax: number, ay: number, bx: number, by: number, drop: number, terrain: TerrainId, c: number): void {
  if (terrain === 'terrace') {
    // dry-stone retaining wall: courses of blocks
    for (let k = 3; k < drop; k += 3.5) {
      g.moveTo(ax, ay + k).lineTo(bx, by + k).stroke({ color: shade(c, 0.7), width: 0.7, alpha: 0.8 });
      for (let j = (k / 3.5) % 2 ? 0.25 : 0.12; j < 1; j += 0.25) {
        const x = ax + (bx - ax) * j;
        const y = ay + (by - ay) * j + k;
        g.moveTo(x, y).lineTo(x, y - 3.5).stroke({ color: shade(c, 0.7), width: 0.6, alpha: 0.7 });
      }
    }
    g.moveTo(ax, ay + 0.8).lineTo(bx, by + 0.8).stroke({ color: shade(c, 1.2), width: 1.6 });
  } else if (terrain === 'rocky' || terrain === 'mountain' || terrain === 'stone') {
    for (let k = 4; k < drop; k += 5) {
      const w = (k * 7) % 3;
      g.moveTo(ax, ay + k + w).lineTo((ax + bx) / 2, (ay + by) / 2 + k).lineTo(bx, by + k + 1).stroke({ color: shade(c, 0.72), width: 0.8, alpha: 0.7 });
    }
  } else {
    g.moveTo(ax, ay + 1).lineTo(bx, by + 1).stroke({ color: 0x6c9a45, width: 2, alpha: 0.9 });
    for (let k = 6; k < drop; k += 6)
      g.moveTo(ax, ay + k).lineTo(bx, by + k).stroke({ color: shade(c, 0.82), width: 0.7, alpha: 0.6 });
  }
}

function drawRoad(g: Graphics, ox: number, oy: number, type: RoadType, pal: SeasonPalette, detail: number, paved = false): void {
  const inset = 0.12;
  const d = [ox, oy + 32 * inset, ox + 32 * (1 - inset), oy + 16, ox, oy + 32 * (1 - inset), ox - 32 * (1 - inset), oy + 16];
  if (type === 'dirt' && paved) {
    // Raised stone-grey sidewalks embrace a dark two-lane road.
    // Drawing in the ground layer keeps pedestrians and vehicles in front.
    g.poly([ox, oy + 1, ox + 31, oy + 16, ox, oy + 31, ox - 31, oy + 16]).fill(0x9ea4a3);
    g.poly([ox, oy + 5, ox + 24, oy + 16, ox, oy + 27, ox - 24, oy + 16]).fill(0x363d45);
    g.moveTo(ox - 22, oy + 16).lineTo(ox, oy + 6).lineTo(ox + 22, oy + 16)
      .stroke({ color: 0xcbd1ce, width: 1.25, alpha: 0.85 });
    g.moveTo(ox - 22, oy + 16).lineTo(ox, oy + 26).lineTo(ox + 22, oy + 16)
      .stroke({ color: 0xa9aeab, width: 1.25, alpha: 0.85 });
    if (detail >= 1) {
      for (const [dx, dy] of [[-12, 11], [1, 17], [12, 21]] as const)
        g.moveTo(ox + dx, oy + dy).lineTo(ox + dx + 3.3, oy + dy + 1.5)
          .stroke({ color: 0xf3d775, width: 0.8, alpha: 0.9 });
      g.circle(ox + 16, oy + 16, 0.85).fill(0xbccbd0);
    }
    return;
  }
  if (type === 'bridge') {
    // stone piers in the water and a timber deck with rails
    g.rect(ox - 14, oy + 16, 6, 9).fill(0x9a958a);
    g.rect(ox + 8, oy + 16, 6, 9).fill(0x8a857a);
    g.poly(d).fill(0xa8794a);
    if (detail >= 1)
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        g.moveTo(ox - 28 * (1 - t), oy + 16 - 14 * (1 - t) + 14 * t * 0)
          .lineTo(ox + 28 * t, oy + 16 + 14 * t - 14)
          .stroke({ color: 0x7d5532, width: 0.6, alpha: 0.6 });
      }
    g.moveTo(ox - 28, oy + 14).lineTo(ox, oy).stroke({ color: 0x5a3b22, width: 1.4 });
    g.moveTo(ox, oy + 30).lineTo(ox + 28, oy + 16).stroke({ color: 0x5a3b22, width: 1.4 });
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

/** Small vessels for the lake and river: fishing boat, cargo ship or yacht. */
export function drawBoat(g: Graphics, kind: 'fishing' | 'cargo' | 'yacht'): void {
  g.ellipse(0, 1, 9, 3).fill({ color: 0x1b3a55, alpha: 0.25 });
  if (kind === 'yacht') {
    g.poly([-9, -2, 9, -2, 6, 2, -7, 2]).fill(0xf6f6f4);
    g.rect(-3, -5, 6, 3).fill(0xe0e6ea);
    g.moveTo(0, -5).lineTo(0, -20).stroke({ color: 0x8a8f94, width: 1 });
    g.poly([1, -19, 1, -6, 9, -6]).fill(0xffffff);
    return;
  }
  if (kind === 'cargo') {
    g.poly([-11, -3, 11, -3, 8, 2, -9, 2]).fill(0x7b1e3a);
    g.rect(-7, -7, 5, 4).fill(0xc98b3a);
    g.rect(-1, -7, 5, 4).fill(0x3d7fb5);
    g.rect(5, -9, 3, 6).fill(0xe8e4dc);
    return;
  }
  g.poly([-7, -2, 7, -2, 5, 2, -5, 2]).fill(0x8a5a36);
  g.moveTo(-1, -2).lineTo(-1, -13).stroke({ color: 0x5a3b22, width: 1 });
  g.poly([0, -12, 0, -3, 6, -3]).fill(0xe8dcc0);
}
