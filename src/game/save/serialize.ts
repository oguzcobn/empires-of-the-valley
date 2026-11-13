import { calendar } from '../core/time';
import type { GameState, MessageRef } from '../core/types';
import { GAME_VERSION } from '../data/balance';
import { homeProvince, totalPopulation } from '../systems/economy';
import { validateInvariants } from '../systems/invariants';
import { ensureQuestProgress } from '../systems/quests';
import { migrate } from './migrations';
import { parseGameState } from './schema';

export const SAVE_FORMAT = 'empires-of-the-valley-save';
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export interface SaveMeta {
  savedAt: string;
  gameVersion: string;
  schemaVersion: number;
  seed: number;
  mode: GameState['mode'];
  tick: number;
  day: number;
  population: number;
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  meta: SaveMeta;
  state: GameState;
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; error: MessageRef };

/** Wraps a state for storage. Refuses states that violate simulation invariants. */
export function createSaveFile(
  state: GameState,
  now: Date = new Date(),
): { ok: true; file: SaveFile } | { ok: false; error: MessageRef } {
  const problems = validateInvariants(state);
  if (problems.length)
    return { ok: false, error: { key: 'save.err.corruptState', params: { detail: problems[0]! } } };
  return {
    ok: true,
    file: {
      format: SAVE_FORMAT,
      meta: {
        savedAt: now.toISOString(),
        gameVersion: GAME_VERSION,
        schemaVersion: state.schemaVersion,
        seed: state.seed,
        mode: state.mode,
        tick: state.tick,
        day: calendar(state.tick).day + 1,
        population: totalPopulation(homeProvince(state)),
      },
      state,
    },
  };
}

/** Validates untrusted save data (IndexedDB record or imported JSON): format, migration, schema, invariants. */
export function loadSaveFile(raw: unknown): LoadResult {
  if (typeof raw !== 'object' || raw === null || (raw as { format?: unknown }).format !== SAVE_FORMAT) {
    return { ok: false, error: { key: 'save.err.notASave' } };
  }
  const migrated = migrate((raw as { state?: unknown }).state);
  if (!migrated.ok) {
    return {
      ok: false,
      error: {
        key: migrated.reason === 'tooNew' ? 'save.err.tooNew' : 'save.err.invalid',
        params: { detail: migrated.reason },
      },
    };
  }
  const parsed = parseGameState(migrated.data);
  if (!parsed.ok)
    return { ok: false, error: { key: 'save.err.invalid', params: { detail: parsed.issues[0] ?? '' } } };
  if (!parsed.state.provinces[parsed.state.homeProvinceId])
    return { ok: false, error: { key: 'save.err.invalid', params: { detail: 'homeProvince' } } };
  // Older campaign saves do not know about future chapters. Restore only
  // missing quest records before checking strict current-version invariants.
  ensureQuestProgress(parsed.state);
  const problems = validateInvariants(parsed.state);
  if (problems.length)
    return { ok: false, error: { key: 'save.err.invalid', params: { detail: problems[0]! } } };
  return { ok: true, state: parsed.state };
}

export function parseSaveText(text: string): LoadResult {
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: { key: 'save.err.tooLarge' } };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { key: 'save.err.notJson' } };
  }
  return loadSaveFile(raw);
}
