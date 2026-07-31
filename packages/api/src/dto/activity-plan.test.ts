import { describe, expect, it } from "vitest";
import { activityPlanExecutionDtoSchema } from "./activity-plan";

describe("activityPlanExecutionDtoSchema", () => {
  it("exposes only the canonical activity_category", () => {
    expect(activityPlanExecutionDtoSchema.parse({ activity_category: "bike" })).toEqual({
      activity_category: "bike",
    });
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
  });
});
