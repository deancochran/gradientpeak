import { describe, expect, it } from "vitest";
import { createUnavailableActivityPlanPlanningEstimate } from "../activity-plan-planning-estimate";
import {
  assertExactLaneHasCanonicalPlannedLoad,
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
  const weeklyLoad = comparison.materialized.weeklyActualLoad.map((week) =>
    week.value === null ? null : Math.round(week.value * 10) / 10,
  );
  const weeklyStatus = comparison.materialized.weeklyActualLoad.map((week) => week.status);
  const knownWeeklyLoad = weeklyLoad.filter((value): value is number => value !== null);
  const missCount = comparison.weeklyComparison.filter(
    (week) => week.withinTolerance === false,
  ).length;
  const consecutiveMissPairs = comparison.weeklyComparison
    .slice(1)
    .filter(
      (week, index) =>
        week.withinTolerance === false &&
        comparison.weeklyComparison[index]?.withinTolerance === false,
    ).length;

  return {
    weeklyLoad,
    weeklyStatus,
    summary: {
      weeks: weeklyLoad.length,
      sessionCount: comparison.materialized.materializedSessions.length,
      totalLoad: comparison.blockActual,
      meanLoad: comparison.actualMean,
      minLoad: knownWeeklyLoad.length > 0 ? Math.min(...knownWeeklyLoad) : null,
      maxLoad: knownWeeklyLoad.length > 0 ? Math.max(...knownWeeklyLoad) : null,
      feasibilityMode: comparison.reference.feasibility.mode,
      blockStatus: comparison.blockStatus,
      blockGatePass:
        comparison.blockAbsError === null
          ? null
          : comparison.blockAbsError <= comparison.blockToleranceLoad,
      meanGatePass:
        comparison.meanAbsError === null
          ? null
          : comparison.meanAbsError <= comparison.meanToleranceLoad,
      weeklyMissesWithinBudget: missCount <= (EXACT_LANE_MISS_BUDGETS[scenario.key] ?? 0),
      consecutiveMissPairsWithinBudget:
        consecutiveMissPairs <= (EXACT_LANE_CONSECUTIVE_MISS_PAIR_BUDGETS[scenario.key] ?? 0),
    },
  };
}

describe("system training plan exact-lane goldens", () => {
  it("fails closed when an exact lane has no canonical planned Load", () => {
    const unavailable = createUnavailableActivityPlanPlanningEstimate({
      asOf: "2026-07-31T12:00:00.000Z",
      stage: "scheduled",
      scheduledEventId: "exact-lane-missing-event",
      reason: "source_missing",
    });

    expect(() =>
      assertExactLaneHasCanonicalPlannedLoad([
        {
          title: "Missing canonical load",
          common_load: unavailable.prescriptionQuantification.summary.commonLoad,
        },
      ]),
    ).toThrow(/requires canonical planned Common Load/);
  });

  for (const scenario of exactAlignmentScenarios) {
    it(`${scenario.key} - keeps normalized weekly load and comparison summary stable`, () => {
      const artifact = normalizeExactLaneArtifact(scenario);
      expect(artifact.weeklyLoad.every((value) => value !== null)).toBe(true);
      expect(artifact.weeklyStatus).not.toContain("unavailable");
      expect(artifact).toEqual(EXACT_LANE_GOLDENS[scenario.key]);
    });
  }
});
