import { describe, expect, it } from "vitest";

import { calculateLongTermLoad, calculateRecentLoad } from "../../load/progression";
import {
  deriveDraftPlanProjection,
  derivePlanGoalReadinessContext,
  deriveProjectedPlanStimuli,
  simulateTrainingPlan,
} from "../../plan/athlete-state-simulation";
import {
  type AthleteStateBaseline,
  advanceAthleteStateTo,
  advanceObservedAthleteState,
  advanceProjectedAthleteState,
  dailyAggregateCommonLoadSchema,
  evaluateGoalReadiness,
  observedDailyTrainingStimulusSchema,
  observedTrainingStimulusSchema,
} from "../state-projection";

function baseline(overrides: Partial<AthleteStateBaseline> = {}): AthleteStateBaseline {
  return {
    contractVersion: "athlete-state-projection-v1",
    athleteId: "athlete-1",
    stateRevision: 7,
    asOf: "2026-06-01T00:00:00.000Z",
    longTermLoad: 50,
    recentLoad: 40,
    loadBalance: 10,
    evidenceConfidence: 0.8,
    capabilities: [
      {
        activityCategory: "run",
        longestDistanceMeters: 42_195,
        longestDurationMinutes: 240,
        observedAt: "2026-05-01T00:00:00.000Z",
        evidenceConfidence: 0.9,
      },
    ],
    athleteAgeYears: 36,
    ...overrides,
  };
}

const marathonGoal = {
  goalId: "marathon",
  activityCategory: "run" as const,
  targetAt: "2026-07-01T08:00:00.000Z",
  targetDistanceMeters: 42_195,
  targetDurationMinutes: 240,
};

describe("athlete state projection fixtures", () => {
  it("keeps per-session bounds while permitting several valid sessions in a daily aggregate", () => {
    expect(
      observedTrainingStimulusSchema.safeParse({
        kind: "observed",
        sourceId: "activity:oversized",
        occurredAt: "2026-06-01T12:00:00.000Z",
        activityCategory: "other",
        commonLoad: 12_000,
        evidenceConfidence: 1,
        capabilityObservation: null,
      }).success,
    ).toBe(false);
    expect(dailyAggregateCommonLoadSchema.parse(12_000)).toBe(12_000);
    expect(
      observedDailyTrainingStimulusSchema.parse({
        kind: "observed",
        sourceId: "day:2026-06-01",
        occurredAt: "2026-06-01T23:00:00.000Z",
        activityCategory: "other",
        commonLoad: 12_000,
        evidenceConfidence: 1,
        capabilityObservation: null,
      }).commonLoad,
    ).toBe(12_000);
  });

  it("makes a late hard activity change later fatigue and form", () => {
    const withoutLateActivity = advanceAthleteStateTo(baseline(), "2026-06-20T00:00:00.000Z").state;
    const lateHardActivity = advanceObservedAthleteState({
      baseline: baseline(),
      stimulus: {
        kind: "observed",
        sourceId: "activity:late-hard",
        occurredAt: "2026-06-15T00:00:00.000Z",
        activityCategory: "run",
        commonLoad: 300,
        evidenceConfidence: 0.95,
        capabilityObservation: null,
      },
    }).state;
    const withLateActivity = advanceAthleteStateTo(
      lateHardActivity,
      "2026-06-20T00:00:00.000Z",
    ).state;

    expect(withLateActivity.recentLoad).toBeGreaterThan(withoutLateActivity.recentLoad);
    expect(withLateActivity.loadBalance).toBeLessThan(withoutLateActivity.loadBalance);
  });

  it("decays fatigue faster than fitness", () => {
    const start = baseline({ recentLoad: 100, loadBalance: -50 });
    const decayed = advanceAthleteStateTo(start, "2026-06-15T00:00:00.000Z").state;

    expect(decayed.recentLoad / start.recentLoad).toBeLessThan(
      decayed.longTermLoad / start.longTermLoad,
    );
    expect(decayed.loadBalance).toBeGreaterThan(start.loadBalance);
  });

  it("advances numerically at Los Angeles local midnight even within one UTC date", () => {
    const start = baseline({
      asOf: "2026-03-08T07:30:00.000Z",
      longTermLoad: 50,
      recentLoad: 40,
      loadBalance: 10,
    });
    const assessmentAt = "2026-03-08T08:30:00.000Z";
    const state = advanceAthleteStateTo(start, assessmentAt, {
      fromDay: "2026-03-07",
      toDay: "2026-03-08",
    }).state;

    expect(state.longTermLoad).toBe(
      calculateLongTermLoad(start.longTermLoad, 0, start.athleteAgeYears ?? undefined),
    );
    expect(state.recentLoad).toBe(
      calculateRecentLoad(start.recentLoad, 0, start.athleteAgeYears ?? undefined),
    );
    expect(advanceAthleteStateTo(start, assessmentAt).state.longTermLoad).toBe(start.longTermLoad);
  });

  it("applies exactly one planning-day decay across the Los Angeles DST offset change", () => {
    const start = baseline({
      asOf: "2026-03-08T08:30:00.000Z",
      longTermLoad: 50,
      recentLoad: 40,
      loadBalance: 10,
    });
    const state = advanceAthleteStateTo(start, "2026-03-09T07:30:00.000Z", {
      fromDay: "2026-03-08",
      toDay: "2026-03-09",
    }).state;

    expect(state.longTermLoad).toBe(
      calculateLongTermLoad(start.longTermLoad, 0, start.athleteAgeYears ?? undefined),
    );
    expect(state.recentLoad).toBe(
      calculateRecentLoad(start.recentLoad, 0, start.athleteAgeYears ?? undefined),
    );
  });

  it("inserts one skipped local-day decay before observed load across the DST boundary", () => {
    const start = baseline({
      asOf: "2026-03-08T07:30:00.000Z",
      longTermLoad: 50,
      recentLoad: 40,
      loadBalance: 10,
    });
    const commonLoad = 100;
    const state = advanceObservedAthleteState({
      baseline: start,
      planningDays: { fromDay: "2026-03-07", toDay: "2026-03-09" },
      stimulus: {
        kind: "observed",
        sourceId: "planning-day:2026-03-09",
        occurredAt: "2026-03-09T07:30:00.000Z",
        activityCategory: "run",
        commonLoad,
        evidenceConfidence: 0.9,
        capabilityObservation: null,
      },
    }).state;
    const decayedLongTerm = calculateLongTermLoad(
      start.longTermLoad,
      0,
      start.athleteAgeYears ?? undefined,
    );
    const decayedRecent = calculateRecentLoad(
      start.recentLoad,
      0,
      start.athleteAgeYears ?? undefined,
    );

    expect(state.longTermLoad).toBe(
      calculateLongTermLoad(decayedLongTerm, commonLoad, start.athleteAgeYears ?? undefined),
    );
    expect(state.recentLoad).toBe(
      calculateRecentLoad(decayedRecent, commonLoad, start.athleteAgeYears ?? undefined),
    );
  });

  it("preserves exact daily decay behavior across the former supported range", () => {
    const days = 3_660;
    const start = baseline({
      asOf: "2010-01-01T00:00:00.000Z",
      longTermLoad: 80,
      recentLoad: 60,
      loadBalance: 20,
    });
    let expectedLongTermLoad = start.longTermLoad;
    let expectedRecentLoad = start.recentLoad;
    for (let day = 0; day < days; day += 1) {
      expectedLongTermLoad = calculateLongTermLoad(
        expectedLongTermLoad,
        0,
        start.athleteAgeYears ?? undefined,
      );
      expectedRecentLoad = calculateRecentLoad(
        expectedRecentLoad,
        0,
        start.athleteAgeYears ?? undefined,
      );
    }
    const assessmentAt = new Date(Date.parse(start.asOf) + days * 86_400_000).toISOString();

    const state = advanceAthleteStateTo(start, assessmentAt).state;

    expect(state.longTermLoad).toBe(expectedLongTermLoad);
    expect(state.recentLoad).toBe(expectedRecentLoad);
    expect(state.loadBalance).toBe(expectedLongTermLoad - expectedRecentLoad);
  });

  it("decays a valid gap longer than ten years with equivalent canonical load math", () => {
    const days = 6_000;
    const start = baseline({
      asOf: "2000-01-01T00:00:00.000Z",
      longTermLoad: 80,
      recentLoad: 60,
      loadBalance: 20,
    });
    let iterativeLongTermLoad = start.longTermLoad;
    for (let day = 0; day < days; day += 1)
      iterativeLongTermLoad = calculateLongTermLoad(
        iterativeLongTermLoad,
        0,
        start.athleteAgeYears ?? undefined,
      );
    const assessmentAt = new Date(Date.parse(start.asOf) + days * 86_400_000).toISOString();

    const state = advanceAthleteStateTo(start, assessmentAt).state;

    expect(state.asOf).toBe(assessmentAt);
    expect(state.longTermLoad).toBeGreaterThanOrEqual(0);
    expect(
      Math.abs(state.longTermLoad - iterativeLongTermLoad) /
        Math.max(iterativeLongTermLoad, Number.MIN_VALUE),
    ).toBeLessThan(1e-12);
    expect(Number.isFinite(state.loadBalance)).toBe(true);
  });

  it("advances across the bounded ISO instant domain without day-proportional work", () => {
    const state = advanceAthleteStateTo(
      baseline({ asOf: "1900-01-01T00:00:00.000Z" }),
      "9999-12-31T00:00:00.000Z",
    ).state;

    expect(state).toMatchObject({
      asOf: "9999-12-31T00:00:00.000Z",
      longTermLoad: 0,
      recentLoad: 0,
      loadBalance: 0,
    });
  });

  it("lets planned stimulus affect projection without changing observed state", () => {
    const observed = baseline();
    const projected = advanceProjectedAthleteState({
      baseline: observed,
      stimulus: {
        kind: "projected",
        sourceId: "plan-session:1",
        scheduledAt: "2026-06-02T00:00:00.000Z",
        activityCategory: "run",
        commonLoad: 120,
      },
    }).state;

    expect(observed).toEqual(baseline());
    expect(projected.recentLoad).not.toBe(observed.recentLoad);
    expect(projected.stateRevision).toBe(observed.stateRevision);
    expect(projected.capabilities).toEqual(observed.capabilities);
  });

  it("simulates separate Los Angeles planning days across local midnight within one UTC date", () => {
    const start = baseline({
      asOf: "2026-03-08T07:00:00.000Z",
      longTermLoad: 50,
      recentLoad: 40,
      loadBalance: 10,
    });
    const result = simulateTrainingPlan({
      baseline: start,
      plannedSessions: [
        {
          kind: "projected",
          sourceId: "late-local-day",
          scheduledAt: "2026-03-08T07:30:00.000Z",
          activityCategory: "run",
          commonLoad: 40,
        },
        {
          kind: "projected",
          sourceId: "next-local-day",
          scheduledAt: "2026-03-08T08:30:00.000Z",
          activityCategory: "run",
          commonLoad: 60,
        },
      ],
      simulationAt: "2026-03-08T08:30:00.000Z",
      planningTimezone: "America/Los_Angeles",
      goal: null,
    });
    const firstLongTerm = calculateLongTermLoad(50, 40, 36);
    const firstRecent = calculateRecentLoad(40, 40, 36);

    expect(result.transitions).toHaveLength(2);
    expect(result.projectedState.longTermLoad).toBe(calculateLongTermLoad(firstLongTerm, 60, 36));
    expect(result.projectedState.recentLoad).toBe(calculateRecentLoad(firstRecent, 60, 36));
  });

  it("simulates exactly one local-day decay across the Los Angeles DST offset transition", () => {
    const start = baseline({
      asOf: "2026-03-08T08:30:00.000Z",
      longTermLoad: 50,
      recentLoad: 40,
      loadBalance: 10,
    });
    const result = simulateTrainingPlan({
      baseline: start,
      plannedSessions: [],
      simulationAt: "2026-03-09T07:30:00.000Z",
      planningTimezone: "America/Los_Angeles",
      goal: null,
    });

    expect(result.transitions).toHaveLength(1);
    expect(result.projectedState.longTermLoad).toBe(calculateLongTermLoad(50, 0, 36));
    expect(result.projectedState.recentLoad).toBe(calculateRecentLoad(40, 0, 36));
  });

  it("accepts a finite daily aggregate above the per-session ceiling", () => {
    const result = simulateTrainingPlan({
      baseline: baseline(),
      plannedSessions: [
        {
          kind: "projected",
          sourceId: "same-day-a",
          scheduledAt: "2026-06-02T08:00:00.000Z",
          activityCategory: "run",
          commonLoad: 6_000,
        },
        {
          kind: "projected",
          sourceId: "same-day-b",
          scheduledAt: "2026-06-02T18:00:00.000Z",
          activityCategory: "bike",
          commonLoad: 6_000,
        },
      ],
      simulationAt: "2026-06-02T18:00:00.000Z",
      planningTimezone: "UTC",
      goal: null,
    });

    expect(result.transitions).toHaveLength(1);
    expect(result.projectedState.longTermLoad).toBe(calculateLongTermLoad(50, 12_000, 36));
    expect(result.projectedState.recentLoad).toBe(calculateRecentLoad(40, 12_000, 36));
  });

  it("allows high-quality observed evidence to update capability", () => {
    const updated = advanceObservedAthleteState({
      baseline: baseline({ capabilities: [] }),
      stimulus: {
        kind: "observed",
        sourceId: "activity:quality-long-run",
        occurredAt: "2026-06-02T00:00:00.000Z",
        activityCategory: "run",
        commonLoad: 100,
        evidenceConfidence: 0.9,
        capabilityObservation: { distanceMeters: 35_000, durationMinutes: 210 },
      },
    }).state;

    expect(updated.capabilities).toEqual([
      expect.objectContaining({
        activityCategory: "run",
        longestDistanceMeters: 35_000,
        longestDurationMinutes: 210,
      }),
    ]);
  });

  it("keeps missing evidence separate from readiness", () => {
    const supported = baseline({ evidenceConfidence: 0.9 });
    const sparse = baseline({ evidenceConfidence: 0.25 });
    const supportedAssessment = evaluateGoalReadiness({
      baseline: supported,
      goal: marathonGoal,
      assessmentAt: "2026-06-10T00:00:00.000Z",
    });
    const sparseAssessment = evaluateGoalReadiness({
      baseline: sparse,
      goal: marathonGoal,
      assessmentAt: "2026-06-10T00:00:00.000Z",
    });

    expect(sparseAssessment.readiness).toBe(supportedAssessment.readiness);
    expect(sparseAssessment.assessmentConfidence).toBeLessThan(
      supportedAssessment.assessmentConfidence,
    );
  });

  it("makes a 100-mile ultra shortly before a marathon harm readiness", () => {
    const withoutUltra = simulateTrainingPlan({
      baseline: baseline(),
      plannedSessions: [],
      simulationAt: "2026-06-29T00:00:00.000Z",
      planningTimezone: "UTC",
      goal: marathonGoal,
    });
    const withUltra = simulateTrainingPlan({
      baseline: baseline(),
      plannedSessions: [
        {
          kind: "projected",
          sourceId: "plan-session:100-mile-ultra",
          scheduledAt: "2026-06-25T00:00:00.000Z",
          activityCategory: "run",
          commonLoad: 800,
        },
      ],
      simulationAt: "2026-06-29T00:00:00.000Z",
      planningTimezone: "UTC",
      goal: marathonGoal,
    });

    expect(withUltra.goalAssessment?.fatiguePenalty).toBeGreaterThan(
      withoutUltra.goalAssessment?.fatiguePenalty ?? 0,
    );
    expect(withUltra.goalAssessment?.readiness).toBeLessThan(
      withoutUltra.goalAssessment?.readiness ?? 0,
    );
  });

  it("derives canonical projected stimuli from a client draft without granting save authority", () => {
    const planId = "11111111-1111-4111-8111-111111111111";
    const activityPlanId = "22222222-2222-4222-8222-222222222222";
    const structure = {
      version: 1 as const,
      sessions: [{ activity_plan_id: activityPlanId, offset_days: 2 }],
      goal_blueprints: [
        {
          title: "10K",
          priority: 8,
          activity_category: "run" as const,
          target_offset_days: 30,
          objective: {
            type: "event_performance",
            activity_category: "run",
            distance_m: 10_000,
            target_time_s: 3_600,
          },
        },
      ],
      builder_planning_snapshot: {
        version: 1 as const,
        plan_preferences: {
          duration_weeks: 1,
          weekly_session_count: 1,
          target_weekly_hours: null,
          rest_days_per_week: 6,
        },
        scheduling: { preferred_weekdays: [3] },
        goal_context: { selected_goals: [] },
      },
    };
    const result = deriveProjectedPlanStimuli({
      planId,
      structure,
      activityPlans: [{ activityPlanId, activityCategory: "run", commonLoad: 80 }],
      planningTimezone: "UTC",
      startDate: "2026-06-01",
      notBefore: "2026-06-01T00:00:00.000Z",
    });

    expect(result).toEqual({
      status: "available",
      sessions: [
        {
          kind: "projected",
          sourceId: `${planId}:sessions.0`,
          scheduledAt: "2026-06-03T00:00:00.000Z",
          activityCategory: "run",
          commonLoad: 80,
        },
      ],
    });
    expect(
      derivePlanGoalReadinessContext({
        planId,
        structure,
        planningTimezone: "UTC",
        startDate: "2026-06-01",
      }),
    ).toMatchObject({
      goalId: `${planId}:goal:0`,
      targetAt: "2026-07-01T23:59:59.999Z",
      targetDistanceMeters: 10_000,
      targetDurationMinutes: 60,
    });
    const observedBaseline = baseline({ asOf: "2026-06-01T00:00:00.000Z" });
    const draftProjection = deriveDraftPlanProjection({
      baseline: observedBaseline,
      planId,
      structure,
      activityPlans: [{ activityPlanId, activityCategory: "run", commonLoad: 80 }],
      planningTimezone: "UTC",
      startDate: "2026-06-01",
    });
    expect(draftProjection).toMatchObject({
      status: "available",
      algorithmVersion: "draft-plan-projection-v1",
      simulation: {
        baseStateRevision: observedBaseline.stateRevision,
        simulatedAt: "2026-07-01T23:59:59.999Z",
      },
    });
    expect(observedBaseline).toEqual(baseline({ asOf: "2026-06-01T00:00:00.000Z" }));
  });
});
