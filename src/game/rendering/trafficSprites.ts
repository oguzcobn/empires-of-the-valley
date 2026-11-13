import type { Graphics } from 'pixi.js';
import type { MatchDay } from '../data/matchDays';

/** Small isometric-looking original road vehicle art; rendered in road depth order. */
export function drawCityCar(g: Graphics, paint: number, electric = false): void {
  g.ellipse(0, 3.5, 12, 3.5).fill({ color: 0x18242b, alpha: 0.29 });
  // Two visible wheels, cabin with transparent glass, windscreen and bumpers.
  g.roundRect(-9.5, -3.6, 3, 7, 1).fill(0x1a242a);
  g.roundRect(6.5, -3.6, 3, 7, 1).fill(0x1a242a);
  g.roundRect(-11.3, -7, 22.6, 11, 3).fill(paint);
  g.roundRect(-6.1, -11.4, 13.2, 8.2, 2.7).fill(0x344e60);
  g.poly([-5.3, -10.4, 5.8, -10.4, 5, -7.7, -4.8, -7.7]).fill({ color: 0xc7e8f1, alpha: 0.8 });
  g.moveTo(-8, -3.6).lineTo(8, -3.6).stroke({ color: 0xffffff, width: 0.85, alpha: 0.26 });
  g.roundRect(8.8, -4.5, 1.2, 2.1, 0.3).fill(electric ? 0x74e8f2 : 0xffe7a8);
  g.roundRect(-10, -4.5, 1.2, 2.1, 0.3).fill(0xdd4e4e);
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
