import { z } from "zod";

import { BEST_EFFORT_CALCULATION_VERSION } from "../calculations/best-efforts";
import {
  canonicalCyclingDurationEffortEvidenceSchema,
  durationPerformanceCalculationIdentitySchema,
  durationPerformanceConfidenceSchema,
  durationPerformanceEvidenceCoverageSchema,
  durationPerformanceEvidenceExclusionReasonSchema,
  durationPerformanceReadCoverageSchema,
  durationPerformanceRecalculationTriggerSchema,
  durationPerformanceSourceEvidenceIdsSchema,
} from "../duration-performance/contracts";

export const CYCLING_DURATION_PERFORMANCE_INPUT_VERSION = "cycling-duration-performance-input-v1";
export const CYCLING_DURATION_PERFORMANCE_MODEL_VERSION = "cycling-duration-performance-v1";
export const CYCLING_PERFORMANCE_EVIDENCE_POLICY_VERSION =
  "cycling-duration-performance-evidence-v1";
export const CYCLING_MMP_CURVE_CALCULATION_VERSION = "cycling-mmp-curve-v1";
export const CYCLING_FIVE_SECOND_POWER_CALCULATION_VERSION =
  "cycling-five-second-maximal-mean-power-v1";
export const CYCLING_CRITICAL_POWER_CALCULATION_VERSION = "cycling-critical-power-2p-v1";
export const CYCLING_RESERVE_CALCULATION_VERSION = "cycling-gradientpeak-reserve-v1";
export const CYCLING_PLANNING_THRESHOLD_POWER_CALCULATION_VERSION =
  "cycling-planning-threshold-power-v1";
export const CYCLING_MODELED_TIME_TO_EXHAUSTION_CALCULATION_VERSION =
  "cycling-modeled-time-to-exhaustion-v1";
export const CYCLING_DURATION_RETENTION_CALCULATION_VERSION = "cycling-duration-retention-v1";
export const CYCLING_CAPABILITY_PROFILE_VERSION = "cycling-athlete-capability-profile-v1";
export const CYCLING_TRAINING_LEVELS_VERSION = "cycling-individualized-levels-v1";

export const CYCLING_DURATION_PERFORMANCE_POLICY = Object.freeze({
  version: CYCLING_PERFORMANCE_EVIDENCE_POLICY_VERSION,
  freshnessWindowDays: 90,
  minimumPartialSourceTimeCoverage: 0.8,
  maximumInputEfforts: 2_000,
  curveRequiredDurationsSeconds: Object.freeze([5, 30, 60, 300, 600, 1_200, 1_800, 3_600]),
  criticalPowerFitDurationsSeconds: Object.freeze([180, 300, 600, 900, 1_200, 1_800]),
  criticalPowerMinimumPoints: 4,
  criticalPowerMinimumActivities: 2,
  criticalPowerMinimumRSquared: 0.95,
  criticalPowerMaximumNormalizedRmse: 0.05,
  criticalPowerMaximumCpChangeRatio: 0.15,
  criticalPowerMaximumReserveChangeRatio: 0.35,
  criticalPowerBounds: Object.freeze({
    minimumWatts: 50,
    maximumWatts: 1_000,
    minimumReserveJoules: 1_000,
    maximumReserveJoules: 100_000,
  }),
  planningThresholdPowerTwentyMinuteFraction: 0.95,
  modeledTimeToExhaustionBoundsSeconds: Object.freeze({ minimum: 1_200, maximum: 7_200 }),
});

const MAX_EFFORT_DURATION_SECONDS = 14_400;
const opaqueIdSchema = z.string().trim().min(1).max(256);
const dateTimeSchema = z.string().datetime();

export const cyclingDurationPerformanceInputSchema = z
  .object({
    contractVersion: z.literal(CYCLING_DURATION_PERFORMANCE_INPUT_VERSION),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    effortReadCoverage: durationPerformanceReadCoverageSchema,
    efforts: z
      .array(canonicalCyclingDurationEffortEvidenceSchema)
      .max(CYCLING_DURATION_PERFORMANCE_POLICY.maximumInputEfforts),
  })
  .strict()
  .superRefine((input, context) => {
    const ids = new Set<string>();
    const observationIds = new Set<string>();
    input.efforts.forEach((effort, index) => {
      if (effort.athleteId !== input.athleteId) {
        context.addIssue({
          code: "custom",
          path: ["efforts", index, "athleteId"],
          message: "Every cycling effort must belong to the assessed athlete",
        });
      }
      if (ids.has(effort.evidenceId)) {
        context.addIssue({
          code: "custom",
          path: ["efforts", index, "evidenceId"],
          message: "Canonical effort evidence IDs must be unique",
        });
      }
      if (observationIds.has(effort.observationId)) {
        context.addIssue({
          code: "custom",
          path: ["efforts", index, "observationId"],
          message: "Canonical effort observation IDs must be unique",
        });
      }
      ids.add(effort.evidenceId);
      observationIds.add(effort.observationId);
    });
  });

export const cyclingPerformanceReasonSchema = z.enum([
  "evidence_read_truncated",
  "no_eligible_efforts",
  "non_monotonic_canonical_curve",
  "missing_curve_anchors",
  "partial_source_evidence",
  "five_second_power_effort_missing",
  "critical_power_insufficient_points",
  "critical_power_missing_duration_band",
  "critical_power_insufficient_independent_activities",
  "critical_power_degenerate_fit",
  "critical_power_parameters_out_of_bounds",
  "critical_power_poor_fit",
  "critical_power_unstable_fit",
  "planning_threshold_power_dependency_unavailable",
  "planning_threshold_power_twenty_minute_evidence_missing",
  "planning_threshold_power_not_above_critical_power",
  "modeled_time_to_exhaustion_dependency_unavailable",
  "modeled_time_to_exhaustion_outside_supported_bounds",
  "short_duration_evidence_missing",
  "long_duration_evidence_missing",
  "duration_retention_evidence_missing",
  "duration_retention_independent_activity_evidence_missing",
  "capability_dependency_unavailable",
  "repeated_effort_recovery_not_supported_by_maximal_efforts",
  "training_level_capability_unavailable",
  "advanced_individualized_level_policy_deferred",
]);

const calculationVersionSchema = z.string().regex(/^[a-z][a-z0-9-]*-v[0-9]+$/);

const outcomeMetadataShape = {
  calculationVersion: calculationVersionSchema,
  sourceEvidenceIds: durationPerformanceSourceEvidenceIdsSchema,
  evidenceCoverage: durationPerformanceEvidenceCoverageSchema,
  confidence: durationPerformanceConfidenceSchema,
  expiresAt: dateTimeSchema.nullable(),
  recalculationTriggers: z.array(durationPerformanceRecalculationTriggerSchema).min(1).max(4),
};

function cyclingPerformanceOutcomeSchema<T extends z.ZodType>(valueSchema: T) {
  return z
    .discriminatedUnion("status", [
      z
        .object({
          status: z.literal("available"),
          value: valueSchema,
          reasons: z.array(cyclingPerformanceReasonSchema).max(0),
          ...outcomeMetadataShape,
        })
        .strict(),
      z
        .object({
          status: z.literal("partial"),
          value: valueSchema,
          reasons: z.array(cyclingPerformanceReasonSchema).min(1),
          ...outcomeMetadataShape,
        })
        .strict(),
      z
        .object({
          status: z.literal("unavailable"),
          value: z.null(),
          reasons: z.array(cyclingPerformanceReasonSchema).min(1),
          ...outcomeMetadataShape,
        })
        .strict(),
    ])
    .superRefine((outcome, context) => {
      if (
        outcome.status === "available" &&
        (outcome.evidenceCoverage.state !== "complete" ||
          outcome.confidence === "unavailable" ||
          outcome.sourceEvidenceIds.length === 0 ||
          outcome.expiresAt === null)
      ) {
        context.addIssue({
          code: "custom",
          message: "Available outcomes require complete coverage, evidence, confidence, and expiry",
        });
      }
      if (
        outcome.status === "partial" &&
        (outcome.evidenceCoverage.state !== "partial" ||
          outcome.confidence === "unavailable" ||
          outcome.sourceEvidenceIds.length === 0 ||
          outcome.expiresAt === null)
      ) {
        context.addIssue({
          code: "custom",
          message: "Partial outcomes require partial coverage, evidence, confidence, and expiry",
        });
      }
      if (outcome.status === "unavailable" && outcome.confidence !== "unavailable") {
        context.addIssue({
          code: "custom",
          path: ["confidence"],
          message: "Unavailable outcomes cannot claim confidence",
        });
      }
    });
}

export const cyclingMmpCurvePointSchema = z
  .object({
    observationId: opaqueIdSchema,
    evidenceRevision: z.number().int().positive(),
    durationSeconds: z.number().int().min(5).max(MAX_EFFORT_DURATION_SECONDS),
    powerWatts: z.number().finite().positive().max(3_000),
    sourceEvidenceId: opaqueIdSchema,
    activityId: opaqueIdSchema,
    segmentId: opaqueIdSchema,
    recordedAt: dateTimeSchema,
    sourceExtractionStatus: z.enum(["available", "partial"]),
    sourceCalculationVersion: z.literal(BEST_EFFORT_CALCULATION_VERSION),
  })
  .strict();

export const cyclingMmpCurveValueSchema = z
  .object({
    points: z.array(cyclingMmpCurvePointSchema).min(1).max(2_000),
    selectionPolicy: z.literal("strongest_per_exact_duration_then_newest_then_evidence_id"),
    monotonicityPolicy: z.literal("abstain_without_repair_on_increasing_power_with_duration"),
  })
  .strict()
  .superRefine((curve, context) => {
    for (let index = 1; index < curve.points.length; index += 1) {
      const previous = curve.points[index - 1];
      const current = curve.points[index];
      if (!previous || !current) continue;
      if (
        current.durationSeconds <= previous.durationSeconds ||
        current.powerWatts > previous.powerWatts
      ) {
        context.addIssue({
          code: "custom",
          path: ["points", index],
          message: "Available curve points must be duration-ordered and non-increasing",
        });
      }
    }
  });

export const cyclingFiveSecondPowerValueSchema = z
  .object({
    watts: z.number().finite().positive().max(3_000),
    durationSeconds: z.literal(5),
    interpretation: z.literal("five_second_maximal_mean_power_proxy_not_instantaneous_power"),
  })
  .strict();

export const cyclingCriticalPowerFitDiagnosticsSchema = z
  .object({
    pointCount: z.number().int().min(4).max(6),
    activityCount: z.number().int().min(2).max(6),
    fitMinimumDurationSeconds: z.number().int().positive(),
    fitMaximumDurationSeconds: z.number().int().positive(),
    rSquared: z.number().finite().min(0).max(1),
    rmseWatts: z.number().finite().nonnegative(),
    normalizedRmse: z.number().finite().nonnegative(),
    maximumAbsoluteResidualWatts: z.number().finite().nonnegative(),
    maximumCpRemovalChangeRatio: z.number().finite().nonnegative(),
    maximumReserveRemovalChangeRatio: z.number().finite().nonnegative(),
  })
  .strict();

export const cyclingCriticalPowerValueSchema = z
  .object({
    watts: z.number().finite().positive(),
    model: z.literal("power_watts_equals_cp_plus_gradientpeak_reserve_joules_over_seconds"),
    fit: cyclingCriticalPowerFitDiagnosticsSchema,
  })
  .strict();

export const cyclingReserveValueSchema = z
  .object({
    joules: z.number().finite().positive(),
    name: z.literal("gradientpeak_reserve"),
    interpretation: z.literal("two_parameter_model_work_term_not_a_direct_physiology_measurement"),
    fit: cyclingCriticalPowerFitDiagnosticsSchema,
  })
  .strict();

export const cyclingPlanningThresholdPowerValueSchema = z
  .object({
    watts: z.number().finite().positive(),
    referenceDurationSeconds: z.literal(1_200),
    referencePowerFraction: z.literal(0.95),
    formula: z.literal("0.95_times_critical_power_model_power_at_1200_seconds"),
    interpretation: z.literal("gradientpeak_planning_anchor_not_ftp_or_lactate_threshold"),
  })
  .strict();

export const cyclingModeledTimeToExhaustionValueSchema = z
  .object({
    seconds: z.number().finite().positive(),
    atPowerWatts: z.number().finite().positive(),
    formula: z.literal("gradientpeak_reserve_joules_over_threshold_minus_cp_watts"),
    interpretation: z.literal("model_intersection_not_observed_exhaustion_time"),
  })
  .strict();

export const cyclingDurationRetentionValueSchema = z
  .object({
    ratio: z.number().finite().min(0).max(1),
    shortReferenceDurationSeconds: z.literal(1_200),
    longReferenceDurationSeconds: z.literal(3_600),
    shortReferencePowerWatts: z.number().finite().positive(),
    longReferencePowerWatts: z.number().finite().positive(),
    formula: z.literal("3600_second_mmp_over_1200_second_mmp"),
    interpretation: z.literal("cross_duration_retention_not_late_ride_fatigue_resistance"),
  })
  .strict();

export const cyclingShortDurationCapacityValueSchema = z
  .object({
    fiveSecondPowerWatts: z.number().finite().positive(),
    thirtySecondPowerWatts: z.number().finite().positive(),
    sixtySecondPowerWatts: z.number().finite().positive(),
  })
  .strict();

export const cyclingThresholdCapacityValueSchema = z
  .object({
    criticalPowerWatts: z.number().finite().positive(),
    planningThresholdPowerWatts: z.number().finite().positive(),
    modeledTimeToExhaustionSeconds: z.number().finite().positive(),
  })
  .strict();

export const cyclingLongDurationCapacityValueSchema = z
  .object({
    powerWatts: z.number().finite().positive(),
    durationSeconds: z.literal(3_600),
  })
  .strict();

export const cyclingRepeatedEffortRecoveryValueSchema = z
  .object({
    workDurationSeconds: z.number().finite().positive(),
    recoveryDurationSeconds: z.number().finite().positive(),
    recoveredFraction: z.number().finite().min(0).max(1),
  })
  .strict();

export const cyclingMmpCurveOutcomeSchema = cyclingPerformanceOutcomeSchema(
  cyclingMmpCurveValueSchema,
);
export const cyclingFiveSecondPowerOutcomeSchema = cyclingPerformanceOutcomeSchema(
  cyclingFiveSecondPowerValueSchema,
);
export const cyclingCriticalPowerOutcomeSchema = cyclingPerformanceOutcomeSchema(
  cyclingCriticalPowerValueSchema,
);
export const cyclingReserveOutcomeSchema =
  cyclingPerformanceOutcomeSchema(cyclingReserveValueSchema);
export const cyclingPlanningThresholdPowerOutcomeSchema = cyclingPerformanceOutcomeSchema(
  cyclingPlanningThresholdPowerValueSchema,
);
export const cyclingModeledTimeToExhaustionOutcomeSchema = cyclingPerformanceOutcomeSchema(
  cyclingModeledTimeToExhaustionValueSchema,
);
export const cyclingDurationRetentionOutcomeSchema = cyclingPerformanceOutcomeSchema(
  cyclingDurationRetentionValueSchema,
);
export const cyclingShortDurationCapacityOutcomeSchema = cyclingPerformanceOutcomeSchema(
  cyclingShortDurationCapacityValueSchema,
);
export const cyclingThresholdCapacityOutcomeSchema = cyclingPerformanceOutcomeSchema(
  cyclingThresholdCapacityValueSchema,
);
export const cyclingLongDurationCapacityOutcomeSchema = cyclingPerformanceOutcomeSchema(
  cyclingLongDurationCapacityValueSchema,
);
export const cyclingRepeatedEffortRecoveryOutcomeSchema = cyclingPerformanceOutcomeSchema(
  cyclingRepeatedEffortRecoveryValueSchema,
);

export const cyclingAthleteCapabilityProfileSchema = z
  .object({
    contractVersion: z.literal(CYCLING_CAPABILITY_PROFILE_VERSION),
    athleteId: opaqueIdSchema,
    activityCategory: z.literal("bike"),
    shortDurationCapacity: cyclingShortDurationCapacityOutcomeSchema,
    anaerobicReserve: cyclingReserveOutcomeSchema,
    thresholdCapacity: cyclingThresholdCapacityOutcomeSchema,
    longDurationCapacity: cyclingLongDurationCapacityOutcomeSchema,
    durationRetention: cyclingDurationRetentionOutcomeSchema,
    repeatedEffortRecovery: cyclingRepeatedEffortRecoveryOutcomeSchema,
  })
  .strict();

export const cyclingTrainingLevelIdSchema = z.enum([
  "sprint_capacity",
  "reserve_capacity",
  "threshold_capacity",
  "long_duration_capacity",
  "duration_retention_capacity",
  "repeated_effort_recovery",
]);

export const cyclingTargetCapabilitySchema = z.enum([
  "short_duration_capacity",
  "anaerobic_reserve",
  "threshold_capacity",
  "long_duration_capacity",
  "duration_retention",
  "repeated_effort_recovery",
]);

const numericRangeSchema = z
  .object({
    minimum: z.number().finite().nonnegative(),
    maximum: z.number().finite().nonnegative(),
  })
  .strict()
  .refine((range) => range.maximum >= range.minimum, {
    message: "Range maximum must not precede its minimum",
  });

const repetitionRangeSchema = z
  .object({ minimum: z.number().int().positive(), maximum: z.number().int().positive() })
  .strict()
  .refine((range) => range.maximum >= range.minimum, {
    message: "Repetition maximum must not precede its minimum",
  });

export const cyclingTrainingPrescriptionSchema = z
  .object({
    intensityRangeWatts: numericRangeSchema,
    sustainableDurationSeconds: numericRangeSchema,
    workDurationSeconds: numericRangeSchema,
    recoveryDurationSeconds: numericRangeSchema.nullable(),
    expectedReps: repetitionRangeSchema,
    recoveryEvidenceStatus: z.enum([
      "not_applicable_single_bout",
      "supported_by_repeated_effort_evidence",
    ]),
  })
  .strict();

const trainingLevelCommonShape = {
  levelId: cyclingTrainingLevelIdSchema,
  targetCapability: cyclingTargetCapabilitySchema,
  calculationVersion: z.literal(CYCLING_TRAINING_LEVELS_VERSION),
  sourceEvidenceIds: durationPerformanceSourceEvidenceIdsSchema,
  evidenceCoverage: durationPerformanceEvidenceCoverageSchema,
  confidence: durationPerformanceConfidenceSchema,
  expiresAt: dateTimeSchema.nullable(),
  recalculationTriggers: z.array(durationPerformanceRecalculationTriggerSchema).min(1).max(4),
};

export const cyclingTrainingLevelSchema = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.literal("available"),
        prescription: cyclingTrainingPrescriptionSchema,
        reasons: z.array(cyclingPerformanceReasonSchema).max(0),
        ...trainingLevelCommonShape,
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        prescription: z.null(),
        reasons: z.array(cyclingPerformanceReasonSchema).min(1),
        ...trainingLevelCommonShape,
      })
      .strict(),
  ])
  .superRefine((level, context) => {
    if (
      level.status === "available" &&
      (level.evidenceCoverage.state !== "complete" ||
        level.confidence === "unavailable" ||
        level.sourceEvidenceIds.length === 0 ||
        level.expiresAt === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Available training levels require complete capability evidence",
      });
    }
    if (level.status === "unavailable" && level.confidence !== "unavailable") {
      context.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "Unavailable training levels cannot claim confidence",
      });
    }
  });

export const cyclingPerformanceCalculationIdentitySchema =
  durationPerformanceCalculationIdentitySchema.superRefine((identity, context) => {
    if (
      identity.modelVersion !== CYCLING_DURATION_PERFORMANCE_MODEL_VERSION ||
      identity.inputContractVersion !== CYCLING_DURATION_PERFORMANCE_INPUT_VERSION ||
      identity.evidencePolicyVersion !== CYCLING_PERFORMANCE_EVIDENCE_POLICY_VERSION ||
      identity.activityCategory !== "bike" ||
      identity.modelVariant !== "cycling_power"
    ) {
      context.addIssue({
        code: "custom",
        message: "Cycling calculation identity must retain its model and power-lane versions",
      });
    }
  });

export const cyclingPerformanceEvidenceSummarySchema = z
  .object({
    inputEvidenceCount: z.number().int().nonnegative(),
    eligibleEvidenceIds: durationPerformanceSourceEvidenceIdsSchema,
    selectedSourceEvidenceIds: durationPerformanceSourceEvidenceIdsSchema,
    selectedObservationIds: durationPerformanceSourceEvidenceIdsSchema,
    supersededEvidenceIds: durationPerformanceSourceEvidenceIdsSchema,
    excludedEvidence: z
      .array(
        z
          .object({
            evidenceId: opaqueIdSchema,
            reason: durationPerformanceEvidenceExclusionReasonSchema,
          })
          .strict(),
      )
      .max(2_000),
  })
  .strict();

export const cyclingDurationPerformanceModelSchema = z
  .object({
    contractVersion: z.literal(CYCLING_DURATION_PERFORMANCE_MODEL_VERSION),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    activityCategory: z.literal("bike"),
    calculationIdentity: cyclingPerformanceCalculationIdentitySchema,
    evidenceSummary: cyclingPerformanceEvidenceSummarySchema,
    maximalMeanPowerCurve: cyclingMmpCurveOutcomeSchema,
    parameters: z
      .object({
        fiveSecondPower: cyclingFiveSecondPowerOutcomeSchema,
        criticalPower: cyclingCriticalPowerOutcomeSchema,
        anaerobicReserve: cyclingReserveOutcomeSchema,
        planningThresholdPower: cyclingPlanningThresholdPowerOutcomeSchema,
        modeledTimeToExhaustion: cyclingModeledTimeToExhaustionOutcomeSchema,
        durationRetention: cyclingDurationRetentionOutcomeSchema,
      })
      .strict(),
    capabilityProfile: cyclingAthleteCapabilityProfileSchema,
    trainingLevels: z.array(cyclingTrainingLevelSchema).length(6),
  })
  .strict()
  .superRefine((model, context) => {
    if (model.assessmentAsOf !== model.calculationIdentity.assessmentAsOf) {
      context.addIssue({
        code: "custom",
        path: ["calculationIdentity", "assessmentAsOf"],
        message: "Calculation identity must preserve the model assessment instant",
      });
    }
    if (
      model.athleteId !== model.calculationIdentity.athleteId ||
      model.athleteId !== model.capabilityProfile.athleteId
    ) {
      context.addIssue({
        code: "custom",
        path: ["athleteId"],
        message: "Model identity and capability profile must retain one athlete ID",
      });
    }
    const levelIds = model.trainingLevels.map((level) => level.levelId);
    if (new Set(levelIds).size !== levelIds.length) {
      context.addIssue({
        code: "custom",
        path: ["trainingLevels"],
        message: "Cycling training level IDs must be unique",
      });
    }
    const selectedIds = new Set(model.evidenceSummary.selectedSourceEvidenceIds);
    const allOutcomes = [
      model.maximalMeanPowerCurve,
      model.parameters.fiveSecondPower,
      model.parameters.criticalPower,
      model.parameters.anaerobicReserve,
      model.parameters.planningThresholdPower,
      model.parameters.modeledTimeToExhaustion,
      model.parameters.durationRetention,
      model.capabilityProfile.shortDurationCapacity,
      model.capabilityProfile.anaerobicReserve,
      model.capabilityProfile.thresholdCapacity,
      model.capabilityProfile.longDurationCapacity,
      model.capabilityProfile.durationRetention,
      model.capabilityProfile.repeatedEffortRecovery,
      ...model.trainingLevels,
    ];
    if (
      allOutcomes.some((outcome) =>
        outcome.sourceEvidenceIds.some((sourceId) => !selectedIds.has(sourceId)),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidenceSummary", "selectedSourceEvidenceIds"],
        message: "Every output source ID must resolve to selected canonical evidence",
      });
    }
    if (
      model.maximalMeanPowerCurve.status !== "unavailable" &&
      model.maximalMeanPowerCurve.value.points.some(
        (point) => !selectedIds.has(point.sourceEvidenceId),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximalMeanPowerCurve"],
        message: "Curve points must retain selected canonical source evidence IDs",
      });
    }
  });

export type CyclingDurationPerformanceInput = z.infer<typeof cyclingDurationPerformanceInputSchema>;
export type CyclingPerformanceReason = z.infer<typeof cyclingPerformanceReasonSchema>;
export type CyclingMmpCurveOutcome = z.infer<typeof cyclingMmpCurveOutcomeSchema>;
export type CyclingFiveSecondPowerOutcome = z.infer<typeof cyclingFiveSecondPowerOutcomeSchema>;
export type CyclingCriticalPowerOutcome = z.infer<typeof cyclingCriticalPowerOutcomeSchema>;
export type CyclingReserveOutcome = z.infer<typeof cyclingReserveOutcomeSchema>;
export type CyclingPlanningThresholdPowerOutcome = z.infer<
  typeof cyclingPlanningThresholdPowerOutcomeSchema
>;
export type CyclingModeledTimeToExhaustionOutcome = z.infer<
  typeof cyclingModeledTimeToExhaustionOutcomeSchema
>;
export type CyclingDurationRetentionOutcome = z.infer<typeof cyclingDurationRetentionOutcomeSchema>;
export type CyclingAthleteCapabilityProfile = z.infer<typeof cyclingAthleteCapabilityProfileSchema>;
export type CyclingTrainingLevel = z.infer<typeof cyclingTrainingLevelSchema>;
export type CyclingDurationPerformanceModel = z.infer<typeof cyclingDurationPerformanceModelSchema>;
