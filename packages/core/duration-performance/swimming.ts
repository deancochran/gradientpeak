import { z } from "zod";

import type { CanonicalJson } from "../athlete-intelligence/canonical-json";
import { BEST_EFFORT_CALCULATION_VERSION } from "../calculations/best-efforts";
import { metersPerSecondToSecondsPer100Meters } from "../units";
import {
  type CanonicalSwimmingDurationEffortEvidence,
  canonicalSwimmingDurationEffortEvidenceSchema,
  DURATION_PERFORMANCE_MAX_INPUT_EFFORTS,
  type DurationPerformanceConfidence,
  type DurationPerformanceEvidenceCoverage,
  type DurationPerformanceRecalculationTrigger,
  durationPerformanceCalculationIdentitySchema,
  durationPerformanceConfidenceSchema,
  durationPerformanceEvidenceCoverageSchema,
  durationPerformanceEvidenceSummarySchema,
  durationPerformanceReadCoverageSchema,
  durationPerformanceRecalculationTriggerSchema,
  durationPerformanceSourceEvidenceIdsSchema,
  swimmingEnvironmentSchema,
} from "./contracts";
import {
  buildCanonicalDurationPerformanceCurve,
  buildDurationPerformanceCoverage,
  createDurationPerformanceCalculationIdentity,
  type DurationPerformanceOutcome,
  durationPerformanceCurveConfidence,
  durationPerformanceOutcomeForCoverage,
  durationPerformancePartialReasons,
  durationPerformancePointConfidence,
  durationPerformanceSourceEvidenceIds,
  selectCanonicalDurationEvidence,
  unavailableDurationPerformanceOutcome,
} from "./foundation";

export const SWIMMING_DURATION_PERFORMANCE_INPUT_VERSION = "swimming-duration-performance-input-v1";
export const SWIMMING_DURATION_PERFORMANCE_MODEL_VERSION = "swimming-duration-performance-v1";
export const SWIMMING_PERFORMANCE_EVIDENCE_POLICY_VERSION =
  "swimming-duration-performance-evidence-v1";
export const SWIMMING_PACE_DURATION_CURVE_CALCULATION_VERSION = "swimming-pace-duration-curve-v1";
export const SWIMMING_SPRINT_CAPABILITY_CALCULATION_VERSION = "swimming-sprint-capability-v1";
export const SWIMMING_AEROBIC_CAPABILITY_CALCULATION_VERSION = "swimming-aerobic-capability-v1";
export const SWIMMING_REPEATED_EFFORT_DECAY_CALCULATION_VERSION =
  "swimming-repeated-effort-decay-v1";
export const SWIMMING_TRAINING_LEVELS_VERSION = "swimming-individualized-levels-v1";
export const SWIMMING_REPEAT_PROTOCOL_EVIDENCE_VERSION = "qualified-swim-repeat-protocol-v1";

export const SWIMMING_DURATION_PERFORMANCE_POLICY = Object.freeze({
  freshnessWindowDays: 90,
  poolCurveRequiredDurationsSeconds: Object.freeze([30, 60, 120, 300, 600, 1_200, 1_800]),
  openWaterCurveRequiredDurationsSeconds: Object.freeze([600, 1_200, 1_800, 3_600]),
  poolSprintRequiredDurationsSeconds: Object.freeze([30, 60]),
  poolAerobicRequiredDurationSeconds: 1_800,
  openWaterAerobicRequiredDurationsSeconds: Object.freeze([600, 1_200, 1_800]),
  openWaterAerobicMinimumActivities: 2,
  repeatedEffortMinimumRepetitions: 3,
});

const opaqueIdSchema = z.string().trim().min(1).max(256);
const dateTimeSchema = z.string().datetime();
const calculationVersionSchema = z.string().regex(/^[a-z][a-z0-9-]*-v[0-9]+$/);

const swimProtocolIdentityShape = {
  observationId: opaqueIdSchema,
  evidenceId: opaqueIdSchema,
  evidenceRevision: z.number().int().positive().max(1_000_000),
  athleteId: opaqueIdSchema,
  activityId: opaqueIdSchema,
  recordedAt: dateTimeSchema,
  environment: swimmingEnvironmentSchema,
  poolLengthMeters: z.number().finite().min(10).max(100).nullable(),
};

const repeatedSwimEffortSchema = z
  .object({
    repetitionNumber: z.number().int().positive().max(50),
    segmentId: opaqueIdSchema,
    activeDurationSeconds: z.number().finite().positive().max(14_400),
    timingCoverage: z.literal("complete"),
  })
  .strict();

const repeatedSwimRecoverySchema = z
  .object({
    afterRepetitionNumber: z.number().int().positive().max(49),
    durationSeconds: z.number().finite().positive().max(3_600),
    timingCoverage: z.literal("complete"),
  })
  .strict();

export const canonicalSwimRepeatedEffortProtocolEvidenceSchema = z
  .object({
    ...swimProtocolIdentityShape,
    protocol: z.literal("fixed_distance_maximal_repeats"),
    intent: z.literal("maximal_repeatability"),
    distanceMetersPerRepetition: z.number().finite().positive().max(10_000),
    distanceUnit: z.literal("meters"),
    calculationVersion: z.literal(SWIMMING_REPEAT_PROTOCOL_EVIDENCE_VERSION),
    repetitions: z.array(repeatedSwimEffortSchema).min(3).max(50),
    recoveries: z.array(repeatedSwimRecoverySchema).min(2).max(49),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.environment === "pool" && evidence.poolLengthMeters === null) {
      context.addIssue({
        code: "custom",
        path: ["poolLengthMeters"],
        message: "Pool repeat evidence requires pool-length identity",
      });
    }
    if (evidence.environment === "open_water" && evidence.poolLengthMeters !== null) {
      context.addIssue({
        code: "custom",
        path: ["poolLengthMeters"],
        message: "Open-water repeat evidence cannot claim a pool length",
      });
    }
    if (evidence.recoveries.length !== evidence.repetitions.length - 1) {
      context.addIssue({
        code: "custom",
        path: ["recoveries"],
        message: "Every adjacent repeated effort requires exact recovery timing",
      });
    }
    evidence.repetitions.forEach((repetition, index) => {
      if (repetition.repetitionNumber !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["repetitions", index, "repetitionNumber"],
          message: "Repeated efforts must retain contiguous protocol order",
        });
      }
    });
    evidence.recoveries.forEach((recovery, index) => {
      if (recovery.afterRepetitionNumber !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["recoveries", index, "afterRepetitionNumber"],
          message: "Recovery timing must identify its preceding repetition",
        });
      }
    });
  });

export const swimmingDurationPerformanceInputSchema = z
  .object({
    contractVersion: z.literal(SWIMMING_DURATION_PERFORMANCE_INPUT_VERSION),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    evidenceReadCoverage: durationPerformanceReadCoverageSchema,
    efforts: z
      .array(canonicalSwimmingDurationEffortEvidenceSchema)
      .max(DURATION_PERFORMANCE_MAX_INPUT_EFFORTS),
    repeatedEffortProtocols: z.array(canonicalSwimRepeatedEffortProtocolEvidenceSchema).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    const evidenceIds = new Set<string>();
    const observationIds = new Set<string>();
    const allEvidence = [...input.efforts, ...input.repeatedEffortProtocols];
    allEvidence.forEach((evidence, index) => {
      if (evidence.athleteId !== input.athleteId) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index, "athleteId"],
          message: "Every swimming observation must belong to the assessed athlete",
        });
      }
      if (evidenceIds.has(evidence.evidenceId) || observationIds.has(evidence.observationId)) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index],
          message: "Swimming evidence and observation identities must be unique",
        });
      }
      evidenceIds.add(evidence.evidenceId);
      observationIds.add(evidence.observationId);
    });
  });

export const swimmingPerformanceReasonSchema = z.enum([
  "evidence_read_truncated",
  "no_eligible_evidence",
  "mixed_pool_open_water_evidence",
  "non_monotonic_canonical_curve",
  "missing_curve_anchors",
  "partial_source_evidence",
  "sprint_pool_timing_evidence_missing",
  "sprint_not_supported_for_open_water_timing",
  "aerobic_duration_evidence_missing",
  "aerobic_insufficient_independent_activities",
  "repeated_effort_protocol_evidence_missing",
  "repeated_effort_decay_not_supported_for_open_water",
  "repeated_effort_first_bout_not_maximal",
  "training_level_capability_unavailable",
]);

const outcomeMetadataShape = {
  calculationVersion: calculationVersionSchema,
  sourceEvidenceIds: durationPerformanceSourceEvidenceIdsSchema,
  evidenceCoverage: durationPerformanceEvidenceCoverageSchema,
  confidence: durationPerformanceConfidenceSchema,
  expiresAt: dateTimeSchema.nullable(),
  recalculationTriggers: z.array(durationPerformanceRecalculationTriggerSchema).min(1).max(4),
};

function swimmingOutcomeSchema<T extends z.ZodType>(valueSchema: T) {
  return z
    .discriminatedUnion("status", [
      z
        .object({
          status: z.literal("available"),
          value: valueSchema,
          reasons: z.array(swimmingPerformanceReasonSchema).max(0),
          ...outcomeMetadataShape,
        })
        .strict(),
      z
        .object({
          status: z.literal("partial"),
          value: valueSchema,
          reasons: z.array(swimmingPerformanceReasonSchema).min(1),
          ...outcomeMetadataShape,
        })
        .strict(),
      z
        .object({
          status: z.literal("unavailable"),
          value: z.null(),
          reasons: z.array(swimmingPerformanceReasonSchema).min(1),
          ...outcomeMetadataShape,
        })
        .strict(),
    ])
    .superRefine((outcome, context) => {
      if (outcome.status === "available" && outcome.evidenceCoverage.state !== "complete") {
        context.addIssue({
          code: "custom",
          message: "Available swim outcomes require complete evidence",
        });
      }
      if (outcome.status === "partial" && outcome.evidenceCoverage.state !== "partial") {
        context.addIssue({
          code: "custom",
          message: "Partial swim outcomes require partial evidence",
        });
      }
      if (outcome.status === "unavailable" && outcome.confidence !== "unavailable") {
        context.addIssue({
          code: "custom",
          path: ["confidence"],
          message: "Unavailable swim outcomes cannot claim confidence",
        });
      }
    });
}

const swimCurvePointSchema = z
  .object({
    observationId: opaqueIdSchema,
    sourceEvidenceId: opaqueIdSchema,
    evidenceRevision: z.number().int().positive(),
    activityId: opaqueIdSchema,
    segmentId: opaqueIdSchema,
    recordedAt: dateTimeSchema,
    durationSeconds: z.number().int().min(5).max(14_400),
    speedMetersPerSecond: z.number().finite().positive().max(3),
    paceSecondsPer100Meters: z.number().finite().positive(),
    environment: swimmingEnvironmentSchema,
    timingBasis: z.enum(["pool_length_timing", "open_water_continuous_timing"]),
    sourceExtractionStatus: z.enum(["available", "partial"]),
    sourceCalculationVersion: z.literal(BEST_EFFORT_CALCULATION_VERSION),
  })
  .strict();

const swimCurveValueSchema = z
  .object({
    environment: swimmingEnvironmentSchema,
    points: z.array(swimCurvePointSchema).min(1).max(2_000),
    selectionPolicy: z.literal("strongest_per_exact_duration_then_newest_then_evidence_id"),
    monotonicityPolicy: z.literal("abstain_without_repair_on_increasing_speed_with_duration"),
  })
  .strict();

const sprintCapacityValueSchema = z
  .object({
    environment: z.literal("pool"),
    thirtySecondSpeedMetersPerSecond: z.number().finite().positive(),
    sixtySecondSpeedMetersPerSecond: z.number().finite().positive(),
    thirtySecondPaceSecondsPer100Meters: z.number().finite().positive(),
    sixtySecondPaceSecondsPer100Meters: z.number().finite().positive(),
    interpretation: z.literal("pool_timed_short_duration_capacity_not_instantaneous_speed"),
  })
  .strict();

const aerobicCapacityValueSchema = z.discriminatedUnion("basis", [
  z
    .object({
      basis: z.literal("pool_duration_curve"),
      environment: z.literal("pool"),
      longDurationSpeedMetersPerSecond: z.number().finite().positive(),
      longDurationSeconds: z.literal(1_800),
    })
    .strict(),
  z
    .object({
      basis: z.literal("open_water_duration_curve"),
      environment: z.literal("open_water"),
      speedsByDuration: z
        .array(
          z
            .object({
              durationSeconds: z.number().int().positive(),
              speedMetersPerSecond: z.number().positive(),
            })
            .strict(),
        )
        .length(3),
    })
    .strict(),
]);

const repeatedEffortDecayValueSchema = z
  .object({
    environment: z.literal("pool"),
    sourceActivityId: opaqueIdSchema,
    distanceMetersPerRepetition: z.number().finite().positive(),
    repetitionCount: z.number().int().min(3),
    recoveryDurationsSeconds: z.array(z.number().finite().positive()).min(2),
    firstSpeedMetersPerSecond: z.number().finite().positive(),
    finalSpeedMetersPerSecond: z.number().finite().positive(),
    finalSpeedRetentionRatio: z.number().finite().min(0).max(1),
    maximumSpeedLossRatio: z.number().finite().min(0).max(1),
    interpretation: z.literal("fixed_distance_protocol_decay_not_general_recovery_capacity"),
  })
  .strict();

export const swimmingTrainingLevelIdSchema = z.enum([
  "sprint_pace",
  "aerobic_pace",
  "repeated_effort_pace",
]);

const swimLevelPrescriptionSchema = z
  .object({
    paceSecondsPer100Meters: z
      .object({ fastest: z.number().finite().positive(), slowest: z.number().finite().positive() })
      .strict(),
    workDurationSeconds: z
      .object({ minimum: z.number().finite().positive(), maximum: z.number().finite().positive() })
      .strict(),
    repetitions: z
      .object({ minimum: z.number().int().positive(), maximum: z.number().int().positive() })
      .strict(),
    recoveryDurationSeconds: z
      .object({ minimum: z.number().finite().positive(), maximum: z.number().finite().positive() })
      .strict()
      .nullable(),
    environment: swimmingEnvironmentSchema,
  })
  .strict();

const swimmingTrainingLevelSchema = z
  .discriminatedUnion("status", [
    z
      .object({
        status: z.literal("available"),
        levelId: swimmingTrainingLevelIdSchema,
        prescription: swimLevelPrescriptionSchema,
        reasons: z.array(swimmingPerformanceReasonSchema).max(0),
        ...outcomeMetadataShape,
      })
      .strict(),
    z
      .object({
        status: z.literal("unavailable"),
        levelId: swimmingTrainingLevelIdSchema,
        prescription: z.null(),
        reasons: z.array(swimmingPerformanceReasonSchema).min(1),
        ...outcomeMetadataShape,
      })
      .strict(),
  ])
  .superRefine((level, context) => {
    if (level.status === "available" && level.evidenceCoverage.state !== "complete") {
      context.addIssue({
        code: "custom",
        message: "Available swim levels require complete evidence",
      });
    }
    if (level.status === "unavailable" && level.confidence !== "unavailable") {
      context.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "Unavailable swim levels cannot claim confidence",
      });
    }
  });

const swimmingEvidenceSummarySchema = z
  .object({
    durationEfforts: durationPerformanceEvidenceSummarySchema,
    selectedRepeatedProtocolEvidenceIds: durationPerformanceSourceEvidenceIdsSchema,
  })
  .strict();

export const swimmingDurationPerformanceModelSchema = z
  .object({
    contractVersion: z.literal(SWIMMING_DURATION_PERFORMANCE_MODEL_VERSION),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    activityCategory: z.literal("swim"),
    environment: z.enum(["pool", "open_water", "mixed", "unresolved"]),
    calculationIdentity: durationPerformanceCalculationIdentitySchema,
    evidenceSummary: swimmingEvidenceSummarySchema,
    paceDurationCurve: swimmingOutcomeSchema(swimCurveValueSchema),
    capabilities: z
      .object({
        sprint: swimmingOutcomeSchema(sprintCapacityValueSchema),
        aerobic: swimmingOutcomeSchema(aerobicCapacityValueSchema),
        repeatedEffortDecay: swimmingOutcomeSchema(repeatedEffortDecayValueSchema),
      })
      .strict(),
    trainingLevels: z.array(swimmingTrainingLevelSchema).length(3),
  })
  .strict();

export type CanonicalSwimRepeatedEffortProtocolEvidence = z.infer<
  typeof canonicalSwimRepeatedEffortProtocolEvidenceSchema
>;
export type SwimmingDurationPerformanceInput = z.infer<
  typeof swimmingDurationPerformanceInputSchema
>;
export type SwimmingPerformanceReason = z.infer<typeof swimmingPerformanceReasonSchema>;
export type SwimmingDurationPerformanceModel = z.infer<
  typeof swimmingDurationPerformanceModelSchema
>;
type SwimmingOutcome<T> = DurationPerformanceOutcome<T, SwimmingPerformanceReason>;
type AerobicCapacityValue = z.infer<typeof aerobicCapacityValueSchema>;
type RepeatedEffortDecayValue = z.infer<typeof repeatedEffortDecayValueSchema>;

const RECALCULATION_TRIGGERS = [
  "new_canonical_best_effort",
  "source_evidence_corrected",
  "source_evidence_expired",
  "calculation_policy_changed",
] satisfies readonly DurationPerformanceRecalculationTrigger[];

interface ProtocolIdentity {
  observationId: string;
  evidenceId: string;
  evidenceRevision: number;
  athleteId: string;
  activityId: string;
  recordedAt: string;
  environment: "pool" | "open_water";
  calculationVersion: string;
}

function protocolIsFresh(protocol: ProtocolIdentity, assessmentAsOf: string): boolean {
  const observedAt = Date.parse(protocol.recordedAt);
  const asOf = Date.parse(assessmentAsOf);
  return (
    observedAt <= asOf &&
    observedAt >= asOf - SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays * 86_400_000
  );
}

function newestProtocol<T extends ProtocolIdentity>(protocols: readonly T[]): T | null {
  return (
    [...protocols].sort((left, right) => {
      const timeDifference = Date.parse(right.recordedAt) - Date.parse(left.recordedAt);
      return timeDifference !== 0
        ? timeDifference
        : left.evidenceId.localeCompare(right.evidenceId);
    })[0] ?? null
  );
}

function protocolCoverage(input: {
  available: boolean;
  pointCount: number;
  activityCount: number;
  observedDurationsSeconds: number[];
  readCoverageState: "complete" | "truncated";
}): DurationPerformanceEvidenceCoverage {
  return durationPerformanceEvidenceCoverageSchema.parse({
    state: input.available ? "complete" : "insufficient",
    readCoverageState: input.readCoverageState,
    requiredExactDurationsSeconds: [],
    requiredDurationBands: [],
    minimumDistinctDurations: input.available ? 1 : 0,
    minimumDistinctActivities: input.available ? 1 : 0,
    observedDurationsSeconds: [...new Set(input.observedDurationsSeconds)].sort((a, b) => a - b),
    eligibleEffortCount: input.pointCount,
    selectedPointCount: input.pointCount,
    distinctActivityCount: input.activityCount,
    completeSourcePointCount: input.pointCount,
    partialSourcePointCount: 0,
  });
}

function protocolExpiry(protocol: ProtocolIdentity | null): string | null {
  return protocol
    ? new Date(
        Date.parse(protocol.recordedAt) +
          SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays * 86_400_000,
      ).toISOString()
    : null;
}

function protocolAvailable<T>(input: {
  calculationVersion: string;
  value: T;
  protocol: ProtocolIdentity;
  coverage: DurationPerformanceEvidenceCoverage;
  confidence: Exclude<DurationPerformanceConfidence, "unavailable">;
}): SwimmingOutcome<T> {
  return {
    status: "available",
    value: input.value,
    reasons: [],
    calculationVersion: input.calculationVersion,
    sourceEvidenceIds: [input.protocol.evidenceId],
    evidenceCoverage: input.coverage,
    confidence: input.confidence,
    expiresAt: protocolExpiry(input.protocol),
    recalculationTriggers: [...RECALCULATION_TRIGGERS],
  };
}

function protocolUnavailable<T = never>(input: {
  calculationVersion: string;
  reason: SwimmingPerformanceReason;
  protocol: ProtocolIdentity | null;
  coverage: DurationPerformanceEvidenceCoverage;
}): SwimmingOutcome<T> {
  return {
    status: "unavailable",
    value: null,
    reasons: [input.reason],
    calculationVersion: input.calculationVersion,
    sourceEvidenceIds: input.protocol ? [input.protocol.evidenceId] : [],
    evidenceCoverage: input.coverage,
    confidence: "unavailable",
    expiresAt: protocolExpiry(input.protocol),
    recalculationTriggers: [...RECALCULATION_TRIGGERS],
  };
}

function sourceEnvironment(input: {
  efforts: readonly CanonicalSwimmingDurationEffortEvidence[];
  repeatProtocols: readonly CanonicalSwimRepeatedEffortProtocolEvidence[];
}) {
  const environments = new Set([
    ...input.efforts.map((effort) => effort.evidenceContext.environment),
    ...input.repeatProtocols.map((protocol) => protocol.environment),
  ]);
  if (environments.size > 1) return "mixed";
  return (
    input.efforts[0]?.evidenceContext.environment ??
    input.repeatProtocols[0]?.environment ??
    "unresolved"
  );
}

function swimProtocolIdentityFacts(
  protocol: CanonicalSwimRepeatedEffortProtocolEvidence,
): CanonicalJson {
  return {
    activityId: protocol.activityId,
    recordedAt: protocol.recordedAt,
    environment: protocol.environment,
    poolLengthMeters: protocol.poolLengthMeters,
    protocol: protocol.protocol,
    distanceMetersPerRepetition: protocol.distanceMetersPerRepetition,
    repetitions: protocol.repetitions,
    recoveries: protocol.recoveries,
  };
}

function modelIdentity(input: {
  parsed: SwimmingDurationPerformanceInput;
  efforts: readonly CanonicalSwimmingDurationEffortEvidence[];
  repeat: CanonicalSwimRepeatedEffortProtocolEvidence | null;
  environment: "pool" | "open_water" | "mixed" | "unresolved";
}) {
  const protocolEvidence = input.repeat === null ? [] : [input.repeat];
  return createDurationPerformanceCalculationIdentity({
    modelVersion: SWIMMING_DURATION_PERFORMANCE_MODEL_VERSION,
    inputContractVersion: SWIMMING_DURATION_PERFORMANCE_INPUT_VERSION,
    evidencePolicyVersion: SWIMMING_PERFORMANCE_EVIDENCE_POLICY_VERSION,
    assessmentAsOf: input.parsed.assessmentAsOf,
    athleteId: input.parsed.athleteId,
    activityCategory: "swim",
    modelVariant: `swimming_${input.environment}`,
    sourceCalculationVersions: [
      BEST_EFFORT_CALCULATION_VERSION,
      SWIMMING_REPEAT_PROTOCOL_EVIDENCE_VERSION,
    ],
    evidence: [
      ...input.efforts.map((effort) => ({
        evidenceId: effort.evidenceId,
        observationId: effort.observationId,
        evidenceRevision: effort.evidenceRevision,
        sourceCalculationVersion: effort.calculationVersion,
        facts: {
          activityId: effort.activityId,
          segmentId: effort.segmentId,
          recordedAt: effort.recordedAt,
          durationSeconds: effort.durationSeconds,
          value: effort.value,
          environment: effort.evidenceContext.environment,
          timingBasis: effort.evidenceContext.timingBasis,
        },
      })),
      ...protocolEvidence.map((protocol) => ({
        evidenceId: protocol.evidenceId,
        observationId: protocol.observationId,
        evidenceRevision: protocol.evidenceRevision,
        sourceCalculationVersion: protocol.calculationVersion,
        facts: swimProtocolIdentityFacts(protocol),
      })),
    ],
  });
}

/** Uses only qualified duration and explicit protocol evidence; no raw effort is extracted here. */
export function calculateSwimmingDurationPerformance(
  input: SwimmingDurationPerformanceInput,
): SwimmingDurationPerformanceModel {
  const parsed = swimmingDurationPerformanceInputSchema.parse(input);
  const temporalSelection = selectCanonicalDurationEvidence({
    efforts: parsed.efforts,
    assessmentAsOf: parsed.assessmentAsOf,
    freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
  });
  const freshRepeats = parsed.repeatedEffortProtocols.filter((protocol) =>
    protocolIsFresh(protocol, parsed.assessmentAsOf),
  );
  const environment = sourceEnvironment({
    efforts: temporalSelection.eligible,
    repeatProtocols: freshRepeats,
  });
  const requiredDurations =
    environment === "pool"
      ? SWIMMING_DURATION_PERFORMANCE_POLICY.poolCurveRequiredDurationsSeconds
      : environment === "open_water"
        ? SWIMMING_DURATION_PERFORMANCE_POLICY.openWaterCurveRequiredDurationsSeconds
        : [];
  const foundation = buildCanonicalDurationPerformanceCurve({
    efforts: parsed.efforts,
    assessmentAsOf: parsed.assessmentAsOf,
    readCoverage: parsed.evidenceReadCoverage,
    requiredExactDurationsSeconds: requiredDurations,
    freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
  });
  const selectedRepeat = newestProtocol(freshRepeats);
  const hasEligibleEvidence = temporalSelection.eligible.length + freshRepeats.length > 0;

  const globalReason =
    parsed.evidenceReadCoverage.state === "truncated"
      ? "evidence_read_truncated"
      : environment === "mixed"
        ? "mixed_pool_open_water_evidence"
        : !hasEligibleEvidence
          ? "no_eligible_evidence"
          : null;
  if (globalReason) {
    const unavailable = (calculationVersion: string) =>
      unavailableDurationPerformanceOutcome({
        calculationVersion,
        reasons: [globalReason],
        points: foundation.selected,
        evidenceCoverage: foundation.evidenceCoverage,
        freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
      });
    const levels = ["sprint_pace", "aerobic_pace", "repeated_effort_pace"].map((levelId) => ({
      status: "unavailable",
      levelId,
      prescription: null,
      reasons: [globalReason],
      calculationVersion: SWIMMING_TRAINING_LEVELS_VERSION,
      sourceEvidenceIds: durationPerformanceSourceEvidenceIds(foundation.selected),
      evidenceCoverage: foundation.evidenceCoverage,
      confidence: "unavailable",
      expiresAt: foundation.expiresAt,
      recalculationTriggers: [...RECALCULATION_TRIGGERS],
    }));
    return swimmingDurationPerformanceModelSchema.parse({
      contractVersion: SWIMMING_DURATION_PERFORMANCE_MODEL_VERSION,
      assessmentAsOf: parsed.assessmentAsOf,
      athleteId: parsed.athleteId,
      activityCategory: "swim",
      environment,
      calculationIdentity: modelIdentity({
        parsed,
        efforts: environment === "mixed" ? temporalSelection.eligible : foundation.selected,
        repeat: selectedRepeat,
        environment,
      }),
      evidenceSummary: {
        durationEfforts: foundation.evidenceSummary,
        selectedRepeatedProtocolEvidenceIds: selectedRepeat ? [selectedRepeat.evidenceId] : [],
      },
      paceDurationCurve: unavailable(SWIMMING_PACE_DURATION_CURVE_CALCULATION_VERSION),
      capabilities: {
        sprint: unavailable(SWIMMING_SPRINT_CAPABILITY_CALCULATION_VERSION),
        aerobic: unavailable(SWIMMING_AEROBIC_CAPABILITY_CALCULATION_VERSION),
        repeatedEffortDecay: unavailable(SWIMMING_REPEATED_EFFORT_DECAY_CALCULATION_VERSION),
      },
      trainingLevels: levels,
    });
  }

  const selected = foundation.selected;
  const curveHasMonotonicityConflict = foundation.reasons.includes("non_monotonic_canonical_curve");
  const curveValue = {
    environment,
    points: selected.map((point) => ({
      observationId: point.observationId,
      sourceEvidenceId: point.evidenceId,
      evidenceRevision: point.evidenceRevision,
      activityId: point.activityId,
      segmentId: point.segmentId,
      recordedAt: point.recordedAt,
      durationSeconds: point.durationSeconds,
      speedMetersPerSecond: point.value,
      paceSecondsPer100Meters: metersPerSecondToSecondsPer100Meters(point.value),
      environment: point.evidenceContext.environment,
      timingBasis: point.evidenceContext.timingBasis,
      sourceExtractionStatus: point.provenance.extractionStatus,
      sourceCalculationVersion: point.calculationVersion,
    })),
    selectionPolicy: "strongest_per_exact_duration_then_newest_then_evidence_id",
    monotonicityPolicy: "abstain_without_repair_on_increasing_speed_with_duration",
  };
  const curve =
    foundation.status === "unavailable"
      ? unavailableDurationPerformanceOutcome({
          calculationVersion: SWIMMING_PACE_DURATION_CURVE_CALCULATION_VERSION,
          reasons: [
            foundation.reasons[0] === "non_monotonic_canonical_curve"
              ? "non_monotonic_canonical_curve"
              : "no_eligible_evidence",
          ],
          points: selected,
          evidenceCoverage: foundation.evidenceCoverage,
          freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
        })
      : durationPerformanceOutcomeForCoverage({
          calculationVersion: SWIMMING_PACE_DURATION_CURVE_CALCULATION_VERSION,
          value: curveValue,
          points: selected,
          evidenceCoverage: foundation.evidenceCoverage,
          availableConfidence: durationPerformanceCurveConfidence(selected),
          partialReasons: durationPerformancePartialReasons({
            evidenceCoverage: foundation.evidenceCoverage,
            missingRequirementReason: "missing_curve_anchors",
            partialSourceReason: "partial_source_evidence",
          }),
          freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
        });

  const thirtySecond = selected.find((point) => point.durationSeconds === 30) ?? null;
  const sixtySecond = selected.find((point) => point.durationSeconds === 60) ?? null;
  const sprintPoints = [thirtySecond, sixtySecond].filter(
    (point): point is CanonicalSwimmingDurationEffortEvidence => point !== null,
  );
  const sprintCoverage = buildDurationPerformanceCoverage({
    selected: sprintPoints,
    eligibleEffortCount: sprintPoints.length,
    readCoverageState: parsed.evidenceReadCoverage.state,
    requiredExactDurationsSeconds:
      SWIMMING_DURATION_PERFORMANCE_POLICY.poolSprintRequiredDurationsSeconds,
    minimumDistinctDurations: 2,
    minimumDistinctActivities: 1,
  });
  const sprint = curveHasMonotonicityConflict
    ? unavailableDurationPerformanceOutcome({
        calculationVersion: SWIMMING_SPRINT_CAPABILITY_CALCULATION_VERSION,
        reasons: ["non_monotonic_canonical_curve"],
        points: sprintPoints,
        evidenceCoverage: sprintCoverage,
        freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
      })
    : environment === "open_water"
      ? unavailableDurationPerformanceOutcome({
          calculationVersion: SWIMMING_SPRINT_CAPABILITY_CALCULATION_VERSION,
          reasons: ["sprint_not_supported_for_open_water_timing"],
          points: sprintPoints,
          evidenceCoverage: sprintCoverage,
          freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
        })
      : thirtySecond && sixtySecond
        ? durationPerformanceOutcomeForCoverage({
            calculationVersion: SWIMMING_SPRINT_CAPABILITY_CALCULATION_VERSION,
            value: {
              environment: "pool",
              thirtySecondSpeedMetersPerSecond: thirtySecond.value,
              sixtySecondSpeedMetersPerSecond: sixtySecond.value,
              thirtySecondPaceSecondsPer100Meters: metersPerSecondToSecondsPer100Meters(
                thirtySecond.value,
              ),
              sixtySecondPaceSecondsPer100Meters: metersPerSecondToSecondsPer100Meters(
                sixtySecond.value,
              ),
              interpretation: "pool_timed_short_duration_capacity_not_instantaneous_speed",
            },
            points: sprintPoints,
            evidenceCoverage: sprintCoverage,
            availableConfidence: durationPerformanceCurveConfidence(sprintPoints),
            partialReasons: ["partial_source_evidence"],
            freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
          })
        : unavailableDurationPerformanceOutcome({
            calculationVersion: SWIMMING_SPRINT_CAPABILITY_CALCULATION_VERSION,
            reasons: ["sprint_pool_timing_evidence_missing"],
            points: sprintPoints,
            evidenceCoverage: sprintCoverage,
            freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
          });

  const aerobicDurations =
    environment === "pool"
      ? [SWIMMING_DURATION_PERFORMANCE_POLICY.poolAerobicRequiredDurationSeconds]
      : SWIMMING_DURATION_PERFORMANCE_POLICY.openWaterAerobicRequiredDurationsSeconds;
  const aerobicPoints = selected.filter((point) =>
    aerobicDurations.includes(point.durationSeconds),
  );
  const aerobicCoverage = buildDurationPerformanceCoverage({
    selected: aerobicPoints,
    eligibleEffortCount: aerobicPoints.length,
    readCoverageState: parsed.evidenceReadCoverage.state,
    requiredExactDurationsSeconds: aerobicDurations,
    minimumDistinctDurations: aerobicDurations.length,
    minimumDistinctActivities:
      environment === "open_water"
        ? SWIMMING_DURATION_PERFORMANCE_POLICY.openWaterAerobicMinimumActivities
        : 1,
  });
  let aerobic: SwimmingOutcome<AerobicCapacityValue>;
  if (environment === "pool") {
    const longPoint = aerobicPoints[0];
    if (curveHasMonotonicityConflict) {
      aerobic = unavailableDurationPerformanceOutcome({
        calculationVersion: SWIMMING_AEROBIC_CAPABILITY_CALCULATION_VERSION,
        reasons: ["non_monotonic_canonical_curve"],
        points: aerobicPoints,
        evidenceCoverage: aerobicCoverage,
        freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
      });
    } else if (longPoint && aerobicCoverage.state === "complete") {
      const value: AerobicCapacityValue = {
        basis: "pool_duration_curve",
        environment: "pool",
        longDurationSpeedMetersPerSecond: longPoint.value,
        longDurationSeconds: 1_800,
      };
      const durationOutcome = durationPerformanceOutcomeForCoverage({
        calculationVersion: SWIMMING_AEROBIC_CAPABILITY_CALCULATION_VERSION,
        value,
        points: aerobicPoints,
        evidenceCoverage: aerobicCoverage,
        availableConfidence: durationPerformancePointConfidence({
          eligible: foundation.eligible,
          durationSeconds: 1_800,
        }),
        partialReasons: ["partial_source_evidence"],
        freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
      });
      aerobic = durationOutcome;
    } else {
      aerobic = unavailableDurationPerformanceOutcome({
        calculationVersion: SWIMMING_AEROBIC_CAPABILITY_CALCULATION_VERSION,
        reasons: ["aerobic_duration_evidence_missing"],
        points: aerobicPoints,
        evidenceCoverage: aerobicCoverage,
        freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
      });
    }
  } else {
    const reason =
      aerobicCoverage.distinctActivityCount <
      SWIMMING_DURATION_PERFORMANCE_POLICY.openWaterAerobicMinimumActivities
        ? "aerobic_insufficient_independent_activities"
        : "aerobic_duration_evidence_missing";
    if (curveHasMonotonicityConflict) {
      aerobic = unavailableDurationPerformanceOutcome({
        calculationVersion: SWIMMING_AEROBIC_CAPABILITY_CALCULATION_VERSION,
        reasons: ["non_monotonic_canonical_curve"],
        points: aerobicPoints,
        evidenceCoverage: aerobicCoverage,
        freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
      });
    } else if (aerobicCoverage.state === "complete") {
      const value: AerobicCapacityValue = {
        basis: "open_water_duration_curve",
        environment: "open_water",
        speedsByDuration: aerobicPoints.map((point) => ({
          durationSeconds: point.durationSeconds,
          speedMetersPerSecond: point.value,
        })),
      };
      aerobic = durationPerformanceOutcomeForCoverage({
        calculationVersion: SWIMMING_AEROBIC_CAPABILITY_CALCULATION_VERSION,
        value,
        points: aerobicPoints,
        evidenceCoverage: aerobicCoverage,
        availableConfidence: durationPerformanceCurveConfidence(aerobicPoints),
        partialReasons: ["partial_source_evidence"],
        freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
      });
    } else {
      aerobic = unavailableDurationPerformanceOutcome({
        calculationVersion: SWIMMING_AEROBIC_CAPABILITY_CALCULATION_VERSION,
        reasons: [reason],
        points: aerobicPoints,
        evidenceCoverage: aerobicCoverage,
        freshnessWindowDays: SWIMMING_DURATION_PERFORMANCE_POLICY.freshnessWindowDays,
      });
    }
  }

  const repeatCoverage = protocolCoverage({
    available: environment === "pool" && selectedRepeat !== null,
    pointCount: selectedRepeat?.repetitions.length ?? 0,
    activityCount: selectedRepeat ? 1 : 0,
    observedDurationsSeconds:
      selectedRepeat?.repetitions.map((repetition) => repetition.activeDurationSeconds) ?? [],
    readCoverageState: parsed.evidenceReadCoverage.state,
  });
  let repeatedEffortDecay: SwimmingOutcome<RepeatedEffortDecayValue>;
  if (environment === "open_water") {
    repeatedEffortDecay = protocolUnavailable({
      calculationVersion: SWIMMING_REPEATED_EFFORT_DECAY_CALCULATION_VERSION,
      reason: "repeated_effort_decay_not_supported_for_open_water",
      protocol: selectedRepeat,
      coverage: repeatCoverage,
    });
  } else if (!selectedRepeat) {
    repeatedEffortDecay = protocolUnavailable({
      calculationVersion: SWIMMING_REPEATED_EFFORT_DECAY_CALCULATION_VERSION,
      reason: "repeated_effort_protocol_evidence_missing",
      protocol: null,
      coverage: repeatCoverage,
    });
  } else {
    const speeds = selectedRepeat.repetitions.map(
      (repetition) => selectedRepeat.distanceMetersPerRepetition / repetition.activeDurationSeconds,
    );
    const firstSpeed = speeds[0];
    const finalSpeed = speeds.at(-1);
    const firstIsMaximal = firstSpeed !== undefined && speeds.every((speed) => speed <= firstSpeed);
    if (!firstSpeed || !finalSpeed || !firstIsMaximal) {
      repeatedEffortDecay = protocolUnavailable({
        calculationVersion: SWIMMING_REPEATED_EFFORT_DECAY_CALCULATION_VERSION,
        reason: "repeated_effort_first_bout_not_maximal",
        protocol: selectedRepeat,
        coverage: repeatCoverage,
      });
    } else {
      const value: RepeatedEffortDecayValue = {
        environment: "pool",
        sourceActivityId: selectedRepeat.activityId,
        distanceMetersPerRepetition: selectedRepeat.distanceMetersPerRepetition,
        repetitionCount: selectedRepeat.repetitions.length,
        recoveryDurationsSeconds: selectedRepeat.recoveries.map(
          (recovery) => recovery.durationSeconds,
        ),
        firstSpeedMetersPerSecond: firstSpeed,
        finalSpeedMetersPerSecond: finalSpeed,
        finalSpeedRetentionRatio: finalSpeed / firstSpeed,
        maximumSpeedLossRatio: 1 - Math.min(...speeds) / firstSpeed,
        interpretation: "fixed_distance_protocol_decay_not_general_recovery_capacity",
      };
      repeatedEffortDecay = protocolAvailable({
        calculationVersion: SWIMMING_REPEATED_EFFORT_DECAY_CALCULATION_VERSION,
        value,
        protocol: selectedRepeat,
        coverage: repeatCoverage,
        confidence: "medium",
      });
    }
  }

  const unavailableLevel = (
    levelId: z.infer<typeof swimmingTrainingLevelIdSchema>,
    dependency?: {
      sourceEvidenceIds: string[];
      evidenceCoverage: DurationPerformanceEvidenceCoverage;
      expiresAt: string | null;
    },
  ) => ({
    status: "unavailable",
    levelId,
    prescription: null,
    reasons: ["training_level_capability_unavailable"],
    calculationVersion: SWIMMING_TRAINING_LEVELS_VERSION,
    sourceEvidenceIds: dependency?.sourceEvidenceIds ?? [],
    evidenceCoverage:
      dependency?.evidenceCoverage ??
      protocolCoverage({
        available: false,
        pointCount: 0,
        activityCount: 0,
        observedDurationsSeconds: [],
        readCoverageState: parsed.evidenceReadCoverage.state,
      }),
    confidence: "unavailable",
    expiresAt: dependency?.expiresAt ?? null,
    recalculationTriggers: [...RECALCULATION_TRIGGERS],
  });
  const durationLevel = (input: {
    levelId: z.infer<typeof swimmingTrainingLevelIdSchema>;
    outcome: {
      status: string;
      confidence: DurationPerformanceConfidence;
      sourceEvidenceIds: string[];
      expiresAt: string | null;
      evidenceCoverage: DurationPerformanceEvidenceCoverage;
    };
    speed: number;
    minimumDuration: number;
    maximumDuration: number;
  }) =>
    input.outcome.status === "available"
      ? {
          status: "available",
          levelId: input.levelId,
          prescription: {
            paceSecondsPer100Meters: {
              fastest: metersPerSecondToSecondsPer100Meters(input.speed),
              slowest: metersPerSecondToSecondsPer100Meters(input.speed * 0.9),
            },
            workDurationSeconds: {
              minimum: input.minimumDuration,
              maximum: input.maximumDuration,
            },
            repetitions: { minimum: 1, maximum: 1 },
            recoveryDurationSeconds: null,
            environment,
          },
          reasons: [],
          calculationVersion: SWIMMING_TRAINING_LEVELS_VERSION,
          sourceEvidenceIds: input.outcome.sourceEvidenceIds,
          evidenceCoverage: input.outcome.evidenceCoverage,
          confidence: input.outcome.confidence,
          expiresAt: input.outcome.expiresAt,
          recalculationTriggers: [...RECALCULATION_TRIGGERS],
        }
      : unavailableLevel(input.levelId, input.outcome);

  const sprintSpeed =
    sprint.status === "unavailable" ? 1 : sprint.value.sixtySecondSpeedMetersPerSecond;
  const aerobicSpeed =
    aerobic.status === "unavailable"
      ? 1
      : aerobic.value.basis === "pool_duration_curve"
        ? aerobic.value.longDurationSpeedMetersPerSecond
        : (aerobic.value.speedsByDuration.at(-1)?.speedMetersPerSecond ?? 1);
  const repeatedLevel =
    repeatedEffortDecay.status === "available"
      ? {
          status: "available",
          levelId: "repeated_effort_pace",
          prescription: {
            paceSecondsPer100Meters: {
              fastest: metersPerSecondToSecondsPer100Meters(
                repeatedEffortDecay.value.firstSpeedMetersPerSecond,
              ),
              slowest: metersPerSecondToSecondsPer100Meters(
                repeatedEffortDecay.value.finalSpeedMetersPerSecond,
              ),
            },
            workDurationSeconds: {
              minimum: Math.min(
                ...(selectedRepeat?.repetitions.map(
                  (repetition) => repetition.activeDurationSeconds,
                ) ?? [1]),
              ),
              maximum: Math.max(
                ...(selectedRepeat?.repetitions.map(
                  (repetition) => repetition.activeDurationSeconds,
                ) ?? [1]),
              ),
            },
            repetitions: {
              minimum: repeatedEffortDecay.value.repetitionCount,
              maximum: repeatedEffortDecay.value.repetitionCount,
            },
            recoveryDurationSeconds: {
              minimum: Math.min(...repeatedEffortDecay.value.recoveryDurationsSeconds),
              maximum: Math.max(...repeatedEffortDecay.value.recoveryDurationsSeconds),
            },
            environment: "pool",
          },
          reasons: [],
          calculationVersion: SWIMMING_TRAINING_LEVELS_VERSION,
          sourceEvidenceIds: repeatedEffortDecay.sourceEvidenceIds,
          evidenceCoverage: repeatedEffortDecay.evidenceCoverage,
          confidence: repeatedEffortDecay.confidence,
          expiresAt: repeatedEffortDecay.expiresAt,
          recalculationTriggers: [...RECALCULATION_TRIGGERS],
        }
      : unavailableLevel("repeated_effort_pace", repeatedEffortDecay);
  const trainingLevels = [
    durationLevel({
      levelId: "sprint_pace",
      outcome: sprint,
      speed: sprintSpeed,
      minimumDuration: 30,
      maximumDuration: 60,
    }),
    durationLevel({
      levelId: "aerobic_pace",
      outcome: aerobic,
      speed: aerobicSpeed,
      minimumDuration: 1_200,
      maximumDuration: 3_600,
    }),
    repeatedLevel,
  ];

  return swimmingDurationPerformanceModelSchema.parse({
    contractVersion: SWIMMING_DURATION_PERFORMANCE_MODEL_VERSION,
    assessmentAsOf: parsed.assessmentAsOf,
    athleteId: parsed.athleteId,
    activityCategory: "swim",
    environment,
    calculationIdentity: modelIdentity({
      parsed,
      efforts: selected,
      repeat: selectedRepeat,
      environment,
    }),
    evidenceSummary: {
      durationEfforts: foundation.evidenceSummary,
      selectedRepeatedProtocolEvidenceIds: selectedRepeat ? [selectedRepeat.evidenceId] : [],
    },
    paceDurationCurve: curve,
    capabilities: { sprint, aerobic, repeatedEffortDecay },
    trainingLevels,
  });
}
