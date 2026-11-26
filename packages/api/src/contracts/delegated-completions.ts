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
            completionOutcome: z.enum(["full", "partial"]),
            // Only the durable manual provenance and an absent provenance with
            // recorded timestamps have a coach-safe label. Other values stay unknown.
            completionSource: z.enum(["manual", "recorded", "unavailable"]),
            distanceMeters: z.number().nullable(),
            evidenceVersion: z.string().min(1),
            elapsedMs: z.number().nullable(),
            planningDate: dateOnlySchema,
            sessionId: z.string().uuid(),
          })
          .strict(),
      )
      .readonly(),
  })
  .strict();

export const acknowledgeDelegatedCompletionInputSchema = z
  .object({
    athleteProfileId: z.string().uuid(),
    evidenceVersion: z.string().min(1).max(128),
    organizationId: z.string().uuid(),
    sessionId: z.string().uuid(),
  })
  .strict();

export const acknowledgeDelegatedCompletionOutputSchema = z
  .object({ outcome: z.enum(["acknowledged", "already_acknowledged", "stale"]) })
  .strict();

export type AcknowledgeDelegatedCompletionRequest = z.output<
  typeof acknowledgeDelegatedCompletionInputSchema
>;

export type DelegatedCompletedActivitiesRequest = z.output<
  typeof delegatedCompletedActivitiesRequestSchema
>;
