import { activityPlanMetricListSchema } from "@repo/core";
import { describe, expect, it } from "vitest";
import { mobileCardFixtures } from "./mobile-card-fixtures";

describe("mobile card fixtures", () => {
  it("loads the activity-plan fixture with the canonical headline metric contract", () => {
    expect(
      activityPlanMetricListSchema.safeParse(mobileCardFixtures.activityPlan.metrics).success,
    ).toBe(true);
  });
});
