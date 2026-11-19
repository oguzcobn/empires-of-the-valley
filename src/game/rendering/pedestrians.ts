import type { Graphics } from 'pixi.js';
import { COLORS } from './palette';
import { shade } from './iso';

/**
 * Walking townsfolk with an 8-frame stride. Each figure has a body type (adult, child, elder),
 * clothes, hair and an accessory; it faces where it walks (front or back view, mirrored left or
 * right). Visual only: residents are drawn from the renderer's own random numbers.
 */

export type PedKind = 'man' | 'woman' | 'child' | 'elder';
export type PedExtra = 'none' | 'bag' | 'backpack' | 'phone' | 'umbrella' | 'cane' | 'stroller' | 'dog' | 'balloon';

export interface PedLook {
  kind: PedKind;
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  shoes: number;
  extra: PedExtra;
  /** Short hair, long hair, headscarf, cap. */
  hairStyle: 0 | 1 | 2 | 3;
  /** Dress instead of trousers. */
  dress: boolean;
}

export const WALK_FRAMES = 8;

const SKINS = [0xf1ccac, 0xeab995, 0xd9a47a, 0xc78a63, 0x9b654a, 0x7a4a33];
const HAIRS = [0x2b211c, 0x4a3426, 0x765238, 0xc49a54, 0x1d1f24, 0x8c3a1e];
// Everyday, slightly muted clothing: navy, greys, denim, beige, olive, with a few brighter tops.
const TOPS = [0x2f3b4c, 0x6b7a8f, 0xe8e4da, 0x8c8c88, 0x3d4a3a, 0x7a3b2e, 0xb89a6a, 0x1f1f22, 0x4f6f8f, 0xa63d40, 0x5c4a72, 0x2e6b5a, 0xd9a441, 0xc0504d];
const BOTTOMS = [0x3b5578, 0x2b2f36, 0x5a5048, 0x8a7d62, 0x1f2124, 0x6d6f73, 0x44506a];
const UMBRELLAS = [0x1e88e5, 0xe53935, 0x43a047, 0xfdd835, 0x212121, 0x8e24aa];

/** Random but plausible look; `rain` hands most adults an umbrella. */
export function randomPedLook(rand: () => number, rain = false, who?: { kind: PedKind; woman: boolean }): PedLook {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const r = rand();
  const kind: PedKind = who?.kind ?? (r < 0.38 ? 'man' : r < 0.76 ? 'woman' : r < 0.9 ? 'child' : 'elder');
  const woman = who ? who.woman : kind === 'woman' || (kind !== 'man' && rand() < 0.5);
  const extras: PedExtra[] = kind === 'child'
    ? ['balloon', 'backpack', 'none', 'none']
    : kind === 'elder'
      ? ['cane', 'cane', 'bag', 'none', 'dog']
      : ['bag', 'backpack', 'phone', 'none', 'none', 'stroller', 'dog'];
  return {
    kind,
    skin: pick(SKINS),
    hair: kind === 'elder' ? (rand() < 0.7 ? 0xd9d9d9 : 0xb0b0b0) : pick(HAIRS),
    top: pick(TOPS),
    bottom: pick(BOTTOMS),
    shoes: rand() < 0.5 ? 0x2b2b2b : pick([0xffffff, 0x8d6e63, 0x5d4037]),
    extra: rain && kind !== 'child' && rand() < 0.75 ? 'umbrella' : pick(extras),
    hairStyle: woman ? (rand() < 0.22 ? 2 : 1) : rand() < 0.2 ? 3 : 0,
    dress: woman && kind !== 'elder' && rand() < 0.4,
  };
}

/**
 * Draws one figure at (0, 0) = feet. `frame` 0..7 is the stride; `dx`, `dy` the tile heading
 * (0, 0 = standing). Height is about 16 px for adults before the renderer's scale.
 */
export function drawPedestrian(g: Graphics, look: PedLook, frame: number, dx = 0, dy = 0, umbrellaColor = 0): void {
  g.clear();
  const moving = dx !== 0 || dy !== 0;
  // screen heading: right when x grows or y shrinks; back view when walking away (up the screen)
  const mirror = dx - dy < 0 ? -1 : 1;
  const back = moving && dx + dy < 0;
  // adult proportions: about 7.5 heads tall, legs half the height
  const s = look.kind === 'child' ? 0.64 : look.kind === 'elder' ? 0.95 : look.kind === 'woman' ? 0.95 : 1;
  const phase = ((frame % WALK_FRAMES) / WALK_FRAMES) * Math.PI * 2;
  const stride = moving ? Math.sin(phase) * (look.kind === 'elder' ? 1.1 : 1.9) : 0;
  const bob = moving ? Math.abs(Math.cos(phase)) * 0.45 : 0;
  const lean = look.kind === 'elder' ? 0.7 : 0;
  const X = (x: number): number => x * s * mirror;
  const Y = (y: number): number => y * s - bob;
  const hipY = -9.6, shoulderY = -15.2, headY = -17.5;

  g.ellipse(0, 0, 3.6 * s, 1.5 * s).fill({ color: COLORS.shadow, alpha: 0.28 });

  // things beside or behind the walker
  if (look.extra === 'stroller') {
    const ox = X(5.5);
    g.roundRect(ox - 3, Y(-7.5), 6, 4.2, 1.6).fill(0x37474f);
    g.ellipse(ox, Y(-7.4), 3.2, 2).fill(0x546e7a);
    for (const w of [-2.1, 2.1]) g.circle(ox + w, Y(-1.2), 1.2).fill(0x212121);
    g.moveTo(X(2.4), Y(-9.5)).lineTo(ox - 2.2 * mirror, Y(-8)).stroke({ color: 0x9e9e9e, width: 0.7 });
  }
  if (look.extra === 'dog') {
    const ox = X(-6) - mirror * stride * 0.3;
    g.ellipse(ox, Y(-2.6), 2.6, 1.3).fill(0x8d6e63);
    g.circle(ox + mirror * 2.3, Y(-3.8), 1.2).fill(0x8d6e63);
    for (const k of [-1.6, 1.3]) g.rect(ox + k, Y(-1.6), 0.6, 1.6).fill(0x6d4c41);
    g.moveTo(ox + mirror * 2.2, Y(-4)).lineTo(X(-2.3), Y(-9.6)).stroke({ color: 0xc62828, width: 0.45 });
  }
  if (look.extra === 'backpack' && !back) g.roundRect(X(-2.6) - (mirror < 0 ? 0 : 1.6 * s), Y(-15), 1.8 * s, 4.6 * s, 0.6).fill(shade(look.top, 0.55));

  // legs: thigh and shin swing in opposite phase, shoes point forward
  for (const [k, sign] of [[0, 1], [1, -1]] as const) {
    const hipX = X(k === 0 ? -0.85 : 0.85);
    const footX = hipX + stride * sign * mirror * 0.55 * s;
    const kneeX = (hipX + footX) / 2 + (moving ? Math.max(0, stride * sign) * 0.25 * mirror : 0);
    const color = k === 0 ? look.bottom : shade(look.bottom, 0.82);
    const legColor = look.dress ? look.skin : color;
    const w = (look.dress ? 1.1 : 1.6) * s;
    g.moveTo(hipX, Y(hipY)).lineTo(kneeX, Y(-4.8)).lineTo(footX, Y(-0.7)).stroke({ color: legColor, width: w, cap: 'round', join: 'round' });
    g.ellipse(footX + mirror * 0.5 * s, Y(-0.35), 1.2 * s, 0.6 * s).fill(look.shoes);
  }
  if (look.dress) g.poly([X(-2.6), Y(-4.6), X(2.6), Y(-4.6), X(1.9), Y(-11), X(-1.9), Y(-11)]).fill(shade(look.top, 0.92));

  // torso: shoulders wider than hips, shaded far side, belt line
  const L = lean * mirror;
  g.poly([X(-1.8) + L * 0.4, Y(hipY), X(1.8) + L * 0.4, Y(hipY), X(2.25) + L, Y(shoulderY), X(-2.25) + L, Y(shoulderY)]).fill(look.top);
  g.poly([X(0.4) + L * 0.6, Y(hipY), X(1.8) + L * 0.4, Y(hipY), X(2.25) + L, Y(shoulderY), X(0.5) + L, Y(shoulderY)]).fill({ color: 0x1b2630, alpha: 0.18 });
  if (!look.dress) g.moveTo(X(-1.8) + L * 0.4, Y(hipY + 0.4)).lineTo(X(1.8) + L * 0.4, Y(hipY + 0.4)).stroke({ color: shade(look.bottom, 0.6), width: 0.6 * s });
  if (look.extra === 'backpack' && back) g.roundRect(X(-1.9) - (mirror < 0 ? 3.8 * s : 0) + L, Y(-15), 3.8 * s, 4.8 * s, 0.9).fill(shade(look.top, 0.5));

  // arms with elbows, swinging against the legs; hands carry the accessory
  const sleeve = shade(look.top, 0.9);
  const arm = (side: number, swing: number, raise: number): [number, number] => {
    const sx = X(side * 2.1) + L, sy = Y(shoulderY + 0.4);
    const hx = X(side * 2.35) + swing * mirror * s + L * 0.5, hy = Y(-9.8 - raise);
    const ex = (sx + hx) / 2 + side * mirror * 0.25 * s, ey = (sy + hy) / 2;
    g.moveTo(sx, sy).lineTo(ex, ey).lineTo(hx, hy).stroke({ color: side < 0 ? sleeve : look.top, width: 1.1 * s, cap: 'round', join: 'round' });
    g.circle(hx, hy, 0.6 * s).fill(look.skin);
    return [hx, hy];
  };
  const [rx, ry] = arm(-1, -stride * 0.8, look.extra === 'bag' ? -0.2 : 0);
  const holding = look.extra === 'umbrella' || look.extra === 'phone' || look.extra === 'cane' || look.extra === 'balloon';
  const raise = look.extra === 'phone' ? 4.2 : look.extra === 'umbrella' || look.extra === 'balloon' ? 3.4 : 0;
  const [fx, fy] = arm(1, holding ? 0.3 : stride * 0.8, raise);
  if (look.extra === 'bag') {
    g.roundRect(rx - 1.3 * s, ry, 2.6 * s, 2.6 * s, 0.4).fill(0xf2efe8);
    g.moveTo(rx - 0.8 * s, ry).lineTo(rx, ry - 0.8 * s).lineTo(rx + 0.8 * s, ry).stroke({ color: 0xbdbdbd, width: 0.4 });
  }
  if (look.extra === 'phone') g.rect(fx - 0.45 * s, fy - 1.2 * s, 0.9 * s, 1.4 * s).fill(0x263238);
  if (look.extra === 'cane') g.moveTo(fx, fy).lineTo(fx + mirror * 1.2 * s, Y(0)).stroke({ color: 0x5d4037, width: 0.7 });

  // neck, head, hair; a face only when walking towards the camera
  const hx = X(0) + L * 1.3;
  const hy = Y(headY);
  g.rect(hx - 0.45 * s, Y(shoulderY - 0.9), 0.9 * s, 1.1 * s).fill(shade(look.skin, 0.9));
  g.ellipse(hx, hy, 1.3 * s, 1.55 * s).fill(look.skin);
  if (look.hairStyle === 2) {
    g.ellipse(hx, hy - 0.2 * s, 1.6 * s, 1.85 * s).fill(look.top === 0xe8e4da ? 0x90a4ae : shade(look.top, 1.12));
    g.poly([hx - 1.6 * s, hy + 0.6 * s, hx + 1.6 * s, hy + 0.6 * s, hx + 1.9 * s, hy + 2.6 * s, hx - 1.9 * s, hy + 2.6 * s]).fill(shade(look.top, 1.05));
    if (!back) g.ellipse(hx + mirror * 0.25 * s, hy + 0.25 * s, 1 * s, 1.15 * s).fill(look.skin);
  } else {
    g.ellipse(hx - mirror * (back ? 0 : 0.2 * s), hy - 0.75 * s, 1.35 * s, 0.85 * s).fill(look.hair);
    if (back) g.ellipse(hx, hy - 0.1 * s, 1.3 * s, 1.3 * s).fill(look.hair);
    if (look.hairStyle === 1) g.roundRect(hx - mirror * 1.3 * s - (mirror < 0 ? 0 : 0.9 * s), hy - 0.6 * s, 0.9 * s, 3 * s, 0.4).fill(look.hair);
    if (look.hairStyle === 3) {
      g.ellipse(hx, hy - 1.05 * s, 1.45 * s, 0.6 * s).fill(shade(look.top, 0.8));
      g.ellipse(hx + mirror * 1.2 * s, hy - 0.8 * s, 0.9 * s, 0.3 * s).fill(shade(look.top, 0.7));
    }
  }
  if (!back) {
    g.circle(hx + mirror * 0.55 * s, hy - 0.05 * s, 0.22 * s).fill(0x2b211c);
    g.circle(hx - mirror * 0.15 * s, hy - 0.05 * s, 0.22 * s).fill(0x2b211c);
  }

  // things held above the head
  if (look.extra === 'umbrella') {
    const ux = fx, uy = Y(-23);
    g.moveTo(fx, fy).lineTo(ux, uy).stroke({ color: 0x424242, width: 0.6 });
    const color = umbrellaColor || UMBRELLAS[Math.abs(look.top) % UMBRELLAS.length]!;
    g.poly([ux - 5.5 * s, uy + 1.8, ux, uy - 2, ux + 5.5 * s, uy + 1.8]).fill(color);
    g.ellipse(ux, uy + 1.8, 5.5 * s, 0.9).fill(shade(color, 0.75));
  }
  if (look.extra === 'balloon') {
    const bx = fx + mirror * 1.2, by = Y(-26);
    g.moveTo(fx, fy).lineTo(bx, by + 2.4).stroke({ color: 0x9e9e9e, width: 0.35 });
    g.ellipse(bx, by, 2, 2.4).fill([0xe53935, 0x1e88e5, 0xfdd835][Math.abs(look.hair) % 3]!);
  }
}
