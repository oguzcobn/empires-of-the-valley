import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { TICKS_PER_DAY } from '../game/core/time';
import { PAVING_COST } from '../game/data/balance';
import { matchDayFor } from '../game/data/matchDays';
import { pedestrianSidewalkOffset, vehicleLaneOffset } from '../game/rendering/trafficMath';
import { loadSaveFile, createSaveFile } from '../game/save/serialize';
import { validateCommand } from '../game/systems/commands';
import { home, must, newCampaign } from './helpers';

describe('paved roads, sidewalk and traffic', () => {
  it('paves an existing dirt street, charges correctly, and keeps road connectivity', () => {
    const s = newCampaign(42);
    const p = home(s);
    const index = p.tiles.findIndex((t) => t.road && t.roadType === 'dirt');
    expect(index).toBeGreaterThanOrEqual(0);
    const x = index % p.width, y = Math.floor(index / p.width);
    const gold = p.stocks.gold;
    const stone = p.stocks.stone;
    const next = must(s, { type: 'paveRoad', x, y });
    expect(home(next).tiles[index]!.paved).toBe(true);
    expect(home(next).tiles[index]!.road).toBe(true);
    expect(home(next).stocks.gold).toBe(gold - PAVING_COST.gold!);
    expect(home(next).stocks.stone).toBe(stone - PAVING_COST.stone!);
    expect(validateCommand(next, { type: 'paveRoad', x, y })).not.toBeNull();
    const saved = createSaveFile(next);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const restored = loadSaveFile(saved.file);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(home(restored.state).tiles[index]!.paved).toBe(true);
    const cleared = must(next, { type: 'removeRoad', x, y });
    expect(home(cleared).tiles[index]!.paved).toBe(false);
  });

  it('prevents paving unrelated ground, water and bridge tiles', () => {
    const s = newCampaign(42);
    const p = home(s);
    const index = p.tiles.findIndex((t) => !t.road);
    const x = index % p.width, y = Math.floor(index / p.width);
    expect(validateCommand(s, { type: 'paveRoad', x, y })).not.toBeNull();
    const poor = produce(s, (draft) => {
      draft.provinces[draft.homeProvinceId]!.stocks.gold = 0;
    });
    const road = p.tiles.findIndex((t) => t.road && t.roadType === 'dirt');
    expect(validateCommand(poor, { type: 'paveRoad', x: road % p.width, y: Math.floor(road / p.width) })).not.toBeNull();
  });

  it('keeps Türkiye cars right and Edinburgh cars left while walkers use the curbs', () => {
    expect(vehicleLaneOffset(1, 0, false)).toEqual([0, 0.13]);
    expect(vehicleLaneOffset(1, 0, true)).toEqual([0, -0.13]);
    expect(pedestrianSidewalkOffset(1, 0, 1)).toEqual([0, 0.3]);
    expect(pedestrianSidewalkOffset(1, 0, -1)).toEqual([0, -0.3]);
  });
});

describe('fictional local and visiting fan matchdays', () => {
  it('shows Trabzonspor on Trabzon match days only', () => {
    const base = newCampaign(42, 'turkish');
    expect(matchDayFor(base)).toBeNull();
    const s = { ...base, tick: TICKS_PER_DAY * 3 };
    expect(matchDayFor(s)?.team).toBe('trabzonspor');
    expect(matchDayFor({ ...s, tick: TICKS_PER_DAY * 4 })).toBeNull();
  });

  it('cycles Hearts, Celtic and Rangers crowds in Edinburgh', () => {
    const s = newCampaign(42, 'scottish');
    const at = (day: number) => matchDayFor({ ...s, tick: TICKS_PER_DAY * day });
    expect(at(3)?.team).toBe('hearts');
    expect(at(10)?.team).toBe('celtic');
    expect(at(17)?.team).toBe('rangers');
    expect(at(24)?.team).toBe('hearts');
    expect(at(10)?.home).toBe(false);
  });
});
