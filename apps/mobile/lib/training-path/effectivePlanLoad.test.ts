import { calculateAvailableCommonLoad } from "@repo/core";
import { describe, expect, it } from "vitest";
import { buildEffectivePlanMetricSummary } from "./effectivePlanLoad";

const asOfInstant = "2026-07-21T12:00:00.000Z";

function commonLoad(durationSeconds: number, intensity: number) {
  return calculateAvailableCommonLoad({
    sport: "bike",
    method: "power_threshold",
    quality: {
      source: "validated_test",
      observed_at: "2026-07-20T12:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "threshold-v1",
      evidence_fingerprint: "quality-power",
    },
    thresholdEvidence: {
      type: "ftp_watts",
      value: 250,
      unit: "watts",
      source: "validated_test",
      observedAt: "2026-07-20T12:00:00.000Z",
      validAt: "2026-07-20T12:00:00.000Z",
      freshness: "current",
      calculationVersion: "threshold-v1",
      sourceFingerprint: "threshold-power",
    },
    evidenceFingerprint: `load-${durationSeconds}-${intensity}`,
    computedAsOf: asOfInstant,
    estimated: false,
    contributingDurationSeconds: durationSeconds,
    intensity,
  });
}

describe("mobile effective Plan Load adapter", () => {
  it("replaces linked planned work and keeps standalone completed work", () => {
    const summary = buildEffectivePlanMetricSummary({
      asOfInstant,
      planningTimezone: "UTC",
      startDate: "2026-07-21",
      endDate: "2026-07-27",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [
        {
          id: "linked-plan",
          scheduled_date: "2026-07-22",
          linked_activity_id: "linked-activity",
          activity_plan: { common_load: commonLoad(3600, 1) },
        },
        {
          id: "remaining-plan",
          scheduled_date: "2026-07-23",
          activity_plan: { common_load: commonLoad(3600, 0.5) },
        },
      ],
      completedActivities: [
        {
          id: "linked-activity",
          started_at: "2026-07-21T08:00:00.000Z",
          activity_type: "bike",
          derived: { stress: { common_load: commonLoad(1800, 1) } },
        },
        {
          id: "standalone",
          started_at: "2026-07-21T10:00:00.000Z",
          activity_type: "bike",
          derived: { stress: { common_load: commonLoad(1800, 0.5) } },
        },
      ],
    });

    expect(summary).toMatchObject({
      status: "complete",
      completedLoad: 62.5,
      remainingLoad: 25,
      load: 87.5,
      hasUnavailableCompletedLoad: false,
    });
    expect(summary.intensity).toBeCloseTo(Math.sqrt(87.5 / 200), 12);
  });

  it("keeps completed activities visible as incomplete when common Load is absent", () => {
    const summary = buildEffectivePlanMetricSummary({
      asOfInstant,
      planningTimezone: "UTC",
      startDate: "2026-07-21",
      endDate: "2026-07-21",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [],
      completedActivities: [
        {
          id: "unknown-load",
          started_at: "2026-07-21T10:00:00.000Z",
          activity_type: "run",
          duration_seconds: 1800,
        },
      ],
    });

    expect(summary).toMatchObject({
      status: "unavailable",
      load: null,
      intensity: null,
      hasUnavailableCompletedLoad: true,
      reason: "common_load_unavailable",
    });
  });

  it("uses the planning timezone when assigning completed activities", () => {
    const base = {
      asOfInstant: "2026-07-21T00:30:00.000Z",
      startDate: "2026-07-20",
      endDate: "2026-07-20",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [],
      completedActivities: [
        {
          id: "boundary",
          started_at: "2026-07-21T00:15:00.000Z",
          activity_type: "bike",
          derived: { stress: { common_load: commonLoad(3600, 1) } },
        },
      ],
    };

    expect(
      buildEffectivePlanMetricSummary({ ...base, planningTimezone: "America/Los_Angeles" }).load,
    ).toBe(100);
    expect(
      buildEffectivePlanMetricSummary({ ...base, planningTimezone: "Asia/Tokyo" }),
    ).toMatchObject({ status: "known_zero", load: 0, intensity: null });
  });

  it("keeps completed events without activity evidence visible as unavailable", () => {
    const summary = buildEffectivePlanMetricSummary({
      asOfInstant,
      planningTimezone: "UTC",
      startDate: "2026-07-21",
      endDate: "2026-07-21",
      completedSourceComplete: true,
      scheduledSourceComplete: true,
      scheduledEvents: [
        {
          id: "completed-without-link",
          scheduled_date: "2026-07-21",
          status: "completed",
          completed: true,
          activity_plan: { common_load: commonLoad(3600, 1) },
        },
      ],
      completedActivities: [],
    });

    expect(summary).toMatchObject({
      status: "unavailable",
      load: null,
      intensity: null,
      hasUnavailableCompletedLoad: true,
    });
  });

  it("does not report known zero when the scheduled source is incomplete", () => {
    expect(
      buildEffectivePlanMetricSummary({
        asOfInstant,
        planningTimezone: "UTC",
        startDate: "2026-07-21",
        endDate: "2026-07-21",
        completedSourceComplete: true,
        scheduledSourceComplete: false,
        scheduledEvents: [],
        completedActivities: [],
      }),
    ).toMatchObject({ status: "unavailable", reason: "scheduled_source_incomplete" });
  });
});
