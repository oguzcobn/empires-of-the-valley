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
/** Raw copies of older-version saves, taken before they are migrated (never modified). */
const BACKUPS = 'backups';
/** Architecture Workshop designs (see save/designs.ts). */
export const DESIGNS = 'designs';

export interface BackupRecord {
  id: string;
  createdAt: string;
  source: string;
  schemaVersion: number;
  raw: unknown;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  // v1: saves. v2 (architecture update): backups and workshop designs. Existing saves are kept.
  dbPromise ??= openDB(DB_NAME, 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE))
        database.createObjectStore(STORE, { keyPath: 'slotId' });
      if (!database.objectStoreNames.contains(BACKUPS))
        database.createObjectStore(BACKUPS, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(DESIGNS))
        database.createObjectStore(DESIGNS, { keyPath: 'id' });
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

export async function writeBackup(source: string, schemaVersion: number, raw: unknown, now = new Date()): Promise<string> {
  const id = `${source}-v${schemaVersion}-${now.toISOString()}`;
  await (await db()).put(BACKUPS, { id, createdAt: now.toISOString(), source, schemaVersion, raw } satisfies BackupRecord);
  return id;
}

export async function listBackups(): Promise<BackupRecord[]> {
  const all = (await (await db()).getAll(BACKUPS)) as BackupRecord[];
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Shared connection for other stores of the same database (designs). */
export const database = db;

/** Test helper: forget the cached connection. */
export function resetDbConnection(): void {
  dbPromise = null;
}
