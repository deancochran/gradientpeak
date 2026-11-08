import { z } from "zod";

import {
  activityDistanceSchema,
  activityDurationSchema,
} from "../activity-quantification/contracts";
import {
  aerobicDecouplingResultSchema,
  efficiencyFactorResultSchema,
} from "../calculations/efficiency";
import { runningNormalizedGradedPaceResultSchema } from "../calculations/normalized-graded-pace";
import { cyclingNormalizedPowerResultSchema } from "../calculations/normalized-power";
import { commonLoadResultSchema } from "../load/common-relative-load";
import { canonicalActivityCategorySchema } from "../schemas/activity-category";
import {
  heartRateDurationEvidenceSchema,
  heartRateZoneDurationResultSchema,
} from "../zones/heart-rate-duration";

const provisionalObservationSourceSchema = z
  .object({
    stage: z.literal("provisional"),
    evidenceRole: z.literal("measured"),
    source: z.enum(["recording_sample_timestamps", "recording_distance_accumulator"]),
  })
  .strict();

/**
 * Live recording output is intentionally non-canonical. Completed-activity
 * ingestion must recompute authoritative analysis from retained source facts.
 */
export const provisionalRecordingMetricsSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    stage: z.literal("provisional"),
    authority: z.literal("live_recording_only"),
    activity_category: canonicalActivityCategorySchema,
    observations: z
      .object({
        duration: z
          .object({
            provenance: provisionalObservationSourceSchema.extend({
              source: z.literal("recording_sample_timestamps"),
            }),
            value: activityDurationSchema,
          })
          .strict(),
        distance: z
          .object({
            provenance: provisionalObservationSourceSchema.extend({
              source: z.literal("recording_distance_accumulator"),
            }),
            value: activityDistanceSchema,
          })
          .strict(),
      })
      .strict(),
    commonLoad: commonLoadResultSchema,
    averagePowerWatts: z.number().finite().nonnegative().nullable(),
    normalizedPowerResult: cyclingNormalizedPowerResultSchema,
    normalizedGradedPaceResult: runningNormalizedGradedPaceResultSchema.nullable(),
    variabilityIndex: z.number().finite().nonnegative().nullable(),
    workKilojoules: z.number().finite().nonnegative().nullable(),
    averageHeartRateBpm: z.number().finite().positive().nullable(),
    heartRateEvidence: heartRateDurationEvidenceSchema,
    heartRateZoneDuration: heartRateZoneDurationResultSchema,
    efficiencyFactorResult: efficiencyFactorResultSchema,
    aerobicDecouplingResult: aerobicDecouplingResultSchema,
    sampleCount: z.number().int().nonnegative(),
    powerSampleCount: z.number().int().nonnegative(),
    heartRateSampleCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.commonLoad.status === "available") {
      context.addIssue({
        code: "custom",
        path: ["commonLoad", "status"],
        message: "A live recording cannot claim completed Common Load availability",
      });
    }
    if (snapshot.commonLoad.activity_category !== snapshot.activity_category) {
      context.addIssue({
        code: "custom",
        path: ["commonLoad", "activity_category"],
        message: "Provisional Common Load must match the recording activity category",
      });
    }
    if (
      snapshot.heartRateZoneDuration.evidence.status !== snapshot.heartRateEvidence.status ||
      snapshot.heartRateZoneDuration.evidence.coverageSeconds !==
        snapshot.heartRateEvidence.coverageSeconds ||
      snapshot.heartRateZoneDuration.evidence.eligibleDurationSeconds !==
        snapshot.heartRateEvidence.eligibleDurationSeconds
    ) {
      context.addIssue({
        code: "custom",
        path: ["heartRateZoneDuration", "evidence"],
        message: "Provisional HR zones must retain the snapshot HR duration evidence",
      });
    }
    const expectedAerobicModality =
      snapshot.activity_category === "bike"
        ? "cycling"
        : snapshot.activity_category === "run"
          ? "running"
          : "unsupported";
    if (
      snapshot.efficiencyFactorResult.modality !== expectedAerobicModality ||
      snapshot.aerobicDecouplingResult.modality !== expectedAerobicModality
    ) {
      context.addIssue({
        code: "custom",
        path: ["efficiencyFactorResult", "modality"],
        message: "Provisional aerobic results must match the recording activity category",
      });
    }
    const runningResult = snapshot.normalizedGradedPaceResult;
    if (snapshot.activity_category !== "run") {
      if (runningResult !== null) {
        context.addIssue({
          code: "custom",
          path: ["normalizedGradedPaceResult"],
          message: "Only running recordings can carry provisional NGP evidence",
        });
      }
      return;
    }
    if (runningResult === null) {
      context.addIssue({
        code: "custom",
        path: ["normalizedGradedPaceResult"],
        message: "Running recordings require an explicit provisional NGP result",
      });
      return;
    }
  });

export type ProvisionalRecordingMetricsSnapshot = z.infer<
  typeof provisionalRecordingMetricsSnapshotSchema
>;
export type RecordingMetricsActivityCategory = z.infer<typeof canonicalActivityCategorySchema>;
