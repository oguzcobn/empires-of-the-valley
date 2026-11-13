import type { ArchitectureStyle, BuildingId, BuildingLook, LandmarkId } from '../core/types';
import { defaultLook } from './architecture';

/** Architecture Atlas entries: the landmarks plus the vernacular types the cultures are built from. */
export interface AtlasEntry {
  id: string;
  culture: Extract<ArchitectureStyle, 'scottish' | 'turkish'>;
  kind: 'monument' | 'vernacular';
  /** Sprite shown in the atlas (the same procedural art as in the game). */
  sprite: { definitionId: BuildingId; level: number; style: ArchitectureStyle; look: BuildingLook | null };
  /** Landmark id when the entry is buildable as a monument. */
  landmark?: LandmarkId;
}

const v = (id: string, culture: 'scottish' | 'turkish', definitionId: BuildingId, level: number, look?: Partial<BuildingLook>): AtlasEntry => ({
  id,
  culture,
  kind: 'vernacular',
  sprite: {
    definitionId,
    level,
    style: culture,
    look: look ? { ...defaultLook(culture, definitionId, level), ...look } : null,
  },
});
const m = (id: LandmarkId, culture: 'scottish' | 'turkish'): AtlasEntry => ({
  id,
  culture,
  kind: 'monument',
  landmark: id,
  sprite: { definitionId: id, level: 1, style: culture, look: null },
});

export const ATLAS: readonly AtlasEntry[] = [
  m('edinburgh_castle', 'scottish'),
  m('stirling_castle', 'scottish'),
  m('scott_monument', 'scottish'),
  v('blackhouse', 'scottish', 'hut', 1),
  v('tenement', 'scottish', 'hut', 3, { floors: 4, wall: 'harl', roof: 'crow_step', windows: 'sash', facade: 'cream' }),
  v('georgian', 'scottish', 'hut', 3),
  v('towerhouse', 'scottish', 'town_center', 1),
  m('sumela_monastery', 'turkish'),
  m('galata_tower', 'turkish'),
  m('selimiye_mosque', 'turkish'),
  m('trabzon_stadium', 'turkish'),
  v('anatolian', 'turkish', 'hut', 1),
  v('blacksea', 'turkish', 'granary', 1),
  v('safranbolu', 'turkish', 'hut', 3),
  v('bazaar', 'turkish', 'market', 2),
  v('caravanserai', 'turkish', 'inn', 2),
  v('medrese', 'turkish', 'school', 2),
];
