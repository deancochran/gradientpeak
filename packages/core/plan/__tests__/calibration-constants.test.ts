import { describe, expect, it } from "vitest";
import {
  computeOptimalTsb,
  getAgeAdjustedATLTimeConstant,
  getAgeAdjustedCTLTimeConstant,
  getAgeAdjustedRampRateMultiplier,
  getMaxSustainableCTL,
  getPaceBaseline,
} from "../calibration-constants";

describe("age-adjusted calibration constants", () => {
  it("uses smooth ATL progression across age", () => {
    expect(getAgeAdjustedATLTimeConstant(undefined)).toBe(7);
    expect(getAgeAdjustedATLTimeConstant(14)).toBeGreaterThanOrEqual(7);
    expect(getAgeAdjustedATLTimeConstant(35)).toBeLessThanOrEqual(
      getAgeAdjustedATLTimeConstant(45),
    );
    expect(getAgeAdjustedATLTimeConstant(55)).toBeGreaterThanOrEqual(
      getAgeAdjustedATLTimeConstant(45),
    );
  });

  it("uses smooth CTL progression across age", () => {
    expect(getAgeAdjustedCTLTimeConstant(undefined)).toBe(42);
    expect(getAgeAdjustedCTLTimeConstant(14)).toBeGreaterThanOrEqual(42);
    expect(getAgeAdjustedCTLTimeConstant(45)).toBeGreaterThanOrEqual(42);
    expect(getAgeAdjustedCTLTimeConstant(60)).toBeGreaterThanOrEqual(
      getAgeAdjustedCTLTimeConstant(45),
    );
  });

  it("provides age-adjusted max sustainable CTL", () => {
    expect(getMaxSustainableCTL(undefined)).toBe(120);
    expect(getMaxSustainableCTL(14)).toBeLessThan(getMaxSustainableCTL(25));
    expect(getMaxSustainableCTL(32)).toBeGreaterThan(getMaxSustainableCTL(45));
    expect(getMaxSustainableCTL(60)).toBeLessThan(getMaxSustainableCTL(45));
  });

  it("provides age-adjusted ramp rate multipliers", () => {
    expect(getAgeAdjustedRampRateMultiplier(undefined)).toBe(0.8);
    expect(getAgeAdjustedRampRateMultiplier(14)).toBeLessThan(getAgeAdjustedRampRateMultiplier(20));
    expect(getAgeAdjustedRampRateMultiplier(32)).toBeGreaterThan(
      getAgeAdjustedRampRateMultiplier(45),
    );
    expect(getAgeAdjustedRampRateMultiplier(55)).toBeLessThan(getAgeAdjustedRampRateMultiplier(45));
  });

  it("keeps optimal TSB continuous as event duration changes", () => {
    expect(computeOptimalTsb(0.5)).toBeGreaterThan(computeOptimalTsb(1.5));
    expect(computeOptimalTsb(2)).toBeGreaterThanOrEqual(computeOptimalTsb(4));
    expect(computeOptimalTsb(8)).toBeLessThanOrEqual(computeOptimalTsb(4));
  });

  it("keeps pace baselines continuous across distance changes", () => {
    expect(getPaceBaseline("run", 9.9)).toBeGreaterThanOrEqual(getPaceBaseline("run", 10.1));
    expect(getPaceBaseline("run", 21.1)).toBeGreaterThan(getPaceBaseline("run", 42.2));
    expect(getPaceBaseline("bike", 80)).toBeGreaterThan(getPaceBaseline("bike", 180));
  });
});
