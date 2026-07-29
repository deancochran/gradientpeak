import { aggregateCommonLoadEnvelopes, calculateAvailableCommonLoad } from "@repo/core";
import { describe, expect, it } from "vitest";

import {
  describeTrainingPlanSessions,
  getActivityPlanMetricSummary,
} from "./activity-plan-presentation";

const commonLoad = calculateAvailableCommonLoad({
  activity_category: "bike",
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
  it("summarizes canonical training plan sessions", () => {
    expect(describeTrainingPlanSessions({ sessions: [{}, {}] })).toBe("2 sessions");
    expect(describeTrainingPlanSessions({ phases: [] })).toBe("No sessions specified");
  });

  it("builds a compact metric summary from authoritative estimates", () => {
    expect(
      getActivityPlanMetricSummary(
        { estimated_distance: 12_500, estimated_duration: 4_500 },
        commonLoad,
      ),
    ).toEqual(["Load 88", "Intensity 0.84", "1h 15m", "12.5 km"]);
  });

  it("presents an aggregate common Load without falling back to TSS", () => {
    const aggregate = aggregateCommonLoadEnvelopes([commonLoad]);
    expect(getActivityPlanMetricSummary(undefined, aggregate)).toEqual([
      "Load 88",
      "Intensity 0.84",
    ]);
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
