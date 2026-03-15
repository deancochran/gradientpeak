import { describe, expect, it } from "vitest";
import {
  compareScenarioToReference,
  getEnabledSystemPlanContractScenarios,
  materializeSystemPlanScenario,
} from "./system-training-plan-contract-test-utils";

const coachingScenarios = getEnabledSystemPlanContractScenarios().filter(
  (scenario) =>
    scenario.key === "exact_5k_speed_block" ||
    scenario.key === "boundary_feasible_bike" ||
    scenario.key === "advanced_marathon_build" ||
    scenario.key === "b_race_before_a_race" ||
    scenario.key === "two_close_a_goals",
);

describe("system training plan coaching invariants", () => {
  it("advanced marathon build keeps week-over-week ramps controlled", () => {
    const scenario = coachingScenarios.find(
      (entry) => entry.key === "advanced_marathon_build",
    )!;
    const comparison = compareScenarioToReference(scenario);

    for (
      let index = 1;
      index < comparison.weeklyComparison.length;
      index += 1
    ) {
      const previous = comparison.weeklyComparison[index - 1]!;
      const current = comparison.weeklyComparison[index]!;
      const allowedRamp = Math.max(35, previous.actual * 0.18);
      const delta = current.actual - previous.actual;

      expect(delta).toBeLessThanOrEqual(allowedRamp);
    }
  });

  it("advanced marathon build preserves long-session emphasis every week", () => {
    const scenario = coachingScenarios.find(
      (entry) => entry.key === "advanced_marathon_build",
    )!;
    const materialized = materializeSystemPlanScenario(scenario);
    const sessionsByWeek = new Map<
      number,
      typeof materialized.materializedSessions
    >();

    for (const session of materialized.materializedSessions) {
      const weekIndex = Math.floor(
        (Date.parse(`${session.scheduled_date}T00:00:00.000Z`) -
          Date.parse(`${materialized.startDate}T00:00:00.000Z`)) /
          (7 * 86400000),
      );
      const existing = sessionsByWeek.get(weekIndex) ?? [];
      existing.push(session);
      sessionsByWeek.set(weekIndex, existing);
    }

    for (const [weekIndex, sessions] of sessionsByWeek.entries()) {
      const totalWeekTss = sessions.reduce(
        (total, session) => total + session.estimated_tss,
        0,
      );
      const longSession = sessions
        .filter(
          (session) =>
            /long/i.test(session.title) || /long/i.test(session.template_name),
        )
        .sort((left, right) => right.estimated_tss - left.estimated_tss)[0];

      expect(
        longSession,
        `expected long session in week ${weekIndex + 1}`,
      ).toBeDefined();
      expect(
        (longSession?.estimated_tss ?? 0) / totalWeekTss,
      ).toBeGreaterThanOrEqual(0.25);
    }
  });

  it("exact 5K speed block keeps a clear taper into race week", () => {
    const scenario = coachingScenarios.find(
      (entry) => entry.key === "exact_5k_speed_block",
    )!;
    const comparison = compareScenarioToReference(scenario);
    const penultimateWeek = comparison.weeklyComparison.at(-2);
    const raceWeek = comparison.weeklyComparison.at(-1);

    expect(penultimateWeek).toBeDefined();
    expect(raceWeek).toBeDefined();
    expect(raceWeek!.actual).toBeLessThan(penultimateWeek!.actual);
    expect(raceWeek!.actual).toBeLessThanOrEqual(penultimateWeek!.actual * 0.9);
  });

  it("boundary feasible bike keeps long-ride emphasis and lighter recovery weeks", () => {
    const scenario = coachingScenarios.find(
      (entry) => entry.key === "boundary_feasible_bike",
    )!;
    const materialized = materializeSystemPlanScenario(scenario);
    const sessionsByWeek = new Map<
      number,
      typeof materialized.materializedSessions
    >();

    for (const session of materialized.materializedSessions) {
      const weekIndex = Math.floor(
        (Date.parse(`${session.scheduled_date}T00:00:00.000Z`) -
          Date.parse(`${materialized.startDate}T00:00:00.000Z`)) /
          (7 * 86400000),
      );
      const existing = sessionsByWeek.get(weekIndex) ?? [];
      existing.push(session);
      sessionsByWeek.set(weekIndex, existing);
    }

    const weeklyLoads = Array.from(sessionsByWeek.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([weekIndex, sessions]) => {
        const totalWeekTss = sessions.reduce(
          (total, session) => total + session.estimated_tss,
          0,
        );
        const longRide = sessions
          .filter(
            (session) =>
              /long/i.test(session.title) ||
              /long/i.test(session.template_name),
          )
          .sort((left, right) => right.estimated_tss - left.estimated_tss)[0];

        expect(
          longRide,
          `expected long ride in week ${weekIndex + 1}`,
        ).toBeDefined();
        expect(
          (longRide?.estimated_tss ?? 0) / totalWeekTss,
        ).toBeGreaterThanOrEqual(0.3);

        return totalWeekTss;
      });

    expect(weeklyLoads[3]).toBeLessThan(
      weeklyLoads[2] ?? Number.POSITIVE_INFINITY,
    );
    expect(weeklyLoads[7]).toBeLessThan(
      weeklyLoads[6] ?? Number.POSITIVE_INFINITY,
    );
    expect(weeklyLoads[11]).toBeLessThan(
      weeklyLoads[10] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("B race before A race applies a micro-taper instead of a full reset", () => {
    const scenario = coachingScenarios.find(
      (entry) => entry.key === "b_race_before_a_race",
    )!;
    const comparison = compareScenarioToReference(scenario);
    const tuneUpWeek = comparison.reference.weeklyTargetLoad[2]?.value ?? 0;
    const aRaceWeek = comparison.reference.weeklyTargetLoad[3]?.value ?? 0;
    const postTuneUpWeek = comparison.reference.weeklyTargetLoad[4]?.value ?? 0;

    expect(tuneUpWeek).toBeGreaterThan(0);
    expect(aRaceWeek).toBeGreaterThanOrEqual(tuneUpWeek * 0.65);
    expect(postTuneUpWeek).toBeGreaterThanOrEqual(aRaceWeek * 0.45);
  });

  it("two close A goals keep a sustained peak floor without a chaotic re-ramp", () => {
    const scenario = coachingScenarios.find(
      (entry) => entry.key === "two_close_a_goals",
    )!;
    const comparison = compareScenarioToReference(scenario);
    const weeks = comparison.reference.weeklyTargetLoad.map(
      (week) => week.value,
    );
    const valley = Math.min(...weeks.slice(2));
    const preFirstGoalPeak = Math.max(...weeks.slice(0, 2));

    expect(valley).toBeGreaterThanOrEqual(preFirstGoalPeak * 0.35);
    for (let index = 1; index < weeks.length; index += 1) {
      expect(weeks[index]! - weeks[index - 1]!).toBeLessThanOrEqual(300);
    }
  });
});
