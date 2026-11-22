export const MILITIA_CAP = 200;

export const UNIT_IDS = ['infantry', 'scout', 'medic', 'signals', 'engineer'] as const;
export type UnitId = (typeof UNIT_IDS)[number];

export const UNITS = {
  infantry: { name: 'Piyade', detail: 'Hücum gücüne +4', bonus: 4, gold: 4 },
  scout: { name: 'Keşif Birliği', detail: 'Hücum gücüne +2', bonus: 2, gold: 2 },
  medic: { name: 'Sıhhiye', detail: 'Otomatik savaşta kayıpları azaltır', bonus: 0, gold: 3 },
  signals: { name: 'Muhabere Birliği', detail: 'Hücum gücüne +3', bonus: 3, gold: 3 },
  engineer: { name: 'İstihkâm Birliği', detail: 'Hücum gücüne +5', bonus: 5, gold: 5 },
} as const satisfies Record<UnitId, { name: string; detail: string; bonus: number; gold: number }>;

export const specialistCount = (units?: Partial<Record<UnitId, number>>): number =>
  UNIT_IDS.reduce((sum, id) => sum + (units?.[id] ?? 0), 0);
