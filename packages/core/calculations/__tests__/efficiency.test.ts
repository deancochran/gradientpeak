import { describe, expect, it } from "vitest";
import {
  calculateAerobicDecoupling,
  calculateEfficiencyFactor,
} from "../efficiency";

describe("Efficiency Metrics", () => {
  describe("calculateEfficiencyFactor", () => {
    it("should calculate EF correctly", () => {
      expect(calculateEfficiencyFactor(200, 140)).toBeCloseTo(1.429, 3);
    });

    it("should return 0 if HR is 0", () => {
      expect(calculateEfficiencyFactor(200, 0)).toBe(0);
    });
  });

  describe("calculateAerobicDecoupling", () => {
    it("should calculate decoupling correctly", () => {
      // EF1 = 1.5, EF2 = 1.4
      // Decoupling = (1.5 - 1.4) / 1.5 = 0.1 / 1.5 = 0.0666...
      expect(calculateAerobicDecoupling(1.5, 1.4)).toBeCloseTo(0.0667, 4);
    });

    it("should return negative decoupling if EF improves", () => {
      // EF1 = 1.4, EF2 = 1.5
      // Decoupling = (1.4 - 1.5) / 1.4 = -0.1 / 1.4 = -0.0714...
      expect(calculateAerobicDecoupling(1.4, 1.5)).toBeLessThan(0);
    });
  });
});
