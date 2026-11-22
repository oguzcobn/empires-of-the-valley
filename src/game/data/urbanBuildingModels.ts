import type { ArchitectureStyle, BuildingId } from '../core/types';

export const URBAN_IDS = ['skyscraper', 'high_school', 'port', 'government_hall', 'barber_shop',
  'coffee_shop', 'grand_mall', 'tech_store', 'clothing_store'] as const satisfies readonly BuildingId[];
export type UrbanId = typeof URBAN_IDS[number];
export const isUrbanBuilding = (id: BuildingId): id is UrbanId => URBAN_IDS.some(key => key === id);

export const URBAN_MATERIALS = {
  concrete: { color: 0x9b9c97, roughness: .91, metalness: 0 },
  limestone: { color: 0xcdbc9f, roughness: .82, metalness: 0 },
  brick: { color: 0x904c39, roughness: .91, metalness: 0 },
  stucco: { color: 0xd4c6ae, roughness: .83, metalness: 0 },
  slate: { color: 0x454d54, roughness: .8, metalness: 0 },
  asphalt: { color: 0x404447, roughness: .97, metalness: 0 },
  aluminum: { color: 0x818d91, roughness: .42, metalness: .66 },
  darkFrame: { color: 0x242f34, roughness: .46, metalness: .42 },
  warmWood: { color: 0x835c3f, roughness: .72, metalness: 0 },
  blueGlass: { color: 0x4c7990, roughness: .17, metalness: .28 },
  warmGlass: { color: 0x938579, roughness: .21, metalness: .21 },
  clearGlass: { color: 0xa9c1c5, roughness: .17, metalness: .03 },
  light: { color: 0xffe8b4, roughness: .57, metalness: 0, emissive: 0xffc980, emissiveIntensity: .42 },
  red: { color: 0xa24236, roughness: .59, metalness: .18 },
  orange: { color: 0xb96c37, roughness: .61, metalness: .12 },
  yellow: { color: 0xd5a84e, roughness: .55, metalness: .25 },
  navy: { color: 0x354d5b, roughness: .65, metalness: .08 },
  olive: { color: 0x4e654c, roughness: .83, metalness: 0 },
  white: { color: 0xddd9c7, roughness: .74, metalness: 0 },
  rubber: { color: 0x262727, roughness: .97, metalness: 0 },
  court: { color: 0x9b604e, roughness: .94, metalness: 0 },
  water: { color: 0x315b68, roughness: .23, metalness: .11 },
} as const;
export type UrbanMaterial = keyof typeof URBAN_MATERIALS;
export type Vector = readonly [number, number, number];
export type UrbanPart =
  | { shape: 'box' | 'cylinder' | 'gable' | 'roof'; p: Vector; size: Vector; mat: UrbanMaterial; sides?: number; preview?: boolean; omitMapTop?: boolean }
  | { shape: 'beam'; a: Vector; b: Vector; width: number; mat: UrbanMaterial }
  | { shape: 'sign'; p: Vector; size: Vector; mat: UrbanMaterial; text: string };
type Model = { width: number; depth: number; parts: UrbanPart[] };

type Facade = { x: number; z: number; y: number; w: number; d: number; h: number; cols: number; rows: number;
  glass: UrbanMaterial; sides?: boolean; horizontal?: .58 | .78 | .90 | .96 };

/** Assets use metres, ground at Y=0 and the principal street facade toward +Z. */
function model(width: number, depth: number, build: (a: ReturnType<typeof architecture>) => void): Model {
  const a = architecture();
  build(a);
  return { width, depth, parts: a.parts };
}

function architecture() {
  const parts: UrbanPart[] = [];
  const solid = (shape: 'box' | 'cylinder' | 'gable' | 'roof', p: Vector, size: Vector, mat: UrbanMaterial, sides?: number, preview?: boolean, omitMapTop?: boolean) =>
    parts.push({ shape, p, size, mat, sides, preview, omitMapTop });
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, mat: UrbanMaterial, preview = true, omitMapTop = false) =>
    solid('box', [x, y, z], [w, h, d], mat, undefined, preview, omitMapTop);
  const round = (x: number, y: number, z: number, w: number, h: number, d: number, mat: UrbanMaterial, sides = 16) =>
    solid('cylinder', [x, y, z], [w, h, d], mat, sides);
  const roof = (x: number, y: number, z: number, w: number, h: number, d: number, mat: UrbanMaterial, gable = false) =>
    solid(gable ? 'gable' : 'roof', [x, y, z], [w, h, d], mat);
  const beam = (a: Vector, b: Vector, width: number, mat: UrbanMaterial) => parts.push({ shape: 'beam', a, b, width, mat });
  const sign = (text: string, x: number, y: number, z: number, w: number, h: number, mat: UrbanMaterial) =>
    parts.push({ shape: 'sign', p: [x, y, z], size: [w, h, .08], mat, text });

  function glazing({ x, z, y, w, d, h, cols, rows, glass, sides = false, horizontal = .78 }: Facade): void {
    const dx = w / cols, dy = h / rows;
    const strip = Math.max(.036, dx * .035);
    for (let row = 0; row < rows; row++) {
      const level = y + row * dy + dy * .12;
      for (let col = 0; col < cols; col++) {
        const at = x + (col + .5 - cols / 2) * dx;
        const ww = dx * horizontal;
        for (const dir of [-1, 1]) {
          box(at, level, z + dir * (d / 2 + .031), ww, dy * .77, .061, 'darkFrame', dir > 0);
          box(at, level + .045, z + dir * (d / 2 + .067), ww - strip * 2, dy * .77 - .08, .037, glass, dir > 0);
        }
      }
      if (!sides) continue;
      const count = Math.max(2, Math.round(cols * d / w));
      const dz = d / count;
      for (let col = 0; col < count; col++) for (const dir of [-1, 1]) {
        const at = z + (col + .5 - count / 2) * dz;
        box(x + dir * (w / 2 + .032), level, at, .061, dy * .77, dz * horizontal, 'darkFrame', dir > 0);
        box(x + dir * (w / 2 + .068), level + .045, at, .039, dy * .77 - .08, dz * horizontal - strip * 2, glass, dir > 0);
      }
    }
  }

  function storefront(x: number, z: number, w: number, h: number, lights = true): void {
    const mullion = w / 3;
    box(x, h + .13, z, w + .12, .105, .13, 'darkFrame');
    box(x, .2, z, w + .12, .11, .12, 'darkFrame');
    for (let j = -1; j <= 2; j++) {
      box(x + (j - .5) * mullion, .24, z, .076, h, .14, 'darkFrame');
    }
    for (let j = -1; j <= 1; j++) {
      box(x + j * mullion, .31, z + .02, mullion - .086, h - .19, .026, 'clearGlass');
      if (lights && j !== 0) box(x + j * mullion, h - .28, z - .19, mullion * .76, .07, .15, 'light');
    }
    box(x + .13, .83, z + .07, .05, .24, .055, 'aluminum');
    box(x - .13, .83, z + .07, .05, .24, .055, 'aluminum');
  }

  function shopShell(w: number, d: number, z: number, h: number, opening: number, mat: UrbanMaterial): void {
    const pier = (w - opening) / 2;
    box(0, 0, z - d / 2 + .21, w, h, .42, mat);
    for (const side of [-1, 1]) box(side * (w / 2 - pier / 2), 0, z, pier, h, d, mat);
    box(0, opening > 9 ? 3.42 : 2.71, z, w, h - (opening > 9 ? 3.42 : 2.71), d, mat);
    box(0, .007, z, w, .156, d, 'limestone');
  }

  function hvac(x: number, y: number, z: number, w: number, d: number): void {
    box(x, y, z, w + .16, .11, d + .15, 'darkFrame');
    box(x, y + .11, z, w, .47, d, 'aluminum');
    for (let i = 0; i < 5; i++) box(x, y + .17 + i * .073, z + d / 2 + .021, w * .82, .023, .039, 'slate');
    round(x, y + .58, z, Math.min(w, d) * .59, .019, Math.min(w, d) * .59, 'slate');
  }

  function planter(x: number, z: number, width: number): void {
    box(x, 0, z, width, .26, .54, 'concrete');
    for (let i = 0; i < 3; i++) round(x + (i - 1) * width / 3.6, .25, z, width * .29, .25 + (i % 2) * .09, .42, 'olive', 7);
  }

  function bollard(x: number, z: number): void {
    round(x, 0, z, .13, .56, .13, 'slate', 8);
    round(x, .46, z, .15, .06, .15, 'aluminum', 8);
  }

  return { parts, box, round, roof, beam, sign, glazing, storefront, shopShell, hvac, planter, bollard };
}

export const URBAN_MODELS: Record<UrbanId, Model> = {
  skyscraper: model(24, 22, ({ box, glazing, storefront, hvac, beam, planter, sign, bollard }) => {
    box(0, -.28, 0, 23.5, .28, 21.5, 'concrete');
    box(0, 0, -1.1, 18, 5.4, 15.6, 'limestone');
    box(0, 4.8, -1.1, 18.4, .62, 15.9, 'aluminum');
    storefront(0, 6.75, 9.2, 3.15);
    box(0, 3.63, 7.37, 8.75, .15, 1.7, 'aluminum');
    sign('VADİ PLAZA', 0, 3.95, 7.15, 6.1, .61, 'darkFrame');
    box(-.65, 5.42, -1.2, 13.6, 43.8, 11.8, 'darkFrame');
    glazing({ x: -.65, z: -1.2, y: 5.6, w: 13.6, d: 11.8, h: 43.4, cols: 8, rows: 13, glass: 'blueGlass', sides: true, horizontal: .96 });
    for (const y of [16.7, 27, 39.5]) box(-.65, y, -1.2, 13.78, .33, 12.02, 'aluminum', true, true);
    for (const x of [-7.44, 6.15]) box(x, 5.43, -1.2, .18, 44.5, .22, 'aluminum');
    box(.75, 49.22, -1.3, 9.35, 11.15, 8.5, 'darkFrame');
    glazing({ x: .75, z: -1.3, y: 49.3, w: 9.35, d: 8.5, h: 10.9, cols: 5, rows: 3, glass: 'blueGlass', sides: true, horizontal: .96 });
    box(.75, 60.38, -1.3, 9.59, .43, 8.72, 'aluminum');
    box(.75, 60.82, -.9, 5.25, 2.4, 5.1, 'slate');
    hvac(.75, 63.22, -1.2, 2.2, 1.7);
    beam([.8, 63.82, -1.2], [.8, 66.4, -1.2], .11, 'aluminum');
    box(.8, 66.38, -1.2, .24, .16, .24, 'red');
    for (const x of [-8.5, 8.5]) { planter(x, 8.55, 4); bollard(x * .7, 9.9); }
  }),

  high_school: model(31, 24, ({ box, glazing, roof, storefront, sign, beam, planter }) => {
    box(0, -.22, 0, 30.7, .22, 23.7, 'concrete');
    for (const x of [-8.65, 8.65]) {
      box(x, 0, -4.65, 11, 8.5, 8.3, 'brick');
      glazing({ x, z: -4.65, y: .38, w: 11, d: 8.3, h: 7.6, cols: 5, rows: 2, glass: 'blueGlass', sides: true });
      roof(x, 8.5, -4.65, 11.42, 1.78, 8.73, 'slate', true);
      box(x, 4.04, -.47, 10.94, .23, .14, 'stucco');
    }
    box(0, 0, -4.6, 6.5, 9.5, 8.55, 'stucco');
    glazing({ x: 0, z: -4.6, y: 4, w: 6.5, d: 8.55, h: 4.75, cols: 3, rows: 1, glass: 'blueGlass' });
    roof(0, 9.5, -4.6, 6.8, 1.52, 8.85, 'slate', true);
    storefront(0, -.29, 4.7, 3.05);
    box(0, 3.15, .45, 6.3, .22, 1.72, 'aluminum');
    sign('VADİ LİSESİ', 0, 3.51, -.25, 4.65, .63, 'navy');
    box(7.4, .03, 6.04, 12.8, .08, 8.15, 'court');
    const y = .12;
    for (const x of [1.35, 7.4, 13.45]) box(x, y, 6.04, .07, .028, 7.71, 'white');
    for (const z of [2.19, 9.9]) box(7.4, y, z, 12.14, .028, .075, 'white');
    for (const x of [1.82, 12.98]) {
      beam([x, .1, 6.04], [x, 2.85, 6.04], .1, 'navy');
      box(x, 2.44, 6.04, .08, .5, .87, 'white');
    }
    for (const x of [-11.7, -6.7]) {
      planter(x, 1.7, 3);
      box(x, .08, 6.5, 2.65, .34, .5, 'warmWood');
    }
    beam([-3.5, 0, 2], [-3.5, 6.94, 2], .075, 'aluminum');
    box(-2.97, 5.84, 2, 1.04, .67, .042, 'red');
  }),

  port: model(43, 29, ({ box, beam, sign, round, roof, glazing, bollard }) => {
    box(0, -.38, -5.3, 42.5, .38, 17.58, 'concrete');
    box(0, -.47, 8.8, 42.5, .13, 10.6, 'water');
    box(0, -.43, 3.5, 42.53, .43, .52, 'slate');
    for (let x = -18; x <= 18; x += 6) {
      box(x, -.4, 3.94, .73, .42, .29, 'rubber');
      box(x, .01, 1.63, 3.05, .022, .1, 'yellow');
      bollard(x, 3.15);
    }
    for (const x of [-12, 12]) {
      const lane = 1.2;
      for (const dx of [-2.65, 2.65]) {
        for (const dz of [-2.6, 2.6]) {
          box(x + dx, 0, lane + dz, .75, .33, .66, 'navy');
          beam([x + dx, .31, lane + dz], [x + dx, 11.8, lane + dz * .8], .38, 'orange');
        }
        beam([x + dx, 1.15, lane - 2.45], [x + dx, 8.8, lane + 2.12], .23, 'orange');
        beam([x + dx, 11.9, -1.8], [x + dx, 11.9, 11.2], .35, 'yellow');
        beam([x + dx, 11.9, 1], [x + dx, 15.1, 1], .24, 'navy');
        beam([x + dx, 15.1, 1], [x + dx, 11.9, 10.8], .085, 'darkFrame');
      }
      for (const z of [0, 3.56, 9.25]) beam([x - 2.65, 11.9, z], [x + 2.65, 11.9, z], .35, 'yellow');
      box(x + 1.9, 10.36, 3.27, 1.35, 1, 1.12, 'navy');
      box(x + 1.9, 10.58, 3.86, 1.04, .52, .06, 'blueGlass');
      for (const offset of [-.25, .25]) beam([x + offset, 11.8, 6.95], [x + offset, 4.35, 6.95], .043, 'slate');
      box(x, 4.08, 6.95, 2.49, .24, .78, 'yellow');
    }
    for (let i = 0; i < 12; i++) {
      const x = (i % 4 - 1.5) * 4.72;
      const row = Math.floor(i / 4);
      const z = -6.5 - (row % 2) * 2.6;
      const y = row === 2 ? 1.75 : 0;
      const palette = ['red', 'navy', 'orange', 'olive'] as const;
      const mat = palette[(i + row) % palette.length]!;
      box(x, y, z, 4.34, 1.72, 2.24, mat);
      for (let s = -5; s <= 5; s++) box(x + s * .34, y + .12, z + 1.13, .079, 1.5, .093, mat);
      for (const xDoor of [-1.93, 1.93]) box(x + xDoor, y + .13, z + 1.215, .09, 1.46, .023, 'darkFrame');
    }
    box(14.6, 0, -8.7, 9.5, 3.35, 5.5, 'concrete');
    roof(14.6, 3.35, -8.7, 9.72, 1.1, 5.77, 'slate', true);
    glazing({ x: 14.6, z: -8.7, y: 1.33, w: 9.5, d: 5.5, h: 1.2, cols: 5, rows: 1, glass: 'blueGlass' });
    sign('LİMAN', 14.6, .94, -5.91, 3.3, .52, 'navy');
    box(-4.8, -.08, 8.24, 17.5, .53, 3.15, 'navy');
    box(-4.8, .44, 8.24, 16.58, .18, 2.96, 'warmWood');
    round(3.48, -.09, 8.24, 2.9, .52, 3.02, 'navy', 10);
    box(-11.18, .63, 8.24, 3.43, 1.43, 2.45, 'white');
    glazing({ x: -11.18, z: 8.24, y: 1.12, w: 3.43, d: 2.45, h: .8, cols: 3, rows: 1, glass: 'blueGlass' });
    round(-11.47, 2.05, 8.26, .55, .83, .55, 'red', 12);
  }),

  government_hall: model(28, 23, ({ box, beam, round, roof, glazing, storefront, sign, planter }) => {
    box(0, -.32, 0, 27.8, .32, 22.8, 'concrete');
    box(0, 0, -2.18, 24, .68, 13.68, 'limestone');
    box(0, .68, -2.15, 23.2, 8.6, 13.15, 'limestone');
    glazing({ x: 0, z: -2.15, y: 1.02, w: 23.2, d: 13.15, h: 7.74, cols: 11, rows: 3, glass: 'warmGlass', sides: true, horizontal: .58 });
    for (const floor of [1.55, 5.78, 8.94]) box(0, floor, -2.15, 23.46, .2, 13.39, 'stucco');
    roof(0, 9.29, -2.15, 23.56, 1.99, 13.58, 'slate');
    for (let i = 0; i < 6; i++) box(0, i * .135, 7.4 - i * .32, 10.1, .135, 4.94 - i * .64, 'limestone');
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 1.79;
      box(x, .73, 7.0, .91, .2, .91, 'limestone');
      round(x, .92, 7, .67, 5.95, .67, 'limestone', 16);
      box(x, 6.86, 7, .92, .34, .94, 'stucco');
    }
    storefront(0, 4.48, 6, 3.12);
    box(0, 7.19, 6.15, 10.11, .62, 4.19, 'limestone');
    roof(0, 7.81, 6.17, 10.26, 1.53, 4.32, 'limestone', true);
    sign('HÜKÜMET KONAĞI', 0, 7.26, 8.27, 7.65, .39, 'navy');
    for (const direction of [-1, 1]) {
      planter(direction * 9.6, 7.3, 3.45);
      beam([direction * 7.1, 0, 8.63], [direction * 7.1, 5.77, 8.63], .088, 'aluminum');
      box(direction * 7.1 + .67, 4.8, 8.63, 1.33, .76, .045, direction === -1 ? 'red' : 'navy');
    }
  }),

  barber_shop: model(8.5, 8.5, ({ box, round, roof, storefront, shopShell, sign, planter }) => {
    box(0, -.19, 0, 8.3, .19, 8.3, 'concrete');
    shopShell(6.25, 5.82, -.74, 4.08, 5.43, 'brick');
    for (const x of [-1.6, 1.35]) {
      round(x, .15, 1.04, .47, .28, .47, 'aluminum');
      box(x, .43, 1.04, .63, .26, .54, 'red');
      box(x, .64, .8, .6, .72, .16, 'red');
      box(x, .6, .46, 1.17, .13, .31, 'warmWood');
      box(x, .9, .26, .78, .81, .071, 'aluminum');
    }
    box(0, .12, 2.24, 6.31, .32, .16, 'limestone');
    storefront(0, 2.26, 5.43, 2.53);
    sign('BERBER', 0, 2.96, 2.29, 5.44, .71, 'navy');
    roof(0, 4.09, -.74, 6.62, 1.12, 6.18, 'slate', true);
    for (let i = 0; i < 7; i++) round(2.9, .85 + i * .19, 2.57, .22, .19, .22, i % 3 === 0 ? 'red' : i % 3 === 1 ? 'white' : 'navy');
    round(2.9, 2.18, 2.57, .27, .16, .27, 'aluminum');
    round(2.9, .73, 2.57, .26, .12, .26, 'aluminum');
    box(-2.22, .16, 3.31, 1.43, .29, .4, 'warmWood');
    planter(2.49, 3.49, .91);
  }),

  coffee_shop: model(10, 10, ({ box, round, roof, sign, storefront, shopShell, planter }) => {
    box(0, -.19, 0, 9.7, .19, 9.77, 'concrete');
    shopShell(7.85, 5.25, -1.58, 3.41, 6.8, 'warmWood');
    box(-1.64, .16, -.62, 3.25, .96, .85, 'warmWood');
    box(-1.64, 1.12, -.62, 3.35, .08, .93, 'limestone');
    box(-1.92, 1.2, -.63, 1.1, .47, .62, 'aluminum');
    for (const x of [-2.18, -1.75]) round(x, 1.2, -.18, .165, .13, .165, 'white', 8);
    storefront(0, 1.11, 6.8, 2.46);
    sign('KAHVE', 0, 2.64, 1.12, 5.62, .57, 'olive');
    box(0, 3.44, -1.54, 8.15, .23, 5.61, 'slate');
    for (let i = 0; i < 15; i++) {
      const x = (i - 7) * .48;
      box(x, 2.45, 1.77, .48, .102, 1.37, i % 2 ? 'limestone' : 'olive');
      box(x, 2.31, 2.44, .48, .148, .04, i % 2 ? 'limestone' : 'olive');
    }
    for (const x of [-2.54, 2.51]) {
      round(x, 0, 3.55, .09, 2.52, .09, 'darkFrame');
      roof(x, 2.31, 3.55, 2.73, .58, 2.48, 'limestone');
      round(x, .15, 3.55, .13, .62, .13, 'slate');
      round(x, .75, 3.55, 1.05, .09, 1.05, 'warmWood');
      for (const dir of [-1, 1]) box(x + dir * .8, .34, 3.55, .38, .14, .49, 'warmWood');
    }
    planter(-3.78, 2, .99);
    planter(3.78, 2, .99);
  }),

  grand_mall: model(34, 33, ({ box, round, roof, storefront, glazing, sign, hvac, planter, bollard }) => {
    box(0, -.26, 0, 33.7, .26, 32.7, 'concrete');
    box(-9.35, 0, -2.85, 11.85, 8.6, 21.7, 'concrete');
    box(9.35, 0, -2.85, 11.85, 8.6, 21.7, 'concrete');
    box(0, 0, -7.2, 8.52, 8.8, 13.1, 'navy');
    box(0, 0, 2.6, 8.45, 8.1, 8.23, 'slate');
    glazing({ x: 0, z: 2.6, y: .2, w: 8.45, d: 8.23, h: 7.9, cols: 7, rows: 2, glass: 'blueGlass', sides: true, horizontal: .96 });
    roof(0, 8.16, 2.65, 9.08, 1.84, 9.07, 'blueGlass');
    box(0, 3.52, 7.2, 11.1, .24, 2.98, 'aluminum');
    storefront(0, 7.06, 7.99, 3.15);
    for (const x of [-9.35, 9.35]) {
      glazing({ x, z: -2.85, y: .52, w: 11.85, d: 21.7, h: 4.06, cols: 5, rows: 1, glass: 'warmGlass' });
      box(x, 4.92, 8.07, 11.79, .24, .31, 'navy');
      for (let i = -3; i <= 3; i++) box(x + i * 1.42, 5.2, 8.065, .19, 3.1, .3, 'aluminum');
      for (const offset of [-2.08, 2.08]) hvac(x + offset, 8.6, -4.81, 2.31, 1.68);
      for (const offset of [-2.8, 2.8]) planter(x + offset, 9.6, 2.5);
    }
    sign('VADİ AVM', 0, 5.3, 6.81, 6.6, 1.02, 'navy');
    box(8.2, .01, 12.8, 14.15, .045, 5.68, 'asphalt');
    for (let i = 0; i < 7; i++) box(2.11 + i * 2.08, .062, 12.82, .071, .021, 5.14, 'white');
    for (let i = 0; i < 5; i++) {
      bollard((i - 2) * 1.93, 9.46);
      round(-13.1 + i * 1.82, 0, 13, .16, .43, .16, 'slate', 7);
    }
  }),

  tech_store: model(13.8, 10, ({ box, beam, storefront, shopShell, sign, hvac, planter }) => {
    box(0, -.2, 0, 13.56, .2, 9.8, 'concrete');
    shopShell(11.94, 6.62, -.72, 5.05, 10.55, 'darkFrame');
    box(0, 4.95, -.72, 12.16, .18, 6.89, 'aluminum');
    storefront(0, 2.64, 10.55, 3.21);
    box(0, 2.97, 2.76, 11.06, .12, .18, 'light');
    sign('TEKNOLOJİ', .21, 3.43, 2.64, 8.85, .91, 'navy');
    for (const x of [-5.46, 5.46]) beam([x, .28, 2.74], [x, 4.73, 2.74], .15, 'aluminum');
    for (const x of [-3.43, 3.41]) {
      box(x, .34, 2.31, 2.23, .45, .91, 'white');
      for (let i = -1; i <= 1; i++) {
        box(x + i * .52, .79, 2.43, .36, .06, .31, 'aluminum');
        box(x + i * .52, .84, 2.28, .38, .28, .045, 'blueGlass');
      }
    }
    hvac(-3.19, 5.15, -.91, 2.35, 1.32);
    planter(5.03, 3.65, 2.48);
  }),

  clothing_store: model(13.4, 10.4, ({ box, round, beam, storefront, shopShell, sign, glazing, planter }) => {
    box(0, -.21, 0, 13.26, .21, 10.15, 'concrete');
    shopShell(11.73, 6.91, -.61, 6.8, 10.4, 'stucco');
    box(0, 6.79, -.61, 12.03, .19, 7.17, 'limestone');
    glazing({ x: 0, z: -.61, y: 4.05, w: 11.73, d: 6.91, h: 2.5, cols: 5, rows: 1, glass: 'warmGlass', horizontal: .58 });
    storefront(0, 2.91, 10.4, 3.05);
    box(0, 3.14, 3.52, 10.62, .16, 1.56, 'navy');
    sign('GİYİM', 0, 3.39, 2.91, 7.7, .59, 'navy');
    const garments = ['brick', 'navy', 'olive', 'limestone'] as const;
    for (const x of [-3.66, 3.66]) {
      beam([x - 1.16, .69, 2.53], [x + 1.16, .69, 2.53], .042, 'aluminum');
      for (let i = 0; i < 5; i++) box(x + (i - 2) * .31, .27, 2.55, .27, .42, .088, garments[i % garments.length]!);
      const mannequin = x * .65;
      box(mannequin, .25, 2.34, .28, .76, .17, x > 0 ? 'orange' : 'navy');
      round(mannequin, 1.03, 2.34, .18, .24, .19, 'limestone', 10);
    }
    for (const x of [-5.35, 5.35]) planter(x, 4.22, 1.55);
  }),
};

const regionalModels = new Map<string, readonly UrbanPart[]>();
export function urbanParts(id: UrbanId, style: ArchitectureStyle): readonly UrbanPart[] {
  const key = `${id}/${style}`;
  const cached = regionalModels.get(key);
  if (cached) return cached;
  const { width, depth, parts } = URBAN_MODELS[id];
  const street = architecture();
  const x = -width * .39;
  const z = id === 'port' ? -.5 : depth * .42;
  if (style === 'turkish') {
    street.round(x, 0, z, .82, .34, .82, 'brick', 12);
    street.round(x, .28, z, .88, .10, .88, 'limestone', 12);
    street.round(x, .34, z, .56, .41, .58, 'olive', 9);
  } else if (style === 'scottish') {
    street.box(x, 0, z, .9, .31, .43, 'limestone');
    street.box(x, .31, z, .92, .082, .48, 'slate');
    street.box(x, .4, z, .62, .26, .32, 'olive');
    street.bollard(x + .7, z + .05);
    street.bollard(x - .7, z + .05);
  } else if (style === 'japanese') {
    street.box(x, 0, z, .68, .11, .58, 'limestone');
    street.box(x, .11, z, .32, .42, .32, 'warmWood');
    street.box(x, .53, z, .41, .25, .41, 'light');
    street.roof(x, .78, z, .56, .16, .56, 'slate');
  } else {
    street.box(x, 0, z, .86, .25, .51, 'limestone');
    street.box(x, .22, z, .67, .18, .42, 'olive');
    street.beam([x + .74, 0, z], [x + .74, 1.5, z], .08, 'darkFrame');
    street.box(x + .74, 1.49, z, .2, .25, .2, 'light');
  }
  const result = [...parts, ...street.parts];
  regionalModels.set(key, result);
  return result;
}
