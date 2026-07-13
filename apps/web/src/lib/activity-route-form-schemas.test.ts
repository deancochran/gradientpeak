import { describe, expect, it } from "vitest";
import {
  activityEffortCategoryOptions,
  activityEffortFormSchema,
} from "./activity-route-form-schemas";

describe("activity effort form contract", () => {
  it("offers and validates only API-supported effort categories", () => {
    expect(activityEffortCategoryOptions.map((option) => option.value)).toEqual([
      "run",
      "bike",
      "swim",
    ]);

    expect(
      activityEffortFormSchema.safeParse({
        activity_category: "strength",
        duration_seconds: 60,
        effort_type: "power",
        recorded_at: "2026-07-13T12:00",
        unit: "W",
        value: 200,
      }).success,
    ).toBe(false);
  });
});
