import { describe, expect, it } from "vitest";
import {
  computeOptimalLoadBalance,
  getAgeAdjustedLongTermLoadTimeConstant,
  getAgeAdjustedRampRateMultiplier,
  getAgeAdjustedRecentLoadTimeConstant,
  getMaxSustainableLongTermLoad,
  getPaceBaseline,
} from "../calibration-constants";

describe("age-adjusted calibration constants", () => {
  it("uses smooth RecentLoad progression across age", () => {
    expect(getAgeAdjustedRecentLoadTimeConstant(undefined)).toBe(7);
    expect(getAgeAdjustedRecentLoadTimeConstant(14)).toBeGreaterThanOrEqual(7);
    expect(getAgeAdjustedRecentLoadTimeConstant(35)).toBeLessThanOrEqual(
      getAgeAdjustedRecentLoadTimeConstant(45),
    );
    expect(getAgeAdjustedRecentLoadTimeConstant(55)).toBeGreaterThanOrEqual(
      getAgeAdjustedRecentLoadTimeConstant(45),
    );
  });

  it("uses smooth LongTermLoad progression across age", () => {
    expect(getAgeAdjustedLongTermLoadTimeConstant(undefined)).toBe(42);
    expect(getAgeAdjustedLongTermLoadTimeConstant(14)).toBeGreaterThanOrEqual(42);
    expect(getAgeAdjustedLongTermLoadTimeConstant(45)).toBeGreaterThanOrEqual(42);
    expect(getAgeAdjustedLongTermLoadTimeConstant(60)).toBeGreaterThanOrEqual(
      getAgeAdjustedLongTermLoadTimeConstant(45),
    );
  });

  it("provides age-adjusted max sustainable LongTermLoad", () => {
    expect(getMaxSustainableLongTermLoad(undefined)).toBe(120);
    expect(getMaxSustainableLongTermLoad(14)).toBeLessThan(getMaxSustainableLongTermLoad(25));
    expect(getMaxSustainableLongTermLoad(32)).toBeGreaterThan(getMaxSustainableLongTermLoad(45));
    expect(getMaxSustainableLongTermLoad(60)).toBeLessThan(getMaxSustainableLongTermLoad(45));
  });

  it("provides age-adjusted ramp rate multipliers", () => {
    expect(getAgeAdjustedRampRateMultiplier(undefined)).toBe(0.8);
    expect(getAgeAdjustedRampRateMultiplier(14)).toBeLessThan(getAgeAdjustedRampRateMultiplier(20));
    expect(getAgeAdjustedRampRateMultiplier(32)).toBeGreaterThan(
      getAgeAdjustedRampRateMultiplier(45),
    );
    expect(getAgeAdjustedRampRateMultiplier(55)).toBeLessThan(getAgeAdjustedRampRateMultiplier(45));
  });

  it("keeps optimal LoadBalance continuous as event duration changes", () => {
    expect(computeOptimalLoadBalance(0.5)).toBeGreaterThan(computeOptimalLoadBalance(1.5));
    expect(computeOptimalLoadBalance(2)).toBeGreaterThanOrEqual(computeOptimalLoadBalance(4));
    expect(computeOptimalLoadBalance(8)).toBeLessThanOrEqual(computeOptimalLoadBalance(4));
  });

  it("keeps pace baselines continuous across distance changes", () => {
    expect(getPaceBaseline("run", 9.9)).toBeGreaterThanOrEqual(getPaceBaseline("run", 10.1));
    expect(getPaceBaseline("run", 21.1)).toBeGreaterThan(getPaceBaseline("run", 42.2));
    expect(getPaceBaseline("bike", 80)).toBeGreaterThan(getPaceBaseline("bike", 180));
  });
});
