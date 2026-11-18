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

type VehiclePoint = [number, number];

/** Isometric basis for a vehicle heading along (dx, dy) in tile space. */
function vehicleBasis(dx: number, dy: number): (length: number, width: number, height?: number) => VehiclePoint {
  const vx = dx - dy;
  const vy = (dx + dy) * 0.5;
  const mag = Math.hypot(vx, vy) || 1;
  const ux = vx / mag, uy = vy / mag;
  return (length, width, height = 0) => [ux * length - uy * width, uy * length + ux * width - height];
}

const tone = (base: number, amount: number): number => {
  const ch = (shift: number): number => Math.min(255, Math.max(0, Math.round(((base >> shift) & 255) * amount)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** Roof height of each service vehicle, where its light bar sits. */
export const SERVICE_ROOF: Record<'ambulance' | 'police', number> = { ambulance: 12.6, police: 9.4 };

/**
 * Ambulance (white box van, red stripe and cross) or police car (white with navy doors).
 * Same construction as drawCityCar so emergency vehicles sit in traffic at the same scale.
 */
export function drawServiceVehicle(g: Graphics, kind: 'ambulance' | 'police', dx = 1, dy = 0): void {
  if (kind === 'police') {
    drawCityCar(g, 0xf1f3f5, false, dx, dy);
    const p = vehicleBasis(dx, dy);
    const NAVY = 0x1f3f7a;
    // navy door panels on both flanks and a navy bonnet stripe
    for (const side of [-4.5, 4.5]) {
      g.poly([p(-4.6, side, 0.9), p(3.4, side, 0.9), p(3.4, side, 4.2), p(-4.6, side, 4.2)].flat())
        .fill(side > 0 ? NAVY : tone(NAVY, 0.8));
    }
    g.poly([p(6.4, -4.4, 4.35), p(8.2, -4.4, 4.35), p(8.2, 4.4, 4.35), p(6.4, 4.4, 4.35)].flat()).fill(NAVY);
    return;
  }
  const p = vehicleBasis(dx, dy);
  const poly = (points: VehiclePoint[], color: number): void => { g.poly(points.flat()).fill(color); };
  const WHITE = 0xf4f5f2;
  const RED = 0xd0342c;
  const L = 11.2, W = 4.9, H = 12.4, HOOD = 6.2;
  g.ellipse(0, 3.3, 12.6, 4.6).fill({ color: 0x0e1b24, alpha: 0.31 });
  for (const longitudinal of [-7.2, 7.4]) {
    for (const lateral of [-4.8, 4.8]) {
      const [x, y] = p(longitudinal, lateral, 0.8);
      g.ellipse(x, y, 2.3, 2.6).fill(0x171d22);
      g.ellipse(x, y, 0.9, 1.1).fill(0xadb8be);
    }
  }
  // Painter's order: far flank, far end, near flank, near end, roof.
  const flank = (side: number, shadeBy: number): void => {
    poly([p(-L, side), p(L, side), p(L, side, HOOD), p(6.4, side, H), p(-L, side, H)], tone(WHITE, shadeBy));
    poly([p(-L, side, 4.4), p(L, side, 4.4), p(L, side, 6), p(-L, side, 6)], tone(RED, shadeBy + 0.1));
    // cab window
    poly([p(6.6, side, 6.6), p(9.9, side, 6.6), p(7.2, side, 11.2), p(6.6, side, 11.2)], side > 0 ? 0x2a4760 : 0x3d5c73);
    // cross on the box
    poly([p(-3.6, side, 7.3), p(-2.2, side, 7.3), p(-2.2, side, 11.3), p(-3.6, side, 11.3)], RED);
    poly([p(-5, side, 8.6), p(-0.8, side, 8.6), p(-0.8, side, 10), p(-5, side, 10)], RED);
  };
  const rear = (): void => {
    poly([p(-L, -W), p(-L, W), p(-L, W, H), p(-L, -W, H)], tone(WHITE, 0.82));
    poly([p(-L, -W, 4.4), p(-L, W, 4.4), p(-L, W, 6), p(-L, -W, 6)], tone(RED, 0.9));
  };
  const front = (): void => {
    poly([p(L, -W), p(L, W), p(L, W, HOOD), p(L, -W, HOOD)], tone(WHITE, 0.95));
    poly([p(L, -W, HOOD), p(L, W, HOOD), p(6.4, W, H), p(6.4, -W, H)], 0x7bb2c9);
  };
  // The flank and the end that face the camera are the ones lower on screen.
  const nearSide = p(0, 1)[1] > 0 ? W : -W;
  const frontNear = p(1, 0)[1] > 0;
  flank(-nearSide, 0.72);
  if (frontNear) rear(); else front();
  flank(nearSide, 0.9);
  if (frontNear) front(); else rear();
  poly([p(-L, -W, H), p(6.4, -W, H), p(6.4, W, H), p(-L, W, H)], tone(WHITE, 1.06));
  for (const side of [-3.4, 3.4]) {
    const [hx, hy] = p(L + 0.1, side, 3.2);
    g.circle(hx, hy, 1.2).fill(0xfff3c0);
    const [tx, ty] = p(-L - 0.1, side, 3);
    g.circle(tx, ty, 1.05).fill(0xe84952);
  }
}

/**
 * Roof light bar. `phase` alternates the lit side; `active` adds the wide glow of a running
 * siren. Ambulances flash blue-blue, police cars red-blue.
 */
export function drawBeacon(
  g: Graphics, kind: 'ambulance' | 'police', dx: number, dy: number, phase: 0 | 1, active: boolean, night = 0,
): void {
  g.clear();
  const p = vehicleBasis(dx, dy);
  const z = SERVICE_ROOF[kind];
  const at = kind === 'ambulance' ? 4.2 : -0.4;
  const colors = kind === 'police' ? [0xff2d2d, 0x2f7bff] : [0x2f7bff, 0x2f7bff];
  g.poly([p(at - 0.9, -3.4, z), p(at + 0.9, -3.4, z), p(at + 0.9, 3.4, z), p(at - 0.9, 3.4, z)].flat()).fill(0x20262b);
  [-2, 2].forEach((side, i) => {
    const lit = !active || phase === i;
    const [x, y] = p(at, side, z + 1.1);
    const color = colors[i]!;
    if (active && lit) {
      g.circle(x, y, 7.5 + night * 3).fill({ color, alpha: 0.16 + night * 0.12 });
      g.circle(x, y, 4).fill({ color, alpha: 0.34 });
    }
    g.roundRect(x - 1.5, y - 1.2, 3, 2.4, 0.8).fill(lit ? color : tone(color, 0.38));
    if (active && lit) g.circle(x, y - 0.2, 0.8).fill(0xffffff);
  });
}
