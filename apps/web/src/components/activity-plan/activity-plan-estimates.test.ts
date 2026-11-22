import type { SemanticMetric } from "@repo/core";
import { describe, expect, it } from "vitest";
import { getActivityPlanEstimateItems } from "./activity-plan-estimates";

const objective = (value = 2_439 / 3_500): SemanticMetric => ({
  key: "objective_intensity",
  label: "Intensity",
  status: "available",
  value,
  unit: "ratio",
  reason: null,
  provenance: "estimated",
});

describe("getActivityPlanEstimateItems", () => {
  it("filters unknown totals from the headline while retaining an available objective ratio", () => {
    const metrics: SemanticMetric[] = [
      {
        key: "elapsed_duration",
        label: "Duration",
        status: "unavailable",
        value: null,
        unit: "seconds",
        reason: "source_missing",
        provenance: null,
      },
      {
        key: "common_load",
        label: "Load",
        status: "unavailable",
        value: null,
        unit: "score",
        reason: "no_load_data",
        provenance: null,
      },
      objective(),
    ];

    expect(getActivityPlanEstimateItems(metrics)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "objective_intensity",
          label: "Intensity",
          value: "~0.70",
        }),
      ]),
    );
  });

  it("never falls back to normalized, RPE, or cadence metrics", () => {
    const metrics: SemanticMetric[] = [
      {
        key: "normalized_intensity",
        label: "Normalized intensity",
        status: "available",
        value: 0.82,
        unit: "ratio",
        reason: null,
        provenance: "personalized",
      },
      {
        key: "average_power",
        label: "RPE",
        status: "available",
        value: 8,
        unit: "rpe_0_10",
        reason: null,
      },
    ];
    expect(getActivityPlanEstimateItems(metrics)).toEqual([]);
  });

  it("omits an unavailable objective result from the headline", () => {
    expect(
      getActivityPlanEstimateItems([
        {
          ...objective(),
          status: "unavailable",
          value: null,
          reason: "incomplete_objective_coverage",
          provenance: null,
        },
      ]),
    ).toEqual([]);
  });

  it("renders exact authored values normally and hides partial numeric evidence", () => {
    expect(
      getActivityPlanEstimateItems([
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
          key: "distance",
          label: "Distance",
          status: "partial",
          value: 1_000,
          unit: "meters",
          reason: "incomplete_members",
          provenance: "estimated",
        },
      ]),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "elapsed_duration", value: "1h" })]),
    );
  });

  it("retains an available zero rather than treating it as unknown", () => {
    expect(
      getActivityPlanEstimateItems([
        {
          key: "common_load",
          label: "Load",
          status: "available",
          value: 0,
          unit: "score",
          reason: null,
          provenance: "authored",
        },
      ]),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "common_load", value: "0" })]),
    );
  });
});
