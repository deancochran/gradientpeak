import { describe, expect, it } from "vitest";

import {
  clampInteger,
  clampNumber,
  convertWeightFromKg,
  convertWeightToKg,
  formatDateOnly,
  formatNumberForInput,
  formatSecondsToHms,
  formatSecondsToMmSs,
  formatWeightForDisplay,
  getWeightBounds,
  normalizeDurationInput,
  normalizePaceInput,
  parseBoundedInteger,
  parseBoundedNumber,
  parseDateOnly,
  parseDateOnlyToDate,
  parseDistanceKmToMeters,
  parseHmsToSeconds,
  parseMmSsToSeconds,
  parseNumberOrUndefined,
  roundToDecimals,
} from "../fitness-inputs";

describe("fitness input utilities", () => {
  it("parses bounded numbers and integers", () => {
    expect(parseNumberOrUndefined(" 12.5 ")).toBe(12.5);
    expect(parseNumberOrUndefined("x")).toBeUndefined();
    expect(parseBoundedNumber("12.567", { min: 10, max: 20, decimals: 1 })).toBe(12.6);
    expect(parseBoundedNumber("3", { min: 5, max: 10 })).toBe(5);
    expect(parseBoundedInteger("8.7", { min: 1, max: 8 })).toBe(8);
  });

  it("clamps and formats numeric values", () => {
    expect(clampNumber(15, 0, 10)).toBe(10);
    expect(clampInteger(3.6, 0, 10)).toBe(4);
    expect(formatNumberForInput(12.345, 2)).toBe("12.35");
    expect(formatNumberForInput(Number.NaN)).toBe("");
    expect(roundToDecimals(8.88, 1)).toBe(8.9);
  });

  it("parses and formats date-only values", () => {
    const fallback = new Date("2026-03-21T12:00:00.000Z");

    expect(parseDateOnly("2026-03-21")).toBe("2026-03-21");
    expect(parseDateOnly("03/21/2026")).toBeUndefined();
    expect(formatDateOnly(new Date("2026-03-21T00:00:00.000Z"))).toBe("2026-03-21");
    expect(parseDateOnlyToDate("bad-date", fallback)).toBe(fallback);
    expect(parseDateOnlyToDate("2026-03-21").toISOString()).toContain("2026-03-21");
  });

  it("parses and normalizes duration and pace strings", () => {
    expect(parseHmsToSeconds("1:05:30")).toBe(3930);
    expect(parseMmSsToSeconds("4:15")).toBe(255);
    expect(formatSecondsToHms(3930)).toBe("1:05:30");
    expect(formatSecondsToMmSs(255)).toBe("4:15");
    expect(normalizeDurationInput("05:30")).toBe("0:05:30");
    expect(normalizeDurationInput("1:05:30")).toBe("1:05:30");
    expect(normalizePaceInput("04:15")).toBe("4:15");
    expect(normalizePaceInput("bad")).toBeUndefined();
  });

  it("parses positive distance kilometers to meters", () => {
    expect(parseDistanceKmToMeters("21.1")).toBe(21100);
    expect(parseDistanceKmToMeters("0")).toBeUndefined();
    expect(parseDistanceKmToMeters("bad")).toBeUndefined();
  });

  it("converts and formats weight values", () => {
    expect(convertWeightFromKg(70, "kg")).toBe(70);
    expect(convertWeightFromKg(70, "lbs")).toBeCloseTo(154.3234, 3);
    expect(convertWeightToKg(154.3234, "lbs")).toBeCloseTo(70, 3);
    expect(formatWeightForDisplay(70, "lbs")).toBe("154.3");
    expect(formatWeightForDisplay(null, "kg")).toBe("");
    expect(getWeightBounds("kg")).toEqual({ min: 30, max: 300 });
    expect(getWeightBounds("lbs")).toEqual({ min: 66.1, max: 661.4 });
  });
});
