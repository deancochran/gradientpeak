import { describe, expect, it } from "vitest";

import {
  formatDateOnly,
  formatSecondsToHms,
  normalizeDurationInput,
  normalizePaceInput,
  parseBoundedInteger,
  parseBoundedNumber,
  parseDateOnly,
  parseDistanceKmToMeters,
  parseHmsToSeconds,
  parseMmSsToSeconds,
} from "../input-parsers";

describe("input parsers", () => {
  it("parses and bounds numeric values", () => {
    expect(parseBoundedNumber("12.678", { min: 0, max: 20, decimals: 2 })).toBe(12.68);
    expect(parseBoundedNumber("-2", { min: 0, max: 10 })).toBe(0);
    expect(parseBoundedInteger("14.2", { min: 0, max: 14 })).toBe(14);
  });

  it("parses date and duration formats", () => {
    expect(parseDateOnly("2026-02-20")).toBe("2026-02-20");
    expect(parseDateOnly("02/20/2026")).toBeUndefined();
    expect(parseHmsToSeconds("1:05:30")).toBe(3930);
    expect(parseMmSsToSeconds("4:15")).toBe(255);
    expect(formatDateOnly(new Date(2026, 1, 20, 12, 0, 0))).toBe("2026-02-20");
  });

  it("normalizes duration and pace on blur-style parsing", () => {
    expect(normalizeDurationInput("20:00")).toBe("0:20:00");
    expect(normalizeDurationInput("1:02:03")).toBe("1:02:03");
    expect(normalizePaceInput("04:05")).toBe("4:05");
    expect(normalizePaceInput("abc")).toBeUndefined();
  });

  it("converts distance and formats seconds", () => {
    expect(parseDistanceKmToMeters("21.1")).toBe(21100);
    expect(parseDistanceKmToMeters("0")).toBeUndefined();
    expect(formatSecondsToHms(3661)).toBe("1:01:01");
  });
});
