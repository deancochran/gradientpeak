import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./utils";

describe("formatRelativeTime", () => {
  it("returns an empty string for invalid timestamps", () => {
    expect(formatRelativeTime("not-a-date")).toBe("");
    expect(formatRelativeTime(new Date(Number.NaN))).toBe("");
  });

  it("formats older valid timestamps", () => {
    expect(formatRelativeTime("2026-03-04T12:00:00.000Z")).toBe("3/4/26");
  });
});
