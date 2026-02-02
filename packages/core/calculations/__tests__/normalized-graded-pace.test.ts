import { describe, expect, it } from "vitest";
import {
  calculateGradedSpeed,
  calculateNGP,
  getCostFactor,
} from "../normalized-graded-pace";

describe("Normalized Graded Pace", () => {
  describe("getCostFactor", () => {
    it("should return ~3.6 for 0 grade", () => {
      expect(getCostFactor(0)).toBeCloseTo(3.6, 1);
    });

    it("should return higher cost for uphill", () => {
      expect(getCostFactor(0.05)).toBeGreaterThan(getCostFactor(0));
    });

    it("should return lower cost for slight downhill", () => {
      expect(getCostFactor(-0.05)).toBeLessThan(getCostFactor(0));
    });
  });

  describe("calculateGradedSpeed", () => {
    it("should return same speed for 0 grade", () => {
      expect(calculateGradedSpeed(3.0, 0)).toBeCloseTo(3.0, 1);
    });

    it("should return higher speed for uphill (equivalent flat speed)", () => {
      // Running 3.0 m/s uphill is harder, so equivalent flat speed should be higher
      expect(calculateGradedSpeed(3.0, 0.05)).toBeGreaterThan(3.0);
    });
  });

  describe("calculateNGP", () => {
    it("should return 0 for empty stream", () => {
      expect(calculateNGP([])).toBe(0);
    });

    it("should calculate NGP correctly", () => {
      // Constant speed
      const stream = Array(60).fill(3.0);
      expect(calculateNGP(stream)).toBeCloseTo(3.0, 1);
    });
  });
});
