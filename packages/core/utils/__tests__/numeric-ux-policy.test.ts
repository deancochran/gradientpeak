import { describe, expect, it } from "vitest";
import { alignNumberToStep, nudgeNumberByStep, numericUxPolicies } from "../numeric-ux-policy";

describe("numeric UX policy", () => {
  it("uses explicit policy defaults", () => {
    expect(numericUxPolicies.shortDurationSeconds.adjustmentStep).toBe(5);
    expect(numericUxPolicies.weeklyBudgetMinutes.adjustmentStep).toBe(15);
    expect(numericUxPolicies.weight.adjustmentStep).toBe(0.1);
  });

  it("aligns slider changes to canonical multiples instead of min-relative values", () => {
    expect(
      alignNumberToStep(6, {
        min: 1,
        max: 20,
        step: numericUxPolicies.plannedPowerWatts.sliderStep,
      }),
    ).toBe(5);
    expect(
      alignNumberToStep(-1.2, { min: -10, max: 10, step: numericUxPolicies.grade.sliderStep }),
    ).toBe(-1);
  });

  it("nudges an off-step exact value toward the next canonical point and respects bounds", () => {
    const policy = { min: 0, max: 200, step: numericUxPolicies.plannedBpm.adjustmentStep };
    expect(nudgeNumberByStep(153, 1, policy)).toBe(155);
    expect(nudgeNumberByStep(153, -1, policy)).toBe(150);
    expect(
      nudgeNumberByStep(1, -1, { min: 1, max: 10, step: numericUxPolicies.count.adjustmentStep }),
    ).toBe(1);
  });
});
