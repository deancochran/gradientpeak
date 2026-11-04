import { z } from "zod";

import { BEST_EFFORT_CALCULATION_VERSION } from "../calculations/best-efforts";

export const DURATION_PERFORMANCE_FOUNDATION_VERSION = "duration-performance-foundation-v1";
export const DURATION_PERFORMANCE_EVIDENCE_POLICY_VERSION = "duration-performance-evidence-v1";
export const DURATION_PERFORMANCE_MAX_INPUT_EFFORTS = 2_000;
export const DURATION_PERFORMANCE_MAX_EFFORT_SECONDS = 14_400;
export const DURATION_PERFORMANCE_FRESHNESS_WINDOW_DAYS = 90;
export const DURATION_PERFORMANCE_MINIMUM_PARTIAL_SOURCE_COVERAGE = 0.8;

const MAX_ACTIVITY_OFFSET_SECONDS = 604_800;
const opaqueIdSchema = z.string().trim().min(1).max(256);
const dateTimeSchema = z.string().datetime();
const calculationVersionSchema = z.string().regex(/^[a-z][a-z0-9-]*-v[0-9]+$/);

export const durationPerformanceExtractionStatusSchema = z.enum(["available", "partial"]);

const canonicalEffortWindowCommonShape = {
  observationId: opaqueIdSchema,
  evidenceId: opaqueIdSchema,
  evidenceRevision: z.number().int().positive().max(1_000_000),
  athleteId: opaqueIdSchema,
  activityId: opaqueIdSchema,
  segmentId: opaqueIdSchema,
  recordedAt: dateTimeSchema,
  durationSeconds: z.number().int().min(5).max(DURATION_PERFORMANCE_MAX_EFFORT_SECONDS),
  source: z.literal("imported"),
  method: z.literal("activity_file_best_effort"),
  calculationVersion: z.literal(BEST_EFFORT_CALCULATION_VERSION),
};

export const canonicalEffortWindowProvenanceSchema = z
  .object({
    observationId: opaqueIdSchema,
    activityId: opaqueIdSchema,
    segmentId: opaqueIdSchema,
    derivedFrom: z.literal("activity_file_stream"),
    sourceSeries: z.enum(["power", "raw_speed", "grade_adjusted_speed", "swim_speed"]),
    exactWindowStartOffsetSeconds: z
      .number()
      .finite()
      .nonnegative()
      .max(MAX_ACTIVITY_OFFSET_SECONDS),
    exactWindowEndOffsetSeconds: z.number().finite().positive().max(MAX_ACTIVITY_OFFSET_SECONDS),
    durationSeconds: z.number().int().min(5).max(DURATION_PERFORMANCE_MAX_EFFORT_SECONDS),
    contributingDurationSeconds: z
      .number()
      .finite()
      .positive()
      .max(DURATION_PERFORMANCE_MAX_EFFORT_SECONDS),
    windowCoverage: z.literal(1),
    sourceTimeCoverage: z.number().finite().min(0).max(1),
    extractionStatus: durationPerformanceExtractionStatusSchema,
    extractionReason: z.literal("source_incomplete").nullable(),
    calculationVersion: z.literal(BEST_EFFORT_CALCULATION_VERSION),
  })
  .strict()
  .superRefine((provenance, context) => {
    const observedDuration =
      provenance.exactWindowEndOffsetSeconds - provenance.exactWindowStartOffsetSeconds;
    if (Math.abs(observedDuration - provenance.durationSeconds) > 1e-6) {
      context.addIssue({
        code: "custom",
        path: ["exactWindowEndOffsetSeconds"],
        message: "Exact effort offsets must span the canonical duration",
      });
    }
    if (Math.abs(provenance.contributingDurationSeconds - provenance.durationSeconds) > 1e-6) {
      context.addIssue({
        code: "custom",
        path: ["contributingDurationSeconds"],
        message: "Canonical effort evidence requires complete contributing duration",
      });
    }
    const expectedReason = provenance.extractionStatus === "partial" ? "source_incomplete" : null;
    if (provenance.extractionReason !== expectedReason) {
      context.addIssue({
        code: "custom",
        path: ["extractionReason"],
        message: "Extraction reason must agree with canonical extraction status",
      });
    }
  });

function canonicalDurationEvidenceSchema<T extends z.ZodRawShape>(specificShape: T) {
  return z
    .object({
      ...canonicalEffortWindowCommonShape,
      ...specificShape,
      provenance: canonicalEffortWindowProvenanceSchema,
    })
    .strict();
}

interface CanonicalDurationEvidenceIdentity {
  observationId: string;
  activityId: string;
  segmentId: string;
  durationSeconds: number;
  calculationVersion: string;
  provenance: {
    observationId: string;
    activityId: string;
    segmentId: string;
    durationSeconds: number;
    calculationVersion: string;
  };
}

function canonicalDurationEvidenceIdentityIssues(
  effort: CanonicalDurationEvidenceIdentity,
): Array<{ path: "provenance"; message: string }> {
  const issues: Array<{ path: "provenance"; message: string }> = [];
  if (
    effort.observationId !== effort.provenance.observationId ||
    effort.activityId !== effort.provenance.activityId ||
    effort.segmentId !== effort.provenance.segmentId
  ) {
    issues.push({
      path: "provenance",
      message: "Effort provenance must retain observation, activity, and segment identity",
    });
  }
  if (
    effort.durationSeconds !== effort.provenance.durationSeconds ||
    effort.calculationVersion !== effort.provenance.calculationVersion
  ) {
    issues.push({
      path: "provenance",
      message: "Effort value and provenance must retain one calculation identity",
    });
  }
  return issues;
}

function addCanonicalDurationEvidenceIdentityIssues(
  effort: CanonicalDurationEvidenceIdentity,
  addIssue: (issue: { code: "custom"; path: string[]; message: string }) => void,
): void {
  for (const issue of canonicalDurationEvidenceIdentityIssues(effort)) {
    addIssue({ code: "custom", path: [issue.path], message: issue.message });
  }
}

/** Canonical qualified bike power evidence; raw samples are deliberately absent. */
export const canonicalCyclingDurationEffortEvidenceSchema = canonicalDurationEvidenceSchema({
  activityCategory: z.literal("bike"),
  metric: z.literal("power"),
  value: z.number().finite().positive().max(3_000),
  unit: z.literal("watts"),
  evidenceContext: z.object({ kind: z.literal("cycling_power") }).strict(),
}).superRefine((effort, context) => {
  addCanonicalDurationEvidenceIdentityIssues(effort, (issue) => context.addIssue(issue));
  if (effort.provenance.sourceSeries !== "power") {
    context.addIssue({
      code: "custom",
      path: ["provenance", "sourceSeries"],
      message: "Cycling power evidence requires the canonical power source series",
    });
  }
});

export const runningEffortBasisSchema = z.enum(["raw_speed", "grade_adjusted_speed"]);

/** Raw and grade-adjusted running evidence are explicit, incompatible lanes. */
export const canonicalRunningDurationEffortEvidenceSchema = canonicalDurationEvidenceSchema({
  activityCategory: z.literal("run"),
  metric: z.literal("speed"),
  value: z.number().finite().positive().max(13),
  unit: z.literal("meters_per_second"),
  evidenceContext: z
    .object({ kind: z.literal("running_speed"), basis: runningEffortBasisSchema })
    .strict(),
}).superRefine((effort, context) => {
  addCanonicalDurationEvidenceIdentityIssues(effort, (issue) => context.addIssue(issue));
  if (effort.provenance.sourceSeries !== effort.evidenceContext.basis) {
    context.addIssue({
      code: "custom",
      path: ["provenance", "sourceSeries"],
      message: "Running source series must match its raw or grade-adjusted evidence basis",
    });
  }
});

export const swimmingEnvironmentSchema = z.enum(["pool", "open_water"]);
export const swimmingTimingBasisSchema = z.enum([
  "pool_length_timing",
  "open_water_continuous_timing",
]);

/** Pool and open-water timing are retained as separate evidence lanes. */
export const canonicalSwimmingDurationEffortEvidenceSchema = canonicalDurationEvidenceSchema({
  activityCategory: z.literal("swim"),
  metric: z.literal("speed"),
  value: z.number().finite().positive().max(3),
  unit: z.literal("meters_per_second"),
  evidenceContext: z
    .object({
      kind: z.literal("swimming_speed"),
      environment: swimmingEnvironmentSchema,
      timingBasis: swimmingTimingBasisSchema,
      poolLengthMeters: z.number().finite().min(10).max(100).nullable(),
    })
    .strict(),
}).superRefine((effort, context) => {
  addCanonicalDurationEvidenceIdentityIssues(effort, (issue) => context.addIssue(issue));
  if (effort.provenance.sourceSeries !== "swim_speed") {
    context.addIssue({
      code: "custom",
      path: ["provenance", "sourceSeries"],
      message: "Swimming duration evidence requires the canonical swim-speed series",
    });
  }
  const isPool = effort.evidenceContext.environment === "pool";
  const compatibleTiming = isPool
    ? effort.evidenceContext.timingBasis === "pool_length_timing" &&
      effort.evidenceContext.poolLengthMeters !== null
    : effort.evidenceContext.timingBasis === "open_water_continuous_timing" &&
      effort.evidenceContext.poolLengthMeters === null;
  if (!compatibleTiming) {
    context.addIssue({
      code: "custom",
      path: ["evidenceContext"],
      message: "Swimming timing basis and pool length must match the evidence environment",
    });
  }
});

export const canonicalQualifiedDurationEffortEvidenceSchema = z.discriminatedUnion(
  "activityCategory",
  [
    canonicalCyclingDurationEffortEvidenceSchema,
    canonicalRunningDurationEffortEvidenceSchema,
    canonicalSwimmingDurationEffortEvidenceSchema,
  ],
);

export const durationPerformanceReadCoverageSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("complete"), reason: z.null() }).strict(),
  z
    .object({
      state: z.literal("truncated"),
      reason: z.enum(["query_limit_reached", "source_window_truncated", "unknown"]),
    })
    .strict(),
]);

export const durationPerformanceEvidenceExclusionReasonSchema = z.enum([
  "future_observation",
  "outside_freshness_window",
  "partial_source_coverage_below_minimum",
  "duration_value_plausibility_review_required",
]);

export const durationPerformanceCoverageStateSchema = z.enum([
  "complete",
  "partial",
  "insufficient",
]);

export const durationPerformanceBandRequirementSchema = z
  .object({
    minimumDurationSeconds: z.number().int().positive(),
    maximumDurationSeconds: z.number().int().positive(),
    minimumPointCount: z.number().int().positive(),
  })
  .strict()
  .refine((band) => band.maximumDurationSeconds >= band.minimumDurationSeconds, {
    message: "Duration band maximum must not precede its minimum",
  });

export const durationPerformanceEvidenceCoverageSchema = z
  .object({
    state: durationPerformanceCoverageStateSchema,
    readCoverageState: z.enum(["complete", "truncated"]),
    requiredExactDurationsSeconds: z.array(z.number().int().positive()).max(32),
    requiredDurationBands: z.array(durationPerformanceBandRequirementSchema).max(16),
    minimumDistinctDurations: z.number().int().nonnegative(),
    minimumDistinctActivities: z.number().int().nonnegative(),
    observedDurationsSeconds: z.array(z.number().int().positive()).max(2_000),
    eligibleEffortCount: z.number().int().nonnegative(),
    selectedPointCount: z.number().int().nonnegative(),
    distinctActivityCount: z.number().int().nonnegative(),
    completeSourcePointCount: z.number().int().nonnegative(),
    partialSourcePointCount: z.number().int().nonnegative(),
  })
  .strict();

export const durationPerformanceConfidenceSchema = z.enum(["high", "medium", "low", "unavailable"]);

export const durationPerformanceFoundationReasonSchema = z.enum([
  "evidence_read_truncated",
  "no_eligible_efforts",
  "non_monotonic_canonical_curve",
  "missing_curve_anchors",
  "partial_source_evidence",
]);

export const durationPerformanceRecalculationTriggerSchema = z.enum([
  "new_canonical_best_effort",
  "source_evidence_corrected",
  "source_evidence_expired",
  "calculation_policy_changed",
]);

export const durationPerformanceSourceEvidenceIdsSchema = z
  .array(opaqueIdSchema)
  .max(2_000)
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Source evidence IDs must be unique" });
    }
  });

const identityFingerprintSchema = z.string().regex(/^fnv1a-32:[0-9a-f]{8}$/);

/**
 * `historySeriesFingerprint` is stable for one athlete/category/variant lane.
 * Evidence and calculation fingerprints make historical change comparison
 * explicit without claiming cryptographic integrity.
 */
export const durationPerformanceCalculationIdentitySchema = z
  .object({
    foundationVersion: z.literal(DURATION_PERFORMANCE_FOUNDATION_VERSION),
    modelVersion: calculationVersionSchema,
    inputContractVersion: calculationVersionSchema,
    evidencePolicyVersion: calculationVersionSchema,
    sourceCalculationVersions: z.array(calculationVersionSchema).min(1).max(16),
    assessmentAsOf: dateTimeSchema,
    athleteId: opaqueIdSchema,
    activityCategory: z.enum(["bike", "run", "swim", "strength", "other"]),
    modelVariant: z.string().trim().min(1).max(128),
    historySeriesFingerprint: identityFingerprintSchema,
    evidenceSetFingerprint: identityFingerprintSchema,
    calculationFingerprint: identityFingerprintSchema,
  })
  .strict();

export const durationPerformanceEvidenceSummarySchema = z
  .object({
    inputEvidenceCount: z.number().int().nonnegative().max(2_000),
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

export const durationPerformanceCurvePointSchema = z
  .object({
    observationId: opaqueIdSchema,
    sourceEvidenceId: opaqueIdSchema,
    evidenceRevision: z.number().int().positive(),
    activityId: opaqueIdSchema,
    segmentId: opaqueIdSchema,
    recordedAt: dateTimeSchema,
    durationSeconds: z.number().int().min(5).max(DURATION_PERFORMANCE_MAX_EFFORT_SECONDS),
    value: z.number().finite().positive(),
    unit: z.enum(["watts", "meters_per_second"]),
    sourceExtractionStatus: durationPerformanceExtractionStatusSchema,
    sourceCalculationVersion: z.literal(BEST_EFFORT_CALCULATION_VERSION),
  })
  .strict();

export const durationPerformanceCurveValueSchema = z
  .object({
    points: z.array(durationPerformanceCurvePointSchema).min(1).max(2_000),
    selectionPolicy: z.literal("strongest_per_exact_duration_then_newest_then_evidence_id"),
    monotonicityPolicy: z.literal("abstain_without_repair_on_increasing_value_with_duration"),
  })
  .strict()
  .superRefine((curve, context) => {
    for (let index = 1; index < curve.points.length; index += 1) {
      const previous = curve.points[index - 1];
      const current = curve.points[index];
      if (!previous || !current) continue;
      if (current.durationSeconds <= previous.durationSeconds || current.value > previous.value) {
        context.addIssue({
          code: "custom",
          path: ["points", index],
          message: "Available curve points must be duration-ordered and non-increasing",
        });
      }
    }
  });

export type CanonicalCyclingDurationEffortEvidence = z.infer<
  typeof canonicalCyclingDurationEffortEvidenceSchema
>;
export type CanonicalRunningDurationEffortEvidence = z.infer<
  typeof canonicalRunningDurationEffortEvidenceSchema
>;
export type CanonicalSwimmingDurationEffortEvidence = z.infer<
  typeof canonicalSwimmingDurationEffortEvidenceSchema
>;
export type CanonicalQualifiedDurationEffortEvidence = z.infer<
  typeof canonicalQualifiedDurationEffortEvidenceSchema
>;
export type DurationPerformanceReadCoverage = z.infer<typeof durationPerformanceReadCoverageSchema>;
export type DurationPerformanceEvidenceCoverage = z.infer<
  typeof durationPerformanceEvidenceCoverageSchema
>;
export type DurationPerformanceConfidence = z.infer<typeof durationPerformanceConfidenceSchema>;
export type DurationPerformanceFoundationReason = z.infer<
  typeof durationPerformanceFoundationReasonSchema
>;
export type DurationPerformanceRecalculationTrigger = z.infer<
  typeof durationPerformanceRecalculationTriggerSchema
>;
export type DurationPerformanceCalculationIdentity = z.infer<
  typeof durationPerformanceCalculationIdentitySchema
>;
export type DurationPerformanceEvidenceSummary = z.infer<
  typeof durationPerformanceEvidenceSummarySchema
>;
