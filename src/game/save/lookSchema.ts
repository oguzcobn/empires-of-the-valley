import { z } from 'zod';
import {
  BALCONY_TYPES,
  CHIMNEY_TYPES,
  COURTYARD_TYPES,
  DECOR_TYPES,
  DOOR_TYPES,
  FACADE_COLORS,
  GARDEN_TYPES,
  ROOF_MATERIALS,
  ROOF_TYPES,
  TOWER_TYPES,
  WALL_MATERIALS,
  WINDOW_TYPES,
} from '../data/architecture';

const oneOf = <T extends string>(values: readonly T[]) => z.enum(values as unknown as [T, ...T[]]);

/** Strict schema for a building look: used by saves, workshop designs and design imports. */
export const lookSchema = z
  .object({
    floors: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    roof: oneOf(ROOF_TYPES),
    roofMaterial: oneOf(ROOF_MATERIALS),
    wall: oneOf(WALL_MATERIALS),
    facade: oneOf(FACADE_COLORS),
    windows: oneOf(WINDOW_TYPES),
    door: oneOf(DOOR_TYPES),
    tower: oneOf(TOWER_TYPES),
    balcony: oneOf(BALCONY_TYPES),
    chimney: oneOf(CHIMNEY_TYPES),
    garden: oneOf(GARDEN_TYPES),
    courtyard: oneOf(COURTYARD_TYPES),
    decor: oneOf(DECOR_TYPES),
  })
  .strict();
