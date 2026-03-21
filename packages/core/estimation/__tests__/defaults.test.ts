import { describe, expect, it } from "vitest";

import { estimateConservativeFTPFromWeight, estimateMaxHRFromDOB } from "../defaults";

describe("onboarding estimation helpers", () => {
  it("estimates conservative ftp from valid weight", () => {
    expect(estimateConservativeFTPFromWeight(70)).toBe(175);
  });

  it("returns null for missing or invalid ftp inputs", () => {
    expect(estimateConservativeFTPFromWeight(null)).toBeNull();
    expect(estimateConservativeFTPFromWeight(0)).toBeNull();
  });

  it("estimates max hr from a valid dob", () => {
    expect(estimateMaxHRFromDOB("1996-03-21")).toBe(190);
  });

  it("returns null for missing or invalid dob", () => {
    expect(estimateMaxHRFromDOB(null)).toBeNull();
    expect(estimateMaxHRFromDOB("not-a-date")).toBeNull();
  });
});
