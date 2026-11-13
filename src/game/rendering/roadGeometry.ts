import type { Province } from '../core/types';
import { tileAt } from '../systems/grid';

/**
 * Physical tile adjacency for an isometric road surface. Coordinates are grid
 * coordinates, NOT the perspective-projected screen directions.
 */
export interface PavedLinks {
  negX: boolean;
  posX: boolean;
  negY: boolean;
  posY: boolean;
}
export type JunctionKind = 'isolated' | 'end' | 'straight' | 'corner' | 'tee' | 'cross';

export function getPavedLinks(p: Province, x: number, y: number): PavedLinks {
  const tile = tileAt(p, x, y);
  const connected = (dx: number, dy: number): boolean => {
    const next = tileAt(p, x + dx, y + dy);
    return !!tile?.road && !!tile.paved && tile.roadType === 'dirt' &&
      !!next?.road && !!next.paved && next.roadType === 'dirt' &&
      tile.height === next.height;
  };
  return {
    negX: connected(-1, 0),
    posX: connected(1, 0),
    negY: connected(0, -1),
    posY: connected(0, 1),
  };
}

export function junctionKind(l: PavedLinks): JunctionKind {
  const n = Number(l.negX) + Number(l.posX) + Number(l.negY) + Number(l.posY);
  if (n === 0) return 'isolated';
  if (n === 1) return 'end';
  if (n === 4) return 'cross';
  if (n === 3) return 'tee';
  if ((l.negX && l.posX) || (l.negY && l.posY)) return 'straight';
  return 'corner';
}
