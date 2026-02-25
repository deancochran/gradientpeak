import { describe, expect, it } from "vitest";
import { calculateATL } from "../../calculations";
import {
  getGenderAdjustedFatigueTimeMultiplier,
  getPersonalizedATLTimeConstant,
} from "../calibration-constants";

describe("age and gender personalization", () => {
  it("applies female fatigue-time multiplier > male", () => {
    expect(getGenderAdjustedFatigueTimeMultiplier("male")).toBe(1);
    expect(getGenderAdjustedFatigueTimeMultiplier("female")).toBeGreaterThan(1);
  });

  it("increases ATL time constant for same-age female vs male", () => {
    const maleAtlTc = getPersonalizedATLTimeConstant(45, "male");
    const femaleAtlTc = getPersonalizedATLTimeConstant(45, "female");

    expect(femaleAtlTc).toBeGreaterThan(maleAtlTc);
  });

  it("uses age-only behavior when gender is null or undefined", () => {
    const baseline = getPersonalizedATLTimeConstant(45);
    const nullGender = getPersonalizedATLTimeConstant(45, null);

    expect(nullGender).toBe(baseline);
  });

  it("produces slower ATL decay for same-age female vs male", () => {
    const male = calculateATL(100, 0, 45, "male");
    const female = calculateATL(100, 0, 45, "female");

    expect(female).toBeGreaterThan(male);
  });
});
