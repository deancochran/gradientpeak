import { describe, expect, it } from "vitest";
import { planGeneratedActivityEvidenceReconciliation } from "./reconcile-activity-evidence";

const completedAt = new Date("2026-01-01T11:00:00Z");
const now = new Date("2026-07-14T12:00:00Z");

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
    calculation_version: "activity-file-best-effort-v1",
    quality_score: null,
    provenance: null,
    ...overrides,
  } as never;
}

function generated(efforts = [effort({ id: "new-random-id", value: 275 })]) {
  return {
    activityId: "activity-1",
    profileId: "profile-1",
    efforts,
    detectedLTHR: null,
    activityCompletedAt: completedAt,
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
        values: expect.objectContaining({ id: "new-random-id", value: 275 }),
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
      generated: { ...generated([]), detectedLTHR: 172 },
    });

    expect(plan.metricInsert).toBeNull();
    expect(plan.metricUpdate).toEqual(expect.objectContaining({ id: "metric-1" }));
    expect(plan.metricDeleteIds).toEqual(["metric-2"]);
  });
});
