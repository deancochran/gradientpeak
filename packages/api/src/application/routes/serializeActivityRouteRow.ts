import { type ActivityRouteRow, publicActivityRoutesRowSchema } from "@repo/db";
import { z } from "zod";

export const serializedActivityRouteSchema = z
  .object({
    ...publicActivityRoutesRowSchema.shape,
    idx: z.number().int().nonnegative().default(0),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strip();

/** Maps a database route record to the stable API-safe route representation. */
export function serializeActivityRouteRow(row: ActivityRouteRow) {
  return serializedActivityRouteSchema.parse({
    ...row,
    idx: row.idx ?? 0,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  });
}
