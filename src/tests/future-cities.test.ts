import { describe, expect, it } from 'vitest';
import { CITIES, cityForCulture, cityOf, districtName } from '../game/data/cities';
import { isPlayableStyle } from '../game/data/architecture';
import { createNewGame } from '../game/scenarios/newGame';
import { createSaveFile, loadSaveFile } from '../game/save/serialize';

describe('four playable city identities and save compatibility', () => {
  it('maps the four cultures to distinct cities and 24 districts', () => {
    expect(cityForCulture('turkish')).toBe('trabzon');
    expect(cityForCulture('scottish')).toBe('edinburgh');
    expect(cityForCulture('japanese')).toBe('kyoto');
    expect(cityForCulture('medieval_european')).toBe('prague');
    for (const city of Object.values(CITIES)) {
      expect(city.districts).toHaveLength(24);
      expect(cityOf(city.id, city.culture).name).toBe(city.name);
      expect(districtName(city.id, city.culture, 0)).toBe(city.districts[0]);
    }
  });

  it('creates valid new games for Kyoto and Prague', () => {
    expect(CITIES.kyoto.playable).toBe(true);
    expect(CITIES.prague.playable).toBe(true);
    expect(isPlayableStyle('japanese')).toBe(true);
    expect(isPlayableStyle('medieval_european')).toBe(true);
    expect(createNewGame({ seed: 42, mode: 'sandbox', culture: 'japanese' }).cityId).toBe('kyoto');
    expect(createNewGame({ seed: 42, mode: 'sandbox', culture: 'medieval_european' }).cityId).toBe('prague');
  });

  it('preserves existing playable saves', () => {
    const original = createNewGame({ seed: 42, mode: 'sandbox', culture: 'turkish' });
    const saved = createSaveFile(original);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const result = loadSaveFile(saved.file);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.cityId).toBe('trabzon');
  });
});
