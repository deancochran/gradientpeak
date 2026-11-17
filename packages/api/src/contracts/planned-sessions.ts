import { planningDayIdentitySchema } from "@repo/core/athlete-intelligence";
import {
  type PlannedSession,
  plannedSessionActivityPlanId,
  plannedSessionComparisonSchema,
  plannedSessionLifecycleSchema,
  plannedSessionOperationIdSchema,
  plannedSessionPrescriptionSnapshotSchema,
  plannedSessionSchema,
  plannedSessionSourceSchema,
} from "@repo/core/calendar";
import { sessionDemandSchema } from "@repo/core/schemas/training-plan-structure";
import { z } from "zod";
import { plannedSessionCacheTagsSchema } from "./cache-receipts";
import { planningRangeRequestSchema } from "./planning-range";

const uuidSchema = z.string().uuid();

export const readPlannedSessionsRangeRequestSchema = z
  .object({ profileId: uuidSchema, range: planningRangeRequestSchema })
  .strict();

const plannedSessionCompletionCandidateCursorSchema = z
  .object({
    startedAt: z.string().datetime({ offset: true }),
    id: uuidSchema,
  })
  .strict();

export const plannedSessionCompletionCandidatesRequestSchema = z
  .object({
    sessionId: uuidSchema,
    cursor: plannedSessionCompletionCandidateCursorSchema.optional(),
    // TanStack Query adds this when fetching an infinite-query page.
    direction: z.enum(["forward", "backward"]).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

export const plannedSessionCompletionCandidatesDtoSchema = z
  .object({
    canAssociate: z.boolean(),
    reason: z.enum(["scheduled_in_future", "manual_completion_unavailable"]).nullable(),
    currentActivityId: uuidSchema.nullable(),
    items: z.array(
      z
        .object({
          id: uuidSchema,
          name: z.string(),
          activityCategory: z.enum(["run", "bike", "swim", "strength", "other"]),
          startedAt: z.string().datetime({ offset: true }),
          elapsedMs: z.number().int().positive(),
        })
        .strict(),
    ),
    nextCursor: plannedSessionCompletionCandidateCursorSchema.nullable(),
  })
  .strict();

export const createPlannedSessionRequestSchema = z
  .object({ profileId: uuidSchema, session: plannedSessionSchema })
  .strict()
  .refine((input) => input.profileId === input.session.profileId, {
    path: ["session", "profileId"],
    message: "Planned-session request owner mismatch",
  });

export const plannedSessionMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("move"),
      profileId: uuidSchema,
      sessionId: uuidSchema,
      expectedRevision: z.number().int().positive(),
      planningDate: planningDayIdentitySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel"),
      profileId: uuidSchema,
      sessionId: uuidSchema,
      expectedRevision: z.number().int().positive(),
      reason: z.enum(["user_requested", "plan_replaced", "series_cancelled"]),
      cancelledAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      action: z.literal("link_completion"),
      profileId: uuidSchema,
      sessionId: uuidSchema,
      expectedRevision: z.number().int().positive(),
      activityId: uuidSchema,
      linkedAt: z.string().datetime({ offset: true }),
      outcome: z.enum(["full", "partial"]).default("full"),
    })
    .strict(),
  z
    .object({
      action: z.literal("unlink_deleted_activity"),
      profileId: uuidSchema,
      sessionId: uuidSchema,
      expectedRevision: z.number().int().positive(),
      activityId: uuidSchema,
      unlinkedAt: z.string().datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      action: z.literal("skip"),
      profileId: uuidSchema,
      sessionId: uuidSchema,
      expectedRevision: z.number().int().positive(),
      skippedAt: z.string().datetime({ offset: true }),
      operationId: uuidSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("associate_group_event"),
      profileId: uuidSchema,
      sessionId: uuidSchema,
      expectedRevision: z.number().int().positive(),
      groupEventId: uuidSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("clear_group_event"),
      profileId: uuidSchema,
      sessionId: uuidSchema,
      expectedRevision: z.number().int().positive(),
      groupEventId: uuidSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("repoint_activity_plan"),
      profileId: uuidSchema,
      sessionId: uuidSchema,
      expectedRevision: z.number().int().positive(),
      activityPlanId: uuidSchema,
    })
    .strict(),
]);

export const plannedSessionMutationResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("updated"), session: plannedSessionSchema }).strict(),
  z.object({ status: z.literal("not_found") }).strict(),
  z
    .object({
      status: z.literal("access_denied"),
      reason: z.literal("group_event_unavailable"),
    })
    .strict(),
  z
    .object({
      status: z.literal("stale_revision"),
      currentRevision: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      status: z.literal("conflict"),
      reason: z.enum([
        "already_completed",
        "activity_not_owned",
        "group_event_already_linked",
        "not_scheduled",
      ]),
    })
    .strict(),
]);

export const plannedSessionDtoSchema = z
  .object({
    id: uuidSchema,
    profileId: uuidSchema,
    sessionRevision: z.number().int().positive(),
    planningDate: planningDayIdentitySchema,
    originalTargetDate: planningDayIdentitySchema,
    source: plannedSessionSourceSchema,
    groupEventId: uuidSchema.nullable(),
    /** Durable current-plan reference; required for all new and migrated rows. */
    activityPlanId: uuidSchema,
    /** Legacy scheduling provenance only; absent from new reference-based rows. */
    prescription: plannedSessionPrescriptionSnapshotSchema.optional(),
    lifecycle: plannedSessionLifecycleSchema,
  })
  .strict();

export const plannedSessionDetailDtoSchema = plannedSessionDtoSchema
  .extend({ comparison: plannedSessionComparisonSchema })
  .strict();

export const createPlannedSessionDtoRequestSchema = z
  .object({
    profileId: uuidSchema,
    operationId: uuidSchema.optional(),
    session: z
      .object({
        planningDate: planningDayIdentitySchema,
        source: z
          .object({
            kind: z.literal("direct"),
            operationId: plannedSessionOperationIdSchema,
          })
          .strict(),
        groupEventId: uuidSchema.nullable().optional(),
        activityPlanId: uuidSchema,
        demand: sessionDemandSchema.optional(),
      })
      .strict(),
  })
  .strict();

const revisionedSessionRequest = {
  profileId: uuidSchema,
  sessionId: uuidSchema,
  expectedRevision: z.number().int().positive(),
} as const;

export const movePlannedSessionDtoRequestSchema = z
  .object({
    ...revisionedSessionRequest,
    planningDate: planningDayIdentitySchema,
    operationId: uuidSchema.optional(),
  })
  .strict();

export const changePlannedSessionPlanDtoRequestSchema = z
  .object({
    ...revisionedSessionRequest,
    newName: z.string().min(1, "Plan name is required").optional(),
  })
  .strict();

export const cancelPlannedSessionDtoRequestSchema = z
  .object({
    ...revisionedSessionRequest,
    reason: z.literal("user_requested").default("user_requested"),
    operationId: uuidSchema.optional(),
  })
  .strict();

export const linkPlannedSessionCompletionDtoRequestSchema = z
  .object({
    ...revisionedSessionRequest,
    activityId: uuidSchema,
    outcome: z.enum(["full", "partial"]).default("full"),
    operationId: uuidSchema,
  })
  .strict();

export const skipPlannedSessionDtoRequestSchema = z
  .object({ ...revisionedSessionRequest, operationId: uuidSchema })
  .strict();

export const linkPlannedSessionGroupEventDtoRequestSchema = z
  .object({ ...revisionedSessionRequest, groupEventId: uuidSchema })
  .strict();

export const plannedSessionRangeDtoSchema = z
  .object({ items: z.array(plannedSessionDtoSchema).max(5_000), truncated: z.boolean() })
  .strict();

export const plannedSessionMutationReceiptSchema = z
  .object({
    outcome: z.enum(["created", "unchanged", "updated"]),
    session: plannedSessionDtoSchema,
    cache_tags: plannedSessionCacheTagsSchema,
  })
  .strict();

export type ReadPlannedSessionsRangeRequest = z.infer<typeof readPlannedSessionsRangeRequestSchema>;
export type CreatePlannedSessionRequest = z.infer<typeof createPlannedSessionRequestSchema>;
export type PlannedSessionMutation = z.infer<typeof plannedSessionMutationSchema>;
export type PlannedSessionMutationResult = z.infer<typeof plannedSessionMutationResultSchema>;
export type PlannedSessionDto = z.infer<typeof plannedSessionDtoSchema>;
export type PlannedSessionDetailDto = z.infer<typeof plannedSessionDetailDtoSchema>;
export type CreatePlannedSessionDtoRequest = z.infer<typeof createPlannedSessionDtoRequestSchema>;
export type PlannedSessionRangeDto = z.infer<typeof plannedSessionRangeDtoSchema>;
export type PlannedSessionMutationReceipt = z.infer<typeof plannedSessionMutationReceiptSchema>;

export function toPlannedSessionDto(session: PlannedSession): PlannedSessionDto {
  return plannedSessionDtoSchema.parse({
    id: session.id,
    profileId: session.profileId,
    sessionRevision: session.sessionRevision,
    planningDate: session.planningDate,
    originalTargetDate: session.originalTargetDate,
    source: session.source,
    groupEventId: session.groupEventId ?? null,
    activityPlanId: plannedSessionActivityPlanId(session),
    ...(session.prescription ? { prescription: session.prescription } : {}),
    lifecycle: session.lifecycle,
  });
}
