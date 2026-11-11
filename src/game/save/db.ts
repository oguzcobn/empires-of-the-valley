import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { SaveFile, SaveMeta } from './serialize';

export const SLOT_IDS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type SlotId = (typeof SLOT_IDS)[number];

interface SaveRecord extends SaveFile {
  slotId: SlotId;
}

const DB_NAME = 'empires-of-the-valley';
const STORE = 'saves';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE))
        database.createObjectStore(STORE, { keyPath: 'slotId' });
    },
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Local-only save slots in IndexedDB. Every function rejects with a real error the UI reports. */
export async function writeSlot(slotId: SlotId, file: SaveFile): Promise<void> {
  await (await db()).put(STORE, { ...file, slotId } satisfies SaveRecord);
}

export async function readSlot(slotId: SlotId): Promise<unknown> {
  return (await db()).get(STORE, slotId);
}

export async function deleteSlot(slotId: SlotId): Promise<void> {
  await (await db()).delete(STORE, slotId);
}

export async function listSlots(): Promise<{ slotId: SlotId; meta: SaveMeta }[]> {
  const records = (await (await db()).getAll(STORE)) as SaveRecord[];
  return records
    .filter((r) => SLOT_IDS.includes(r.slotId) && typeof r.meta?.savedAt === 'string')
    .map((r) => ({ slotId: r.slotId, meta: r.meta }))
    .sort((a, b) => b.meta.savedAt.localeCompare(a.meta.savedAt));
}

/** Test helper: forget the cached connection. */
export function resetDbConnection(): void {
  dbPromise = null;
}
