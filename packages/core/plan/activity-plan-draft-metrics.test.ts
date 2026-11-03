import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../activity-plan";
import { createUnavailableAthletePerformanceTargetFacts } from "../performance-model";
import { activityPlanDraftMetrics } from "./activity-plan-draft-metrics";

const asOf = "2026-10-01T00:00:00.000Z";
const timedStructure = {
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "repeat",
      id: "00000000-0000-4000-8000-000000000001",
      count: 2,
      steps: [
        {
          type: "step",
          id: "00000000-0000-4000-8000-000000000002",
          duration: { type: "time", seconds: 60 },
          targets: [],
        },
      ],
    },
  ],
};
const bikeStructure = {
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "repeat",
      id: "00000000-0000-4000-8000-000000000011",
      count: 2,
      steps: [
        {
          type: "step",
          id: "00000000-0000-4000-8000-000000000012",
          name: "Work",
          duration: { type: "time" as const, seconds: 300 },
          targets: [{ type: "%FTP" as const, intensity: 75 }],
        },
      ],
    },
  ],
};
describe("activityPlanDraftMetrics", () => {
  it("returns the canonical metric set without inventing athlete-dependent values", () => {
    expect(
      activityPlanDraftMetrics(
        timedStructure,
        createUnavailableAthletePerformanceTargetFacts(asOf),
      ),
    ).toMatchObject([
      { key: "distance", status: "unavailable", value: null },
      { key: "elapsed_duration", status: "available", value: 120, provenance: "authored" },
      { key: "common_load", status: "unavailable", value: null },
      { key: "objective_intensity", status: "unavailable", value: null },
    ]);
  });
  it("returns no metrics for an invalid draft structure", () => {
    expect(
      activityPlanDraftMetrics(
        { ...timedStructure, version: 3 },
        createUnavailableAthletePerformanceTargetFacts(asOf),
      ),
    ).toEqual([]);
  });
  it("uses canonical distance, duration, load, and intensity metrics including repeats", () => {
    const metrics = activityPlanDraftMetrics(
      bikeStructure,
      createUnavailableAthletePerformanceTargetFacts(asOf),
    );
    expect(metrics.find((metric) => metric.key === "elapsed_duration")).toMatchObject({
      status: "available",
      value: 600,
      provenance: "authored",
    });
    expect(metrics.find((metric) => metric.key === "objective_intensity")).toMatchObject({
      status: "available",
      value: 0.75,
      provenance: "estimated",
    });
    expect(metrics.find((metric) => metric.key === "common_load")).toMatchObject({
      status: "available",
      value: expect.any(Number),
      provenance: "estimated",
    });
    expect(metrics.find((metric) => metric.key === "distance")).toMatchObject({
      status: "unavailable",
      value: null,
    });
  });
  it("preserves authored distance without inventing duration or absolute-target calibration", () => {
    const repeat = bikeStructure.items[0];
    if (!repeat || repeat.type !== "repeat") throw new Error("Expected bike repeat");
    const step = repeat.steps[0];
    if (!step) throw new Error("Expected bike step");
    const distancePlan = activityPlanStructureSchema.parse({
      ...bikeStructure,
      items: [
        {
          ...repeat,
          steps: [
            {
              ...step,
              duration: { type: "distance", meters: 1500 },
              targets: [{ type: "watts", intensity: 200 }],
            },
          ],
        },
      ],
    });
    const metrics = activityPlanDraftMetrics(
      distancePlan,
      createUnavailableAthletePerformanceTargetFacts(asOf),
    );
    expect(metrics.find((metric) => metric.key === "distance")).toMatchObject({
      status: "available",
      value: 3000,
      provenance: "authored",
    });
    expect(metrics.find((metric) => metric.key === "elapsed_duration")).toMatchObject({
      status: "unavailable",
      value: null,
    });
    expect(metrics.find((metric) => metric.key === "objective_intensity")).toMatchObject({
      status: "unavailable",
      value: null,
      reason: "calibration_required",
    });
  });
  it("fails closed for raw invalid quantities rather than treating them as estimates", () => {
    const rawInvalidStructure = structuredClone(bikeStructure) as Record<string, unknown>;
    rawInvalidStructure.items = [
      {
        type: "repeat",
        id: "00000000-0000-4000-8000-000000000011",
        count: 2,
        steps: [
          {
            type: "step",
            id: "00000000-0000-4000-8000-000000000012",
            duration: { type: "time", seconds: "600" },
            targets: [],
          },
        ],
      },
    ];
    expect(
      activityPlanDraftMetrics(
        rawInvalidStructure,
        createUnavailableAthletePerformanceTargetFacts(asOf),
      ),
    ).toEqual([]);
  });
});
