import { describe, expect, it } from "vitest";
import { activityPlanStructureSchemaV3 } from "../../activity-plan";
import {
  buildEstimationContext,
  estimateActivity,
  InvalidActivityPlanStructureError,
} from "../index";
import { estimateFromStructure } from "../strategies";

describe("estimation guardrails", () => {
  it("uses segment category and preserves the single-bike golden", () => {
    const structure = activityPlanStructureSchemaV3.parse({
      version: 3,
      segments: [
        {
          role: "activity",
          id: "30000000-0000-4000-8000-000000000001",
          name: "Bike",
          category: "bike",
          intervals: [
            {
              id: "30000000-0000-4000-8000-000000000002",
              name: "Set",
              repetitions: 1,
              steps: [
                {
                  id: "30000000-0000-4000-8000-000000000003",
                  name: "Steady",
                  duration: { type: "time", seconds: 4800 },
                  targets: [{ type: "%FTP", intensity: 75 }],
                },
              ],
            },
          ],
        },
      ],
    });
    const context = buildEstimationContext({
      userProfile: { ftp: 280 },
      activityPlan: { activity_category: "run", structure },
    });
    const estimation = estimateFromStructure(context);
    expect(estimation).toMatchObject({
      duration: 4800,
      tss: 75,
      intensityFactor: 0.75,
      categoryDoses: [{ category: "bike", tss: 75 }],
    });
  });

  it("rejects V2 structures rather than running a fallback", () => {
    const context = buildEstimationContext({
      userProfile: {},
      activityPlan: { activity_category: "bike", structure: { version: 2, intervals: [] } },
    });
    expect(() => estimateFromStructure(context)).toThrow();
  });

  it("does not route/template-fallback when public estimation receives invalid structure", () => {
    const context = buildEstimationContext({
      userProfile: {},
      activityPlan: {
        activity_category: "bike",
        structure: { version: 2, intervals: [] },
      },
      route: { distance_meters: 40_000, total_ascent: 0, total_descent: 0 },
    });

    expect(() => estimateActivity(context)).toThrow(InvalidActivityPlanStructureError);
  });

  it("returns partial distance dose without inventing elapsed duration", () => {
    const structure = activityPlanStructureSchemaV3.parse({
      version: 3,
      segments: [
        {
          role: "activity",
          id: "30000000-0000-4000-8000-000000000011",
          name: "Run",
          category: "run",
          intervals: [
            {
              id: "30000000-0000-4000-8000-000000000012",
              name: "Set",
              repetitions: 1,
              steps: [
                {
                  id: "30000000-0000-4000-8000-000000000013",
                  name: "Distance",
                  duration: { type: "distance", meters: 5000 },
                  targets: [{ type: "speed", intensity: 12 }],
                },
              ],
            },
          ],
        },
      ],
    });
    const estimation = estimateActivity(
      buildEstimationContext({
        userProfile: {},
        activityPlan: { activity_category: "bike", structure },
      }),
    );

    expect(estimation).toMatchObject({
      duration: null,
      tss: null,
      intensityFactor: null,
      estimatedDistance: 5000,
    });
  });
});
