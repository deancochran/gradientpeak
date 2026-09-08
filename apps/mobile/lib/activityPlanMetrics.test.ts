import { describe, expect, it } from "vitest";
import { createActivityPlanSummary } from "@/test/activity-plan-projection-fixture";
import { getActivityPlanQuantitySummary } from "./activityPlanMetrics";

describe("getActivityPlanQuantitySummary", () => {
  it("reads complete quantities from canonical projection metrics", () => {
    const summary = getActivityPlanQuantitySummary(
      createActivityPlanSummary({
        metrics: [
          {
            key: "distance",
            label: "Distance",
            status: "unavailable",
            value: null,
            unit: "meters",
            reason: "not_prescribed",
            provenance: null,
          },
          {
            key: "elapsed_duration",
            label: "Duration",
            status: "available",
            value: 3_600,
            unit: "seconds",
            reason: null,
            provenance: "authored",
          },
          {
            key: "common_load",
            label: "Load",
            status: "available",
            value: 64,
            unit: "score",
            reason: null,
            provenance: "estimated",
          },
          {
            key: "objective_intensity",
            label: "Intensity",
            status: "available",
            value: 0.8,
            unit: "ratio",
            reason: null,
            provenance: "estimated",
          },
        ],
      }),
    );

    expect(summary).toMatchObject({
      objectiveIntensity: 0.8,
      distanceMeters: null,
      durationSeconds: 3_600,
    });
    expect(summary.commonLoad).toBeCloseTo(64);
  });

  it("keeps an absent canonical bundle unavailable instead of substituting zero", () => {
    expect(getActivityPlanQuantitySummary({})).toEqual({
      objectiveIntensity: null,
      commonLoad: null,
      distanceMeters: null,
      durationSeconds: null,
    });
  });

  it("keeps partial planned Common Load unavailable instead of exposing a fragment", () => {
    const valid = createActivityPlanSummary();
    const summary = getActivityPlanQuantitySummary({
      ...valid,
      metrics: [
        {
          key: "distance",
          label: "Distance",
          status: "unavailable",
          value: null,
          unit: "meters",
          reason: "not_prescribed",
          provenance: null,
        },
        {
          key: "elapsed_duration",
          label: "Duration",
          status: "partial",
          value: 180,
          unit: "seconds",
          reason: "incomplete_members",
          provenance: "estimated",
        },
        {
          key: "common_load",
          label: "Load",
          status: "partial",
          value: 1.5,
          unit: "score",
          reason: "incomplete_members",
          provenance: "estimated",
        },
        {
          key: "objective_intensity",
          label: "Intensity",
          status: "unavailable",
          value: null,
          unit: "ratio",
          reason: "incomplete_members",
          provenance: null,
        },
      ],
    });

    expect(summary.objectiveIntensity).toBeNull();
    expect(summary.commonLoad).toBeNull();
    expect(summary.durationSeconds).toBeNull();
  });
});
