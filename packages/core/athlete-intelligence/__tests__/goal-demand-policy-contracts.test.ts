import { describe, expect, it } from "vitest";
import {
  completeGoalDemandPolicyResultSchema,
  goalDemandPolicyInputSchema,
  goalDemandPolicyResultSchema,
  incompleteGoalDemandPolicyResultSchema,
  incompleteGoalDemandResult,
  unsupportedGoalDemandPolicyResultSchema,
  unsupportedGoalDemandResult,
} from "../goal-demand-policy-contracts";
import { sourceIdSchema } from "../lineage";

const goalSourceId = sourceIdSchema.parse("goal:external:race-42");

describe("goalDemandPolicyInputSchema", () => {
  const input = {
    policyVersion: "future-v1",
    athleteId: "athlete-1",
    goalSourceId,
    goalType: "race",
    sport: "cycling",
    distanceMeters: 160_934,
    targetDurationSeconds: null,
    targetPowerWatts: null,
    targetHeartRateBpm: null,
    routeDistanceMeters: 160_934,
    routeAscentMeters: 2_000,
    targetDate: "2027-07-10",
  };

  it("accepts a versioned future policy input without calculating demand", () => {
    expect(goalDemandPolicyInputSchema.parse(input)).toEqual(input);
  });

  it("requires the goal: source namespace", () => {
    expect(
      goalDemandPolicyInputSchema.safeParse({
        ...input,
        goalSourceId: "activity:race-42",
      }).success,
    ).toBe(false);
  });
});

describe("goal demand policy results", () => {
  it("requires missing fields for an incomplete result", () => {
    expect(
      incompleteGoalDemandPolicyResultSchema.safeParse({
        policyVersion: "future-v1",
        goalSourceId,
        state: "incomplete",
        reasonCodes: ["required_goal_data_missing"],
        missingFields: [],
      }).success,
    ).toBe(false);

    const result = incompleteGoalDemandResult({
      policyVersion: "future-v1",
      goalSourceId,
      reasonCodes: ["required_goal_data_missing"],
      missingFields: ["targetDurationSeconds"],
    });

    expect(goalDemandPolicyResultSchema.parse(result)).toEqual(result);
    expect(result).toEqual({
      policyVersion: "future-v1",
      goalSourceId,
      state: "incomplete",
      reasonCodes: ["required_goal_data_missing"],
      missingFields: ["targetDurationSeconds"],
    });
  });

  it("constructs an explicit versioned unsupported result", () => {
    const result = unsupportedGoalDemandResult({
      policyVersion: "future-v2",
      goalSourceId,
      reasonCodes: ["unsupported_goal_type"],
    });

    expect(unsupportedGoalDemandPolicyResultSchema.parse(result)).toEqual(result);
    expect(result).toEqual({
      policyVersion: "future-v2",
      goalSourceId,
      state: "unsupported",
      reasonCodes: ["unsupported_goal_type"],
      missingFields: [],
    });
  });

  it("cannot produce complete state before an approved demand contract exists", () => {
    expect(
      completeGoalDemandPolicyResultSchema.safeParse({
        policyVersion: "future-v1",
        goalSourceId,
        state: "complete",
        reasonCodes: [],
        missingFields: [],
      }).success,
    ).toBe(false);
  });

  it("rejects invented numeric capability demand output", () => {
    expect(
      unsupportedGoalDemandPolicyResultSchema.safeParse({
        policyVersion: "future-v1",
        goalSourceId,
        state: "unsupported",
        reasonCodes: ["unsupported_goal_type"],
        missingFields: [],
        requiredPowerWatts: 300,
      }).success,
    ).toBe(false);
  });

  it.each([
    "",
    "Unsupported-Goal",
    "1_invalid",
    "contains space",
  ])("rejects invalid reason code %j", (reasonCode) => {
    expect(
      unsupportedGoalDemandPolicyResultSchema.safeParse({
        policyVersion: "future-v1",
        goalSourceId,
        state: "unsupported",
        reasonCodes: [reasonCode],
        missingFields: [],
      }).success,
    ).toBe(false);
  });

  it("rejects empty reason codes", () => {
    expect(
      unsupportedGoalDemandPolicyResultSchema.safeParse({
        policyVersion: "future-v1",
        goalSourceId,
        state: "unsupported",
        reasonCodes: [],
        missingFields: [],
      }).success,
    ).toBe(false);
  });
});
