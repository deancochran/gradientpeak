import { describe, expect, it } from "vitest";
import {
  addDaysDateOnlyUtc,
  diffDateOnlyUtcDays,
  formatDateOnlyUtc,
  isValidDateOnlyUtc,
  parseDateOnlyUtc,
} from "../dateOnlyUtc";

describe("date-only UTC helpers", () => {
  it("parses and formats date-only values without local timezone drift", () => {
    expect(formatDateOnlyUtc(parseDateOnlyUtc("2026-07-01"))).toBe("2026-07-01");
  });

  it("adds and diffs whole UTC days", () => {
    expect(addDaysDateOnlyUtc("2026-07-01", 6)).toBe("2026-07-07");
    expect(diffDateOnlyUtcDays("2026-07-01", "2026-07-07")).toBe(6);
  });

  it("validates canonical date-only strings by round-tripping parsed dates", () => {
    expect(isValidDateOnlyUtc("2026-02-28")).toBe(true);
    expect(isValidDateOnlyUtc("2026-02-31")).toBe(false);
    expect(isValidDateOnlyUtc("2026-2-28")).toBe(false);
    expect(isValidDateOnlyUtc("not-a-date")).toBe(false);
  });
});
