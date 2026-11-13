import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BuildingLook, GameState } from '../game/core/types';
import { CONDITION_MAX, LEGACY_STYLE, defaultLook } from '../game/data/architecture';
import { CORE_OFFSET, SCHEMA_VERSION } from '../game/data/balance';
import { migrate } from '../game/save/migrations';
import { createSaveFile, loadSaveFile, parseSaveText } from '../game/save/serialize';
import {
  conditionPermille,
  decayPerDay,
  effectiveLook,
  levelCost,
  repairCost,
  restyleCost,
} from '../game/systems/architecture';
import { executeCommand } from '../game/systems/commands';
import { dailyOutput } from '../game/systems/economy';
import { findSite } from '../game/systems/placement';
import { BUILDINGS } from '../game/data/buildings';
import { applyTicks } from '../game/systems/tick';
import { build, buildAndStaff, days, expectValid, home, must, newCampaign, tweak } from './helpers';
import { playChapterOne } from './playthrough';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const refused = (s: GameState, cmd: Parameters<typeof executeCommand>[1]): string => {
  const r = executeCommand(s, cmd);
  return r.ok ? 'ok' : r.error.key;
};

describe('legacy saves (schema v1)', () => {
  for (const name of ['v1-fresh', 'v1-midgame', 'v1-chapter1']) {
    it(`${name} opens, keeps every building and stock, and plays on`, () => {
      const raw = fixture(name) as { state: Record<string, unknown> };
      expect(raw.state.schemaVersion).toBe(1);
      const loaded = loadSaveFile(raw);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      const s = loaded.state;
      expect(s.schemaVersion).toBe(SCHEMA_VERSION);
      expect(s.culture).toBe(LEGACY_STYLE);
      const before = (raw.state.provinces as Record<string, { buildings: Record<string, unknown>[]; stocks: unknown }>)[
        s.homeProvinceId
      ]!;
      const after = home(s);
      expect(after.buildings).toHaveLength(before.buildings.length);
      after.buildings.forEach((b, i) => {
        const old = before.buildings[i]! as { x: number; y: number };
        // the 24x24 valley now sits in the centre of the 32x32 map: same layout, shifted
        expect(b).toMatchObject({ ...old, x: old.x + CORE_OFFSET, y: old.y + CORE_OFFSET });
        expect(b).toMatchObject({ style: LEGACY_STYLE, look: null, condition: CONDITION_MAX, paidStages: 0 });
      });
      const oldTiles = (raw.state.provinces as Record<string, { tiles: Record<string, unknown>[] }>)[s.homeProvinceId]!.tiles;
      for (let y = 0; y < 24; y++)
        for (let x = 0; x < 24; x++) {
          const t = after.tiles[(y + CORE_OFFSET) * after.width + x + CORE_OFFSET]!;
          expect(t).toMatchObject({ ...oldTiles[y * 24 + x], height: 0 });
        }
      expect(after.buildings.every((b) => b.connected === (before.buildings.find((o) => o.id === b.id) as { connected: boolean }).connected)).toBe(true);
      expect(after.stocks).toEqual(before.stocks);
      expect(s.tick).toBe(raw.state.tick);
      for (const [id, progress] of Object.entries(raw.state.questProgress as Record<string, unknown>)) {
        expect(s.questProgress[id as keyof typeof s.questProgress]).toEqual(progress);
      }
      expect(s.questProgress.q09).toBeDefined();
      expectValid(applyTicks(s, 24 * 20));
    });
  }

  it('migrates without touching the original object and re-saves as the new version', () => {
    const raw = fixture('v1-midgame') as { state: Record<string, unknown> };
    const copy = JSON.stringify(raw);
    const loaded = loadSaveFile(raw);
    expect(JSON.stringify(raw)).toBe(copy);
    if (!loaded.ok) throw new Error('load failed');
    const saved = createSaveFile(loaded.state);
    expect(saved.ok && saved.file.meta.schemaVersion).toBe(SCHEMA_VERSION);
    const again = parseSaveText(JSON.stringify(saved.ok && saved.file));
    expect(again.ok && again.state).toEqual(loaded.state);
  });

  it('rejects damaged legacy data instead of guessing', () => {
    const raw = fixture('v1-fresh') as { state: { provinces: Record<string, { buildings: unknown[] }> } };
    const broken = structuredClone(raw);
    Object.values(broken.state.provinces)[0]!.buildings.push({ id: 'x', definitionId: 'castle' });
    expect(loadSaveFile(broken).ok).toBe(false);
    expect(migrate({ schemaVersion: 1, provinces: 'nope' }).ok).toBe(true); // passes through ...
    expect(loadSaveFile({ format: 'empires-of-the-valley-save', state: { schemaVersion: 1, provinces: 'nope' } }).ok).toBe(false); // ... and the schema refuses it
  });
});

describe('architectural cultures', () => {
  it('a new game starts in the chosen culture', () => {
    for (const culture of ['scottish', 'turkish'] as const) {
      const s = newCampaign(42, culture);
      expect(s.culture).toBe(culture);
      expect(home(s).buildings.every((b) => b.style === culture)).toBe(true);
      expectValid(s);
    }
  });

  it('only implemented cultures are playable', () => {
    const s = newCampaign();
    const plan = findSite(home(s), BUILDINGS.hut)!;
    expect(refused(s, { type: 'setCulture', style: 'japanese' })).toBe('err.styleUnavailable');
    expect(
      refused(s, { type: 'placeBuilding', buildingId: 'hut', x: plan.x, y: plan.y, style: 'medieval_european' }),
    ).toBe('err.styleUnavailable');
  });

  it('materials change real costs, and the exact displayed cost is paid', () => {
    const scot = levelCost('hut', 0, 'scottish');
    const turk = levelCost('hut', 0, 'turkish');
    expect(scot).not.toEqual(turk);
    for (const c of [scot, turk])
      for (const v of Object.values(c)) expect(v! % 1000).toBe(0); // whole units only
    const granite = levelCost('hut', 0, 'turkish', { ...defaultLook('turkish', 'hut', 1), wall: 'granite' });
    const timber = levelCost('hut', 0, 'turkish', { ...defaultLook('turkish', 'hut', 1), wall: 'wood' });
    expect(granite.stone!).toBeGreaterThan(timber.stone!);
    expect(timber.wood!).toBeGreaterThan(granite.wood!);

    const s = newCampaign(7, 'scottish');
    const placed = build(s, 'hut');
    const p0 = home(s);
    const roads = home(placed.state).tiles.filter((t) => t.road).length - p0.tiles.filter((t) => t.road).length;
    expect(home(placed.state).stocks.stone).toBe(p0.stocks.stone - scot.stone!);
    expect(home(placed.state).stocks.wood).toBe(p0.stocks.wood - scot.wood! - roads * 2000);
  });

  it('new buildings default to the city culture and can be placed in another culture', () => {
    let s = newCampaign(42, 'turkish');
    s = build(s, 'hut').state;
    expect(home(s).buildings.at(-1)!.style).toBe('turkish');
    s = must(s, { type: 'setCulture', style: 'scottish' });
    s = build(s, 'hut').state;
    expect(home(s).buildings.at(-1)!.style).toBe('scottish');
    const plan = findSite(home(s), BUILDINGS.hut)!;
    for (const [x, y] of plan.roads) s = must(s, { type: 'placeRoad', x, y });
    s = must(s, { type: 'placeBuilding', buildingId: 'hut', x: plan.x, y: plan.y, style: 'turkish' });
    expect(home(s).buildings.at(-1)!.style).toBe('turkish');
    expectValid(s);
  });

  it('workshop looks are validated and only allowed on designable buildings', () => {
    const s = newCampaign();
    const plan = findSite(home(s), BUILDINGS.hut)!;
    let t = s;
    for (const [x, y] of plan.roads) t = must(t, { type: 'placeRoad', x, y });
    const custom: BuildingLook = { ...defaultLook('scottish', 'hut', 3), floors: 1, balcony: 'cumba' };
    const placed = must(t, { type: 'placeBuilding', buildingId: 'hut', x: plan.x, y: plan.y, style: 'turkish', look: custom });
    const b = home(placed).buildings.at(-1)!;
    expect(b.look).toEqual(custom);
    expect(effectiveLook(b)).toEqual(custom);
    const bad = { ...custom, roof: 'pagoda' } as unknown as BuildingLook;
    expect(refused(t, { type: 'placeBuilding', buildingId: 'hut', x: plan.x, y: plan.y, look: bad })).toBe('err.invalidDesign');
    const camp = findSite(home(s), BUILDINGS.lumber_camp)!;
    let u = s;
    for (const [x, y] of camp.roads) u = must(u, { type: 'placeRoad', x, y });
    expect(refused(u, { type: 'placeBuilding', buildingId: 'lumber_camp', x: camp.x, y: camp.y, look: custom })).toBe(
      'err.notDesignable',
    );
  });

  it('changing a building’s architecture costs resources and survives save/load', () => {
    let s = newCampaign(42, 'turkish');
    const placed = buildAndStaff(s, 'hut', 0);
    s = placed.state;
    const before = home(s).stocks;
    const cost = restyleCost('hut', 'scottish', null);
    expect(cost.gold).toBeGreaterThan(0);
    s = must(s, { type: 'setBuildingStyle', instanceId: placed.id, style: 'scottish', look: null });
    const b = home(s).buildings.find((x) => x.id === placed.id)!;
    expect(b.style).toBe('scottish');
    expect(home(s).stocks.gold).toBe(before.gold - cost.gold!);
    expect(home(s).stocks.wood).toBe(before.wood - (cost.wood ?? 0));
    expect(refused(s, { type: 'setBuildingStyle', instanceId: placed.id, style: 'scottish', look: null })).toBe(
      'err.sameStyle',
    );
    const poor = tweak(s, (d) => void (d.provinces[d.homeProvinceId]!.stocks.gold = 0));
    expect(refused(poor, { type: 'setBuildingStyle', instanceId: placed.id, style: 'turkish', look: null })).toBe(
      'err.cost',
    );
    const saved = createSaveFile(s);
    const loaded = parseSaveText(JSON.stringify(saved.ok && saved.file));
    expect(loaded.ok && home(loaded.state).buildings.find((x) => x.id === placed.id)!.style).toBe('scottish');
  });
});

describe('condition, decay and restoration', () => {
  it('stone lasts longer than timber; Scottish building culture slows decay further', () => {
    const ref = { definitionId: 'hut' as const, level: 1 };
    const stone = { ...defaultLook('turkish', 'hut', 1), wall: 'granite' as const, roofMaterial: 'slate' as const };
    const wood = { ...stone, wall: 'wood' as const, roofMaterial: 'thatch' as const };
    expect(decayPerDay({ ...ref, style: 'turkish', look: stone })).toBeLessThan(
      decayPerDay({ ...ref, style: 'turkish', look: wood }),
    );
    expect(decayPerDay({ ...ref, style: 'scottish', look: stone })).toBeLessThan(
      decayPerDay({ ...ref, style: 'turkish', look: stone }),
    );
  });

  it('decays every day, is deterministic and only ever goes down without repairs', () => {
    const s = newCampaign(42);
    const later = days(s, 30);
    for (const b of home(later).buildings) {
      const b0 = home(s).buildings.find((x) => x.id === b.id)!;
      expect(b.condition).toBe(b0.condition - 30 * decayPerDay(b));
    }
    expect(days(s, 30)).toEqual(later);
  });

  it('worn buildings produce less, never nothing; restoring brings output back', () => {
    const staffed = buildAndStaff(newCampaign(42), 'lumber_camp', 2);
    const full = dailyOutput(staffed.state, home(staffed.state), home(staffed.state).buildings.at(-1)!);
    const worn = tweak(staffed.state, (d) => {
      d.provinces[d.homeProvinceId]!.buildings.at(-1)!.condition = 2000;
    });
    const b = home(worn).buildings.at(-1)!;
    const reduced = dailyOutput(worn, home(worn), b);
    expect(reduced).toBe(Math.floor((full * conditionPermille(2000)) / 1000));
    expect(reduced).toBeGreaterThan(0);
    const cost = repairCost(b);
    const fixed = must(worn, { type: 'restoreBuilding', instanceId: b.id });
    expect(home(fixed).buildings.at(-1)!.condition).toBe(CONDITION_MAX);
    expect(home(fixed).stocks.gold).toBe(home(worn).stocks.gold - cost.gold!);
    expect(dailyOutput(fixed, home(fixed), home(fixed).buildings.at(-1)!)).toBe(full);
    expect(refused(fixed, { type: 'restoreBuilding', instanceId: b.id })).toBe('err.noRepairNeeded');
  });

  it('Turkish craftsmanship makes the same repair cheaper', () => {
    const look = defaultLook('turkish', 'hut', 1);
    const base = { definitionId: 'hut' as const, level: 1, look, condition: 4000 };
    const tr = repairCost({ ...base, style: 'turkish' });
    const sc = repairCost({ ...base, style: 'scottish' });
    expect(tr.gold!).toBeLessThan(sc.gold!);
  });
});

describe('balance across cultures', () => {
  for (const culture of ['scottish', 'turkish'] as const) {
    it(`a guided ${culture} player still finishes chapter 1 before the first winter`, () => {
      const { state } = playChapterOne(42, 110, culture);
      expect(state.completedChapters).toContain(1);
      expect(state.tick).toBeLessThan(90 * 24);
    });
  }
});
