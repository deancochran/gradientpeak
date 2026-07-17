import { describe, expect, it } from "vitest";
import {
  contentVisibilitySchema,
  contentVisibilityToLegacyPrivateFlag,
  defaultContentVisibilitySchema,
  legacyPrivateFlagToContentVisibility,
} from "../content_visibility";

describe("content visibility", () => {
  it("accepts the canonical private/followers/public values", () => {
    expect(contentVisibilitySchema.options).toEqual(["private", "followers", "public"]);
  });

  it("defaults omitted profile/content visibility to private", () => {
    expect(defaultContentVisibilitySchema.parse(undefined)).toBe("private");
  });

  it("maps legacy boolean activity visibility to the canonical contract", () => {
    expect(legacyPrivateFlagToContentVisibility(true)).toBe("private");
    expect(legacyPrivateFlagToContentVisibility(false)).toBe("followers");
    expect(contentVisibilityToLegacyPrivateFlag("private")).toBe(true);
    expect(contentVisibilityToLegacyPrivateFlag("followers")).toBe(false);
    expect(contentVisibilityToLegacyPrivateFlag("public")).toBe(false);
  });
});
