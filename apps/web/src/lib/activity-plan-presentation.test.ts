import { calculateAvailableCommonLoad } from "@repo/core";
import { describe, expect, it } from "vitest";

import {
  describeActivityPlanSegments,
  describeTrainingPlanSessions,
  formatActivityPlanCategory,
  getActivityPlanMetricSummary,
  summarizeActivityPlanSegments,
} from "./activity-plan-presentation";

const commonLoad = calculateAvailableCommonLoad({
  sport: "bike",
  method: "power_threshold",
  quality: {
    source: "validated_test",
    observed_at: "2026-07-20T12:00:00.000Z",
    confidence: "high",
    stale: false,
    estimate: false,
  },
  thresholdEvidence: {
    type: "ftp_watts",
    value: 250,
    unit: "watts",
    source: "validated_test",
    observedAt: "2026-07-20T12:00:00.000Z",
    validAt: "2026-07-20T12:00:00.000Z",
    freshness: "current",
    calculationVersion: null,
    sourceFingerprint: "threshold-power",
  },
  evidenceFingerprint: "plan-load",
  computedAsOf: "2026-07-21T12:00:00.000Z",
  estimated: true,
  contributingDurationSeconds: 4_500,
  intensity: 0.84,
});

describe("activity plan presentation", () => {
  const structure = {
    version: 3,
    segments: [
      { id: "s1", role: "activity", category: "run" },
      { id: "t1", role: "transition", duration: { type: "time", seconds: 300 } },
      { id: "s2", role: "activity", category: "bike" },
      { id: "r1", role: "rest", duration: { type: "time", seconds: 120 } },
      { id: "s3", role: "activity", category: "run" },
    ],
  };

  it("renders ordered V3 segments with repeated categories and boundaries", () => {
    expect(summarizeActivityPlanSegments(structure).map((segment) => segment.label)).toEqual([
      "Run",
      "Transition · 5 min",
      "Bike",
      "Rest · 2 min",
      "Run",
    ]);
    expect(describeActivityPlanSegments(structure)).toBe(
      "Run → Transition · 5 min → Bike → Rest · 2 min → Run",
    );
  });

  it("summarizes canonical training plan sessions", () => {
    expect(describeTrainingPlanSessions({ sessions: [{}, {}] })).toBe("2 sessions");
    expect(describeTrainingPlanSessions({ phases: [] })).toBe("No sessions specified");
  });

  it("formats canonical activity categories for people", () => {
    expect(formatActivityPlanCategory("bike")).toBe("Cycling");
    expect(formatActivityPlanCategory("strength")).toBe("Strength");
    expect(formatActivityPlanCategory(undefined)).toBe("Other");
  });

  it("builds a compact metric summary from authoritative estimates", () => {
    expect(
      getActivityPlanMetricSummary(
        { estimated_distance: 12_500, estimated_duration: 4_500 },
        commonLoad,
      ),
    ).toEqual(["1h 15m", "12.5 km", "Load 88", "Intensity 0.84"]);
  });

  it("omits unavailable and invalid estimates", () => {
    expect(
      getActivityPlanMetricSummary(
        { estimated_distance: null, estimated_duration: 0 },
        { status: "unavailable" },
      ),
    ).toEqual(["Load unavailable", "Intensity unavailable"]);
  });
});
