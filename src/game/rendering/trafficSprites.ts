import type { Graphics } from 'pixi.js';
import type { MatchDay } from '../data/matchDays';
import { COLORS } from './palette';
import { P, shade } from './iso';
import type { Pt } from './iso';

/**
 * Compact isometric vehicle drawn in local screen space around (0, 0).
 * Heading is expressed in tile-grid deltas: (+x, -x, +y, -y).
 */
export function drawCityCar(
  g: Graphics,
  paint: number,
  electric: boolean,
  dx: number,
  dy: number,
  variant = 0,
): void {
  const forwardX = dx - dy >= 0 ? 1 : -1;
  const forwardY = dx + dy >= 0 ? 1 : -1;
  const kind = Math.abs(variant) % 5;
  const roofColor = shade(paint, 1.1);
  const sideColor = shade(paint, 0.74);
  const noseColor = shade(paint, 0.88);
  const glass = 0x9bd3e6;
  const tyre = 0x1f252c;
  const rim = 0xa7b3c0;

  const spec = [
    { tail: 8.4, nose: 8.8, width: 4.6, roofTail: 3.6, roofNose: 4.7, roofY: -4.4, roofPeak: -7.0, cabinInset: 0.1 },
    { tail: 7.7, nose: 7.9, width: 4.8, roofTail: 2.7, roofNose: 3.7, roofY: -4.0, roofPeak: -6.5, cabinInset: 0.3 },
    { tail: 8.9, nose: 8.7, width: 5.1, roofTail: 4.3, roofNose: 4.8, roofY: -4.9, roofPeak: -7.6, cabinInset: 0.1 },
    { tail: 9.2, nose: 8.5, width: 5.2, roofTail: 5.0, roofNose: 5.1, roofY: -5.2, roofPeak: -7.2, cabinInset: 0.2 },
    { tail: 8.8, nose: 8.3, width: 4.9, roofTail: 1.9, roofNose: 3.7, roofY: -3.8, roofPeak: -6.5, cabinInset: 0.2 },
  ][kind]!;

  const tailX = -spec.tail * forwardX;
  const noseX = spec.nose * forwardX;
  const shoulderY = 3.4;
  const sillY = 5.5;

  g.ellipse(0, 1.8, spec.tail + 2.1, spec.width + 0.75).fill({ color: COLORS.shadow, alpha: 0.24 });

  // Main body shell
  g.poly([
    tailX, -1.3,
    0, -5.9,
    noseX, -1,
    0, shoulderY,
  ]).fill(paint);
  g.poly([
    tailX, -1.3,
    0, shoulderY,
    0, sillY,
    tailX, 0.7,
  ]).fill(sideColor);
  g.poly([
    0, shoulderY,
    noseX, -1,
    noseX, 1.25,
    0, sillY,
  ]).fill(noseColor);

  // Bumpers / rocker panels
  g.poly([
    tailX * 0.96, 0.5,
    -1.8 * forwardX, 4.25,
    -1.5 * forwardX, 4.95,
    tailX * 0.98, 1.25,
  ]).fill(0x313841);
  g.poly([
    1.5 * forwardX, 4.3,
    noseX * 0.95, 0.95,
    noseX * 0.95, 1.55,
    1.6 * forwardX, 5.0,
  ]).fill(0x39414a);

  if (kind === 4) {
    // Pickup bed
    g.poly([
      -7.5 * forwardX, -0.5,
      -2.4 * forwardX, -3.1,
      -0.7 * forwardX, -0.7,
      -5.8 * forwardX, 1.8,
    ]).fill(0x2d3136);
    g.poly([
      -7.1 * forwardX, -0.2,
      -2.5 * forwardX, -2.5,
      -2.5 * forwardX, -1.9,
      -6.8 * forwardX, 0.25,
    ]).fill(shade(paint, 0.92));
  }

  const roofTail = -spec.roofTail * forwardX;
  const roofNose = spec.roofNose * forwardX;
  g.poly([
    roofTail, spec.roofY,
    spec.cabinInset * forwardX, spec.roofPeak,
    roofNose, spec.roofY + (kind === 3 ? -0.2 : 0.25),
    0, -1.75,
  ]).fill(roofColor);

  // Windows / greenhouse
  g.poly([
    (roofTail + 0.8 * forwardX), spec.roofY + 0.45,
    0.2 * forwardX, spec.roofPeak + 0.9,
    (roofNose - 0.8 * forwardX), spec.roofY + 0.55,
    0, -2.0,
  ]).fill({ color: glass, alpha: 0.82 });
  g.moveTo((-0.1) * forwardX, spec.roofPeak + 0.65).lineTo(0, -2.05).stroke({ color: 0xd7f3fb, alpha: 0.45, width: 0.7 });
  if (kind !== 3) {
    g.moveTo((-2.0) * forwardX, -3.65).lineTo((-0.4) * forwardX, -2.35).stroke({ color: shade(glass, 0.8), width: 0.7 });
    g.moveTo((2.0) * forwardX, -3.5).lineTo((0.4) * forwardX, -2.3).stroke({ color: shade(glass, 0.8), width: 0.7 });
  }

  // Roof details / racks depending on type
  if (kind === 2 || kind === 3) {
    g.moveTo(-2.2 * forwardX, spec.roofY - 0.2).lineTo(-0.4 * forwardX, spec.roofPeak + 0.3).stroke({ color: 0xcbd5e1, width: 0.8 });
    g.moveTo(0.5 * forwardX, spec.roofPeak + 0.2).lineTo(2.2 * forwardX, spec.roofY - 0.15).stroke({ color: 0xcbd5e1, width: 0.8 });
  }
  if (electric) {
    g.roundRect(-1.2, spec.roofPeak - 0.8, 2.4, 1.6, 0.6).fill(0x3ad29f);
  }

  // Wheel arches and wheels
  const rearWheel = kind === 3 ? -4.9 : -4.4;
  const frontWheel = kind === 3 ? 4.8 : 4.3;
  for (const [wx, wy] of [[rearWheel, 2.35], [frontWheel, 0.25]] as const) {
    g.circle(wx, wy, kind === 2 || kind === 3 ? 1.85 : 1.7).fill(tyre);
    g.circle(wx, wy, 0.82).fill(rim);
  }

  // Mirrors / grille / door lines
  g.circle(5.3 * forwardX, -0.95, 0.35).fill(0xdfe7ef);
  g.circle(-5.3 * forwardX, 0.55, 0.35).fill(0x4e5761);
  g.moveTo(-0.4 * forwardX, -2.1).lineTo(-0.1 * forwardX, 3.9).stroke({ color: shade(paint, 0.6), width: 0.7, alpha: 0.55 });
  g.moveTo(-6.0 * forwardX, -0.3).lineTo(-0.2 * forwardX, -3.45).stroke({ color: shade(paint, 1.18), width: 0.6, alpha: 0.5 });
  g.moveTo(0.2 * forwardX, -3.45).lineTo(6.0 * forwardX, -0.3).stroke({ color: shade(paint, 1.18), width: 0.6, alpha: 0.5 });

  // Lights
  const noseLightY = forwardY > 0 ? 0.95 : -2.6;
  const tailLightY = -noseLightY + 0.05;
  g.circle(6.3 * forwardX, noseLightY, 1.05).fill(0xfff5ba);
  g.circle(5.3 * forwardX, noseLightY - 0.15 * forwardY, 0.45).fill(0xe8dcc1);
  g.circle(-6.2 * forwardX, tailLightY, 0.95).fill(0xe23b3b);
  g.circle(-5.4 * forwardX, tailLightY + 0.12 * forwardY, 0.38).fill(0xffb38c);

  // Type accents to make each vehicle silhouette distinct.
  if (kind === 1) {
    g.moveTo(1.2 * forwardX, -2.25).lineTo(4.4 * forwardX, -0.95).stroke({ color: 0x1f252c, width: 0.8, alpha: 0.45 });
  } else if (kind === 2) {
    g.roundRect(-7.0, -0.15, 2.5, 0.72, 0.25).fill(0x2a2e33);
    g.roundRect(4.2, -1.65, 2.0, 0.72, 0.25).fill(0x2a2e33);
  } else if (kind === 3) {
    g.roundRect(-6.8, -0.1, 12.9, 0.7, 0.25).fill(0x3a4149);
    g.moveTo(-1.8 * forwardX, -4.2).lineTo(-1.8 * forwardX, 3.6).stroke({ color: 0x7ea3b4, width: 0.7, alpha: 0.5 });
    g.moveTo(1.8 * forwardX, -4.2).lineTo(1.8 * forwardX, 3.1).stroke({ color: 0x7ea3b4, width: 0.7, alpha: 0.5 });
  } else if (kind === 4) {
    g.moveTo(-3.0 * forwardX, -2.9).lineTo(-5.6 * forwardX, -1.6).stroke({ color: 0xd7dde3, width: 0.75 });
  }
}

/** Dedicated silhouettes and signage for emergency and service traffic. */
export function drawServiceVehicle(
  g: Graphics,
  service: 'ambulance' | 'patrol' | 'delivery',
  dx: number,
  dy: number,
): void {
  const forwardX = dx - dy >= 0 ? 1 : -1;
  if (service === 'ambulance') {
    drawCityCar(g, 0xf5f7f5, false, dx, dy, 3);
    g.roundRect(-6.4, -7.0, 12.8, 1.6, 0.4).fill(0xd6303f);
    g.rect(-1.1, -10.3, 2.2, 5.1).fill(0xd6303f);
    g.rect(-3.4, -8.7, 6.8, 1.8).fill(0xd6303f);
    g.roundRect(-3.2, -9.7, 6.4, 1.2, 0.4).fill(0xfafafa);
    g.circle(-2.2 * forwardX, -9.3, 1.0).fill(0x2083da);
    g.circle(2.2 * forwardX, -9.3, 1.0).fill(0xe83b42);
  } else if (service === 'patrol') {
    drawCityCar(g, 0x285084, false, dx, dy, 2);
    g.roundRect(-6.1, -1.0, 12.2, 1.35, 0.35).fill(0xf2f5f9);
    g.roundRect(-4.6, -2.0, 8.7, 1.4, 0.35).fill(0x1b365b);
    g.roundRect(-3.8, -8.9, 7.6, 1.25, 0.3).fill(0x333f4e);
    g.rect(-3.4, -8.7, 3.2, 0.95).fill(0x2e7bff);
    g.rect(0.2, -8.7, 3.2, 0.95).fill(0xf23a42);
  } else {
    drawCityCar(g, 0xb98749, false, dx, dy, 3);
    g.poly([-6.9, -6.7, -2.1, -9.6, 4.1, -6.8, -0.8, -4.1]).fill(0xe5d7bd);
    g.poly([-6.9, -6.7, -0.8, -4.1, -0.8, 0.8, -6.9, -2.3]).fill(0xc5aa7b);
    g.moveTo(-6.2, -3.9).lineTo(-1.6, -6.4).stroke({ color: 0x937750, width: 0.8 });
    g.roundRect(-4.8, -4.2, 2.6, 1.3, 0.35).fill(0xf4ead8);
  }
}

/**
 * Detailed isometric Fire Truck (İtfaiye Arabası) with 6 wheels, fire-engine red body,
 * white reflective stripe, chrome front grille, coiled side hoses, rotatable white roof
 * extension ladder, water cannon monitor, and dual emergency beacons.
 */
export function drawFireTruck(g: Graphics, dx: number, dy: number): void {
  const ang = Math.atan2(dy || 0, dx || 1);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const rot = (u: number, v: number, z = 0): Pt => P(u * c - v * s, u * s + v * c, z);
  const poly = (pts: Pt[], color: number, alpha = 1): void => {
    g.poly(pts.flat()).fill({ color, alpha });
  };

  // Ground shadow
  g.ellipse(0, 2, 14.5, 6.8).fill({ color: COLORS.shadow, alpha: 0.3 });

  const red = 0xd62828;
  const darkRed = 0x9e1b1b;
  const lightRed = 0xef4444;
  const white = 0xf8fafc;
  const chrome = 0xcbd5e1;
  const shutter = 0x94a3b8;

  // Rear pump & tank body (u from -0.34 to 0.08, v from -0.14 to 0.14, z from 2 to 13)
  const u0 = -0.34, u1 = 0.08, v0 = -0.14, v1 = 0.14;
  poly([rot(u0, v0, 2), rot(u1, v0, 2), rot(u1, v0, 13), rot(u0, v0, 13)], darkRed);
  poly([rot(u0, v1, 2), rot(u1, v1, 2), rot(u1, v1, 13), rot(u0, v1, 13)], red);
  poly([rot(u0, v0, 2), rot(u0, v1, 2), rot(u0, v1, 13), rot(u0, v0, 13)], shade(darkRed, 0.85));
  poly([rot(u1, v0, 2), rot(u1, v1, 2), rot(u1, v1, 13), rot(u1, v0, 13)], darkRed);
  poly([rot(u0, v0, 13), rot(u1, v0, 13), rot(u1, v1, 13), rot(u0, v1, 13)], lightRed);

  // Silver equipment roll-up shutters & yellow hose reels on sides
  for (const sideV of [v0 - 0.005, v1 + 0.005]) {
    poly([rot(-0.28, sideV, 4.5), rot(-0.14, sideV, 4.5), rot(-0.14, sideV, 10.5), rot(-0.28, sideV, 10.5)], shutter);
    poly([rot(-0.1, sideV, 4.5), rot(0.03, sideV, 4.5), rot(0.03, sideV, 10.5), rot(-0.1, sideV, 10.5)], shutter);
    const hosePt = rot(-0.21, sideV, 7.5);
    g.circle(hosePt[0], hosePt[1], 1.6).fill(0xfacc15);
  }

  // Crew cab in front (u from 0.08 to 0.30, v from -0.135 to 0.135, z from 2 to 14)
  const cu0 = 0.08, cu1 = 0.30, cv0 = -0.135, cv1 = 0.135;
  poly([rot(cu0, cv0, 2), rot(cu1, cv0, 2), rot(cu1, cv0, 14), rot(cu0, cv0, 14)], darkRed);
  poly([rot(cu0, cv1, 2), rot(cu1, cv1, 2), rot(cu1, cv1, 14), rot(cu0, cv1, 14)], red);
  poly([rot(cu1, cv0, 2), rot(cu1, cv1, 2), rot(cu1, cv1, 14), rot(cu1, cv0, 14)], shade(red, 0.9));
  poly([rot(cu0, cv0, 14), rot(cu1, cv0, 14), rot(cu1, cv1, 14), rot(cu0, cv1, 14)], white);

  // White reflective emergency stripe along the full length
  for (const sideV of [v0 - 0.006, v1 + 0.006]) {
    poly([rot(u0, sideV, 3.2), rot(cu1, sideV, 3.2), rot(cu1, sideV, 4.6), rot(u0, sideV, 4.6)], white);
  }

  // Front windshield & chrome radiator grille + bumper
  poly([rot(cu1 + 0.005, cv0 + 0.02, 8), rot(cu1 + 0.005, cv1 - 0.02, 8), rot(cu1 + 0.005, cv1 - 0.02, 13), rot(cu1 + 0.005, cv0 + 0.02, 13)], 0x1e293b);
  poly([rot(cu1 + 0.006, cv0 + 0.03, 3), rot(cu1 + 0.006, cv1 - 0.03, 3), rot(cu1 + 0.006, cv1 - 0.03, 7), rot(cu1 + 0.006, cv0 + 0.03, 7)], chrome);

  // 6 heavy-duty tires (front axle + tandem rear axles)
  for (const wu of [-0.26, -0.10, 0.20]) {
    for (const wv of [v0 - 0.01, v1 + 0.01]) {
      const wp = rot(wu, wv, 2);
      g.circle(wp[0], wp[1], 2.3).fill(0x18181b);
      g.circle(wp[0], wp[1], 1.0).fill(chrome);
    }
  }

  // Turntable & white extension ladder (merdiven) mounted on top of the fire truck
  const basePt = rot(-0.24, 0, 13.5);
  g.ellipse(basePt[0], basePt[1], 4.2, 2.2).fill(0x475569);
  const l0L = rot(-0.30, -0.05, 14.5);
  const l1L = rot(0.24, -0.05, 17.5);
  const l0R = rot(-0.30, 0.05, 14.5);
  const l1R = rot(0.24, 0.05, 17.5);
  g.moveTo(l0L[0], l0L[1]).lineTo(l1L[0], l1L[1]).stroke({ color: white, width: 1.8 });
  g.moveTo(l0R[0], l0R[1]).lineTo(l1R[0], l1R[1]).stroke({ color: white, width: 1.8 });
  for (let t = 0.1; t <= 0.9; t += 0.16) {
    const u = -0.30 + (0.24 - -0.30) * t;
    const z = 14.5 + (17.5 - 14.5) * t;
    const rA = rot(u, -0.05, z);
    const rB = rot(u, 0.05, z);
    g.moveTo(rA[0], rA[1]).lineTo(rB[0], rB[1]).stroke({ color: 0xe2e8f0, width: 1.1 });
  }

  // Roof water cannon nozzle at the tip of the ladder
  const nozzle = rot(0.25, 0, 18);
  g.circle(nozzle[0], nozzle[1], 1.6).fill(0x38bdf8);
}

/**
 * Football supporter in team jersey with waving team flag, scarf, and raised flare arm.
 */
export function drawFootballSupporter(g: Graphics, match: MatchDay, variant = 0): void {
  const skin = [0xeab995, 0xc78a63, 0xf1ccac, 0x9b654a][Math.abs(variant) % 4]!;
  const hair = [0x372a24, 0x765238, 0x252a30, 0x8b5e3c][Math.abs(variant + 1) % 4]!;
  g.ellipse(0.5, 0, 5.2, 2.4).fill({ color: COLORS.shadow, alpha: 0.28 });

  // Legs & shoes in marching stride
  const stride = (variant % 2 === 0 ? 1 : -1) * 0.9;
  g.roundRect(-2.6, -4.4 + stride * 0.4, 2.1, 4.2, 0.55).fill(0x283240);
  g.roundRect(0.7, -4.4 - stride * 0.4, 2.1, 4.2, 0.55).fill(0x1f2833);
  g.ellipse(-1.5, -0.4 + stride * 0.4, 1.5, 0.85).fill(0x1c1c1e);
  g.ellipse(2, -0.4 - stride * 0.4, 1.5, 0.85).fill(0x1c1c1e);

  // Jersey torso + vertical team stripe
  g.roundRect(-3.8, -10.8, 7.6, 7.6, 1.6).fill(match.jersey);
  g.rect(-1.2, -10.8, 2.4, 7.6).fill(match.stripe);
  g.rect(-3.6, -10.8, 1.1, 7.6).fill(match.stripe);
  g.rect(2.5, -10.8, 1.1, 7.6).fill(match.stripe);

  // Team scarf around neck with trailing ends
  g.roundRect(-4.1, -11.3, 8.2, 2.1, 0.9).fill(match.scarf);
  g.rect(-2.0, -11.3, 1.6, 2.1).fill(match.stripe);
  g.rect(0.8, -11.3, 1.6, 2.1).fill(match.stripe);
  g.rect(2.2, -9.8, 1.7, 3.6).fill(match.scarf);

  // Left arm raised high holding a team flag pole; right arm raised holding a burning flare
  g.moveTo(-3.3, -9.8).lineTo(-5.4, -14.2).stroke({ color: match.jersey, width: 2.1, cap: 'round' });
  g.moveTo(3.3, -9.8).lineTo(5.2, -14.8).stroke({ color: match.jersey, width: 2.1, cap: 'round' });
  g.circle(-5.4, -14.4, 1.1).fill(skin);
  g.circle(5.2, -15.0, 1.1).fill(skin);

  // Head & team cap/beanie
  g.ellipse(0, -12.8, 3.1, 3.6).fill(skin);
  g.ellipse(-0.5, -14.6, 3.0, 1.6).fill(variant % 2 === 0 ? match.jersey : hair);
  if (variant % 2 === 0) {
    g.ellipse(0, -15.2, 2.2, 1.0).fill(match.stripe);
  }
  g.circle(1, -12.9, 0.4).fill(0x2b211a);
  g.circle(-1, -12.9, 0.4).fill(0x2b211a);
}

/**
 * Animated supporter flare AND waving team-colored banner flag with dense billowing smoke!
 */
export function drawSupporterFlare(
  g: Graphics,
  time: number,
  phase = 0,
  jerseyColor = 0x7b1e3a,
  stripeColor = 0x38a3d8,
): void {
  g.clear();
  const pulse = 1 + Math.sin(time / 65 + phase) * 0.28;
  const wave1 = Math.sin(time / 110 + phase) * 2.4;
  const wave2 = Math.cos(time / 95 + phase * 1.3) * 3.1;

  // 1. Tall waving team flag on the left hand (-5.4, -14.4)
  g.moveTo(-5.4, -12).lineTo(-5.4, -29).stroke({ color: 0xd6c7b2, width: 1.4 });
  // Flag cloth in team jersey & stripe colors
  g.poly([
    -5.4, -28.5,
    -13.5, -27.2 + wave1,
    -19.5, -24.8 + wave2,
    -19.5, -17.5 + wave2,
    -13.5, -19.2 + wave1,
    -5.4, -20.2,
  ]).fill(jerseyColor);
  // Diagonal / horizontal team stripe on the flag
  g.poly([
    -5.4, -25.8,
    -13.5, -24.5 + wave1,
    -19.5, -22.2 + wave2,
    -19.5, -19.8 + wave2,
    -13.5, -21.8 + wave1,
    -5.4, -23.0,
  ]).fill(stripeColor);
  // Gold finial at top of flagpole
  g.circle(-5.4, -29.2, 1.1).fill(0xfacc15);

  // 2. Burning stadium flare in the right hand (5.2, -15.0)
  g.roundRect(4.5, -17.6, 1.5, 3.2, 0.4).fill(0xc0392b);
  // Intense outer crimson/orange glow + white-hot core
  g.circle(5.2, -18.4, 5.8 * pulse).fill({ color: 0xff2a1f, alpha: 0.34 });
  g.circle(5.2, -18.4, 3.6 * pulse).fill({ color: 0xff7b29, alpha: 0.65 });
  g.circle(5.2, -18.4, 1.9 * pulse).fill(0xfff7c2);

  // 3. Heavy, billowing multi-puff smoke plume rising high above the flare (fazlaca duman)
  for (let i = 0; i < 6; i++) {
    const age = ((time / 240 + phase + i * 0.55) % 3.3) / 3.3;
    const driftX = 5.2 + Math.sin(time / 180 + phase + i * 1.4) * (2.5 + age * 7.5) + age * 3.5;
    const liftY = -20 - age * 28;
    const rad = 2.8 + age * 6.8;
    const smokeCol = i % 3 === 0 ? jerseyColor : i % 3 === 1 ? stripeColor : 0xe2e8f0;
    g.circle(driftX, liftY, rad).fill({ color: smokeCol, alpha: Math.max(0.08, (1 - age * 0.82) * 0.52) });
  }
}