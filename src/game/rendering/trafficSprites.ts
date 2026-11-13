import type { Graphics } from 'pixi.js';
import type { MatchDay } from '../data/matchDays';

/**
 * Screen-space 2.5D vehicle constructed from shaded isometric polygons.
 * Direction changes redraw the geometry rather than rotating a flat top-down
 * rectangle, so the upright cabin, wheels and roof stay upright on screen.
 */
export function drawCityCar(
  g: Graphics, paint: number, electric = false, dx = 1, dy = 0,
): void {
  const vx = dx - dy;
  const vy = (dx + dy) * 0.5;
  const mag = Math.hypot(vx, vy) || 1;
  const ux = vx / mag, uy = vy / mag;
  const wx = -uy, wy = ux;
  const p = (length: number, width: number, height = 0): [number, number] =>
    [ux * length + wx * width, uy * length + wy * width - height];
  const poly = (points: [number, number][], color: number, alpha = 1): void => {
    g.poly(points.flat()).fill({ color, alpha });
  };
  const shade = (base: number, amount: number): number => {
    const r = Math.min(255, Math.max(0, Math.round(((base >> 16) & 255) * amount)));
    const gr = Math.min(255, Math.max(0, Math.round(((base >> 8) & 255) * amount)));
    const bl = Math.min(255, Math.max(0, Math.round((base & 255) * amount)));
    return (r << 16) | (gr << 8) | bl;
  };
  const a = p(-10.3, -4.5), b = p(10.3, -4.5), d = p(-10.3, 4.5), e = p(10.3, 4.5);
  // Vehicle shadow and rubber wheels appear below the body and behind it.
  g.ellipse(0, 3.1, 11.4, 4.2).fill({ color: 0x0e1b24, alpha: 0.31 });
  for (const longitudinal of [-6.8, 6.8]) {
    for (const lateral of [-4.4, 4.4]) {
      const [x, y] = p(longitudinal, lateral, 0.8);
      g.ellipse(x, y, 2.25, 2.5).fill(0x171d22);
      g.ellipse(x, y, 0.9, 1.1).fill(0xadb8be);
    }
  }
  // Two visible metal side faces and the contrasting bonnet.
  poly([a, b, p(10.3, -4.5, 4.3), p(-10.3, -4.5, 4.3)], shade(paint, 0.70));
  poly([d, e, p(10.3, 4.5, 4.3), p(-10.3, 4.5, 4.3)], shade(paint, 0.83));
  poly([b, e, p(10.3, 4.5, 4.3), p(10.3, -4.5, 4.3)], shade(paint, 0.90));
  poly([p(-10.3, -4.5, 4.3), p(10.3, -4.5, 4.3),
        p(10.3, 4.5, 4.3), p(-10.3, 4.5, 4.3)], shade(paint, 1.14));
  // Glass cabin with a separate side window and windshield.
  const roof = [
    p(-5.2, -3.55, 9.4), p(4.4, -3.55, 9.4),
    p(4.4, 3.55, 9.4), p(-5.2, 3.55, 9.4),
  ];
  poly([p(-6.6, -4.0, 4.3), p(5.2, -4.0, 4.3), roof[1]!, roof[0]!], 0x375267);
  poly([p(-6.6, 4.0, 4.3), p(5.2, 4.0, 4.3), roof[2]!, roof[3]!], 0x263f56);
  poly([p(5.2, -4.0, 4.3), p(5.2, 4.0, 4.3), roof[2]!, roof[1]!], 0x7bb2c9);
  poly([p(-6.6, -4.0, 4.3), p(-6.6, 4.0, 4.3), roof[3]!, roof[0]!], 0x527d97);
  poly(roof, shade(paint, 1.22));
  // Window highlights and dividing pillar on the near-side door.
  const [sx, sy] = p(-1.8, 4.05, 7.2);
  g.moveTo(sx, sy).lineTo(...p(-1.8, 4.05, 4.7))
    .stroke({ color: shade(paint, 0.67), width: 1.35 });
  g.moveTo(...p(-4.5, 4.55, 3.3)).lineTo(...p(3.0, 4.55, 3.3))
    .stroke({ color: 0xe7eef1, width: 0.65, alpha: 0.67 });
  // Light clusters follow the front/rear, never a screen-horizontal box.
  for (const side of [-3.3, 3.3]) {
    const [hx, hy] = p(10.4, side, 3.2);
    g.circle(hx, hy, 1.2).fill(electric ? 0xa1f8fe : 0xfff3c0);
    const [tx, ty] = p(-10.4, side, 2.9);
    g.circle(tx, ty, 1.05).fill(0xe84952);
  }
  if (electric) {
    const [x, y] = p(0, 0, 9.6);
    g.roundRect(x - 2, y - 0.6, 4, 1.1, 0.5).fill(0x7ce3eb);
  }
}

/** Clothing-only overlay on the same citizen proportions as drawVillager. */
export function drawFootballSupporter(g: Graphics, match: MatchDay, variant: number): void {
  const { jersey, stripe, pattern } = match;
  // A recognisable mini supporter (legs, arms, scarf, jersey, head and hat).
  g.ellipse(0, 0, 4.7, 1.9).fill({ color: 0x1a2027, alpha: 0.28 });
  g.roundRect(-2.4, -4.7, 2.0, 4.5, .5).fill(0x34445d);
  g.roundRect(0.6, -4.7, 2.0, 4.5, .5).fill(0x27364e);
  g.roundRect(-3.3, -10, 6.8, 6, 1.4).fill(jersey);
  if (pattern === 'vertical') {
    g.rect(-0.6, -9.8, 1.5, 5.7).fill(stripe);
    g.rect(2.1, -9.8, 0.6, 5.7).fill(stripe);
  } else if (pattern === 'horizontal') {
    for (const y of [-8.9, -6.7, -4.6]) g.rect(-3.0, y, 6, 1.25).fill(stripe);
  }
  const skin = variant % 3 === 0 ? 0x9c6b53 : 0xe2aa83;
  g.moveTo(-3.5, -9.4).lineTo(-4.7, -5.9).stroke({ color: skin, width: 2 });
  g.moveTo(3.5, -9.4).lineTo(4.7, -5.9).stroke({ color: skin, width: 2 });
  g.circle(0, -12.3, 3.2).fill(skin);
  g.ellipse(0, -15.4, 3.2, 1.6).fill(jersey);
  g.moveTo(-2.6, -10.5).lineTo(2.8, -11.4).stroke({ color: stripe, width: 2.2 });
  g.circle(-1.0, -12.5, .32).fill(0x2c2929);
  g.circle(1.0, -12.5, .32).fill(0x2c2929);
}

/** Animated flame/smoke is purely decorative; no real pyrotechnic advice. */
export function drawSupporterFlare(g: Graphics, tMs: number, phase: number): void {
  g.clear();
  const pulse = Math.sin(tMs / 110 + phase) * 1.2;
  const x = 5.8;
  g.moveTo(4.6, -6).lineTo(x, -13).stroke({ color: 0x535b63, width: 1.3 });
  g.circle(x, -14.4, 2.9 + pulse * .25).fill({ color: 0xff5835, alpha: 0.77 });
  g.circle(x, -14.8, 1.4).fill(0xffd05b);
  for (let n = 0; n < 4; n++) {
    const sway = Math.sin(tMs / 310 + phase + n) * (n + 1);
    g.circle(x + sway, -18 - n * 3.6 - (tMs / 180 + n * 3) % 4, 1.2 + n * .55)
      .fill({ color: 0xdfd8d6, alpha: Math.max(0.07, .3 - n * .06) });
  }
}
