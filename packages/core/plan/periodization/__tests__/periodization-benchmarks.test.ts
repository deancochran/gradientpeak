import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile } from "../../../schemas/settings/profile_settings";
import { buildDeterministicProjectionPayload } from "../../projectionCalculations";
import { fromProfileGoals } from "../adapters/fromProfileGoals";
import { periodizationScenarioFixtures } from "../fixtures/scenarios";
import {
  assessFeasibility,
  generateReferenceTrajectory,
  resolveConstraintProfile,
  resolveEventDemand,
} from "../heuristics";

function averageDurationMs(run: () => void, iterations = 10): number {
  run();

  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    run();
  }
  const end = performance.now();

  return (end - start) / iterations;
}

const fullProjectionBenchmark = process.env.RUN_FULL_PROJECTION_BENCHMARK === "1" ? it : it.skip;

describe("periodization benchmarks", () => {
  const benchmarkGoals = [
    ...periodizationScenarioFixtures.feasibleSingleAGoal.goals,
    ...periodizationScenarioFixtures.bBeforeA.goals,
  ]
    .slice(0, 3)
    .map((goal) => ({
      ...goal,
      targets: goal.targets.map((target) => ({ ...target })),
    }));
  const normalizedGoals = fromProfileGoals(benchmarkGoals);
  const resolvedDemands = normalizedGoals
    .map((goal) => resolveEventDemand(goal))
    .flatMap((result) => (result.status === "supported" ? [result.demand] : []));
  const constraintProfile = resolveConstraintProfile({
    optimizationProfile: "balanced",
    preferenceProfile: defaultAthletePreferenceProfile,
    sport: "run",
  });
  const feasibility = assessFeasibility({
    currentCtl: 45,
    weeksToPeak: 52,
    goals: normalizedGoals,
    resolvedDemands,
    preferenceProfile: defaultAthletePreferenceProfile,
  });

  it("keeps reference generation under 30ms for a 365-day 3-goal plan", () => {
    const averageMs = averageDurationMs(() => {
      generateReferenceTrajectory({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        currentCtl: 45,
        goals: normalizedGoals,
        resolvedDemands,
        preferenceProfile: defaultAthletePreferenceProfile,
        constraintProfile,
        feasibility: feasibility.feasibility,
        mode: feasibility.mode,
      });
    });

    expect(averageMs).toBeLessThan(30);
  });

  fullProjectionBenchmark("keeps full projection under 50ms for a 365-day 3-goal plan", () => {
    const averageMs = averageDurationMs(() => {
      buildDeterministicProjectionPayload({
        timeline: {
          start_date: "2026-01-01",
          end_date: "2026-12-31",
        },
        blocks: [
          {
            name: "Year Build",
            phase: "build",
            start_date: "2026-01-01",
            end_date: "2026-12-31",
            target_weekly_tss_range: { min: 320, max: 420 },
          },
        ],
        goals: benchmarkGoals,
        starting_ctl: 45,
        starting_atl: 42,
        starting_tsb: 3,
        preference_profile: defaultAthletePreferenceProfile,
      });
    }, 5);

    expect(averageMs).toBeLessThan(50);
  });
});
