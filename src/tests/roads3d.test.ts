import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import type { RoadType, TerrainId } from '../game/core/types';
import { newCampaign, home, tweak } from './helpers';
import { BRIDGE_DECK_PX, drawGroundTile } from '../game/rendering/sprites';
import { SEASON_PALETTE } from '../game/rendering/palette';
import { LEVEL_H } from '../game/rendering3d/geo';
import { buildModel, buildSite } from '../game/rendering3d/buildings3d';
import { BUILDINGS, BUILDING_IDS } from '../game/data/buildings';
import { DIRS, drivableLinks, lanePoint, opposite, roadNode, tileCentrelines } from '../game/rendering3d/roads3d';

interface Spec {
  x: number;
  y: number;
  height?: number;
  roadType?: RoadType;
  paved?: boolean;
  terrain?: TerrainId;
}

/** A province with exactly the given road tiles around (12, 12); everything else is cleared. */
function roads(specs: Spec[]) {
  return home(
    tweak(newCampaign(42), (draft) => {
      const p = draft.provinces[draft.homeProvinceId]!;
      for (let y = 8; y < 17; y++)
        for (let x = 8; x < 17; x++) {
          const t = p.tiles[y * p.width + x]!;
          t.road = false;
          t.paved = false;
          t.roadType = 'dirt';
          t.height = 0;
          t.terrain = 'grass';
        }
      for (const s of specs) {
        const t = p.tiles[s.y * p.width + s.x]!;
        t.road = true;
        t.roadType = s.roadType ?? 'dirt';
        t.paved = s.paved ?? false;
        t.height = s.height ?? 0;
        if (s.terrain) t.terrain = s.terrain;
      }
    }),
  );
}

const near = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('3D road lanes', () => {
  it('runs straight from the entry edge to the exit edge', () => {
    const p = roads([{ x: 11, y: 12 }, { x: 12, y: 12 }, { x: 13, y: 12 }]);
    const node = roadNode(p, 12, 12)!;
    expect(node.links).toEqual([true, false, true, false]);
    const a = lanePoint(12, 12, node, 2, 0, 0);
    const b = lanePoint(12, 12, node, 2, 0, 1);
    near(a.x, 12);
    near(b.x, 13);
    near(a.z, 12.5);
    near(b.z, 12.5);
    near(a.hx, 1);
  });

  it('turns corners on a quarter circle, so a bend has no kink', () => {
    const p = roads([{ x: 11, y: 12 }, { x: 12, y: 12 }, { x: 12, y: 13 }]);
    const node = roadNode(p, 12, 12)!;
    // enter from -x (side 2), leave towards +y (side 1): centre of the arc is the shared corner
    for (let i = 0; i <= 10; i++) {
      const q = lanePoint(12, 12, node, 2, 1, i / 10);
      near(Math.hypot(q.x - 12, q.z - 13), 0.5);
      near(Math.hypot(q.hx, q.hz), 1);
      // travel direction is tangent to the circle
      expect(Math.abs((q.x - 12) * q.hx + (q.z - 13) * q.hz)).toBeLessThan(1e-9);
    }
    const start = lanePoint(12, 12, node, 2, 1, 0);
    near(start.hx, 1);
    const end = lanePoint(12, 12, node, 2, 1, 1);
    near(end.hz, 1);
    expect(tileCentrelines(12, 12, node)[0]!.length).toBeGreaterThan(4);
  });

  it('keeps a vehicle in its lane across tile borders and through bends', () => {
    const p = roads([{ x: 11, y: 12, paved: true }, { x: 12, y: 12, paved: true }, { x: 12, y: 13, paved: true }, { x: 12, y: 14, paved: true }]);
    const lane = 0.11;
    const hops: [number, number, number, number][] = [
      [11, 12, -1, 0],
      [12, 12, 2, 1],
      [12, 13, 3, 1],
    ];
    for (let i = 0; i < hops.length - 1; i++) {
      const [ax, ay, ain, aout] = hops[i]!;
      const [bx, by, bin, bout] = hops[i + 1]!;
      expect(bin).toBe(opposite(aout));
      const leave = lanePoint(ax, ay, roadNode(p, ax, ay)!, ain, aout, 1, lane);
      const enter = lanePoint(bx, by, roadNode(p, bx, by)!, bin, bout, 0, lane);
      near(leave.x, enter.x);
      near(leave.z, enter.z);
      near(leave.hx, enter.hx);
      near(leave.hz, enter.hz);
    }
    // right-hand traffic: heading +y keeps to the -x half of the tile
    expect(lanePoint(12, 13, roadNode(p, 12, 13)!, 3, 1, 0.5, lane).x).toBeLessThan(12.5);
  });

  it('puts the ramp on the lower tile and meets the upper road exactly at the edge', () => {
    const p = roads([{ x: 12, y: 12, roadType: 'stairs' }, { x: 13, y: 12, height: 1 }]);
    const low = roadNode(p, 12, 12)!;
    const high = roadNode(p, 13, 12)!;
    near(low.y, 0);
    near(low.edgeY[0], LEVEL_H);
    near(high.edgeY[2], LEVEL_H);
    near(lanePoint(12, 12, low, -1, 0, 1).y, lanePoint(13, 12, high, 2, -1, 0).y);
  });
});

describe('bridges join the road without a step', () => {
  const p = roads([
    { x: 10, y: 12 },
    { x: 11, y: 12, roadType: 'bridge', terrain: 'water' },
    { x: 12, y: 12, roadType: 'bridge', terrain: 'water' },
    { x: 13, y: 12, paved: true },
    { x: 14, y: 12, paved: true },
  ]);

  it('3D: the deck is level with both banks', () => {
    const bank = roadNode(p, 10, 12)!;
    const deck = roadNode(p, 11, 12)!;
    expect(deck.kind).toBe('bridge');
    near(deck.y, bank.y);
    for (const side of [0, 2]) near(deck.edgeY[side]!, bank.edgeY[0]!);
    const off = lanePoint(10, 12, bank, -1, 0, 1);
    const on = lanePoint(11, 12, deck, 2, 0, 0);
    near(off.y, on.y);
    near(off.x, on.x);
  });

  it('3D: cars can drive from the asphalt across the bridge', () => {
    expect(drivableLinks(p, 12, 12).sort()).toEqual([0, 2]);
    expect(drivableLinks(p, 13, 12)).toContain(2);
    // a dirt track is not a carriageway
    expect(drivableLinks(p, 11, 12)).toEqual([0]);
  });

  it('2D: the deck stays low and tapers into the bank', () => {
    expect(BRIDGE_DECK_PX).toBeLessThanOrEqual(3);
    for (const ends of [{ start: true, end: false }, { start: false, end: true }, { start: false, end: false }]) {
      const g = new Graphics();
      drawGroundTile(g, 11, 12, 'water', 0, true, SEASON_PALETTE.summer, { height: 0, frontLeft: 0, frontRight: 0 }, 'bridge', 2, false,
        { negX: true, posX: true, negY: false, posY: false }, false, ends);
      expect(g.context.instructions.length).toBeGreaterThan(6);
    }
  });
});

describe('3D building models', () => {
  it('builds a non-empty model inside its footprint for every building and culture', () => {
    for (const id of BUILDING_IDS) {
      const [w, d] = BUILDINGS[id].footprint;
      for (const style of ['turkish', 'scottish'] as const) {
        for (const model of [buildModel({ definitionId: id, style, look: null, level: 1 }), buildSite({ definitionId: id, style, look: null, level: 1 }, 0.5)]) {
          model.body.computeBoundingBox();
          const box = model.body.boundingBox!;
          expect(model.body.getAttribute('position').count).toBeGreaterThan(30);
          expect(model.height).toBeGreaterThan(0.05);
          expect(box.min.x).toBeGreaterThan(-0.08);
          expect(box.min.z).toBeGreaterThan(-0.08);
          expect(box.max.x).toBeLessThan(w + 0.08);
          expect(box.max.z).toBeLessThan(d + 0.08);
          expect(box.min.y).toBeGreaterThan(-1e-6);
        }
      }
    }
  });
});

describe('side indexes', () => {
  it('opposite sides face each other', () => {
    for (let s = 0; s < 4; s++) {
      const [ax, ay] = DIRS[s]!;
      const [bx, by] = DIRS[opposite(s)]!;
      expect(ax + bx).toBe(0);
      expect(ay + by).toBe(0);
    }
  });
});
