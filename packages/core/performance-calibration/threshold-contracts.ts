import { z } from "zod";

import { bestEffortMetricSchema } from "../calculations/best-efforts";

export const THRESHOLD_POLICY_SCHEMA_VERSION = "threshold-policy-schema-v1" as const;
export const THRESHOLD_POLICY_VERSION = "threshold-policy-v1" as const;
export const THRESHOLD_PLAUSIBILITY_VERSION = "threshold-plausibility-v1" as const;
export const THRESHOLD_LIFECYCLE_STATE_VERSION = "threshold-lifecycle-state-v1" as const;

export const thresholdActivityCategorySchema = z.enum(["bike", "run", "swim"]);
export const thresholdMetricSchema = z.enum(["power", "speed"]);
export const thresholdUnitSchema = z.enum(["watts", "meters_per_second"]);
export const thresholdMethodSchema = z.enum(["bike_power_30m", "run_speed_30m", "swim_speed_15m"]);
export const thresholdPolicySchemaVersionSchema = z.literal(THRESHOLD_POLICY_SCHEMA_VERSION);
export const thresholdPolicyVersionSchema = z.literal(THRESHOLD_POLICY_VERSION);
export const thresholdPlausibilityVersionSchema = z.literal(THRESHOLD_PLAUSIBILITY_VERSION);

export const thresholdEvaluationRejectionReasonSchema = z.enum([
  "source_not_accepted",
  "ownership_unverified",
  "series_missing",
  "series_ambiguous",
  "exact_window_missing",
  "exact_window_incomplete",
  "coverage_insufficient",
  "gap_bound_exceeded",
  "value_implausible",
]);

export const thresholdEvaluationDiagnosticsSchema = z
  .object({
    policyVersion: thresholdPolicyVersionSchema,
    plausibilityVersion: thresholdPlausibilityVersionSchema,
    selectedSeriesId: z.string().trim().min(1).max(256).nullable(),
    selectedSeriesRole: z.enum(["preferred", "fallback"]).nullable(),
    selectedSeriesMetric: bestEffortMetricSchema.nullable(),
    exactWindowSeconds: z.number().int().positive(),
    conversionFactor: z.number().finite().positive(),
    requiredWindowCoverage: z.number().finite().min(0).max(1),
    maximumGapSeconds: z.number().finite().positive(),
    extractedValue: z.number().finite().nonnegative().nullable(),
    thresholdValue: z.number().finite().positive().nullable(),
  })
  .strict();

export const thresholdCandidateSchema = z
  .object({
    activityCategory: thresholdActivityCategorySchema,
    metric: thresholdMetricSchema,
    unit: thresholdUnitSchema,
    method: thresholdMethodSchema,
    value: z.number().finite().positive(),
    sourceSeriesId: z.string().trim().min(1).max(256),
    sourceSeriesMetric: bestEffortMetricSchema,
    startTimestampSeconds: z.number().finite(),
    endTimestampSeconds: z.number().finite(),
    exactWindowSeconds: z.number().int().positive(),
    conversionFactor: z.number().finite().positive(),
    policyVersion: thresholdPolicyVersionSchema,
    plausibilityVersion: thresholdPlausibilityVersionSchema,
  })
  .strict()
  .superRefine((candidate, context) => {
    const expectedUnit = candidate.metric === "power" ? "watts" : "meters_per_second";
    if (candidate.unit !== expectedUnit) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Threshold candidate unit must match its metric",
      });
    }
    if (
      candidate.endTimestampSeconds !==
      candidate.startTimestampSeconds + candidate.exactWindowSeconds
    ) {
      context.addIssue({
        code: "custom",
        path: ["endTimestampSeconds"],
        message: "Threshold candidate boundaries must span the exact configured window",
      });
    }
  });

export const thresholdEvaluationSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("qualified"),
      candidate: thresholdCandidateSchema,
      diagnostics: thresholdEvaluationDiagnosticsSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("rejected"),
      reason: thresholdEvaluationRejectionReasonSchema,
      diagnostics: thresholdEvaluationDiagnosticsSchema,
    })
    .strict(),
]);

export const thresholdObservationMetricSchema = z.enum(["power", "speed", "grade_adjusted_speed"]);

export const thresholdExactWindowObservationSchema = z
  .object({
    evidenceId: z.string().trim().min(1).max(256),
    activityId: z.string().trim().min(1).max(256),
    seriesId: z.string().trim().min(1).max(256),
    metric: thresholdObservationMetricSchema,
    sourceAccepted: z.boolean(),
    ownershipVerified: z.boolean(),
    availability: z.enum(["available", "incomplete"]),
    durationSeconds: z.number().int().positive(),
    value: z.number().finite().nonnegative(),
    startTimestampSeconds: z.number().finite(),
    endTimestampSeconds: z.number().finite(),
    windowCoverage: z.number().finite().min(0).max(1),
    maximumGapSeconds: z.number().finite().nonnegative(),
  })
  .strict();

export const thresholdSelectionInputSchema = z
  .object({
    activityCategory: thresholdActivityCategorySchema,
    observations: z.array(thresholdExactWindowObservationSchema).max(8),
  })
  .strict()
  .superRefine((input, context) => {
    const evidenceIds = new Set<string>();
    const activityIds = new Set<string>();
    for (const [index, observation] of input.observations.entries()) {
      if (evidenceIds.has(observation.evidenceId)) {
        context.addIssue({
          code: "custom",
          path: ["observations", index, "evidenceId"],
          message: "Threshold selection evidence IDs must be unique",
        });
      }
      evidenceIds.add(observation.evidenceId);
      activityIds.add(observation.activityId);
    }
    if (activityIds.size > 1) {
      context.addIssue({
        code: "custom",
        path: ["observations"],
        message: "Threshold selection observations must belong to one activity",
      });
    }
  });

export const thresholdMeasurementAttemptSchema = z
  .object({
    role: z.enum(["preferred", "fallback"]),
    metric: thresholdObservationMetricSchema,
    evidenceIds: z.array(z.string().trim().min(1).max(256)).max(8),
    evaluation: thresholdEvaluationSchema,
  })
  .strict();

export const thresholdSelectionResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("qualified"),
      candidate: thresholdCandidateSchema,
      selectedRole: z.enum(["preferred", "fallback"]),
      selectedEvidenceId: z.string().trim().min(1).max(256),
      selectedActivityId: z.string().trim().min(1).max(256),
      attempts: z.array(thresholdMeasurementAttemptSchema).min(1).max(2),
    })
    .strict(),
  z
    .object({
      status: z.literal("rejected"),
      reason: z.literal("no_qualified_measurement"),
      attempts: z.array(thresholdMeasurementAttemptSchema).min(1).max(2),
    })
    .strict(),
]);

export const thresholdEvidenceSchema = thresholdCandidateSchema
  .extend({
    evidenceId: z.string().trim().min(1).max(256),
    activityId: z.string().trim().min(1).max(256),
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const thresholdSelectionDecisionSchema = z
  .object({
    activityCategory: thresholdActivityCategorySchema,
    metric: thresholdMetricSchema,
    unit: thresholdUnitSchema,
    method: thresholdMethodSchema,
    value: z.number().finite().positive(),
    effectiveAt: z.string().datetime({ offset: true }),
    policyVersion: thresholdPolicyVersionSchema,
    plausibilityVersion: thresholdPlausibilityVersionSchema,
    selectedEvidenceIds: z.array(z.string().trim().min(1).max(256)).min(1).max(8),
    selectedActivityIds: z.array(z.string().trim().min(1).max(256)).min(1).max(8),
    publicationReason: z.enum([
      "first_qualified_candidate",
      "independent_confirmation",
      "material_increase",
      "supported_decrease",
      "confirmation_window_reset",
    ]),
  })
  .strict()
  .superRefine((decision, context) => {
    if (decision.selectedEvidenceIds.length !== decision.selectedActivityIds.length) {
      context.addIssue({
        code: "custom",
        path: ["selectedActivityIds"],
        message: "Threshold selection evidence and activity provenance must align",
      });
    }
    if (new Set(decision.selectedEvidenceIds).size !== decision.selectedEvidenceIds.length) {
      context.addIssue({
        code: "custom",
        path: ["selectedEvidenceIds"],
        message: "Threshold selection evidence IDs must be unique",
      });
    }
    if (new Set(decision.selectedActivityIds).size !== decision.selectedActivityIds.length) {
      context.addIssue({
        code: "custom",
        path: ["selectedActivityIds"],
        message: "Threshold selection requires independent activities",
      });
    }
  });

export const thresholdLifecycleInputSchema = z
  .object({
    activityCategory: thresholdActivityCategorySchema,
    asOf: z.string().datetime({ offset: true }),
    evidence: z.array(thresholdEvidenceSchema),
  })
  .strict()
  .superRefine((input, context) => {
    const evidenceIds = new Set<string>();
    const activityIds = new Set<string>();
    for (const [index, evidence] of input.evidence.entries()) {
      if (evidenceIds.has(evidence.evidenceId)) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index, "evidenceId"],
          message: "Threshold lifecycle evidence IDs must be unique",
        });
      }
      evidenceIds.add(evidence.evidenceId);
      if (activityIds.has(evidence.activityId)) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index, "activityId"],
          message: "Threshold lifecycle activity IDs must be unique",
        });
      }
      activityIds.add(evidence.activityId);
    }
  });

export const thresholdLifecycleDecisionSchema = z.enum([
  "first_qualified_candidate",
  "independent_confirmation",
  "material_increase",
  "retained_noise",
  "retained_single_decrease",
  "supported_decrease",
  "confirmation_window_reset",
]);

export const thresholdLifecycleResultSchema = z.discriminatedUnion("status", [
  z
    .object({ status: z.literal("unavailable"), reason: z.literal("no_qualified_evidence") })
    .strict(),
  z
    .object({
      status: z.literal("available"),
      state: z.enum(["provisional", "confirmed"]),
      decision: thresholdLifecycleDecisionSchema,
      threshold: thresholdSelectionDecisionSchema,
    })
    .strict(),
]);

export const thresholdLifecycleEvidencePointSchema = z
  .object({
    evidenceId: z.string().trim().min(1).max(256),
    activityId: z.string().trim().min(1).max(256),
    observedAt: z.string().datetime({ offset: true }),
    value: z.number().finite().positive(),
  })
  .strict();

export const thresholdLifecycleCursorSchema = z
  .object({
    observedAt: z.string().datetime({ offset: true }),
    evidenceId: z.string().trim().min(1).max(256),
    activityId: z.string().trim().min(1).max(256),
  })
  .strict();

export const thresholdLifecycleStateSchema = z
  .object({
    stateVersion: z.literal(THRESHOLD_LIFECYCLE_STATE_VERSION),
    activityCategory: thresholdActivityCategorySchema,
    confidence: z.enum(["provisional", "confirmed"]),
    current: thresholdSelectionDecisionSchema,
    pendingDecrease: z.array(thresholdLifecycleEvidencePointSchema).max(1),
    lastProcessed: thresholdLifecycleCursorSchema,
  })
  .strict()
  .superRefine((state, context) => {
    if (state.current.activityCategory !== state.activityCategory) {
      context.addIssue({
        code: "custom",
        path: ["current", "activityCategory"],
        message: "Threshold lifecycle state category must match its current threshold",
      });
    }
    if (state.confidence === "provisional" && state.current.selectedEvidenceIds.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["current", "selectedEvidenceIds"],
        message: "Provisional threshold state must retain exactly one selected observation",
      });
    }
    if (Date.parse(state.lastProcessed.observedAt) < Date.parse(state.current.effectiveAt)) {
      context.addIssue({
        code: "custom",
        path: ["lastProcessed", "observedAt"],
        message: "Threshold lifecycle cursor cannot precede the current threshold",
      });
    }
    for (const [index, pending] of state.pendingDecrease.entries()) {
      if (Date.parse(pending.observedAt) > Date.parse(state.lastProcessed.observedAt)) {
        context.addIssue({
          code: "custom",
          path: ["pendingDecrease", index, "observedAt"],
          message: "Pending decrease evidence cannot follow the lifecycle cursor",
        });
      }
    }
    const retainedEvidenceIds = [
      ...state.current.selectedEvidenceIds,
      ...state.pendingDecrease.map(({ evidenceId }) => evidenceId),
    ];
    if (new Set(retainedEvidenceIds).size !== retainedEvidenceIds.length) {
      context.addIssue({
        code: "custom",
        path: ["pendingDecrease"],
        message: "Threshold lifecycle retained evidence IDs must be unique",
      });
    }
    const retainedActivityIds = [
      ...state.current.selectedActivityIds,
      ...state.pendingDecrease.map(({ activityId }) => activityId),
    ];
    if (new Set(retainedActivityIds).size !== retainedActivityIds.length) {
      context.addIssue({
        code: "custom",
        path: ["pendingDecrease"],
        message: "Threshold lifecycle retained activity IDs must be unique",
      });
    }
  });

export const thresholdLifecycleStepInputSchema = z
  .object({
    state: thresholdLifecycleStateSchema.nullable(),
    candidate: thresholdEvidenceSchema,
  })
  .strict();

export const thresholdLifecycleStepResultSchema = z
  .object({
    action: z.enum(["provisional", "confirm", "increase", "retain", "decrease"]),
    decision: thresholdLifecycleDecisionSchema,
    selectedValue: z.number().finite().positive(),
    state: thresholdLifecycleStateSchema,
  })
  .strict();

export const thresholdFreshnessSchema = z
  .object({
    status: z.enum(["fresh", "stale"]),
    ageSeconds: z.number().int().nonnegative(),
    freshForSeconds: z.number().int().positive(),
  })
  .strict();

export type ThresholdActivityCategory = z.infer<typeof thresholdActivityCategorySchema>;
export type ThresholdMetric = z.infer<typeof thresholdMetricSchema>;
export type ThresholdMethod = z.infer<typeof thresholdMethodSchema>;
export type ThresholdEvaluation = z.infer<typeof thresholdEvaluationSchema>;
export type ThresholdCandidate = z.infer<typeof thresholdCandidateSchema>;
export type ThresholdExactWindowObservation = z.infer<typeof thresholdExactWindowObservationSchema>;
export type ThresholdSelectionInput = z.input<typeof thresholdSelectionInputSchema>;
export type ThresholdSelectionResult = z.infer<typeof thresholdSelectionResultSchema>;
export type ThresholdEvidence = z.infer<typeof thresholdEvidenceSchema>;
export type ThresholdSelectionDecision = z.infer<typeof thresholdSelectionDecisionSchema>;
export type ThresholdLifecycleInput = z.input<typeof thresholdLifecycleInputSchema>;
export type ThresholdLifecycleResult = z.infer<typeof thresholdLifecycleResultSchema>;
export type ThresholdLifecycleEvidencePoint = z.infer<typeof thresholdLifecycleEvidencePointSchema>;
export type ThresholdLifecycleState = z.infer<typeof thresholdLifecycleStateSchema>;
export type ThresholdLifecycleStepInput = z.input<typeof thresholdLifecycleStepInputSchema>;
export type ThresholdLifecycleStepResult = z.infer<typeof thresholdLifecycleStepResultSchema>;
export type ThresholdFreshness = z.infer<typeof thresholdFreshnessSchema>;
