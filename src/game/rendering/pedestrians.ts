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
const TOPS = [0xc0392b, 0x2e86c1, 0x27ae60, 0x8e44ad, 0xf39c12, 0x34495e, 0xd35400, 0x16a085, 0xecf0f1, 0xe84393, 0x6c5ce7, 0x795548];
const BOTTOMS = [0x2c3e50, 0x34495e, 0x4b4b4b, 0x5d4037, 0x1e3a5f, 0x8d8d8d, 0x3e2723];
const UMBRELLAS = [0x1e88e5, 0xe53935, 0x43a047, 0xfdd835, 0x212121, 0x8e24aa];

/** Random but plausible look; `rain` hands most adults an umbrella. */
export function randomPedLook(rand: () => number, rain = false): PedLook {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const r = rand();
  const kind: PedKind = r < 0.38 ? 'man' : r < 0.76 ? 'woman' : r < 0.9 ? 'child' : 'elder';
  const woman = kind === 'woman' || (kind !== 'man' && rand() < 0.5);
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
  const sx = dx - dy;
  const mirror = sx < 0 ? -1 : 1;
  const back = moving && dx + dy < 0;
  const s = look.kind === 'child' ? 0.72 : look.kind === 'elder' ? 0.95 : 1;
  const phase = (frame % WALK_FRAMES) / WALK_FRAMES * Math.PI * 2;
  const swing = moving ? Math.sin(phase) * (look.kind === 'elder' ? 1.1 : 1.8) : 0;
  const bob = moving ? Math.abs(Math.cos(phase)) * 0.7 : 0;
  const X = (x: number): number => x * s * mirror;
  const Y = (y: number): number => y * s - bob;

  g.ellipse(0, 0, 4.4 * s, 1.9 * s).fill({ color: COLORS.shadow, alpha: 0.26 });

  // accessories that sit behind the body
  if (look.extra === 'stroller') {
    const ox = X(6.5);
    g.roundRect(ox - 3.5, Y(-8), 7, 5, 2).fill(0x37474f);
    g.ellipse(ox, Y(-8), 3.8, 2.4).fill(0x546e7a);
    for (const w of [-2.4, 2.4]) g.circle(ox + w, Y(-1.4), 1.4).fill(0x212121);
    g.moveTo(X(2.5), Y(-8)).lineTo(ox - 2.5 * mirror, Y(-9.5)).stroke({ color: 0x9e9e9e, width: 0.8 });
  }
  if (look.extra === 'dog') {
    const ox = X(-7) - mirror * swing * 0.4;
    g.ellipse(ox, Y(-3), 3, 1.6).fill(0x8d6e63);
    g.circle(ox + mirror * 2.6, Y(-4.4), 1.4).fill(0x8d6e63);
    for (const k of [-1.8, 1.5]) g.rect(ox + k, Y(-2), 0.7, 2).fill(0x6d4c41);
    g.moveTo(ox + mirror * 2.4, Y(-4.6)).lineTo(X(-2.5), Y(-7)).stroke({ color: 0xc62828, width: 0.5 });
  }
  if (look.extra === 'backpack' && !back) g.roundRect(X(-3.6) - (mirror < 0 ? 0 : 2.2), Y(-10.6), 2.4, 5.4, 0.8).fill(shade(look.top, 0.6));

  // legs: two strides in opposite phase, shoes
  const legTop = -5.2;
  for (const [k, sign] of [[0, 1], [1, -1]] as const) {
    const off = swing * sign;
    const x = X(k === 0 ? -1.2 : 1.2) + off * mirror * 0.6;
    const color = k === 0 ? look.bottom : shade(look.bottom, 0.8);
    if (!look.dress) {
      g.moveTo(X(k === 0 ? -1.2 : 1.2), Y(legTop)).lineTo(x, Y(-0.8)).stroke({ color, width: 2 * s, cap: 'round' });
    } else {
      g.moveTo(X(k === 0 ? -0.9 : 0.9), Y(-3.6)).lineTo(x, Y(-0.8)).stroke({ color: look.skin, width: 1.2 * s, cap: 'round' });
    }
    g.ellipse(x + mirror * 0.6, Y(-0.4), 1.4 * s, 0.75 * s).fill(look.shoes);
  }
  if (look.dress) g.poly([X(-3.2), Y(-3.4), X(3.2), Y(-3.4), X(2.4), Y(-8.6), X(-2.4), Y(-8.6)]).fill(shade(look.top, 0.9));

  // torso with a shaded side and, for the elderly, a slight stoop
  const lean = look.kind === 'elder' ? 0.8 : 0;
  g.roundRect(X(-3.3) - (mirror < 0 ? 6.6 * s : 0) + lean * mirror, Y(-11.6), 6.6 * s, 6.8 * s, 1.6).fill(look.top);
  g.poly([X(0.4) + lean * mirror, Y(-11.6), X(3.3) + lean * mirror, Y(-10.8), X(3.3) + lean * mirror, Y(-4.9), X(0.4) + lean * mirror, Y(-4.9)])
    .fill({ color: 0x1b2630, alpha: 0.2 });
  if (look.extra === 'backpack' && back) g.roundRect(X(-2.6) - (mirror < 0 ? 5.2 * s : 0), Y(-11.2), 5.2 * s, 5.6 * s, 1.2).fill(shade(look.top, 0.55));

  // arms swing against the legs; accessories in hand
  const handY = Y(-6);
  const rear = X(-3.4) - mirror * swing * 0.7;
  const front = X(3.4) + mirror * swing * 0.7;
  g.moveTo(X(-3), Y(-10.6)).lineTo(rear, handY).stroke({ color: look.top, width: 1.7 * s, cap: 'round' });
  g.circle(rear, handY, 0.9 * s).fill(look.skin);
  const holding = look.extra === 'umbrella' || look.extra === 'phone' || look.extra === 'cane' || look.extra === 'balloon';
  const fx = holding ? X(3.2) : front;
  const fy = look.extra === 'phone' ? Y(-9) : look.extra === 'umbrella' || look.extra === 'balloon' ? Y(-9.5) : handY;
  g.moveTo(X(3), Y(-10.6)).lineTo(fx, fy).stroke({ color: shade(look.top, 0.85), width: 1.7 * s, cap: 'round' });
  g.circle(fx, fy, 0.9 * s).fill(look.skin);
  if (look.extra === 'bag') {
    g.roundRect(rear - 1.8, handY, 3.6, 3.4, 0.6).fill(0xf5f5f5);
    g.moveTo(rear - 1.1, handY).lineTo(rear, handY - 1.1).lineTo(rear + 1.1, handY).stroke({ color: 0xbdbdbd, width: 0.5 });
  }
  if (look.extra === 'phone') g.rect(fx - 0.7, fy - 1.6, 1.4, 2.2).fill(0x263238);
  if (look.extra === 'cane') g.moveTo(fx, fy).lineTo(fx + mirror * 1.4, Y(0)).stroke({ color: 0x5d4037, width: 0.9 });

  // head, hair and face (face only when walking towards the camera)
  const hx = X(0) + lean * mirror * 1.4;
  const hy = Y(-14);
  g.ellipse(hx, hy, 2.9 * s, 3.3 * s).fill(look.skin);
  if (look.hairStyle === 2) {
    g.ellipse(hx, hy - 0.4, 3.3 * s, 3.7 * s).fill(look.top === 0xecf0f1 ? 0x90a4ae : shade(look.top, 1.15));
    if (!back) g.ellipse(hx + mirror * 0.4, hy + 0.4, 2.1 * s, 2.4 * s).fill(look.skin);
  } else {
    g.ellipse(hx - mirror * (back ? 0 : 0.5), hy - 1.6 * s, 2.9 * s, 1.7 * s).fill(look.hair);
    if (back) g.ellipse(hx, hy - 0.4, 2.8 * s, 2.6 * s).fill(look.hair);
    if (look.hairStyle === 1) g.roundRect(hx - mirror * 2.8 * s - (mirror < 0 ? 0 : 1.6), hy - 1.4, 1.8 * s, 5 * s, 0.8).fill(look.hair);
    if (look.hairStyle === 3) {
      g.ellipse(hx, hy - 2.2 * s, 3.1 * s, 1.4 * s).fill(shade(look.top, 0.8));
      g.ellipse(hx + mirror * 2.4 * s, hy - 1.6 * s, 1.8 * s, 0.6 * s).fill(shade(look.top, 0.7));
    }
  }
  if (!back) {
    g.circle(hx + mirror * 1.2 * s, hy - 0.1, 0.38).fill(0x2b211c);
    g.circle(hx - mirror * 0.4 * s, hy - 0.1, 0.38).fill(0x2b211c);
  }

  // things above the head
  if (look.extra === 'umbrella') {
    const ux = fx, uy = Y(-20);
    g.moveTo(fx, fy).lineTo(ux, uy).stroke({ color: 0x424242, width: 0.7 });
    const color = umbrellaColor || UMBRELLAS[Math.abs(look.top) % UMBRELLAS.length]!;
    g.poly([ux - 7.5 * s, uy + 2.2, ux, uy - 2.6, ux + 7.5 * s, uy + 2.2]).fill(color);
    g.ellipse(ux, uy + 2.2, 7.5 * s, 1.2).fill(shade(color, 0.75));
  }
  if (look.extra === 'balloon') {
    const bx = fx + mirror * 1.5, by = Y(-23);
    g.moveTo(fx, fy).lineTo(bx, by + 3).stroke({ color: 0x9e9e9e, width: 0.4 });
    g.ellipse(bx, by, 2.6, 3.1).fill([0xe53935, 0x1e88e5, 0xfdd835][Math.abs(look.hair) % 3]!);
  }
}
