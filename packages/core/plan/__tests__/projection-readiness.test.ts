import { describe, expect, it } from "vitest";
import { computeProjectionFeasibilityMetadata } from "../projection/readiness";

describe("computeProjectionFeasibilityMetadata", () => {
  it("returns high readiness when demand is met with low clamp pressure", () => {
    const result = computeProjectionFeasibilityMetadata({
      requiredPeakWeeklyTssTarget: 420,
      feasiblePeakWeeklyTssApplied: 420,
      tssRampClampWeeks: 0,
      ctlRampClampWeeks: 0,
      confidence: 0.85,
      projectionWeeks: 12,
    });

    expect(result.readiness_band).toBe("high");
    expect(result.demand_gap.unmet_weekly_tss).toBe(0);
    expect(result.projection_uncertainty?.tss_likely).toBe(420);
  });

  it("returns lower readiness and limiters when demand exceeds caps", () => {
    const result = computeProjectionFeasibilityMetadata({
      requiredPeakWeeklyTssTarget: 560,
      feasiblePeakWeeklyTssApplied: 400,
      tssRampClampWeeks: 6,
      ctlRampClampWeeks: 5,
      confidence: 0.4,
      projectionWeeks: 12,
    });

    expect(result.readiness_band).toBe("low");
    expect(result.dominant_limiters).toContain("required_growth_exceeds_caps");
    expect(result.dominant_limiters).toContain("tss_ramp_cap_pressure");
    expect(result.dominant_limiters).toContain("ctl_ramp_cap_pressure");
  });
});
