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

  it("normalizes an absent canonical bundle to zero planned quantities", () => {
    expect(getActivityPlanQuantitySummary({})).toEqual({
      commonIntensity: 0,
      commonLoad: 0,
      distanceMeters: null,
      durationSeconds: 0,
    });
  });

  it("normalizes partial planned Common Load to zero", () => {
    const summary = getActivityPlanQuantitySummary(
      createPrescriptionQuantificationBundleFixture({ status: "partial" }),
    );

    expect(summary.commonIntensity).toBe(0);
    expect(summary.commonLoad).toBe(0);
    expect(summary.durationSeconds).toBe(3_600);
  });
});
