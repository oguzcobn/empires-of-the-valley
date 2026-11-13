import { CONDITION_MAX, LEGACY_STYLE } from '../data/architecture';
import { SCHEMA_VERSION } from '../data/balance';

/** A migration upgrades raw save data from version N to N+1. Register new ones by source version. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * v1 -> v2 (architecture update): every building gains a culture, an optional custom look and a
 * structural condition. Saves from before architecture existed get the legacy default culture
 * and perfect condition, so nothing changes for the player except the new art.
 * Malformed input is passed through untouched; the strict schema rejects it afterwards.
 */
function v1ToV2(data: Record<string, unknown>): Record<string, unknown> {
  const provinces = isObj(data.provinces) ? data.provinces : null;
  const nextProvinces: Record<string, unknown> = {};
  if (provinces) {
    for (const [id, raw] of Object.entries(provinces)) {
      if (!isObj(raw) || !Array.isArray(raw.buildings)) {
        nextProvinces[id] = raw;
        continue;
      }
      nextProvinces[id] = {
        ...raw,
        buildings: raw.buildings.map((b) =>
          isObj(b) ? { style: LEGACY_STYLE, look: null, condition: CONDITION_MAX, ...b } : b,
        ),
      };
    }
  }
  return { culture: LEGACY_STYLE, ...data, ...(provinces ? { provinces: nextProvinces } : {}) };
}

/** Registry of format upgrades, keyed by source version. Chains run in order (1 -> 2 -> ...). */
export const MIGRATIONS: Record<number, Migration> = { 1: v1ToV2 };

export type MigrationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; reason: 'notObject' | 'noVersion' | 'tooNew' | 'noPath' };

export function migrate(
  raw: unknown,
  target: number = SCHEMA_VERSION,
  migrations: Record<number, Migration> = MIGRATIONS,
): MigrationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return { ok: false, reason: 'notObject' };
  let data = raw as Record<string, unknown>;
  const found = data.schemaVersion;
  if (typeof found !== 'number' || !Number.isInteger(found) || found < 0)
    return { ok: false, reason: 'noVersion' };
  let version: number = found;
  if (version > target) return { ok: false, reason: 'tooNew' };
  while (version < target) {
    const step = migrations[version];
    if (!step) return { ok: false, reason: 'noPath' };
    version += 1;
    data = { ...step(data), schemaVersion: version };
  }
  return { ok: true, data };
}
