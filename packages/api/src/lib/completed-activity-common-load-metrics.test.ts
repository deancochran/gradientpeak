import {
  activityObservationQuantificationSchema,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
} from "@repo/core/activity-quantification";
import {
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  commonLoadResultSchema,
} from "@repo/core/load";
import { describe, expect, it } from "vitest";
import { projectCompletedActivityCommonLoadMetrics } from "./completed-activity-common-load-metrics";

const activityId = "11111111-1111-4111-8111-111111111111";
const computedAt = "2026-08-18T09:00:00.000Z";

function commonLoad(status: "available" | "partial" | "unavailable") {
  const base = {
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: "run" as const,
    method: "run_pace_threshold" as const,
    quality: {
      source: "validated_test" as const,
      observed_at: computedAt,
      confidence: "high" as const,
      stale: false,
      estimate: false,
      calculation_version: "threshold-v1",
      evidence_fingerprint: "quality-run",
    },
    thresholdEvidence: {
      type: "threshold_speed_mps" as const,
      value: 4,
      unit: "meters_per_second" as const,
      source: "validated_test" as const,
      observedAt: computedAt,
      validAt: computedAt,
      freshness: "current" as const,
      calculationVersion: "threshold-v1",
      sourceFingerprint: "threshold-run",
    },
    evidenceFingerprint: "activity-run",
    computedAsOf: computedAt,
  };
  if (status === "available") {
    return commonLoadResultSchema.parse({
      status,
      ...base,
      load: 25,
      intensity: 0.5,
      contributingDurationSeconds: 3_600,
      estimated: false,
    });
  }
  if (status === "partial") {
    return commonLoadResultSchema.parse({
      status,
      ...base,
      load: 12.5,
      intensity: 0.5,
      contributingDurationSeconds: 1_800,
      eligibleDurationSeconds: 3_600,
      sourceTimeCoverage: 0.5,
      reason: "activity_data_partial",
    });
  }
  return commonLoadResultSchema.parse({
    status,
    model: base.model,
    version: base.version,
    activity_category: base.activity_category,
    method: base.method,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: base.computedAsOf,
    contributingDurationSeconds: null,
    reason: "threshold_missing",
  });
}

function bundleFor(load: ReturnType<typeof commonLoad>) {
  const observation = activityObservationQuantificationSchema.parse({
    kind: "observation",
    stage: "final",
    subjectIdentity: createCompletedActivityQuantificationSubjectIdentity({ activityId }),
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "segment_facts",
      sourceIds: [activityId, "segment-1"],
      revisionFingerprint: "revision-1",
      details: { kind: "common-load-metrics-test" },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: load.model,
      version: load.version,
      computedAt,
      calibrationEvidenceFingerprint: load.evidenceFingerprint,
    }),
    activity_category: "run",
    duration: {
      elapsed: { status: "available", evidenceRole: "measured", value: 3_600, unit: "seconds" },
      active: { status: "available", evidenceRole: "measured", value: 3_600, unit: "seconds" },
      moving: { status: "available", evidenceRole: "measured", value: 3_600, unit: "seconds" },
    },
    distance: {
      status: "unavailable",
      evidenceRole: "measured",
      value: null,
      reason: "not_observed",
      unit: "meters",
    },
    intensity: {
      observed: {
        status: "unavailable",
        evidenceRole: "measured",
        values: [],
        reason: "not_observed",
      },
    },
    completedProvenance: {
      activityId,
      segmentId: "segment-1",
      source: "unknown",
      artifactIdentity: null,
      providerIdentity: null,
      segmentRevision: null,
      observedAt: computedAt,
      computedAt,
      calculationVersion: "common-load-metrics-test-v1",
    },
    commonLoad: load,
  });
  return createObservationQuantificationBundle({ members: [observation] });
}

describe("completed activity Common Load metrics", () => {
  it("projects known partial Load and Intensity together as partial", () => {
    expect(projectCompletedActivityCommonLoadMetrics(bundleFor(commonLoad("partial")))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "common_load", status: "partial", value: 12.5 }),
        expect.objectContaining({ key: "normalized_intensity", status: "partial", value: 0.5 }),
      ]),
    );
  });

  it("projects unknown partial, unavailable, and malformed quantification as paired unavailable metrics", () => {
    const unknownPartial = commonLoadResultSchema.parse({
      ...commonLoad("partial"),
      load: null,
      intensity: null,
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      contributingDurationSeconds: 0,
      sourceTimeCoverage: 0,
    });
    for (const value of [
      bundleFor(unknownPartial),
      bundleFor(commonLoad("unavailable")),
      { nope: true },
    ]) {
      expect(projectCompletedActivityCommonLoadMetrics(value)).toEqual([
        expect.objectContaining({ key: "common_load", status: "unavailable", value: null }),
        expect.objectContaining({
          key: "normalized_intensity",
          status: "unavailable",
          value: null,
        }),
      ]);
    }
  });

  it("projects complete Common Load and Intensity together as available", () => {
    expect(projectCompletedActivityCommonLoadMetrics(bundleFor(commonLoad("available")))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "common_load", status: "available", value: 25 }),
        expect.objectContaining({ key: "normalized_intensity", status: "available", value: 0.5 }),
      ]),
    );
  });
});
