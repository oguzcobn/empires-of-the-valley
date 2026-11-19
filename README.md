# Empires of the Valley

An original single-player isometric civilization builder for the browser. **Phase 1 — Playable Village** is
implemented: a seeded 24×24 valley, eight working buildings, six resources, workers, population, seasons,
an eight-quest first chapter, and versioned local saves. The interface is Turkish; the i18n layer is ready
for more languages.

Everything runs client-side. No backend, accounts, API keys or paid services.

## Commands

```bash
npm install        # install dependencies
npm run dev        # start the dev server (http://localhost:5173)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build locally
npm test           # unit, integration and balance tests (Vitest)
npm run lint       # ESLint + TypeScript type-check
npm run test:e2e   # Playwright browser smoke test (needs `npm run build` first)
```

`npm run test:e2e` uses the system Chrome/Chromium if one is installed; otherwise run
`npx playwright install chromium` once.

## How to play (Phase 1)

1. **Yeni Sefer** starts the campaign in Bereket Vadisi with 12 settlers. The game starts paused.
2. Press **B** (İnşa Et), pick a building and click a green site. Every building must touch a road that
   leads to the Köy Meydanı; draw roads with **R**.
3. Click a finished building and assign workers. Nothing produces without staff.
4. **Space** pauses/resumes, **1/2/3** set 1×/2×/4× speed.
5. Follow Mira's quest card (top-left). Winter arrives on day 90 and farms stop — stock food.
6. The Köy Meydanı holds the tax rate and a travelling merchant (the recovery path if a stock runs dry).
7. **Menü** saves to three manual slots, exports/imports JSON and returns to the title screen.

Shortcuts: Space, 1/2/3, Esc, B, R, X (demolish), M (world map), +/−, WASD/arrows, Home, F3 (perf overlay).

## Architecture

| Layer           | Path                                | Notes                                                                  |
| --------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| Simulation core | `src/game/core`, `src/game/systems` | Pure TypeScript, deterministic, no DOM. One tick = one in-game hour.   |
| Content         | `src/game/data`                     | Buildings, technologies, quests, balance, world map — all data-driven. |
| Scenarios       | `src/game/scenarios`                | New-game setup.                                                        |
| Saves           | `src/game/save`                     | Zod schema, migration pipeline, IndexedDB slots (`idb`).               |
| Rendering       | `src/game/rendering`                | PixiJS isometric scene; reads state, never mutates it.                 |
| App shell       | `src/app`, `src/components`         | React + Zustand, fixed-step game loop, Turkish UI.                     |
| i18n            | `src/i18n`                          | Typed keys; `tr.ts` is the only dictionary shipped.                    |
| Tests           | `src/tests`, `e2e`                  | Vitest + Playwright.                                                   |

Key rules (details in `docs/ADR-001-architecture.md`):

- All quantities are integer milli-units; daily rates are split over 24 hourly ticks without rounding loss.
- State changes only through `executeCommand` (validated, returns a typed error message) or `applyTick`.
- The seeded PRNG state is part of the game state, so saves reproduce future randomness exactly.
- The real-time clock is an accumulator independent of FPS; a hidden tab makes no progress (no offline
  progression, by design).
- A state that fails `validateInvariants` is never saved; imported saves go through format check,
  migration, schema validation and invariant validation.

## GitHub Pages

`vite.config.ts` uses `base: './'`, so the build works under any project path
(`https://<user>.github.io/<repo>/`) without configuration. To deploy:

1. Push the repository to GitHub with `main` as the default branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. `.github/workflows/deploy.yml` lints, tests, builds and publishes `dist/` on every push to `main`.

## Phase status

| Area                                                                              | Status                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------ |
| Phase 0 foundations (types, registries, ADR, balance sheet, test plan, art guide) | implemented                                      |
| Phase 1 playable village                                                          | implemented and tested (see `docs/TEST_PLAN.md`) |
| Phase 2 deep economy (processed goods, transport jobs, services)                  | deferred                                         |
| Phase 3 world and war (24 live provinces, armies, battles)                        | deferred — world map is a labelled preview       |
| Phase 4 civilization (six eras, full tech tree)                                   | deferred                                         |
| Phase 5 diplomacy and story (chapters 2–5, factions, events)                      | deferred                                         |
| Phase 6 polish (audio, English, full accessibility pass)                          | deferred                                         |

Known Phase 1 limitations are listed in `docs/TEST_PLAN.md`.

## Licensing and attribution

- All game code, text and art in this repository are original. Art is procedural: it is drawn from code
  in `src/game/rendering/sprites.ts`; there are no image, font or audio files and no remote assets.
- Third-party runtime libraries (all MIT): React, PixiJS, Zustand, Immer, Zod, idb.
  Development tools: Vite, Vitest, Playwright (Apache-2.0), ESLint, Prettier, TypeScript (Apache-2.0).
- No licence file is included yet. Choose one before publishing the repository publicly (for example MIT
  for code); until then the default is "all rights reserved".
- The design takes genre-level inspiration only. No art, maps, text, sounds or UI from other games are used.
