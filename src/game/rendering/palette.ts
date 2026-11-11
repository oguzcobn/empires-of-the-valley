import type { Season } from '../core/time';

/** Original cozy-diorama palette. Light comes from the upper-left; left faces are lit. */
export interface SeasonPalette {
  grass: number[];
  fertile: number;
  furrow: number;
  sand: number;
  water: number;
  waterLight: number;
  leaf: number[];
  pine: number;
  crop: number;
  cropHeight: number;
  snow: boolean;
  sky: number;
}

export const SEASON_PALETTE: Record<Season, SeasonPalette> = {
  spring: {
    grass: [0x86c25a, 0x7fbb54, 0x8cc761, 0x79b550],
    fertile: 0x8a6b43,
    furrow: 0x76593a,
    sand: 0xe6d49a,
    water: 0x4fa9d6,
    waterLight: 0x8fd0ee,
    leaf: [0x6fbf4f, 0x86cc5c, 0xf2b6c8],
    pine: 0x3f8a4a,
    crop: 0x9bd35a,
    cropHeight: 3,
    snow: false,
    sky: 0xbfe3f2,
  },
  summer: {
    grass: [0x6fae4a, 0x69a745, 0x75b44f, 0x63a041],
    fertile: 0x8a6b43,
    furrow: 0x76593a,
    sand: 0xe9d7a0,
    water: 0x3f9fd0,
    waterLight: 0x86c9ea,
    leaf: [0x3f9440, 0x4fa348, 0x5db052],
    pine: 0x2f7a3f,
    crop: 0x7fbf3f,
    cropHeight: 7,
    snow: false,
    sky: 0xa9dcf5,
  },
  autumn: {
    grass: [0xa3b057, 0x9ca953, 0xaab65c, 0x96a24e],
    fertile: 0x86643c,
    furrow: 0x705233,
    sand: 0xe2cf98,
    water: 0x4a97c2,
    waterLight: 0x84bfdc,
    leaf: [0xd9872b, 0xc9652a, 0xe6b23a],
    pine: 0x356f3d,
    crop: 0xe2bb45,
    cropHeight: 9,
    snow: false,
    sky: 0xd9d2b8,
  },
  winter: {
    grass: [0xe9eef2, 0xe2e8ee, 0xeef2f5, 0xdde4ea],
    fertile: 0xb7a48f,
    furrow: 0x9f8c79,
    sand: 0xe8e2cf,
    water: 0x8fc3dc,
    waterLight: 0xcfe7f2,
    leaf: [0x8a7560, 0x8a7560, 0x8a7560],
    pine: 0x3d6e52,
    crop: 0xcfc3a8,
    cropHeight: 0,
    snow: true,
    sky: 0xd4dee6,
  },
};

export const COLORS = {
  road: 0xc9a875,
  roadEdge: 0xa88a5c,
  earth: 0x8a6a45,
  earthDark: 0x6f5436,
  rock: 0x9aa0a6,
  rockDark: 0x767c84,
  trunk: 0x7a5232,
  wood: 0xb98a5a,
  woodDark: 0x8a5f38,
  plank: 0xd2a868,
  plaster: 0xeedfb8,
  stoneWall: 0xd9d4c7,
  thatch: 0xd9b65c,
  shingle: 0xa8643c,
  tile: 0xc0503a,
  slate: 0x51718f,
  door: 0x5a3b22,
  window: 0x9ed0e6,
  ok: 0x4fd06b,
  bad: 0xe5484d,
  select: 0xffe27a,
  range: 0xffd24a,
  shadow: 0x1b2a1a,
  smoke: 0xf2f2f2,
  skin: 0xf0c9a0,
  flag: 0xd9463e,
};

export const VILLAGER_COLORS = [0xd9634c, 0x4c8bd9, 0xe0b23c, 0x7a5cc4, 0x4fae7a, 0xc96f9f];
