import { describe, expect, it } from "vitest";
import {
  getAgeAdjustedATLTimeConstant,
  getAgeAdjustedCTLTimeConstant,
  getAgeAdjustedRampRateMultiplier,
  getMaxSustainableCTL,
} from "../calibration-constants";

describe("age-adjusted calibration constants", () => {
  it("uses expected ATL bucket boundaries", () => {
    expect(getAgeAdjustedATLTimeConstant(undefined)).toBe(7);
    expect(getAgeAdjustedATLTimeConstant(29)).toBe(7);
    expect(getAgeAdjustedATLTimeConstant(30)).toBe(8);
    expect(getAgeAdjustedATLTimeConstant(39)).toBe(8);
    expect(getAgeAdjustedATLTimeConstant(40)).toBe(11);
    expect(getAgeAdjustedATLTimeConstant(49)).toBe(11);
    expect(getAgeAdjustedATLTimeConstant(50)).toBe(13);
  });

  it("uses expected CTL bucket boundaries", () => {
    expect(getAgeAdjustedCTLTimeConstant(undefined)).toBe(42);
    expect(getAgeAdjustedCTLTimeConstant(39)).toBe(42);
    expect(getAgeAdjustedCTLTimeConstant(40)).toBe(45);
    expect(getAgeAdjustedCTLTimeConstant(49)).toBe(45);
    expect(getAgeAdjustedCTLTimeConstant(50)).toBe(48);
  });

  it("provides age-adjusted max sustainable CTL", () => {
    expect(getMaxSustainableCTL(undefined)).toBe(150);
    expect(getMaxSustainableCTL(29)).toBe(150);
    expect(getMaxSustainableCTL(30)).toBe(130);
    expect(getMaxSustainableCTL(40)).toBe(110);
    expect(getMaxSustainableCTL(50)).toBe(90);
  });

  it("provides age-adjusted ramp rate multipliers", () => {
    expect(getAgeAdjustedRampRateMultiplier(undefined)).toBe(1);
    expect(getAgeAdjustedRampRateMultiplier(39)).toBe(1);
    expect(getAgeAdjustedRampRateMultiplier(40)).toBe(0.85);
    expect(getAgeAdjustedRampRateMultiplier(50)).toBe(0.7);
  });
});
