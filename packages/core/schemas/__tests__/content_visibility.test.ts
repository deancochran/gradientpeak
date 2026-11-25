import { describe, expect, it } from "vitest";
import { planZeroCorrectnessFixture } from "../../testing/plan-zero";
import { contentVisibilitySchema, defaultContentVisibilitySchema } from "../content_visibility";

describe("content visibility", () => {
  it("accepts the canonical private/followers/public values", () => {
    expect(contentVisibilitySchema.options).toEqual(planZeroCorrectnessFixture.visibility);
    expect(
      planZeroCorrectnessFixture.visibility.map((value) => contentVisibilitySchema.parse(value)),
    ).toEqual(planZeroCorrectnessFixture.visibility);
  });

  it("defaults omitted profile/content visibility to private", () => {
    expect(defaultContentVisibilitySchema.parse(undefined)).toBe("private");
  });

  it("rejects non-canonical visibility values", () => {
    expect(contentVisibilitySchema.safeParse("team").success).toBe(false);
  });
});
