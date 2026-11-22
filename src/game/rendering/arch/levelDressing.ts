import type { ArchitectureStyle } from '../../core/types';
import { P } from '../iso';
import { box, glowPane, line, poly } from './kit';
import type { DrawCtx } from './kit';

/**
 * Street dressing that grows with a building's level, along its two front edges (the ones facing
 * the camera), so every building shows how far it has been developed, whatever its own art does:
 *
 * - level 2: paved kerb along the front and a classic street lantern
 * - level 3: stone planters with flowers and a bench
 * - level 4: modern slim LED street lights and a bicycle rack
 * - level 5: a smart city corner: EV charger, an information totem and green planters
 *
 * Items stand inside the footprint margin (0.1 tile) and are drawn after the building, which is
 * behind them, so they never cover its walls.
 */
export function drawLevelDressing(ctx: DrawCtx, w: number, h: number, level: number, style: ArchitectureStyle): void {
  if (level < 2) return;
  const edge = 0.06;
  const scottish = style === 'scottish';
  const modern = level >= 4;
  // kerb strip along both front edges
  const kerb = scottish ? 0xa8a49a : 0xd2c4a6;
  poly(ctx, [P(0.02, h - edge, 0.3), P(w - edge, h - edge, 0.3), P(w - edge, h - 0.005, 0.3), P(0.02, h - 0.005, 0.3)], kerb, 0.75);
  poly(ctx, [P(w - edge, 0.02, 0.3), P(w - 0.005, 0.02, 0.3), P(w - 0.005, h - edge, 0.3), P(w - edge, h - edge, 0.3)], kerb, 0.75);
  // Reference-guided material pass: thin, directional kerb highlights clarify the
  // front edges at normal isometric zoom without changing any footprint or hitbox.
  const kerbHighlight = scottish ? 0xd8d2c5 : 0xf1e2c1;
  poly(ctx, [P(0.04, h - edge, 0.35), P(w - edge - 0.02, h - edge, 0.35), P(w - edge - 0.02, h - edge + 0.012, 0.35), P(0.04, h - edge + 0.012, 0.35)], kerbHighlight, 0.48);
  poly(ctx, [P(w - edge, 0.04, 0.35), P(w - edge + 0.012, 0.04, 0.35), P(w - edge + 0.012, h - edge - 0.02, 0.35), P(w - edge, h - edge - 0.02, 0.35)], kerbHighlight, 0.35);
  const lampAt = (u: number, v: number): void => (modern ? ledLight(ctx, u, v) : lantern(ctx, u, v, scottish));
  // street lights at the left end of the front-left edge and the back end of the front-right edge
  lampAt(0.12, h - 0.04);
  if (w + h >= 3 || level >= 4) lampAt(w - 0.04, 0.12);
  if (level >= 3) {
    const n = Math.max(1, Math.round(w - 0.6));
    for (let i = 0; i < n; i++) planter(ctx, 0.32 + i * ((w - 0.55) / n), h - 0.05, level >= 5);
    if (w >= 2 || level >= 4) bench(ctx, w - 0.05, h * 0.5, modern);
  }
  if (level >= 4) bikeRack(ctx, w * 0.62, h - 0.05);
  if (level >= 5) {
    evCharger(ctx, w - 0.05, Math.max(0.3, h - 0.32));
    totem(ctx, w - 0.07, h - 0.07);
  }
}

function lantern(ctx: DrawCtx, u: number, v: number, scottish: boolean): void {
  const iron = scottish ? 0x2b3036 : 0x3b3027;
  box(ctx, u - 0.02, v - 0.02, u + 0.02, v + 0.02, 0, 1.2, iron);
  line(ctx, P(u, v, 1.2), P(u, v, 13), iron, 1.1);
  box(ctx, u - 0.03, v - 0.03, u + 0.03, v + 0.03, 13, 16, iron);
  const [x, y] = P(u, v, 14.6);
  glowPane(ctx, [[x - 1.3, y - 1.4], [x + 1.3, y - 1.4], [x + 1.3, y + 1.4], [x - 1.3, y + 1.4]], 0xffd27a);
  poly(ctx, [P(u - 0.04, v - 0.04, 16), P(u + 0.04, v - 0.04, 16), P(u, v, 18.2)], iron);
}

function ledLight(ctx: DrawCtx, u: number, v: number): void {
  const steel = 0x8d969e;
  line(ctx, P(u, v, 0), P(u, v, 17), steel, 1.2);
  // slim arm with an LED bar
  line(ctx, P(u, v, 17), P(u - 0.12, v - 0.12, 17.6), steel, 1);
  const a = P(u - 0.05, v - 0.05, 17.3), b = P(u - 0.13, v - 0.13, 17.7);
  glowPane(ctx, [[a[0], a[1] - 0.6], [b[0], b[1] - 0.6], [b[0], b[1] + 0.6], [a[0], a[1] + 0.6]], 0xeaf6ff);
}

function planter(ctx: DrawCtx, u: number, v: number, lush: boolean): void {
  box(ctx, u - 0.07, v - 0.04, u + 0.07, v + 0.03, 0, 2.6, 0xb9b1a2);
  const leaves = lush ? 0x3f8a4a : 0x5c8f45;
  for (let i = -1; i <= 1; i++) {
    const [x, y] = P(u + i * 0.04, v, 3.6);
    ctx.g.circle(x, y, lush ? 2 : 1.6).fill(leaves);
  }
  const flowers = [0xe25a6a, 0xf2c230, 0xf5f0e8];
  for (let i = 0; i < 3; i++) {
    const [x, y] = P(u - 0.04 + i * 0.04, v, 4.6);
    ctx.g.circle(x, y, 0.6).fill(flowers[i]!);
  }
}

function bench(ctx: DrawCtx, u: number, v: number, modern: boolean): void {
  const seat = modern ? 0x9aa3ab : 0x8a5a36;
  box(ctx, u - 0.02, v - 0.14, u + 0.02, v + 0.14, 2, 2.8, seat);
  box(ctx, u + 0.01, v - 0.14, u + 0.03, v + 0.14, 2.8, 5, seat);
  for (const d of [-0.12, 0.12]) line(ctx, P(u, v + d, 0), P(u, v + d, 2), 0x2f3338, 0.8);
}

function bikeRack(ctx: DrawCtx, u: number, v: number): void {
  for (let i = 0; i < 3; i++) {
    const a = P(u + i * 0.07, v, 0), b = P(u + i * 0.07, v, 4);
    line(ctx, a, b, 0x9aa3ab, 0.9);
  }
  line(ctx, P(u, v, 4), P(u + 0.14, v, 4), 0x9aa3ab, 0.9);
  // a parked bicycle
  const w0 = P(u + 0.03, v + 0.02, 1.6), w1 = P(u + 0.15, v + 0.02, 1.6);
  ctx.g.circle(w0[0], w0[1], 1.6).stroke({ color: 0x2b2b2b, width: 0.6 });
  ctx.g.circle(w1[0], w1[1], 1.6).stroke({ color: 0x2b2b2b, width: 0.6 });
  line(ctx, w0, P(u + 0.09, v + 0.02, 3.4), 0x2e7d32, 0.7);
  line(ctx, P(u + 0.09, v + 0.02, 3.4), w1, 0x2e7d32, 0.7);
}

function evCharger(ctx: DrawCtx, u: number, v: number): void {
  box(ctx, u - 0.03, v - 0.05, u + 0.02, v + 0.05, 0, 8.5, 0xf1f4f6);
  const [x, y] = P(u + 0.021, v, 6.5);
  glowPane(ctx, [[x - 0.8, y - 1], [x + 0.8, y - 1], [x + 0.8, y + 1], [x - 0.8, y + 1]], 0x3fe07a);
  line(ctx, P(u + 0.02, v + 0.03, 4), P(u + 0.03, v + 0.12, 0.5), 0x2b2b2b, 0.7);
}

function totem(ctx: DrawCtx, u: number, v: number): void {
  box(ctx, u - 0.025, v - 0.025, u + 0.025, v + 0.025, 0, 11, 0x37474f);
  const a = P(u - 0.024, v + 0.026, 3), b = P(u + 0.024, v + 0.026, 10);
  glowPane(ctx, [[a[0], b[1]], [b[0], b[1]], [b[0], a[1]], [a[0], a[1]]], 0x7fd3ff);
}
