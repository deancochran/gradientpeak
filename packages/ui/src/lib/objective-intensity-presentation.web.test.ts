import type { SemanticMetric } from "@repo/core";
import { describe, expect, it } from "vitest";
import { formatObjectiveIntensity } from "./objective-intensity-presentation";

describe("formatObjectiveIntensity", () => {
  it("formats only an available canonical objective ratio", () => {
    expect(
      formatObjectiveIntensity({
        key: "objective_intensity",
        label: "Intensity",
        status: "available",
        value: 2_439 / 3_500,
        unit: "ratio",
        reason: null,
        provenance: "estimated",
      }),
    ).toBe("~0.70");
  });

  it.each([
    undefined,
    {
      key: "objective_intensity",
      label: "Intensity",
      status: "unavailable",
      value: null,
      unit: "ratio",
      reason: "incomplete_objective_coverage",
      provenance: null,
    },
    {
      key: "normalized_intensity",
      label: "Normalized intensity",
      status: "available",
      value: 0.8,
      unit: "ratio",
      reason: null,
    },
  ] as Array<SemanticMetric | undefined>)("fails closed for non-objective input", (metric) => {
    expect(formatObjectiveIntensity(metric)).toBe("—");
  });
});
