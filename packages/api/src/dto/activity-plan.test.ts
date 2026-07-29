import { describe, expect, it } from "vitest";
import { activityPlanExecutionDtoSchema, hasActivityPlanExecutionDto } from "./activity-plan";

describe("activityPlanExecutionDtoSchema", () => {
  it("exposes only the canonical activity_category", () => {
    expect(hasActivityPlanExecutionDto({ activity_category: "bike" })).toBe(true);
  });

  it.each([
    {
      activity_category: "bogus",
    },
    {
      activity_category: null,
    },
    {
      activity_category: "bike",
      activity_categories: ["bike"],
    },
  ])("rejects malformed execution DTO %#", (value) => {
    expect(activityPlanExecutionDtoSchema.safeParse(value).success).toBe(false);
    expect(hasActivityPlanExecutionDto(value)).toBe(false);
  });
});
