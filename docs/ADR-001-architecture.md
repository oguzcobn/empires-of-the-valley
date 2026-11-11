# ADR-001 — Architecture for Empires of the Valley

Status: accepted (Phase 0/1)

## Context

The game must be a static, client-side site with a deterministic simulation, replayable randomness,
versioned saves and a renderer that never drives game logic.

## Decisions

1. **Simulation is pure TypeScript.** `applyTick(state)` and `executeCommand(state, command)` return new
   states (Immer structural sharing). They read no clock, no DOM and not the game speed.
2. **Fixed tick.** One tick is one in-game hour; 24 ticks a day, 30 days a season, 4 seasons a year.
   `advanceClock` converts real time to ticks (500 ms per tick at 1×), clamps a frame to 250 ms and caps
   ticks per frame, so background tabs and slow frames cannot cause runaway catch-up.
   Offline progression is disabled.
3. **Fixed-point quantities.** Resources are integer milli-units. `portion(rate, hour)` distributes a
   daily rate over the day so 24 portions sum to exactly the rate. No float is stored in state.
4. **Commands.** Every player action is a `Command` validated by a pure function. A refused command
   returns `{ ok: false, error: { key, params } }` and the untouched state; the UI translates the key.
5. **Tick order** is fixed: construction → income → upkeep → production → research → consumption →
   day end (quests' daily counters, population, forest regrowth, season events) → quest evaluation.
   Buildings are processed in creation order.
6. **Randomness.** A mulberry32-style generator whose single uint32 state lives in `GameState.rngState`.
   Terrain uses a separate generator derived from the seed, so world generation never shifts game RNG.
7. **Connectivity.** Roads reachable from the town center form the logistics network. Buildings cache a
   `connected` flag that is recomputed after every structural change. Same-province inventory is
   aggregated in Phase 1 (spec allows this); transport jobs are Phase 2.
8. **Storage invariant.** `stock <= cap` always. Production is limited by free space, purchases must fit,
   refunds are clamped, and storage that is in use cannot be demolished.
9. **Rendering.** PixiJS draws ground as one Graphics (rebuilt only when tiles or season change), props
   and buildings as depth-sorted containers, villagers/carts/smoke as visual-only objects. Input is
   reported through callbacks and turned into commands by the app layer.
10. **Saves.** `SaveFile = { format, meta, state }` in IndexedDB (`auto`, `slot1..3`) plus JSON
    export/import. Loading runs format check → `migrate` → Zod schema (strict, bounded) → invariants.
11. **Localization.** All user-facing text is a typed key in `src/i18n/tr.ts`. Core code only carries
    keys and params.

## Deviations from the suggested contracts

- `BuildingInstance.active/condition` are replaced by `state` (`construction | active | upgrading`),
  `connected` and `unpaid`; building damage arrives with combat in Phase 3.
- `Province.population` is a cohort object (children/adults/elders) instead of a single number.
- `Recipe` objects are folded into `LevelSpec.produces` because Phase 1 has no multi-input recipes;
  Phase 2 introduces `Recipe` with inputs (and a save migration for farms: food → grain).

## Consequences

Deterministic tests can replay whole playthroughs; the UI cannot disagree with the simulation because
both call the same rate functions (`dailyOutput`, `computeFlows`).
