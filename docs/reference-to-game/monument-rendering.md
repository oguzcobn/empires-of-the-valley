# Monument rendering and evaluation

The 40 city landmarks use individual procedural architectural layouts in `monumentModels.ts`. The tile map projects these parts in PixiJS. The Architecture Atlas opens a separate Three.js renderer when requested. The camera renders on demand, and the touch preset uses lower resolution and skips GTAO.

The 3D path combines metallic–roughness shading, procedural material variation, a directional key with depth shadows, an analytic atmosphere prefiltered as an environment map, and ACES tone mapping. Desktop adds GTAO. The current fog is distance-based exponential fog. The water in the pavilion models is a reflective surface. The sky environment approximates ambient lighting and reflections, and does not compute inter-object light bounce.

- [Epic's physically based material conventions](https://dev.epicgames.com/documentation/unreal-engine/physically-based-materials-in-unreal-engine)
- [Three.js Sky shader](https://threejs.org/docs/pages/Sky.html)
- [GTAO technical report](https://research.activision.com/publications/archives/atvi-tr-16-01practical-realtime-strategies-for-accurate-indirect-occlusion)
- [OKLab transform](https://bottosson.github.io/posts/oklab/)

Geometry references include [Trabzon Ayasofya exterior](https://commons.wikimedia.org/wiki/Category:Exterior_of_Hagia_Sophia,_Trabzon), [Kızlar Monastery](https://commons.wikimedia.org/wiki/Category:Panagia_Theoskepastos_Monastery), [Alacahan](https://kulturportali.gov.tr/turkiye/trabzon/kulturenvanteri/alacahan), [Holyrood Palace](https://commons.wikimedia.org/wiki/Category:Holyrood_Palace) and [Prague City Tourism](https://prague.eu/en/objevujte-kategorie/sites/). The models use game-scale proportions.

## Measuring appearance

Use `python tools/calibrate-monument-colors.py pairs.json` with NumPy and Pillow. Record source, author, licence and capture settings for reference frames separately. Save sRGB images and match scene time, camera position and weather before selecting patches. Each manifest frame contains:

```json
{
  "reference": "reference/frame-01.png",
  "render": "capture/frame-01.png",
  "holdout": false,
  "patches": [
    { "label": "sunlit masonry", "reference": [0.4, 0.5, 0.52, 0.62], "render": [0.44, 0.48, 0.55, 0.6] }
  ]
}
```

Use 12 or more frames and 100 or more paired rectangles. A 12-frame set needs at least eight or nine patches per frame to reach 100. Keep whole frames for the holdout and use matching surface patches that avoid edges and foreground occluders. The tool reports per-patch OKLCh and training/holdout OKLab RMSE. Its constrained least-squares fit estimates a global display correction for exposure, white balance and saturation. Compare the result on the holdout before applying the correction, and capture fresh frames after changing scene lighting. A display fit cannot identify physical light intensity, fog or cloud density from pixels alone.

No licensed game or film still set was paired with these renders in this release. The shipped lighting presets are uncalibrated starting points. FFT ocean, volumetric clouds and fog, scene-bounce GI, adaptive exposure and local tone mapping are outside the current viewer.

## Nine urban buildings

The nine urban models use a second shared architectural recipe in `urbanBuildingModels.ts`. Each recipe uses metre-scale authored parts with adjustable cultural details. The map draws the same parts in its isometric tile space and retains the existing building identifiers, footprints, upgrades and saves. The inspector and the Architecture Atlas open the optional Three.js view. Meshes in that view are batched by material.

The urban renderer meters a 20×16 scene-linear HDR image when the lighting preset changes. It calculates a centre-weighted median luminance using Rec. 709 coefficients, then clamps the exposure correction to ±0.4 EV. Supported desktop views add GTAO and an eight-tap edge-weighted local exposure adjustment before ACES output. Touch views skip the expensive full-screen passes.

The port evaluates a seeded Phillips spectrum with a two-axis inverse FFT and normalizes the generated water heights to 0.04 m RMS. Finite differences on the periodic tile produce its normal texture. This is a sheltered harbor surface model in the optional preview. The city's ocean is still rendered by the existing map system. See [Simulating Ocean Water](https://jtessen.people.clemson.edu/reports/papers_files/waterslides2001.pdf).

The urban scenes reuse the analytic sky and prefiltered environment lighting. They do not yet include inter-object light bounce or participating media for clouds and fog. No game or cinema reference pairs were measured for these presets. The runtime exposure meter and wave RMS are numerical scene controls, distinct from a 100-point reference-image fit.
