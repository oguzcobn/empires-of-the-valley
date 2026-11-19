import { Container, Graphics } from 'pixi.js';

/**
 * Night-time fireworks over a point of the city: rockets climb with a spark trail and burst
 * into coloured stars that fall and fade. Purely visual, driven by real time.
 */

const COLORS = [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xe040fb, 0xffffff, 0xff6e40];

interface Rocket {
  g: Graphics;
  x: number;
  y: number;
  top: number;
  age: number;
  burst: { vx: number; vy: number }[] | null;
  color: number;
  second: number;
}

export class Fireworks {
  private rockets: Rocket[] = [];
  private timer = 0;
  private rand = 0x1234567;

  constructor(private layer: Container) {}

  get count(): number {
    return this.rockets.length;
  }

  private random(): number {
    this.rand = (Math.imul(this.rand ^ (this.rand >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return this.rand / 0x100000000;
  }

  destroy(): void {
    for (const r of this.rockets) r.g.destroy();
    this.rockets = [];
  }

  /** Launches over world point (x, y) while `active`; existing bursts always finish. */
  update(active: boolean, x: number, y: number, dt: number): void {
    this.timer -= dt;
    if (active && this.timer <= 0 && this.rockets.length < 7) {
      this.timer = 420 + this.random() * 650;
      const g = new Graphics();
      g.zIndex = 1e6;
      this.layer.addChild(g);
      this.rockets.push({
        g, x: x + (this.random() - 0.5) * 90, y, top: 70 + this.random() * 60, age: 0, burst: null,
        color: COLORS[Math.floor(this.random() * COLORS.length)]!,
        second: COLORS[Math.floor(this.random() * COLORS.length)]!,
      });
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]!;
      r.age += dt;
      const g = r.g;
      g.clear();
      const climb = 900;
      if (r.age < climb) {
        const t = r.age / climb;
        const h = r.top * (1 - (1 - t) * (1 - t));
        g.circle(r.x, r.y - h, 1.6).fill(0xfff3c0);
        for (let k = 1; k < 6; k++) g.circle(r.x + Math.sin(k + r.age / 60) * 0.6, r.y - h + k * 3.2, 1.2 - k * 0.18).fill({ color: 0xffc46b, alpha: 0.8 - k * 0.14 });
        continue;
      }
      if (!r.burst) {
        const n = 26;
        r.burst = Array.from({ length: n }, (_, k) => {
          const a = (k / n) * Math.PI * 2 + this.random() * 0.2;
          const speed = 0.045 + this.random() * 0.03;
          return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
        });
      }
      const t = r.age - climb;
      const life = 1500;
      if (t > life) {
        g.destroy();
        this.rockets.splice(i, 1);
        continue;
      }
      const fade = 1 - t / life;
      const cx = r.x, cy = r.y - r.top;
      if (t < 160) g.circle(cx, cy, 14 * (1 - t / 160) + 2).fill({ color: 0xffffff, alpha: 0.5 * (1 - t / 160) });
      r.burst.forEach((s, k) => {
        const px = cx + s.vx * t;
        const py = cy + s.vy * t + 0.000018 * t * t;
        const color = k % 3 === 0 ? r.second : r.color;
        g.circle(px, py, 1.7 * fade + 0.4).fill({ color, alpha: fade });
        g.circle(px - s.vx * 60, py - s.vy * 60, 1 * fade).fill({ color, alpha: fade * 0.45 });
      });
    }
  }
}
