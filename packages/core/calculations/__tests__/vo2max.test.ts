import { describe, expect, it } from "vitest";
import { estimateVO2Max } from "../vo2max";

describe("VO2 Max Estimation", () => {
  it("should estimate VO2 Max correctly", () => {
    // Formula: 15.3 * (MaxHR / RestingHR)
    // 15.3 * (190 / 60) = 15.3 * 3.166... = 48.45
    expect(estimateVO2Max(190, 60)).toBeCloseTo(48.45, 1);
  });

  it("should return 0 for invalid inputs", () => {
    expect(estimateVO2Max(0, 60)).toBe(0);
    expect(estimateVO2Max(190, 0)).toBe(0);
  });
});
