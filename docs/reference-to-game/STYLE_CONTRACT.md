# VADİ. visual contract (draft)

## Authority
- **Gameplay and mechanics:** current VADİ. source code and tests are authoritative.
- **Visual identity:** existing procedural art and `docs/ART_GUIDE.md` are the baseline; future user-approved references can override specific appearance decisions.
- **Camera and input:** current isometric view, zoom and controls remain authoritative.
- **UI:** existing Turkish UI remains functional; any redesign must preserve readable states and touch controls.

## Design brief (authored goals, not observed reference facts)
- Recognizable Black Sea / Scottish-inspired settlement architecture, without copying protected game art.
- Distinct building silhouettes and materials at normal game zoom.
- More legible roads, terrain boundaries, vegetation and workers.
- Consistent shadows and lighting that remain readable on mobile and across seasons.
- Preserve the isometric composition and building footprint alignment.

## Reference inventory
No new user-supplied image has been selected yet. For each reference record: filename/URL, creator, licence, approved use, intended authority (appearance / motion / UI), and observations versus assumptions.

## Visual comparison protocol
Capture baseline and candidate at identical viewport, seed, camera, zoom, season and simulation tick. Compare: composition, silhouettes, palette relationships, material readability, shadows, HUD clarity and mobile legibility. Record mismatches without inventing a numeric similarity score.

## Non-negotiables
- No removal of existing gameplay features or save compatibility.
- No replacement of the current rendering engine as part of this foundation PR.
- No network calls or secrets in browser builds for asset generation.
- No unreviewed example-game assets, music, images or models.
