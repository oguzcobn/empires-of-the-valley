# Art guide and asset specification — Phase 1

Style: cozy, clean isometric diorama. Original work only; no third-party images.

- Projection: 2:1 diamond, tile 64×32 px at zoom 1. Tile (x, y) top vertex at ((x−y)·32, (x+y)·16).
- Light from the upper-left: left faces lit, right faces ×0.78, tops ×1.12. Soft ground shadows at 16 %.
- Palette: grass greens, water blues, wood browns, stone neutrals, terracotta/slate roofs
  (`src/game/rendering/palette.ts`). Four seasonal palettes change ground, foliage and crops.
- Layer order: ground → water shimmer → ground overlays (range, selection, placement) →
  depth-sorted objects (trees, rocks, buildings, villagers, carts, smoke) → placement ghost.
- Depth key: buildings `x + w + y + h − 1`, props `x + y + 1`, walkers `fx + fy + 0.01`.

## Asset batch 1 (procedural placeholders, `sprites.ts`)

Atlas names are `<buildingId>@<level>`; replacing a draw function with a sprite keeps the name.

| Name                      | Footprint | Anchor                    | Height px | Animation                         | Levels |
| ------------------------- | --------- | ------------------------- | --------- | --------------------------------- | ------ |
| town_center               | 2×2       | top vertex of origin tile | 70        | flag, chimney smoke               | 2      |
| hut                       | 1×1       | same                      | 30        | chimney smoke (L2+)               | 3      |
| warehouse                 | 2×2       | same                      | 36        | –                                 | 2      |
| lumber_camp               | 2×2       | same                      | 26        | camp smoke when staffed           | 2      |
| farm                      | 2×2       | same                      | 14        | crops by season                   | 2      |
| quarry                    | 2×2       | same                      | 26        | –                                 | 2      |
| granary                   | 2×2       | same                      | 48        | –                                 | 2      |
| school                    | 2×2       | same                      | 54        | flag                              | 2      |
| construction              | any       | same                      | 34        | rises with progress, progress bar | –      |
| tree (conifer, broadleaf) | 1×1 prop  | tile centre               | ~40       | sway; 4 depletion stages          | –      |
| rocks                     | 1×1 prop  | tile centre               | ~15       | rich / depleted                   | –      |
| villager, cart            | –         | feet                      | 14        | walk along roads                  | –      |

Status badges use shape and colour together: red diamond with × (not connected), orange square with
ring (unpaid), yellow circle with ! (no workers). Reduced-motion disables sway, smoke, water shimmer
and walking.
