import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { BUILDINGS } from '../game/data/buildings';
import { HEALTH_MIN_POPULATION, healthDayEnd, healthServices } from '../game/systems/health';
import { happinessFactors } from '../game/systems/population';
import { idx } from '../game/systems/grid';
import { buildingArtSeed, drawStyledBuilding } from '../game/rendering/arch/buildings';
import { DETAILED_CITY } from '../game/rendering/arch/cityDetail';
import { SEASON_PALETTE } from '../game/rendering/palette';
import { signWidth } from '../game/rendering/arch/kit';
import { t } from '../i18n';
import { home, newCampaign, tweak } from './helpers';

const withHospital = (workers: number, population = 40, road = false) => tweak(newCampaign(), (draft) => {
  const p = home(draft);
  p.population.adults = population;
  const hut = p.buildings.find((b) => b.definitionId === 'hut')!;
  p.buildings.push({ ...hut, id: 'hospital', definitionId: 'hospital', x: hut.x + 1, workers });
  if (road) {
    // asphalt along the front of the hut and the hospital
    const height = p.tiles[idx(p, hut.x, hut.y)]!.height;
    const asphalt = { road: true, paved: true, roadType: 'dirt' as const, height, buildingId: null };
    for (let x = hut.x; x <= hut.x + 4; x++) Object.assign(p.tiles[idx(p, x, hut.y + 2)]!, asphalt);
    Object.assign(p.tiles[idx(p, hut.x, hut.y + 1)]!, asphalt);
    for (const [x, y] of [[hut.x + 1, hut.y], [hut.x + 2, hut.y], [hut.x + 1, hut.y + 1], [hut.x + 2, hut.y + 1]] as const)
      Object.assign(p.tiles[idx(p, x, y)]!, { height, road: false, buildingId: 'hospital' });
  }
});

describe('health service', () => {
  it('has Turkish texts and a service radius', () => {
    expect(BUILDINGS.hospital.services?.healthRadius).toBe(8);
    expect(t('happiness.health')).toBe('Sağlık hizmeti');
  });

  it('covers nearby homes and lifts happiness only while staffed', () => {
    const staffed = healthServices(home(withHospital(4)));
    const empty = healthServices(home(withHospital(0)));
    expect(staffed.coverage).toBe(100);
    expect(staffed.happiness).toBeGreaterThan(0);
    expect(empty.coverage).toBe(0);
    expect(happinessFactors(home(withHospital(4))).find((f) => f.id === 'health')?.value).toBe(staffed.happiness);
  });

  it('has no emergencies in a small village', () => {
    expect(healthServices(home(withHospital(4, HEALTH_MIN_POPULATION - 10))).chance).toBe(0);
  });

  it('treats emergencies with a hospital and loses happiness without one, deterministically', () => {
    const run = (workers: number) => tweak(withHospital(workers), (draft) => {
      for (let day = 1; day <= 30; day++) healthDayEnd(draft, home(draft), day);
    });
    const treated = run(4);
    const keys = treated.eventLog.map((e) => e.key);
    expect(keys.some((k) => k === 'event.emergencyIllnessTreated' || k === 'event.emergencyAccidentTreated')).toBe(true);
    expect(keys.some((k) => k.endsWith('Untreated'))).toBe(false);
    const untreated = run(0);
    expect(untreated.eventLog.some((e) => e.key.endsWith('Untreated'))).toBe(true);
    expect(home(untreated).happiness).toBeLessThan(home(treated).happiness);
    expect(run(4)).toEqual(treated);
  });

  it('sends a real ambulance journey when an asphalt road links hospital and home', () => {
    const s = tweak(withHospital(4, 40, true), (draft) => {
      const p = home(draft);
      for (const b of p.buildings) b.connected = true;
      for (let day = 1; day <= 30 && !(draft.cityLife?.jobs.length); day++) healthDayEnd(draft, p, day);
    });
    const job = s.cityLife?.jobs.find((j) => j.kind === 'ambulance');
    expect(job?.source).toBe('hospital');
    expect(job?.stage).toBe('outbound');
  });
});

describe('detailed city art', () => {
  it('draws every detailed building in both cultures with lit windows and distinct shapes', () => {
    for (const definitionId of DETAILED_CITY) {
      const ops: number[] = [];
      for (const style of ['turkish', 'scottish'] as const) {
        const g = new Graphics();
        const info = drawStyledBuilding(g, { definitionId, style, look: null, level: 1, condition: 10000 }, SEASON_PALETTE.summer, 2, buildingArtSeed(definitionId));
        expect(info.lights.length, `${style} ${definitionId}`).toBeGreaterThan(4);
        // a wide airport rises entirely below its back corner, so its height can be 0
        if (definitionId !== 'airport' && definitionId !== 'park') expect(info.height, `${style} ${definitionId}`).toBeGreaterThan(10);
        const [w] = BUILDINGS[definitionId].footprint;
        expect(g.getLocalBounds().width, definitionId).toBeGreaterThan(w * 40);
        ops.push(g.context.instructions.length);
        g.destroy();
      }
      expect(ops[0], definitionId).not.toBe(ops[1]);
    }
    expect(signWidth('HAVALİMANI', 1.7)).toBeGreaterThan(signWidth('OTEL', 1.7));
  });

  it('paints neon in its own colour in the night pass', () => {
    const g = new Graphics();
    drawStyledBuilding(g, { definitionId: 'club', style: 'turkish', look: null, level: 1, condition: 10000 }, SEASON_PALETTE.summer, 2, 7, true);
    const fills = g.context.instructions.map((i) => (i.data as { style?: { color?: number } }).style?.color).filter((c) => c !== undefined);
    expect(fills).toContain(0xff3fd0);
    expect(fills).toContain(0x34e6ff);
    g.destroy();
  });
});
