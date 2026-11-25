import {
  activityTrainingEffectSchema,
  athleteRebuildCursorSchema,
  athleteRebuildPageInputSchema,
  athleteRecalculationQueueItemSchema,
  athleteRecalculationQueueTransitionInputSchema,
  athleteRecalculationRequestSchema,
  dailyTrainingLoadSchema,
  persistedThresholdEvidenceSchema,
} from "@repo/core/athlete-derived-state";
import { z } from "zod";
import { planningRangeRequestSchema } from "./planning-range";

const profileIdSchema = z.string().uuid();
const revisionSchema = z.number().int().nonnegative();

export const recordActivityTrainingEffectRequestSchema = z
  .object({
    profileId: profileIdSchema,
    expectedPublishedRevision: revisionSchema,
    targetSourceRevision: revisionSchema,
    effect: activityTrainingEffectSchema,
  })
  .strict()
  .refine((input) => input.profileId === input.effect.profileId, {
    path: ["effect", "profileId"],
    message: "Training-effect request owner mismatch",
  });

export const recordActivityTrainingEffectResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("applied"),
      publishedRevision: revisionSchema,
      dailyLoad: dailyTrainingLoadSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("rebuild_requested"),
      request: athleteRecalculationRequestSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("stale_revision"),
      currentPublishedRevision: revisionSchema,
    })
    .strict(),
]);

export const requestAthleteRecalculationDtoSchema = z
  .object({ profileId: profileIdSchema, request: athleteRecalculationRequestSchema })
  .strict()
  .refine((input) => input.profileId === input.request.profileId, {
    path: ["request", "profileId"],
    message: "Recalculation request owner mismatch",
  });

export const transitionAthleteRecalculationRequestSchema = z
  .object({
    profileId: profileIdSchema,
    transition: athleteRecalculationQueueTransitionInputSchema,
  })
  .strict();

export const transitionAthleteRecalculationResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("updated"), item: athleteRecalculationQueueItemSchema }).strict(),
  z.object({ status: z.literal("completed") }).strict(),
  z.object({ status: z.literal("not_found") }).strict(),
  z.object({ status: z.literal("lease_lost") }).strict(),
  z
    .object({ status: z.literal("state_conflict"), item: athleteRecalculationQueueItemSchema })
    .strict(),
]);

export const executeAthleteRebuildPageRequestSchema = z
  .object({ profileId: profileIdSchema, page: athleteRebuildPageInputSchema })
  .strict()
  .refine((input) => input.profileId === input.page.request.profileId, {
    path: ["page", "request", "profileId"],
    message: "Rebuild request owner mismatch",
  });

export const executeAthleteRebuildPageResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("continue"), nextCursor: athleteRebuildCursorSchema }).strict(),
  z.object({ status: z.literal("published"), publishedRevision: revisionSchema }).strict(),
  z
    .object({ status: z.literal("stale_revision"), currentPublishedRevision: revisionSchema })
    .strict(),
]);

export const readDailyTrainingLoadRangeRequestSchema = z
  .object({ profileId: profileIdSchema, range: planningRangeRequestSchema })
  .strict();

export const readDailyTrainingLoadRangeResultSchema = z
  .object({
    profileId: profileIdSchema,
    publishedRevision: revisionSchema,
    days: z.array(dailyTrainingLoadSchema).max(366),
  })
  .strict()
  .superRefine((result, context) => {
    for (const [index, day] of result.days.entries()) {
      if (day.profileId !== result.profileId) {
        context.addIssue({
          code: "custom",
          path: ["days", index, "profileId"],
          message: "Daily-load results must belong to the requested athlete",
        });
      }
      if (day.sourceRevision !== result.publishedRevision) {
        context.addIssue({
          code: "custom",
          path: ["days", index, "sourceRevision"],
          message: "Daily-load results must match the published revision",
        });
      }
      const previousDay = result.days[index - 1];
      if (previousDay !== undefined && previousDay.planningDate >= day.planningDate) {
        context.addIssue({
          code: "custom",
          path: ["days", index, "planningDate"],
          message: "Daily-load results must be strictly ordered by planning date",
        });
      }
    }
  });

export const recordThresholdEvidenceRequestSchema = z
  .object({ profileId: profileIdSchema, evidence: persistedThresholdEvidenceSchema })
  .strict()
  .refine((input) => input.profileId === input.evidence.profileId, {
    path: ["evidence", "profileId"],
    message: "Threshold-evidence request owner mismatch",
  });

export type RecordActivityTrainingEffectRequest = z.infer<
  typeof recordActivityTrainingEffectRequestSchema
>;
export type RecordActivityTrainingEffectResult = z.infer<
  typeof recordActivityTrainingEffectResultSchema
>;
export type RequestAthleteRecalculationDto = z.infer<typeof requestAthleteRecalculationDtoSchema>;
export type TransitionAthleteRecalculationRequest = z.infer<
  typeof transitionAthleteRecalculationRequestSchema
>;
export type TransitionAthleteRecalculationResult = z.infer<
  typeof transitionAthleteRecalculationResultSchema
>;
export type ExecuteAthleteRebuildPageRequest = z.infer<
  typeof executeAthleteRebuildPageRequestSchema
>;
export type ExecuteAthleteRebuildPageResult = z.infer<typeof executeAthleteRebuildPageResultSchema>;
export type ReadDailyTrainingLoadRangeRequest = z.infer<
  typeof readDailyTrainingLoadRangeRequestSchema
>;
export type ReadDailyTrainingLoadRangeResult = z.infer<
  typeof readDailyTrainingLoadRangeResultSchema
>;
export type RecordThresholdEvidenceRequest = z.infer<typeof recordThresholdEvidenceRequestSchema>;
