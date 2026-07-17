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
  const knownWeeklyLoadTss = weeklyLoadTss.filter((value): value is number => value !== null);
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
      minTss: knownWeeklyLoadTss.length > 0 ? Math.min(...knownWeeklyLoadTss) : null,
      maxTss: knownWeeklyLoadTss.length > 0 ? Math.max(...knownWeeklyLoadTss) : null,
      feasibilityMode: comparison.reference.feasibility.mode,
      blockGatePass:
        comparison.blockAbsError === null
          ? null
          : comparison.blockAbsError <= comparison.blockToleranceTss,
      meanGatePass:
        comparison.meanAbsError === null
          ? null
          : comparison.meanAbsError <= comparison.meanToleranceTss,
      weeklyMissesWithinBudget: missCount <= (EXACT_LANE_MISS_BUDGETS[scenario.key] ?? 0),
      consecutiveMissPairsWithinBudget:
        consecutiveMissPairs <= (EXACT_LANE_CONSECUTIVE_MISS_PAIR_BUDGETS[scenario.key] ?? 0),
    },
  };
}

describe("system training plan exact-lane goldens", () => {
  for (const scenario of exactAlignmentScenarios) {
    it(`${scenario.key} - keeps normalized weekly load and comparison summary stable`, () => {
      const artifact = normalizeExactLaneArtifact(scenario);
      if (artifact.weeklyLoadTss.some((value) => value === null)) {
        expect(artifact.weeklyLoadTss.every((value) => value === null)).toBe(true);
        expect(artifact.summary).toMatchObject({
          totalTss: null,
          meanTss: null,
          blockGatePass: null,
          meanGatePass: null,
        });
        return;
      }
      expect(artifact).toEqual(EXACT_LANE_GOLDENS[scenario.key]);
    });
  }
});
