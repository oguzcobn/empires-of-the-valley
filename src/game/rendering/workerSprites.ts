import type { GraphicsContext } from 'pixi.js';
import { shade } from './iso';

export type WorkerJob = 'farming' | 'logging' | 'quarrying';
export type WorkerPose = 'walk' | 'work' | 'carry';
export const WORKER_FRAMES = 10;

const clothes: Record<WorkerJob, [number, number]> = {
  farming: [0xc8aa56, 0x739467],
  logging: [0xb15d40, 0x815e48],
  quarrying: [0x8299ab, 0x687b93],
};

/** Original side-lit worker with articulated legs and tools, anchored at the boots. */
export function drawWorker(g: GraphicsContext, job: WorkerJob, pose: WorkerPose, frame: number, variant: number): void {
  const phase = frame / WORKER_FRAMES;
  const walking = pose !== 'work';
  const stride = walking ? Math.sin(phase * Math.PI * 2) : 0;
  const swing = walking ? 0 : Math.sin(phase * Math.PI) ** 2;
  const lean = swing * (job === 'farming' ? 2.6 : 1.5);
  const lift = walking ? Math.abs(stride) * 0.65 : -swing * 0.9;
  const tunic = clothes[job][variant]!;
  const skin = variant ? 0xb07b56 : 0xe0af83;
  const hair = variant ? 0x2d2423 : 0x593c2d;
  const belt = 0x524034;
  const wood = 0x93714d;
  const steel = 0xb6c1c5;

  const limb = (x: number, y: number, endX: number, endY: number, color: number, width: number): void => {
    g.moveTo(x, y).lineTo(endX, endY).stroke({ color, width, cap: 'round' });
  };

  g.ellipse(0, 0.4, 4.5, 1.7).fill({ color: 0x18231a, alpha: 0.25 });
  const farFoot = 1.5 - stride * 2.7;
  const nearFoot = -1.15 + stride * 2.7;
  limb(1, -5 - lift, farFoot, -0.9 - Math.max(0, -stride), 0x384049, 2);
  limb(-1, -5 - lift, nearFoot, -0.9 - Math.max(0, stride), 0x5a5c57, 2.3);
  g.ellipse(farFoot + 0.5, -0.5 - Math.max(0, -stride), 1.45, 0.72).fill(0x302622);
  g.ellipse(nearFoot + 0.5, -0.5 - Math.max(0, stride), 1.55, 0.78).fill(0x48342b);

  const shoulderY = -11.1 - lift;
  const handX = pose === 'work' ? 3.7 + swing * 3.6 : pose === 'carry' ? 4.8 : 2 + stride * 2.3;
  const handY = pose === 'work' ? -12.4 + swing * 8.6 : pose === 'carry' ? -7.9 - lift : -5.8 - lift;
  limb(lean + 0.7, shoulderY + 0.8, handX + 0.2, handY + 0.4, shade(tunic, 0.65), 1.8);
  g.poly([lean - 2.8, shoulderY, lean + 2.1, shoulderY, 2.7, -4.8 - lift, -3.1, -4.8 - lift]).fill(shade(tunic, 0.77));
  g.poly([lean - 2.8, shoulderY, lean + 0.6, shoulderY, 0.1, -4.8 - lift, -3.1, -4.8 - lift]).fill(tunic);
  limb(-2.6, -5.65 - lift, 2.45, -5.65 - lift, belt, 0.9);
  g.circle(0.25, -5.6 - lift, 0.55).fill(0xbfa06e);
  g.ellipse(lean + 0.25, shoulderY - 2, 2.45, 2.85).fill(skin);
  g.ellipse(lean - 0.6, shoulderY - 3.55, 2, 1.7).fill(hair);
  g.circle(lean + 1.45, shoulderY - 2.25, 0.31).fill(0x413028);
  if (job === 'farming') {
    g.ellipse(lean + 0.1, shoulderY - 3.65, 3.35, 0.8).fill(0xcdab69);
    g.roundRect(lean - 1.6, shoulderY - 5.3, 3.4, 1.7, 0.6).fill(0xdab97b);
  } else if (job === 'quarrying') {
    g.arc(lean, shoulderY - 2.85, 2.5, Math.PI, Math.PI * 2).fill(0xd1bd91);
  }

  if (pose === 'carry') {
    if (job === 'logging') {
      limb(0, -9.7 - lift, 8.3, -8.1 - lift, 0x6b4832, 3.5);
      limb(0, -10.2 - lift, 7.8, -8.6 - lift, wood, 1);
      g.ellipse(8.1, -8.1 - lift, 1.1, 1.6).fill(0xd2a575);
    } else {
      g.poly([2, -10 - lift, 6, -11 - lift, 8, -8 - lift, 4, -7 - lift]).fill(job === 'farming' ? 0xe9c468 : steel);
    }
  } else {
    const angle = pose === 'work' ? -2.12 + swing * 2.13 : -1.12 + stride * 0.18;
    const tx = handX + Math.cos(angle) * 5.4;
    const ty = handY + Math.sin(angle) * 5.4;
    limb(handX - Math.cos(angle) * 2, handY - Math.sin(angle) * 2, tx, ty, wood, 1);
    const sideX = -Math.sin(angle);
    const sideY = Math.cos(angle);
    const blade = job === 'logging' ? 1.5 : 2.2;
    limb(tx - sideX * blade, ty - sideY * blade, tx + sideX * blade, ty + sideY * blade, steel, job === 'logging' ? 2.4 : 1.15);
    if (pose === 'work' && swing > 0.91) {
      const chip = job === 'quarrying' ? 0xe5e3d4 : job === 'logging' ? 0xe7bf83 : 0xf2d189;
      g.circle(tx + 2.5, ty - 1.6, 0.65).circle(tx + 3.5, ty + 0.2, 0.48).fill(chip);
    }
  }
  limb(lean - 1.6, shoulderY + 0.95, handX, handY, tunic, 2.15);
  g.circle(handX, handY, 0.98).fill(skin);
}
