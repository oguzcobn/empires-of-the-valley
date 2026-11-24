import { expect, it } from 'vitest';
import { createNewGame } from '../scenarios/newGame';
import { homeProvince } from '../systems/economy';
import { startCitySurprise, surpriseTimeline } from '../systems/citySurprises';
import { SurpriseActors } from './surpriseActors';

it('places both encounters on their saved routes, shows their land party and hides completed events', () => {
  const actors = new SurpriseActors();
  for (const kind of ['ufo','pirates'] as const) {
    const game = createNewGame({seed:42, mode:'sandbox'});
    const p = homeProvince(game);
    expect(startCitySurprise(game,p,kind)).toBe(true);
    const event = game.surprise!;
    game.tick = event.startedAt+surpriseTimeline(event).confrontation;
    actors.update(game,p,0,true);
    const vessel = actors.group.children[0]!;
    expect(vessel.position.x).toBeCloseTo(event.approach.at(-1)![0]+.5);
    expect(vessel.position.z).toBeCloseTo(event.approach.at(-1)![1]+.5);
    expect(actors.group.children.filter(child=>child.visible).length).toBeGreaterThan(1);
    delete game.surprise;
    actors.update(game,p,0,true);
    expect(actors.group.visible).toBe(false);
  }
  actors.dispose();
  expect(actors.group.children).toHaveLength(0);
});
