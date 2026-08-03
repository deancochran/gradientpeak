import { describe, expect, it } from "vitest";

import { estimateMaxHRFromDOB } from "../defaults";

describe("onboarding estimation helpers", () => {
  it("estimates max hr from a valid dob", () => {
    expect(estimateMaxHRFromDOB("1996-03-21")).toBe(190);
  });

  it("returns null for missing or invalid dob", () => {
    expect(estimateMaxHRFromDOB(null)).toBeNull();
    expect(estimateMaxHRFromDOB("not-a-date")).toBeNull();
  });
});
