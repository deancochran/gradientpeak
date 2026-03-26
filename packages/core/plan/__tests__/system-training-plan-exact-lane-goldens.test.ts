import { describe, expect, it } from "vitest";
import {
  compareScenarioToReference,
  getEnabledSystemPlanContractScenarios,
} from "./system-training-plan-contract-test-utils";
import {
  EXACT_LANE_CONSECUTIVE_MISS_PAIR_BUDGETS,
  EXACT_LANE_GOLDENS,
  EXACT_LANE_MISS_BUDGETS,
} from "./system-training-plan-exact-lane.goldens";

const exactAlignmentScenarios = getEnabledSystemPlanContractScenarios().filter(
  (scenario) => scenario.matchType === "exact",
);

function normalizeExactLaneArtifact(scenario: (typeof exactAlignmentScenarios)[number]) {
  const comparison = compareScenarioToReference(scenario);
  const weeklyLoadTss = comparison.materialized.weeklyActualLoad.map((week) => week.value);
  const missCount = comparison.weeklyComparison.filter((week) => !week.withinTolerance).length;
  const consecutiveMissPairs = comparison.weeklyComparison
    .slice(1)
    .filter(
      (week, index) =>
        !week.withinTolerance && !comparison.weeklyComparison[index]?.withinTolerance,
    ).length;

  return {
    weeklyLoadTss,
    summary: {
      weeks: weeklyLoadTss.length,
      sessionCount: comparison.materialized.materializedSessions.length,
      totalTss: comparison.blockActual,
      meanTss: comparison.actualMean,
      minTss: Math.min(...weeklyLoadTss),
      maxTss: Math.max(...weeklyLoadTss),
      feasibilityMode: comparison.reference.feasibility.mode,
      blockGatePass: comparison.blockAbsError <= comparison.blockToleranceTss,
      meanGatePass: comparison.meanAbsError <= comparison.meanToleranceTss,
      weeklyMissesWithinBudget: missCount <= (EXACT_LANE_MISS_BUDGETS[scenario.key] ?? 0),
      consecutiveMissPairsWithinBudget:
        consecutiveMissPairs <= (EXACT_LANE_CONSECUTIVE_MISS_PAIR_BUDGETS[scenario.key] ?? 0),
    },
  };
}

describe("system training plan exact-lane goldens", () => {
  for (const scenario of exactAlignmentScenarios) {
    it(`${scenario.key} - keeps normalized weekly load and comparison summary stable`, () => {
      expect(normalizeExactLaneArtifact(scenario)).toEqual(EXACT_LANE_GOLDENS[scenario.key]);
    });
  }
});
