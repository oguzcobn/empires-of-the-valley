# ADR-002 — Three.js 3D view next to the PixiJS view

Status: accepted (visual upgrade, phase 0 of 4)

## Context

The target look is a miniature city: tilt-shift depth of field, real sun shadows, curved streets and
buildings/vehicles with true 3D proportions. Depth of field and cast shadows can only be faked in a
2D sprite renderer, and every sprite has to be redrawn by hand per direction.

## Decision

1. **A second renderer, not a rewrite.** `Valley3D` (`src/game/rendering3d/`) implements the same
   `ValleyView` interface and consumes the same `RendererHost` callbacks as `ValleyRenderer`. The
   simulation, commands, saves and UI are untouched (ADR-001 §9 already forbids the renderer from
   driving game logic).
2. **Opt-in while it reaches parity.** Settings → "3D görünüm (beta)" (or `?view=3d`) switches views.
   three.js is loaded with a dynamic import, so 2D players do not download it.
3. **Procedural low-poly models.** `Builder` merges coloured primitives into one geometry per
   building, so a building is one draw call plus one for its lit windows. No external assets yet.
4. **Grid logic, curved drawing.** Roads stay on the tile grid; `roads3d.ts` turns a bend into a
   quarter circle and the same `lanePoint()` drives both the painted surface and the vehicles.
   Ramps are always on the lower tile and reach the upper level exactly at the shared edge; bridge
   decks sit at bank level, so roads meet them without a step.
5. **Tilt-shift** is a depth-of-field pass over a render target with a depth texture (`tiltShift.ts`).
   Low quality skips the pass and shadows and renders straight to the screen.

## Not yet in the 3D view

Worker scenes on farms/quarries, rain and snow particles, chimney smoke, match-day crowds and the
hand-painted facade detail of the 2D art. They arrive with phases 2–3; until then the 2D view stays
the default.
