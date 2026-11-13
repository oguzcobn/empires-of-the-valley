import type { Graphics } from 'pixi.js';
import type { TerrainId } from '../core/types';
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
