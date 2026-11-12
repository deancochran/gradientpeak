import { dateOnlySchema } from "@repo/core/schemas";
import { z } from "zod";

export const delegatedCompletedActivitiesRequestSchema = z
  .object({
    athleteProfileId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(20),
    organizationId: z.string().uuid(),
  })
  .strict();

export const delegatedCompletedActivitiesResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            // Imported activity category is canonical segment evidence. A missing
            // segment is unknown, never an invented "other" classification.
            activityCategory: z.enum(["run", "bike", "swim", "strength", "other"]).nullable(),
            activityId: z.string().uuid(),
            distanceMeters: z.number().nullable(),
            elapsedMs: z.number().nullable(),
            planningDate: dateOnlySchema,
            sessionId: z.string().uuid(),
          })
          .strict(),
      )
      .readonly(),
  })
  .strict();

export type DelegatedCompletedActivitiesRequest = z.output<
  typeof delegatedCompletedActivitiesRequestSchema
>;
