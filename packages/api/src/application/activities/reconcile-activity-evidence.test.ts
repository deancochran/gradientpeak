import { describe, expect, it } from "vitest";
import {
  type GeneratedActivityLthrEvidence,
  planGeneratedActivityEvidenceReconciliation,
} from "./reconcile-activity-evidence";

const completedAt = new Date("2026-01-01T11:00:00Z");
const now = new Date("2026-07-14T12:00:00Z");

function detectedLthr(valueBpm: number, activityId = "activity-1"): GeneratedActivityLthrEvidence {
  return {
    valueBpm,
    recordedAt: completedAt,
    calculationVersion: "activity-file-lthr-v1",
    provenance: {
      activity_id: activityId,
      segment_id: "segment-1",
      derived_from: "activity_file_best_effort",
      source_series: "heart_rate",
      source_effort_calculation_version: "best-effort-extraction-v1",
      exact_window_start_timestamp_seconds: completedAt.getTime() / 1_000 - 1_200,
      exact_window_end_timestamp_seconds: completedAt.getTime() / 1_000,
      duration_seconds: 1_200,
      window_coverage: 1,
      extraction_status: "available",
      extraction_reason: null,
    },
  };
}

function effort(overrides: Record<string, unknown>) {
  return {
    id: "generated-effort",
    created_at: completedAt,
    profile_id: "profile-1",
    activity_id: "activity-1",
    segment_id: "segment-1",
    recorded_at: completedAt,
    activity_category: "bike",
    effort_type: "power",
    duration_seconds: 300,
    distance_meters: null,
    start_offset: 0,
    unit: "watts",
    value: 250,
    source: "imported",
    method: "activity_file_best_effort",
    calculation_version: "best-effort-extraction-v1",
    quality_score: null,
    provenance: { observation_id: "generated-effort" },
    ...overrides,
  } as never;
}

function generated(efforts = [effort({ id: "new-random-id", value: 275 })]) {
  return {
    activityId: "activity-1",
    profileId: "profile-1",
    efforts,
    detectedLTHR: null,
    now,
  };
}

describe("planGeneratedActivityEvidenceReconciliation", () => {
  it("makes identical redelivery a no-op and preserves immutable evidence", () => {
    const plan = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [effort({})],
      generated: generated([effort({ id: "redelivery-random-id" })]),
    });

    expect(plan.effortInserts).toEqual([]);
    expect(plan.effortDeleteIds).toEqual([]);
    expect(plan.effortMaterialRecordedAt).toBeNull();
  });

  it("treats PostgreSQL real output precision as identical evidence", () => {
    const plan = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [effort({ value: 373.333 })],
      generated: generated([effort({ id: "redelivery-random-id", value: 373.3333333333333 })]),
    });

    expect(plan.effortInserts).toEqual([]);
    expect(plan.effortDeleteIds).toEqual([]);
    expect(plan.effortMaterialRecordedAt).toBeNull();
  });

  it("replaces changed generated evidence instead of updating an observation", () => {
    const plan = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [effort({})],
      generated: generated(),
    });

    expect(plan.effortDeleteIds).toEqual(["generated-effort"]);
    expect(plan.effortInserts).toEqual([
      expect.objectContaining({
        id: "new-random-id",
        value: 275,
        provenance: expect.objectContaining({ observation_id: "new-random-id" }),
      }),
    ]);
    expect(plan.effortMaterialRecordedAt).toEqual(completedAt);
  });

  it("carries the earliest changed effort observation time into durable scheduling", () => {
    const futureRecordedAt = new Date("2026-08-08T09:00:00.000Z");
    const plan = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [],
      generated: generated([effort({ id: "future-effort", recorded_at: futureRecordedAt })]),
    });

    expect(plan.effortMaterialRecordedAt).toEqual(futureRecordedAt);
  });

  it("preserves the canonical CSS source method across reconciliation", () => {
    const cssEffort = effort({
      id: "css-effort",
      activity_category: "swim",
      effort_type: "speed",
      distance_meters: 400,
      method: "activity_file_swim_distance_effort",
      unit: "meters_per_second",
      value: 1.25,
    });
    const plan = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [],
      generated: generated([cssEffort]),
    });

    expect(plan.effortInserts).toEqual([
      expect.objectContaining({
        id: "css-effort",
        method: "activity_file_swim_distance_effort",
        provenance: expect.objectContaining({ observation_id: "css-effort" }),
      }),
    ]);
  });

  it("never writes calibration candidates into profile_metrics", () => {
    const manualEffort = effort({ id: "manual-effort", source: "manual" });
    const plan = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [manualEffort],
      generated: { ...generated([]), detectedLTHR: detectedLthr(172) },
    });

    expect(plan.effortDeleteIds).toEqual([]);
  });
});
