import { Container, Graphics } from 'pixi.js';
import { TICK_MS } from '../core/clock';
import type { CitySurprise, GameState, Province, SurprisePoint } from '../core/types';
import { HEIGHT_PX } from '../data/balance';
import { DEFENSE_THRESHOLD, surpriseTimeline } from '../systems/citySurprises';
import { tileAt } from '../systems/grid';
import { mix } from './arch/kit';
import { isoX, isoY } from './iso';
import { drawSoldier, kitFor } from './soldiers';
import { drawAlien, drawCorsair, drawPirate, drawSaucer } from './surpriseSprites';

const clamp = (n: number): number => Math.max(0, Math.min(1, n));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp(t);
const SWARM = 8;
type ScreenPoint = [number, number];
interface Fighter { body: Graphics; pose: string }

/** Projected set pieces and effects are visual only. Saved encounter routes and combat outcomes
 * come from the deterministic tick simulation; this layer interpolates between those ticks. */
export class CitySurpriseScenes {
  private vessel = new Graphics();
  private vehicleEffects = new Graphics();
  private combatEffects = new Graphics();
  private alien = new Graphics();
  private sailors: Fighter[] = [];
  private soldiers: Fighter[] = [];
  private key = '';
  private renderedTick = -1;
  private tickFraction = 0;
  private clock = 0;

  constructor(private objects: Container, air: Container) {
    air.addChild(this.vehicleEffects, this.vessel);
    objects.addChild(this.combatEffects, this.alien);
    this.hide();
  }

  private hide(): void {
    this.vessel.visible = this.vehicleEffects.visible = this.combatEffects.visible = this.alien.visible = false;
    for (const f of [...this.sailors, ...this.soldiers]) f.body.visible = false;
    this.key = '';
  }

  private project(p: Province, route: SurprisePoint[], progress: number): ScreenPoint {
    const position = clamp(progress) * (route.length - 1);
    const index = Math.floor(position), part = position - index;
    const a = route[index]!, b = route[Math.min(index + 1, route.length - 1)]!;
    const x = lerp(a[0], b[0], part) + .5;
    const y = lerp(a[1], b[1], part) + .5;
    const elevation = lerp(tileAt(p, ...a)?.height ?? 0, tileAt(p, ...b)?.height ?? 0, part) * HEIGHT_PX;
    return [isoX(x, y), isoY(x, y) - elevation];
  }

  private depth(route: SurprisePoint[], fraction: number): number {
    const index = Math.round(clamp(fraction) * (route.length - 1));
    const [x, y] = route[index]!;
    return x + y + 1.16;
  }

  update(game: GameState, p: Province, dt: number, reduced: boolean, night: number): void {
    const event = game.surprise;
    if (!event) {
      if (this.key) this.hide();
      return;
    }
    const key = `${event.kind}|${event.startedAt}`;
    if (key !== this.key) {
      this.hide();
      this.key = key;
      this.clock = 0;
      this.renderedTick = -1;
      this.vessel.clear();
      this.vessel.scale.set(1);
      if (event.kind === 'ufo') drawSaucer(this.vessel);
      else drawCorsair(this.vessel);
    }
    if (this.renderedTick !== game.tick) {
      this.renderedTick = game.tick;
      this.tickFraction = 0;
    }
    if (game.speed && !reduced) {
      this.tickFraction = Math.min(1, this.tickFraction + dt * game.speed / TICK_MS);
      this.clock += dt;
    }
    const age = game.tick - event.startedAt + this.tickFraction;
    const tint = mix(0xffffff, 0x66809b, night * .73);
    this.vessel.tint = tint;
    this.vessel.visible = this.vehicleEffects.visible = true;
    if (event.kind === 'ufo') this.updateUfo(event, p, age, tint, reduced);
    else this.updateRaid(game, event, p, age, tint, reduced);
  }

  private updateUfo(event: CitySurprise, p: Province, age: number, tint: number, reduced: boolean): void {
    const { landing, confrontation, resolution, boarding, departure } = surpriseTimeline(event);
    const fly = age < landing ? age / landing : 1 - clamp((age - boarding) / (departure - boarding));
    const [x, y] = this.project(p, event.approach, fly);
    const hover = reduced ? 0 : Math.sin(this.clock / 280) * 2;
    const height = lerp(164, 43, fly) + hover;
    this.vessel.position.set(x, y - height);
    const glow = this.vehicleEffects.clear();
    glow.ellipse(x, y - height + 3, 35, 11).fill({ color: 0x72cdb5, alpha: .15 });
    if ((age >= landing - .6 && age < landing + 2.5) || (age >= boarding - 2 && age < boarding + .4)) {
      glow.poly([x - 8, y - height + 2, x + 8, y - height + 2, x + 19, y, x - 19, y])
        .fill({ color: 0x7eead0, alpha: .21 });
      glow.ellipse(x, y, 19, 5).fill({ color: 0x9ff9cb, alpha: .32 });
      if (!reduced) for (let i = 0; i < 6; i++) {
        const h = (this.clock / 20 + i * 14) % 47;
        glow.circle(x + Math.sin(i * 11) * 12, y - h, .65).fill({ color: 0xb6fff0, alpha: .65 });
      }
    }
    this.alien.visible = age >= landing && age < boarding;
    if (!this.alien.visible) return;
    const travel = age < confrontation ? (age - landing - 2) / (confrontation - landing - 2) : 1 - clamp((age - resolution) / (boarding - resolution - 2));
    const [ax, ay] = this.project(p, event.walk, travel);
    const descent = (1 - clamp((age - landing) / 2)) * height;
    const ascent = clamp((age - boarding + 2) / 2) * height;
    this.alien.position.set(ax, ay - Math.max(descent, ascent));
    this.alien.zIndex = this.depth(event.walk, travel);
    this.alien.tint = tint;
    const walking = (age > landing + 2 && age < confrontation) || (age > resolution && age < boarding - 2);
    drawAlien(this.alien.clear(), walking ? this.clock / 80 : 0);
  }

  private fighter(pool: Fighter[], index: number): Fighter {
    let entry = pool[index];
    if (!entry) {
      const body = new Graphics();
      entry = { body, pose: '' };
      pool.push(entry);
      this.objects.addChild(body);
    }
    return entry;
  }

  private updateRaid(game: GameState, event: CitySurprise, p: Province, age: number, tint: number, reduced: boolean): void {
    const { landing, confrontation, resolution, boarding, departure } = surpriseTimeline(event);
    const sail = age < landing ? age / landing : 1 - clamp((age - boarding) / (departure - boarding));
    const [sx, sy] = this.project(p, event.approach, sail);
    this.vessel.position.set(sx, sy + (reduced ? 0 : Math.sin(this.clock / 410) * 1.25));
    const next = this.project(p, event.approach, sail + .04);
    const last = this.project(p, event.approach, sail - .04);
    const reverse = age > boarding ? -1 : 1;
    const facing = next[0] >= last[0] ? reverse : -reverse;
    this.vessel.scale.set(facing, 1);
    const wake = this.vehicleEffects.clear();
    for (let i = 0; i < 8; i++) {
      const t = reduced ? i / 8 : (i / 8 + this.clock / 3000) % 1;
      wake.ellipse(sx - facing * (26 + t * 67), sy + 7 * t, lerp(5, 21, t), 2 + t * 3)
        .stroke({ color: 0xb3d9d2, width: 1.05, alpha: .43 * (1 - t) });
    }

    const battle = age >= confrontation && age < resolution;
    const aftermath = age >= resolution && age < boarding;
    const progress = clamp((age - confrontation) / (resolution - confrontation));
    const defenders = event.defenders ?? game.militia ?? 0;
    const victory = event.outcome ? event.outcome === 'repelled' : defenders > DEFENSE_THRESHOLD;
    const militia = Math.min(SWARM, Math.ceil(defenders / 13));
    const returnWalk = 1 - clamp((age - resolution) / (boarding - resolution - 1));
    const land = age >= landing && age < boarding;
    const push = age >= resolution ? returnWalk : clamp((age - landing - 1) / (confrontation - landing - 1));
    const retreat = age >= resolution ? clamp((age - resolution) / 4) : 0;
    const guard = clamp((age - landing) / (confrontation - landing));
    const from = this.project(p, event.walk, push);
    const destination = this.project(p, event.walk, 1);
    const guardPosition = this.project(p, event.defense.length ? event.defense : event.walk, guard);
    const approachDirection = this.project(p, event.walk, .93)[0] <= destination[0] ? 1 : -1;
    const flashes = this.combatEffects.clear();
    this.combatEffects.visible = battle || aftermath;
    this.combatEffects.zIndex = this.depth(event.walk, 1) + .25;
    const splashPoints: { x: number; y: number; rank: number }[] = [];

    for (const side of ['pirates', 'defenders'] as const) {
      const enemy = side === 'pirates';
      const count = enemy ? SWARM : militia;
      const pool = enemy ? this.sailors : this.soldiers;
      const direction = enemy ? approachDirection : -approachDirection;
      for (let i = 0; i < SWARM; i++) {
        const fighter = this.fighter(pool, i);
        const allowed = enemy ? land && age >= landing + i * .17 : land && i < count;
        fighter.body.visible = allowed;
        if (!allowed) continue;
        const falling = enemy ? (victory ? 5 : Math.min(2, militia)) : Math.min(count, victory ? 1 : 4);
        const impact = .24 + i * .12 + (enemy ? 0 : .08);
        const down = (battle || aftermath) && i < falling && progress >= impact;
        const row = i % 4 - 1.5, col = Math.floor(i / 4);
        const anchor = down ? destination : enemy ? from : guardPosition;
        const spacing = (battle || aftermath && (!enemy || down)) ? 17 : 4;
        const slide = !enemy && aftermath && !victory && !down ? retreat * 15 : 0;
        const x = anchor[0] + (-spacing - 7 * col - slide) * direction + row * 4;
        const y = anchor[1] + row * 5 + col * 2;
        const walking = !down && !battle && (enemy || guard < 1);
        const frame = walking ? Math.floor(this.clock / 95) % 8 : 0;
        const pulse = (this.clock + i * 229 + (enemy ? 150 : 30)) % 1190;
        const kick = battle && pulse < 88 && !down && !reduced;
        const pose = `${frame}|${direction}|${enemy ? 'pirate' : game.culture}`;
        if (fighter.pose !== pose) {
          fighter.pose = pose;
          if (enemy) drawPirate(fighter.body.clear(), direction, frame * Math.PI / 4, i);
          else drawSoldier(fighter.body, kitFor(game.culture, i), frame, direction, 0);
        }
        fighter.body.position.set(x - (kick ? 1.8 * direction : 0), y + (down ? 1 : 0));
        fighter.body.zIndex = this.depth(event.walk, enemy && !down ? push : 1) + (row + 1.5) * .007;
        fighter.body.rotation = down ? -direction * 1.49 : 0;
        fighter.body.tint = tint;
        if (down) splashPoints.push({ x, y, rank: impact });
        if (!battle || down || pulse >= 315 || reduced) continue;
        const muzzle = x + direction * (enemy ? 8 : 6), barrel = y - 14;
        if (kick) {
          const light = .86 * (1 - pulse / 88);
          flashes.circle(muzzle, barrel, 7).fill({ color: 0xffa346, alpha: light * .24 });
          flashes.poly([muzzle - direction * 2, barrel, muzzle + direction * 11, barrel - .8, muzzle + direction * 3, barrel + 2.7])
            .fill({ color: 0xffdc85, alpha: light });
          flashes.moveTo(muzzle + direction * 2, barrel).lineTo(muzzle + direction * (24 + i % 3 * 3), barrel + 1.5)
            .stroke({ color: 0xffe3a5, alpha: light * .57, width: .62 });
        }
        flashes.circle(muzzle + direction * (pulse / 47), barrel - pulse / 59, 1.6 + pulse / 85)
          .fill({ color: 0x706f6a, alpha: (1 - pulse / 315) * .38 });
      }
    }

    for (const { x, y, rank } of splashPoints) {
      const since = clamp((progress - rank) * 4);
      flashes.ellipse(x - 4, y + 1, lerp(1.8, 7, since), lerp(.9, 2.6, since))
        .fill({ color: 0x72191d, alpha: .72 });
      if (!reduced) for (let i = 0; i < 5; i++) {
        const spotX = x + Math.sin(i * 7 + rank) * (3 + since * 12);
        const flight = clamp(since * (1.8 + (i % 3) * .2));
        const arc = 7 * 4 * flight * (1 - flight);
        const spotY = y + Math.cos(i * 9) * (1 + since * 5) - arc;
        flashes.circle(spotX, spotY, .6 + (i % 3) * .23).fill({ color: 0x8e2026, alpha: .56 });
      }
    }
    if (aftermath && !victory && event.damage) {
      for (const at of event.damage) {
        const [x, y] = this.project(p, [at], 0);
        const smokeAge = clamp((age - resolution) / (boarding - resolution));
        for (let i = 0; i < 8; i++) {
          const drift = reduced ? i / 8 : (this.clock / 3200 + i / 8) % 1;
          flashes.circle(x + Math.sin(i * 4) * 9 + drift * 8, y - drift * 35, 3 + drift * 6)
            .fill({ color: i % 3 ? 0x655c52 : 0x473e37, alpha: (1 - smokeAge) * (1 - drift) * .42 });
        }
      }
    }
  }

  destroy(): void {
    for (const g of [this.vessel, this.vehicleEffects, this.combatEffects, this.alien]) g.destroy();
    for (const fighter of [...this.sailors, ...this.soldiers]) fighter.body.destroy();
  }
}
