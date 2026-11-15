import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { WorkerScenes } from '../game/rendering/workerScenes';
import { buildAndStaff, home, must, newCampaign, tweak } from './helpers';

describe('visible production workers', () => {
  it('walks from the camp, chops at the forest and stops when the wood runs out', () => {
    const { state, id } = buildAndStaff(newCampaign(), 'lumber_camp', 1);
    const layer = new Container();
    const scenes = new WorkerScenes(layer);
    const province = home(state);
    scenes.update(province, 'spring', id, 0, false);
    const worker = layer.children[0] as Graphics;
    expect(scenes.count).toBe(1);
    const start = [worker.x, worker.y];

    scenes.update(province, 'spring', id, 0.2, false);
    expect([worker.x, worker.y]).not.toEqual(start);
    scenes.update(province, 'spring', id, 0, true);
    const working = worker.context;
    const forest = [worker.x, worker.y];
    expect(forest).not.toEqual(start);
    scenes.update(province, 'spring', id, 2, true);
    expect([worker.x, worker.y]).toEqual(forest);
    expect(worker.context).toBe(working);

    const depleted = tweak(state, (draft) => {
      for (const tile of home(draft).tiles) if (tile.terrain === 'forest') tile.deposit = 0;
    });
    scenes.update(home(depleted), 'spring', id, 0, false);
    expect(scenes.count).toBe(0);
    scenes.destroy();
    layer.destroy();
  });

  it('shows staffed farm and quarry workers, respecting winter and staffing changes', () => {
    const farm = buildAndStaff(newCampaign(), 'farm', 2);
    const quarry = buildAndStaff(farm.state, 'quarry', 1);
    const layer = new Container();
    const scenes = new WorkerScenes(layer);
    scenes.update(home(quarry.state), 'summer', farm.id, 0, true);
    expect(scenes.count).toBe(3);
    scenes.update(home(quarry.state), 'winter', farm.id, 0, true);
    expect(scenes.count).toBe(1);

    const unstaffed = must(quarry.state, { type: 'assignWorkers', instanceId: quarry.id, workers: 0 });
    scenes.update(home(unstaffed), 'winter', null, 0, true);
    expect(scenes.count).toBe(0);
    scenes.destroy();
    layer.destroy();
  });
});
