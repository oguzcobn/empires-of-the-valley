import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { BUILDINGS } from '../game/data/buildings';
import { executeCommand } from '../game/systems/commands';
import { HEALTH_MIN_POPULATION, healthDayEnd, healthServices } from '../game/systems/health';
import { happinessFactors } from '../game/systems/population';
import { idx, tileAt } from '../game/systems/grid';
import { SERVICE_BAYS, fleetSize } from '../game/rendering/serviceBays';
import { beatTiles, findDrivePath, gateTiles, laneWaypoints, roadNear } from '../game/rendering/serviceRoutes';
import { drawBeacon, drawServiceVehicle } from '../game/rendering/trafficSprites';
import { buildingArtSeed, drawStyledBuilding } from '../game/rendering/arch/buildings';
import { SEASON_PALETTE } from '../game/rendering/palette';
import { signWidth } from '../game/rendering/arch/kit';
import { t } from '../i18n';
import { expectValid, home, newCampaign, tweak } from './helpers';

const withHospital = (workers: number, population = 40) => tweak(newCampaign(), (draft) => {
  const p = home(draft);
  p.population.adults = population;
  const hut = p.buildings.find((b) => b.definitionId === 'hut')!;
  p.buildings.push({ ...hut, id: 'hospital', definitionId: 'hospital', x: hut.x + 1, workers });
});

describe('hospital', () => {
  it('is a buildable 3x2 civic building with Turkish texts', () => {
    const def = BUILDINGS.hospital;
    expect(def.footprint).toEqual([3, 2]);
    expect(def.buildable).toBe(true);
    expect(def.services?.healthRadius).toBe(8);
    expect(t('building.hospital.name')).toBe('Hastane');
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
    expect(treated.eventLog.filter((e) => e.key.startsWith('event.emergency')).every((e) => e.at)).toBe(true);
    const untreated = run(0);
    expect(untreated.eventLog.some((e) => e.key.endsWith('Untreated'))).toBe(true);
    expect(home(untreated).happiness).toBeLessThan(home(treated).happiness);
    expect(run(4)).toEqual(treated);
  });

  it('can be placed with the normal build command', () => {
    const s = tweak(newCampaign(), (draft) => {
      const p = home(draft);
      p.population.adults = 30;
      p.stocks.wood = p.stocks.stone = p.stocks.gold = p.stocks.tools = 90_000;
    });
    const p = home(s);
    let placed = false;
    for (let y = 0; y < p.height - 2 && !placed; y++) {
      for (let x = 0; x < p.width - 3 && !placed; x++) {
        const result = executeCommand(s, { type: 'placeBuilding', buildingId: 'hospital', x, y });
        if (result.ok) {
          placed = true;
          expect(home(result.state).buildings.some((b) => b.definitionId === 'hospital')).toBe(true);
          expectValid(result.state);
        }
      }
    }
    expect(placed).toBe(true);
  });
});

describe('emergency vehicle routes', () => {
  const roadLine = () => tweak(newCampaign(), (draft) => {
    const p = home(draft);
    for (let x = 2; x <= 9; x++) Object.assign(p.tiles[idx(p, x, 3)]!, { road: true, roadType: 'dirt', height: 0, terrain: 'grass', buildingId: null });
    for (let y = 3; y <= 7; y++) Object.assign(p.tiles[idx(p, 9, y)]!, { road: true, roadType: 'dirt', height: 0, terrain: 'grass', buildingId: null });
  });

  it('finds drivable paths and refuses stairways', () => {
    const s = roadLine();
    expect(findDrivePath(home(s), [2, 3], [9, 7])).toHaveLength(12);
    const stairs = tweak(s, (draft) => { home(draft).tiles[idx(home(draft), 5, 3)]!.roadType = 'stairs'; });
    expect(findDrivePath(home(stairs), [2, 3], [9, 7])).toBeNull();
  });

  it('keeps to its lane and squares corners inside the junction tile', () => {
    const tiles: [number, number][] = [[2, 3], [3, 3], [4, 3], [4, 4], [4, 5]];
    const points = laneWaypoints(tiles, false);
    expect(points).toHaveLength(tiles.length);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      const axisAligned = Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9;
      expect(axisAligned).toBe(true);
    }
    for (const point of points) {
      expect(Math.floor(point.x)).toBe(point.tile[0]);
      expect(Math.floor(point.y)).toBe(point.tile[1]);
    }
    expect(points[1]!.y).not.toBe(laneWaypoints(tiles, true)[1]!.y);
  });

  it('finds the gate road, the scene road and the patrol beat of a station', () => {
    const s = tweak(roadLine(), (draft) => {
      const p = home(draft);
      const hut = p.buildings.find((b) => b.definitionId === 'hut')!;
      p.buildings.push({ ...hut, id: 'police', definitionId: 'police_station', x: 4, y: 1, workers: 2 });
    });
    const p = home(s);
    const station = p.buildings.find((b) => b.id === 'police')!;
    const gates = gateTiles(p, station, [4.6, 2.6]);
    expect(gates.length).toBeGreaterThan(0);
    expect(gates.every(([x, y]) => tileAt(p, x, y)?.road)).toBe(true);
    expect(roadNear(p, { x: 9, y: 9 })).toEqual([9, 7]);
    expect(roadNear(p, { x: 20, y: 20 }, 2)).toBeNull();
    expect(beatTiles(p, station, 5).length).toBeGreaterThan(5);
  });

  it('fields one vehicle per staffed bay', () => {
    expect(fleetSize('hospital', 0)).toBe(0);
    expect(fleetSize('hospital', 4)).toBe(SERVICE_BAYS.hospital!.bays.length);
    expect(fleetSize('police_station', 1)).toBe(1);
    expect(fleetSize('market', 3)).toBe(0);
  });
});

describe('emergency art', () => {
  it('draws hospital and police buildings with signs that glow at night', () => {
    for (const definitionId of ['hospital', 'police_station'] as const) {
      const g = new Graphics();
      const b = { ...home(newCampaign()).buildings[0]!, id: definitionId, definitionId, look: null, level: 1, state: 'active' as const };
      const info = drawStyledBuilding(g, b, SEASON_PALETTE.summer, 2, buildingArtSeed(b.id));
      expect(info.lights.length).toBeGreaterThan(4);
      expect(info.height).toBeGreaterThan(25);
      expect(g.getLocalBounds().width).toBeGreaterThan(80);
    }
    expect(signWidth('HASTANE', 1.7)).toBeGreaterThan(signWidth('POLİS', 1.7));
  });

  it('draws ambulances, police cars and flashing light bars in every heading', () => {
    for (const kind of ['ambulance', 'police'] as const) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const g = new Graphics();
        drawServiceVehicle(g, kind, dx, dy);
        const bounds = g.getLocalBounds();
        expect(Number.isFinite(bounds.width) && bounds.width > 10).toBe(true);
        const beacon = new Graphics();
        drawBeacon(beacon, kind, dx, dy, 0, true, 1);
        const lit = beacon.getLocalBounds().width;
        drawBeacon(beacon, kind, dx, dy, 0, false, 0);
        expect(lit).toBeGreaterThan(beacon.getLocalBounds().width);
      }
    }
  });
});
