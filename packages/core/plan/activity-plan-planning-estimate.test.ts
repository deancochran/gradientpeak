import { describe, expect, it } from "vitest";
import type { ActivityPlanStructureV2 } from "../schemas/activity_plan_v2";
import { estimateActivityPlanForTrainingContext } from "./activity-plan-planning-estimate";

describe("estimateActivityPlanForTrainingContext", () => {
  it("estimates time, IF, TSS, and distance from distance structure plus athlete pace", () => {
    const structure: ActivityPlanStructureV2 = {
      version: 2,
      intervals: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Tempo block",
          repetitions: 1,
          steps: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Tempo 5K",
              duration: { type: "distance", meters: 5000 },
              targets: [{ type: "%FTP", intensity: 80 }],
            },
          ],
        },
      ],
    };

    const estimate = estimateActivityPlanForTrainingContext({
      activityCategory: "run",
      structure,
      athleteContext: { thresholdPaceSecondsPerKm: 300 },
    });

    expect(estimate).toMatchObject({
      durationSeconds: 1500,
      distanceMeters: 5000,
      intensityFactor: 0.8,
      confidence: "high",
    });
    expect(estimate.tss).toBeCloseTo(26.7, 1);
  });

  it("falls back to saved metrics with lower confidence when structure is unavailable", () => {
    const estimate = estimateActivityPlanForTrainingContext({
      activityCategory: "bike",
      authoritativeMetrics: {
        estimatedDurationSeconds: 3600,
        estimatedTss: 55,
      },
    });

    expect(estimate.durationSeconds).toBe(3600);
    expect(estimate.tss).toBeCloseTo(49, 1);
    expect(estimate.confidence).toBe("medium");
    expect(estimate.warnings).toContain("Using category-level intensity fallback.");
  });
});
