import { describe, expect, it } from "vitest";
import { GROUP_SEARCH_MAX_LENGTH, normalizeGroupSearch } from "./groups-search";

describe("normalizeGroupSearch", () => {
  it("removes blank input and bounds a query before it reaches the group query", () => {
    expect(normalizeGroupSearch("  local club  ")).toBe("local club");
    expect(normalizeGroupSearch("   ")).toBeUndefined();
    expect(normalizeGroupSearch("x".repeat(GROUP_SEARCH_MAX_LENGTH + 1))).toHaveLength(
      GROUP_SEARCH_MAX_LENGTH,
    );
  });

  it("rejects non-string URL values", () => {
    expect(normalizeGroupSearch(["club"])).toBeUndefined();
  });
});
