import type { ThresholdHistorySeries } from "./shared";

export const thresholdHistoryFixtures = {
  bikePower: {
    activityCategory: "bike",
    id: "bike:power:watts",
    metric: "power",
    points: [
      {
        activityCategory: "bike",
        confidence: 0.8,
        effectiveAt: "2026-03-10T00:00:00.000Z",
        method: "bike_power_30m",
        metric: "power",
        policyVersion: "threshold-policy-v1",
        sourceActivities: [],
        thresholdId: "bike-power-early",
        unit: "watts",
        value: 240,
      },
      {
        activityCategory: "bike",
        confidence: 0.8,
        effectiveAt: "2026-04-10T00:00:00.000Z",
        method: "bike_power_30m",
        metric: "power",
        policyVersion: "threshold-policy-v1",
        sourceActivities: [],
        thresholdId: "bike-power-latest",
        unit: "watts",
        value: 260,
      },
    ],
    unit: "watts",
  } satisfies ThresholdHistorySeries,
} as const;
