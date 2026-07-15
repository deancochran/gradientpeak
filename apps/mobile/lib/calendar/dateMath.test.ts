import { describe, expect, it } from "vitest";
import { parseDateKey, toDateKey } from "./dateMath";

describe("date-only calendar keys", () => {
  it("formats dates from local calendar fields", () => {
    expect(toDateKey(new Date(2026, 0, 2, 23, 30))).toBe("2026-01-02");
  });

  it("parses date-only values as local calendar dates", () => {
    const date = parseDateKey("2026-01-02");

    expect(toDateKey(date)).toBe("2026-01-02");
    expect(date.getHours()).toBe(12);
  });
});
