import { z } from "zod";

import { BEST_EFFORT_CALCULATION_VERSION } from "../calculations/best-efforts";
import {
  type CanonicalRunningDurationEffortEvidence,
  canonicalRunningDurationEffortEvidenceSchema,
  DURATION_PERFORMANCE_MAX_INPUT_EFFORTS,
  type DurationPerformanceConfidence,
  type DurationPerformanceEvidenceCoverage,
  durationPerformanceCalculationIdentitySchema,
  durationPerformanceConfidenceSchema,
  durationPerformanceEvidenceCoverageSchema,
  durationPerformanceEvidenceSummarySchema,
  durationPerformanceReadCoverageSchema,
  durationPerformanceRecalculationTriggerSchema,
  durationPerformanceSourceEvidenceIdsSchema,
  runningEffortBasisSchema,
} from "./contracts";
import {
  buildCanonicalDurationPerformanceCurve,
  buildDurationPerformanceCoverage,
  createDurationPerformanceCalculationIdentity,
  type DurationPerformanceOutcome,
  durationPerformanceCurveConfidence,
  durationPerformanceEvidenceExpiry,
  durationPerformanceFitConfidence,
  durationPerformanceOutcomeForCoverage,
  durationPerformancePartialReasons,
  durationPerformanceSourceEvidenceIds,
  fitInverseDurationModel,
  type InverseDurationFitFailure,
  unavailableDurationPerformanceOutcome,
} from "./foundation";

export const RUNNING_DURATION_PERFORMANCE_INPUT_VERSION = "running-duration-performance-input-v1";
export const RUNNING_DURATION_PERFORMANCE_MODEL_VERSION = "running-duration-performance-v1";
export const RUNNING_PERFORMANCE_EVIDENCE_POLICY_VERSION =
  "running-duration-performance-evidence-v1";
export const RUNNING_SPEED_PACE_CURVE_CALCULATION_VERSION = "running-speed-pace-curve-v1";
export const RUNNING_CRITICAL_SPEED_CALCULATION_VERSION = "running-critical-speed-2p-v1";
export const RUNNING_DISTANCE_RESERVE_CALCULATION_VERSION = "running-distance-reserve-v1";
export const RUNNING_PLANNING_THRESHOLD_PACE_CALCULATION_VERSION =
  "running-planning-threshold-pace-v1";
export const RUNNING_DURATION_RETENTION_CALCULATION_VERSION = "running-duration-retention-v1";
export const RUNNING_TRAINING_LEVELS_VERSION = "running-individualized-pace-levels-v1";

export const RUNNING_DURATION_PERFORMANCE_POLICY = Object.freeze({
  freshnessWindowDays: 90,
  minimumPartialSourceTimeCoverage: 0.8,
  curveRequiredDurationsSeconds: Object.freeze([30, 60, 180, 300, 600, 1_200, 1_800, 3_600]),
  criticalSpeedFitDurationsSeconds: Object.freeze([180, 300, 600, 900, 1_200, 1_800]),
  criticalSpeedMinimumPoints: 4,
  criticalSpeedMinimumActivities: 2,
  criticalSpeedMinimumRSquared: 0.95,
  criticalSpeedMaximumNormalizedRmse: 0.05,
  criticalSpeedMaximumChangeRatio: 0.15,
  distanceReserveMaximumChangeRatio: 0.35,
  criticalSpeedBounds: Object.freeze({
    minimumMetersPerSecond: 1,
    maximumMetersPerSecond: 8,
    minimumDistanceReserveMeters: 20,
    maximumDistanceReserveMeters: 1_000,
  }),
  planningThresholdPaceTwentyMinuteFraction: 0.95,
});

const opaqueIdSchema = z.string().trim().min(1).max(256);
const dateTimeSchema = z.string().datetime();
const calculationVersionSchema = z.string().regex(/^[a-z][a-z0-9-]*-v[0-9]+$/);
const numericRangeSchema = z
  .object({ minimum: z.number().finite().positive(), maximum: z.number().finite().positive() })
  .strict()
  .refine((range) => range.maximum >= range.minimum, {
    message: "Range maximum must not precede its minimum",
  });

export const runningDurationPerformanceInputSchema = z
  .object({
    contractVersion: z.literal(RUNNING_DURATION_PERFORMANCE_INPUT_VERSION),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    effortReadCoverage: durationPerformanceReadCoverageSchema,
    efforts: z
      .array(canonicalRunningDurationEffortEvidenceSchema)
      .max(DURATION_PERFORMANCE_MAX_INPUT_EFFORTS),
  })
  .strict()
  .superRefine((input, context) => {
    const evidenceIds = new Set<string>();
    const observationIds = new Set<string>();
    input.efforts.forEach((effort, index) => {
      if (effort.athleteId !== input.athleteId) {
        context.addIssue({
          code: "custom",
          path: ["efforts", index, "athleteId"],
          message: "Every running effort must belong to the assessed athlete",
        });
      }
      if (evidenceIds.has(effort.evidenceId) || observationIds.has(effort.observationId)) {
        context.addIssue({
          code: "custom",
          path: ["efforts", index],
          message: "Running evidence and observation identities must be unique",
        });
      }
      evidenceIds.add(effort.evidenceId);
      observationIds.add(effort.observationId);
    });
  });

export const runningPerformanceReasonSchema = z.enum([
  "evidence_read_truncated",
  "no_eligible_efforts",
  "mixed_raw_grade_adjusted_evidence",
  "non_monotonic_canonical_curve",
  "missing_curve_anchors",
  "partial_source_evidence",
  "critical_speed_insufficient_points",
  "critical_speed_missing_duration_band",
  "critical_speed_insufficient_independent_activities",
  "critical_speed_degenerate_fit",
  "critical_speed_parameters_out_of_bounds",
  "critical_speed_poor_fit",
  "critical_speed_unstable_fit",
  "planning_threshold_pace_dependency_unavailable",
  "planning_threshold_pace_twenty_minute_evidence_missing",
  "planning_threshold_pace_not_above_critical_speed",
  "duration_retention_evidence_missing",
  "duration_retention_independent_activity_evidence_missing",
  "training_level_capability_unavailable",
  "advanced_individualized_level_policy_deferred",
]);

const runningOutcomeMetadataShape = {
  calculationVersion: calculationVersionSchema,
  sourceEvidenceIds: durationPerformanceSourceEvidenceIdsSchema,
  evidenceCoverage: durationPerformanceEvidenceCoverageSchema,
  confidence: durationPerformanceConfidenceSchema,
  expiresAt: dateTimeSchema.nullable(),
  recalculationTriggers: z.array(durationPerformanceRecalculationTriggerSchema).min(1).max(4),
};

function runningOutcomeSchema<T extends z.ZodType>(valueSchema: T) {
  return z
    .discriminatedUnion("status", [
      z
        .object({
          status: z.literal("available"),
          value: valueSchema,
          reasons: z.array(runningPerformanceReasonSchema).max(0),
          ...runningOutcomeMetadataShape,
        })
        .strict(),
      z
        .object({
          status: z.literal("partial"),
          value: valueSchema,
          reasons: z.array(runningPerformanceReasonSchema).min(1),
          ...runningOutcomeMetadataShape,
        })
        .strict(),
      z
        .object({
          status: z.literal("unavailable"),
          value: z.null(),
          reasons: z.array(runningPerformanceReasonSchema).min(1),
          ...runningOutcomeMetadataShape,
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
          message: "Available running outcomes require complete evidence",
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
          message: "Partial running outcomes require partial evidence",
        });
      }
      if (outcome.status === "unavailable" && outcome.confidence !== "unavailable") {
        context.addIssue({
          code: "custom",
          path: ["confidence"],
          message: "Unavailable running outcomes cannot claim confidence",
        });
      }
    });
}

export const runningSpeedPaceCurvePointSchema = z
  .object({
    observationId: opaqueIdSchema,
    sourceEvidenceId: opaqueIdSchema,
    evidenceRevision: z.number().int().positive(),
    activityId: opaqueIdSchema,
    segmentId: opaqueIdSchema,
    recordedAt: dateTimeSchema,
    durationSeconds: z.number().int().min(5).max(14_400),
    speedMetersPerSecond: z.number().finite().positive().max(13),
    paceSecondsPerKilometer: z.number().finite().positive(),
    unit: z.literal("meters_per_second"),
    evidenceBasis: runningEffortBasisSchema,
    sourceExtractionStatus: z.enum(["available", "partial"]),
    sourceCalculationVersion: z.literal(BEST_EFFORT_CALCULATION_VERSION),
  })
  .strict();

export const runningSpeedPaceCurveValueSchema = z
  .object({
    evidenceBasis: runningEffortBasisSchema,
    points: z.array(runningSpeedPaceCurvePointSchema).min(1).max(2_000),
    selectionPolicy: z.literal("strongest_per_exact_duration_then_newest_then_evidence_id"),
    monotonicityPolicy: z.literal("abstain_without_repair_on_increasing_speed_with_duration"),
    paceFormula: z.literal("1000_meters_divided_by_speed_meters_per_second"),
  })
  .strict();

export const runningCriticalSpeedFitDiagnosticsSchema = z
  .object({
    pointCount: z.number().int().min(4).max(6),
    activityCount: z.number().int().min(2).max(6),
    fitMinimumDurationSeconds: z.number().int().positive(),
    fitMaximumDurationSeconds: z.number().int().positive(),
    rSquared: z.number().finite().min(0).max(1),
    rmseMetersPerSecond: z.number().finite().nonnegative(),
    normalizedRmse: z.number().finite().nonnegative(),
    maximumAbsoluteResidualMetersPerSecond: z.number().finite().nonnegative(),
    maximumCriticalSpeedRemovalChangeRatio: z.number().finite().nonnegative(),
    maximumDistanceReserveRemovalChangeRatio: z.number().finite().nonnegative(),
  })
  .strict();

const runningCriticalSpeedValueSchema = z
  .object({
    metersPerSecond: z.number().finite().positive(),
    paceSecondsPerKilometer: z.number().finite().positive(),
    model: z.literal(
      "speed_meters_per_second_equals_critical_speed_plus_distance_reserve_over_seconds",
    ),
    evidenceBasis: runningEffortBasisSchema,
    fit: runningCriticalSpeedFitDiagnosticsSchema,
  })
  .strict();

const runningDistanceReserveValueSchema = z
  .object({
    meters: z.number().finite().positive(),
    name: z.literal("gradientpeak_distance_reserve"),
    interpretation: z.literal(
      "two_parameter_model_distance_term_not_a_direct_physiology_measurement",
    ),
    evidenceBasis: runningEffortBasisSchema,
    fit: runningCriticalSpeedFitDiagnosticsSchema,
  })
  .strict();

const runningPlanningThresholdPaceValueSchema = z
  .object({
    speedMetersPerSecond: z.number().finite().positive(),
    paceSecondsPerKilometer: z.number().finite().positive(),
    referenceDurationSeconds: z.literal(1_200),
    referenceSpeedFraction: z.literal(0.95),
    formula: z.literal("0.95_times_critical_speed_model_speed_at_1200_seconds"),
    interpretation: z.literal(
      "gradientpeak_planning_anchor_not_lactate_threshold_or_race_prediction",
    ),
    evidenceBasis: runningEffortBasisSchema,
  })
  .strict();

const runningDurationRetentionValueSchema = z
  .object({
    speedRetentionRatio: z.number().finite().min(0).max(1),
    shortReferenceDurationSeconds: z.literal(1_200),
    longReferenceDurationSeconds: z.literal(3_600),
    shortReferenceSpeedMetersPerSecond: z.number().finite().positive(),
    longReferenceSpeedMetersPerSecond: z.number().finite().positive(),
    formula: z.literal("3600_second_speed_over_1200_second_speed"),
    interpretation: z.literal("cross_duration_retention_not_late_run_fatigue_resistance"),
    evidenceBasis: runningEffortBasisSchema,
  })
  .strict();

export const runningTrainingLevelIdSchema = z.enum([
  "short_duration_pace",
  "distance_reserve_pace",
  "threshold_pace",
  "long_duration_pace",
  "duration_retention_pace",
]);

const runningPacePrescriptionSchema = z
  .object({
    speedMetersPerSecondRange: numericRangeSchema,
    paceSecondsPerKilometerRange: z
      .object({ fastest: z.number().finite().positive(), slowest: z.number().finite().positive() })
      .strict()
      .refine((range) => range.slowest >= range.fastest, {
        message: "Slowest pace must not be faster than fastest pace",
      }),
    workDurationSeconds: numericRangeSchema,
    expectedRepetitions: z.object({ minimum: z.literal(1), maximum: z.literal(1) }).strict(),
    recoveryDurationSeconds: z.null(),
    evidenceBasis: runningEffortBasisSchema,
  })
  .strict();

export const runningTrainingLevelSchema = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.literal("available"),
        levelId: runningTrainingLevelIdSchema,
        prescription: runningPacePrescriptionSchema,
        reasons: z.array(runningPerformanceReasonSchema).max(0),
        ...runningOutcomeMetadataShape,
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        levelId: runningTrainingLevelIdSchema,
        prescription: z.null(),
        reasons: z.array(runningPerformanceReasonSchema).min(1),
        ...runningOutcomeMetadataShape,
      })
      .strict(),
  ])
  .superRefine((level, context) => {
    if (level.status === "available" && level.evidenceCoverage.state !== "complete") {
      context.addIssue({
        code: "custom",
        message: "Available running levels require complete evidence",
      });
    }
    if (level.status === "unavailable" && level.confidence !== "unavailable") {
      context.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "Unavailable running levels cannot claim confidence",
      });
    }
  });

export const runningDurationPerformanceModelSchema = z
  .object({
    contractVersion: z.literal(RUNNING_DURATION_PERFORMANCE_MODEL_VERSION),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    activityCategory: z.literal("run"),
    evidenceBasis: z.enum(["raw_speed", "grade_adjusted_speed", "mixed", "unresolved"]),
    calculationIdentity: durationPerformanceCalculationIdentitySchema,
    evidenceSummary: durationPerformanceEvidenceSummarySchema,
    speedPaceCurve: runningOutcomeSchema(runningSpeedPaceCurveValueSchema),
    parameters: z
      .object({
        criticalSpeed: runningOutcomeSchema(runningCriticalSpeedValueSchema),
        distanceReserve: runningOutcomeSchema(runningDistanceReserveValueSchema),
        planningThresholdPace: runningOutcomeSchema(runningPlanningThresholdPaceValueSchema),
        durationRetention: runningOutcomeSchema(runningDurationRetentionValueSchema),
      })
      .strict(),
    trainingLevels: z.array(runningTrainingLevelSchema).length(5),
  })
  .strict()
  .superRefine((model, context) => {
    const selectedIds = new Set(model.evidenceSummary.selectedSourceEvidenceIds);
    const outcomes = [
      model.speedPaceCurve,
      model.parameters.criticalSpeed,
      model.parameters.distanceReserve,
      model.parameters.planningThresholdPace,
      model.parameters.durationRetention,
      ...model.trainingLevels,
    ];
    if (outcomes.some((outcome) => outcome.sourceEvidenceIds.some((id) => !selectedIds.has(id)))) {
      context.addIssue({
        code: "custom",
        path: ["evidenceSummary", "selectedSourceEvidenceIds"],
        message: "Every running output source must resolve to selected canonical evidence",
      });
    }
    const levelIds = model.trainingLevels.map((level) => level.levelId);
    if (new Set(levelIds).size !== levelIds.length) {
      context.addIssue({
        code: "custom",
        path: ["trainingLevels"],
        message: "Running level IDs must be unique",
      });
    }
  });

export type RunningDurationPerformanceInput = z.infer<typeof runningDurationPerformanceInputSchema>;
export type RunningPerformanceReason = z.infer<typeof runningPerformanceReasonSchema>;
export type RunningDurationPerformanceModel = z.infer<typeof runningDurationPerformanceModelSchema>;

const CRITICAL_SPEED_DURATION_BANDS = [
  { minimumDurationSeconds: 180, maximumDurationSeconds: 360, minimumPointCount: 1 },
  { minimumDurationSeconds: 361, maximumDurationSeconds: 900, minimumPointCount: 1 },
  { minimumDurationSeconds: 901, maximumDurationSeconds: 1_800, minimumPointCount: 1 },
];

type RunningOutcome<T> = DurationPerformanceOutcome<T, RunningPerformanceReason>;

function pointAt(
  points: readonly CanonicalRunningDurationEffortEvidence[],
  durationSeconds: number,
): CanonicalRunningDurationEffortEvidence | null {
  return points.find((point) => point.durationSeconds === durationSeconds) ?? null;
}

function pointsForIds(
  points: readonly CanonicalRunningDurationEffortEvidence[],
  ids: readonly string[],
): CanonicalRunningDurationEffortEvidence[] {
  const wanted = new Set(ids);
  return points.filter((point) => wanted.has(point.evidenceId));
}

function evidenceBasis(points: readonly CanonicalRunningDurationEffortEvidence[]) {
  const bases = new Set(points.map((point) => point.evidenceContext.basis));
  if (bases.size > 1) return "mixed";
  return points[0]?.evidenceContext.basis ?? "unresolved";
}

function identity(input: {
  parsed: RunningDurationPerformanceInput;
  points: readonly CanonicalRunningDurationEffortEvidence[];
  basis: "raw_speed" | "grade_adjusted_speed" | "mixed" | "unresolved";
}) {
  return createDurationPerformanceCalculationIdentity({
    modelVersion: RUNNING_DURATION_PERFORMANCE_MODEL_VERSION,
    inputContractVersion: RUNNING_DURATION_PERFORMANCE_INPUT_VERSION,
    evidencePolicyVersion: RUNNING_PERFORMANCE_EVIDENCE_POLICY_VERSION,
    assessmentAsOf: input.parsed.assessmentAsOf,
    athleteId: input.parsed.athleteId,
    activityCategory: "run",
    modelVariant: `running_${input.basis}`,
    sourceCalculationVersions: [BEST_EFFORT_CALCULATION_VERSION],
    evidence: input.points.map((point) => ({
      evidenceId: point.evidenceId,
      observationId: point.observationId,
      evidenceRevision: point.evidenceRevision,
      sourceCalculationVersion: point.calculationVersion,
      facts: {
        activityId: point.activityId,
        segmentId: point.segmentId,
        recordedAt: point.recordedAt,
        durationSeconds: point.durationSeconds,
        value: point.value,
        unit: point.unit,
        basis: point.evidenceContext.basis,
        extractionStatus: point.provenance.extractionStatus,
        sourceTimeCoverage: point.provenance.sourceTimeCoverage,
      },
    })),
  });
}

function globalUnavailable(input: {
  parsed: RunningDurationPerformanceInput;
  foundation: ReturnType<
    typeof buildCanonicalDurationPerformanceCurve<CanonicalRunningDurationEffortEvidence>
  >;
  reason: RunningPerformanceReason;
  basis: "raw_speed" | "grade_adjusted_speed" | "mixed" | "unresolved";
}): RunningDurationPerformanceModel {
  const unavailable = (calculationVersion: string) =>
    unavailableDurationPerformanceOutcome({
      calculationVersion,
      reasons: [input.reason],
      points: input.foundation.selected,
      evidenceCoverage: input.foundation.evidenceCoverage,
      freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
    });
  const levelIds = [
    "short_duration_pace",
    "distance_reserve_pace",
    "threshold_pace",
    "long_duration_pace",
    "duration_retention_pace",
  ];
  return runningDurationPerformanceModelSchema.parse({
    contractVersion: RUNNING_DURATION_PERFORMANCE_MODEL_VERSION,
    assessmentAsOf: input.parsed.assessmentAsOf,
    athleteId: input.parsed.athleteId,
    activityCategory: "run",
    evidenceBasis: input.basis,
    calculationIdentity: identity({
      parsed: input.parsed,
      points: input.basis === "mixed" ? input.foundation.eligible : input.foundation.selected,
      basis: input.basis,
    }),
    evidenceSummary: input.foundation.evidenceSummary,
    speedPaceCurve: unavailable(RUNNING_SPEED_PACE_CURVE_CALCULATION_VERSION),
    parameters: {
      criticalSpeed: unavailable(RUNNING_CRITICAL_SPEED_CALCULATION_VERSION),
      distanceReserve: unavailable(RUNNING_DISTANCE_RESERVE_CALCULATION_VERSION),
      planningThresholdPace: unavailable(RUNNING_PLANNING_THRESHOLD_PACE_CALCULATION_VERSION),
      durationRetention: unavailable(RUNNING_DURATION_RETENTION_CALCULATION_VERSION),
    },
    trainingLevels: levelIds.map((levelId) => ({
      status: "unavailable",
      levelId,
      prescription: null,
      reasons: [input.reason],
      calculationVersion: RUNNING_TRAINING_LEVELS_VERSION,
      sourceEvidenceIds: durationPerformanceSourceEvidenceIds(input.foundation.selected),
      evidenceCoverage: input.foundation.evidenceCoverage,
      confidence: "unavailable",
      expiresAt: input.foundation.expiresAt,
      recalculationTriggers: [
        "new_canonical_best_effort",
        "source_evidence_corrected",
        "source_evidence_expired",
        "calculation_policy_changed",
      ],
    })),
  });
}

function fitFailureReason(reason: InverseDurationFitFailure): RunningPerformanceReason {
  switch (reason) {
    case "insufficient_points":
      return "critical_speed_insufficient_points";
    case "missing_duration_band":
      return "critical_speed_missing_duration_band";
    case "insufficient_independent_activities":
      return "critical_speed_insufficient_independent_activities";
    case "degenerate_fit":
      return "critical_speed_degenerate_fit";
    case "parameters_out_of_bounds":
      return "critical_speed_parameters_out_of_bounds";
    case "poor_fit":
      return "critical_speed_poor_fit";
    case "unstable_fit":
      return "critical_speed_unstable_fit";
  }
}

function pace(speedMetersPerSecond: number): number {
  return 1_000 / speedMetersPerSecond;
}

function unavailableLevel(input: {
  levelId: z.infer<typeof runningTrainingLevelIdSchema>;
  points: readonly CanonicalRunningDurationEffortEvidence[];
  coverage: DurationPerformanceEvidenceCoverage;
  reason?: RunningPerformanceReason;
}) {
  return {
    status: "unavailable",
    levelId: input.levelId,
    prescription: null,
    reasons: [input.reason ?? "advanced_individualized_level_policy_deferred"],
    calculationVersion: RUNNING_TRAINING_LEVELS_VERSION,
    sourceEvidenceIds: durationPerformanceSourceEvidenceIds(input.points),
    evidenceCoverage: input.coverage,
    confidence: "unavailable",
    expiresAt: durationPerformanceEvidenceExpiry(
      input.points,
      RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
    ),
    recalculationTriggers: [
      "new_canonical_best_effort",
      "source_evidence_corrected",
      "source_evidence_expired",
      "calculation_policy_changed",
    ],
  };
}

/** Calculates the running model without extracting or adjusting any raw stream. */
export function calculateRunningDurationPerformance(
  input: RunningDurationPerformanceInput,
): RunningDurationPerformanceModel {
  const parsed = runningDurationPerformanceInputSchema.parse(input);
  const foundation = buildCanonicalDurationPerformanceCurve({
    efforts: parsed.efforts,
    assessmentAsOf: parsed.assessmentAsOf,
    readCoverage: parsed.effortReadCoverage,
    requiredExactDurationsSeconds:
      RUNNING_DURATION_PERFORMANCE_POLICY.curveRequiredDurationsSeconds,
    freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
  });
  const basis = evidenceBasis(foundation.eligible);
  if (basis === "mixed") {
    return globalUnavailable({
      parsed,
      foundation,
      reason: "mixed_raw_grade_adjusted_evidence",
      basis,
    });
  }
  if (foundation.status === "unavailable") {
    const reason = foundation.reasons[0];
    return globalUnavailable({
      parsed,
      foundation,
      reason: reason ?? "no_eligible_efforts",
      basis,
    });
  }
  const resolvedBasis = foundation.selected[0]?.evidenceContext.basis;
  if (resolvedBasis === undefined) {
    return globalUnavailable({
      parsed,
      foundation,
      reason: "no_eligible_efforts",
      basis: "unresolved",
    });
  }
  const selected = foundation.selected;
  const curveValue = {
    evidenceBasis: resolvedBasis,
    points: selected.map((point) => ({
      observationId: point.observationId,
      sourceEvidenceId: point.evidenceId,
      evidenceRevision: point.evidenceRevision,
      activityId: point.activityId,
      segmentId: point.segmentId,
      recordedAt: point.recordedAt,
      durationSeconds: point.durationSeconds,
      speedMetersPerSecond: point.value,
      paceSecondsPerKilometer: pace(point.value),
      unit: point.unit,
      evidenceBasis: point.evidenceContext.basis,
      sourceExtractionStatus: point.provenance.extractionStatus,
      sourceCalculationVersion: point.calculationVersion,
    })),
    selectionPolicy: "strongest_per_exact_duration_then_newest_then_evidence_id",
    monotonicityPolicy: "abstain_without_repair_on_increasing_speed_with_duration",
    paceFormula: "1000_meters_divided_by_speed_meters_per_second",
  };
  const curve = durationPerformanceOutcomeForCoverage({
    calculationVersion: RUNNING_SPEED_PACE_CURVE_CALCULATION_VERSION,
    value: curveValue,
    points: selected,
    evidenceCoverage: foundation.evidenceCoverage,
    availableConfidence: durationPerformanceCurveConfidence(selected),
    partialReasons: durationPerformancePartialReasons({
      evidenceCoverage: foundation.evidenceCoverage,
      missingRequirementReason: "missing_curve_anchors",
      partialSourceReason: "partial_source_evidence",
    }),
    freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
  });

  const fitDurationSet = new Set(
    RUNNING_DURATION_PERFORMANCE_POLICY.criticalSpeedFitDurationsSeconds,
  );
  const fitPoints = selected.filter((point) => fitDurationSet.has(point.durationSeconds));
  const fitCoverage = buildDurationPerformanceCoverage({
    selected: fitPoints,
    eligibleEffortCount: foundation.eligible.filter((point) =>
      fitDurationSet.has(point.durationSeconds),
    ).length,
    readCoverageState: parsed.effortReadCoverage.state,
    requiredDurationBands: CRITICAL_SPEED_DURATION_BANDS,
    minimumDistinctDurations: RUNNING_DURATION_PERFORMANCE_POLICY.criticalSpeedMinimumPoints,
    minimumDistinctActivities: RUNNING_DURATION_PERFORMANCE_POLICY.criticalSpeedMinimumActivities,
  });
  const bounds = RUNNING_DURATION_PERFORMANCE_POLICY.criticalSpeedBounds;
  const fit = fitInverseDurationModel({
    points: fitPoints,
    minimumPoints: RUNNING_DURATION_PERFORMANCE_POLICY.criticalSpeedMinimumPoints,
    minimumActivities: RUNNING_DURATION_PERFORMANCE_POLICY.criticalSpeedMinimumActivities,
    requiredDurationBands: CRITICAL_SPEED_DURATION_BANDS,
    interceptBounds: {
      minimum: bounds.minimumMetersPerSecond,
      maximum: bounds.maximumMetersPerSecond,
    },
    reserveBounds: {
      minimum: bounds.minimumDistanceReserveMeters,
      maximum: bounds.maximumDistanceReserveMeters,
    },
    minimumRSquared: RUNNING_DURATION_PERFORMANCE_POLICY.criticalSpeedMinimumRSquared,
    maximumNormalizedRmse: RUNNING_DURATION_PERFORMANCE_POLICY.criticalSpeedMaximumNormalizedRmse,
    maximumInterceptRemovalChangeRatio:
      RUNNING_DURATION_PERFORMANCE_POLICY.criticalSpeedMaximumChangeRatio,
    maximumReserveRemovalChangeRatio:
      RUNNING_DURATION_PERFORMANCE_POLICY.distanceReserveMaximumChangeRatio,
  });

  let criticalSpeed: RunningOutcome<z.infer<typeof runningCriticalSpeedValueSchema>>;
  let distanceReserve: RunningOutcome<z.infer<typeof runningDistanceReserveValueSchema>>;
  if (fit.status === "unavailable") {
    const reason = fitFailureReason(fit.reason);
    criticalSpeed = unavailableDurationPerformanceOutcome({
      calculationVersion: RUNNING_CRITICAL_SPEED_CALCULATION_VERSION,
      reasons: [reason],
      points: fitPoints,
      evidenceCoverage: fitCoverage,
      freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
    });
    distanceReserve = unavailableDurationPerformanceOutcome({
      calculationVersion: RUNNING_DISTANCE_RESERVE_CALCULATION_VERSION,
      reasons: [reason],
      points: fitPoints,
      evidenceCoverage: fitCoverage,
      freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
    });
  } else {
    const diagnostics = {
      pointCount: fit.diagnostics.pointCount,
      activityCount: fit.diagnostics.activityCount,
      fitMinimumDurationSeconds: fit.diagnostics.fitMinimumDurationSeconds,
      fitMaximumDurationSeconds: fit.diagnostics.fitMaximumDurationSeconds,
      rSquared: fit.diagnostics.rSquared,
      rmseMetersPerSecond: fit.diagnostics.rmse,
      normalizedRmse: fit.diagnostics.normalizedRmse,
      maximumAbsoluteResidualMetersPerSecond: fit.diagnostics.maximumAbsoluteResidual,
      maximumCriticalSpeedRemovalChangeRatio: fit.diagnostics.maximumInterceptRemovalChangeRatio,
      maximumDistanceReserveRemovalChangeRatio: fit.diagnostics.maximumReserveRemovalChangeRatio,
    };
    const partialReasons = durationPerformancePartialReasons({
      evidenceCoverage: fitCoverage,
      missingRequirementReason: "critical_speed_missing_duration_band",
      partialSourceReason: "partial_source_evidence",
    });
    criticalSpeed = durationPerformanceOutcomeForCoverage({
      calculationVersion: RUNNING_CRITICAL_SPEED_CALCULATION_VERSION,
      value: {
        metersPerSecond: fit.intercept,
        paceSecondsPerKilometer: pace(fit.intercept),
        model: "speed_meters_per_second_equals_critical_speed_plus_distance_reserve_over_seconds",
        evidenceBasis: resolvedBasis,
        fit: diagnostics,
      },
      points: fitPoints,
      evidenceCoverage: fitCoverage,
      availableConfidence: durationPerformanceFitConfidence(fit),
      partialReasons,
      freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
    });
    distanceReserve = durationPerformanceOutcomeForCoverage({
      calculationVersion: RUNNING_DISTANCE_RESERVE_CALCULATION_VERSION,
      value: {
        meters: fit.reserve,
        name: "gradientpeak_distance_reserve",
        interpretation: "two_parameter_model_distance_term_not_a_direct_physiology_measurement",
        evidenceBasis: resolvedBasis,
        fit: diagnostics,
      },
      points: fitPoints,
      evidenceCoverage: fitCoverage,
      availableConfidence: durationPerformanceFitConfidence(fit),
      partialReasons,
      freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
    });
  }

  const twentyMinute = pointAt(selected, 1_200);
  const thresholdPoints =
    fit.status === "accepted" && twentyMinute
      ? pointsForIds(selected, [
          ...fitPoints.map((point) => point.evidenceId),
          twentyMinute.evidenceId,
        ])
      : fitPoints;
  const thresholdCoverage = buildDurationPerformanceCoverage({
    selected: thresholdPoints,
    eligibleEffortCount: thresholdPoints.length,
    readCoverageState: parsed.effortReadCoverage.state,
    requiredExactDurationsSeconds: [1_200],
    requiredDurationBands: CRITICAL_SPEED_DURATION_BANDS,
    minimumDistinctDurations: RUNNING_DURATION_PERFORMANCE_POLICY.criticalSpeedMinimumPoints,
    minimumDistinctActivities: RUNNING_DURATION_PERFORMANCE_POLICY.criticalSpeedMinimumActivities,
  });
  let planningThresholdPace: RunningOutcome<
    z.infer<typeof runningPlanningThresholdPaceValueSchema>
  >;
  if (fit.status === "unavailable") {
    planningThresholdPace = unavailableDurationPerformanceOutcome({
      calculationVersion: RUNNING_PLANNING_THRESHOLD_PACE_CALCULATION_VERSION,
      reasons: ["planning_threshold_pace_dependency_unavailable"],
      points: fitPoints,
      evidenceCoverage: fitCoverage,
      freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
    });
  } else if (!twentyMinute) {
    planningThresholdPace = unavailableDurationPerformanceOutcome({
      calculationVersion: RUNNING_PLANNING_THRESHOLD_PACE_CALCULATION_VERSION,
      reasons: ["planning_threshold_pace_twenty_minute_evidence_missing"],
      points: fitPoints,
      evidenceCoverage: thresholdCoverage,
      freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
    });
  } else {
    const thresholdSpeed =
      RUNNING_DURATION_PERFORMANCE_POLICY.planningThresholdPaceTwentyMinuteFraction *
      (fit.intercept + fit.reserve / 1_200);
    if (thresholdSpeed <= fit.intercept) {
      planningThresholdPace = unavailableDurationPerformanceOutcome({
        calculationVersion: RUNNING_PLANNING_THRESHOLD_PACE_CALCULATION_VERSION,
        reasons: ["planning_threshold_pace_not_above_critical_speed"],
        points: thresholdPoints,
        evidenceCoverage: thresholdCoverage,
        freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
      });
    } else {
      planningThresholdPace = durationPerformanceOutcomeForCoverage({
        calculationVersion: RUNNING_PLANNING_THRESHOLD_PACE_CALCULATION_VERSION,
        value: {
          speedMetersPerSecond: thresholdSpeed,
          paceSecondsPerKilometer: pace(thresholdSpeed),
          referenceDurationSeconds: 1_200,
          referenceSpeedFraction: 0.95,
          formula: "0.95_times_critical_speed_model_speed_at_1200_seconds",
          interpretation: "gradientpeak_planning_anchor_not_lactate_threshold_or_race_prediction",
          evidenceBasis: resolvedBasis,
        },
        points: thresholdPoints,
        evidenceCoverage: thresholdCoverage,
        availableConfidence: durationPerformanceFitConfidence(fit),
        partialReasons: durationPerformancePartialReasons({
          evidenceCoverage: thresholdCoverage,
          missingRequirementReason: "planning_threshold_pace_twenty_minute_evidence_missing",
          partialSourceReason: "partial_source_evidence",
        }),
        freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
      });
    }
  }

  const oneHour = pointAt(selected, 3_600);
  const durationRetentionPoints = [twentyMinute, oneHour].filter(
    (point): point is CanonicalRunningDurationEffortEvidence => point !== null,
  );
  const durationRetentionCoverage = buildDurationPerformanceCoverage({
    selected: durationRetentionPoints,
    eligibleEffortCount: foundation.eligible.filter(
      (point) => point.durationSeconds === 1_200 || point.durationSeconds === 3_600,
    ).length,
    readCoverageState: parsed.effortReadCoverage.state,
    requiredExactDurationsSeconds: [1_200, 3_600],
    minimumDistinctDurations: 2,
    minimumDistinctActivities: 2,
  });
  const durationRetention =
    twentyMinute && oneHour
      ? durationPerformanceOutcomeForCoverage({
          calculationVersion: RUNNING_DURATION_RETENTION_CALCULATION_VERSION,
          value: {
            speedRetentionRatio: oneHour.value / twentyMinute.value,
            shortReferenceDurationSeconds: 1_200,
            longReferenceDurationSeconds: 3_600,
            shortReferenceSpeedMetersPerSecond: twentyMinute.value,
            longReferenceSpeedMetersPerSecond: oneHour.value,
            formula: "3600_second_speed_over_1200_second_speed",
            interpretation: "cross_duration_retention_not_late_run_fatigue_resistance",
            evidenceBasis: resolvedBasis,
          },
          points: durationRetentionPoints,
          evidenceCoverage: durationRetentionCoverage,
          availableConfidence:
            durationRetentionCoverage.distinctActivityCount >= 3 ? "high" : "medium",
          partialReasons: durationPerformancePartialReasons({
            evidenceCoverage: durationRetentionCoverage,
            missingRequirementReason: "duration_retention_independent_activity_evidence_missing",
            partialSourceReason: "partial_source_evidence",
          }),
          freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
        })
      : unavailableDurationPerformanceOutcome({
          calculationVersion: RUNNING_DURATION_RETENTION_CALCULATION_VERSION,
          reasons: ["duration_retention_evidence_missing"],
          points: durationRetentionPoints,
          evidenceCoverage: durationRetentionCoverage,
          freshnessWindowDays: RUNNING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
        });

  const sixtySecond = pointAt(selected, 60);
  const deferredLevel = (input: {
    levelId: z.infer<typeof runningTrainingLevelIdSchema>;
    points: readonly CanonicalRunningDurationEffortEvidence[];
  }) => {
    const levelCoverage = buildDurationPerformanceCoverage({
      selected: input.points,
      eligibleEffortCount: input.points.length,
      readCoverageState: parsed.effortReadCoverage.state,
      minimumDistinctDurations: 1,
      minimumDistinctActivities: 1,
    });
    return unavailableLevel({
      levelId: input.levelId,
      points: input.points,
      coverage: levelCoverage,
      reason: "advanced_individualized_level_policy_deferred",
    });
  };

  const reservePoints = pointsForIds(selected, [
    ...distanceReserve.sourceEvidenceIds,
    ...(sixtySecond ? [sixtySecond.evidenceId] : []),
  ]);
  const trainingLevels = [
    deferredLevel({
      levelId: "short_duration_pace",
      points: sixtySecond ? [sixtySecond] : [],
    }),
    deferredLevel({
      levelId: "distance_reserve_pace",
      points: reservePoints,
    }),
    deferredLevel({
      levelId: "threshold_pace",
      points: thresholdPoints,
    }),
    deferredLevel({
      levelId: "long_duration_pace",
      points: oneHour ? [oneHour] : [],
    }),
    deferredLevel({
      levelId: "duration_retention_pace",
      points: durationRetentionPoints,
    }),
  ];

  return runningDurationPerformanceModelSchema.parse({
    contractVersion: RUNNING_DURATION_PERFORMANCE_MODEL_VERSION,
    assessmentAsOf: parsed.assessmentAsOf,
    athleteId: parsed.athleteId,
    activityCategory: "run",
    evidenceBasis: resolvedBasis,
    calculationIdentity: identity({ parsed, points: selected, basis: resolvedBasis }),
    evidenceSummary: foundation.evidenceSummary,
    speedPaceCurve: curve,
    parameters: { criticalSpeed, distanceReserve, planningThresholdPace, durationRetention },
    trainingLevels,
  });
}
