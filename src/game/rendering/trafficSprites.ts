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
): void {
  const forwardX = dx - dy >= 0 ? 1 : -1;
  const forwardY = dx + dy >= 0 ? 1 : -1;
  g.ellipse(0, 1.5, 9.5, 4.4).fill({ color: COLORS.shadow, alpha: 0.24 });

  // Lower body shell
  g.poly([
    -8 * forwardX, -1.5,
    0, -5.5,
    8.5 * forwardX, -1,
    0, 3.2,
  ]).fill(paint);
  g.poly([
    -8 * forwardX, -1.5,
    0, 3.2,
    0, 5.2,
    -8 * forwardX, 0.7,
  ]).fill(shade(paint, 0.74));
  g.poly([
    0, 3.2,
    8.5 * forwardX, -1,
    8.5 * forwardX, 1.1,
    0, 5.2,
  ]).fill(shade(paint, 0.86));

  // Greenhouse / cabin roof and tinted windows
  g.poly([
    -4.2 * forwardX, -4.3,
    0.4 * forwardX, -6.9,
    4.9 * forwardX, -4.1,
    0, -1.7,
  ]).fill(shade(paint, 1.12));
  g.poly([
    -3.7 * forwardX, -3.9,
    0.3 * forwardX, -6.1,
    4.1 * forwardX, -3.8,
    0, -2.0,
  ]).fill({ color: 0x9bd3e6, alpha: 0.78 });

  // Wheels
  g.circle(-4.2, 2.2, 1.7).fill(0x1f252c);
  g.circle(4.2, 0.2, 1.7).fill(0x1f252c);

  // Headlights and taillights oriented with movement
  const noseX = 6.2 * forwardX;
  const noseY = forwardY > 0 ? 0.9 : -2.6;
  g.circle(noseX, noseY, 1.05).fill(0xfff5ba);
  g.circle(-noseX, -noseY, 0.95).fill(0xe23b3b);

  // Exterior detail: mirrors, door handles, tail reflectors, headlights and grille.
  // Each remains orientation-aware so vehicles keep their distinct front and rear.
  g.circle(-4.6 * forwardX, -3.4, 0.65).fill(0x313c48);
  g.circle(4.8 * forwardX, -3.2, 0.65).fill(0x313c48);
  g.roundRect(-3.1, -0.3, 2.1, 0.7, 0.3).fill(0xdfe6ea);
  g.roundRect(2.4, -1.1, 1.9, 0.7, 0.3).fill(0xdfe6ea);
  g.rect(6.6 * forwardX, -0.2, 1.2, 0.9).fill(0xcbd7df);
  g.circle(-6.3 * forwardX, 0.2, 0.65).fill(0xc84942);
  g.circle(5.5 * forwardX, -2.4, 0.55).fill(0xf8ecb3);
  if (electric) {
    g.circle(0, -4.4, 1.1).fill(0x3ad29f);
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