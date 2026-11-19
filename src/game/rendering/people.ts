import type { Container } from 'pixi.js';
import type { GameState } from '../core/types';
import { citizenAt, workersOf } from '../data/citizens';
import type { CitizenProfile } from '../data/citizens';
import { cityOf } from '../data/cities';
import { homeProvince, totalPopulation } from '../systems/economy';

/**
 * Every figure drawn on the map is somebody. Scenes tag the display object of each person with
 * who it is; a tap on the map finds the nearest tagged figure and the app shows their card.
 */
export type PersonRef =
  /** A townsperson by citizen number (walkers, shoppers, swimmers, passengers). */
  | { kind: 'citizen'; index: number; child?: boolean }
  /** The `slot`-th worker of a building (field hands, paramedics, police officers). */
  | { kind: 'worker'; buildingId: string; slot: number }
  /** A soldier of the town guard by position in the unit. */
  | { kind: 'soldier'; index: number };

interface Tag {
  ref: PersonRef;
  /** What the person is doing, shown on the card (Turkish). */
  activity: string;
  /** Figure height above its origin in local pixels, for hit testing. */
  height: number;
}

const tags = new WeakMap<Container, Tag>();
const tagged = new Set<Container>();

export function markPerson(obj: Container, ref: PersonRef, activity: string, height = 22): void {
  const tag = tags.get(obj);
  if (tag) {
    tag.ref = ref;
    tag.activity = activity;
    tag.height = height;
    return;
  }
  tags.set(obj, { ref, activity, height });
  tagged.add(obj);
}

/** Updates what a tagged person is doing without allocating. */
export function setActivity(obj: Container, activity: string): void {
  const tag = tags.get(obj);
  if (tag) tag.activity = activity;
}

function shown(obj: Container): boolean {
  for (let o: Container | null = obj; o; o = o.parent) if (!o.visible || o.alpha <= 0.05) return false;
  return true;
}

export interface PersonPick {
  ref: PersonRef;
  activity: string;
}

/**
 * The person under a canvas point (in canvas pixels), if any. Each figure stands on its origin;
 * the pick box is its body, widened a little so small figures stay easy to tap.
 */
export function pickPerson(sx: number, sy: number, tolerance = 7): PersonPick | null {
  let best: { pick: PersonPick; d: number } | null = null;
  for (const obj of tagged) {
    if (obj.destroyed) {
      tagged.delete(obj);
      continue;
    }
    if (!obj.parent || !shown(obj)) continue;
    const tag = tags.get(obj)!;
    const feet = obj.getGlobalPosition();
    const scale = Math.abs(obj.worldTransform.d) || 1;
    const top = feet.y - tag.height * scale;
    const half = Math.max(tolerance, 5 * scale);
    if (sx < feet.x - half || sx > feet.x + half || sy < top - tolerance || sy > feet.y + tolerance) continue;
    const d = Math.hypot(sx - feet.x, sy - (feet.y + top) / 2);
    if (!best || d < best.d) best = { pick: { ref: tag.ref, activity: tag.activity }, d };
  }
  return best?.pick ?? null;
}

/** Canvas points (body middle) and kinds of the visible people, for automated tests. */
export function personPoints(): { x: number; y: number; kind: PersonRef['kind'] }[] {
  const out: { x: number; y: number; kind: PersonRef['kind'] }[] = [];
  for (const obj of tagged) {
    if (obj.destroyed || !obj.parent || !shown(obj)) continue;
    const tag = tags.get(obj)!;
    const feet = obj.getGlobalPosition();
    const scale = Math.abs(obj.worldTransform.d) || 1;
    out.push({ x: feet.x, y: feet.y - (tag.height * scale) / 2, kind: tag.ref.kind });
  }
  return out;
}

/** Number of tagged figures currently on the map (tests). */
export function personCount(): number {
  let n = 0;
  for (const obj of tagged) if (!obj.destroyed && obj.parent) n++;
  return n;
}

const SOLDIER_RANKS = ['Teğmen', 'Çavuş', 'Onbaşı', 'Er', 'Er', 'Er', 'Er', 'Er'];
const SOLDIER_TR = ['Mert', 'Barış', 'Onur', 'Tuncay', 'Volkan', 'Erkan', 'Alper', 'Sinan', 'Gökhan', 'Fatih'];
const SOLDIER_SC = ['Iain', 'Neil', 'Graham', 'Stuart', 'Kenneth', 'Alasdair', 'Ross', 'Dougie', 'Malcolm', 'Gavin'];
const SURNAME_TR = ['Kaplan', 'Bozkurt', 'Ateş', 'Tekin', 'Güneş', 'Er', 'Kara', 'Uçar', 'Duman', 'Sarı'];
const SURNAME_SC = ['Gordon', 'Mackay', 'Hamilton', 'Cunningham', 'Wallace', 'Bruce', 'Munro', 'Ross', 'Gunn', 'Hay'];

export interface PersonProfile extends Partial<CitizenProfile> {
  name: string;
  occupation: string;
  age: number;
  /** Citizen number when the person can be renamed. */
  index?: number;
}

/** Who a tagged person is. */
export function personProfile(s: GameState, ref: PersonRef): PersonProfile {
  if (ref.kind === 'soldier') {
    const scottish = cityOf(s.cityId, s.culture).id === 'edinburgh';
    const h = (Math.imul(s.seed ^ (ref.index + 7919), 0x2c1b3c6d) ^ (ref.index * 977)) >>> 0;
    const first = scottish ? SOLDIER_SC : SOLDIER_TR;
    const last = scottish ? SURNAME_SC : SURNAME_TR;
    const rank = SOLDIER_RANKS[Math.min(ref.index, SOLDIER_RANKS.length - 1)]!;
    return {
      name: `${rank} ${first[h % first.length]} ${last[Math.floor(h / 13) % last.length]}`,
      occupation: scottish ? 'Şehir muhafız birliği (İskoç piyadesi)' : 'Şehir muhafız birliği (piyade)',
      age: 20 + (Math.floor(h / 31) % 18),
    };
  }
  const total = Math.max(1, totalPopulation(homeProvince(s)));
  if (ref.kind === 'worker') {
    const staff = workersOf(s, ref.buildingId);
    if (staff.length) return citizenAt(s, staff[ref.slot % staff.length]!);
    let h = 0;
    for (const ch of ref.buildingId) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
    return citizenAt(s, (h + ref.slot) % total);
  }
  const { adults, elders, children } = homeProvince(s).population;
  if (ref.child && children > 0) return citizenAt(s, adults + elders + (ref.index % children));
  return citizenAt(s, ref.index % total);
}
