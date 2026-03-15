import { describe, expect, it } from "vitest";
import { defaultAthletePreferenceProfile } from "../../../schemas/settings/profile_settings";
import {
  assessFeasibility,
  fromProfileGoals,
  generateReferenceTrajectory,
  periodizationScenarioFixtures,
  resolveConstraintProfile,
  resolveEventDemand,
} from "../index";

function buildTrajectoryFixture(args: {
  currentCtl: number;
  startDate: string;
  endDate: string;
  goals: Parameters<typeof fromProfileGoals>[0];
  preferenceProfile?: typeof defaultAthletePreferenceProfile;
}) {
  const preferenceProfile =
    args.preferenceProfile ?? defaultAthletePreferenceProfile;
  const goals = fromProfileGoals(args.goals as never);
  const resolvedDemands = goals
    .map((goal) => resolveEventDemand(goal))
    .flatMap((result) =>
      result.status === "supported" ? [result.demand] : [],
    );
  const primarySport = resolvedDemands[0]?.sport ?? "run";
  const constraintProfile = resolveConstraintProfile({
    optimizationProfile: "balanced",
    preferenceProfile,
    sport: primarySport,
  });
  const endGoalDate = goals[goals.length - 1]?.target_date ?? args.endDate;
  const weeksToPeak = Math.max(
    1,
    Math.ceil(
      (Date.parse(`${endGoalDate}T00:00:00.000Z`) -
        Date.parse(`${args.startDate}T00:00:00.000Z`)) /
        (7 * 86400000),
    ),
  );
  const { feasibility, mode } = assessFeasibility({
    currentCtl: args.currentCtl,
    weeksToPeak,
    goals,
    resolvedDemands,
    preferenceProfile,
    constraintProfile,
  });

  return generateReferenceTrajectory({
    startDate: args.startDate,
    endDate: args.endDate,
    currentCtl: args.currentCtl,
    goals,
    resolvedDemands,
    preferenceProfile,
    constraintProfile,
    feasibility,
    mode,
  });
}

describe("generateReferenceTrajectory", () => {
  it("anchors target-seeking plans from the goal peak backward", () => {
    const goals = fromProfileGoals(
      periodizationScenarioFixtures.feasibleSingleAGoal.goals as never,
    );
    const demandResult = resolveEventDemand(goals[0]!);
    const trajectory = buildTrajectoryFixture({
      currentCtl: periodizationScenarioFixtures.feasibleSingleAGoal.currentCtl,
      startDate: "2026-03-12",
      endDate: "2026-04-12",
      goals: periodizationScenarioFixtures.feasibleSingleAGoal.goals as never,
      preferenceProfile:
        periodizationScenarioFixtures.feasibleSingleAGoal.preferenceProfile,
    });

    expect(demandResult.status).toBe("supported");
    if (demandResult.status !== "supported") {
      return;
    }

    const taperStartPoint = trajectory.points.find(
      (point) => point.date === "2026-04-02",
    );

    expect(trajectory.mode).toBe("target_seeking");
    expect(taperStartPoint?.target_ctl).toBeCloseTo(
      demandResult.demand.required_peak_ctl,
      1,
    );
  });

  it("returns a maintenance baseline when there are no goals", () => {
    const trajectory = buildTrajectoryFixture({
      currentCtl: periodizationScenarioFixtures.noGoals.currentCtl,
      startDate: "2026-03-12",
      endDate: "2026-03-30",
      goals: periodizationScenarioFixtures.noGoals.goals as never,
      preferenceProfile:
        periodizationScenarioFixtures.noGoals.preferenceProfile,
    });

    expect(trajectory.mode).toBe("capacity_bounded");
    expect(new Set(trajectory.points.map((point) => point.phase))).toEqual(
      new Set(["maintenance"]),
    );
    expect(trajectory.points[0]?.target_ctl).toBe(
      periodizationScenarioFixtures.noGoals.currentCtl,
    );
  });

  it("applies a 4-day micro-taper for a close B-before-A goal", () => {
    const trajectory = buildTrajectoryFixture({
      currentCtl: periodizationScenarioFixtures.bBeforeA.currentCtl,
      startDate: "2026-03-12",
      endDate: "2026-05-05",
      goals: periodizationScenarioFixtures.bBeforeA.goals as never,
      preferenceProfile:
        periodizationScenarioFixtures.bBeforeA.preferenceProfile,
    });

    const taperParameter =
      trajectory.calculated_parameters[
        "taper_days_44444444-4444-4444-8444-444444444444"
      ];
    const tuneUpEvent = trajectory.points.find(
      (point) => point.date === "2026-04-01",
    );
    const preTaperPoint = trajectory.points.find(
      (point) => point.date === "2026-03-28",
    );

    expect(taperParameter?.effective).toBe(4);
    expect(taperParameter?.rationale_codes).toContain(
      "close_b_or_c_before_a_micro_taper_applied",
    );
    expect(tuneUpEvent?.goal_ids_in_effect).toContain(
      "44444444-4444-4444-8444-444444444444",
    );
    expect(tuneUpEvent?.target_ctl).toBeCloseTo(
      (preTaperPoint?.target_ctl ?? 0) * 0.95,
      1,
    );
  });

  it("maintains a sustained peak floor across two close A goals", () => {
    const trajectory = buildTrajectoryFixture({
      currentCtl: periodizationScenarioFixtures.twoCloseAGoals.currentCtl,
      startDate: "2026-03-12",
      endDate: "2026-05-08",
      goals: periodizationScenarioFixtures.twoCloseAGoals.goals as never,
      preferenceProfile:
        periodizationScenarioFixtures.twoCloseAGoals.preferenceProfile,
    });

    const anchorPoint = trajectory.points.find(
      (point) => point.date === "2026-04-10",
    );
    const betweenEvents = trajectory.points.filter(
      (point) => point.date >= "2026-04-21" && point.date <= "2026-05-03",
    );
    const valleyFloor = (anchorPoint?.target_ctl ?? 0) * 0.9;

    expect(betweenEvents.length).toBeGreaterThan(0);
    expect(
      betweenEvents.every((point) => point.target_ctl >= valleyFloor - 0.2),
    ).toBe(true);
    expect(
      trajectory.points.find((point) => point.date === "2026-05-04")
        ?.goal_ids_in_effect,
    ).toEqual([
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
    ]);
  });

  it("uses the A-goal demand window for same-day A/B goals", () => {
    const goals = fromProfileGoals(
      periodizationScenarioFixtures.sameDayAB.goals as never,
    );
    const demands = goals
      .map((goal) => resolveEventDemand(goal))
      .flatMap((result) =>
        result.status === "supported" ? [result.demand] : [],
      );
    const aDemand = demands.find(
      (demand) => demand.goal_id === "88888888-8888-4888-8888-888888888888",
    );
    const trajectory = buildTrajectoryFixture({
      currentCtl: periodizationScenarioFixtures.sameDayAB.currentCtl,
      startDate: "2026-03-12",
      endDate: "2026-04-30",
      goals: periodizationScenarioFixtures.sameDayAB.goals as never,
      preferenceProfile:
        periodizationScenarioFixtures.sameDayAB.preferenceProfile,
    });

    const eventPoint = trajectory.points.find(
      (point) => point.date === "2026-04-26",
    );

    expect(eventPoint?.goal_ids_in_effect).toEqual([
      "88888888-8888-4888-8888-888888888888",
      "99999999-9999-4999-8999-999999999999",
    ]);
    expect(eventPoint?.target_ctl).toBeCloseTo(
      (aDemand?.required_peak_ctl ?? 0) * 0.94,
      1,
    );
  });

  it("caps infeasible plans in capacity-bounded mode", () => {
    const trajectory = buildTrajectoryFixture({
      currentCtl:
        periodizationScenarioFixtures.infeasibleBeginnerStretch.currentCtl,
      startDate: "2026-03-12",
      endDate: "2026-03-30",
      goals: periodizationScenarioFixtures.infeasibleBeginnerStretch
        .goals as never,
      preferenceProfile:
        periodizationScenarioFixtures.infeasibleBeginnerStretch
          .preferenceProfile,
    });
    const peakCtl = Math.max(
      ...trajectory.points.map((point) => point.target_ctl),
    );

    expect(trajectory.mode).toBe("capacity_bounded");
    expect(peakCtl).toBeLessThanOrEqual(
      trajectory.feasibility.achievable_peak_ctl ?? Number.POSITIVE_INFINITY,
    );
  });
});
