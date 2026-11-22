# Reference-to-Game integration — VADİ.

This is a non-destructive, PixiJS-native adoption of the [reference-to-game](https://github.com/gokayfem/reference-to-game) workflow. It does **not** replace PixiJS with Three.js, copy example game assets, introduce paid APIs, or modify simulation/save logic.

## Baseline
- Engine: PixiJS 8, React, TypeScript, Vite.
- Rendering: `src/game/rendering`; procedural artwork in `src/game/rendering/sprites.ts`.
- Gameplay: deterministic simulation in `src/game/core` and `src/game/systems`.
- Save data: versioned IndexedDB/JSON in `src/game/save`.

## First reference-driven vertical slice
1. Capture the current village at a reproducible seed and camera position, with HUD visible and hidden.
2. Record the reference's provenance and permitted reuse. Use only original or properly licensed material.
3. Fill in `STYLE_CONTRACT.md` with observed visual traits, not guessed ones.
4. Improve **one** representative village scene: a house, road, terrain, foliage and a visible worker, without changing placement or collision rules.
5. Compare before/after captures at the same resolution, zoom, seed, season and time of day.
6. Review appearance, input/playability, runtime and performance independently; keep the original render path available until acceptance.

## Optional upstream toolkit
Coding agents may install the upstream skill in their own environment with `npx skills add gokayfem/reference-to-game`. The skill is a development workflow, **not** a runtime dependency. Do not add its example games or third-party media to VADİ. Upstream Python tooling may be used in a separate local case folder; do not commit unlicensed references or generated media without review.

## Verification gates
- `npm ci && npm run lint && npm test && npm run build`
- `npm run test:e2e` after a production build (browser required)
- Verify new game, build/road placement, workers, pause/speed, save/load, mobile input and performance.
- No changes to deterministic commands, resource balance, save schema, deployment or gameplay until separately reviewed.

## Status
Foundation documentation added; no visual assets or gameplay code changed. Visual comparison and browser playthrough are **not yet performed**. See `STATUS.md`.
