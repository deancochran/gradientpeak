import { CYCLING_DURATION_PERFORMANCE_FIXTURE_V1 } from "../../../cycling-performance/__tests__/fixtures/cycling-duration-performance-v1";
import { calculateCyclingDurationPerformance } from "../../../cycling-performance/model";
import {
  OTHER_PERFORMANCE_FIXTURE_V1,
  RUNNING_DURATION_PERFORMANCE_FIXTURE_V1,
  STRENGTH_PERFORMANCE_FIXTURE_V1,
  SWIMMING_DURATION_PERFORMANCE_FIXTURE_V1,
} from "../../../duration-performance/__tests__/fixtures/duration-performance-v1";
import { calculateRunningDurationPerformance } from "../../../duration-performance/running";
import { calculateStrengthOtherPerformance } from "../../../duration-performance/strength-other";
import { calculateSwimmingDurationPerformance } from "../../../duration-performance/swimming";
import type { AthleteCapabilityCompositionInput } from "../../composition";
import type { CapabilityPlanningSelectionContext } from "../../planning";

/** Literal inputs and expectations; category calculations provide the canonical concept outputs. */
export const ATHLETE_CAPABILITY_FIXTURE_V1 = {
  version: "athlete-capability-fixture-v1",
  assessmentAsOf: "2026-07-01T00:00:00.000Z",
  athleteId: "athlete-1",
  expected: {
    categoryOrder: ["run", "bike", "swim", "strength", "other"],
    cycling: {
      shortDurationCapacityWatts: 500,
      anaerobicReserveJoules: 24_000,
      thresholdCapacityWatts: 247,
      longDurationCapacityWatts: 246.66666666666666,
      durationRetentionRatio: 0.9487179487179487,
    },
    running: {
      shortDurationCapacityMetersPerSecond: 7.5,
      anaerobicReserveMeters: 400,
      thresholdCapacityMetersPerSecond: 4.116666666666666,
      longDurationCapacityMetersPerSecond: 4.111111111111111,
      durationRetentionRatio: 0.9487179487179487,
    },
    swimming: {
      shortDurationCapacityMetersPerSecond: 1.9,
      thresholdCapacityMetersPerSecond: 1.1764705882352942,
      longDurationCapacityMetersPerSecond: 1.25,
      repeatedEffortRecoveryRatio: 0.9285714285714286,
    },
    strength: { repeatedEffortRecoveryRatio: 0.8 },
  },
};

export function canonicalCapabilityCompositionInput(): AthleteCapabilityCompositionInput {
  return {
    contractVersion: "athlete-capability-composition-input-v1",
    assessmentAsOf: ATHLETE_CAPABILITY_FIXTURE_V1.assessmentAsOf,
    athleteId: ATHLETE_CAPABILITY_FIXTURE_V1.athleteId,
    cycling: calculateCyclingDurationPerformance(CYCLING_DURATION_PERFORMANCE_FIXTURE_V1.input),
    running: calculateRunningDurationPerformance(RUNNING_DURATION_PERFORMANCE_FIXTURE_V1.input),
    swimming: calculateSwimmingDurationPerformance(SWIMMING_DURATION_PERFORMANCE_FIXTURE_V1.input),
    strength: calculateStrengthOtherPerformance(STRENGTH_PERFORMANCE_FIXTURE_V1.input),
    other: calculateStrengthOtherPerformance(OTHER_PERFORMANCE_FIXTURE_V1.input),
  };
}

export function literalPlanningSelectionContext(): CapabilityPlanningSelectionContext {
  return {
    contractVersion: "capability-planning-selection-v1",
    athleteId: ATHLETE_CAPABILITY_FIXTURE_V1.athleteId,
    planningAsOf: ATHLETE_CAPABILITY_FIXTURE_V1.assessmentAsOf,
    categoryPriority: ["bike", "run", "swim", "strength", "other"],
    demands: [
      {
        requirementId: "run-short-demand",
        source: {
          kind: "goal",
          sourceId: "run-goal",
          calculationVersion: "literal-planning-demand-v1",
        },
        capability: "shortDurationCapacity",
        eligibleActivityCategories: ["run"],
        unit: "meters_per_second",
        measurementBasis: "running_60_second_maximal_mean_speed",
        requiredValue: 10,
      },
      {
        requirementId: "swim-long-demand",
        source: {
          kind: "goal",
          sourceId: "swim-goal",
          calculationVersion: "literal-planning-demand-v1",
        },
        capability: "longDurationCapacity",
        eligibleActivityCategories: ["swim"],
        unit: "meters_per_second",
        measurementBasis: "swimming_1800_second_long_duration_speed",
        requiredValue: 1.5625,
      },
      {
        requirementId: "bike-threshold-demand",
        source: {
          kind: "goal",
          sourceId: "bike-goal",
          calculationVersion: "literal-planning-demand-v1",
        },
        capability: "thresholdCapacity",
        eligibleActivityCategories: ["bike"],
        unit: "watts",
        measurementBasis: "cycling_planning_threshold_power_anchor",
        requiredValue: 260,
      },
    ],
  };
}
