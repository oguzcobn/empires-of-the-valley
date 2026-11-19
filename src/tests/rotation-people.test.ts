import { describe, expect, it } from 'vitest';
import { buildAndStaff, newCampaign } from './helpers';
import { homeProvince } from '../game/systems/economy';
import { citizenAt, workersOf } from '../game/data/citizens';
import { personProfile } from '../game/rendering/people';
import {
  footprintOf, rotDir, rotPoint, rotRect, rotTile, rotateGame, rotateProvince, unrotRect, unrotTile,
} from '../game/rendering/rotation';
import type { Rotation } from '../game/rendering/rotation';

const ROTS: Rotation[] = [0, 1, 2, 3];

describe('camera rotation', () => {
  it('turns tiles and points consistently and undoes them', () => {
    for (const r of ROTS)
      for (const [x, y] of [[0, 0], [5, 2], [31, 17]] as const) {
        const [rx, ry] = rotTile(x, y, 40, 32, r);
        expect(unrotTile(rx, ry, 40, 32, r)).toEqual([x, y]);
        // the centre of a tile stays the centre of its rotated tile
        const [cx, cy] = rotPoint(x + 0.5, y + 0.5, 40, 32, r);
        expect([cx - 0.5, cy - 0.5]).toEqual([rx, ry]);
      }
  });

  it('four quarter turns are a full circle', () => {
    let [x, y] = [3, 7];
    let [w, h] = [20, 12];
    for (let i = 0; i < 4; i++) {
      [x, y] = rotTile(x, y, w, h, 1);
      [w, h] = [h, w];
    }
    expect([x, y]).toEqual([3, 7]);
    expect(rotDir(1, 0, 1)).toEqual([0, 1]);
    expect(rotDir(1, 0, 2)).toEqual([-1, 0]);
  });

  it('maps footprints both ways', () => {
    for (const r of ROTS) {
      const rect = rotRect(4, 6, 8, 4, 40, 40, r);
      expect(rect.w * rect.h).toBe(32);
      expect(unrotRect(rect.x, rect.y, rect.w, rect.h, 40, 40, r)).toEqual({ x: 4, y: 6, w: 8, h: 4 });
    }
  });

  it('rotates the whole home province: tiles, buildings and their footprint tiles', () => {
    const s = newCampaign(7, 'turkish');
    const p = homeProvince(s);
    for (const r of ROTS) {
      const q = rotateProvince(p, r);
      expect(q.tiles.length).toBe(p.tiles.length);
      for (const b of q.buildings) {
        const [w, h] = footprintOf(b);
        for (let y = b.y; y < b.y + h; y++)
          for (let x = b.x; x < b.x + w; x++) expect(q.tiles[y * q.width + x]!.buildingId).toBe(b.id);
      }
      // cached: the renderer sees the same arrays until the map changes
      expect(rotateProvince(p, r)).toBe(q);
      expect(homeProvince(rotateGame(s, r)).buildings.length).toBe(p.buildings.length);
    }
  });
});

describe('townspeople', () => {
  it('gives working adults the job of a real workplace', () => {
    const s = buildAndStaff(newCampaign(11, 'turkish'), 'farm', 2).state;
    const p = homeProvince(s);
    const staffed = p.buildings.find((b) => b.workers > 0 && b.state === 'active');
    expect(staffed).toBeDefined();
    const staff = workersOf(s, staffed!.id);
    expect(staff.length).toBeGreaterThan(0);
    const person = citizenAt(s, staff[0]!);
    expect(person.workplaceId).toBe(staffed!.id);
    expect(person.stage).toBe('adult');
    expect(person.age).toBeGreaterThanOrEqual(20);
  });

  it('describes children, elders and soldiers sensibly', () => {
    const s = newCampaign(11, 'turkish');
    const { adults, elders, children } = homeProvince(s).population;
    if (children) expect(citizenAt(s, adults + elders).stage).toBe('child');
    if (elders) expect(citizenAt(s, adults).occupation).toBe('Emekli');
    const soldier = personProfile(s, { kind: 'soldier', index: 0 });
    expect(soldier.name.startsWith('Teğmen ')).toBe(true);
    expect(personProfile(s, { kind: 'soldier', index: 5 }).name.startsWith('Er ')).toBe(true);
  });

  it('keeps a person the same between calls and honours renaming', () => {
    const s = newCampaign(11, 'turkish');
    expect(citizenAt(s, 3)).toEqual(citizenAt(s, 3));
    const renamed = { ...s, citizenNames: { '3': 'Lale Çoban' } };
    expect(personProfile(renamed, { kind: 'citizen', index: 3 }).name).toBe('Lale Çoban');
  });
});
