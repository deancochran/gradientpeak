import { z } from "zod";

import type { DurationPerformanceConfidence } from "../duration-performance";
import {
  type AthletePerformanceModelSnapshot,
  athleteHeartRateCalibrationFactsSchema,
  athletePerformanceModelSnapshotSchema,
  HEART_RATE_CALIBRATION_POLICY_VERSION,
} from "./contracts";

export const ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION =
  "athlete-performance-target-facts-v1" as const;

const opaqueIdSchema = z.string().trim().min(1).max(256);
const dateTimeSchema = z.string().datetime({ offset: true });
const confidenceSchema = z.enum(["high", "medium", "low", "unavailable"]);
const usableConfidenceSchema = confidenceSchema.exclude(["unavailable"]);

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
    sourceEvidenceIds: z
      .array(opaqueIdSchema)
      .max(2_000)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Performance-target source evidence IDs must be unique",
      }),
    evidenceTime: performanceTargetEvidenceTimeSchema,
    expiresAt: dateTimeSchema.nullable(),
    reasons: z.array(z.string().trim().min(1)).max(16),
  };
  return z
    .discriminatedUnion("status", [
      z
        .object({
          status: z.literal("available"),
          value: valueSchema,
          confidence: usableConfidenceSchema,
          ...metadata,
        })
        .strict(),
      z
        .object({
          status: z.literal("partial"),
          value: valueSchema,
          confidence: usableConfidenceSchema,
          ...metadata,
        })
        .strict(),
      z
        .object({
          status: z.literal("unavailable"),
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

type SourceOutcome<TValue> = {
  status: "available" | "partial" | "unavailable";
  value: TValue | null;
  calculationVersion: string;
  sourceEvidenceIds: string[];
  confidence: DurationPerformanceConfidence;
  expiresAt: string | null;
  reasons: string[];
};

type SupportingObservation = Readonly<{
  sourceEvidenceId: string;
  recordedAt: string;
}>;

export type PerformanceTargetFact = z.infer<typeof planningThresholdPowerFactSchema>;

/** Target resolution is intentionally fail-closed: partial model output is not prescriptive. */
export function getAvailablePerformanceTargetValue<T>(fact: {
  status: "available" | "partial" | "unavailable";
  value: T | null;
}): T | null {
  return fact.status === "available" ? fact.value : null;
}

/** Explicit fail-closed target DTO for surfaces that cannot load the as-of model. */
export function createUnavailableAthletePerformanceTargetFacts(
  asOf: string,
  athleteId = "unavailable-athlete",
): AthletePerformanceTargetFacts {
  const unavailableTarget = (unit: string) => ({
    status: "unavailable" as const,
    value: null,
    unit,
    calculationVersion: ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION,
    sourceEvidenceIds: [],
    evidenceTime: { observedFrom: null, observedThrough: null, computedAt: asOf },
    confidence: "unavailable" as const,
    expiresAt: null,
    reasons: ["performance_model_unavailable"],
  });
  const unavailableHeartRate = (
    activityCategory: "bike" | "run" | "swim",
    metric: "lthr" | "max_hr",
  ) => ({
    status: "unavailable" as const,
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

function targetFact<TSource, TProjected>(
  outcome: SourceOutcome<TSource>,
  unit: string,
  computedAt: string,
  supportingObservations: readonly SupportingObservation[],
  value: (source: TSource) => TProjected,
) {
  const observationsByEvidenceId = new Map(
    supportingObservations.map((observation) => [observation.sourceEvidenceId, observation]),
  );
  const supportingTimes = outcome.sourceEvidenceIds.flatMap((sourceEvidenceId) => {
    const observation = observationsByEvidenceId.get(sourceEvidenceId);
    return observation === undefined ? [] : [observation.recordedAt];
  });
  const hasCompleteObservationTimes = supportingTimes.length === outcome.sourceEvidenceIds.length;
  if (outcome.status !== "unavailable" && !hasCompleteObservationTimes) {
    throw new Error("Usable performance target omitted canonical supporting observation time");
  }
  const orderedTimes = hasCompleteObservationTimes
    ? [...supportingTimes].sort(
        (left, right) => Date.parse(left) - Date.parse(right) || left.localeCompare(right),
      )
    : [];
  const metadata = {
    unit,
    calculationVersion: outcome.calculationVersion,
    sourceEvidenceIds: hasCompleteObservationTimes ? outcome.sourceEvidenceIds : [],
    evidenceTime: {
      observedFrom: orderedTimes[0] ?? null,
      observedThrough: orderedTimes.at(-1) ?? null,
      computedAt,
    },
    confidence: outcome.confidence,
    expiresAt: outcome.expiresAt,
    reasons: outcome.reasons,
  };
  return outcome.status === "unavailable" || outcome.value === null
    ? { status: "unavailable" as const, value: null, ...metadata }
    : { status: outcome.status, value: value(outcome.value), ...metadata };
}

/** Compact, lossless-for-targeting projection; only `available` facts may resolve targets. */
export function projectAthletePerformanceTargetFacts(
  input: AthletePerformanceModelSnapshot,
): z.infer<typeof athletePerformanceTargetFactsSchema> {
  const snapshot = athletePerformanceModelSnapshotSchema.parse(input);
  const cyclingObservations =
    snapshot.categories.bike.maximalMeanPowerCurve.status === "unavailable"
      ? []
      : snapshot.categories.bike.maximalMeanPowerCurve.value.points.map((point) => ({
          sourceEvidenceId: point.sourceEvidenceId,
          recordedAt: point.recordedAt,
        }));
  const runningObservations =
    snapshot.categories.run.speedPaceCurve.status === "unavailable"
      ? []
      : snapshot.categories.run.speedPaceCurve.value.points.map((point) => ({
          sourceEvidenceId: point.sourceEvidenceId,
          recordedAt: point.recordedAt,
        }));
  const swimmingCss = snapshot.categories.swim.css;
  const swimmingCssObservations =
    swimmingCss.status === "unavailable" || swimmingCss.value === null
      ? []
      : swimmingCss.sourceEvidenceIds.map((sourceEvidenceId) => ({
          sourceEvidenceId,
          recordedAt: swimmingCss.value.sourceObservedAt,
        }));
  return athletePerformanceTargetFactsSchema.parse({
    contractVersion: ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION,
    athleteId: snapshot.athleteId,
    asOf: snapshot.asOf,
    cycling: {
      planningThresholdPower: targetFact(
        snapshot.categories.bike.parameters.planningThresholdPower,
        "watts",
        snapshot.categories.bike.assessmentAsOf,
        cyclingObservations,
        (value) => value.watts,
      ),
    },
    running: {
      planningThresholdPace: targetFact(
        snapshot.categories.run.parameters.planningThresholdPace,
        "seconds_per_kilometer",
        snapshot.categories.run.assessmentAsOf,
        runningObservations,
        (value) => value.paceSecondsPerKilometer,
      ),
    },
    swimming: {
      css: targetFact(
        swimmingCss,
        "seconds_per_100_meters",
        snapshot.categories.swim.assessmentAsOf,
        swimmingCssObservations,
        (value) => value.cssSecondsPer100Meters,
      ),
    },
    heartRate: snapshot.heartRate,
  });
}

export type AthletePerformanceTargetFacts = z.infer<typeof athletePerformanceTargetFactsSchema>;
export type PerformanceTargetEvidenceTime = z.infer<typeof performanceTargetEvidenceTimeSchema>;
