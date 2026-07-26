import { describe, expect, it } from "vitest";
import { getAuthoritativeActivityPlanMetrics } from "./activityPlanMetrics";

describe("getAuthoritativeActivityPlanMetrics", () => {
  it("keeps an explicit authoritative null", () => {
    const metrics = getAuthoritativeActivityPlanMetrics({
      authoritative_metrics: { estimated_distance: null },
    });

    expect(metrics.estimated_distance).toBeNull();
  });

  it("treats an absent authoritative metric as unavailable", () => {
    const metrics = getAuthoritativeActivityPlanMetrics({
      authoritative_metrics: { estimated_duration: 3_600 },
    });

    expect(metrics.estimated_distance).toBeUndefined();
  });
});
