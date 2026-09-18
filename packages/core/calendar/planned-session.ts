import { z } from "zod";
import { planningDayIdentitySchema } from "../athlete-intelligence/state-projection";
import { prescriptionResolutionManifestSchema } from "../plan/prescriptionResolution";

export const PLANNED_SESSION_CONTRACT_VERSION = "planned-session-v1" as const;

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
export const plannedSessionOperationIdSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const plannedSessionSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("direct"),
      operationId: plannedSessionOperationIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("training_plan"),
      // Null is reserved for verified legacy provenance that could not be
      // assigned safely during the forward migration; new applications set it.
      applicationId: uuidSchema.nullable().default(null),
      trainingPlanId: uuidSchema,
      trainingPlanRevision: z.number().int().positive(),
      sourceSessionId: uuidSchema,
    })
    .strict(),
]);

export type PlannedSessionSource = z.infer<typeof plannedSessionSourceSchema>;

export function plannedSessionIdempotencyKey(
  sourceInput: z.input<typeof plannedSessionSourceSchema>,
): string {
  const source = plannedSessionSourceSchema.parse(sourceInput);
  switch (source.kind) {
    case "direct":
      return `direct:${source.operationId}`;
    case "training_plan":
      return source.applicationId
        ? `training-plan:${source.applicationId}:${source.trainingPlanRevision}:${source.sourceSessionId}`
        : `training-plan:${source.trainingPlanId}:${source.trainingPlanRevision}:${source.sourceSessionId}`;
  }
}

export const plannedSessionPrescriptionSnapshotSchema = z
  .object({
    resolutionManifest: prescriptionResolutionManifestSchema,
    capturedAt: instantSchema,
  })
  .strict();

export const plannedSessionCompletionSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("linked"),
      activityId: uuidSchema,
      linkedAt: instantSchema,
      // Existing linked completions predate outcome capture and are preserved as full.
      outcome: z.enum(["full", "partial"]).default("full"),
    })
    .strict(),
  z
    .object({
      state: z.literal("activity_deleted"),
      linkedAt: instantSchema,
      unlinkedAt: instantSchema,
      outcome: z.enum(["full", "partial"]).default("full"),
    })
    .strict()
    .superRefine((completion, context) => {
      if (Date.parse(completion.unlinkedAt) < Date.parse(completion.linkedAt)) {
        context.addIssue({
          code: "custom",
          path: ["unlinkedAt"],
          message: "Completion must not be unlinked before it was linked",
        });
      }
    }),
  z
    .object({
      state: z.literal("skipped"),
      skippedAt: instantSchema,
      operationId: uuidSchema,
    })
    .strict(),
]);

export const plannedSessionLifecycleSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("scheduled") }).strict(),
  z
    .object({
      status: z.literal("cancelled"),
      reason: z.enum(["user_requested", "plan_replaced", "series_cancelled"]),
      cancelledAt: instantSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("completed"),
      completion: plannedSessionCompletionSchema,
    })
    .strict(),
]);

export const plannedSessionSchema = z
  .object({
    contractVersion: z.literal(PLANNED_SESSION_CONTRACT_VERSION),
    id: uuidSchema,
    profileId: uuidSchema,
    sessionRevision: z.number().int().positive(),
    planningDate: planningDayIdentitySchema,
    originalTargetDate: planningDayIdentitySchema,
    source: plannedSessionSourceSchema,
    idempotencyKey: z.string().min(1).max(512),
    groupEventId: uuidSchema.nullable().optional(),
    prescription: plannedSessionPrescriptionSnapshotSchema,
    lifecycle: plannedSessionLifecycleSchema,
  })
  .strict()
  .superRefine((session, context) => {
    if (session.idempotencyKey !== plannedSessionIdempotencyKey(session.source)) {
      context.addIssue({
        code: "custom",
        path: ["idempotencyKey"],
        message: "Planned-session identity must be derived from its immutable source",
      });
    }
  });

export type PlannedSession = z.infer<typeof plannedSessionSchema>;
export type PlannedSessionPrescriptionSnapshot = z.infer<
  typeof plannedSessionPrescriptionSnapshotSchema
>;
export type PlannedSessionCompletion = z.infer<typeof plannedSessionCompletionSchema>;

/** Minimal immutable session provenance exposed by event and calendar projections. */
export const plannedSessionProjectionSchema = z
  .object({
    id: plannedSessionSchema.shape.id,
    profileId: plannedSessionSchema.shape.profileId,
    sessionRevision: plannedSessionSchema.shape.sessionRevision,
    planningDate: plannedSessionSchema.shape.planningDate,
    source: plannedSessionSchema.shape.source,
    prescription: plannedSessionSchema.shape.prescription,
    lifecycle: plannedSessionSchema.shape.lifecycle,
  })
  .strict();
export type PlannedSessionProjection = z.infer<typeof plannedSessionProjectionSchema>;

/**
 * Validates a profile's planned-session collection, including the database's
 * one-session-per-group-event association rule.
 */
export const plannedSessionCollectionSchema = z
  .array(plannedSessionSchema)
  .superRefine((sessions, context) => {
    const associatedSessionByGroupEvent = new Map<string, number>();

    sessions.forEach((session, index) => {
      if (session.groupEventId == null) return;

      const associationKey = `${session.profileId}:${session.groupEventId}`;
      const firstIndex = associatedSessionByGroupEvent.get(associationKey);
      if (firstIndex !== undefined) {
        context.addIssue({
          code: "custom",
          path: [index, "groupEventId"],
          message: "A group event can be associated with only one session per profile",
        });
        return;
      }
      associatedSessionByGroupEvent.set(associationKey, index);
    });
  });

export type PlannedSessionCollection = z.infer<typeof plannedSessionCollectionSchema>;
