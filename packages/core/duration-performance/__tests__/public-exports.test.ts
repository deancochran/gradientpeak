import {
  calculateRunningDurationPerformance,
  calculateStrengthOtherPerformance,
  calculateSwimmingDurationPerformance,
  canonicalQualifiedDurationEffortEvidenceSchema,
  durationPerformanceCalculationIdentitySchema,
  runningDurationPerformanceModelSchema,
  strengthOtherPerformanceModelSchema,
  swimmingDurationPerformanceModelSchema,
} from "@repo/core";
import { describe, expect, it } from "vitest";

describe("duration-performance public exports", () => {
  it("exposes the current foundation and category contracts from the Core root", () => {
    expect(canonicalQualifiedDurationEffortEvidenceSchema).toBeDefined();
    expect(durationPerformanceCalculationIdentitySchema).toBeDefined();
    expect(runningDurationPerformanceModelSchema).toBeDefined();
    expect(swimmingDurationPerformanceModelSchema).toBeDefined();
    expect(strengthOtherPerformanceModelSchema).toBeDefined();
    expect(calculateRunningDurationPerformance).toBeTypeOf("function");
    expect(calculateSwimmingDurationPerformance).toBeTypeOf("function");
    expect(calculateStrengthOtherPerformance).toBeTypeOf("function");
  });
});
