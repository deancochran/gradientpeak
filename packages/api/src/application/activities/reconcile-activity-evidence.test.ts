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
    source_series: "power",
    duration_seconds: 300,
    distance_meters: null,
    source_artifact_id: "artifact-1",
    source_revision: 1,
    start_offset_ms: 0,
    end_offset_ms: 300_000,
    window_coverage: 1,
    max_gap_seconds: 2,
    unit: "watts",
    value: 250,
    source: "imported",
    method: "activity_file_best_effort",
    calculation_version: "best-effort-extraction-v1",
    quality_score: null,
    provenance: { observation_id: "generated-effort", source_series: "power" },
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
    expect(plan.reconciledEfforts).toEqual([
      expect.objectContaining({
        id: "generated-effort",
        provenance: expect.objectContaining({ observation_id: "generated-effort" }),
      }),
    ]);
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

  it("fails closed when the same immutable source window is replayed with divergent evidence", () => {
    expect(() =>
      planGeneratedActivityEvidenceReconciliation({
        existingEfforts: [effort({})],
        generated: generated(),
      }),
    ).toThrow("diverged from immutable source revision");
  });

  it("carries the earliest changed effort observation time into durable scheduling", () => {
    const futureRecordedAt = new Date("2026-08-08T09:00:00.000Z");
    const plan = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [],
      generated: generated([effort({ id: "future-effort", recorded_at: futureRecordedAt })]),
    });

    expect(plan.effortMaterialRecordedAt).toEqual(futureRecordedAt);
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
