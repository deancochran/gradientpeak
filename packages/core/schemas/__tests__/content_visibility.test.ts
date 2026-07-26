import { describe, expect, it } from "vitest";
import { contentVisibilitySchema, defaultContentVisibilitySchema } from "../content_visibility";

describe("content visibility", () => {
  it("accepts the canonical private/followers/public values", () => {
    expect(contentVisibilitySchema.options).toEqual(["private", "followers", "public"]);
  });

  it("defaults omitted profile/content visibility to private", () => {
    expect(defaultContentVisibilitySchema.parse(undefined)).toBe("private");
  });

  it("rejects non-canonical visibility values", () => {
    expect(contentVisibilitySchema.safeParse("team").success).toBe(false);
  });
});
