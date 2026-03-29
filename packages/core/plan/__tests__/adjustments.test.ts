import { describe, expect, it } from "vitest";

import {
  addRestDays,
  extendTimeline,
  getAdjustmentSummary,
  reduceIntensity,
  validatePlanRequirements,
} from "../index";

const baseStructure = {
  min_rest_days_per_week: 1,
  periodization_template: {
    target_date: "2026-04-01",
  },
  target_activities_per_week: 5,
  target_weekly_tss_max: 420,
  target_weekly_tss_min: 320,
};

describe("plan adjustments", () => {
  it("reduces weekly targets with built-in safety floors", () => {
    expect(reduceIntensity(baseStructure)).toEqual({
      min_rest_days_per_week: 2,
      periodization_template: {
        target_date: "2026-04-01",
      },
      target_activities_per_week: 4,
      target_weekly_tss_max: 336,
      target_weekly_tss_min: 256,
    });
  });

  it("extends the goal timeline by three weeks", () => {
    expect(extendTimeline(baseStructure).periodization_template?.target_date).toBe("2026-04-22");
  });

  it("summarizes user-visible plan changes", () => {
    const adjusted = addRestDays(baseStructure);

    expect(getAdjustmentSummary(baseStructure, adjusted)).toEqual([
      "Activities/week: 5 -> 4",
      "Rest days/week: 1 -> 2",
    ]);
  });
});

describe("recording validation", () => {
  it("warns when plan targets require missing threshold metrics", () => {
    const result = validatePlanRequirements(
      {
        activity_category: "bike",
        structure: {
          intervals: [
            {
              repetitions: 1,
              steps: [
                {
                  duration: { seconds: 600, type: "time" },
                  name: "Threshold",
                  notes: "",
                  targets: [{ intensity: 95, type: "%FTP" }],
                },
              ],
            },
          ],
        },
      } as never,
      {},
    );

    expect(result.warnings.some((warning) => warning.startsWith("Using default FTP ("))).toBe(true);
  });
});
