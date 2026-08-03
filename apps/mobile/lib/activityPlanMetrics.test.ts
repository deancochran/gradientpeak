import { describe, expect, it } from "vitest";
import { createPrescriptionQuantificationBundleFixture } from "@/components/shared/__tests__/activityQuantificationFixture";
import { getActivityPlanQuantitySummary } from "./activityPlanMetrics";

describe("getActivityPlanQuantitySummary", () => {
  it("reads complete quantities from the canonical prescription bundle summary", () => {
    const summary = getActivityPlanQuantitySummary({
      prescriptionQuantification: createPrescriptionQuantificationBundleFixture({
        durationSeconds: 3_600,
        load: 64,
      }),
    });

    expect(summary).toMatchObject({
      commonIntensity: 0.8,
      distanceMeters: null,
      durationSeconds: 3_600,
    });
    expect(summary.commonLoad).toBeCloseTo(64);
  });

  it("treats an absent canonical bundle as unavailable", () => {
    expect(getActivityPlanQuantitySummary({})).toEqual({
      commonIntensity: null,
      commonLoad: null,
      distanceMeters: null,
      durationSeconds: null,
    });
  });

  it("does not promote partial Common Load to a complete scalar", () => {
    const summary = getActivityPlanQuantitySummary(
      createPrescriptionQuantificationBundleFixture({ status: "partial" }),
    );

    expect(summary.commonIntensity).toBeNull();
    expect(summary.commonLoad).toBeNull();
    expect(summary.durationSeconds).toBe(3_600);
  });
});
