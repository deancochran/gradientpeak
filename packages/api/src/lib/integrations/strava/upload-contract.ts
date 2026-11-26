import { z } from "zod";

const stravaIdentifierSchema = z.union([
  z.string().regex(/^\d{1,20}$/),
  z.number().int().safe().nonnegative(),
]);

export const stravaUploadStatusSchema = z
  .object({
    activity_id: stravaIdentifierSchema.nullable().optional(),
    error: z.string().max(2_048).nullable().optional(),
    external_id: z.string().max(512).nullable().optional(),
    id: stravaIdentifierSchema,
    id_str: z
      .string()
      .regex(/^\d{1,20}$/)
      .optional(),
    status: z.string().max(2_048),
  })
  .passthrough();
