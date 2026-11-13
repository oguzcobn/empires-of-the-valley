import type { ArchitectureStyle, BuildingId, GameState } from '../game/core/types';
import { levelCost } from '../game/systems/architecture';
import { BUILDINGS } from '../game/data/buildings';
import { executeCommand, missingFor } from '../game/systems/commands';
import { idleWorkers } from '../game/systems/economy';
import { findSite } from '../game/systems/placement';
import { build, days, expectValid, home, must, newCampaign } from './helpers';

/**
 * A simple scripted governor: builds what the chapter needs as soon as it is affordable,
 * staffs it, queues research and waits. Mirrors what a new player following Mira would do.
 */
export function playChapterOne(
  seed: number,
  maxDays = 110,
  culture?: ArchitectureStyle,
): { state: GameState; log: string[] } {
  let s = newCampaign(seed, culture);
  const log: string[] = [];
  const order: [BuildingId, number][] = [
    ['lumber_camp', 2],
    ['farm', 3],
    ['quarry', 2],
    ['hut', 0],
    ['granary', 0],
    ['school', 1],
    ['hut', 0],
  ];
  let next = 0;
  for (let day = 0; day < maxDays && !s.completedChapters.includes(1); day++) {
    const p = home(s);
    // place the next building when affordable (keeping a little wood for roads)
    if (next < order.length) {
      const [id] = order[next]!;
      const plan = findSite(p, BUILDINGS[id]);
      const cost = { ...levelCost(id, 0, s.culture) };
      cost.wood = (cost.wood ?? 0) + (plan?.roads.length ?? 0) * 2000;
      if (plan && !missingFor(p, cost)) {
        s = build(s, id).state;
        log.push(`day ${day}: placed ${id}`);
        next++;
      }
    }
    // staff finished buildings according to plan
    for (const b of home(s).buildings) {
      const want = order.find(([id]) => id === b.definitionId)?.[1] ?? 0;
      if (b.state !== 'construction' && b.workers < want) {
        const give = Math.min(want - b.workers, idleWorkers(home(s)));
        if (give > 0) s = must(s, { type: 'assignWorkers', instanceId: b.id, workers: b.workers + give });
      }
    }
    if (
      !s.researchedTechIds.includes('basic_agriculture') &&
      !s.researchQueue.includes('basic_agriculture')
    ) {
      const r = executeCommand(s, { type: 'queueResearch', techId: 'basic_agriculture' });
      if (r.ok) s = r.state;
    }
    s = days(s, 1);
    expectValid(s);
  }
  return { state: s, log };
}
