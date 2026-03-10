import { describe, expect, it } from "vitest";

import { buildEstimationContext } from "../index";
import { estimateFromStructure } from "../strategies";

describe("estimation guardrails", () => {
  it("uses category-aware distance pace for bike structure estimation", () => {
    const context = buildEstimationContext({
      userProfile: {
        ftp: 280,
      },
      activityPlan: {
        activity_category: "bike",
        structure: {
          version: 2,
          intervals: [
            {
              id: "6f35b5c3-f7cf-4f2c-b5d2-91a79cbc468f",
              name: "Steady Ride",
              repetitions: 1,
              steps: [
                {
                  id: "f2cc1f7e-8c1a-4418-a507-050af7a09f5a",
                  name: "40km steady",
                  duration: {
                    type: "distance",
                    meters: 40000,
                  },
                  targets: [
                    {
                      type: "%FTP",
                      intensity: 75,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    const estimation = estimateFromStructure(context);

    expect(estimation.duration).toBe(4800);
    expect(estimation.tss).toBe(75);
  });

  it("maps profile metrics into estimation context", () => {
    const context = buildEstimationContext({
      userProfile: {
        ftp: 320,
        threshold_hr: 172,
        weight_kg: 74,
        threshold_pace_seconds_per_km: 255,
      },
      activityPlan: {
        activity_category: "run",
      },
    });

    expect(context.ftp).toBe(320);
    expect(context.thresholdHr).toBe(172);
    expect(context.weightKg).toBe(74);
    expect(context.thresholdPaceSecondsPerKm).toBe(255);
  });
});
