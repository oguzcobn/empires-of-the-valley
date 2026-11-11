import { produce } from 'immer';
import type { BuildingId, GameState, Province } from '../game/core/types';
import { BUILDINGS } from '../game/data/buildings';
import { createNewGame } from '../game/scenarios/newGame';
import { executeCommand } from '../game/systems/commands';
import type { Command } from '../game/systems/commands';
import { homeProvince } from '../game/systems/economy';
import { validateInvariants } from '../game/systems/invariants';
import { findSite } from '../game/systems/placement';
import { applyTicks } from '../game/systems/tick';

export const newCampaign = (seed = 42): GameState => createNewGame({ seed, mode: 'campaign' });
export const home = (s: GameState): Province => homeProvince(s);
export const days = (s: GameState, n: number): GameState => applyTicks(s, n * 24);
export const tweak = (s: GameState, fn: (draft: GameState) => void): GameState => produce(s, fn);

export function must(s: GameState, cmd: Command): GameState {
  const result = executeCommand(s, cmd);
  if (!result.ok) throw new Error(`${cmd.type} refused: ${result.error.key}`);
  return result.state;
}

export function expectValid(s: GameState): void {
  const problems = validateInvariants(s);
  if (problems.length) throw new Error(`invariant violated: ${problems.join('; ')}`);
}

/** Lays the necessary road and places a building at the nearest valid site. */
export function build(s: GameState, buildingId: BuildingId): { state: GameState; id: string } {
  const plan = findSite(home(s), BUILDINGS[buildingId]);
  if (!plan) throw new Error(`no site for ${buildingId}`);
  let state = s;
  for (const [x, y] of plan.roads) state = must(state, { type: 'placeRoad', x, y });
  state = must(state, { type: 'placeBuilding', buildingId, x: plan.x, y: plan.y });
  const placed = home(state).buildings[home(state).buildings.length - 1]!;
  return { state, id: placed.id };
}

/** Builds, waits for completion and staffs a building. */
export function buildAndStaff(
  s: GameState,
  buildingId: BuildingId,
  workers: number,
): { state: GameState; id: string } {
  const placed = build(s, buildingId);
  let state = days(placed.state, BUILDINGS[buildingId].levels[0]!.buildTicks / 24);
  if (workers > 0) state = must(state, { type: 'assignWorkers', instanceId: placed.id, workers });
  return { state, id: placed.id };
}
