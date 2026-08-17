import { z } from "zod";
import { activityPlanStructureSchema } from "../activity-plan/structure-schema";
import { activityPrescriptionQuantificationBundleSchema } from "../activity-quantification/bundle";
import { planningDayIdentitySchema } from "../athlete-intelligence/state-projection";

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
      trainingPlanId: uuidSchema,
      trainingPlanRevision: z.number().int().positive(),
      sourceSessionKey: z.string().trim().min(1).max(128),
    })
    .strict(),
  z
    .object({
      kind: z.literal("recurrence"),
      seriesId: uuidSchema,
      occurrenceKey: planningDayIdentitySchema,
    })
    .strict(),
]);

export type PlannedSessionSource = z.infer<typeof plannedSessionSourceSchema>;

export function plannedSessionIdempotencyKey(sourceInput: PlannedSessionSource): string {
  const source = plannedSessionSourceSchema.parse(sourceInput);
  switch (source.kind) {
    case "direct":
      return `direct:${source.operationId}`;
    case "training_plan":
      return `training-plan:${source.trainingPlanId}:${source.trainingPlanRevision}:${source.sourceSessionKey}`;
    case "recurrence":
      return `recurrence:${source.seriesId}:${source.occurrenceKey}`;
  }
}

export const plannedSessionPrescriptionSnapshotSchema = z
  .object({
    activityPlanId: uuidSchema,
    activityPlanRevision: z.number().int().positive(),
    structure: activityPlanStructureSchema,
    prescriptionQuantification: activityPrescriptionQuantificationBundleSchema.nullable(),
    capturedAt: instantSchema,
  })
  .strict();

export const plannedSessionCompletionSchema = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("linked"),
      activityId: uuidSchema,
      linkedAt: instantSchema,
    })
    .strict(),
  z
    .object({
      state: z.literal("activity_deleted"),
      linkedAt: instantSchema,
      unlinkedAt: instantSchema,
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
    if (
      session.source.kind === "recurrence" &&
      session.source.occurrenceKey !== session.originalTargetDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["source", "occurrenceKey"],
        message: "A recurrence occurrence key is its original planning date",
      });
    }
  });

export type PlannedSession = z.infer<typeof plannedSessionSchema>;
export type PlannedSessionPrescriptionSnapshot = z.infer<
  typeof plannedSessionPrescriptionSnapshotSchema
>;
export type PlannedSessionCompletion = z.infer<typeof plannedSessionCompletionSchema>;

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
