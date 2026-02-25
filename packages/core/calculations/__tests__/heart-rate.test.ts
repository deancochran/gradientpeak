import { describe, it, expect } from "vitest";
import {
  calculateVO2MaxFromHR,
  estimateLTHR,
  estimateMaxHRFromAge,
  calculateHRReserve,
  calculateTargetHR,
  calculateHRZones,
} from "../heart-rate";

describe("calculateVO2MaxFromHR", () => {
  it("should calculate VO2max from HR data", () => {
    const vo2max = calculateVO2MaxFromHR(190, 55);
    expect(vo2max).toBeCloseTo(52.85, 1);
  });

  it("should return higher VO2max for lower resting HR", () => {
    const vo2max1 = calculateVO2MaxFromHR(190, 70);
    const vo2max2 = calculateVO2MaxFromHR(190, 55);
    expect(vo2max2).toBeGreaterThan(vo2max1);
  });

  it("should throw error for invalid HR values", () => {
    expect(() => calculateVO2MaxFromHR(0, 60)).toThrow();
    expect(() => calculateVO2MaxFromHR(150, 0)).toThrow();
    expect(() => calculateVO2MaxFromHR(150, 160)).toThrow(
      "Max HR must be greater than resting HR",
    );
  });

  it("should clamp to reasonable limits", () => {
    const tooLow = calculateVO2MaxFromHR(100, 99);
    expect(tooLow).toBeGreaterThanOrEqual(20);

    const tooHigh = calculateVO2MaxFromHR(220, 30);
    expect(tooHigh).toBeLessThanOrEqual(100);
  });
});

describe("estimateLTHR", () => {
  it("should estimate LTHR as 85% of max HR", () => {
    const lthr = estimateLTHR(190);
    expect(lthr).toBe(162);
  });

  it("should round to nearest integer", () => {
    const lthr = estimateLTHR(185);
    expect(lthr).toBe(Math.round(185 * 0.85));
  });

  it("should throw error for invalid max HR", () => {
    expect(() => estimateLTHR(0)).toThrow();
    expect(() => estimateLTHR(-10)).toThrow();
    expect(() => estimateLTHR(300)).toThrow();
  });
});

describe("estimateMaxHRFromAge", () => {
  it("should estimate max HR using 220 - age formula", () => {
    expect(estimateMaxHRFromAge(30)).toBe(190);
    expect(estimateMaxHRFromAge(40)).toBe(180);
    expect(estimateMaxHRFromAge(50)).toBe(170);
  });

  it("should throw error for invalid age", () => {
    expect(() => estimateMaxHRFromAge(0)).toThrow();
    expect(() => estimateMaxHRFromAge(-5)).toThrow();
    expect(() => estimateMaxHRFromAge(150)).toThrow();
  });
});

describe("calculateHRReserve", () => {
  it("should calculate HR reserve", () => {
    const hrr = calculateHRReserve(190, 55);
    expect(hrr).toBe(135);
  });

  it("should throw error for invalid inputs", () => {
    expect(() => calculateHRReserve(150, 160)).toThrow();
  });
});

describe("calculateTargetHR", () => {
  it("should calculate target HR using Karvonen formula", () => {
    const targetHR = calculateTargetHR(190, 55, 0.7);
    expect(targetHR).toBe(150); // ((190-55) * 0.7) + 55 = 149.5 ≈ 150
  });

  it("should throw error for invalid intensity", () => {
    expect(() => calculateTargetHR(190, 55, -0.1)).toThrow();
    expect(() => calculateTargetHR(190, 55, 1.5)).toThrow();
  });
});

describe("calculateHRZones", () => {
  it("should calculate 5 HR zones", () => {
    const zones = calculateHRZones(190, 55);

    expect(zones.zone1).toBeDefined();
    expect(zones.zone2).toBeDefined();
    expect(zones.zone3).toBeDefined();
    expect(zones.zone4).toBeDefined();
    expect(zones.zone5).toBeDefined();
  });

  it("should have zones in ascending order", () => {
    const zones = calculateHRZones(190, 55);

    expect(zones.zone1.min).toBeLessThan(zones.zone1.max);
    expect(zones.zone1.max).toBeLessThanOrEqual(zones.zone2.min);
    expect(zones.zone2.max).toBeLessThanOrEqual(zones.zone3.min);
    expect(zones.zone3.max).toBeLessThanOrEqual(zones.zone4.min);
    expect(zones.zone4.max).toBeLessThanOrEqual(zones.zone5.min);
    expect(zones.zone5.max).toBe(190); // Max zone goes to max HR
  });
});
