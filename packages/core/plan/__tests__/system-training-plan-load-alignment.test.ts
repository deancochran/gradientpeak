import { describe, expect, it } from "vitest";
import { requireFixtureValue } from "../../testing/requireFixtureValue";
import {
  compareScenarioToReference,
  getEnabledSystemPlanContractScenarios,
} from "./system-training-plan-contract-test-utils";
import {
  EXACT_LANE_CONSECUTIVE_MISS_PAIR_BUDGETS as strictExactScenarioConsecutiveMissPairBudgets,
  EXACT_LANE_MISS_BUDGETS as strictExactScenarioMissBudgets,
} from "./system-training-plan-exact-lane.goldens";

const alignmentScenarios = getEnabledSystemPlanContractScenarios();
const exactAlignmentScenarios = alignmentScenarios.filter(
  (scenario) => scenario.matchType === "exact",
);

describe("system training plan heuristic alignment", () => {
  for (const scenario of exactAlignmentScenarios) {
    it(`${scenario.key} - stays inside the exact-lane block and mean error gates`, () => {
      const comparison = compareScenarioToReference(scenario);
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

      expect(comparison.reference.feasibility.mode).toBe(scenario.expectedMode);
      expect(comparison.weeklyComparison.every((week) => week.actual !== null)).toBe(true);
      expect(comparison.weeklyComparison.every((week) => week.actualStatus !== "unavailable")).toBe(
        true,
      );
      if (comparison.blockAbsError === null || comparison.meanAbsError === null) {
        expect(comparison.blockStatus).toBe("partial");
        expect(comparison.weeklyComparison.some((week) => week.actualStatus === "partial")).toBe(
          true,
        );
        return;
      }
      expect(comparison.blockAbsError).toBeLessThanOrEqual(comparison.blockToleranceLoad);
      expect(comparison.meanAbsError).toBeLessThanOrEqual(comparison.meanToleranceLoad);
      expect(missCount).toBeLessThanOrEqual(strictExactScenarioMissBudgets[scenario.key] ?? 1);
      expect(consecutiveMissPairs).toBeLessThanOrEqual(
        strictExactScenarioConsecutiveMissPairBudgets[scenario.key] ?? 0,
      );
    });
  }
});

describe("system training plan feasibility and variance contracts", () => {
  it("keeps constrained and infeasible scenarios capacity bounded without breaking variance limits", () => {
    const constrained = compareScenarioToReference(
      requireFixtureValue(
        alignmentScenarios.find((scenario) => scenario.key === "local_capacity_bounded"),
        "expected local capacity-bounded scenario",
      ),
    );
    const infeasible = compareScenarioToReference(
      requireFixtureValue(
        alignmentScenarios.find((scenario) => scenario.key === "local_capacity_bounded"),
        "expected local capacity-bounded scenario",
      ),
    );

    expect(constrained.reference.feasibility.mode).toBe(constrained.scenario.expectedMode);
    expect(infeasible.reference.feasibility.mode).toBe("capacity_bounded");
    expect(
      constrained.weeklyComparison.every(
        (week) => week.actual === null || (week.actual >= 0 && Number.isFinite(week.actual)),
      ),
    ).toBe(true);
    expect(
      infeasible.weeklyComparison.every(
        (week) => week.actual === null || (week.actual >= 0 && Number.isFinite(week.actual)),
      ),
    ).toBe(true);
    expect(constrained.blockToleranceLoad).toBeGreaterThan(0);
    expect(infeasible.blockToleranceLoad).toBeGreaterThan(0);
  });

  it("preserves a clear tolerance separation between tight and flexible audit lanes", () => {
    const feasible = compareScenarioToReference(
      requireFixtureValue(
        alignmentScenarios.find((scenario) => scenario.key === "local_exact_run"),
        "expected local exact scenario",
      ),
    );
    const infeasible = compareScenarioToReference(
      requireFixtureValue(
        alignmentScenarios.find((scenario) => scenario.key === "local_capacity_bounded"),
        "expected local capacity-bounded scenario",
      ),
    );

    expect(infeasible.reference.feasibility.mode).toBe("capacity_bounded");
    expect(infeasible.blockToleranceLoad).toBeGreaterThan(feasible.blockToleranceLoad);
    expect(infeasible.meanToleranceLoad).toBeGreaterThan(feasible.meanToleranceLoad);
  });
});
