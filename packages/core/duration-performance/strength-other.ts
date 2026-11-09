import { z } from "zod";

import type { CanonicalJson } from "../athlete-intelligence/canonical-json";
import {
  type DurationPerformanceConfidence,
  type DurationPerformanceEvidenceCoverage,
  type DurationPerformanceRecalculationTrigger,
  durationPerformanceCalculationIdentitySchema,
  durationPerformanceConfidenceSchema,
  durationPerformanceEvidenceCoverageSchema,
  durationPerformanceReadCoverageSchema,
  durationPerformanceRecalculationTriggerSchema,
  durationPerformanceSourceEvidenceIdsSchema,
} from "./contracts";
import {
  createDurationPerformanceCalculationIdentity,
  type DurationPerformanceOutcome,
} from "./foundation";

export const STRENGTH_OTHER_PERFORMANCE_INPUT_VERSION = "strength-other-performance-input-v1";
export const STRENGTH_OTHER_PERFORMANCE_MODEL_VERSION = "strength-other-performance-v1";
export const STRENGTH_OTHER_EVIDENCE_POLICY_VERSION = "strength-other-evidence-v1";
export const SESSION_PERFORMANCE_EVIDENCE_VERSION = "qualified-session-performance-evidence-v1";
export const STRENGTH_REPEAT_PROTOCOL_EVIDENCE_VERSION = "qualified-strength-repeat-protocol-v1";
export const OTHER_REPEAT_PROTOCOL_EVIDENCE_VERSION = "qualified-other-repeat-protocol-v1";
export const STRENGTH_VOLUME_CALCULATION_VERSION = "strength-repetition-volume-v1";
export const STRENGTH_DENSITY_CALCULATION_VERSION = "strength-repetition-density-v1";
export const STRENGTH_REPETITION_LOAD_CALCULATION_VERSION = "strength-repetition-rpe-load-v1";
export const GENERAL_SESSION_LOAD_CALCULATION_VERSION = "general-duration-rpe-load-v1";
export const SESSION_REPEATABILITY_CALCULATION_VERSION = "session-protocol-repeatability-v1";

export const STRENGTH_OTHER_PERFORMANCE_POLICY = Object.freeze({
  freshnessWindowDays: 90,
  maximumInputObservations: 1_000,
  maximumInputProtocols: 100,
  minimumRepeatProtocolBouts: 3,
});

const opaqueIdSchema = z.string().trim().min(1).max(256);
const dateTimeSchema = z.string().datetime();
const calculationVersionSchema = z.string().regex(/^[a-z][a-z0-9-]*-v[0-9]+$/);
const sessionCategorySchema = z.enum(["strength", "other"]);

const sessionDurationEvidenceSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      activeDurationSeconds: z.number().finite().positive().max(86_400),
      unit: z.literal("seconds"),
      reason: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal("partial"),
      activeDurationSeconds: z.number().finite().positive().max(86_400),
      unit: z.literal("seconds"),
      reason: z.literal("source_incomplete"),
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      activeDurationSeconds: z.null(),
      unit: z.literal("seconds"),
      reason: z.literal("not_observed"),
    })
    .strict(),
]);

const sessionRepetitionEvidenceSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      count: z.number().int().positive().max(100_000),
      unit: z.literal("repetitions"),
      reason: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal("partial"),
      count: z.number().int().positive().max(100_000),
      unit: z.literal("repetitions"),
      reason: z.literal("source_incomplete"),
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      count: z.null(),
      unit: z.literal("repetitions"),
      reason: z.literal("not_observed"),
    })
    .strict(),
]);

export const canonicalSessionPerformanceEvidenceSchema = z
  .object({
    observationId: opaqueIdSchema,
    evidenceId: opaqueIdSchema,
    evidenceRevision: z.number().int().positive().max(1_000_000),
    athleteId: opaqueIdSchema,
    activityId: opaqueIdSchema,
    segmentId: opaqueIdSchema,
    recordedAt: dateTimeSchema,
    activityCategory: sessionCategorySchema,
    rpe: z
      .object({
        value: z.number().finite().min(0).max(10),
        unit: z.literal("rpe_0_10"),
        scale: z.literal("borg_cr10"),
        scaleVersion: z.literal("1"),
      })
      .strict(),
    duration: sessionDurationEvidenceSchema,
    repetitions: sessionRepetitionEvidenceSchema,
    source: z.literal("completed_activity_evidence"),
    calculationVersion: z.literal(SESSION_PERFORMANCE_EVIDENCE_VERSION),
    provenance: z
      .object({
        observationId: opaqueIdSchema,
        activityId: opaqueIdSchema,
        segmentId: opaqueIdSchema,
        derivedFrom: z.literal("completed_activity_facts"),
        rpeSource: z.literal("completed_session_rpe"),
        calculationVersion: z.literal(SESSION_PERFORMANCE_EVIDENCE_VERSION),
      })
      .strict(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      evidence.observationId !== evidence.provenance.observationId ||
      evidence.activityId !== evidence.provenance.activityId ||
      evidence.segmentId !== evidence.provenance.segmentId ||
      evidence.calculationVersion !== evidence.provenance.calculationVersion
    ) {
      context.addIssue({
        code: "custom",
        path: ["provenance"],
        message: "Session evidence must retain observation, subject, and calculation identity",
      });
    }
  });

const recoverySchema = z
  .object({
    afterBoutNumber: z.number().int().positive().max(49),
    durationSeconds: z.number().finite().positive().max(3_600),
    timingCoverage: z.literal("complete"),
  })
  .strict();

const protocolIdentityShape = {
  observationId: opaqueIdSchema,
  evidenceId: opaqueIdSchema,
  evidenceRevision: z.number().int().positive().max(1_000_000),
  athleteId: opaqueIdSchema,
  activityId: opaqueIdSchema,
  recordedAt: dateTimeSchema,
};

export const canonicalStrengthRepeatProtocolEvidenceSchema = z
  .object({
    ...protocolIdentityShape,
    activityCategory: z.literal("strength"),
    protocol: z.literal("fixed_resistance_repetition_sets"),
    exerciseId: opaqueIdSchema,
    resistance: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("bodyweight"), loadKilograms: z.null() }).strict(),
      z
        .object({
          kind: z.literal("fixed_external_load"),
          loadKilograms: z.number().finite().positive().max(2_000),
        })
        .strict(),
    ]),
    bouts: z
      .array(
        z
          .object({
            boutNumber: z.number().int().positive().max(50),
            segmentId: opaqueIdSchema,
            completedRepetitions: z.number().int().positive().max(10_000),
            rpe: z.number().finite().min(0).max(10),
          })
          .strict(),
      )
      .min(3)
      .max(50),
    recoveries: z.array(recoverySchema).min(2).max(49),
    calculationVersion: z.literal(STRENGTH_REPEAT_PROTOCOL_EVIDENCE_VERSION),
  })
  .strict()
  .superRefine((protocol, context) => {
    if (protocol.recoveries.length !== protocol.bouts.length - 1) {
      context.addIssue({
        code: "custom",
        path: ["recoveries"],
        message: "Every adjacent strength bout requires exact recovery timing",
      });
    }
    protocol.bouts.forEach((bout, index) => {
      if (bout.boutNumber !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["bouts", index, "boutNumber"],
          message: "Strength bouts must retain contiguous protocol order",
        });
      }
    });
    protocol.recoveries.forEach((recovery, index) => {
      if (recovery.afterBoutNumber !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["recoveries", index, "afterBoutNumber"],
          message: "Recovery must identify its preceding strength bout",
        });
      }
    });
  });

export const canonicalOtherRepeatProtocolEvidenceSchema = z
  .object({
    ...protocolIdentityShape,
    activityCategory: z.literal("other"),
    protocol: z.literal("fixed_duration_rpe_repeats"),
    workIdentity: opaqueIdSchema,
    workDurationSecondsPerBout: z.number().finite().positive().max(14_400),
    bouts: z
      .array(
        z
          .object({
            boutNumber: z.number().int().positive().max(50),
            segmentId: opaqueIdSchema,
            completedDurationSeconds: z.number().finite().positive().max(14_400),
            rpe: z.number().finite().min(0).max(10),
          })
          .strict(),
      )
      .min(3)
      .max(50),
    recoveries: z.array(recoverySchema).min(2).max(49),
    calculationVersion: z.literal(OTHER_REPEAT_PROTOCOL_EVIDENCE_VERSION),
  })
  .strict()
  .superRefine((protocol, context) => {
    if (protocol.recoveries.length !== protocol.bouts.length - 1) {
      context.addIssue({
        code: "custom",
        path: ["recoveries"],
        message: "Every adjacent general bout requires exact recovery timing",
      });
    }
    protocol.bouts.forEach((bout, index) => {
      if (bout.boutNumber !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["bouts", index, "boutNumber"],
          message: "General bouts must retain contiguous protocol order",
        });
      }
      if (Math.abs(bout.completedDurationSeconds - protocol.workDurationSecondsPerBout) > 1e-6) {
        context.addIssue({
          code: "custom",
          path: ["bouts", index, "completedDurationSeconds"],
          message: "Fixed-duration repeatability requires every authored work duration",
        });
      }
    });
    protocol.recoveries.forEach((recovery, index) => {
      if (recovery.afterBoutNumber !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["recoveries", index, "afterBoutNumber"],
          message: "Recovery must identify its preceding general bout",
        });
      }
    });
  });

export const canonicalSessionRepeatProtocolEvidenceSchema = z.discriminatedUnion(
  "activityCategory",
  [canonicalStrengthRepeatProtocolEvidenceSchema, canonicalOtherRepeatProtocolEvidenceSchema],
);

export const strengthOtherPerformanceInputSchema = z
  .object({
    contractVersion: z.literal(STRENGTH_OTHER_PERFORMANCE_INPUT_VERSION),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    activityCategory: sessionCategorySchema,
    evidenceReadCoverage: durationPerformanceReadCoverageSchema,
    observations: z
      .array(canonicalSessionPerformanceEvidenceSchema)
      .max(STRENGTH_OTHER_PERFORMANCE_POLICY.maximumInputObservations),
    repeatedEffortProtocols: z
      .array(canonicalSessionRepeatProtocolEvidenceSchema)
      .max(STRENGTH_OTHER_PERFORMANCE_POLICY.maximumInputProtocols),
  })
  .strict()
  .superRefine((input, context) => {
    const evidenceIds = new Set<string>();
    const observationIds = new Set<string>();
    const evidence = [...input.observations, ...input.repeatedEffortProtocols];
    evidence.forEach((item, index) => {
      if (item.athleteId !== input.athleteId) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index, "athleteId"],
          message: "Every session observation must belong to the assessed athlete",
        });
      }
      if (evidenceIds.has(item.evidenceId) || observationIds.has(item.observationId)) {
        context.addIssue({
          code: "custom",
          path: ["evidence", index],
          message: "Session evidence and observation identities must be unique",
        });
      }
      evidenceIds.add(item.evidenceId);
      observationIds.add(item.observationId);
    });
  });

export const strengthOtherPerformanceReasonSchema = z.enum([
  "evidence_read_truncated",
  "no_eligible_session_evidence",
  "mixed_activity_category_evidence",
  "strength_repetition_evidence_missing",
  "strength_density_timing_evidence_missing",
  "partial_repetition_evidence",
  "partial_session_timing_evidence",
  "not_applicable_to_other_category",
  "duration_rpe_evidence_missing",
  "duration_rpe_fallback_not_used_when_repetition_evidence_available",
  "repeatability_protocol_evidence_missing",
  "strength_first_bout_not_maximal",
]);

const outcomeMetadataShape = {
  calculationVersion: calculationVersionSchema,
  sourceEvidenceIds: durationPerformanceSourceEvidenceIdsSchema,
  evidenceCoverage: durationPerformanceEvidenceCoverageSchema,
  confidence: durationPerformanceConfidenceSchema,
  expiresAt: dateTimeSchema.nullable(),
  recalculationTriggers: z.array(durationPerformanceRecalculationTriggerSchema).min(1).max(4),
};

function sessionOutcomeSchema<T extends z.ZodType>(valueSchema: T) {
  return z
    .discriminatedUnion("status", [
      z
        .object({
          status: z.literal("available"),
          value: valueSchema,
          reasons: z.array(strengthOtherPerformanceReasonSchema).max(0),
          ...outcomeMetadataShape,
        })
        .strict(),
      z
        .object({
          status: z.literal("partial"),
          value: valueSchema,
          reasons: z.array(strengthOtherPerformanceReasonSchema).min(1),
          ...outcomeMetadataShape,
        })
        .strict(),
      z
        .object({
          status: z.literal("unavailable"),
          value: z.null(),
          reasons: z.array(strengthOtherPerformanceReasonSchema).min(1),
          ...outcomeMetadataShape,
        })
        .strict(),
    ])
    .superRefine((outcome, context) => {
      if (outcome.status === "available" && outcome.evidenceCoverage.state !== "complete") {
        context.addIssue({
          code: "custom",
          message: "Available session outcomes require complete evidence",
        });
      }
      if (outcome.status === "partial" && outcome.evidenceCoverage.state !== "partial") {
        context.addIssue({
          code: "custom",
          message: "Partial session outcomes require partial evidence",
        });
      }
      if (outcome.status === "unavailable" && outcome.confidence !== "unavailable") {
        context.addIssue({
          code: "custom",
          path: ["confidence"],
          message: "Unavailable session outcomes cannot claim confidence",
        });
      }
    });
}

const strengthVolumeValueSchema = z
  .object({
    totalRepetitions: z.number().int().positive(),
    sessionCount: z.number().int().positive(),
    unit: z.literal("repetitions"),
    interpretation: z.literal("completed_repetition_volume_not_external_load_tonnage"),
  })
  .strict();

const strengthDensityValueSchema = z
  .object({
    repetitionsPerActiveMinute: z.number().finite().positive(),
    totalRepetitions: z.number().int().positive(),
    totalActiveDurationSeconds: z.number().finite().positive(),
    unit: z.literal("repetitions_per_active_minute"),
  })
  .strict();

const strengthRepetitionLoadValueSchema = z
  .object({
    totalRepetitionRpePoints: z.number().finite().nonnegative(),
    formula: z.literal("sum_completed_repetitions_times_session_rpe"),
    unit: z.literal("repetition_rpe_points"),
    interpretation: z.literal("internal_session_index_not_external_load_or_common_load"),
  })
  .strict();

const generalDurationLoadValueSchema = z
  .object({
    totalMinuteRpePoints: z.number().finite().nonnegative(),
    formula: z.literal("sum_active_minutes_times_session_rpe"),
    unit: z.literal("minute_rpe_points"),
    method: z.literal("duration_rpe_fallback"),
    interpretation: z.literal("general_session_load_fallback_not_threshold_or_power"),
  })
  .strict();

const repeatabilityValueSchema = z.discriminatedUnion("basis", [
  z
    .object({
      basis: z.literal("fixed_resistance_repetitions"),
      activityCategory: z.literal("strength"),
      sourceActivityId: opaqueIdSchema,
      exerciseId: opaqueIdSchema,
      resistance: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("bodyweight"), loadKilograms: z.null() }).strict(),
        z
          .object({
            kind: z.literal("fixed_external_load"),
            loadKilograms: z.number().finite().positive().max(2_000),
          })
          .strict(),
      ]),
      firstBoutRepetitions: z.number().int().positive(),
      finalBoutRepetitions: z.number().int().positive(),
      finalRepetitionRetentionRatio: z.number().finite().min(0).max(1),
      rpeDrift: z.number().finite(),
      recoveryDurationsSeconds: z.array(z.number().finite().positive()).min(2),
      interpretation: z.literal(
        "fixed_resistance_protocol_repeatability_not_general_recovery_capacity",
      ),
    })
    .strict(),
  z
    .object({
      basis: z.literal("fixed_duration_rpe_drift"),
      activityCategory: z.literal("other"),
      sourceActivityId: opaqueIdSchema,
      workIdentity: opaqueIdSchema,
      workDurationSecondsPerBout: z.number().finite().positive(),
      rpeDrift: z.number().finite(),
      recoveryDurationsSeconds: z.array(z.number().finite().positive()).min(2),
      interpretation: z.literal("fixed_duration_protocol_rpe_drift_not_performance_capacity"),
    })
    .strict(),
]);

const sessionEvidenceSummarySchema = z
  .object({
    inputEvidenceCount: z.number().int().nonnegative(),
    eligibleObservationEvidenceIds: durationPerformanceSourceEvidenceIdsSchema,
    selectedProtocolEvidenceIds: durationPerformanceSourceEvidenceIdsSchema,
    selectedObservationIds: durationPerformanceSourceEvidenceIdsSchema,
    excludedEvidence: z
      .array(
        z
          .object({
            evidenceId: opaqueIdSchema,
            reason: z.enum(["future_observation", "outside_freshness_window"]),
          })
          .strict(),
      )
      .max(1_100),
  })
  .strict();

export const strengthOtherPerformanceModelSchema = z
  .object({
    contractVersion: z.literal(STRENGTH_OTHER_PERFORMANCE_MODEL_VERSION),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    activityCategory: sessionCategorySchema,
    calculationIdentity: durationPerformanceCalculationIdentitySchema,
    evidenceSummary: sessionEvidenceSummarySchema,
    metrics: z
      .object({
        strengthVolume: sessionOutcomeSchema(strengthVolumeValueSchema),
        strengthDensity: sessionOutcomeSchema(strengthDensityValueSchema),
        strengthRepetitionSessionLoad: sessionOutcomeSchema(strengthRepetitionLoadValueSchema),
        generalDurationSessionLoad: sessionOutcomeSchema(generalDurationLoadValueSchema),
        repeatability: sessionOutcomeSchema(repeatabilityValueSchema),
      })
      .strict(),
  })
  .strict();

export type CanonicalSessionPerformanceEvidence = z.infer<
  typeof canonicalSessionPerformanceEvidenceSchema
>;
export type CanonicalSessionRepeatProtocolEvidence = z.infer<
  typeof canonicalSessionRepeatProtocolEvidenceSchema
>;
export type StrengthOtherPerformanceInput = z.infer<typeof strengthOtherPerformanceInputSchema>;
export type StrengthOtherPerformanceReason = z.infer<typeof strengthOtherPerformanceReasonSchema>;
export type StrengthOtherPerformanceModel = z.infer<typeof strengthOtherPerformanceModelSchema>;
type SessionOutcome<T> = DurationPerformanceOutcome<T, StrengthOtherPerformanceReason>;
type RepeatabilityValue = z.infer<typeof repeatabilityValueSchema>;

const RECALCULATION_TRIGGERS = [
  "new_canonical_best_effort",
  "source_evidence_corrected",
  "source_evidence_expired",
  "calculation_policy_changed",
] satisfies readonly DurationPerformanceRecalculationTrigger[];

interface SessionIdentity {
  observationId: string;
  evidenceId: string;
  evidenceRevision: number;
  athleteId: string;
  activityId: string;
  recordedAt: string;
  activityCategory: "strength" | "other";
  calculationVersion: string;
}

function temporalSelection<T extends SessionIdentity>(
  evidence: readonly T[],
  assessmentAsOf: string,
): {
  eligible: T[];
  excluded: Array<{
    evidenceId: string;
    reason: "future_observation" | "outside_freshness_window";
  }>;
} {
  const asOf = Date.parse(assessmentAsOf);
  const cutoff = asOf - STRENGTH_OTHER_PERFORMANCE_POLICY.freshnessWindowDays * 86_400_000;
  const eligible: T[] = [];
  const excluded: Array<{
    evidenceId: string;
    reason: "future_observation" | "outside_freshness_window";
  }> = [];
  for (const item of [...evidence].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId),
  )) {
    const observedAt = Date.parse(item.recordedAt);
    if (observedAt > asOf) {
      excluded.push({ evidenceId: item.evidenceId, reason: "future_observation" });
    } else if (observedAt < cutoff) {
      excluded.push({ evidenceId: item.evidenceId, reason: "outside_freshness_window" });
    } else {
      eligible.push(item);
    }
  }
  return { eligible, excluded };
}

function newestProtocol(
  protocols: readonly CanonicalSessionRepeatProtocolEvidence[],
): CanonicalSessionRepeatProtocolEvidence | null {
  return (
    [...protocols].sort((left, right) => {
      const timeDifference = Date.parse(right.recordedAt) - Date.parse(left.recordedAt);
      return timeDifference !== 0
        ? timeDifference
        : left.evidenceId.localeCompare(right.evidenceId);
    })[0] ?? null
  );
}

function coverage(input: {
  selected: readonly SessionIdentity[];
  readCoverageState: "complete" | "truncated";
  forcePartial?: boolean;
}): DurationPerformanceEvidenceCoverage {
  const activityCount = new Set(input.selected.map((item) => item.activityId)).size;
  return durationPerformanceEvidenceCoverageSchema.parse({
    state:
      input.selected.length === 0
        ? "insufficient"
        : input.readCoverageState === "complete" && input.forcePartial !== true
          ? "complete"
          : "partial",
    readCoverageState: input.readCoverageState,
    requiredExactDurationsSeconds: [],
    requiredDurationBands: [],
    minimumDistinctDurations: 0,
    minimumDistinctActivities: input.selected.length > 0 ? 1 : 0,
    observedDurationsSeconds: [],
    eligibleEffortCount: input.selected.length,
    selectedPointCount: input.selected.length,
    distinctActivityCount: activityCount,
    completeSourcePointCount: input.forcePartial ? 0 : input.selected.length,
    partialSourcePointCount: input.forcePartial ? input.selected.length : 0,
  });
}

function confidence(
  items: readonly SessionIdentity[],
): Exclude<DurationPerformanceConfidence, "unavailable"> {
  const activities = new Set(items.map((item) => item.activityId)).size;
  return activities >= 4 ? "high" : activities >= 2 ? "medium" : "low";
}

function expiry(items: readonly SessionIdentity[]): string | null {
  if (items.length === 0) return null;
  return new Date(
    Math.min(
      ...items.map(
        (item) =>
          Date.parse(item.recordedAt) +
          STRENGTH_OTHER_PERFORMANCE_POLICY.freshnessWindowDays * 86_400_000,
      ),
    ),
  ).toISOString();
}

function available<T>(input: {
  calculationVersion: string;
  value: T;
  evidence: readonly SessionIdentity[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
  outcomeConfidence: Exclude<DurationPerformanceConfidence, "unavailable">;
}): SessionOutcome<T> {
  return {
    status: "available",
    value: input.value,
    reasons: [],
    calculationVersion: input.calculationVersion,
    sourceEvidenceIds: input.evidence.map((item) => item.evidenceId).sort(),
    evidenceCoverage: input.evidenceCoverage,
    confidence: input.outcomeConfidence,
    expiresAt: expiry(input.evidence),
    recalculationTriggers: [...RECALCULATION_TRIGGERS],
  };
}

function partial<T>(input: {
  calculationVersion: string;
  value: T;
  reason: StrengthOtherPerformanceReason;
  evidence: readonly SessionIdentity[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
}): SessionOutcome<T> {
  return {
    status: "partial",
    value: input.value,
    reasons: [input.reason],
    calculationVersion: input.calculationVersion,
    sourceEvidenceIds: input.evidence.map((item) => item.evidenceId).sort(),
    evidenceCoverage: input.evidenceCoverage,
    confidence: "low",
    expiresAt: expiry(input.evidence),
    recalculationTriggers: [...RECALCULATION_TRIGGERS],
  };
}

function unavailable<T = never>(input: {
  calculationVersion: string;
  reason: StrengthOtherPerformanceReason;
  evidence: readonly SessionIdentity[];
  evidenceCoverage: DurationPerformanceEvidenceCoverage;
}): SessionOutcome<T> {
  return {
    status: "unavailable",
    value: null,
    reasons: [input.reason],
    calculationVersion: input.calculationVersion,
    sourceEvidenceIds: input.evidence.map((item) => item.evidenceId).sort(),
    evidenceCoverage: input.evidenceCoverage,
    confidence: "unavailable",
    expiresAt: expiry(input.evidence),
    recalculationTriggers: [...RECALCULATION_TRIGGERS],
  };
}

function sessionIdentityFacts(
  item: CanonicalSessionPerformanceEvidence | CanonicalSessionRepeatProtocolEvidence,
): CanonicalJson {
  if ("rpe" in item) {
    return {
      activityId: item.activityId,
      segmentId: item.segmentId,
      recordedAt: item.recordedAt,
      activityCategory: item.activityCategory,
      evidenceKind: "session",
      rpe: item.rpe.value,
      durationStatus: item.duration.status,
      activeDurationSeconds: item.duration.activeDurationSeconds,
      repetitionStatus: item.repetitions.status,
      repetitions: item.repetitions.count,
    };
  }
  if (item.activityCategory === "strength") {
    return {
      activityId: item.activityId,
      recordedAt: item.recordedAt,
      activityCategory: item.activityCategory,
      evidenceKind: item.protocol,
      exerciseId: item.exerciseId,
      resistance: item.resistance,
      bouts: item.bouts,
      recoveries: item.recoveries,
    };
  }
  return {
    activityId: item.activityId,
    recordedAt: item.recordedAt,
    activityCategory: item.activityCategory,
    evidenceKind: item.protocol,
    workIdentity: item.workIdentity,
    workDurationSecondsPerBout: item.workDurationSecondsPerBout,
    bouts: item.bouts,
    recoveries: item.recoveries,
  };
}

function calculationIdentity(input: {
  parsed: StrengthOtherPerformanceInput;
  observations: readonly CanonicalSessionPerformanceEvidence[];
  protocol: CanonicalSessionRepeatProtocolEvidence | null;
}) {
  const evidence = input.protocol ? [...input.observations, input.protocol] : input.observations;
  return createDurationPerformanceCalculationIdentity({
    modelVersion: STRENGTH_OTHER_PERFORMANCE_MODEL_VERSION,
    inputContractVersion: STRENGTH_OTHER_PERFORMANCE_INPUT_VERSION,
    evidencePolicyVersion: STRENGTH_OTHER_EVIDENCE_POLICY_VERSION,
    assessmentAsOf: input.parsed.assessmentAsOf,
    athleteId: input.parsed.athleteId,
    activityCategory: input.parsed.activityCategory,
    modelVariant: `${input.parsed.activityCategory}_session_evidence`,
    sourceCalculationVersions: [
      SESSION_PERFORMANCE_EVIDENCE_VERSION,
      STRENGTH_REPEAT_PROTOCOL_EVIDENCE_VERSION,
      OTHER_REPEAT_PROTOCOL_EVIDENCE_VERSION,
    ],
    evidence: evidence.map((item) => ({
      evidenceId: item.evidenceId,
      observationId: item.observationId,
      evidenceRevision: item.evidenceRevision,
      sourceCalculationVersion: item.calculationVersion,
      facts: sessionIdentityFacts(item),
    })),
  });
}

/**
 * Builds only defensible repetition/RPE, duration/RPE, and explicit protocol
 * concepts. It has no power, threshold, pace, or fabricated curve output.
 */
export function calculateStrengthOtherPerformance(
  input: StrengthOtherPerformanceInput,
): StrengthOtherPerformanceModel {
  const parsed = strengthOtherPerformanceInputSchema.parse(input);
  const observationSelection = temporalSelection(parsed.observations, parsed.assessmentAsOf);
  const protocolSelection = temporalSelection(
    parsed.repeatedEffortProtocols,
    parsed.assessmentAsOf,
  );
  const selectedProtocol = newestProtocol(protocolSelection.eligible);
  const categories = new Set([
    ...observationSelection.eligible.map((item) => item.activityCategory),
    ...protocolSelection.eligible.map((item) => item.activityCategory),
  ]);
  const categoryMismatch =
    categories.size > 1 || (categories.size === 1 && !categories.has(parsed.activityCategory));
  const allEligible = [...observationSelection.eligible, ...protocolSelection.eligible];
  const allCoverage = coverage({
    selected: allEligible,
    readCoverageState: parsed.evidenceReadCoverage.state,
  });
  const globalReason =
    parsed.evidenceReadCoverage.state === "truncated"
      ? "evidence_read_truncated"
      : categoryMismatch
        ? "mixed_activity_category_evidence"
        : allEligible.length === 0
          ? "no_eligible_session_evidence"
          : null;
  const buildModel = (metrics: unknown) =>
    strengthOtherPerformanceModelSchema.parse({
      contractVersion: STRENGTH_OTHER_PERFORMANCE_MODEL_VERSION,
      assessmentAsOf: parsed.assessmentAsOf,
      athleteId: parsed.athleteId,
      activityCategory: parsed.activityCategory,
      calculationIdentity: calculationIdentity({
        parsed,
        observations: observationSelection.eligible,
        protocol: selectedProtocol,
      }),
      evidenceSummary: {
        inputEvidenceCount: parsed.observations.length + parsed.repeatedEffortProtocols.length,
        eligibleObservationEvidenceIds: observationSelection.eligible
          .map((item) => item.evidenceId)
          .sort(),
        selectedProtocolEvidenceIds: selectedProtocol ? [selectedProtocol.evidenceId] : [],
        selectedObservationIds: [
          ...observationSelection.eligible.map((item) => item.observationId),
          ...(selectedProtocol ? [selectedProtocol.observationId] : []),
        ].sort(),
        excludedEvidence: [...observationSelection.excluded, ...protocolSelection.excluded].sort(
          (left, right) => left.evidenceId.localeCompare(right.evidenceId),
        ),
      },
      metrics,
    });

  if (globalReason) {
    const result = (calculationVersion: string) =>
      unavailable({
        calculationVersion,
        reason: globalReason,
        evidence: allEligible,
        evidenceCoverage: allCoverage,
      });
    return buildModel({
      strengthVolume: result(STRENGTH_VOLUME_CALCULATION_VERSION),
      strengthDensity: result(STRENGTH_DENSITY_CALCULATION_VERSION),
      strengthRepetitionSessionLoad: result(STRENGTH_REPETITION_LOAD_CALCULATION_VERSION),
      generalDurationSessionLoad: result(GENERAL_SESSION_LOAD_CALCULATION_VERSION),
      repeatability: result(SESSION_REPEATABILITY_CALCULATION_VERSION),
    });
  }

  const observations = observationSelection.eligible.filter(
    (item) => item.activityCategory === parsed.activityCategory,
  );
  const repetitionObservations =
    parsed.activityCategory === "strength"
      ? observations.filter((item) => item.repetitions.status !== "unavailable")
      : [];
  const repetitionCoverage = coverage({
    selected: observations,
    readCoverageState: parsed.evidenceReadCoverage.state,
    forcePartial:
      repetitionObservations.length !== observations.length ||
      repetitionObservations.some((item) => item.repetitions.status === "partial"),
  });
  const totalRepetitions = repetitionObservations.reduce(
    (sum, item) => sum + (item.repetitions.status === "unavailable" ? 0 : item.repetitions.count),
    0,
  );
  const strengthVolume =
    parsed.activityCategory === "other"
      ? unavailable({
          calculationVersion: STRENGTH_VOLUME_CALCULATION_VERSION,
          reason: "not_applicable_to_other_category",
          evidence: [],
          evidenceCoverage: repetitionCoverage,
        })
      : repetitionObservations.length === 0
        ? unavailable({
            calculationVersion: STRENGTH_VOLUME_CALCULATION_VERSION,
            reason: "strength_repetition_evidence_missing",
            evidence: [],
            evidenceCoverage: repetitionCoverage,
          })
        : repetitionCoverage.state === "partial"
          ? partial({
              calculationVersion: STRENGTH_VOLUME_CALCULATION_VERSION,
              value: {
                totalRepetitions,
                sessionCount: repetitionObservations.length,
                unit: "repetitions",
                interpretation: "completed_repetition_volume_not_external_load_tonnage",
              },
              reason: "partial_repetition_evidence",
              evidence: observations,
              evidenceCoverage: repetitionCoverage,
            })
          : available({
              calculationVersion: STRENGTH_VOLUME_CALCULATION_VERSION,
              value: {
                totalRepetitions,
                sessionCount: repetitionObservations.length,
                unit: "repetitions",
                interpretation: "completed_repetition_volume_not_external_load_tonnage",
              },
              evidence: observations,
              evidenceCoverage: repetitionCoverage,
              outcomeConfidence: confidence(repetitionObservations),
            });

  const densityObservations = repetitionObservations.filter(
    (item) => item.duration.status !== "unavailable",
  );
  const densityHasPartialRepetitionEvidence =
    repetitionObservations.length !== observations.length ||
    repetitionObservations.some((item) => item.repetitions.status === "partial");
  const densityCoverage = coverage({
    selected: observations,
    readCoverageState: parsed.evidenceReadCoverage.state,
    forcePartial:
      densityHasPartialRepetitionEvidence ||
      densityObservations.length !== repetitionObservations.length ||
      densityObservations.some((item) => item.duration.status === "partial"),
  });
  const densityRepetitions = densityObservations.reduce(
    (sum, item) => sum + (item.repetitions.status === "unavailable" ? 0 : item.repetitions.count),
    0,
  );
  const densitySeconds = densityObservations.reduce(
    (sum, item) =>
      sum + (item.duration.status === "unavailable" ? 0 : item.duration.activeDurationSeconds),
    0,
  );
  const densityValue = {
    repetitionsPerActiveMinute: densitySeconds > 0 ? densityRepetitions / (densitySeconds / 60) : 0,
    totalRepetitions: densityRepetitions,
    totalActiveDurationSeconds: densitySeconds,
    unit: "repetitions_per_active_minute",
  };
  const densityPartialReason: StrengthOtherPerformanceReason = densityHasPartialRepetitionEvidence
    ? "partial_repetition_evidence"
    : "partial_session_timing_evidence";
  const strengthDensity =
    parsed.activityCategory === "other"
      ? unavailable({
          calculationVersion: STRENGTH_DENSITY_CALCULATION_VERSION,
          reason: "not_applicable_to_other_category",
          evidence: [],
          evidenceCoverage: densityCoverage,
        })
      : densityObservations.length === 0 || densitySeconds <= 0
        ? unavailable({
            calculationVersion: STRENGTH_DENSITY_CALCULATION_VERSION,
            reason: "strength_density_timing_evidence_missing",
            evidence: observations,
            evidenceCoverage: densityCoverage,
          })
        : densityCoverage.state === "partial"
          ? partial({
              calculationVersion: STRENGTH_DENSITY_CALCULATION_VERSION,
              value: densityValue,
              reason: densityPartialReason,
              evidence: observations,
              evidenceCoverage: densityCoverage,
            })
          : available({
              calculationVersion: STRENGTH_DENSITY_CALCULATION_VERSION,
              value: densityValue,
              evidence: observations,
              evidenceCoverage: densityCoverage,
              outcomeConfidence: confidence(densityObservations),
            });

  const repetitionLoad = repetitionObservations.reduce(
    (sum, item) =>
      sum +
      (item.repetitions.status === "unavailable" ? 0 : item.repetitions.count * item.rpe.value),
    0,
  );
  const strengthRepetitionSessionLoad =
    parsed.activityCategory === "other"
      ? unavailable({
          calculationVersion: STRENGTH_REPETITION_LOAD_CALCULATION_VERSION,
          reason: "not_applicable_to_other_category",
          evidence: [],
          evidenceCoverage: repetitionCoverage,
        })
      : repetitionObservations.length === 0
        ? unavailable({
            calculationVersion: STRENGTH_REPETITION_LOAD_CALCULATION_VERSION,
            reason: "strength_repetition_evidence_missing",
            evidence: [],
            evidenceCoverage: repetitionCoverage,
          })
        : repetitionCoverage.state === "partial"
          ? partial({
              calculationVersion: STRENGTH_REPETITION_LOAD_CALCULATION_VERSION,
              value: {
                totalRepetitionRpePoints: repetitionLoad,
                formula: "sum_completed_repetitions_times_session_rpe",
                unit: "repetition_rpe_points",
                interpretation: "internal_session_index_not_external_load_or_common_load",
              },
              reason: "partial_repetition_evidence",
              evidence: observations,
              evidenceCoverage: repetitionCoverage,
            })
          : available({
              calculationVersion: STRENGTH_REPETITION_LOAD_CALCULATION_VERSION,
              value: {
                totalRepetitionRpePoints: repetitionLoad,
                formula: "sum_completed_repetitions_times_session_rpe",
                unit: "repetition_rpe_points",
                interpretation: "internal_session_index_not_external_load_or_common_load",
              },
              evidence: observations,
              evidenceCoverage: repetitionCoverage,
              outcomeConfidence: confidence(repetitionObservations),
            });

  const durationObservations = observations.filter(
    (item) => item.duration.status !== "unavailable",
  );
  const durationCoverage = coverage({
    selected: observations,
    readCoverageState: parsed.evidenceReadCoverage.state,
    forcePartial:
      durationObservations.length !== observations.length ||
      durationObservations.some((item) => item.duration.status === "partial"),
  });
  const durationLoad = durationObservations.reduce(
    (sum, item) =>
      sum +
      (item.duration.status === "unavailable"
        ? 0
        : (item.duration.activeDurationSeconds / 60) * item.rpe.value),
    0,
  );
  const generalDurationSessionLoad =
    parsed.activityCategory === "strength" && repetitionObservations.length > 0
      ? unavailable({
          calculationVersion: GENERAL_SESSION_LOAD_CALCULATION_VERSION,
          reason: "duration_rpe_fallback_not_used_when_repetition_evidence_available",
          evidence: observations,
          evidenceCoverage: durationCoverage,
        })
      : durationObservations.length === 0
        ? unavailable({
            calculationVersion: GENERAL_SESSION_LOAD_CALCULATION_VERSION,
            reason: "duration_rpe_evidence_missing",
            evidence: observations,
            evidenceCoverage: durationCoverage,
          })
        : durationCoverage.state === "partial"
          ? partial({
              calculationVersion: GENERAL_SESSION_LOAD_CALCULATION_VERSION,
              value: {
                totalMinuteRpePoints: durationLoad,
                formula: "sum_active_minutes_times_session_rpe",
                unit: "minute_rpe_points",
                method: "duration_rpe_fallback",
                interpretation: "general_session_load_fallback_not_threshold_or_power",
              },
              reason: "partial_session_timing_evidence",
              evidence: observations,
              evidenceCoverage: durationCoverage,
            })
          : available({
              calculationVersion: GENERAL_SESSION_LOAD_CALCULATION_VERSION,
              value: {
                totalMinuteRpePoints: durationLoad,
                formula: "sum_active_minutes_times_session_rpe",
                unit: "minute_rpe_points",
                method: "duration_rpe_fallback",
                interpretation: "general_session_load_fallback_not_threshold_or_power",
              },
              evidence: observations,
              evidenceCoverage: durationCoverage,
              outcomeConfidence: confidence(durationObservations),
            });

  const protocol =
    selectedProtocol?.activityCategory === parsed.activityCategory ? selectedProtocol : null;
  const protocolCoverage = coverage({
    selected: protocol ? [protocol] : [],
    readCoverageState: parsed.evidenceReadCoverage.state,
  });
  let repeatability: SessionOutcome<RepeatabilityValue>;
  if (!protocol) {
    repeatability = unavailable({
      calculationVersion: SESSION_REPEATABILITY_CALCULATION_VERSION,
      reason: "repeatability_protocol_evidence_missing",
      evidence: [],
      evidenceCoverage: protocolCoverage,
    });
  } else if (protocol.activityCategory === "strength") {
    const first = protocol.bouts[0];
    const final = protocol.bouts.at(-1);
    const firstIsMaximal =
      first !== undefined &&
      protocol.bouts.every((bout) => bout.completedRepetitions <= first.completedRepetitions);
    repeatability =
      first && final && firstIsMaximal
        ? available({
            calculationVersion: SESSION_REPEATABILITY_CALCULATION_VERSION,
            value: {
              basis: "fixed_resistance_repetitions",
              activityCategory: "strength",
              sourceActivityId: protocol.activityId,
              exerciseId: protocol.exerciseId,
              resistance: protocol.resistance,
              firstBoutRepetitions: first.completedRepetitions,
              finalBoutRepetitions: final.completedRepetitions,
              finalRepetitionRetentionRatio:
                final.completedRepetitions / first.completedRepetitions,
              rpeDrift: final.rpe - first.rpe,
              recoveryDurationsSeconds: protocol.recoveries.map(
                (recovery) => recovery.durationSeconds,
              ),
              interpretation:
                "fixed_resistance_protocol_repeatability_not_general_recovery_capacity",
            },
            evidence: [protocol],
            evidenceCoverage: protocolCoverage,
            outcomeConfidence: "medium",
          })
        : unavailable({
            calculationVersion: SESSION_REPEATABILITY_CALCULATION_VERSION,
            reason: "strength_first_bout_not_maximal",
            evidence: [protocol],
            evidenceCoverage: protocolCoverage,
          });
  } else {
    const first = protocol.bouts[0];
    const final = protocol.bouts.at(-1);
    repeatability =
      first && final
        ? available({
            calculationVersion: SESSION_REPEATABILITY_CALCULATION_VERSION,
            value: {
              basis: "fixed_duration_rpe_drift",
              activityCategory: "other",
              sourceActivityId: protocol.activityId,
              workIdentity: protocol.workIdentity,
              workDurationSecondsPerBout: protocol.workDurationSecondsPerBout,
              rpeDrift: final.rpe - first.rpe,
              recoveryDurationsSeconds: protocol.recoveries.map(
                (recovery) => recovery.durationSeconds,
              ),
              interpretation: "fixed_duration_protocol_rpe_drift_not_performance_capacity",
            },
            evidence: [protocol],
            evidenceCoverage: protocolCoverage,
            outcomeConfidence: "medium",
          })
        : unavailable({
            calculationVersion: SESSION_REPEATABILITY_CALCULATION_VERSION,
            reason: "repeatability_protocol_evidence_missing",
            evidence: [protocol],
            evidenceCoverage: protocolCoverage,
          });
  }

  return buildModel({
    strengthVolume,
    strengthDensity,
    strengthRepetitionSessionLoad,
    generalDurationSessionLoad,
    repeatability,
  });
}
