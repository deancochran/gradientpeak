import { z } from "zod";

import {
  type CalibrationIdentity,
  type CalibrationRecord,
  calibrationStateForSelection,
  calibrationTrendSchema,
} from "../performance-calibration";
import {
  type AthletePerformanceModelSnapshot,
  athleteHeartRateCalibrationFactsSchema,
  athletePerformanceModelSnapshotSchema,
  HEART_RATE_CALIBRATION_POLICY_VERSION,
  heartRateCalibrationFactSchema,
} from "./contracts";

export const ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION =
  "athlete-performance-target-facts-v1" as const;

const opaqueIdSchema = z.string().trim().min(1).max(256);
const dateTimeSchema = z.string().datetime({ offset: true });
const confidenceSchema = z.enum(["high", "medium", "low", "unavailable"]);
const usableConfidenceSchema = confidenceSchema.exclude(["unavailable"]);
const targetCalibrationTrendSchema = calibrationTrendSchema.or(z.literal("unavailable"));

/**
 * Inclusive bounds of the canonical observations supporting one target plus the
 * deterministic model instant. The request `asOf` is an evidence cutoff; it is
 * never substituted for either observation bound.
 */
export const performanceTargetEvidenceTimeSchema = z
  .object({
    observedFrom: dateTimeSchema.nullable(),
    observedThrough: dateTimeSchema.nullable(),
    computedAt: dateTimeSchema,
  })
  .strict()
  .superRefine((time, context) => {
    if ((time.observedFrom === null) !== (time.observedThrough === null)) {
      context.addIssue({
        code: "custom",
        message: "Performance-target observation bounds must both be present or both be null",
      });
      return;
    }
    if (time.observedFrom === null || time.observedThrough === null) return;
    if (Date.parse(time.observedFrom) > Date.parse(time.observedThrough)) {
      context.addIssue({
        code: "custom",
        path: ["observedThrough"],
        message: "Performance-target observation bounds must be chronological",
      });
    }
    if (Date.parse(time.observedThrough) > Date.parse(time.computedAt)) {
      context.addIssue({
        code: "custom",
        path: ["computedAt"],
        message: "A performance target cannot be computed before its supporting evidence",
      });
    }
  });

function targetFactSchema<T extends z.ZodType>(valueSchema: T, unit: string) {
  const metadata = {
    unit: z.literal(unit),
    calculationVersion: z.string().trim().min(1),
    calibrationId: opaqueIdSchema.nullable().default(null),
    sourceEvidenceIds: z
      .array(opaqueIdSchema)
      .max(2_000)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Performance-target source evidence IDs must be unique",
      }),
    evidenceTime: performanceTargetEvidenceTimeSchema,
    expiresAt: dateTimeSchema.nullable(),
    reasons: z.array(z.string().trim().min(1)).max(16),
    evidenceCount: z.number().int().nonnegative().max(64).default(0),
    trend: targetCalibrationTrendSchema.default("unavailable"),
  };
  return z
    .discriminatedUnion("status", [
      z
        .object({
          status: z.literal("available"),
          calibrationState: z
            .enum(["provisional", "confirmed", "stale", "unavailable"])
            .default("confirmed"),
          value: valueSchema,
          confidence: usableConfidenceSchema,
          ...metadata,
        })
        .strict(),
      z
        .object({
          status: z.literal("partial"),
          calibrationState: z
            .enum(["provisional", "confirmed", "stale", "unavailable"])
            .default("provisional"),
          value: valueSchema,
          confidence: usableConfidenceSchema,
          ...metadata,
        })
        .strict(),
      z
        .object({
          status: z.literal("unavailable"),
          calibrationState: z
            .enum(["provisional", "confirmed", "stale", "unavailable"])
            .default("unavailable"),
          value: z.null(),
          confidence: z.literal("unavailable"),
          ...metadata,
        })
        .strict(),
    ])
    .superRefine((fact, context) => {
      const hasEvidence = fact.sourceEvidenceIds.length > 0;
      const hasObservationBounds = fact.evidenceTime.observedFrom !== null;
      if (hasEvidence !== hasObservationBounds) {
        context.addIssue({
          code: "custom",
          path: ["evidenceTime"],
          message: "Performance-target evidence IDs and observation bounds must agree",
        });
      }
      if (fact.status !== "unavailable" && !hasEvidence) {
        context.addIssue({
          code: "custom",
          path: ["evidenceTime"],
          message: "Usable performance targets require canonical evidence and observation bounds",
        });
      }
    });
}

export const planningThresholdPowerFactSchema = targetFactSchema(
  z.number().finite().positive(),
  "watts",
);
export const planningThresholdPaceFactSchema = targetFactSchema(
  z.number().finite().positive(),
  "seconds_per_kilometer",
);
export const swimmingCssFactSchema = targetFactSchema(
  z.number().finite().positive(),
  "seconds_per_100_meters",
);

export const athletePerformanceTargetFactsSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION),
    athleteId: opaqueIdSchema,
    asOf: dateTimeSchema,
    cycling: z.object({ planningThresholdPower: planningThresholdPowerFactSchema }).strict(),
    running: z.object({ planningThresholdPace: planningThresholdPaceFactSchema }).strict(),
    swimming: z.object({ css: swimmingCssFactSchema }).strict(),
    heartRate: athleteHeartRateCalibrationFactsSchema,
  })
  .strict()
  .superRefine((facts, context) => {
    const factsByPath = [
      ["cycling", "planningThresholdPower", facts.cycling.planningThresholdPower],
      ["running", "planningThresholdPace", facts.running.planningThresholdPace],
      ["swimming", "css", facts.swimming.css],
    ] as const;
    for (const [category, target, fact] of factsByPath) {
      if (Date.parse(fact.evidenceTime.computedAt) !== Date.parse(facts.asOf)) {
        context.addIssue({
          code: "custom",
          path: [category, target, "evidenceTime", "computedAt"],
          message: "Performance-target computation must retain the snapshot model instant",
        });
      }
    }
  });

export const COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION =
  "completed-activity-performance-target-snapshot-v1" as const;

/** Immutable server capture used by completed analysis instead of mutable current calibration. */
export const completedActivityPerformanceTargetSnapshotSchema = z
  .object({
    contractVersion: z.literal(COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION),
    capturedAt: dateTimeSchema,
    publishedRevision: z.number().int().nonnegative().nullable(),
    publicationStatus: z.enum(["available", "stale", "unavailable"]),
    targets: athletePerformanceTargetFactsSchema,
  })
  .strict();

export type PerformanceTargetFact = z.infer<typeof planningThresholdPowerFactSchema>;

/** A source-validated numeric calibration is usable regardless of lifecycle metadata. */
export function getAvailablePerformanceTargetValue(fact: {
  status: "available" | "partial" | "unavailable";
  value: number | null;
}): number | null {
  return fact.status !== "unavailable" &&
    typeof fact.value === "number" &&
    Number.isFinite(fact.value) &&
    fact.value > 0
    ? fact.value
    : null;
}

/** Explicit fail-closed target DTO for surfaces that cannot load the as-of model. */
export function createUnavailableAthletePerformanceTargetFacts(
  asOf: string,
  athleteId = "unavailable-athlete",
): AthletePerformanceTargetFacts {
  const unavailableTarget = (unit: string) => ({
    status: "unavailable" as const,
    calibrationState: "unavailable" as const,
    value: null,
    unit,
    calculationVersion: ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION,
    calibrationId: null,
    sourceEvidenceIds: [],
    evidenceTime: { observedFrom: null, observedThrough: null, computedAt: asOf },
    confidence: "unavailable" as const,
    expiresAt: null,
    reasons: ["performance_model_unavailable"],
    evidenceCount: 0,
    trend: "unavailable" as const,
  });
  const unavailableHeartRate = (
    activityCategory: "bike" | "run" | "swim",
    metric: "lthr" | "max_hr",
  ) => ({
    status: "unavailable" as const,
    calibrationState: "unavailable" as const,
    activityCategory,
    metric,
    unit: "beats_per_minute" as const,
    policyVersion: HEART_RATE_CALIBRATION_POLICY_VERSION,
    valueBpm: null,
    observedAt: null,
    expiresAt: null,
    sourceEvidenceId: null,
    sourceActivityId: null,
    source: null,
    method: null,
    calculationVersion: null,
    reason: "no_eligible_evidence" as const,
    evidenceCount: 0,
    trend: "unavailable" as const,
  });
  return athletePerformanceTargetFactsSchema.parse({
    contractVersion: ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION,
    athleteId,
    asOf,
    cycling: { planningThresholdPower: unavailableTarget("watts") },
    running: { planningThresholdPace: unavailableTarget("seconds_per_kilometer") },
    swimming: { css: unavailableTarget("seconds_per_100_meters") },
    heartRate: Object.fromEntries(
      (["bike", "run", "swim"] as const).map((activityCategory) => [
        activityCategory,
        {
          lthr: unavailableHeartRate(activityCategory, "lthr"),
          maxHr: unavailableHeartRate(activityCategory, "max_hr"),
        },
      ]),
    ),
  });
}

function findCalibration(
  calibrations: readonly CalibrationRecord[],
  identity: CalibrationIdentity,
) {
  return calibrations.find(
    (calibration) =>
      calibration.identity.metricKey === identity.metricKey &&
      calibration.identity.activityCategory === identity.activityCategory,
  );
}

function targetFactFromCalibration(
  calibration: CalibrationRecord | undefined,
  unit: "watts" | "seconds_per_kilometer" | "seconds_per_100_meters",
  computedAt: string,
  transform: (value: number) => number,
) {
  if (!calibration) {
    return {
      status: "unavailable" as const,
      calibrationState: "unavailable" as const,
      value: null,
      unit,
      calculationVersion: ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION,
      calibrationId: null,
      sourceEvidenceIds: [],
      evidenceTime: { observedFrom: null, observedThrough: null, computedAt },
      confidence: "unavailable" as const,
      expiresAt: null,
      reasons: ["calibration_unavailable"],
      evidenceCount: 0,
      trend: "unavailable" as const,
    };
  }
  const sourceEvidenceIds = calibration.selectionDiagnostics.selectedEvidenceIds;
  const calibrationState = calibrationStateForSelection(calibration, computedAt);
  const observedAt = sourceEvidenceIds.length > 0 ? calibration.effectiveAt : null;
  const metadata = {
    unit,
    calculationVersion: calibration.policyVersion,
    calibrationId: calibration.id,
    sourceEvidenceIds,
    evidenceTime: {
      observedFrom: observedAt,
      observedThrough: observedAt,
      computedAt,
    },
    expiresAt: calibration.expiresAt,
    reasons: calibrationState === "stale" ? ["stale_evidence"] : [],
    evidenceCount: calibration.selectionDiagnostics.evidenceCount,
    trend: calibration.selectionDiagnostics.trend,
  };
  return {
    status: "available" as const,
    calibrationState,
    value: transform(calibration.value),
    confidence: calibrationState === "confirmed" ? ("high" as const) : ("low" as const),
    ...metadata,
  };
}

function lthrFactFromCalibration(
  calibration: CalibrationRecord | undefined,
  activityCategory: "bike" | "run",
  computedAt: string,
) {
  const calibrationState = calibration
    ? calibrationStateForSelection(calibration, computedAt)
    : "unavailable";
  if (!calibration) {
    return heartRateCalibrationFactSchema.parse({
      status: "unavailable",
      calibrationState,
      calibrationId: null,
      activityCategory,
      metric: "lthr",
      unit: "beats_per_minute",
      policyVersion: HEART_RATE_CALIBRATION_POLICY_VERSION,
      valueBpm: null,
      observedAt: null,
      expiresAt: null,
      sourceEvidenceId: null,
      sourceActivityId: null,
      source: null,
      method: null,
      calculationVersion: null,
      reason: "no_eligible_evidence",
      evidenceCount: 0,
      trend: "unavailable",
    });
  }
  const sourceEvidenceId = calibration.selectionDiagnostics.selectedEvidenceIds.at(-1);
  const sourceActivityId = calibration.selectionDiagnostics.selectedActivityIds.at(-1);
  return heartRateCalibrationFactSchema.parse({
    status: "available",
    calibrationState,
    calibrationId: calibration.id,
    activityCategory,
    metric: "lthr",
    unit: "beats_per_minute",
    policyVersion: calibration.policyVersion,
    valueBpm: calibration.value,
    observedAt: calibration.effectiveAt,
    expiresAt: calibration.expiresAt,
    sourceEvidenceId,
    sourceActivityId,
    source: "activity_file",
    method: "performance_calibration",
    calculationVersion: calibration.policyVersion,
    reason: null,
    evidenceCount: calibration.selectionDiagnostics.evidenceCount,
    trend: calibration.selectionDiagnostics.trend,
  });
}

/** Compact, lossless-for-targeting projection with lifecycle state retained as metadata. */
export function projectAthletePerformanceTargetFacts(
  input: AthletePerformanceModelSnapshot,
): z.infer<typeof athletePerformanceTargetFactsSchema> {
  const snapshot = athletePerformanceModelSnapshotSchema.parse(input);
  const bikePowerCalibration = findCalibration(snapshot.calibrations, {
    metricKey: "threshold_power",
    activityCategory: "bike",
  });
  const runSpeedCalibration = findCalibration(snapshot.calibrations, {
    metricKey: "threshold_speed",
    activityCategory: "run",
  });
  const swimSpeedCalibration = findCalibration(snapshot.calibrations, {
    metricKey: "threshold_speed",
    activityCategory: "swim",
  });
  return athletePerformanceTargetFactsSchema.parse({
    contractVersion: ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION,
    athleteId: snapshot.athleteId,
    asOf: snapshot.asOf,
    cycling: {
      planningThresholdPower: targetFactFromCalibration(
        bikePowerCalibration,
        "watts",
        snapshot.asOf,
        (value) => value,
      ),
    },
    running: {
      planningThresholdPace: targetFactFromCalibration(
        runSpeedCalibration,
        "seconds_per_kilometer",
        snapshot.asOf,
        (value) => 1_000 / value,
      ),
    },
    swimming: {
      css: targetFactFromCalibration(
        swimSpeedCalibration,
        "seconds_per_100_meters",
        snapshot.asOf,
        (value) => 100 / value,
      ),
    },
    heartRate: {
      ...snapshot.heartRate,
      bike: {
        ...snapshot.heartRate.bike,
        lthr: lthrFactFromCalibration(
          findCalibration(snapshot.calibrations, {
            metricKey: "threshold_heart_rate",
            activityCategory: "bike",
          }),
          "bike",
          snapshot.asOf,
        ),
      },
      run: {
        ...snapshot.heartRate.run,
        lthr: lthrFactFromCalibration(
          findCalibration(snapshot.calibrations, {
            metricKey: "threshold_heart_rate",
            activityCategory: "run",
          }),
          "run",
          snapshot.asOf,
        ),
      },
    },
  });
}

export type AthletePerformanceTargetFacts = z.infer<typeof athletePerformanceTargetFactsSchema>;
export type PerformanceTargetEvidenceTime = z.infer<typeof performanceTargetEvidenceTimeSchema>;
export type CompletedActivityPerformanceTargetSnapshot = z.infer<
  typeof completedActivityPerformanceTargetSnapshotSchema
>;
