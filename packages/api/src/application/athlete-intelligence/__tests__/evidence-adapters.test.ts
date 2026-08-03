import { describe, expect, it } from "vitest";
import { canonicalMetricValue } from "../evidence-adapters";

describe("athlete intelligence metric normalization", () => {
  it("retains metric-specific normalization outside the activity-effort domain", () => {
    expect(canonicalMetricValue("weight_kg", 10, "lbs")).toBeCloseTo(4.5359237);
    expect(canonicalMetricValue("weight_kg", 1, "horsepower")).toBeNull();
  });
});
