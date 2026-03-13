import { describe, expect, it } from "vitest";
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
        (week) => !week.withinTolerance,
      ).length;
      const consecutiveMissPairs = comparison.weeklyComparison
        .slice(1)
        .filter(
          (week, index) =>
            !week.withinTolerance &&
            !comparison.weeklyComparison[index]?.withinTolerance,
        ).length;

      expect(comparison.reference.feasibility.mode).toBe(scenario.expectedMode);
      expect(comparison.blockAbsError).toBeLessThanOrEqual(
        comparison.blockToleranceTss,
      );
      expect(comparison.meanAbsError).toBeLessThanOrEqual(
        comparison.meanToleranceTss,
      );
      expect(missCount).toBeLessThanOrEqual(
        strictExactScenarioMissBudgets[scenario.key] ?? 1,
      );
      expect(consecutiveMissPairs).toBeLessThanOrEqual(
        strictExactScenarioConsecutiveMissPairBudgets[scenario.key] ?? 0,
      );
    });
  }
});

describe("system training plan feasibility and variance contracts", () => {
  it("keeps constrained and infeasible scenarios capacity bounded without breaking variance limits", () => {
    const constrained = compareScenarioToReference(
      alignmentScenarios.find(
        (scenario) => scenario.key === "low_availability_high_ambition",
      )!,
    );
    const infeasible = compareScenarioToReference(
      alignmentScenarios.find(
        (scenario) => scenario.key === "infeasible_stretch_goal",
      )!,
    );

    expect(constrained.reference.feasibility.mode).toBe(
      constrained.scenario.expectedMode,
    );
    expect(infeasible.reference.feasibility.mode).toBe("capacity_bounded");
    expect(
      constrained.weeklyComparison.every(
        (week) => week.actual >= 0 && Number.isFinite(week.actual),
      ),
    ).toBe(true);
    expect(
      infeasible.weeklyComparison.every(
        (week) => week.actual >= 0 && Number.isFinite(week.actual),
      ),
    ).toBe(true);
    expect(constrained.blockToleranceTss).toBeGreaterThan(0);
    expect(infeasible.blockToleranceTss).toBeGreaterThan(0);
  });

  it("preserves a clear tolerance separation between tight and flexible audit lanes", () => {
    const feasible = compareScenarioToReference(
      alignmentScenarios.find(
        (scenario) => scenario.key === "intermediate_rich_half",
      )!,
    );
    const infeasible = compareScenarioToReference(
      alignmentScenarios.find(
        (scenario) => scenario.key === "infeasible_stretch_goal",
      )!,
    );

    expect(infeasible.reference.feasibility.mode).toBe("capacity_bounded");
    expect(infeasible.blockToleranceTss).toBeGreaterThan(
      feasible.blockToleranceTss,
    );
    expect(infeasible.meanToleranceTss).toBeGreaterThan(
      feasible.meanToleranceTss,
    );
  });
});
