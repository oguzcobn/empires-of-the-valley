import type { ArchitectureStyle } from '../../core/types';

/** Region-specific, render-only material choices. Never stored in saves. */
export interface StreetMaterial {
  kerb: number;
  kerbHighlight: number;
  lanternMetal: number;
  lanternGlow: number;
  planterStone: number;
  lushLeaf: number;
  leaf: number;
  flowers: readonly [number, number, number];
}

const SCOTTISH: StreetMaterial = {
  kerb: 0xa8a49a,
  kerbHighlight: 0xd8d2c5,
  lanternMetal: 0x2b3036,
  lanternGlow: 0xffc783,
  planterStone: 0x898f8b,
  lushLeaf: 0x356d4b,
  leaf: 0x52755c,
  flowers: [0xb98eac, 0xe8d6a0, 0xe4e5dc],
};

const TURKISH: StreetMaterial = {
  kerb: 0xd2c4a6,
  kerbHighlight: 0xf1e2c1,
  lanternMetal: 0x3b3027,
  lanternGlow: 0xffd27a,
  planterStone: 0xb9b1a2,
  lushLeaf: 0x3f8a4a,
  leaf: 0x5c8f45,
  flowers: [0xe25a6a, 0xf2c230, 0xf5f0e8],
};

/** All variants preserve geometry and hitboxes; only paint changes. */
export function streetMaterial(style: ArchitectureStyle): StreetMaterial {
  return style === 'scottish' ? SCOTTISH : TURKISH;
}
