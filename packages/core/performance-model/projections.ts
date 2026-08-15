import { z } from "zod";

import {
  getThresholdActivityCategoryPolicy,
  thresholdActivityCategorySchema,
  thresholdMethodSchema,
  thresholdMetricSchema,
  thresholdUnitSchema,
} from "../performance-calibration";
import {
  type AthleteHeartRateCalibrationFacts,
  athleteHeartRateCalibrationFactsSchema,
  HEART_RATE_CALIBRATION_POLICY_VERSION,
  heartRateCalibrationFactSchema,
} from "./contracts";

export const ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION =
  "athlete-performance-target-facts-v3" as const;

const opaqueIdSchema = z.string().trim().min(1).max(256);
const dateTimeSchema = z.string().datetime({ offset: true });

export const performanceThresholdSourceFactSchema = z
  .object({
    id: opaqueIdSchema,
    status: z.literal("available"),
    activityCategory: thresholdActivityCategorySchema,
    metric: thresholdMetricSchema,
    unit: thresholdUnitSchema,
    method: thresholdMethodSchema,
    value: z.number().finite().positive(),
    effectiveAt: dateTimeSchema,
    policyVersion: z.string().trim().min(1).max(128),
    state: z.enum(["provisional", "confirmed"]),
    confidence: z.number().finite().min(0).max(1),
    sourceEvaluationIds: z.array(opaqueIdSchema).min(1).max(8),
    sourceEffortIds: z.array(opaqueIdSchema).min(1).max(8),
    sourceActivityIds: z.array(opaqueIdSchema).min(1).max(8),
  })
  .strict()
  .superRefine((fact, context) => {
    if (
      fact.sourceEvaluationIds.length !== fact.sourceEffortIds.length ||
      fact.sourceEvaluationIds.length !== fact.sourceActivityIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceEvaluationIds"],
        message: "Threshold evaluation, effort, and activity provenance must align",
      });
    }
  });

const unavailableThresholdFactSchema = z
  .object({
    status: z.literal("unavailable"),
    activityCategory: thresholdActivityCategorySchema,
    metric: thresholdMetricSchema,
    unit: thresholdUnitSchema,
    thresholdId: z.null(),
    evaluationId: z.null(),
    method: z.null(),
    value: z.null(),
    effectiveAt: z.null(),
    confidence: z.null(),
    state: z.literal("unavailable"),
    policyVersion: z.null(),
    calculationVersion: z.null(),
    freshness: z.literal("unavailable"),
    ageSeconds: z.null(),
    freshForSeconds: z.null(),
    sourceEvaluationIds: z.tuple([]),
    sourceEffortIds: z.tuple([]),
    sourceActivityIds: z.tuple([]),
    reason: z.literal("threshold_unavailable"),
  })
  .strict();

const availableThresholdFactSchema = z
  .object({
    status: z.literal("available"),
    activityCategory: thresholdActivityCategorySchema,
    metric: thresholdMetricSchema,
    unit: thresholdUnitSchema,
    thresholdId: opaqueIdSchema,
    evaluationId: opaqueIdSchema,
    method: thresholdMethodSchema,
    value: z.number().finite().positive(),
    effectiveAt: dateTimeSchema,
    confidence: z.number().finite().min(0).max(1),
    state: z.enum(["provisional", "confirmed"]),
    policyVersion: z.string().trim().min(1).max(128),
    calculationVersion: z.string().trim().min(1).max(128),
    freshness: z.enum(["fresh", "stale"]),
    ageSeconds: z.number().int().nonnegative(),
    freshForSeconds: z.number().int().positive(),
    sourceEvaluationIds: z.array(opaqueIdSchema).min(1).max(8),
    sourceEffortIds: z.array(opaqueIdSchema).min(1).max(8),
    sourceActivityIds: z.array(opaqueIdSchema).min(1).max(8),
    reason: z.null(),
  })
  .strict()
  .superRefine((fact, context) => {
    if (!fact.sourceEvaluationIds.includes(fact.evaluationId)) {
      context.addIssue({
        code: "custom",
        path: ["evaluationId"],
        message: "The selected threshold evaluation must remain in its source evaluation set",
      });
    }
    if (
      fact.sourceEvaluationIds.length !== fact.sourceEffortIds.length ||
      fact.sourceEvaluationIds.length !== fact.sourceActivityIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceEvaluationIds"],
        message: "Threshold evaluation, effort, and activity provenance must align",
      });
    }
  });

export const performanceThresholdFactSchema = z.discriminatedUnion("status", [
  availableThresholdFactSchema,
  unavailableThresholdFactSchema,
]);

const thresholdFactsByActivityCategorySchema = z
  .object({
    bike: performanceThresholdFactSchema,
    run: performanceThresholdFactSchema,
    swim: performanceThresholdFactSchema,
  })
  .strict();

/** Canonical, native-unit public target truth at one requested instant. */
export const athletePerformanceTargetFactsSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION),
    athleteId: opaqueIdSchema,
    asOf: dateTimeSchema,
    thresholds: thresholdFactsByActivityCategorySchema,
    heartRate: athleteHeartRateCalibrationFactsSchema,
  })
  .strict()
  .superRefine((facts, context) => {
    const asOfMs = Date.parse(facts.asOf);
    for (const activityCategory of thresholdActivityCategorySchema.options) {
      const fact = facts.thresholds[activityCategory];
      const policy = getThresholdActivityCategoryPolicy(activityCategory);
      if (
        fact.activityCategory !== activityCategory ||
        fact.metric !== policy.metric ||
        fact.unit !== policy.unit
      ) {
        context.addIssue({
          code: "custom",
          path: ["thresholds", activityCategory],
          message:
            "Threshold facts must retain their canonical activity category, metric, and unit identity",
        });
      }
      if (fact.status === "available" && Date.parse(fact.effectiveAt) > asOfMs) {
        context.addIssue({
          code: "custom",
          path: ["thresholds", activityCategory, "effectiveAt"],
          message: "An as-of threshold fact cannot come from the future",
        });
      }
      const heartRateFacts = facts.heartRate[activityCategory];
      for (const [metric, heartRateFact] of [
        ["lthr", heartRateFacts.lthr],
        ["maxHr", heartRateFacts.maxHr],
      ] as const) {
        if (heartRateFact.status === "available" && Date.parse(heartRateFact.observedAt) > asOfMs) {
          context.addIssue({
            code: "custom",
            path: ["heartRate", activityCategory, metric, "observedAt"],
            message: "An as-of heart-rate fact cannot come from the future",
          });
        }
      }
    }
  });

export const COMPLETED_ACTIVITY_PERFORMANCE_TARGET_SNAPSHOT_VERSION =
  "completed-activity-performance-target-snapshot-v2" as const;

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

/** A source-validated numeric target is usable even when its freshness is stale. */
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

function unavailableThresholdFact(activityCategory: "bike" | "run" | "swim") {
  const policy = getThresholdActivityCategoryPolicy(activityCategory);
  return {
    status: "unavailable" as const,
    activityCategory,
    metric: policy.metric,
    unit: policy.unit,
    thresholdId: null,
    evaluationId: null,
    method: null,
    value: null,
    effectiveAt: null,
    confidence: null,
    state: "unavailable" as const,
    policyVersion: null,
    calculationVersion: null,
    freshness: "unavailable" as const,
    ageSeconds: null,
    freshForSeconds: null,
    sourceEvaluationIds: [] as [],
    sourceEffortIds: [] as [],
    sourceActivityIds: [] as [],
    reason: "threshold_unavailable" as const,
  };
}

function unavailableHeartRateFacts(): AthleteHeartRateCalibrationFacts {
  const unavailable = (activityCategory: "bike" | "run" | "swim", metric: "lthr" | "max_hr") =>
    heartRateCalibrationFactSchema.parse({
      status: "unavailable",
      calibrationState: "unavailable",
      calibrationId: null,
      activityCategory,
      metric,
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
      ageSeconds: null,
      freshness: "unavailable",
      sourceSemantics: "unavailable",
      evaluationSemantics: "unavailable",
    });
  return athleteHeartRateCalibrationFactsSchema.parse(
    Object.fromEntries(
      (["bike", "run", "swim"] as const).map((activityCategory) => [
        activityCategory,
        {
          lthr: unavailable(activityCategory, "lthr"),
          maxHr: unavailable(activityCategory, "max_hr"),
        },
      ]),
    ),
  );
}

export function createUnavailableAthletePerformanceTargetFacts(
  asOf: string,
  athleteId = "unavailable-athlete",
): AthletePerformanceTargetFacts {
  return athletePerformanceTargetFactsSchema.parse({
    contractVersion: ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION,
    athleteId,
    asOf,
    thresholds: {
      bike: unavailableThresholdFact("bike"),
      run: unavailableThresholdFact("run"),
      swim: unavailableThresholdFact("swim"),
    },
    heartRate: unavailableHeartRateFacts(),
  });
}

/**
 * Materializes latest-as-of persistence facts into the sole public target contract.
 * Freshness and age are always recomputed from effectiveAt and the requested asOf.
 */
export function materializeAthletePerformanceTargetFacts(input: {
  athleteId: string;
  asOf: string;
  thresholds: readonly z.input<typeof performanceThresholdSourceFactSchema>[];
  heartRate?: AthleteHeartRateCalibrationFacts;
}): AthletePerformanceTargetFacts {
  const asOfMs = Date.parse(input.asOf);
  if (!Number.isFinite(asOfMs)) throw new Error("Target-fact asOf is invalid");
  const result = createUnavailableAthletePerformanceTargetFacts(input.asOf, input.athleteId);
  if (input.heartRate)
    result.heartRate = athleteHeartRateCalibrationFactsSchema.parse(input.heartRate);
  for (const unknownThreshold of input.thresholds) {
    const threshold = performanceThresholdSourceFactSchema.parse(unknownThreshold);
    const policy = getThresholdActivityCategoryPolicy(threshold.activityCategory);
    if (
      threshold.metric !== policy.metric ||
      threshold.unit !== policy.unit ||
      threshold.method !== policy.method
    ) {
      throw new Error("Threshold fact does not match its canonical activity-category policy");
    }
    if (result.thresholds[threshold.activityCategory].status === "available") {
      throw new Error(`Threshold fact is duplicated for ${threshold.activityCategory}`);
    }
    const effectiveAtMs = Date.parse(threshold.effectiveAt);
    if (!Number.isFinite(effectiveAtMs) || effectiveAtMs > asOfMs) {
      throw new Error("Threshold fact is invalid or comes from the future");
    }
    const evaluationId = threshold.sourceEvaluationIds.at(-1);
    if (!evaluationId) throw new Error("Threshold fact has no selected evaluation");
    const ageSeconds = Math.floor((asOfMs - effectiveAtMs) / 1_000);
    const freshForSeconds = policy.freshnessDays * 86_400;
    result.thresholds[threshold.activityCategory] = performanceThresholdFactSchema.parse({
      status: "available",
      activityCategory: threshold.activityCategory,
      metric: threshold.metric,
      unit: threshold.unit,
      thresholdId: threshold.id,
      evaluationId,
      method: threshold.method,
      value: threshold.value,
      effectiveAt: threshold.effectiveAt,
      confidence: threshold.confidence,
      state: threshold.state,
      policyVersion: threshold.policyVersion,
      calculationVersion: threshold.policyVersion,
      freshness: ageSeconds < freshForSeconds ? "fresh" : "stale",
      ageSeconds,
      freshForSeconds,
      sourceEvaluationIds: threshold.sourceEvaluationIds,
      sourceEffortIds: threshold.sourceEffortIds,
      sourceActivityIds: threshold.sourceActivityIds,
      reason: null,
    });
  }
  return athletePerformanceTargetFactsSchema.parse(result);
}

export type PerformanceThresholdFact = z.infer<typeof performanceThresholdFactSchema>;
export type PerformanceThresholdSourceFact = z.infer<typeof performanceThresholdSourceFactSchema>;
export type AthletePerformanceTargetFacts = z.infer<typeof athletePerformanceTargetFactsSchema>;
export type CompletedActivityPerformanceTargetSnapshot = z.infer<
  typeof completedActivityPerformanceTargetSnapshotSchema
>;
