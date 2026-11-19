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
export const MOTORBIKE = 9;
export const BICYCLE = 10;
export const GARBAGE = 11;
export const ICE_CREAM = 12;
export const PLOUGH = 13;
export const MODEL_COUNT = 14;

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

/** Rider sitting upright over (u, 0): legs, torso, arms to the bars, helmet or hair. */
function rider(f: Frame, g: Graphics, u: number, seat: number, shirt: number, helmet: number | null): void {
  const [hx, hy] = f.point(u, 0, seat);
  g.moveTo(hx, hy).lineTo(...f.point(u + 0.06, f.near * 0.03, 2.5)).stroke({ color: 0x2c3e50, width: 1.6, cap: 'round' });
  g.roundRect(hx - 1.8, hy - 6.5, 3.6, 6.5, 1.2).fill(shirt);
  const [bx, by] = f.point(u + 0.14, 0, seat + 4.2);
  g.moveTo(hx, hy - 4.5).lineTo(bx, by).stroke({ color: shirt, width: 1.3, cap: 'round' });
  g.circle(hx, hy - 8.6, 2.1).fill(0xe0ac69);
  if (helmet !== null) g.ellipse(hx, hy - 9.4, 2.5, 1.9).fill(helmet);
  else g.ellipse(hx, hy - 9.8, 2.1, 1.1).fill(0x3b2a1e);
}

/** Scooter-style motorbike with a helmeted rider. */
export function drawMotorbike(g: Graphics, dx: number, dy: number, paint: number): void {
  const f = frame(g, dx, dy);
  g.ellipse(0, 1.6, 9, 3).fill({ color: COLORS.shadow, alpha: 0.28 });
  for (const u of [-0.2, 0.2]) {
    f.circle(u, 0, 2.2, 2.2, 0x19212b);
    f.circle(u, 0, 2.2, 1, 0xb8c2c9);
  }
  f.face([[-0.24, -0.04, 3], [0.16, -0.04, 3], [0.16, 0.04, 3], [-0.24, 0.04, 3]], 0x2f3a40);
  f.face([[-0.24, f.near * 0.05, 3], [0.02, f.near * 0.05, 3], [0.02, f.near * 0.05, 7], [-0.24, f.near * 0.05, 6]], paint);
  f.face([[0.14, f.near * 0.04, 3], [0.2, f.near * 0.04, 3], [0.16, f.near * 0.04, 10], [0.12, f.near * 0.04, 10]], shade(paint, 0.85));
  f.line([0.15, -0.08, 10], [0.15, 0.08, 10], 0x222222, 1);
  f.circle(0.21, 0, 7.5, 1, 0xfff5c7);
  rider(f, g, -0.08, 7.5, shade(paint, 0.7), 0xf5f5f5);
}

/** Bicycle with a rider, the slowest thing on the street. */
export function drawBicycle(g: Graphics, dx: number, dy: number, shirt: number): void {
  const f = frame(g, dx, dy);
  g.ellipse(0, 1.4, 8, 2.4).fill({ color: COLORS.shadow, alpha: 0.24 });
  for (const u of [-0.17, 0.17]) {
    const [x, y] = f.point(u, 0, 2.6);
    g.circle(x, y, 2.6).stroke({ color: 0x222222, width: 0.9 });
  }
  f.line([-0.17, 0, 2.6], [0, 0, 2.6], 0x1e88e5, 0.9);
  f.line([0, 0, 2.6], [0.14, 0, 7.5], 0x1e88e5, 0.9);
  f.line([-0.17, 0, 2.6], [-0.06, 0, 7], 0x1e88e5, 0.9);
  f.line([-0.06, 0, 7], [0.12, 0, 7], 0x1e88e5, 0.9);
  f.line([0.17, 0, 2.6], [0.14, 0, 7.5], 0x1e88e5, 0.9);
  rider(f, g, -0.06, 7.5, shirt, null);
}

/** Municipal refuse truck with a ribbed compactor body and an orange beacon. */
export function drawGarbageTruck(g: Graphics, dx: number, dy: number): void {
  drawLorry(g, dx, dy, 0x9e9e9e, 0xf5f5f5);
  const f = frame(g, dx, dy);
  for (let u = -0.5; u < 0.18; u += 0.12) f.line([u, f.near * 0.181, 4], [u, f.near * 0.181, 18], 0x7a7a7a, 0.8);
  f.face([[-0.3, f.near * 0.182, 8], [0.0, f.near * 0.182, 8], [0.0, f.near * 0.182, 12], [-0.3, f.near * 0.182, 12]], 0x2e7d32);
  f.circle(0.42, 0, 14.6, 1.2, 0xff9800);
}

/** Ice-cream van with a cone on the roof and a pastel body. */
export function drawIceCreamVan(g: Graphics, dx: number, dy: number): void {
  drawCityCar(g, 0xfce4ec, false, dx, dy, 3);
  const f = frame(g, dx, dy);
  for (const v of [-0.17, 0.17]) f.face([[-0.35, v, 4], [0.1, v, 4], [0.1, v, 6.5], [-0.35, v, 6.5]], 0x4fc3f7);
  const [x, y] = f.point(-0.05, 0, 16.5);
  g.poly([x - 2.2, y, x + 2.2, y, x, y + 5]).fill(0xd7a35c);
  g.circle(x, y - 0.6, 2.4).fill(0xf8bbd0);
  g.circle(x, y - 2.6, 1.6).fill(0xfff9c4);
}

/** Orange gritter with a front blade, salt hopper and amber beacons. */
export function drawSnowPlough(g: Graphics, dx: number, dy: number): void {
  drawLorry(g, dx, dy, 0xff8f00, 0xff8f00);
  const f = frame(g, dx, dy);
  f.face([[0.66, -0.26, 0.5], [0.66, 0.26, 0.5], [0.62, 0.26, 5], [0.62, -0.26, 5]], 0xffc400);
  f.face([[0.62, -0.26, 5], [0.62, 0.26, 5], [0.58, 0.26, 5.6], [0.58, -0.26, 5.6]], 0x9e9e9e);
  for (const v of [-0.1, 0.1]) f.circle(0.4, v, 14.6, 1.1, 0xffab00);
  for (let k = 0; k < 6; k++) f.circle(-0.62 - k * 0.04, (k % 3 - 1) * 0.08, 1, 0.5, 0xffffff);
}

/** Paints one ambient-traffic model: 0-5 car bodies, then taxi, bus, lorry and the rest. */
export function drawTrafficVehicle(
  g: Graphics, model: number, paint: number, electric: boolean, dx: number, dy: number, culture: 'scottish' | 'turkish' | string = 'turkish',
): void {
  if (model === PLOUGH) drawSnowPlough(g, dx, dy);
  else if (model === MOTORBIKE) drawMotorbike(g, dx, dy, paint);
  else if (model === BICYCLE) drawBicycle(g, dx, dy, paint);
  else if (model === GARBAGE) drawGarbageTruck(g, dx, dy);
  else if (model === ICE_CREAM) drawIceCreamVan(g, dx, dy);
  else if (model === TAXI) drawTaxi(g, dx, dy);
  else if (model === BUS) drawBus(g, dx, dy, culture === 'scottish' ? 0x7a1f2b : 0x1d6fb8, Math.abs(paint) % 9);
  else if (model === LORRY) drawLorry(g, dx, dy, [0x2e7d32, 0xc62828, 0x1565c0, 0xef6c00][Math.abs(paint) % 4]!, shade(paint, 0.9));
  else drawCityCar(g, paint, electric, dx, dy, model);
}

/**
 * Model for the n-th ambient vehicle: mostly cars, with taxis, a bus, lorries, two-wheelers and,
 * at their hours, the morning refuse round and the summer ice-cream van.
 */
export function trafficModel(n: number, seed: number, roads: number, hour = 12, season = 'summer', snowing = false, depot = false): number {
  if (n === 0 && (snowing || season === 'winter') && hour >= 5 && hour < 11) return PLOUGH;
  if (n === 1 && hour >= 6 && hour < 9) return GARBAGE;
  if (n === 2 && season === 'summer' && hour >= 12 && hour < 19) return ICE_CREAM;
  if (roads >= 16 && n % 9 === 4) return BUS;
  // a staffed bus depot puts a second and third line on the streets
  if (depot && roads >= 12 && (n % 9 === 8 || n % 9 === 0) && n > 0 && hour >= 6 && hour < 23) return BUS;
  if (n % 7 === 5) return LORRY;
  if (n % 5 === 2) return TAXI;
  if (n % 6 === 3) return MOTORBIKE;
  if (n % 8 === 7 && hour >= 7 && hour < 20 && season !== 'winter') return BICYCLE;
  return Math.abs(seed + n) % 6;
}

/** Relative cruising speed of a model (cars = 1). */
export function modelSpeed(model: number): number {
  if (model === BICYCLE) return 0.45;
  if (model === BUS || model === LORRY || model === GARBAGE || model === PLOUGH) return 0.62;
  if (model === MOTORBIKE) return 1.15;
  if (model === ICE_CREAM) return 0.55;
  return 1;
}

/** Length class used for following distance: 0 small, 1 car, 2 long. */
export const modelLength = (model: number): number =>
  model === MOTORBIKE || model === BICYCLE ? 0 : model === BUS || model === LORRY || model === GARBAGE || model === PLOUGH ? 2 : 1;

/**
 * Narrow-body airliner in the vehicle frame: fuselage with a window line, swept wings with
 * engines, tailplane and fin in the airline livery. About 1.7 tiles long. `lit` adds
 * navigation and landing lights.
 */
export function drawAirliner(g: Graphics, dx: number, dy: number, livery: number, lit = false): void {
  const f = frame(g, dx, dy);
  const R = 0.075; // fuselage half width
  const Z = 6; // belly height on the gear
  const white = 0xf4f6f7;
  // far wing and tailplane first, then the fuselage, then the near ones
  const wing = (side: number): void => {
    f.face([[0.18, side * R, Z + 3], [-0.12, side * R, Z + 3], [-0.36, side * 0.82, Z + 5], [-0.22, side * 0.82, Z + 5]], shade(0xd5dadd, side === f.near ? 1 : 0.82));
    const ex = 0.02, ev = side * 0.32;
    f.face([[ex + 0.12, ev - 0.035, Z + 1.2], [ex - 0.1, ev - 0.035, Z + 1.2], [ex - 0.1, ev + 0.035, Z + 1.2], [ex + 0.12, ev + 0.035, Z + 1.2]], 0x9aa3aa);
    f.face([[ex + 0.12, ev + f.near * 0.035, Z + 1.2], [ex - 0.1, ev + f.near * 0.035, Z + 1.2], [ex - 0.1, ev + f.near * 0.035, Z + 3.4], [ex + 0.12, ev + f.near * 0.035, Z + 3.4]], 0xb8c0c6);
    f.circle(ex + 0.12, ev, Z + 2.3, 1.3, 0x3a4248);
    f.face([[-0.6, side * R, Z + 6], [-0.72, side * R, Z + 6], [-0.8, side * 0.3, Z + 7], [-0.72, side * 0.3, Z + 7]], shade(0xd5dadd, 0.9));
    if (lit) f.circle(-0.3, side * 0.82, Z + 5, 1.1, side > 0 ? 0x33ff66 : 0xff3344);
  };
  wing(-f.near);
  // fuselage: belly, far flank, near flank, crown; nose and tail cones
  const N = 0.85, T = -0.82;
  f.face([[T, -R, Z + 1], [N - 0.1, -R, Z], [N - 0.1, R, Z], [T, R, Z + 1]], 0xb9c0c5);
  for (const side of [-f.near, f.near]) {
    const near = side === f.near;
    f.face([[T + 0.04, side * R, Z + 2], [N - 0.1, side * R, Z], [N - 0.1, side * R, Z + 7], [T, side * R, Z + 9]], shade(white, near ? 0.96 : 0.78));
    f.face([[T + 0.04, side * R, Z + 2], [N - 0.1, side * R, Z], [N - 0.1, side * R, Z + 1.6], [T + 0.04, side * R, Z + 3.2]], shade(livery, near ? 0.9 : 0.7));
    if (near) {
      for (let u = -0.6; u < 0.62; u += 0.075) f.circle(u, side * R * 1.02, Z + 4.6 + (0.62 - u) * -0.4, 0.55, lit ? 0xffe8a0 : 0x2b3a46);
      f.face([[0.5, side * R * 1.01, Z + 1], [0.56, side * R * 1.01, Z + 1], [0.56, side * R * 1.01, Z + 5], [0.5, side * R * 1.01, Z + 5]], shade(white, 0.85));
    }
  }
  f.face([[T, -R, Z + 9], [N - 0.1, -R, Z + 7], [N - 0.1, R, Z + 7], [T, R, Z + 9]], shade(white, 1.08));
  const nose: V3 = [N + 0.06, 0, Z + 3];
  f.face([[N - 0.1, -R, Z], [N - 0.1, -R, Z + 7], nose], shade(white, 0.85));
  f.face([[N - 0.1, R, Z], [N - 0.1, R, Z + 7], nose], shade(white, 0.92));
  f.face([[N - 0.1, -R, Z + 7], [N - 0.1, R, Z + 7], nose], shade(white, 1.05));
  f.face([[N - 0.04, f.near * R * 0.8, Z + 5.2], [N - 0.1, f.near * R * 0.9, Z + 6.6], [N - 0.1, -f.near * R * 0.2, Z + 6.6]], 0x22313c);
  // fin in livery with a white logo disc
  f.face([[T + 0.18, 0, Z + 9], [T + 0.02, 0, Z + 9], [T - 0.06, 0, Z + 21], [T + 0.04, 0, Z + 21]], livery);
  f.circle(T + 0.06, 0, Z + 14, 1.5, white);
  wing(f.near);
  // landing gear
  for (const [u, v] of [[0.62, 0], [-0.08, -R * 0.8], [-0.08, R * 0.8]] as const) f.line([u, v, 0], [u, v, Z], 0x3b3b3b, 0.9);
  if (lit) {
    f.circle(T - 0.02, 0, Z + 21.5, 1, 0xffffff);
    f.circle(0, 0, Z - 0.5, 1, 0xff3344);
  }
}

/**
 * Headlights after dark: two bright lamps on the nose and a small, faint pool of light on the
 * road just ahead. Kept short and soft so it never reads as a stripe across the street.
 */
export function drawHeadlights(g: Graphics, dx: number, dy: number, front = 0.4): void {
  g.clear();
  const ux = dx || (dy ? 0 : 1);
  const uy = dy;
  const at = (u: number, v: number, z = 0): Pt => P(u * ux - v * uy, u * uy + v * ux, z);
  const [px, py] = at(front + 0.26, 0, 0.4);
  g.ellipse(px, py, 7, 3.2).fill({ color: 0xfff2b0, alpha: 0.1 });
  g.ellipse(px, py, 4, 1.8).fill({ color: 0xfff7d0, alpha: 0.12 });
  for (const v of [-0.1, 0.1]) {
    const [x, y] = at(front, v, 3.6);
    g.circle(x, y, 1.1).fill({ color: 0xfffbe6, alpha: 0.95 });
  }
}
