import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deleteSlot, listSlots, readSlot, writeSlot } from '../game/save/db';
import { migrate } from '../game/save/migrations';
import { SAVE_FORMAT, createSaveFile, loadSaveFile, parseSaveText } from '../game/save/serialize';
import { applyTicks } from '../game/systems/tick';
import { buildAndStaff, home, newCampaign, tweak } from './helpers';
import { playChapterOne } from './playthrough';

const midGame = () => {
  let s = buildAndStaff(newCampaign(9), 'lumber_camp', 2).state;
  s = buildAndStaff(s, 'farm', 3).state;
  return applyTicks(s, 24 * 9 + 7);
};

describe('save / load', () => {
  it('round-trips the exact state through JSON, including PRNG state', () => {
    const state = midGame();
    const saved = createSaveFile(state);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const loaded = parseSaveText(JSON.stringify(saved.file));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state).toEqual(state);
    expect(loaded.state.rngState).toBe(state.rngState);
    // the future is identical too: buildings, stocks, workers, quests, growth rolls
    expect(applyTicks(loaded.state, 24 * 30)).toEqual(applyTicks(state, 24 * 30));
  });

  it('round-trips a finished chapter', () => {
    const { state } = playChapterOne(42);
    const saved = createSaveFile(state);
    if (!saved.ok) throw new Error('save failed');
    const loaded = parseSaveText(JSON.stringify(saved.file));
    expect(loaded.ok && loaded.state).toEqual(state);
  });

  it('refuses to save a corrupted state', () => {
    const bad = tweak(midGame(), (d) => void (d.provinces[d.homeProvinceId]!.stocks.wood = -5));
    const saved = createSaveFile(bad);
    expect(saved.ok).toBe(false);
  });

  it('rejects malformed or malicious imports', () => {
    const good = createSaveFile(midGame());
    if (!good.ok) throw new Error('save failed');
    const clone = (): Record<string, any> => JSON.parse(JSON.stringify(good.file)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const cases: [string, unknown][] = [
      ['not json', '{oops'],
      ['wrong format', JSON.stringify({ format: 'other', state: {} })],
      ['array', '[]'],
      ['missing state', JSON.stringify({ format: SAVE_FORMAT })],
    ];
    for (const [name, text] of cases) expect(parseSaveText(text as string).ok, name).toBe(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutations: [string, (f: Record<string, any>) => void][] = [
      ['negative stock', (f) => (f.state.provinces.bereket_vadisi.stocks.gold = -1)],
      ['fractional stock', (f) => (f.state.provinces.bereket_vadisi.stocks.gold = 1.5)],
      [
        'unknown building',
        (f) => (f.state.provinces.bereket_vadisi.buildings[0].definitionId = 'death_star'),
      ],
      ['extra key', (f) => (f.state.__proto__evil = '<script>alert(1)</script>')],
      ['too many workers', (f) => (f.state.provinces.bereket_vadisi.buildings[1].workers = 99)],
      ['future version', (f) => (f.state.schemaVersion = 999)],
      ['reward farming', (f) => (f.state.questProgress.q08.rewardGranted = true)],
      ['overlap', (f) => (f.state.provinces.bereket_vadisi.buildings[2].x = 11)],
      ['wrong home', (f) => (f.state.homeProvinceId = 'nowhere')],
      ['huge string', (f) => (f.state.provinces.bereket_vadisi.name = 'x'.repeat(5000))],
    ];
    for (const [name, mutate] of mutations) {
      const file = clone();
      mutate(file);
      expect(loadSaveFile(file).ok, name).toBe(false);
    }
    expect(parseSaveText('x'.repeat(6 * 1024 * 1024)).ok).toBe(false);
  });

  it('runs chained migrations and reports missing paths', () => {
    const migrations = {
      1: (d: Record<string, unknown>) => ({ ...d, addedInV2: true }),
      2: (d: Record<string, unknown>) => ({ ...d, renamed: d.old, old: undefined }),
    };
    const result = migrate({ schemaVersion: 1, old: 'value' }, 3, migrations);
    expect(result).toEqual({
      ok: true,
      data: { schemaVersion: 3, addedInV2: true, renamed: 'value', old: undefined },
    });
    expect(migrate({ schemaVersion: 0 }, 3, migrations)).toEqual({ ok: false, reason: 'noPath' });
    expect(migrate({ schemaVersion: 9 }, 3, migrations)).toEqual({ ok: false, reason: 'tooNew' });
    expect(migrate('nope')).toEqual({ ok: false, reason: 'notObject' });
    expect(migrate({})).toEqual({ ok: false, reason: 'noVersion' });
  });

  it('stores and restores slots in IndexedDB', async () => {
    const state = midGame();
    const saved = createSaveFile(state, new Date('2026-01-02T03:04:05Z'));
    if (!saved.ok) throw new Error('save failed');
    await writeSlot('slot1', saved.file);
    await writeSlot('auto', {
      ...saved.file,
      meta: { ...saved.file.meta, savedAt: '2026-02-01T00:00:00.000Z' },
    });
    const slots = await listSlots();
    expect(slots.map((s) => s.slotId)).toEqual(['auto', 'slot1']); // newest first
    expect(slots[1]!.meta).toMatchObject({
      seed: 9,
      tick: state.tick,
      population:
        12 +
        (home(state).population.adults - 8) +
        (home(state).population.children - 3) +
        (home(state).population.elders - 1),
    });
    const loaded = loadSaveFile(await readSlot('slot1'));
    expect(loaded.ok && loaded.state).toEqual(state);
    await deleteSlot('slot1');
    expect(await readSlot('slot1')).toBeUndefined();
  });
});
