import { z } from 'zod';
import type { BuildingId, BuildingLook } from '../core/types';
import { DESIGNABLE, PLAYABLE_STYLES } from '../data/architecture';
import type { PlayableStyle } from '../data/architecture';
import { DESIGNS, database } from './db';
import { lookSchema } from './lookSchema';

/**
 * Architecture Workshop designs. Stored in IndexedDB (store "designs"), exportable as JSON.
 * A building placed from a design copies the look into the save, so a save never depends on
 * the design library (deleting a design changes nothing on the map).
 */
export interface DesignRecord {
  id: string;
  name: string;
  buildingId: BuildingId;
  style: PlayableStyle;
  look: BuildingLook;
  createdAt: string;
}

export const DESIGN_FORMAT = 'empires-of-the-valley-designs';
export const MAX_DESIGNS = 60;
export const MAX_DESIGN_FILE_BYTES = 256 * 1024;

const designSchema = z
  .object({
    id: z.string().regex(/^d[a-z0-9-]{1,40}$/),
    name: z
      .string()
      .min(1)
      .max(40)
      .refine((s) => !/[<>]/.test(s), 'name'),
    buildingId: z.enum(DESIGNABLE as unknown as [string, ...string[]]),
    style: z.enum(PLAYABLE_STYLES as unknown as [string, ...string[]]),
    look: lookSchema,
    createdAt: z.string().max(40),
  })
  .strict();

const fileSchema = z
  .object({
    format: z.literal(DESIGN_FORMAT),
    version: z.literal(1),
    designs: z.array(designSchema).min(1).max(MAX_DESIGNS),
  })
  .strict();

export type DesignParse = { ok: true; designs: DesignRecord[] } | { ok: false; reason: string };

export const newDesignId = (now = Date.now(), salt = Math.random()): string =>
  `d${now.toString(36)}-${Math.floor(salt * 1e8).toString(36)}`;

/** Normalises a user-typed design name (trimmed, single spaces, no markup characters). */
export const cleanName = (name: string): string =>
  name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

export function validateDesign(d: unknown): d is DesignRecord {
  return designSchema.safeParse(d).success;
}

export function exportDesigns(designs: DesignRecord[]): string {
  return JSON.stringify({ format: DESIGN_FORMAT, version: 1, designs }, null, 2);
}

/** Parses an untrusted design file. Nothing is stored unless every design is valid. */
export function parseDesignFile(text: string): DesignParse {
  if (text.length > MAX_DESIGN_FILE_BYTES) return { ok: false, reason: 'tooLarge' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'notJson' };
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.path.join('.') || 'invalid' };
  return { ok: true, designs: parsed.data.designs as DesignRecord[] };
}

export async function listDesigns(): Promise<DesignRecord[]> {
  const all = (await (await database()).getAll(DESIGNS)) as unknown[];
  return all.filter(validateDesign).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function putDesign(d: DesignRecord): Promise<void> {
  if (!validateDesign(d)) throw new Error('invalid design');
  const db = await database();
  const count = await db.count(DESIGNS);
  const exists = await db.get(DESIGNS, d.id);
  if (!exists && count >= MAX_DESIGNS) throw new Error(`max ${MAX_DESIGNS}`);
  await db.put(DESIGNS, d);
}

export async function deleteDesign(id: string): Promise<void> {
  await (await database()).delete(DESIGNS, id);
}

/** Imported designs get fresh ids so they never overwrite local ones. */
export async function importDesigns(designs: DesignRecord[]): Promise<number> {
  let n = 0;
  for (const d of designs) {
    await putDesign({ ...d, id: newDesignId(Date.now(), Math.random()) });
    n++;
  }
  return n;
}
