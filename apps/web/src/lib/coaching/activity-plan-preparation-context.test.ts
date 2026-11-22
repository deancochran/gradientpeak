import { describe, expect, it } from "vitest";
import {
  parseActivityPlanPreparationContext,
  parseActivityPlanPreparationSearch,
} from "./activity-plan-preparation-context";

const valid = {
  athleteId: "22222222-2222-4222-8222-222222222222",
  organizationId: "11111111-1111-4111-8111-111111111111",
  planningDate: "2026-11-12",
  returnTo: "athlete-workspace",
};

describe("activity plan preparation URL context", () => {
  it("accepts only the closed athlete-workspace return target and real dates", () => {
    expect(parseActivityPlanPreparationContext(valid)).toEqual(valid);
    expect(
      parseActivityPlanPreparationContext({ ...valid, planningDate: "2026-02-30" }),
    ).toBeNull();
    expect(parseActivityPlanPreparationContext({ ...valid, returnTo: "/settings" })).toBeNull();
  });

  it("does not retain an arbitrary selected plan id", () => {
    expect(parseActivityPlanPreparationSearch({ ...valid, activityPlanId: "not-an-id" })).toEqual(
      valid,
    );
  });
});
