import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { produce } from 'immer';
import { newCampaign, home } from './helpers';
import { clockHour } from '../game/core/time';
import { nightFactor } from '../game/rendering/weather';
import { getPavedLinks, junctionKind } from '../game/rendering/roadGeometry';
import { drawGroundTile } from '../game/rendering/sprites';
import { drawCityCar } from '../game/rendering/trafficSprites';
import { SEASON_PALETTE } from '../game/rendering/palette';

describe('night matches the clock in the HUD', () => {
  it('becomes evening at 19:00 and stays dark through 04:00', () => {
    expect(clockHour(13)).toBe(19);
    expect(nightFactor(clockHour(12))).toBe(0);  // 18:00
    expect(nightFactor(clockHour(13))).toBeGreaterThan(0);
    expect(nightFactor(clockHour(14))).toBe(1);  // 20:00
    expect(nightFactor(clockHour(22))).toBe(1);  // 04:00
  });
  it('brightens at 05:00 and has full daylight from 06:00', () => {
    expect(clockHour(23)).toBe(5);
    expect(nightFactor(clockHour(23))).toBeLessThan(1);
    expect(nightFactor(clockHour(0))).toBe(0);
    expect(nightFactor(clockHour(24))).toBe(0);
    expect(nightFactor(24)).toBe(1);
  });
});

describe('connected asphalt street topology', () => {
  const center = [12, 12] as const;
  const make = (neighbors: [number, number][], neighborHeight = 0) => {
    const s = newCampaign(42);
    return home(produce(s, (draft) => {
      const p = draft.provinces[draft.homeProvinceId]!;
      const set = (x: number, y: number, height = 0) => {
        const tile = p.tiles[y * p.width + x]!;
        tile.road = true;
        tile.roadType = 'dirt';
        tile.paved = true;
        tile.height = height;
      };
      set(...center);
      for (const [x, y] of neighbors) set(x, y, neighborHeight);
    }));
  };
  it('joins straight stretches, bends, T-junctions and four-way junctions', () => {
    const east = [13, 12] as [number, number], west = [11, 12] as [number, number];
    const north = [12, 11] as [number, number], south = [12, 13] as [number, number];
    const kind = (neighbors: [number, number][]) =>
      junctionKind(getPavedLinks(make(neighbors), ...center));
    expect(kind([])).toBe('isolated');
    expect(kind([east])).toBe('end');
    expect(kind([east, west])).toBe('straight');
    expect(kind([east, north])).toBe('corner');
    expect(kind([east, west, north])).toBe('tee');
    expect(kind([east, west, north, south])).toBe('cross');
  });
  it('does not draw a seamless connection across elevation changes', () => {
    const links = getPavedLinks(make([[13, 12]], 1), ...center);
    expect(links.posX).toBe(false);
    expect(junctionKind(links)).toBe('isolated');
  });
  it('renders connected road geometry without errors at all intersection types', () => {
    const samples: [number, number][][] = [
      [], [[13, 12]], [[13, 12], [11, 12]],
      [[13, 12], [12, 11]], [[13, 12], [11, 12], [12, 11]],
      [[13, 12], [11, 12], [12, 11], [12, 13]],
    ];
    for (const neighbors of samples) {
      const p = make(neighbors);
      const g = new Graphics();
      drawGroundTile(g, 12, 12, 'grass', 1, true, SEASON_PALETTE.spring,
        { height: 0, frontLeft: 0, frontRight: 0 }, 'dirt', 2, true,
        getPavedLinks(p, ...center));
      expect(g.context.instructions.length).toBeGreaterThan(4);
      g.destroy();
    }
  });
});

describe('isometric vehicle sprite', () => {
  it('creates detailed upright cars for each traffic direction', () => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const g = new Graphics();
      drawCityCar(g, 0xe8e3db, true, dx, dy);
      expect(g.context.instructions.length).toBeGreaterThan(15);
      g.destroy();
    }
  });
});
