import { SCHEMA_VERSION } from '../data/balance';

/** A migration upgrades raw save data from version N to N+1. Register new ones by source version. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Phase 1 ships schema version 1, so the registry is empty. When Phase 2 changes the format
 * (e.g. farms producing grain instead of food), add `1: (data) => ...` here and bump
 * SCHEMA_VERSION; the pipeline below and its tests already cover chained upgrades.
 */
export const MIGRATIONS: Record<number, Migration> = {};

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
