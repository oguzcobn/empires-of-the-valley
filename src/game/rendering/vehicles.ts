import type { Graphics } from 'pixi.js';
import { COLORS } from './palette';
import { P, shade } from './iso';
import type { Pt } from './iso';
import { drawCityCar } from './trafficSprites';

/**
 * Larger street vehicles: city buses, lorries and taxis. Built like drawCityCar from shaded
 * faces in the vehicle's own frame (u forward, v to the side, z up), but painted far-to-near
 * for every heading so the body never shows its hidden side.
 */

type V3 = [number, number, number];

/** Traffic model ids: 0-5 are drawCityCar body styles, then the vehicles of this module. */
export const TAXI = 6;
export const BUS = 7;
export const LORRY = 8;
export const MODEL_COUNT = 9;

interface Frame {
  point(u: number, v: number, z?: number): Pt;
  face(coords: V3[], color: number, alpha?: number): void;
  line(a: V3, b: V3, color: number, width?: number): void;
  circle(u: number, v: number, z: number, r: number, color: number): void;
  /** +1 when the +v flank faces the camera, else -1. */
  near: number;
  /** True when the front (+u) end faces the camera. */
  frontNear: boolean;
}

function frame(g: Graphics, dx: number, dy: number): Frame {
  const ux = dx || (dy ? 0 : 1);
  const uy = dy;
  const point = (u: number, v: number, z = 0): Pt => P(u * ux - v * uy, u * uy + v * ux, z);
  return {
    point,
    face(coords, color, alpha = 1) {
      g.poly(coords.flatMap(([u, v, z]) => point(u, v, z))).fill({ color, alpha });
    },
    line(a, b, color, width = 0.8) {
      const p0 = point(...a), p1 = point(...b);
      g.moveTo(p0[0], p0[1]).lineTo(p1[0], p1[1]).stroke({ color, width, cap: 'round' });
    },
    circle(u, v, z, r, color) {
      const [x, y] = point(u, v, z);
      g.circle(x, y, r).fill(color);
    },
    near: point(0, 1)[1] > point(0, -1)[1] ? 1 : -1,
    frontNear: point(1, 0)[1] > point(-1, 0)[1],
  };
}

/** A box from u0..u1, half-width w, z0..z1 with correct face order; `sides` paints extra detail per flank. */
function body(
  f: Frame, u0: number, u1: number, w: number, z0: number, z1: number, color: number,
  sides?: (v: number, lit: boolean) => void, ends?: (u: number) => void,
): void {
  const far = -f.near * w, near = f.near * w;
  const flank = (v: number, k: number): void => {
    f.face([[u0, v, z0], [u1, v, z0], [u1, v, z1], [u0, v, z1]], shade(color, k));
    sides?.(v, v === near);
  };
  const end = (u: number, k: number): void => {
    f.face([[u, -w, z0], [u, w, z0], [u, w, z1], [u, -w, z1]], shade(color, k));
    ends?.(u);
  };
  flank(far, 0.7);
  end(f.frontNear ? u0 : u1, 0.8);
  flank(near, 0.9);
  end(f.frontNear ? u1 : u0, 0.95);
  f.face([[u0, -w, z1], [u1, -w, z1], [u1, w, z1], [u0, w, z1]], shade(color, 1.12));
}

function wheels(f: Frame, axles: number[], w: number, r: number): void {
  for (const u of axles) for (const v of [-w, w]) {
    f.circle(u, v * 0.98, r, r, 0x19212b);
    f.circle(u, v * 0.98, r, r * 0.5, 0xb8c2c9);
  }
}

/** Articulated-look city bus with a window band, doors, route display and roof units. */
export function drawBus(g: Graphics, dx: number, dy: number, livery: number, route = 7): void {
  const f = frame(g, dx, dy);
  const L = 0.66, W = 0.19, top = 18;
  g.ellipse(0, 3.4, 26, 8).fill({ color: COLORS.shadow, alpha: 0.3 });
  wheels(f, [-0.42, 0.44], W, 2.8);
  const glass = 0x2d4a5e;
  body(f, -L, L, W, 1.6, top, 0xf1f3f2, (v, lit) => {
    // livery skirt and stripe, window band, doors on the kerb side
    f.face([[-L, v, 1.6], [L, v, 1.6], [L, v, 6.5], [-L, v, 6.5]], shade(livery, lit ? 0.95 : 0.75));
    f.face([[-L + 0.05, v, 8], [L - 0.14, v, 8], [L - 0.14, v, 15.5], [-L + 0.05, v, 15.5]], lit ? glass : shade(glass, 0.8));
    for (let u = -L + 0.2; u < L - 0.15; u += 0.22) f.line([u, v, 8], [u, v, 15.5], 0xe6e9e8, 0.9);
    for (const u of [0.38, -0.05]) f.face([[u, v, 1.8], [u + 0.14, v, 1.8], [u + 0.14, v, 15.5], [u, v, 15.5]], lit ? 0x22323d : 0x1a262f);
    f.line([-L, v, 16.6], [L, v, 16.6], livery, 1.4);
  }, (u) => {
    if (u > 0) {
      f.face([[u, -W * 0.9, 7], [u, W * 0.9, 7], [u, W * 0.9, 16], [u, -W * 0.9, 16]], 0x6a95ad);
      f.face([[u, -W * 0.7, 16.4], [u, W * 0.7, 16.4], [u, W * 0.7, 17.6], [u, -W * 0.7, 17.6]], 0x111111);
      for (const v of [-W * 0.7, W * 0.7]) f.circle(u, v, 4, 1.1, 0xfff5c7);
      const [x, y] = f.point(u, 0, 17);
      g.rect(x - 1.6, y - 0.6, 3.2, 1.2).fill(route % 2 ? 0xffb300 : 0x8bf28b);
    } else {
      for (const v of [-W * 0.7, W * 0.7]) f.circle(u, v, 5, 1, 0xe44b4b);
    }
  });
  // roof air-conditioning pod
  const z = top;
  f.face([[-0.2, -W * 0.6, z], [0.22, -W * 0.6, z], [0.22, W * 0.6, z], [-0.2, W * 0.6, z]], 0xd4d9dc);
  f.face([[-0.2, -W * 0.6, z + 2], [0.22, -W * 0.6, z + 2], [0.22, W * 0.6, z + 2], [-0.2, W * 0.6, z + 2]], 0xe8ecee);
}

/** Box lorry: cab with windscreen and a liveried cargo box. */
export function drawLorry(g: Graphics, dx: number, dy: number, cargo: number, cab: number): void {
  const f = frame(g, dx, dy);
  const W = 0.18;
  g.ellipse(0, 3.2, 22, 7).fill({ color: COLORS.shadow, alpha: 0.3 });
  wheels(f, [-0.44, -0.26, 0.42], W, 2.6);
  const boxFirst = !f.frontNear;
  const cargoBox = (): void => body(f, -0.58, 0.22, W, 2.6, 19, 0xf2f2ee, (v, lit) => {
    f.face([[-0.55, v, 6], [0.19, v, 6], [0.19, v, 15], [-0.55, v, 15]], shade(cargo, lit ? 1 : 0.78));
    f.line([-0.55, v, 16.5], [0.19, v, 16.5], shade(cargo, 0.7), 1);
  }, (u) => {
    if (u < 0) for (const v of [-W * 0.75, W * 0.75]) f.circle(u, v, 4, 1, 0xe44b4b);
  });
  const cabin = (): void => body(f, 0.25, 0.58, W, 2.2, 14, cab, (v, lit) => {
    f.face([[0.3, v, 8], [0.5, v, 8], [0.5, v, 12.8], [0.3, v, 12.8]], lit ? 0x2d4a5e : 0x22394a);
  }, (u) => {
    if (u > 0.4) {
      f.face([[u, -W * 0.88, 7.5], [u, W * 0.88, 7.5], [u, W * 0.88, 12.8], [u, -W * 0.88, 12.8]], 0x7bb2c9);
      f.face([[u, -W * 0.7, 3], [u, W * 0.7, 3], [u, W * 0.7, 5.5], [u, -W * 0.7, 5.5]], 0x333a45);
      for (const v of [-W * 0.75, W * 0.75]) f.circle(u, v, 4.2, 1.1, 0xfff5c7);
    }
  });
  if (boxFirst) { cabin(); cargoBox(); } else { cargoBox(); cabin(); }
}

/** Yellow taxi with a lit roof sign. */
export function drawTaxi(g: Graphics, dx: number, dy: number): void {
  drawCityCar(g, 0xf2c200, false, dx, dy, 0);
  const f = frame(g, dx, dy);
  f.face([[-0.08, -0.07, 12.6], [0.08, -0.07, 12.6], [0.08, 0.07, 12.6], [-0.08, 0.07, 12.6]], 0x222222);
  f.face([[-0.08, f.near * 0.07, 12.6], [0.08, f.near * 0.07, 12.6], [0.08, f.near * 0.07, 15], [-0.08, f.near * 0.07, 15]], 0xfff1a8);
  f.face([[-0.08, -0.07, 15], [0.08, -0.07, 15], [0.08, 0.07, 15], [-0.08, 0.07, 15]], 0xfffbe0);
  // chequer strip on the doors
  for (const v of [-0.155, 0.155]) for (let k = 0; k < 6; k++) {
    const u = -0.2 + k * 0.07;
    if (k % 2) f.face([[u, v, 5.6], [u + 0.07, v, 5.6], [u + 0.07, v, 6.8], [u, v, 6.8]], 0x111111);
  }
}

/** Paints one ambient-traffic model: 0-5 car bodies, then taxi, bus and lorry. */
export function drawTrafficVehicle(
  g: Graphics, model: number, paint: number, electric: boolean, dx: number, dy: number, culture: 'scottish' | 'turkish' | string = 'turkish',
): void {
  if (model === TAXI) drawTaxi(g, dx, dy);
  else if (model === BUS) drawBus(g, dx, dy, culture === 'scottish' ? 0x7a1f2b : 0x1d6fb8, Math.abs(paint) % 9);
  else if (model === LORRY) drawLorry(g, dx, dy, [0x2e7d32, 0xc62828, 0x1565c0, 0xef6c00][Math.abs(paint) % 4]!, shade(paint, 0.9));
  else drawCityCar(g, paint, electric, dx, dy, model);
}

/** Model for the n-th ambient vehicle: mostly cars, with taxis, a bus and lorries mixed in. */
export function trafficModel(n: number, seed: number, roads: number): number {
  if (roads >= 16 && n % 9 === 4) return BUS;
  if (n % 7 === 5) return LORRY;
  if (n % 5 === 2) return TAXI;
  return Math.abs(seed + n) % 6;
}
