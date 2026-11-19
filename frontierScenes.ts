import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { GameState, MapPoint, Province, TransitCargo, TransitKind, TransitLine } from '../core/types';
import { TICKS_PER_DAY } from '../core/time';
import { HEIGHT_PX } from '../data/balance';
import { tileAt } from '../systems/grid';
import { shipment, wildlife } from '../systems/frontier';
import type { Animal } from '../systems/frontier';
import type { AnimalKind } from '../systems/frontier';
import { isoX, isoY } from './iso';
import { drawVillager } from './sprites';

const CARGO_COLOR: Record<TransitCargo, number> = {
  passengers: 0xf2d38b, stone: 0xa5a9ad, wood: 0xb18657, food: 0xe7ae48, tools: 0x869daf,
};

const height = (p: Province, point: MapPoint): number => (tileAt(p, point.x, point.y)?.height ?? 0) * HEIGHT_PX;

function place(g: Graphics, p: Province, a: MapPoint, b = a, t = 0, lift = 0): void {
  const x = a.x + (b.x - a.x) * t + 0.5;
  const y = a.y + (b.y - a.y) * t + 0.5;
  g.position.set(isoX(x, y), isoY(x, y) - height(p, a) * (1 - t) - height(p, b) * t - lift);
  g.zIndex = x + y + (lift ? 100 : 0.09);
}

function along(route: MapPoint[], progress: number): [MapPoint, MapPoint, number] {
  const pos = Math.min(route.length - 1, Math.max(0, progress));
  const i = Math.floor(pos);
  const a = route[i]!;
  return [a, route[i + 1] ?? a, pos - i];
}

function animal(g: Graphics, kind: AnimalKind): void {
  const deer = kind === 'deer';
  const hare = kind === 'hare';
  const body = hare ? 0xc7b297 : deer ? 0xb78251 : 0x8b6655;
  const w = hare ? 5 : 8;
  const h = hare ? 4 : deer ? 7 : 5;
  g.ellipse(0, 1, w + 2, 3).fill({ color: 0x25231d, alpha: 0.26 });
  for (const x of [-w / 2, w / 2]) {
    g.moveTo(x - 1, -h).lineTo(x - 1.4, 0).stroke({ width: 1.35, color: 0x594539 });
    g.moveTo(x + 1, -h).lineTo(x + 1.3, 1).stroke({ width: 1.25, color: 0x835e47 });
  }
  g.ellipse(0, -h, w, h * 0.61).fill(body);
  g.ellipse(-1.2, -h - 1.5, w * 0.67, h * 0.31).fill({ color: 0xf3d6ae, alpha: 0.43 });
  g.ellipse(w * 0.82, -h * (deer ? 1.62 : 1.13), 3.7, hare ? 2.7 : 3.2).fill(body);
  g.circle(w + 0.6, -h * (deer ? 1.73 : 1.24), 0.62).fill(0x322320);
  if (deer) {
    for (const x of [5, 8]) g.moveTo(x, -13).lineTo(x - 0.9, -19).lineTo(x - 2.6, -21)
      .moveTo(x - 0.9, -19).lineTo(x + 2.1, -21).stroke({ color: 0xd6c0a1, width: 1 });
  } else if (hare) {
    g.ellipse(w * 0.6, -8, 1, 3.35).ellipse(w * 0.93, -8, 0.95, 3.05).fill(body);
  } else {
    g.ellipse(w + 1.1, -5, 2.3, 1.7).fill(0xba9686);
  }
}

function vehicle(g: Graphics, kind: TransitKind, cargo: TransitCargo, engine: boolean, loaded: boolean): void {
  g.clear();
  if (kind === 'air') {
    g.poly([-7, 0, 0, -16, 14, -6, 17, -2, 2, -2, -2, 7, -6, 7, -3, -2]).fill(0xdde5ea);
    g.ellipse(1, -3.8, 17, 3.9).fill(0xf3f4e9);
    g.moveTo(-12, -3).lineTo(11, -3).stroke({ color: 0xa23b4b, width: 1.8 });
    if (cargo === 'passengers') {
      for (let i = -8; i <= 7; i += 3) g.rect(i, -5, 1.7, 1.4).fill(0x4b6a84);
    } else if (loaded) {
      g.roundRect(-7, -6, 8, 4, 1).fill(CARGO_COLOR[cargo]);
    }
    return;
  }
  g.ellipse(0, 1, 12, 3.1).fill({ color: 0x141c19, alpha: 0.27 });
  g.circle(-6, -1, 2.4).circle(6, -1, 2.4).fill(0x272e33);
  g.roundRect(-10, -6.5, 20, 5.7, 1).fill(engine ? 0x354955 : 0x754943);
  g.moveTo(-9, -5.5).lineTo(9, -5.5).stroke({ color: 0xc39260, width: 1.3 });
  if (engine) {
    g.roundRect(-9, -13, 8, 7, 1).fill(0x607483);
    g.roundRect(-1, -10, 10, 4, 1).fill(0x455d67);
    g.rect(5, -14, 2.2, 4).fill(0x29353e);
    g.circle(9.4, -7.5, 1.45).fill(0xffe09a);
  } else if (cargo === 'passengers') {
    g.roundRect(-10, -13, 20, 6.5, 1.5).fill(0x3d6268);
    for (let i = -7; i <= 6; i += 4) g.rect(i, -11.6, 2.7, 2.5).fill(0xeed297);
  } else if (loaded) {
    for (let i = -7; i <= 6; i += 5) {
      const color = CARGO_COLOR[cargo];
      if (cargo === 'stone') g.poly([i - 2.5, -6, i - 1.4, -10.3, i + 1.8, -10.8, i + 3, -6]).fill(color);
      else g.roundRect(i - 2.2, -11, 4.6, 4.7, 0.7).fill(color);
    }
  }
}

export class FrontierScenes {
  private animals = new Map<string, Graphics>();
  private hunters: Graphics[] = [];
  private trains: Graphics[] = [];
  private plane?: Graphics;
  private riders: Partial<Record<TransitKind, Graphics[]>> = {};
  private lastProvince?: Province;
  private lastTick = -1;
  private lastLines?: Province['transit'];
  private railRoute?: MapPoint[];
  private airRoute?: MapPoint[];
  private tint = 0xffffff;
  private time = 0;
  private tickOffset = 0;
  private cargo = new Map<TransitKind, string>();

  constructor(private ground: Graphics, private objects: Container) {}

  setTint(tint: number): void {
    this.tint = tint;
    this.ground.tint = tint;
    for (const actor of [...this.animals.values(), ...this.hunters, ...this.trains]) actor.tint = tint;
    if (this.plane) this.plane.tint = tint;
    for (const group of Object.values(this.riders)) for (const rider of group) rider.tint = tint;
  }

  private add(): Graphics {
    const sprite = new Graphics();
    sprite.cullable = true;
    sprite.tint = this.tint;
    this.objects.addChild(sprite);
    return sprite;
  }

  private drawLines(p: Province): void {
    const g = this.ground;
    g.clear();
    for (const kind of ['rail', 'air'] as const) {
      const route = p.transit?.[kind]?.route;
      if (!route) continue;
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1]!;
        const b = route[i]!;
        const ax = isoX(a.x + 0.5, a.y + 0.5), ay = isoY(a.x + 0.5, a.y + 0.5);
        const bx = isoX(b.x + 0.5, b.y + 0.5), by = isoY(b.x + 0.5, b.y + 0.5);
        if (kind === 'rail') {
          g.moveTo(ax, ay).lineTo(bx, by).stroke({ color: 0x685744, width: 8, cap: 'round' });
          for (let t = 0.13; t < 1; t += 0.23) {
            const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
            const side = Math.sign(bx - ax);
            g.moveTo(x - 2.2 * side, y + 3.5).lineTo(x + 2.2 * side, y - 3.5).stroke({ color: 0x3f3730, width: 1.9 });
          }
          for (const offset of [-2, 2]) g.moveTo(ax, ay + offset).lineTo(bx, by + offset).stroke({ color: 0xb0b8b8, width: 1.25 });
        } else {
          g.moveTo(ax, ay).lineTo(bx, by).stroke({ color: 0xc2b89e, width: 22, cap: 'round' });
          g.moveTo(ax, ay).lineTo(bx, by).stroke({ color: 0x404953, width: 18, cap: 'round' });
          g.moveTo(ax + (bx - ax) * 0.26, ay + (by - ay) * 0.26)
            .lineTo(ax + (bx - ax) * 0.74, ay + (by - ay) * 0.74).stroke({ color: 0xeee8c8, width: 1.6 });
        }
      }
      const site = route[0]!;
      const x = isoX(site.x + 0.5, site.y + 0.5);
      const y = isoY(site.x + 0.5, site.y + 0.5);
      g.roundRect(x - 18, y - 8, 36, 16, 3).fill(0xa29578);
      g.rect(x - 16, y - 16, 32, 12).fill(0x536778);
      g.poly([x - 19, y - 15, x - 10, y - 24, x + 8, y - 24, x + 18, y - 15]).fill(kind === 'rail' ? 0x9c4e43 : 0xb8c7c9);
      for (let i = -12; i < 14; i += 7) g.rect(x + i, y - 13, 4.4, 5.5).fill(0xf3d290);
      if (kind === 'air') {
        g.rect(x + 13, y - 30, 5, 22).fill(0xb5a993);
        g.rect(x + 11, y - 34, 9, 6).fill(0x6f95ac);
      }
    }
  }

  private transport(s: GameState, kind: TransitKind, line: TransitLine, p: Province, phase: number): void {
    const route = line.route;
    const direction = phase <= 0.5 ? 1 : -1;
    const trip = (phase <= 0.5 ? phase : 1 - phase) * 2;
    const freightDirection = line.direction === 'import' ? -1 : 1;
    const loaded = direction === freightDirection && shipment(s, p, kind, line).amount > 0;
    const shape = `${line.cargo}:${loaded}`;
    if (kind === 'rail') {
      const stock = this.trains;
      while (stock.length < 4) stock.push(this.add());
      if (this.cargo.get(kind) !== shape) stock.forEach((g, i) => vehicle(g, 'rail', line.cargo, i === 0, loaded));
      for (let i = 0; i < stock.length; i++) {
        const offset = i * 0.52;
        const position = trip * (route.length - 1) - direction * offset;
        const [a, b, t] = along(route, position);
        const g = stock[i]!;
        g.visible = position >= 0 && position < route.length - 1;
        place(g, p, a, b, t);
        g.scale.x = (isoX(b.x - a.x, b.y - a.y) || 1) * direction < 0 ? -1 : 1;
      }
    } else {
      const g = this.plane ??= this.add();
      if (this.cargo.get(kind) !== shape) vehicle(g, 'air', line.cargo, true, loaded);
      const a = route[0]!;
      const last = route.at(-1)!;
      const out = { x: last.x + 4 * Math.sign(last.x - a.x), y: last.y + 4 * Math.sign(last.y - a.y) };
      place(g, p, a, out, trip, Math.max(0, trip - 0.25) * 130);
      g.alpha = Math.min(1, (1 - trip) * 5);
      g.scale.x = isoX(out.x - a.x, out.y - a.y) * direction < 0 ? -1 : 1;
    }
    this.cargo.set(kind, shape);
    const boarders = this.riders[kind] ??= [];
    const visible = line.cargo === 'passengers' && trip < 0.23;
    if (visible && boarders.length === 0) {
      for (let i = 0; i < 3; i++) {
        const g = this.add();
        drawVillager(g, [0xc1a27d, 0x8c5352, 0x54797d][i]!, i);
        g.scale.set(0.62);
        boarders.push(g);
      }
    }
    for (let i = 0; i < boarders.length; i++) {
      const g = boarders[i]!;
      g.visible = visible;
      if (!visible) continue;
      const from = route[0]!;
      const next = route[1]!;
      place(g, p, from, next, (0.23 - trip) * 2);
      g.position.x += (i - 1) * 4.2 - 7;
      g.position.y += 8 + i * 1.5;
    }
  }

  /** `animals` overrides the wildlife list (the rotated camera passes the true map's animals, turned). */
  update(s: GameState, p: Province, seconds: number, huntMode: boolean, animals?: Animal[]): void {
    this.time += seconds;
    if (this.lastTick !== s.tick) this.tickOffset = 0;
    this.tickOffset = Math.min(0.95, this.tickOffset + seconds * 1.75);
    if (this.lastTick !== s.tick || this.lastProvince?.tiles !== p.tiles || this.lastLines !== p.transit) {
      const seen = new Set<string>();
      for (const spot of animals ?? wildlife(p, s.seed, s.tick)) {
        const key = `${spot.x},${spot.y}`;
        seen.add(key);
        if (!this.animals.has(key)) {
          const g = this.add();
          animal(g, spot.kind);
          place(g, p, spot);
          this.animals.set(key, g);
        }
      }
      for (const [key, g] of this.animals) if (!seen.has(key)) {
        g.destroy();
        this.animals.delete(key);
      }
      this.lastProvince = p;
      this.lastTick = s.tick;
      this.lastLines = p.transit;
    }
    for (const [key, g] of this.animals) {
      const phase = Number(key.replace(',', '.'));
      g.scale.set(huntMode ? 1.35 : 0.86, (huntMode ? 1.35 : 0.86) + Math.sin(this.time * 2 + phase) * 0.045);
      g.tint = huntMode ? 0xffdb9b : this.tint;
    }

    const hunt = p.hunt;
    while (this.hunters.length > (hunt?.workers ?? 0)) this.hunters.pop()!.destroy();
    if (hunt) {
      while (this.hunters.length < hunt.workers) {
        const g = this.add();
        drawVillager(g, 0x886349, this.hunters.length);
        g.scale.set(0.78);
        this.hunters.push(g);
      }
      const runtime = Math.min(1, (s.tick + this.tickOffset - hunt.startTick) / Math.max(1, hunt.endTick - hunt.startTick));
      const progress = Math.min(1, Math.max(0, (runtime > 0.5 ? 1 - runtime : runtime) * 2.45));
      for (let i = 0; i < this.hunters.length; i++) {
        const g = this.hunters[i]!;
        const [a, b, t] = along(hunt.route, progress * (hunt.route.length - 1) - i * 0.19);
        place(g, p, a, b, t);
        g.x += i * 2.6;
      }
    }
    if (this.railRoute !== p.transit?.rail?.route || this.airRoute !== p.transit?.air?.route) {
      this.railRoute = p.transit?.rail?.route;
      this.airRoute = p.transit?.air?.route;
      this.drawLines(p);
    }
    const phase = ((s.tick + this.tickOffset) % TICKS_PER_DAY) / TICKS_PER_DAY;
    for (const kind of ['rail', 'air'] as const) {
      const line = p.transit?.[kind];
      if (line) this.transport(s, kind, line, p, phase);
    }
  }

  destroy(): void {
    for (const g of this.animals.values()) g.destroy();
    this.animals.clear();
    for (const g of this.hunters) g.destroy();
    this.hunters.length = 0;
    for (const g of this.trains) g.destroy();
    this.trains.length = 0;
    this.plane?.destroy();
    this.plane = undefined;
    for (const group of Object.values(this.riders)) {
      for (const g of group) g.destroy();
    }
    this.riders = {};
    this.ground.clear();
    this.lastProvince = undefined;
    this.lastLines = undefined;
    this.railRoute = undefined;
    this.airRoute = undefined;
  }
}
