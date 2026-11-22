import type { LandmarkId } from '../core/types';

export const MATERIALS = {
  limestone: { color: 0xb8aa91, roughness: .88, metalness: 0 },
  sandstone: { color: 0xaa8966, roughness: .92, metalness: 0 },
  rubble: { color: 0x746f61, roughness: .98, metalness: 0 },
  plaster: { color: 0xe4d8bf, roughness: .78, metalness: 0 },
  timber: { color: 0x503829, roughness: .81, metalness: 0 },
  slate: { color: 0x343b3d, roughness: .81, metalness: 0 },
  tile: { color: 0x914c37, roughness: .79, metalness: 0 },
  copper: { color: 0x526e65, roughness: .57, metalness: .55 },
  gold: { color: 0xe6b649, roughness: .31, metalness: .8 },
  vermilion: { color: 0xa73929, roughness: .5, metalness: 0 },
  steel: { color: 0x863d32, roughness: .55, metalness: .45 },
  glass: { color: 0x4d777c, roughness: .19, metalness: .3 },
  water: { color: 0x416b65, roughness: .23, metalness: .17 },
  gravel: { color: 0xc6baa1, roughness: .96, metalness: 0 },
} as const;

export type MonumentMaterial = keyof typeof MATERIALS;
export type MonumentShape = 'wall' | 'hip' | 'gable' | 'eave' | 'cylinder' | 'spire' | 'dome' | 'column' | 'arcade' | 'clock' | 'truss' | 'glassTower';
export type MonumentPart = readonly [
  shape: MonumentShape, x: number, z: number, width: number, depth: number,
  base: number, height: number, material: MonumentMaterial, bays?: number,
];
type Parts = readonly MonumentPart[];
const hall = (w: number, d: number, h: number, wall: MonumentMaterial, roof: MonumentMaterial, bays = 5): Parts => [
  ['wall', 0, 0, w, d, 0, h, wall, bays], ['hip', 0, 0, w * 1.07, d * 1.1, h, d * .25, roof],
];
const tower = (x: number, z: number, w: number, h: number, wall: MonumentMaterial, top: MonumentMaterial): Parts => [
  ['wall', x, z, w, w, 0, h, wall, 1], ['spire', x, z, w * 1.06, w * 1.06, h, w * .94, top],
];
const pagoda = (tiers: number, width: number, step: number, wall: MonumentMaterial): MonumentPart[] => {
  const parts: MonumentPart[] = [];
  for (let i = 0; i < tiers; i++) {
    const w = width * (1 - i * .11), base = i * step;
    parts.push(['wall', 0, 0, w * .72, w * .66, base, step * .79, wall, 3]);
    parts.push(['eave', 0, 0, w, w * .93, base + step * .79, step * .43, 'slate']);
  }
  parts.push(['spire', 0, 0, .32, .32, tiers * step, step * 1.35, 'gold']);
  return parts;
};
const court = (w: number, d: number, h: number, mat: MonumentMaterial): Parts => [
  ['arcade', 0, -d / 2, w, .45, 0, h, mat, 5],
  ['arcade', 0, d / 2, w, .45, 0, h, mat, 5],
  ['wall', -w / 2, 0, .45, d, 0, h, mat, 1],
  ['wall', w / 2, 0, .45, d, 0, h, mat, 1],
];

/** Original blockouts, in common scene units. The front is positive Z. */
export const MONUMENT_MODELS: Partial<Record<LandmarkId, Parts>> = {
  trabzon_ayasofya: [
    ...hall(5, 6.2, 2.6, 'sandstone', 'tile', 3),
    ['gable', 0, 0, 6.6, 3.1, 2.6, 1.32, 'tile'],
    ['cylinder', 0, 0, 2.1, 2.1, 3.1, 1.4, 'sandstone', 8],
    ['dome', 0, 0, 2.35, 2.35, 4.5, .95, 'tile'],
    ['arcade', 0, 3.42, 3.8, 1.1, 0, 2.3, 'limestone', 3],
    ['wall', -3.6, 2.4, 1.14, 1.14, 0, 5.1, 'rubble', 1],
    ['hip', -3.6, 2.4, 1.4, 1.4, 5.1, .58, 'tile'],
  ],
  ataturk_kosku: [
    ...hall(5.5, 4, 3.5, 'plaster', 'tile'),
    ['wall', 0, 1.95, 2.35, 1.1, .25, 3.72, 'plaster', 3],
    ['gable', 0, 1.95, 2.48, 1.5, 3.97, 1.2, 'tile'],
    ['arcade', 0, 2.65, 2.8, 1.1, 0, 1.5, 'plaster', 3],
    ['cylinder', 2.55, -.9, 1.28, 1.28, 0, 4.1, 'plaster', 4],
    ['spire', 2.55, -.9, 1.55, 1.55, 4.1, 1.4, 'tile'],
  ],
  trabzon_kalesi: [
    ['wall', 0, -.8, 8.3, .85, 0, 2.8, 'rubble'],
    ['wall', -3.55, 1.35, .86, 4.3, 0, 2.45, 'rubble'],
    ['wall', 3.65, .67, .93, 2.9, 0, 2.65, 'rubble'],
    ['arcade', .25, 2.4, 3.1, .65, 0, 2.05, 'rubble', 1],
    ...[-3.65, 3.65].map((x): MonumentPart => ['wall', x, -.78, 1.6, 1.65, 0, 3.65, 'rubble']),
  ],
  gulbahar_hatun: [
    ['wall', 0, 0, 4.7, 4.5, 0, 2.25, 'limestone', 3],
    ['dome', 0, 0, 4.5, 4.5, 2.25, 1.65, 'slate'],
    ['arcade', 0, 2.45, 5.8, 1.25, 0, 1.75, 'sandstone', 5],
    ...[-1.95, 0, 1.95].map((x): MonumentPart => ['dome', x, 2.45, 1.65, 1.65, 1.75, .6, 'slate']),
    ['cylinder', -3, .65, .43, .43, 0, 5.7, 'limestone'],
    ['cylinder', -3, .65, .79, .79, 4.6, .19, 'limestone'],
    ['spire', -3, .65, .5, .5, 5.7, .85, 'slate'],
  ],
  bedesten_trabzon: [
    ['wall', 0, 0, 5.4, 5.3, 0, 3.23, 'rubble', 2],
    ['hip', 0, 0, 5.55, 5.45, 3.23, 1, 'tile'],
    ['arcade', 0, 2.78, 2.1, .69, 0, 2, 'sandstone', 1],
  ],
  kizlar_manastiri: [
    ['wall', -2.9, -.95, 1.6, 4.9, 0, 3.8, 'rubble'],
    ['wall', .7, -1.95, 6.1, 1.9, 0, 3.05, 'rubble', 5],
    ['gable', .7, -1.95, 6.3, 2, 3.05, 1, 'tile'],
    ['arcade', -.65, .25, 4.35, 1.1, 0, 1.65, 'sandstone', 4],
    ['wall', 2.05, 1.46, 2.4, 1.9, 0, 2.25, 'rubble', 2],
    ['gable', 2.05, 1.46, 2.6, 2.1, 2.25, .52, 'tile'],
  ],
  vazelon_manastiri: [
    ['wall', 0, -1.45, 7.8, 1.5, 0, 4.1, 'rubble'],
    ['wall', 0, .1, 6.95, 2.15, .25, 3.75, 'limestone', 8],
    ['wall', -2.35, .4, 1.7, 1.4, 3.9, 1.2, 'rubble', 2],
    ['arcade', -.15, 1.3, 6.2, .52, .25, 1.55, 'rubble', 5],
  ],
  kostaki_konagi: [
    ...hall(5.75, 4.3, 3.65, 'plaster', 'slate', 7),
    ['wall', -.95, 2.05, 2.15, 1.15, 1.3, 2.45, 'sandstone', 3],
    ['hip', -.95, 2.05, 2.4, 1.4, 3.75, .85, 'slate'],
    ['arcade', .96, 2.45, 1.78, .68, 0, 1.65, 'limestone', 2],
  ],
  ortahisar_fatih: [
    ...hall(5.2, 5.75, 2.95, 'sandstone', 'tile', 4),
    ['cylinder', 0, 0, 2.65, 2.65, 2.85, 1.13, 'rubble', 8],
    ['dome', 0, 0, 2.9, 2.9, 3.98, 1.12, 'tile'],
    ['cylinder', 2.85, 1.65, .52, .52, 0, 6, 'limestone'],
    ['spire', 2.85, 1.65, .57, .57, 6, 1.15, 'slate'],
  ],
  alacahan_trabzon: [
    ...court(6.4, 4.4, 1.82, 'rubble'),
    ['arcade', 0, -2.2, 6.6, .75, 1.82, 1.55, 'sandstone', 7],
    ['gable', 0, -2.2, 6.7, 1.5, 3.37, .68, 'tile'],
    ['wall', -3.15, 0, .98, 4.65, 1.82, 1.58, 'rubble', 1],
    ['wall', 3.15, 0, .98, 4.65, 1.82, 1.58, 'rubble', 1],
  ],
  holyrood_palace: [
    ...hall(6.1, 4.2, 3.05, 'sandstone', 'slate', 7),
    ['arcade', 0, 2.36, 3.5, .8, 0, 1.58, 'limestone', 5],
    ...[-2.4, 2.4].flatMap((x): Parts => [
      ['cylinder', x, 2.02, 1.75, 1.75, 0, 3.95, 'sandstone', 5],
      ['spire', x, 2.02, 1.84, 1.84, 3.95, 1.17, 'slate'],
    ]),
  ],
  st_giles_cathedral: [
    ...hall(4.3, 6.5, 2.8, 'sandstone', 'slate', 4),
    ['wall', 0, .1, 1.65, 1.65, 0, 4.02, 'sandstone', 2],
    ...[-.63, .63].flatMap((x): Parts => [-.53, .73].flatMap((z): Parts => [
      ['column', x, z, .19, .19, 4.02, 1.03, 'sandstone'],
      ['spire', x, z, .22, .22, 5.05, .5, 'sandstone'],
    ])),
    ['truss', 0, .1, 1.32, 1.32, 4.03, 1.4, 'sandstone', 2],
    ['spire', 0, .1, .31, .31, 5.35, .51, 'copper'],
  ],
  national_monument_calton: [
    ['wall', 0, 0, 7.1, 3.5, 0, .34, 'rubble'],
    ['wall', 0, 0, 6.85, 3.2, .34, .2, 'sandstone'],
    ...Array.from({ length: 8 }, (_, i): MonumentPart => ['column', (i - 3.5) * .85, 1.2, .42, .42, .54, 2.75, 'sandstone']),
    ...[-2.975, 2.975].flatMap((x): Parts => [0, -1.2].map((z): MonumentPart => ['column', x, z, .42, .42, .54, 2.75, 'sandstone'])),
    ['wall', 0, 1.2, 6.58, .67, 3.29, .31, 'sandstone'],
  ],
  nelson_monument: [
    ['wall', 0, 0, 3.8, 3.6, 0, 1.03, 'rubble', 3],
    ['cylinder', 0, 0, 1.75, 1.75, 1.03, 4.05, 'sandstone', 4],
    ['cylinder', 0, 0, 2.05, 2.05, 5.08, .27, 'sandstone'],
    ['wall', 0, 0, 1.34, 1.34, 5.35, .59, 'sandstone', 2],
    ['column', 0, 0, .12, .12, 5.94, .71, 'slate'],
    ['dome', 0, 0, .44, .44, 6.35, .28, 'slate'],
  ],
  craigmillar_castle: [
    ...court(6.7, 4.86, 1.65, 'rubble'),
    ['wall', -.8, -1.0, 3.05, 2.45, 0, 3.85, 'rubble', 3],
    ['wall', -1.95, -.4, 1.25, 1.3, 3.85, .55, 'rubble', 1],
    ['wall', .95, -2, 1.75, 1.38, 0, 2.42, 'sandstone', 1],
  ],
  balmoral_clock: [
    ...hall(6.1, 4.6, 3.25, 'sandstone', 'slate', 8),
    ...tower(-2.42, 1.5, 1.61, 5.75, 'sandstone', 'copper'),
    ['clock', -2.42, 2.322, 1.06, .06, 4.35, 1.06, 'plaster'],
    ['cylinder', 2.76, 1.49, 1.18, 1.18, 0, 3.95, 'sandstone', 6],
    ['spire', 2.76, 1.49, 1.37, 1.37, 3.95, .8, 'copper'],
  ],
  national_gallery_scotland: [
    ...hall(7.2, 4.4, 2.38, 'sandstone', 'slate', 7),
    ...Array.from({ length: 6 }, (_, i): MonumentPart => ['column', (i - 2.5) * .76, 2.53, .4, .4, .24, 2.18, 'limestone']),
    ['wall', 0, 2.52, 4.43, .92, 2.42, .22, 'limestone'],
    ['gable', 0, 2.51, 4.65, 1.22, 2.64, .87, 'sandstone'],
  ],
  dugald_stewart: [
    ['cylinder', 0, 0, 3.7, 3.7, 0, .4, 'rubble'],
    ...Array.from({ length: 9 }, (_, i): MonumentPart => ['column', 1.36 * Math.sin(i * Math.PI * 2 / 9), 1.36 * Math.cos(i * Math.PI * 2 / 9), .24, .24, .4, 2.57, 'sandstone']),
    ['cylinder', 0, 0, 3.35, 3.35, 2.97, .26, 'sandstone'],
    ['dome', 0, 0, 3.1, 3.1, 3.23, .84, 'sandstone'],
  ],
  forth_bridge_tower: [
    ...[-2.7, 2.7].flatMap((x): Parts => [
      ['wall', x, 0, 1.18, 2.25, 0, 1.08, 'rubble'],
      ['truss', x, 0, 1.18, 1.4, 1.08, 3.9, 'steel', 3],
    ]),
    ['truss', 0, 0, 8.8, .78, 1.55, 2.16, 'steel', 8],
    ['wall', 0, 0, 9.1, .75, 1.33, .27, 'steel'],
  ],
  dean_village_mill: [
    ...hall(5.9, 3.2, 2.6, 'rubble', 'tile', 6),
    ...tower(-1.88, 1.06, 1.33, 4, 'sandstone', 'tile'),
    ['wall', 2.01, 1.31, 2.1, 1.05, .24, 2.95, 'sandstone', 3],
    ['gable', 2.01, 1.31, 2.24, 1.22, 3.19, 1, 'tile'],
  ],
  kinkakuji: [
    ['wall', 0, 0, 7.9, 6.2, 0, .08, 'water'],
    ['wall', 0, -.75, 4.1, 3.3, .08, .86, 'plaster', 5],
    ['eave', 0, -.75, 4.72, 3.85, .94, .54, 'slate'],
    ['wall', 0, -.75, 3.55, 2.9, 1.07, 1.07, 'gold', 5],
    ['eave', 0, -.75, 4.14, 3.5, 2.14, .63, 'slate'],
    ['wall', .03, -.79, 2.5, 2.32, 2.34, .9, 'gold', 4],
    ['eave', .03, -.79, 3.31, 3.1, 3.24, .96, 'slate'],
    ['spire', .03, -.79, .28, .28, 4.17, .55, 'gold'],
  ],
  kiyomizu_dera: [
    ['truss', 0, 1.15, 6.9, 3.48, 0, 2.74, 'timber', 7],
    ['wall', 0, .28, 7.02, 4.62, 2.74, .2, 'timber'],
    ['wall', 0, -.93, 5.65, 3.02, 2.94, 1.58, 'timber', 6],
    ['eave', 0, -.93, 6.52, 4.18, 4.52, 1.4, 'timber'],
    ['arcade', 0, 1.11, 5.63, .78, 2.94, 1.25, 'timber', 7],
  ],
  fushimi_inari: [
    ['wall', 0, 0, 2.7, 7.8, 0, .08, 'gravel'],
    ...Array.from({ length: 8 }, (_, i) => i * .93 - 3.35).flatMap((z): Parts => [
      ['column', -1.06, z, .25, .25, .08, 2.24, 'vermilion'],
      ['column', 1.06, z, .25, .25, .08, 2.24, 'vermilion'],
      ['wall', 0, z, 2.64, .18, 1.83, .14, 'vermilion'],
      ['wall', 0, z, 2.86, .25, 2.28, .14, 'vermilion'],
      ['eave', 0, z, 2.95, .32, 2.42, .1, 'slate'],
    ]),
  ],
  ginkakuji: [
    ['wall', 0, .12, 6.7, 4.5, 0, .13, 'gravel'],
    ['wall', -.44, -.72, 4.2, 3.18, .13, 1.05, 'timber', 5],
    ['eave', -.44, -.72, 4.73, 3.83, 1.18, .62, 'slate'],
    ['wall', -.46, -.76, 2.78, 2.27, 1.37, .94, 'timber', 4],
    ['eave', -.46, -.76, 3.42, 2.88, 2.31, .86, 'slate'],
    ['dome', 2.06, 1.05, 1.85, 1.85, .13, .8, 'gravel'],
  ],
  toji_pagoda: pagoda(5, 4.55, 1.06, 'timber'),
  nijo_castle: [
    ['wall', 0, 0, 6.84, 4.56, 0, .34, 'rubble'],
    ...[-2.16, .22, 2.16].flatMap((x, i): Parts => [
      ['wall', x, i * -.62 + .4, 2.62, 2.85, .34, 1.45, 'plaster', 5],
      ['eave', x, i * -.62 + .4, 3.16, 3.65, 1.79, 1.19, 'slate'],
      ['gable', x, i * -.62 + 1.5, 1.7, 1.27, 2.07, .8, 'slate'],
    ]),
  ],
  yasaka_pagoda: [
    ...pagoda(5, 3.45, .96, 'plaster'),
    ['wall', 1.6, 1.7, 1.7, .31, 0, .8, 'rubble'],
    ['wall', -1.6, 1.7, 1.7, .31, 0, .8, 'rubble'],
  ],
  heian_shrine: [
    ['arcade', 0, 0, 6.68, 2.55, 0, 1.74, 'vermilion', 7],
    ['wall', 0, -.1, 4.68, 2.2, 1.74, 1.13, 'vermilion', 7],
    ['eave', 0, 0, 7.15, 3.26, 1.72, .47, 'copper'],
    ['eave', 0, -.1, 5.44, 3.19, 2.87, 1.14, 'copper'],
  ],
  byodoin_phoenix: [
    ['wall', 0, 0, 9.1, 5.1, 0, .07, 'water'],
    ['wall', 0, -.2, 2.38, 2.5, .08, 2.3, 'vermilion', 3],
    ['eave', 0, -.2, 3.42, 3.15, 2.38, 1.13, 'slate'],
    ...[-2.52, 2.52].flatMap((x): Parts => [
      ['arcade', x, .14, 3.22, 1.13, .16, 1.15, 'vermilion', 5],
      ['eave', x, .14, 3.37, 1.64, 1.31, .45, 'slate'],
      ['wall', x * 1.53, .17, 1.05, 1.12, 1.32, .65, 'vermilion', 2],
      ['eave', x * 1.53, .17, 1.39, 1.43, 1.97, .57, 'slate'],
    ]),
  ],
  ryoanji_garden: [
    ['wall', 0, 0, 7.25, 4.15, 0, .13, 'gravel'],
    ['wall', 0, -1.93, 7.25, .28, .13, 1.14, 'sandstone'],
    ['gable', 0, -1.93, 7.38, .6, 1.27, .19, 'tile'],
    ...[[ -2.6, .8, .52], [-1.4, -.95, .41], [.34, .42, .65], [1.9, -.63, .42], [2.7, .73, .51]].flatMap(([x, z, w]): Parts => [
      ['dome', x!, z!, w! * 1.6, w!, .13, w! * .63, 'rubble'],
      ['dome', x! + .49, z! - .11, w! * .9, w! * .6, .13, w! * .36, 'rubble'],
    ]),
  ],
  prague_castle: [
    ...hall(7.8, 3.7, 2.38, 'plaster', 'tile', 10),
    ['arcade', 0, 2, 4.6, .7, 0, 1.46, 'sandstone', 5],
    ...tower(-1.95, -.65, 1.1, 4.38, 'sandstone', 'copper'),
    ['wall', 1.84, -.68, 2.65, 1.9, 2.38, 1.23, 'sandstone', 4],
    ['gable', 1.84, -.68, 2.78, 2.12, 3.61, 1.02, 'slate'],
  ],
  st_vitus_cathedral: [
    ['wall', 0, 0, 3.37, 6.56, 0, 2.93, 'sandstone', 5],
    ['gable', 0, 0, 3.56, 6.7, 2.93, 1.5, 'slate'],
    ...tower(-1.44, 2.56, 1.16, 4.8, 'rubble', 'slate'),
    ...tower(1.44, 2.56, 1.16, 4.8, 'rubble', 'slate'),
    ...tower(1.65, -.65, 1.42, 5.15, 'sandstone', 'copper'),
    ['clock', 0, 3.32, 1.08, .07, 2.22, 1.08, 'glass'],
    ...[-1.76, 1.76].flatMap((x): Parts => [-2.25, -.96, .45].map((z): MonumentPart => ['column', x, z, .37, .37, 0, 2.65, 'sandstone'])),
  ],
  charles_bridge_tower: [
    ['arcade', 0, 0, 3.6, 2.7, 0, 2.11, 'sandstone', 1],
    ['wall', 0, -.06, 3.62, 2.63, 2.11, 2.18, 'rubble', 4],
    ['hip', 0, -.06, 3.83, 2.83, 4.29, 1.61, 'slate'],
    ...[-1.47, 1.47].flatMap((x): Parts => [
      ['spire', x, -1.1, .57, .57, 4.54, 1.18, 'slate'],
      ['spire', x, 1.1, .57, .57, 4.54, 1.18, 'slate'],
    ]),
  ],
  astronomical_clock: [
    ...hall(5.06, 3.18, 2.92, 'plaster', 'tile', 6),
    ...tower(-1.7, 1, 1.94, 5.44, 'rubble', 'slate'),
    ['clock', -1.7, 2, 1.19, .07, 1.12, 1.19, 'gold'],
    ['clock', -1.7, 2, .83, .07, .24, .83, 'copper'],
    ['wall', -1.7, 1, 2.13, 2.13, 4.97, .24, 'sandstone', 3],
  ],
  tyn_church: [
    ['wall', 0, -.68, 3.55, 4.95, 0, 2.97, 'sandstone', 4],
    ['gable', 0, -.68, 3.68, 5.23, 2.97, 1.37, 'tile'],
    ...tower(-1.2, 1.86, 1.36, 4.72, 'rubble', 'slate'),
    ...tower(1.28, 1.86, 1.54, 4.88, 'rubble', 'slate'),
    ...[-1.86, -.61, .61, 1.98].map((x): MonumentPart => ['spire', x, 2.39, .32, .32, 4.57, 1.22, 'slate']),
  ],
  powder_tower: [
    ['arcade', 0, 0, 3.21, 2.68, 0, 2.1, 'rubble', 1],
    ['wall', 0, 0, 3.22, 2.7, 2.1, 2.8, 'rubble', 4],
    ['wall', 0, 0, 3.45, 2.95, 4.66, .23, 'sandstone'],
    ['hip', 0, 0, 3.42, 2.92, 4.9, 1.31, 'slate'],
    ...[-1.31, 1.31].map((x): MonumentPart => ['spire', x, 1.15, .5, .5, 4.89, .98, 'slate']),
  ],
  dancing_house: [
    ['cylinder', .83, .07, 2.48, 2.28, 0, 4.15, 'limestone', 10],
    ['glassTower', -1.2, .45, 2.15, 1.95, 0, 4.31, 'glass'],
    ['wall', 1.9, -.7, 2.1, 2.05, 0, 3.68, 'plaster', 4],
    ['dome', .81, .03, 1.1, 1.1, 4.15, .77, 'steel'],
  ],
  petrin_tower: [
    ['wall', 0, 0, 4.1, 4.1, 0, .28, 'sandstone'],
    ['truss', 0, 0, 3.02, 3.02, .28, 3.36, 'copper', 3],
    ['truss', 0, 0, 1.5, 1.5, 3.64, 2.39, 'copper', 2],
    ['cylinder', 0, 0, 2.11, 2.11, 5.66, .57, 'slate', 8],
    ['spire', 0, 0, 1.82, 1.82, 6.23, .79, 'copper'],
  ],
  vysehrad_basilica: [
    ...hall(4.34, 6.17, 2.73, 'sandstone', 'tile', 5),
    ...tower(-1.37, 2.65, 1.22, 4.05, 'sandstone', 'slate'),
    ...tower(1.37, 2.65, 1.22, 4.05, 'sandstone', 'slate'),
    ['arcade', 0, 3.13, 1.26, .56, 0, 1.63, 'limestone', 1],
    ['clock', 0, 3.15, .83, .05, 1.93, .83, 'glass'],
  ],
  national_theatre_prague: [
    ['wall', 0, 0, 6.57, 4.27, 0, 3.06, 'sandstone', 8],
    ['arcade', 0, 2.26, 5.54, .76, 0, 2.53, 'limestone', 7],
    ['hip', 0, 0, 6.81, 4.58, 3.06, 1.46, 'slate'],
    ['wall', 0, 1.85, 6.1, .18, 3.08, .18, 'gold'],
    ...[-2.6, -1.3, 0, 1.3, 2.6].map((x): MonumentPart => ['spire', x, 2.03, .19, .19, 3.25, .38, 'gold']),
  ],
};
