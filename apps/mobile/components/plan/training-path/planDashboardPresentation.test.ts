import { expect, it } from "vitest";
import {
  buildComparableThresholdTrend,
  buildGoalSignalFreshnessLabel,
  buildGoalTrajectoryAnswer,
  buildPlanTrainingInterpretation,
  buildPlanWeeklyAdherence,
  getPlanProgressWindow,
  getPlanTrainingWindow,
  mergeGoalProgressThresholdEvidence,
} from "./planDashboardPresentation";

it("renders missing progress publication as unavailable rather than current", () => {
  expect(
    buildGoalSignalFreshnessLabel({
      assessmentComputedAt: "2026-04-15T12:00:00.000Z",
      assessmentFreshness: "fresh",
      progressComputedAt: undefined,
      progressFreshness: undefined,
    }),
  ).toBe("Goal signals are unavailable");
});

it("builds a trend only from comparable threshold assessments", () => {
  const trend = buildComparableThresholdTrend(
    [
      {
        activityCategory: "bike",
        effectiveAt: "2026-01-01T12:00:00.000Z",
        metric: "threshold_power_w",
        unit: "watt",
        value: 220,
      },
      {
        activityCategory: "run",
        effectiveAt: "2026-02-01T12:00:00.000Z",
        metric: "threshold_speed_mps",
        unit: "meter_per_second",
        value: 4,
      },
      {
        activityCategory: "bike",
        effectiveAt: "2026-03-01T12:00:00.000Z",
        metric: "threshold_power_w",
        unit: "watt",
        value: 231,
      },
    ],
    "bike",
  );

  expect(trend).toMatchObject({
    activityCategory: "bike",
    change: 11,
    changePercent: 5,
  });
  expect(trend?.points).toHaveLength(2);
});

it("merges goal-progress provenance into threshold history without duplicates", () => {
  const current = {
    activityCategory: "bike" as const,
    confidence: 0.8,
    effectiveAt: "2026-04-10T12:00:00.000Z",
    metric: "power",
    method: "bike_power_30m",
    sourceActivities: [],
    thresholdId: "threshold-2",
    unit: "watts",
    value: 240,
  };
  const merged = mergeGoalProgressThresholdEvidence([{ ...current, confidence: 0.7 }], {
    baseline: null,
    current,
  });

  expect(merged).toEqual([current]);
});

it("builds explicit goal trajectory copy from the goal-progress contract", () => {
  const answer = buildGoalTrajectoryAnswer({
    assessedAt: "2026-04-15T12:00:00.000Z",
    baseline: null,
    current: {
      activityCategory: "bike",
      confidence: 0.8,
      effectiveAt: "2026-04-10T12:00:00.000Z",
      freshness: "fresh",
      metric: "power",
      sourceActivityIds: [],
      thresholdId: "threshold-1",
      unit: "watts",
      value: 240,
    },
    deadlineAt: "2026-11-15T23:59:59.000Z",
    evidence: { observationCount: 3, observedSpanDays: 90 },
    goalId: "goal-1",
    metrics: {
      changeFromBaseline: 20,
      observedRatePerDay: 0.2,
      progressPercent: 67,
      progressRatio: 0.67,
      remainingGap: 10,
      requiredRatePerDay: 0.05,
      targetGap: 30,
    },
    reason: "observed_rate_meets_required_rate",
    status: "on_track",
    target: {
      achievementValue: 250,
      activityCategory: "bike",
      metric: "power",
      targetValue: 250,
      unit: "watts",
    },
  });

  expect(answer).toEqual({
    body: "Current 240 W; configured goal 250 W. 67% of the baseline-to-goal change completed.",
    headline: "On track for the selected goal",
  });
});

it("discloses the configured target and tolerated achievement threshold", () => {
  const answer = buildGoalTrajectoryAnswer({
    assessedAt: "2026-04-15T12:00:00.000Z",
    baseline: null,
    current: null,
    deadlineAt: "2026-11-15T23:59:59.000Z",
    evidence: { observationCount: 2, observedSpanDays: 30 },
    goalId: "goal-1",
    metrics: {
      changeFromBaseline: null,
      observedRatePerDay: null,
      progressPercent: null,
      progressRatio: null,
      remainingGap: 0,
      requiredRatePerDay: null,
      targetGap: null,
    },
    reason: "target_met",
    status: "achieved",
    target: {
      achievementValue: 245,
      activityCategory: "bike",
      metric: "power",
      targetValue: 250,
      unit: "watts",
    },
  });

  expect(answer.body).toContain("configured goal 250 W");
  expect(answer.body).toContain("Achievement is recognized at 245 W");
});

it("centers progress and training ranges on the shared anchor", () => {
  expect(getPlanProgressWindow("2026-04-15", "3m")).toEqual({
    end: "2026-05-31",
    start: "2026-03-01",
  });
  expect(
    getPlanTrainingWindow({
      anchorDate: "2026-04-15",
      range: "1y",
      timelineEnd: "2026-05-17",
      timelineStart: "2026-02-23",
    }),
  ).toEqual({ end: "2026-10-14", start: "2025-10-15" });
});

it("keeps insufficient performance evidence explicit in the interpretation", () => {
  const interpretation = buildPlanTrainingInterpretation({
    currentPoint: { date: "2026-04-15", formTsb: -12 },
    thresholdTrend: null,
    upcomingTitles: ["Recovery ride"],
  });

  expect(interpretation.headline).toBe("Recovery is becoming important");
  expect(interpretation.body).toContain(
    "A performance trend requires two or more comparable threshold assessments.",
  );
  expect(interpretation.body).toContain("Keep Recovery ride before adding more intensity.");
});

it("summarizes the current week without creating a day-navigation model", () => {
  const dates = [
    "2026-04-13",
    "2026-04-14",
    "2026-04-15",
    "2026-04-16",
    "2026-04-17",
    "2026-04-18",
    "2026-04-19",
  ];
  const summary = buildPlanWeeklyAdherence({
    points: dates.map((date) => ({ date, plannedLoad: 40 })),
    todayKey: "2026-04-15",
    weekDayEvidence: dates.map((date, index) => ({
      completedSessionCount: index < 2 ? 1 : 0,
      date,
      plannedSessionCount: index >= 2 && index < 6 ? 1 : 0,
    })),
  });

  expect(summary).toMatchObject({
    completedSessions: 2,
    plannedLoad: 280,
    remainingSessions: 4,
    totalSessions: 6,
  });
});
