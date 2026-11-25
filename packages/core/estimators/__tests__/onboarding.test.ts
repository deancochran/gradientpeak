import { describe, expect, it } from "vitest";
import { estimateMaxHR, estimateMaxHRFromDOB } from "../index";

describe("canonical onboarding estimators", () => {
  it("provides optional non-threshold onboarding estimates", () => {
    expect(estimateMaxHR(30).value).toBe(190);
    expect(estimateMaxHRFromDOB("1996-03-21")).toBe(190);
  });
});
