# Test plan and Phase 1 verification

## Automated

| Suite       | File                  | Covers                                                                                                                                                                                                     |
| ----------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core        | `core.test.ts`        | fixed-point portions, PRNG reproducibility, calendar, real-time clock (pause, speed, no catch-up)                                                                                                          |
| Terrain     | `terrain.test.ts`     | determinism per seed, playable start for 120 seeds, starting hamlet and stocks                                                                                                                             |
| Commands    | `commands.test.ts`    | placement rules, exact costs, refusals without mutation, roads/connectivity, cancel/demolish refunds, upgrade locks, worker limits, merchant, tax                                                          |
| Economy     | `economy.test.ts`     | 3 food/day for 12 citizens, production rates, conservation against deposits, tools, storage caps, treasury, UI flows equal simulation, research                                                            |
| Population  | `population.test.ts`  | growth cadence and blockers, famine floor and recovery, happiness factors                                                                                                                                  |
| Quests      | `quests.test.ts`      | scripted playthrough of all 8 quests in order (3 seeds), single reward, no re-trigger, streak reset                                                                                                        |
| Determinism | `determinism.test.ts` | same seed + commands → same state; 1×/2×/4× equal for equal ticks; ticks do not mutate input                                                                                                               |
| Save        | `save.test.ts`        | exact JSON round trip incl. PRNG and identical future, corrupt-state refusal, 15 malformed or malicious imports, migration pipeline, IndexedDB slots                                                       |
| Balance     | `balance.test.ts`     | passive 20/60-day runs, chapter done before winter for 8 seeds, command fuzzing with invariants after every step                                                                                           |
| Browser     | `e2e/smoke.spec.ts`   | real UI: pause holds time, invalid placement messages, roads + lumber camp, worker assignment, real-time production at 4×, panels, manual save → reload → continue with identical state, no console errors |

## Invariants checked after every fuzz step and before every save

No negative or fractional stock, stock ≤ capacity, assigned workers ≤ adults, workers ≤ slots, no
overlapping footprints, tile/building references consistent, exactly one town center, no tech
researched twice, quest reward flag consistent with status.

## Known limitations (Phase 1)

- Inventory is province-wide once a building is road-connected; carts are visual only.
- No disease, safety or ageing beyond children maturing; no elders dying.
- No random world events; no difficulty selection; sandbox only varies the seed.
- World map is a preview: 23 provinces are locked.
- One language (Turkish); key bindings are fixed.
- Sounds are short synthesized cues; there is no music.
- Depth sorting uses one key per object; very tall buildings behind others can overlap imperfectly.
- Draw-call count is not shown in the perf overlay (FPS, tick time and entity counts are).
