import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../../activity-plan";
import * as coreApi from "../../index";
import * as estimationApi from "../index";
import {
  buildEstimationContext,
  estimateActivity,
  estimateActivityBatch,
  estimateActivityComplete,
  InvalidActivityPlanStructureError,
} from "../index";
import { estimateFromStructure } from "../strategies";

function timedBikeStructure() {
  return activityPlanStructureSchema.parse({
    version: 3,
    segments: [
      {
        role: "activity",
        id: "30000000-0000-4000-8000-000000000001",
        name: "Bike",
        activity_category: "bike",
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
}

function distanceRunStructure() {
  return activityPlanStructureSchema.parse({
    version: 3,
    segments: [
      {
        role: "activity",
        id: "30000000-0000-4000-8000-000000000011",
        name: "Run",
        activity_category: "run",
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
}

describe("estimation guardrails", () => {
  it("removes legacy numeric Load/intensity helper exports", () => {
    for (const api of [estimationApi, coreApi, coreApi.Estimation]) {
      expect(api).not.toHaveProperty("getCommonLoadRange");
      expect(api).not.toHaveProperty("estimateAvgHR");
      expect(api).not.toHaveProperty("estimateZoneDistribution");
    }
  });

  it("retains compiled duration while abstaining from numeric Load and intensity", () => {
    const estimation = estimateFromStructure(
      buildEstimationContext({
        userProfile: {},
        activityPlan: { activity_category: "run", structure: timedBikeStructure() },
      }),
    );

    expect(estimation).toMatchObject({
      load: null,
      duration: 4800,
      durationEstimate: {
        valueSeconds: 4800,
        status: "exact",
        basis: "compiled_time",
        confidence: "high",
      },
      categoryDoses: [{ activity_category: "bike", load: null }],
    });
    expect(estimation).not.toHaveProperty("intensityFactor");
    expect(estimation).not.toHaveProperty("tss");
    expect(estimation.categoryDoses?.[0]).not.toHaveProperty("intensityFactor");
    expect(estimation.warnings).toContain(
      "Load and intensity are unavailable from the ancillary estimator; use canonical Common Load.",
    );
  });

  it("rejects invalid structures rather than routing them through ancillary fallbacks", () => {
    const context = buildEstimationContext({
      userProfile: {},
      activityPlan: { activity_category: "bike", structure: { version: 2, intervals: [] } },
      route: { distance_meters: 40_000, total_ascent: 0, total_descent: 0 },
    });

    expect(() => estimateFromStructure(context)).toThrow();
    expect(() => estimateActivity(context)).toThrow(InvalidActivityPlanStructureError);
  });

  it("retains authored distance without inventing elapsed duration or Load", () => {
    const estimation = estimateActivity(
      buildEstimationContext({
        userProfile: {},
        activityPlan: { activity_category: "bike", structure: distanceRunStructure() },
      }),
    );

    expect(estimation).toMatchObject({
      load: null,
      duration: null,
      durationEstimate: {
        valueSeconds: null,
        status: "unavailable",
        basis: null,
        confidence: null,
      },
      estimatedDistance: 5000,
    });
    expect(estimation).not.toHaveProperty("intensityFactor");
  });

  it("does not assume route speed, body mass, power, effort, or duration", () => {
    const result = estimateActivityComplete(
      buildEstimationContext({
        userProfile: { weight_kg: 75 },
        activityPlan: { activity_category: "bike" },
        route: { distance_meters: 40_000, total_ascent: 600, total_descent: 600 },
      }),
    );

    expect(result.estimation).toMatchObject({
      load: null,
      duration: null,
      durationEstimate: { status: "unavailable", valueSeconds: null },
      estimatedDistance: 40_000,
    });
    expect(result.estimation).not.toHaveProperty("intensityFactor");
    expect(result.metrics).toEqual({
      distance: 40_000,
      avgSpeed: undefined,
      elevationGain: 600,
    });
  });

  it("returns explicit unavailability instead of template defaults", () => {
    const estimation = estimateActivity(
      buildEstimationContext({
        userProfile: {},
        activityPlan: { activity_category: "run" },
      }),
    );

    expect(estimation).toMatchObject({
      load: null,
      duration: null,
      durationEstimate: { status: "unavailable", valueSeconds: null },
      confidence: null,
      confidenceScore: null,
      factors: [],
    });
    expect(estimation).not.toHaveProperty("intensityFactor");
    expect(estimation.warnings?.join(" ")).toContain("unavailable");
  });

  it("keeps batch failures unavailable instead of returning 50/3600/0.7 defaults", () => {
    const result = estimateActivityBatch(
      [
        {
          id: "invalid",
          activity_category: "bike",
          structure: { version: 2, intervals: [] },
        },
      ],
      { profile: { dob: null } },
    ).get("invalid");

    expect(result).toMatchObject({
      load: null,
      duration: null,
      durationEstimate: { status: "unavailable", valueSeconds: null },
      confidence: null,
      confidenceScore: null,
    });
    expect(result).not.toHaveProperty("intensityFactor");
    expect(result?.warnings).toEqual(["Estimation failed; unsupported facts remain unavailable."]);
  });
});
