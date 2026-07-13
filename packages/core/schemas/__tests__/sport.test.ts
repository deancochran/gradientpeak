import { describe, expect, it } from "vitest";
import * as core from "../..";
import {
  activityEffortSportSchema,
  canonicalSportSchema,
  canonicalSportValues,
  goalTargetSportSchema,
  planningSportSchema,
} from "../sport";

describe("canonical sport contract", () => {
  it("owns the ordered activity-category vocabulary", () => {
    expect(canonicalSportValues).toEqual(["run", "bike", "swim", "strength", "other"]);
    expect(canonicalSportSchema.options).toEqual(canonicalSportValues);
  });

  it("exports the canonical schema and values from the public Core barrel", () => {
    expect(core.canonicalSportSchema).toBe(canonicalSportSchema);
    expect(core.canonicalSportValues).toBe(canonicalSportValues);
  });

  it("keeps named constrained schemas intentionally narrower or broader", () => {
    expect(activityEffortSportSchema.options).toEqual(["run", "bike", "swim"]);
    expect(goalTargetSportSchema.options).toEqual(["run", "bike", "swim", "other"]);
    expect(planningSportSchema.safeParse("mixed").success).toBe(true);
  });
});
