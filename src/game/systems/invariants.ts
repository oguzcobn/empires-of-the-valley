import type { GameState } from '../core/types';
import { RESOURCE_IDS } from '../core/types';
import { BUILDINGS, defOf, specOf } from '../data/buildings';
import { QUESTS } from '../data/quests';
import { TECHNOLOGIES } from '../data/technologies';
import { assignedWorkers, storageCaps } from './economy';
import { CONDITION_MAX, DESIGNABLE, isPlayableStyle } from '../data/architecture';
import { MAX_HEIGHT } from '../data/balance';
import { VESSELS } from '../data/shipyard';
import { footprintTiles, idx, inBounds } from './grid';

/**
 * Semantic integrity check. Used by tests after every step, before every (auto)save and after
 * loading/importing: a state that fails here is never written to or accepted from storage.
 */
export function validateInvariants(s: GameState): string[] {
  const errors: string[] = [];
  const p = s.provinces[s.homeProvinceId];
  if (!p) return ['home province missing'];
  if (!Number.isInteger(s.tick) || s.tick < 0) errors.push('tick invalid');
  if (!Number.isInteger(s.rngState) || s.rngState < 0 || s.rngState > 0xffffffff)
    errors.push('rng state invalid');
  if (p.tiles.length !== p.width * p.height) errors.push('tile count mismatch');
  if (!isPlayableStyle(s.culture)) errors.push('city culture not playable');

  const caps = storageCaps(s, p);
  for (const id of RESOURCE_IDS) {
    const q = p.stocks[id];
    if (!Number.isInteger(q)) errors.push(`stock ${id} not integer`);
    if (q < 0) errors.push(`stock ${id} negative`);
    if (q > caps[id]) errors.push(`stock ${id} above capacity`);
  }

  const { children, adults, elders } = p.population;
  if ([children, adults, elders].some((n) => !Number.isInteger(n) || n < 0))
    errors.push('population invalid');
  if (assignedWorkers(p) > adults) errors.push('more workers assigned than adults');
  if (p.happiness < 0 || p.happiness > 100) errors.push('happiness out of range');

  const owner = new Map<number, string>();
  const ids = new Set<string>();
  for (const b of p.buildings) {
    if (!BUILDINGS[b.definitionId]) {
      errors.push(`unknown building ${b.definitionId}`);
      continue;
    }
    if (ids.has(b.id)) errors.push(`duplicate building id ${b.id}`);
    ids.add(b.id);
    const def = defOf(b);
    if (b.level < 1 || b.level > def.levels.length) {
      errors.push(`building ${b.id} level invalid`);
      continue;
    }
    if (!isPlayableStyle(b.style)) errors.push(`building ${b.id} has unplayable style ${b.style}`);
    if (b.look && !DESIGNABLE.includes(b.definitionId)) errors.push(`building ${b.id} cannot carry a design`);
    if (!Number.isInteger(b.condition) || b.condition < 0 || b.condition > CONDITION_MAX)
      errors.push(`building ${b.id} condition invalid`);
    const builders = def.landmark?.builders ?? 0;
    if (b.workers < 0 || (b.state !== 'construction' && b.workers > specOf(b).workerSlots))
      errors.push(`building ${b.id} workers out of range`);
    if (b.state === 'construction' && b.workers > builders)
      errors.push(`building ${b.id} staffed while under construction`);
    if (!Number.isInteger(b.paidStages) || b.paidStages < 0 || b.paidStages > (def.landmark?.stages.length ?? 0))
      errors.push(`building ${b.id} paid stages invalid`);
    if (def.landmark && b.state === 'construction' && b.paidStages < 1) errors.push(`landmark ${b.id} unpaid`);
    if (b.state === 'upgrading' && b.level >= def.levels.length)
      errors.push(`building ${b.id} upgrading past max level`);
    for (const [x, y] of footprintTiles(def, b.x, b.y)) {
      if (!inBounds(p, x, y)) {
        errors.push(`building ${b.id} out of bounds`);
        continue;
      }
      const i = idx(p, x, y);
      if (owner.has(i)) errors.push(`buildings ${owner.get(i)} and ${b.id} overlap`);
      owner.set(i, b.id);
      if (p.tiles[i]!.buildingId !== b.id) errors.push(`tile ${x},${y} does not reference ${b.id}`);
      if (p.tiles[i]!.road) errors.push(`road under building ${b.id}`);
    }
  }
  p.tiles.forEach((t, i) => {
    if (t.buildingId && owner.get(i) !== t.buildingId)
      errors.push(`tile ${i} references missing building ${t.buildingId}`);
    if (t.deposit < 0 || !Number.isInteger(t.deposit)) errors.push(`tile ${i} deposit invalid`);
    if (!Number.isInteger(t.height) || t.height < 0 || t.height > MAX_HEIGHT) errors.push(`tile ${i} height invalid`);
    if (t.terrain === 'water' || t.terrain === 'lake') {
      if (t.height !== 0) errors.push(`tile ${i} water above the valley floor`);
      if (t.road && t.roadType !== 'bridge') errors.push(`tile ${i} road on water without bridge`);
    }
  });
  if (p.buildings.filter((b) => b.definitionId === 'town_center').length !== 1)
    errors.push('town center count != 1');

  for (const id of [...s.researchedTechIds, ...s.researchQueue])
    if (!TECHNOLOGIES[id]) errors.push(`unknown tech ${id}`);
  if (new Set(s.researchedTechIds).size !== s.researchedTechIds.length) errors.push('tech researched twice');
  if (s.researchQueue.some((id) => s.researchedTechIds.includes(id)))
    errors.push('researched tech still queued');
  if (s.researchProgress < 0) errors.push('research progress negative');
  for (const kind of ['fishing', 'cargo', 'yacht'] as const) {
    const n = s.shipyard.fleet[kind] + s.shipyard.queue.filter((o) => o.kind === kind).length;
    if (s.shipyard.fleet[kind] < 0 || n > VESSELS[kind].cap) errors.push(`fleet ${kind} out of range`);
  }
  if (s.shipyard.queue.some((o) => o.progress < 0 || o.progress > VESSELS[o.kind].work)) errors.push('vessel progress invalid');
  if (s.tourism.satisfaction < 0 || s.tourism.satisfaction > 100) errors.push('satisfaction out of range');

  if (s.mode === 'campaign') {
    for (const q of QUESTS) {
      const progress = s.questProgress[q.id];
      if (!progress) errors.push(`quest ${q.id} missing`);
      else if (progress.status === 'completed' && !progress.rewardGranted)
        errors.push(`quest ${q.id} completed without reward`);
      else if (progress.status !== 'completed' && progress.rewardGranted)
        errors.push(`quest ${q.id} rewarded early`);
    }
  }
  return errors;
}
