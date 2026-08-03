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
    updated_at: completedAt,
    profile_id: "profile-1",
    activity_id: "activity-1",
    recorded_at: completedAt,
    activity_category: "bike",
    effort_type: "power",
    duration_seconds: 300,
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
  it("is idempotent by natural identity and preserves generated row IDs", () => {
    const plan = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [effort({})],
      existingMetrics: [],
      generated: generated(),
    });

    expect(plan.effortInserts).toEqual([]);
    expect(plan.effortDeleteIds).toEqual([]);
    expect(plan.effortUpdates).toEqual([
      expect.objectContaining({
        id: "generated-effort",
        values: expect.objectContaining({
          id: "generated-effort",
          value: 275,
          provenance: expect.objectContaining({ observation_id: "generated-effort" }),
        }),
      }),
    ]);
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
      existingMetrics: [],
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

  it("never updates or deletes manual effort and LTHR evidence", () => {
    const manualEffort = effort({ id: "manual-effort", source: "manual" });
    const manualMetric = {
      id: "manual-metric",
      metric_type: "lthr",
      method: "activity_file_lthr_detection",
      source: "manual",
    } as never;
    const plan = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [manualEffort],
      existingMetrics: [manualMetric],
      generated: generated([]),
    });

    expect(plan.effortDeleteIds).toEqual([]);
    expect(plan.effortUpdates).toEqual([]);
    expect(plan.metricDeleteIds).toEqual([]);
    expect(plan.metricUpdate).toBeNull();
  });

  it("updates generated LTHR in place and deletes only duplicate generated rows", () => {
    const generatedMetric = (id: string) =>
      ({
        id,
        metric_type: "lthr",
        method: "activity_file_lthr_detection",
        source: "derived",
      }) as never;
    const plan = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [],
      existingMetrics: [generatedMetric("metric-1"), generatedMetric("metric-2")],
      generated: { ...generated([]), detectedLTHR: detectedLthr(172) },
    });

    expect(plan.metricInsert).toBeNull();
    expect(plan.metricUpdate).toEqual(expect.objectContaining({ id: "metric-1" }));
    expect(plan.metricDeleteIds).toEqual(["metric-2"]);
  });

  it("converges reprocessing one activity on its existing generated LTHR row", () => {
    const existingMetric = {
      id: "metric-165",
      metric_type: "lthr",
      method: "activity_file_lthr_detection",
      source: "derived",
    } as never;

    const plan = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [],
      existingMetrics: [existingMetric],
      generated: { ...generated([]), detectedLTHR: detectedLthr(165) },
    });

    expect(plan.metricInsert).toBeNull();
    expect(plan.metricDeleteIds).toEqual([]);
    expect(plan.metricUpdate).toEqual(
      expect.objectContaining({
        id: "metric-165",
        values: expect.objectContaining({ value: 165, reference_activity_id: "activity-1" }),
      }),
    );
  });

  it("allows separate activities to retain 175 and 165 generated observations", () => {
    const first = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [],
      existingMetrics: [],
      generated: {
        ...generated([]),
        activityId: "activity-175",
        detectedLTHR: detectedLthr(175, "activity-175"),
      },
    });
    const second = planGeneratedActivityEvidenceReconciliation({
      existingEfforts: [],
      existingMetrics: [],
      generated: {
        ...generated([]),
        activityId: "activity-165",
        detectedLTHR: detectedLthr(165, "activity-165"),
      },
    });

    expect(first.metricInsert).toEqual(
      expect.objectContaining({ value: 175, reference_activity_id: "activity-175" }),
    );
    expect(second.metricInsert).toEqual(
      expect.objectContaining({ value: 165, reference_activity_id: "activity-165" }),
    );
  });
});
