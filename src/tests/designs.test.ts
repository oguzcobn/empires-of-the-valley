import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { defaultLook } from '../game/data/architecture';
import { resetDbConnection } from '../game/save/db';
import {
  DESIGN_FORMAT,
  cleanName,
  deleteDesign,
  exportDesigns,
  importDesigns,
  listDesigns,
  newDesignId,
  parseDesignFile,
  putDesign,
} from '../game/save/designs';
import type { DesignRecord } from '../game/save/designs';
import { maxFloors, renderLook } from '../game/systems/architecture';

const design = (over: Partial<DesignRecord> = {}): DesignRecord => ({
  id: newDesignId(1700000000000, 0.5),
  name: 'Kıyı konağı',
  buildingId: 'hut',
  style: 'turkish',
  look: { ...defaultLook('turkish', 'hut', 3), roofMaterial: 'slate', tower: 'turret' },
  createdAt: '2026-11-13T10:00:00.000Z',
  ...over,
});

describe('workshop designs', () => {
  it('export -> import round-trips and is strictly validated', () => {
    const text = exportDesigns([design()]);
    const parsed = parseDesignFile(text);
    expect(parsed.ok && parsed.designs[0]).toEqual(design());
    const bad = (mutate: (o: Record<string, unknown>) => void): boolean => {
      const o = JSON.parse(text) as Record<string, unknown>;
      mutate(o);
      return parseDesignFile(JSON.stringify(o)).ok;
    };
    expect(bad(() => undefined)).toBe(true);
    expect(bad((o) => (o.format = 'other'))).toBe(false);
    expect(bad((o) => ((o.designs as Record<string, unknown>[])[0]!.buildingId = 'quarry'))).toBe(false); // not designable
    expect(bad((o) => ((o.designs as Record<string, unknown>[])[0]!.style = 'japanese'))).toBe(true); // supported culture
    expect(bad((o) => ((o.designs as Record<string, unknown>[])[0]!.style = 'unknown_style'))).toBe(false);
    expect(bad((o) => (((o.designs as Record<string, unknown>[])[0]!.look as Record<string, unknown>).roof = 'pagoda'))).toBe(false);
    expect(bad((o) => ((o.designs as Record<string, unknown>[])[0]!.name = '<img src=x onerror=alert(1)>'))).toBe(false);
    expect(bad((o) => ((o.designs as Record<string, unknown>[])[0]!.extra = 1))).toBe(false);
    expect(bad((o) => (o.designs = []))).toBe(false);
    expect(parseDesignFile('{nope').ok).toBe(false);
    expect(parseDesignFile('x'.repeat(300 * 1024)).ok).toBe(false);
    expect(JSON.parse(text).format).toBe(DESIGN_FORMAT);
  });

  it('cleans names', () => {
    expect(cleanName('  Yeni   <b>ev</b>  ')).toBe('Yeni bev/b');
  });

  it('stores, lists, imports with fresh ids and deletes in IndexedDB', async () => {
    resetDbConnection();
    const d = design();
    await putDesign(d);
    expect((await listDesigns()).map((x) => x.id)).toContain(d.id);
    const n = await importDesigns([d]);
    expect(n).toBe(1);
    const all = await listDesigns();
    expect(all.filter((x) => x.name === d.name)).toHaveLength(2);
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    await expect(putDesign({ ...d, look: { ...d.look, wall: 'adobe' as never } })).rejects.toThrow();
    await deleteDesign(d.id);
    expect((await listDesigns()).map((x) => x.id)).not.toContain(d.id);
  });

  it('a tall design only shows its full height once the building is upgraded', () => {
    const look = { ...defaultLook('scottish', 'hut', 3), floors: 4 as const };
    expect(renderLook({ definitionId: 'hut', style: 'scottish', look, level: 1 }).floors).toBe(maxFloors('hut', 1));
    expect(renderLook({ definitionId: 'hut', style: 'scottish', look, level: 3 }).floors).toBe(4);
    expect(renderLook({ definitionId: 'hut', style: 'scottish', look: null, level: 1 })).toEqual(defaultLook('scottish', 'hut', 1));
  });
});
