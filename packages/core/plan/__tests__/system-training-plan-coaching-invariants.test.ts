import { describe, expect, it } from "vitest";
import { requireFixtureValue } from "../../testing/requireFixtureValue";
import {
  compareScenarioToReference,
  getEnabledSystemPlanContractScenarios,
  materializeSystemPlanScenario,
} from "./system-training-plan-contract-test-utils";

const coachingScenarios = getEnabledSystemPlanContractScenarios();

describe("system training plan coaching invariants", () => {
  it("local progression keeps week-over-week ramps controlled", () => {
    const scenario = requireFixtureValue(
      coachingScenarios.find((entry) => entry.key === "local_exact_run"),
      "expected local exact scenario",
    );
    const comparison = compareScenarioToReference(scenario);

    for (let index = 1; index < comparison.weeklyComparison.length; index += 1) {
      const previous = requireFixtureValue(
        comparison.weeklyComparison[index - 1],
        "expected previous weekly comparison",
      );
      const current = requireFixtureValue(
        comparison.weeklyComparison[index],
        "expected current weekly comparison",
      );
      if (previous.actual === null || current.actual === null) {
        expect(previous.actual).toBeNull();
        expect(current.actual).toBeNull();
        continue;
      }
      const allowedRamp = Math.max(35, previous.actual * 0.18);
      const delta = current.actual - previous.actual;

      expect(delta).toBeLessThanOrEqual(allowedRamp);
    }
  });

  it("local progression preserves long-session emphasis every week", () => {
    const scenario = requireFixtureValue(
      coachingScenarios.find((entry) => entry.key === "local_exact_run"),
      "expected local exact scenario",
    );
    const materialized = materializeSystemPlanScenario(scenario);
    const sessionsByWeek = new Map<number, typeof materialized.materializedSessions>();

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
      const knownSessions = sessions.filter(
        (session): session is (typeof sessions)[number] & { estimated_load: number } =>
          session.estimated_load !== null,
      );
      if (knownSessions.length === 0) {
        expect(sessions.every((session) => session.estimated_load === null)).toBe(true);
        continue;
      }
      const totalWeekLoad = knownSessions.reduce(
        (total, session) => total + session.estimated_load,
        0,
      );
      const longSession = knownSessions
        .filter((session) => /long/i.test(session.title) || /long/i.test(session.template_name))
        .sort((left, right) => right.estimated_load - left.estimated_load)[0];

      expect(longSession, `expected long session in week ${weekIndex + 1}`).toBeDefined();
      if (!longSession) throw new Error(`Missing long session in week ${weekIndex + 1}`);
      if (longSession.estimated_load_status === "partial") {
        expect(longSession.common_load.status).toBe("partial");
        continue;
      }
      expect(longSession.estimated_load / totalWeekLoad).toBeGreaterThanOrEqual(0.25);
    }
  });

  it("local progression keeps a clear taper into its final week", () => {
    const scenario = requireFixtureValue(
      coachingScenarios.find((entry) => entry.key === "local_exact_run"),
      "expected local exact scenario",
    );
    const comparison = compareScenarioToReference(scenario);
    const penultimateWeek = comparison.weeklyComparison.at(-2);
    const raceWeek = comparison.weeklyComparison.at(-1);

    expect(penultimateWeek).toBeDefined();
    expect(raceWeek).toBeDefined();
    if (
      !raceWeek ||
      !penultimateWeek ||
      raceWeek?.actualStatus !== "complete" ||
      penultimateWeek?.actualStatus !== "complete" ||
      raceWeek.actual === null ||
      penultimateWeek.actual === null
    ) {
      expect([raceWeek?.actualStatus, penultimateWeek?.actualStatus]).toContain("partial");
      return;
    }
    expect(raceWeek.actual).toBeLessThan(penultimateWeek.actual);
    expect(raceWeek.actual).toBeLessThanOrEqual(penultimateWeek.actual * 0.9);
  });

  it("local progression keeps long-run emphasis and a lighter recovery week", () => {
    const scenario = requireFixtureValue(
      coachingScenarios.find((entry) => entry.key === "local_exact_run"),
      "expected local exact scenario",
    );
    const materialized = materializeSystemPlanScenario(scenario);
    const sessionsByWeek = new Map<number, typeof materialized.materializedSessions>();

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
        const knownSessions = sessions.filter(
          (session): session is (typeof sessions)[number] & { estimated_load: number } =>
            session.estimated_load !== null,
        );
        if (knownSessions.length === 0) {
          expect(sessions.every((session) => session.estimated_load === null)).toBe(true);
          return null;
        }
        const totalWeekLoad = knownSessions.reduce(
          (total, session) => total + session.estimated_load,
          0,
        );
        const longRide = knownSessions
          .filter((session) => /long/i.test(session.title) || /long/i.test(session.template_name))
          .sort((left, right) => right.estimated_load - left.estimated_load)[0];

        expect(longRide, `expected long ride in week ${weekIndex + 1}`).toBeDefined();
        if (!longRide) throw new Error(`Missing long ride in week ${weekIndex + 1}`);
        expect(longRide.estimated_load / totalWeekLoad).toBeGreaterThanOrEqual(0.3);

        return totalWeekLoad;
      });

    const knownWeeklyLoads = weeklyLoads.filter((load): load is number => load !== null);
    if (knownWeeklyLoads.length === 0) {
      expect(weeklyLoads.every((load) => load === null)).toBe(true);
      return;
    }
    expect(weeklyLoads[3]).toBeLessThan(weeklyLoads[2] ?? Number.POSITIVE_INFINITY);
  });

  it("a local multi-goal trajectory applies a micro-taper instead of a full reset", () => {
    const scenario = requireFixtureValue(
      coachingScenarios.find((entry) => entry.key === "local_multi_goal"),
      "expected local multi-goal scenario",
    );
    const comparison = compareScenarioToReference(scenario);
    const tuneUpWeek = comparison.reference.weeklyTargetLoad[2]?.value ?? 0;
    const aRaceWeek = comparison.reference.weeklyTargetLoad[3]?.value ?? 0;

    expect(tuneUpWeek).toBeGreaterThan(0);
    expect(aRaceWeek).toBeGreaterThan(0);
    expect(aRaceWeek).toBeLessThan(tuneUpWeek);
  });

  it("a local multi-goal trajectory keeps a sustained peak floor without a chaotic re-ramp", () => {
    const scenario = requireFixtureValue(
      coachingScenarios.find((entry) => entry.key === "local_multi_goal"),
      "expected local multi-goal scenario",
    );
    const comparison = compareScenarioToReference(scenario);
    const weeks = comparison.reference.weeklyTargetLoad.map((week) => week.value);
    const valley = Math.min(...weeks.slice(2));
    const preFirstGoalPeak = Math.max(...weeks.slice(0, 2));

    expect(valley).toBeGreaterThanOrEqual(preFirstGoalPeak * 0.25);
    for (let index = 1; index < weeks.length; index += 1) {
      expect(
        requireFixtureValue(weeks[index], "expected current target week") -
          requireFixtureValue(weeks[index - 1], "expected previous target week"),
      ).toBeLessThanOrEqual(300);
    }
  });
});
