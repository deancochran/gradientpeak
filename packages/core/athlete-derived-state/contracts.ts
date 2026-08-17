import { z } from "zod";

import {
  athleteStateBaselineSchema,
  dailyAggregateCommonLoadSchema,
  FORM_MATCH_TOLERANCE,
  observedTrainingStimulusSchema,
  planningDayIdentitySchema,
} from "../athlete-intelligence/state-projection";
import { thresholdEvidenceSchema } from "../performance-calibration/threshold-contracts";

export const ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION =
  "athlete-derived-state-persistence-v1" as const;

const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const revisionSchema = z.number().int().nonnegative();
const calculationVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

/** Primary-key identity for one persisted analysis of an activity. */
export const activityTrainingEffectIdentitySchema = z
  .object({
    activityId: uuidSchema,
    activityAnalysisRevision: z.number().int().positive(),
  })
  .strict();

export const activityTrainingEffectSchema = activityTrainingEffectIdentitySchema
  .extend({
    contractVersion: z.literal(ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION),
    profileId: uuidSchema,
    effectiveAt: instantSchema,
    planningDate: planningDayIdentitySchema,
    sourceRevision: revisionSchema,
    calculationVersion: calculationVersionSchema,
    inputFingerprint: sha256Schema,
    stimulus: observedTrainingStimulusSchema,
  })
  .strict()
  .superRefine((effect, context) => {
    if (effect.stimulus.sourceId !== effect.activityId) {
      context.addIssue({
        code: "custom",
        path: ["stimulus", "sourceId"],
        message: "Training-effect stimulus source must be its activity",
      });
    }
    if (effect.stimulus.occurredAt !== effect.effectiveAt) {
      context.addIssue({
        code: "custom",
        path: ["stimulus", "occurredAt"],
        message: "Training-effect stimulus time must match its effective time",
      });
    }
  });

export const dailyTrainingLoadCoverageSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("complete"),
      contributingActivityCount: z.number().int().nonnegative(),
      omittedActivityCount: z.literal(0),
    })
    .strict(),
  z
    .object({
      status: z.literal("partial"),
      contributingActivityCount: z.number().int().nonnegative(),
      omittedActivityCount: z.number().int().positive(),
    })
    .strict(),
]);

/** Primary-key identity for a revisioned daily-load publication. */
export const dailyTrainingLoadIdentitySchema = z
  .object({
    profileId: uuidSchema,
    planningDate: planningDayIdentitySchema,
    sourceRevision: revisionSchema,
  })
  .strict();

export const dailyTrainingLoadSchema = dailyTrainingLoadIdentitySchema
  .extend({
    contractVersion: z.literal(ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION),
    commonLoad: dailyAggregateCommonLoadSchema,
    fitness: z.number().finite().nonnegative(),
    fatigue: z.number().finite().nonnegative(),
    form: z.number().finite(),
    readiness: z.number().finite().min(0).max(100).nullable(),
    coverage: dailyTrainingLoadCoverageSchema,
    calculationVersion: calculationVersionSchema,
  })
  .strict()
  .superRefine((load, context) => {
    if (Math.abs(load.form - (load.fitness - load.fatigue)) > FORM_MATCH_TOLERANCE) {
      context.addIssue({
        code: "custom",
        path: ["form"],
        message: "Daily form must equal fitness minus fatigue",
      });
    }
  });

/**
 * Canonical key order for storing or replaying daily-load revisions.  A date is
 * deliberately not unique: later source revisions remain distinct records.
 */
export function compareDailyTrainingLoadIdentity(
  left: z.infer<typeof dailyTrainingLoadIdentitySchema>,
  right: z.infer<typeof dailyTrainingLoadIdentitySchema>,
): number {
  return (
    left.profileId.localeCompare(right.profileId) ||
    left.planningDate.localeCompare(right.planningDate) ||
    left.sourceRevision - right.sourceRevision
  );
}

/** A bounded ordered set of distinct daily-load revisions. */
export const dailyTrainingLoadRevisionsSchema = z
  .array(dailyTrainingLoadSchema)
  .max(1_000)
  .superRefine((loads, context) => {
    for (const [index, load] of loads.entries()) {
      const previousLoad = loads[index - 1];
      if (previousLoad !== undefined && compareDailyTrainingLoadIdentity(previousLoad, load) >= 0) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Daily-load revisions must be strictly ordered by persisted identity",
        });
      }
    }
  });

export const athleteRecalculationReasonSchema = z.enum([
  "activity_created",
  "activity_changed",
  "activity_deleted",
  "analysis_replaced",
  "threshold_changed",
  "import_completed",
  "algorithm_changed",
  "timezone_changed",
  "explicit_repair",
]);

export type AthleteRecalculationReason = z.infer<typeof athleteRecalculationReasonSchema>;

/**
 * Gives a reason set one durable representation, so equivalent enqueue requests
 * produce the same coalesced row regardless of arrival order.
 */
export function canonicalizeAthleteRecalculationReasons(
  reasons: readonly AthleteRecalculationReason[],
): AthleteRecalculationReason[] {
  return [...new Set(reasons)].sort(
    (left, right) =>
      athleteRecalculationReasonSchema.options.indexOf(left) -
      athleteRecalculationReasonSchema.options.indexOf(right),
  );
}

export function athleteRecalculationIdempotencyKey(profileId: string): string {
  return `athlete-recalculation:${uuidSchema.parse(profileId)}`;
}

export const athleteRecalculationRequestSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION),
    profileId: uuidSchema,
    idempotencyKey: z.string().min(1).max(128),
    earliestAffectedAt: instantSchema,
    earliestAffectedPlanningDate: planningDayIdentitySchema,
    sourceRevision: revisionSchema,
    reasons: z.array(athleteRecalculationReasonSchema).min(1).max(9),
    requestedAt: instantSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if (request.idempotencyKey !== athleteRecalculationIdempotencyKey(request.profileId)) {
      context.addIssue({
        code: "custom",
        path: ["idempotencyKey"],
        message: "Recalculation requests must coalesce under the athlete identity",
      });
    }
    if (new Set(request.reasons).size !== request.reasons.length) {
      context.addIssue({
        code: "custom",
        path: ["reasons"],
        message: "Recalculation reasons must be unique",
      });
    }
    const canonicalReasons = canonicalizeAthleteRecalculationReasons(request.reasons);
    if (canonicalReasons.some((reason, index) => reason !== request.reasons[index])) {
      context.addIssue({
        code: "custom",
        path: ["reasons"],
        message: "Recalculation reasons must use canonical order",
      });
    }
  });

export type AthleteRecalculationRequest = z.infer<typeof athleteRecalculationRequestSchema>;

const recalculationClaimTokenSchema = z
  .string()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const athleteRecalculationFailureCodeSchema = z.enum([
  "source_unavailable",
  "invalid_evidence",
  "lease_lost",
  "publication_conflict",
  "internal",
]);

/**
 * Worker-only state.  This is intentionally separate from the coalesced request:
 * enqueueing changes the request; a worker claim changes only this attempt state.
 */
export const athleteRecalculationWorkerStateSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("pending"), availableAt: instantSchema }).strict(),
  z
    .object({
      state: z.literal("processing"),
      claimToken: recalculationClaimTokenSchema,
      claimedAt: instantSchema,
      leaseExpiresAt: instantSchema,
    })
    .strict()
    .refine((value) => Date.parse(value.leaseExpiresAt) > Date.parse(value.claimedAt), {
      path: ["leaseExpiresAt"],
      message: "A recalculation lease must expire after claim time",
    }),
  z
    .object({
      state: z.literal("retry_wait"),
      failureCode: athleteRecalculationFailureCodeSchema,
      failedAt: instantSchema,
      nextAttemptAt: instantSchema,
    })
    .strict()
    .refine((value) => Date.parse(value.nextAttemptAt) > Date.parse(value.failedAt), {
      path: ["nextAttemptAt"],
      message: "A recalculation retry must follow its failed attempt",
    }),
  z
    .object({
      state: z.literal("failed_terminal"),
      failureCode: athleteRecalculationFailureCodeSchema,
      completedAt: instantSchema,
    })
    .strict(),
  z
    .object({
      state: z.literal("completed"),
      completedAt: instantSchema,
      resultingPublishedRevision: revisionSchema,
    })
    .strict(),
]);

/** One persistence row composes an independently coalesced request and worker state. */
export const athleteRecalculationQueueItemSchema = z
  .object({
    request: athleteRecalculationRequestSchema,
    attemptCount: z.number().int().nonnegative(),
    lifecycle: athleteRecalculationWorkerStateSchema,
  })
  .strict();

/**
 * Worker transition command. `complete` records that a separately fenced
 * publication produced a revision; it neither performs nor authorizes publication.
 */
export const athleteRecalculationWorkerTransitionInputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("claim"),
      expectedState: z.enum(["pending", "retry_wait"]),
      claimToken: recalculationClaimTokenSchema,
      claimedAt: instantSchema,
      leaseExpiresAt: instantSchema,
    })
    .strict()
    .refine((value) => Date.parse(value.leaseExpiresAt) > Date.parse(value.claimedAt), {
      path: ["leaseExpiresAt"],
      message: "A recalculation claim lease must expire after claim time",
    }),
  z
    .object({
      action: z.literal("renew"),
      claimToken: recalculationClaimTokenSchema,
      renewedAt: instantSchema,
      leaseExpiresAt: instantSchema,
    })
    .strict()
    .refine((value) => Date.parse(value.leaseExpiresAt) > Date.parse(value.renewedAt), {
      path: ["leaseExpiresAt"],
      message: "A renewed recalculation lease must expire after renewal time",
    }),
  z
    .object({
      action: z.literal("retry"),
      claimToken: recalculationClaimTokenSchema,
      failureCode: athleteRecalculationFailureCodeSchema,
      failedAt: instantSchema,
      nextAttemptAt: instantSchema,
    })
    .strict()
    .refine((value) => Date.parse(value.nextAttemptAt) > Date.parse(value.failedAt), {
      path: ["nextAttemptAt"],
      message: "A recalculation retry must follow failure time",
    }),
  z
    .object({
      action: z.literal("fail_terminal"),
      claimToken: recalculationClaimTokenSchema,
      failureCode: athleteRecalculationFailureCodeSchema,
      completedAt: instantSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("complete"),
      claimToken: recalculationClaimTokenSchema,
      completedAt: instantSchema,
      resultingPublishedRevision: revisionSchema,
    })
    .strict(),
]);

/** The worker lifecycle is deliberately independent of request coalescing. */
export function canTransitionAthleteRecalculationWorkerState(
  from: z.infer<typeof athleteRecalculationWorkerStateSchema>["state"],
  to: z.infer<typeof athleteRecalculationWorkerStateSchema>["state"],
): boolean {
  const allowed: Record<
    z.infer<typeof athleteRecalculationWorkerStateSchema>["state"],
    readonly z.infer<typeof athleteRecalculationWorkerStateSchema>["state"][]
  > = {
    pending: ["processing"],
    processing: ["processing", "retry_wait", "failed_terminal", "completed"],
    retry_wait: ["processing"],
    failed_terminal: [],
    completed: [],
  };
  return allowed[from].includes(to);
}

/** @deprecated Prefer the worker-specific name above. */
export const athleteRecalculationQueueTransitionInputSchema =
  athleteRecalculationWorkerTransitionInputSchema;

/** Commutative merge used before the one-pending-request persistence boundary. */
export function coalesceAthleteRecalculationRequests(
  leftInput: AthleteRecalculationRequest,
  rightInput: AthleteRecalculationRequest,
): AthleteRecalculationRequest {
  const left = athleteRecalculationRequestSchema.parse(leftInput);
  const right = athleteRecalculationRequestSchema.parse(rightInput);
  if (left.profileId !== right.profileId) {
    throw new Error("Cannot coalesce recalculation requests for different athletes");
  }
  const reasons = canonicalizeAthleteRecalculationReasons([...left.reasons, ...right.reasons]);
  return athleteRecalculationRequestSchema.parse({
    contractVersion: ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION,
    profileId: left.profileId,
    idempotencyKey: athleteRecalculationIdempotencyKey(left.profileId),
    earliestAffectedAt:
      Date.parse(left.earliestAffectedAt) <= Date.parse(right.earliestAffectedAt)
        ? left.earliestAffectedAt
        : right.earliestAffectedAt,
    earliestAffectedPlanningDate:
      left.earliestAffectedPlanningDate <= right.earliestAffectedPlanningDate
        ? left.earliestAffectedPlanningDate
        : right.earliestAffectedPlanningDate,
    sourceRevision: Math.max(left.sourceRevision, right.sourceRevision),
    reasons,
    requestedAt:
      Date.parse(left.requestedAt) <= Date.parse(right.requestedAt)
        ? left.requestedAt
        : right.requestedAt,
  });
}

export const persistedThresholdEvidenceSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_DERIVED_STATE_PERSISTENCE_CONTRACT_VERSION),
    profileId: uuidSchema,
    calculationVersion: calculationVersionSchema,
    confidence: z.number().finite().min(0).max(1),
    evidence: thresholdEvidenceSchema,
    lifecycle: z.discriminatedUnion("status", [
      z.object({ status: z.literal("active"), invalidatedAt: z.null() }).strict(),
      z
        .object({
          status: z.enum(["superseded", "deleted"]),
          invalidatedAt: instantSchema,
        })
        .strict(),
    ]),
  })
  .strict()
  .superRefine((record, context) => {
    if (!uuidSchema.safeParse(record.evidence.evidenceId).success) {
      context.addIssue({
        code: "custom",
        path: ["evidence", "evidenceId"],
        message: "Persisted threshold evidence requires a UUID evidence identity",
      });
    }
    if (!uuidSchema.safeParse(record.evidence.activityId).success) {
      context.addIssue({
        code: "custom",
        path: ["evidence", "activityId"],
        message: "Persisted threshold evidence requires a UUID activity identity",
      });
    }
    if (
      record.lifecycle.invalidatedAt !== null &&
      Date.parse(record.lifecycle.invalidatedAt) < Date.parse(record.evidence.observedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["lifecycle", "invalidatedAt"],
        message: "Threshold evidence cannot be invalidated before it was observed",
      });
    }
  });

/**
 * A persisted-evidence set has one record for each athlete, activity category,
 * and activity. Reprocessing replaces that record rather than retaining a
 * second candidate for the same activity.
 */
export const persistedThresholdEvidenceCollectionSchema = z
  .array(persistedThresholdEvidenceSchema)
  .max(1_000)
  .superRefine((evidence, context) => {
    const identities = new Set<string>();
    for (const [index, record] of evidence.entries()) {
      const identity = [
        record.profileId,
        record.evidence.activityCategory,
        record.evidence.activityId,
      ].join(":");
      if (identities.has(identity)) {
        context.addIssue({
          code: "custom",
          path: [index, "evidence", "activityId"],
          message:
            "Persisted threshold evidence must be unique by profile, activity category, and activity",
        });
      }
      identities.add(identity);
    }
  });

/** Replaces a persisted candidate at its athlete/activity/category identity. */
export const persistedThresholdEvidenceReplacementInputSchema = z
  .object({
    existingEvidence: persistedThresholdEvidenceCollectionSchema,
    replacedEvidenceId: uuidSchema,
    replacementEvidence: persistedThresholdEvidenceSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const replacedIndex = input.existingEvidence.findIndex(
      (record) => record.evidence.evidenceId === input.replacedEvidenceId,
    );
    const replaced = input.existingEvidence[replacedIndex];
    if (replaced === undefined) {
      context.addIssue({
        code: "custom",
        path: ["replacedEvidenceId"],
        message: "Replacement must name persisted threshold evidence",
      });
      return;
    }
    const replacement = input.replacementEvidence;
    if (
      replaced.profileId !== replacement.profileId ||
      replaced.evidence.activityCategory !== replacement.evidence.activityCategory ||
      replaced.evidence.activityId !== replacement.evidence.activityId
    ) {
      context.addIssue({
        code: "custom",
        path: ["replacementEvidence"],
        message: "Replacement must preserve the persisted threshold evidence identity",
      });
    }
  });

export function replacePersistedThresholdEvidence(
  input: z.input<typeof persistedThresholdEvidenceReplacementInputSchema>,
): PersistedThresholdEvidence[] {
  const parsed = persistedThresholdEvidenceReplacementInputSchema.parse(input);
  return persistedThresholdEvidenceCollectionSchema.parse(
    parsed.existingEvidence.map((record) =>
      record.evidence.evidenceId === parsed.replacedEvidenceId
        ? parsed.replacementEvidence
        : record,
    ),
  );
}

/**
 * The only projection from rebuild persistence into threshold selection. It
 * deliberately removes superseded and deleted candidates before selection.
 */
export function projectActiveRebuildThresholdEvidence(
  evidence: z.input<typeof persistedThresholdEvidenceCollectionSchema>,
): z.infer<typeof thresholdEvidenceSchema>[] {
  return persistedThresholdEvidenceCollectionSchema
    .parse(evidence)
    .filter((record) => record.lifecycle.status === "active")
    .map((record) => record.evidence);
}

export const athleteIncrementalApplyInputSchema = z
  .object({
    profileId: uuidSchema,
    expectedPublishedRevision: revisionSchema,
    targetSourceRevision: revisionSchema,
    currentState: athleteStateBaselineSchema,
    effect: activityTrainingEffectSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.currentState.athleteId !== input.profileId ||
      input.effect.profileId !== input.profileId
    ) {
      context.addIssue({
        code: "custom",
        message: "Incremental state inputs must share one athlete",
      });
    }
    if (input.currentState.stateRevision !== input.expectedPublishedRevision) {
      context.addIssue({
        code: "custom",
        path: ["expectedPublishedRevision"],
        message: "Expected revision must match the supplied current state",
      });
    }
    if (input.targetSourceRevision <= input.expectedPublishedRevision) {
      context.addIssue({
        code: "custom",
        path: ["targetSourceRevision"],
        message: "Incremental publication must advance the source revision",
      });
    }
    if (input.effect.sourceRevision !== input.targetSourceRevision) {
      context.addIssue({
        code: "custom",
        path: ["effect", "sourceRevision"],
        message: "Incremental effect revision must match the publication target",
      });
    }
    if (Date.parse(input.effect.effectiveAt) < Date.parse(input.currentState.asOf)) {
      context.addIssue({
        code: "custom",
        path: ["effect", "effectiveAt"],
        message: "Older evidence requires a rebuild instead of incremental application",
      });
    }
  });

function compareEffects(
  left: { effectiveAt: string; activityId: string; activityAnalysisRevision: number },
  right: { effectiveAt: string; activityId: string; activityAnalysisRevision: number },
): number {
  return (
    Date.parse(left.effectiveAt) - Date.parse(right.effectiveAt) ||
    left.activityId.localeCompare(right.activityId) ||
    left.activityAnalysisRevision - right.activityAnalysisRevision
  );
}

function compareThresholdEvidence(
  left: z.infer<typeof persistedThresholdEvidenceSchema>,
  right: z.infer<typeof persistedThresholdEvidenceSchema>,
): number {
  return (
    Date.parse(left.evidence.observedAt) - Date.parse(right.evidence.observedAt) ||
    left.evidence.evidenceId.localeCompare(right.evidence.evidenceId)
  );
}

export const athleteRebuildCursorSchema = z
  .object({
    effectiveAt: instantSchema,
    activityId: uuidSchema,
    activityAnalysisRevision: z.number().int().positive(),
  })
  .strict();

/** One bounded, ordered replay page; large histories advance through the explicit cursor. */
export const athleteRebuildPageInputSchema = z
  .object({
    request: athleteRecalculationRequestSchema,
    baseState: athleteStateBaselineSchema.nullable(),
    targetSourceRevision: revisionSchema,
    after: athleteRebuildCursorSchema.nullable(),
    isFinalPage: z.boolean(),
    effects: z.array(activityTrainingEffectSchema).max(1_000),
    thresholdEvidence: persistedThresholdEvidenceCollectionSchema,
  })
  .strict()
  .superRefine((input, context) => {
    const profileId = input.request.profileId;
    if (input.targetSourceRevision !== input.request.sourceRevision) {
      context.addIssue({
        code: "custom",
        path: ["targetSourceRevision"],
        message: "A rebuild must target the coalesced request revision",
      });
    }
    if (input.baseState !== null && input.baseState.athleteId !== profileId) {
      context.addIssue({
        code: "custom",
        path: ["baseState"],
        message: "Base state owner mismatch",
      });
    }
    if (input.baseState !== null && input.baseState.stateRevision > input.targetSourceRevision) {
      context.addIssue({
        code: "custom",
        path: ["baseState", "stateRevision"],
        message: "Rebuild base state cannot be newer than its target revision",
      });
    }
    for (const [index, effect] of input.effects.entries()) {
      if (effect.profileId !== profileId) {
        context.addIssue({
          code: "custom",
          path: ["effects", index, "profileId"],
          message: "Rebuild effects must belong to one athlete",
        });
      }
      if (effect.sourceRevision > input.targetSourceRevision) {
        context.addIssue({
          code: "custom",
          path: ["effects", index, "sourceRevision"],
          message: "Rebuild effects cannot be newer than the target revision",
        });
      }
      const previousEffect = input.effects[index - 1];
      if (previousEffect !== undefined && compareEffects(previousEffect, effect) >= 0) {
        context.addIssue({
          code: "custom",
          path: ["effects", index],
          message: "Rebuild effects must be strictly ordered by time and stable identity",
        });
      }
      if (index === 0 && input.after !== null && compareEffects(input.after, effect) >= 0) {
        context.addIssue({
          code: "custom",
          path: ["effects", index],
          message: "A rebuild page must begin strictly after its cursor",
        });
      }
    }
    for (const [index, evidence] of input.thresholdEvidence.entries()) {
      if (evidence.profileId !== profileId) {
        context.addIssue({
          code: "custom",
          path: ["thresholdEvidence", index, "profileId"],
          message: "Rebuild threshold evidence must belong to one athlete",
        });
      }
      const previousEvidence = input.thresholdEvidence[index - 1];
      if (
        previousEvidence !== undefined &&
        compareThresholdEvidence(previousEvidence, evidence) >= 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["thresholdEvidence", index],
          message: "Rebuild threshold evidence must be strictly ordered by time and identity",
        });
      }
    }
  });

export type ActivityTrainingEffect = z.infer<typeof activityTrainingEffectSchema>;
export type DailyTrainingLoad = z.infer<typeof dailyTrainingLoadSchema>;
export type PersistedThresholdEvidence = z.infer<typeof persistedThresholdEvidenceSchema>;
export type PersistedThresholdEvidenceReplacementInput = z.infer<
  typeof persistedThresholdEvidenceReplacementInputSchema
>;
export type AthleteRecalculationQueueItem = z.infer<typeof athleteRecalculationQueueItemSchema>;
export type AthleteRecalculationWorkerState = z.infer<typeof athleteRecalculationWorkerStateSchema>;
export type AthleteRecalculationQueueTransitionInput = z.infer<
  typeof athleteRecalculationQueueTransitionInputSchema
>;
export type AthleteRecalculationWorkerTransitionInput = z.infer<
  typeof athleteRecalculationWorkerTransitionInputSchema
>;
export type AthleteIncrementalApplyInput = z.infer<typeof athleteIncrementalApplyInputSchema>;
export type AthleteRebuildCursor = z.infer<typeof athleteRebuildCursorSchema>;
export type AthleteRebuildPageInput = z.infer<typeof athleteRebuildPageInputSchema>;
