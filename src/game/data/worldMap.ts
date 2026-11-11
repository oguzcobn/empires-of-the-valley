/**
 * World map preview data: 24 contiguous provinces on a 6x4 offset hex grid.
 * Phase 1 only simulates the home province; the others are a clearly labelled, locked preview.
 * Ownership, armies and conquest arrive in Phase 3.
 */
export type Biome =
  | 'capital'
  | 'fertile_plain'
  | 'forest'
  | 'mountain'
  | 'river_valley'
  | 'coast'
  | 'steppe'
  | 'trade_crossroads';

export interface WorldProvince {
  id: string;
  name: string;
  biome: Biome;
  col: number;
  row: number;
  neighbors: string[];
}

const COLS = 6;
const ROWS = 4;

const RAW: readonly [string, string, Biome][] = [
  ['kuzey_hisari', 'Kuzey Hisarı', 'mountain'],
  ['kartal_yuvasi', 'Kartal Yuvası', 'mountain'],
  ['karacam', 'Karaçam Ormanı', 'forest'],
  ['demirkaya', 'Demirkaya', 'mountain'],
  ['ruzgarli_yayla', 'Rüzgârlı Yayla', 'steppe'],
  ['bozkir_kapisi', 'Bozkır Kapısı', 'steppe'],
  ['sisli_gol', 'Sisli Göl', 'river_valley'],
  ['meselik', 'Meşelik', 'forest'],
  ['cinar_ormani', 'Çınar Ormanı', 'forest'],
  ['akcay_gecidi', 'Akçay Geçidi', 'river_valley'],
  ['kervan_kavsagi', 'Kervan Kavşağı', 'trade_crossroads'],
  ['kizilkaya', 'Kızılkaya', 'mountain'],
  ['gumusdere', 'Gümüşdere', 'river_valley'],
  ['saritarla', 'Sarıtarla', 'fertile_plain'],
  ['bereket_vadisi', 'Bereket Vadisi', 'capital'],
  ['taskopru', 'Taşköprü Ovası', 'fertile_plain'],
  ['altinova', 'Altınova', 'fertile_plain'],
  ['bakirtepe', 'Bakırtepe', 'mountain'],
  ['tuzla_sahili', 'Tuzla Sahili', 'coast'],
  ['yelken_kiyisi', 'Yelken Kıyısı', 'coast'],
  ['sogutlu_irmak', 'Söğütlü Irmak', 'river_valley'],
  ['derebasi', 'Derebaşı', 'forest'],
  ['ayisigi_koyu', 'Ayışığı Koyu', 'coast'],
  ['gunes_limani', 'Güneş Limanı', 'coast'],
];

function neighborCoords(col: number, row: number): [number, number][] {
  const shift = row % 2 === 1 ? 0 : -1;
  return [
    [col - 1, row],
    [col + 1, row],
    [col + shift, row - 1],
    [col + shift + 1, row - 1],
    [col + shift, row + 1],
    [col + shift + 1, row + 1],
  ];
}

export const WORLD_PROVINCES: readonly WorldProvince[] = RAW.map(([id, name, biome], index) => {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const neighbors = neighborCoords(col, row)
    .filter(([c, r]) => c >= 0 && c < COLS && r >= 0 && r < ROWS)
    .map(([c, r]) => RAW[r * COLS + c]![0]);
  return { id, name, biome, col, row, neighbors };
});

export const HOME_PROVINCE_ID = 'bereket_vadisi';
export const WORLD_BY_ID = Object.fromEntries(WORLD_PROVINCES.map((p) => [p.id, p])) as Record<
  string,
  WorldProvince
>;
