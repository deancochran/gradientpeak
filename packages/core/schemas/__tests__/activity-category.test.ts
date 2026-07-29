import { describe, expect, it } from "vitest";
import * as core from "../..";
import {
  activityEffortCategorySchema,
  canonicalActivityCategorySchema,
  canonicalActivityCategoryValues,
  goalTargetActivityCategorySchema,
  planningActivityCategorySchema,
} from "../activity-category";

describe("canonical activity_category contract", () => {
  it("owns the ordered activity-category vocabulary", () => {
    expect(canonicalActivityCategoryValues).toEqual(["run", "bike", "swim", "strength", "other"]);
    expect(canonicalActivityCategorySchema.options).toEqual(canonicalActivityCategoryValues);
  });

  it("exports the canonical schema and values from the public Core barrel", () => {
    expect(core.canonicalActivityCategorySchema).toBe(canonicalActivityCategorySchema);
    expect(core.canonicalActivityCategoryValues).toBe(canonicalActivityCategoryValues);
  });

  it("keeps named constrained schemas intentionally narrower or broader", () => {
    expect(activityEffortCategorySchema.options).toEqual(["run", "bike", "swim"]);
    expect(goalTargetActivityCategorySchema.options).toEqual(["run", "bike", "swim", "other"]);
    expect(planningActivityCategorySchema.safeParse("mixed").success).toBe(true);
  });
});
