import { calculateAvailableCommonLoad } from "@repo/core";
import { mapUpcomingImpact } from "./usePlanDashboardViewModel";

function availableCommonLoad(load: number) {
  return calculateAvailableCommonLoad({
    activity_category: "bike",
    method: "power_threshold",
    quality: {
      source: "validated_test",
      observed_at: "2026-07-14T08:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "threshold-v1",
      evidence_fingerprint: "quality-bike",
    },
    thresholdEvidence: {
      type: "ftp_watts",
      value: 250,
      unit: "watts",
      source: "validated_test",
      observedAt: "2026-07-14T08:00:00.000Z",
      validAt: "2026-07-14T08:00:00.000Z",
      freshness: "current",
      calculationVersion: "threshold-v1",
      sourceFingerprint: "threshold-bike",
    },
    evidenceFingerprint: "activity-bike",
    computedAsOf: "2026-07-14T08:00:00.000Z",
    estimated: false,
    contributingDurationSeconds: 3600,
    intensity: Math.sqrt(load / 100),
  });
}

describe("plan dashboard training-model safety", () => {
  it("keeps prohibited physiology claims out of upcoming session context", () => {
    const result = mapUpcomingImpact({
      activity_plan_id: "activity-1",
      title: "Endurance ride",
      scheduled_at: "2026-07-14T08:00:00.000Z",
      activity_category: "bike",
      common_load: availableCommonLoad(72),
      confidence: "high",
      explanation: "Physiological claim from the API",
    });
    const athleteCopy = result.loadContext.toLowerCase();

    expect(athleteCopy).not.toMatch(/readiness|fitness contribution|confidence|physiolog/);
    expect(result).not.toHaveProperty("readinessDelta");
    expect(result).not.toHaveProperty("fitnessContribution");
    expect(result).not.toHaveProperty("confidence");
  });

  it("keeps a missing load value unknown and explicitly unavailable", () => {
    const result = mapUpcomingImpact({
      activity_plan_id: "activity-1",
      title: "Endurance ride",
      scheduled_at: "2026-07-14T08:00:00.000Z",
      activity_category: "bike",
      common_load: null,
      confidence: "low",
      explanation: "",
    });

    expect(result.estimatedLoad).toBeNull();
    expect(result.loadContext).toBe("Scheduled session; load estimate unavailable.");
  });
});
