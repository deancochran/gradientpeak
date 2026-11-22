import { describe, expect, it } from "vitest";
import { calculateRecentLoad } from "../../load/progression";
import {
  getAgeAdjustedRampRateMultiplier,
  getGenderAdjustedFatigueTimeMultiplier,
  getGenderAdjustedRecoveryLoadMultiplier,
  getMaxSustainableLongTermLoad,
  getPersonalizedRecentLoadTimeConstant,
} from "../calibration-constants";

describe("age and gender personalization", () => {
  it("applies female fatigue-time multiplier > male", () => {
    expect(getGenderAdjustedFatigueTimeMultiplier("male")).toBe(1);
    expect(getGenderAdjustedFatigueTimeMultiplier("female")).toBeGreaterThan(1);
  });

  it("increases RecentLoad time constant for same-age female vs male", () => {
    const maleRecentLoadTc = getPersonalizedRecentLoadTimeConstant(45, "male");
    const femaleRecentLoadTc = getPersonalizedRecentLoadTimeConstant(45, "female");

    expect(femaleRecentLoadTc).toBeGreaterThan(maleRecentLoadTc);
  });

  it("uses age-only behavior when gender is null or undefined", () => {
    const baseline = getPersonalizedRecentLoadTimeConstant(45);
    const nullGender = getPersonalizedRecentLoadTimeConstant(45, null);

    expect(nullGender).toBe(baseline);
  });

  it("produces slower RecentLoad decay for same-age female vs male", () => {
    const male = calculateRecentLoad(100, 0, 45, "male");
    const female = calculateRecentLoad(100, 0, 45, "female");

    expect(female).toBeGreaterThan(male);
  });

  it("uses smoother age relationships with stricter youth safety defaults", () => {
    expect(getAgeAdjustedRampRateMultiplier(17.5)).toBeLessThan(
      getAgeAdjustedRampRateMultiplier(18.5),
    );
    expect(getMaxSustainableLongTermLoad(14)).toBeLessThan(getMaxSustainableLongTermLoad(25));
    expect(getMaxSustainableLongTermLoad(39)).toBeGreaterThan(getMaxSustainableLongTermLoad(41));
  });

  it("keeps gender recovery modulation bounded and recovery-only", () => {
    expect(getGenderAdjustedRecoveryLoadMultiplier("male")).toBe(1);
    expect(getGenderAdjustedRecoveryLoadMultiplier("female")).toBeGreaterThan(1);
    expect(getGenderAdjustedRecoveryLoadMultiplier("female")).toBeLessThan(1.1);
  });
});
