import { describe, expect, it } from "vitest";
import {
  socialCommentEntityTypeSchema,
  socialCommentEntityTypeValues,
  socialLikeEntityTypeSchema,
  socialLikeEntityTypeValues,
} from "../engagement";

describe("social engagement taxonomy", () => {
  it("keeps likes restricted to persisted engagement targets", () => {
    expect(socialLikeEntityTypeValues).toEqual([
      "activity",
      "training_plan",
      "activity_plan",
      "route",
    ]);
    expect(socialLikeEntityTypeSchema.safeParse("event").success).toBe(false);
  });

  it("allows comments on the additional event target", () => {
    expect(socialCommentEntityTypeValues).toEqual([...socialLikeEntityTypeValues, "event"]);
    expect(socialCommentEntityTypeSchema.parse("event")).toBe("event");
  });
});
