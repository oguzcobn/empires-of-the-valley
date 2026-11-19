import type { Graphics } from 'pixi.js';
import { COLORS } from './palette';
import { shade } from './iso';
import { WALK_FRAMES } from './pedestrians';

/**
 * Infantry figure with realistic proportions: patterned combat uniform, helmet with cover,
 * plate carrier with magazine pouches, small assault pack, boots, and an assault rifle held at
 * low ready (butt stock, receiver, curved magazine, pistol grip, handguard, barrel with flash
 * hider and an optic). Turkish troops wear woodland green, Scottish troops multi-terrain tan.
 */

export interface Kit {
  base: number;
  blotches: readonly number[];
  vest: number;
  helmet: number;
  skin: number;
}

export function kitFor(culture: string, index: number): Kit {
  const skins = [0xe8b896, 0xd9a47a, 0xc78a63, 0xf1ccac, 0xa8724f];
  return culture === 'scottish'
    ? { base: 0x9a8a68, blotches: [0x6d6a4a, 0x5b4a36, 0xb8a882], vest: 0x8a7c5c, helmet: 0x7e7356, skin: skins[index % skins.length]! }
    : { base: 0x56603e, blotches: [0x3a4429, 0x7a7350, 0x2d2a22], vest: 0x4d5636, helmet: 0x4a5236, skin: skins[index % skins.length]! };
}

/** Draws one soldier with feet at (0, 0); `frame` drives the march, (dx, dy) the tile heading. */
export function drawSoldier(g: Graphics, kit: Kit, frame: number, dx = 0, dy = 0): void {
  g.clear();
  const moving = dx !== 0 || dy !== 0;
  const mirror = dx - dy < 0 ? -1 : 1;
  const back = moving && dx + dy < 0;
  const phase = ((frame % WALK_FRAMES) / WALK_FRAMES) * Math.PI * 2;
  const stride = moving ? Math.sin(phase) * 1.7 : 0;
  const bob = moving ? Math.abs(Math.cos(phase)) * 0.4 : 0;
  const X = (x: number): number => x * mirror;
  const Y = (y: number): number => y - bob;

  g.ellipse(0, 0, 3.8, 1.6).fill({ color: COLORS.shadow, alpha: 0.3 });

  const rifle = (): void => {
    // low ready: butt at the right hip, muzzle forward and slightly down past the left hand
    const p = (x: number, y: number): [number, number] => [X(x), Y(y)];
    const line = (a: [number, number], b: [number, number], color: number, width: number): void => {
      g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).stroke({ color, width, cap: 'butt' });
    };
    const black = 0x1c1f22;
    line(p(-2.9, -10.2), p(-0.6, -11.3), black, 1.5); // butt stock
    g.poly([...p(-3.1, -10.8), ...p(-2.7, -9.4), ...p(-2.3, -9.6), ...p(-2.7, -11)]).fill(black); // butt plate
    line(p(-0.6, -11.3), p(1.6, -12.2), 0x2b2f33, 1.7); // receiver
    line(p(0.9, -12.9), p(1.9, -13.3), 0x111315, 1); // optic
    g.poly([...p(0.6, -11.5), ...p(1.2, -11.8), ...p(1.5, -10.2), ...p(0.9, -9.9)]).fill(black); // curved magazine
    line(p(-0.2, -11.3), p(-0.4, -10.2), black, 0.8); // pistol grip
    line(p(1.6, -12.2), p(3.8, -13.1), 0x30352a, 1.4); // handguard
    line(p(3.8, -13.1), p(5.6, -13.8), 0x3a3d40, 0.6); // barrel
    line(p(5.4, -13.7), p(6.1, -14), black, 0.9); // flash hider
    line(p(-2.4, -10.3), p(2.2, -13.6), 0x3b3a2c, 0.4); // sling
  };

  if (back) rifle();

  // assault pack on the back (seen behind the shoulders from the front)
  if (!back) g.roundRect(X(-2.9) - (mirror < 0 ? 0 : 1.4), Y(-15.2), 1.6, 4.8, 0.5).fill(shade(kit.vest, 0.8));

  // legs in uniform trousers with knee pads and boots
  for (const [k, sign] of [[0, 1], [1, -1]] as const) {
    const hipX = X(k === 0 ? -0.9 : 0.9);
    const footX = hipX + stride * sign * mirror * 0.55;
    const kneeX = (hipX + footX) / 2 + (moving ? Math.max(0, stride * sign) * 0.25 * mirror : 0);
    const cloth = k === 0 ? kit.base : shade(kit.base, 0.82);
    g.moveTo(hipX, Y(-9.6)).lineTo(kneeX, Y(-4.8)).lineTo(footX, Y(-1.2)).stroke({ color: cloth, width: 1.7, cap: 'round', join: 'round' });
    g.circle(kneeX, Y(-4.8), 0.75).fill(shade(kit.vest, 0.7));
    g.roundRect(footX - 0.8 + mirror * 0.3, Y(-1.6), 1.8, 1.6, 0.4).fill(0x2a2420);
  }

  // torso: camo blouse, then plate carrier with three magazine pouches and a radio
  g.poly([X(-1.9), Y(-9.6), X(1.9), Y(-9.6), X(2.3), Y(-15.3), X(-2.3), Y(-15.3)]).fill(kit.base);
  kit.blotches.forEach((c, i) => g.ellipse(X(-1 + i * 0.9), Y(-11 - (i % 2) * 2.4), 0.9, 0.6).fill(c));
  g.poly([X(-1.8), Y(-10.6), X(1.8), Y(-10.6), X(2), Y(-14.8), X(-2), Y(-14.8)]).fill(kit.vest);
  if (!back) for (let i = 0; i < 3; i++) g.rect(X(-1.5 + i * 1.05) - (mirror < 0 ? 0.85 : 0), Y(-12.4), 0.85, 1.7).fill(shade(kit.vest, 0.78));
  else g.roundRect(X(-1.9) - (mirror < 0 ? 3.8 : 0), Y(-15.4), 3.8, 5, 0.6).fill(shade(kit.vest, 0.85));
  g.moveTo(X(1.4), Y(-14.8)).lineTo(X(1.6), Y(-17.5)).stroke({ color: 0x222222, width: 0.35 }); // radio antenna
  g.poly([X(0.4), Y(-9.6), X(1.9), Y(-9.6), X(2.3), Y(-15.3), X(0.5), Y(-15.3)]).fill({ color: 0x0e1410, alpha: 0.16 });

  // arms holding the rifle: rear hand on the pistol grip, front hand under the handguard
  const sleeve = shade(kit.base, 0.9);
  const arm = (sx: number, ex: number, ey: number, hx: number, hy: number, color: number): void => {
    g.moveTo(X(sx), Y(-14.8)).lineTo(X(ex), Y(ey)).lineTo(X(hx), Y(hy)).stroke({ color, width: 1.15, cap: 'round', join: 'round' });
    g.circle(X(hx), Y(hy), 0.55).fill(0x2b2f2a); // gloves
  };
  arm(-2.1, -1.6, -12.2, -0.3, -10.6, sleeve);
  if (!back) rifle();
  arm(2.1, 2.9, -12.3, 3.1, -12.7, kit.base);

  // neck, face, helmet with cover and brim
  const hx = X(0), hy = Y(-17.4);
  g.rect(hx - 0.45, Y(-16.2), 0.9, 1).fill(shade(kit.skin, 0.88));
  g.ellipse(hx, hy, 1.25, 1.5).fill(kit.skin);
  if (!back) {
    g.circle(hx + mirror * 0.5, hy - 0.05, 0.2).fill(0x2b211c);
    g.circle(hx - mirror * 0.2, hy - 0.05, 0.2).fill(0x2b211c);
    g.moveTo(hx - 0.9, hy + 0.9).lineTo(hx + 0.9, hy + 0.9).stroke({ color: 0x222222, width: 0.3 }); // chin strap
  }
  g.ellipse(hx, hy - 0.75, 1.75, 1.15).fill(kit.helmet);
  g.ellipse(hx, hy - 0.2, 1.95, 0.45).fill(shade(kit.helmet, 0.8));
  g.ellipse(hx - mirror * 0.5, hy - 1.15, 0.6, 0.3).fill(shade(kit.helmet, 1.15));
}
