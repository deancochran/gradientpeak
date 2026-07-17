import { describe, expect, it } from "vitest";
import { getAuthoritativeActivityPlanMetrics } from "./activityPlanMetrics";

describe("getAuthoritativeActivityPlanMetrics", () => {
  it("keeps an explicit authoritative null instead of a stale top-level value", () => {
    const metrics = getAuthoritativeActivityPlanMetrics({
      estimated_distance: 12_000,
      authoritative_metrics: { estimated_distance: null },
    });

    expect(metrics.estimated_distance).toBeNull();
  });

  it("falls back to the top-level value when the authoritative field is absent", () => {
    const metrics = getAuthoritativeActivityPlanMetrics({
      estimated_distance: 12_000,
      authoritative_metrics: { estimated_duration: 3_600 },
    });

    expect(metrics.estimated_distance).toBe(12_000);
  });
});
