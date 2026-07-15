import { describe, expect, it } from "vitest";
import {
  calculateDateOfBirthAge,
  formatDateOfBirth,
  isValidDateOfBirth,
  parseDateOfBirth,
} from "../date-of-birth";

describe("date-of-birth", () => {
  it("only accepts real YYYY-MM-DD calendar dates", () => {
    expect(isValidDateOfBirth("1990-02-03")).toBe(true);
    expect(isValidDateOfBirth("1990-02-30")).toBe(false);
    expect(isValidDateOfBirth("1990-02-03T00:00:00.000Z")).toBe(false);
  });

  it("persists and formats DOBs at UTC midnight without local-date drift", () => {
    const parsed = parseDateOfBirth("1990-02-03");
    expect(parsed?.toISOString()).toBe("1990-02-03T00:00:00.000Z");
    expect(formatDateOfBirth(new Date("1990-02-03T23:00:00-08:00"))).toBe("1990-02-04");
  });

  it("calculates age on calendar birthday boundaries", () => {
    expect(calculateDateOfBirthAge("1990-07-12", new Date("2026-07-11T23:59:59Z"))).toBe(35);
    expect(calculateDateOfBirthAge("1990-07-12", new Date("2026-07-12T00:00:00Z"))).toBe(36);
  });
});
