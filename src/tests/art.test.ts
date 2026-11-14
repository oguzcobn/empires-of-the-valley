import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { ArchitectureStyle, BuildingId } from '../game/core/types';
import { PLAYABLE_STYLES } from '../game/data/architecture';
import { BUILDINGS, BUILDING_IDS } from '../game/data/buildings';
import { drawStyledBuilding, drawStyledConstruction } from '../game/rendering/arch/buildings';
import { SEASON_PALETTE } from '../game/rendering/palette';
import { nightFactor, weatherFor } from '../game/rendering/weather';

const draw = (id: BuildingId, style: ArchitectureStyle, level: number, detail: 0 | 1 | 2, condition = 10000) => {
  const g = new Graphics();
  const info = drawStyledBuilding(g, { definitionId: id, style, look: null, level, condition }, SEASON_PALETTE.summer, detail, 99);
  const ops = g.context.instructions.length;
  g.destroy();
  return { info, ops };
};

describe('procedural architecture art', () => {
  it('draws every building of every culture and level, with windows that light up at night', () => {
    for (const style of PLAYABLE_STYLES)
      for (const id of BUILDING_IDS)
        for (let level = 1; level <= BUILDINGS[id].levels.length; level++) {
          const { info, ops } = draw(id, style, level, 2);
          expect(ops, `${style} ${id} ${level}`).toBeGreaterThan(40);
          const [w, h] = BUILDINGS[id].footprint;
          expect(info.height + (w + h) * 8, `${style} ${id} ${level}`).toBeGreaterThan(12);
          if (!['farm', 'quarry', 'terrace_farm'].includes(id) && !BUILDINGS[id].landmark) expect(info.lights.length, `${style} ${id}`).toBeGreaterThan(0);
        }
  });

  it('cultures are geometrically different, not recoloured copies', () => {
    for (const id of BUILDING_IDS.filter((x) => !BUILDINGS[x].landmark)) {
      const a = draw(id, 'scottish', 1, 2);
      const b = draw(id, 'turkish', 1, 2);
      expect(a.ops === b.ops && a.info.height === b.info.height, id).toBe(false);
    }
  });

  it('historic landmarks are large, detailed sprites', () => {
    for (const id of BUILDING_IDS.filter((x) => BUILDINGS[x].landmark)) {
      const { info, ops } = draw(id, BUILDINGS[id].landmark!.culture as 'scottish' | 'turkish', 1, 2);
      expect(ops, id).toBeGreaterThan(30);
      expect(info.height + BUILDINGS[id].footprint[0] * 16, id).toBeGreaterThan(40);
    }
  });

  it('quality levels change the amount of detail', () => {
    const low = draw('hut', 'scottish', 2, 0).ops;
    const mid = draw('hut', 'scottish', 2, 1).ops;
    const high = draw('hut', 'scottish', 2, 2).ops;
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThanOrEqual(high);
  });

  it('worn buildings show weathering and construction sites draw', () => {
    expect(draw('hut', 'turkish', 1, 2, 2000).ops).toBeGreaterThan(draw('hut', 'turkish', 1, 2).ops);
    const g = new Graphics();
    expect(drawStyledConstruction(g, 2, 2, 0.5, 'scottish', 2, 1).height).toBeGreaterThan(20);
  });

  it('weather and daylight are deterministic visual functions', () => {
    expect(weatherFor(42, 10, 'summer')).toBe(weatherFor(42, 10, 'summer'));
    expect(new Set(Array.from({ length: 60 }, (_, d) => weatherFor(7, d, 'winter')))).toContain('snow');
    expect(nightFactor(12)).toBe(0);
    expect(nightFactor(23)).toBe(1);
    expect(nightFactor(19)).toBeGreaterThan(0);
  });
});
