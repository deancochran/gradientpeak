import { z } from "zod";

import { cyclingDurationPerformanceModelSchema } from "../cycling-performance";
import {
  runningDurationPerformanceModelSchema,
  strengthOtherPerformanceModelSchema,
  swimmingDurationPerformanceModelSchema,
} from "../duration-performance";

export const ATHLETE_PERFORMANCE_MODEL_SNAPSHOT_VERSION =
  "athlete-performance-model-snapshot-v1" as const;
export const HEART_RATE_CALIBRATION_POLICY_VERSION =
  "activity-category-heart-rate-calibration-v1" as const;

const opaqueIdSchema = z.string().trim().min(1).max(256);
const dateTimeSchema = z.string().datetime();
const activityCategorySchema = z.enum(["bike", "run", "swim"]);

const heartRateFactIdentityShape = {
  activityCategory: activityCategorySchema,
  metric: z.enum(["lthr", "max_hr"]),
  unit: z.literal("beats_per_minute"),
  policyVersion: z.literal(HEART_RATE_CALIBRATION_POLICY_VERSION),
};

export const heartRateCalibrationFactSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      ...heartRateFactIdentityShape,
      valueBpm: z.number().finite().min(30).max(250),
      observedAt: dateTimeSchema,
      expiresAt: dateTimeSchema,
      sourceEvidenceId: opaqueIdSchema,
      sourceActivityId: opaqueIdSchema,
      source: z.literal("activity_file"),
      method: z.enum(["activity_file_lthr_detection", "max_hr_progressive_test_v1"]),
      calculationVersion: z.enum(["activity-file-lthr-v1", "max_hr_progressive_test_v1"]),
      reason: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      ...heartRateFactIdentityShape,
      valueBpm: z.null(),
      observedAt: z.null(),
      expiresAt: z.null(),
      sourceEvidenceId: z.null(),
      sourceActivityId: z.null(),
      source: z.null(),
      method: z.null(),
      calculationVersion: z.null(),
      reason: z.enum(["no_eligible_evidence", "stale_evidence", "evidence_read_truncated"]),
    })
    .strict(),
]);

const categoryHeartRateFactsSchema = z
  .object({
    lthr: heartRateCalibrationFactSchema,
    maxHr: heartRateCalibrationFactSchema,
  })
  .strict();

export const athleteHeartRateCalibrationFactsSchema = z
  .object({
    bike: categoryHeartRateFactsSchema,
    run: categoryHeartRateFactsSchema,
    swim: categoryHeartRateFactsSchema,
  })
  .strict()
  .superRefine((facts, context) => {
    for (const category of activityCategorySchema.options) {
      const categoryFacts = facts[category];
      for (const [metric, fact] of [
        ["lthr", categoryFacts.lthr],
        ["max_hr", categoryFacts.maxHr],
      ] as const) {
        if (fact.activityCategory !== category || fact.metric !== metric) {
          context.addIssue({
            code: "custom",
            path: [category, metric === "max_hr" ? "maxHr" : metric],
            message: "Heart-rate calibration must retain its category and metric identity",
          });
        }
      }
    }
  });

/** One as-of authority containing only canonical Core category models and HR facts. */
export const athletePerformanceModelSnapshotSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_PERFORMANCE_MODEL_SNAPSHOT_VERSION),
    athleteId: opaqueIdSchema,
    asOf: dateTimeSchema,
    categories: z
      .object({
        bike: cyclingDurationPerformanceModelSchema,
        run: runningDurationPerformanceModelSchema,
        swim: swimmingDurationPerformanceModelSchema,
        strength: strengthOtherPerformanceModelSchema,
        other: strengthOtherPerformanceModelSchema,
      })
      .strict(),
    heartRate: athleteHeartRateCalibrationFactsSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const models = Object.entries(snapshot.categories);
    for (const [category, model] of models) {
      if (model.athleteId !== snapshot.athleteId || model.assessmentAsOf !== snapshot.asOf) {
        context.addIssue({
          code: "custom",
          path: ["categories", category],
          message: "Every category model must retain the snapshot athlete and as-of instant",
        });
      }
      if (model.activityCategory !== category) {
        context.addIssue({
          code: "custom",
          path: ["categories", category, "activityCategory"],
          message: "Every category model must occupy its matching category slot",
        });
      }
    }
  });

export type HeartRateCalibrationFact = z.infer<typeof heartRateCalibrationFactSchema>;
export type AthleteHeartRateCalibrationFacts = z.infer<
  typeof athleteHeartRateCalibrationFactsSchema
>;
export type AthletePerformanceModelSnapshot = z.infer<typeof athletePerformanceModelSnapshotSchema>;
