import { describe, expect, it } from "vitest";
import { requireFixtureValue } from "../../testing/requireFixtureValue";
import {
  type BuildReadinessForecastTimelineInput,
  buildReadinessForecastTimeline,
  simulateReadinessScheduleAdjustment,
} from "../readinessForecast";

function baseInput(overrides: Partial<BuildReadinessForecastTimelineInput> = {}) {
  return {
    startDate: "2026-04-01",
    endDate: "2026-04-10",
    today: "2026-04-05",
    baseline: {
      start_date: "2026-04-01",
      today: "2026-04-05",
      initial_longTermLoad: 42,
      initial_recentLoad: 40,
      initial_readiness: 72,
      source: "history",
      confidence: "high",
      confidence_reason_codes: [],
    },
    actualDailyLoad: [
      { date: "2026-04-01", load: 45 },
      { date: "2026-04-03", load: 50 },
      { date: "2026-04-05", load: 35 },
    ],
    scheduledDailyLoad: [
      { date: "2026-04-01", load: 70, confidence: "high" },
      { date: "2026-04-03", load: 75, confidence: "high" },
      { date: "2026-04-06", load: 60, confidence: "high" },
      { date: "2026-04-08", load: 65, confidence: "high" },
    ],
    recommendedDailyLoad: [
      { date: "2026-04-06", load: 55 },
      { date: "2026-04-08", load: 60 },
      { date: "2026-04-10", load: 45 },
    ],
    goals: [
      {
        goal_id: "goal-1",
        title: "A Race",
        target_date: "2026-04-10",
        target_readiness_min: 55,
        target_readiness_max: 100,
      },
    ],
    ...overrides,
  } satisfies BuildReadinessForecastTimelineInput;
}

describe("buildReadinessForecastTimeline", () => {
  it("keeps actual and scheduled history source-specific when they diverge", () => {
    const forecast = buildReadinessForecastTimeline(baseInput());
    const actualHistory = forecast.series.actual.points.filter(
      (point) => point.date <= forecast.today,
    );
    const scheduledHistory = forecast.series.scheduled.points.filter(
      (point) => point.date <= forecast.today,
    );

    expect(actualHistory.map((point) => point.load)).not.toEqual(
      scheduledHistory.map((point) => point.load),
    );
    expect(actualHistory.every((point) => point.provenance === "completed_activity")).toBe(true);
    expect(scheduledHistory.every((point) => point.provenance === "scheduled_activity")).toBe(true);
  });

  it("does not backfill recommended history unless recommended inputs provide it", () => {
    const withoutHistory = buildReadinessForecastTimeline(baseInput());
    const withHistory = buildReadinessForecastTimeline(
      baseInput({
        recommendedDailyLoad: [
          { date: "2026-04-02", load: 40 },
          { date: "2026-04-06", load: 55 },
        ],
      }),
    );

    expect(
      withoutHistory.series.recommended.points.some((point) => point.date < withoutHistory.today),
    ).toBe(false);
    expect(
      withHistory.series.recommended.points.some((point) => point.date < withHistory.today),
    ).toBe(true);
  });

  it("projects an all-zero planned path when no scheduled or recommended work is supplied", () => {
    const forecast = buildReadinessForecastTimeline(
      baseInput({ scheduledDailyLoad: [], recommendedDailyLoad: [] }),
    );

    expect(forecast.series.scheduled.points.filter((point) => point.date > forecast.today)).toEqual(
      expect.arrayContaining([expect.objectContaining({ load: 0 })]),
    );
    expect(
      forecast.series.recommended.points.filter((point) => point.date > forecast.today),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ load: 0 })]));
    expect(forecast.confidence_reason_codes).not.toContain("scheduled_path_unavailable");
    expect(forecast.confidence_reason_codes).not.toContain("recommended_path_unavailable");
  });

  it("changes future scheduled readiness when scheduled load changes", () => {
    const lighter = buildReadinessForecastTimeline(baseInput());
    const heavier = buildReadinessForecastTimeline(
      baseInput({
        scheduledDailyLoad: [
          { date: "2026-04-01", load: 70, confidence: "high" },
          { date: "2026-04-03", load: 75, confidence: "high" },
          { date: "2026-04-06", load: 130, confidence: "high" },
          { date: "2026-04-08", load: 135, confidence: "high" },
        ],
      }),
    );

    expect(
      heavier.series.scheduled.points.find((point) => point.date === "2026-04-10")?.readiness,
    ).not.toBe(
      lighter.series.scheduled.points.find((point) => point.date === "2026-04-10")?.readiness,
    );
  });

  it("adds recommended uncertainty ranges from forecast confidence", () => {
    const medium = buildReadinessForecastTimeline(baseInput());
    const low = buildReadinessForecastTimeline(
      baseInput({
        actualDailyLoad: [],
        baseline: {
          start_date: "2026-04-01",
          today: "2026-04-05",
          initial_longTermLoad: 30,
          initial_recentLoad: 30,
          initial_readiness: 50,
          source: "profile_estimate",
          confidence: "low",
          confidence_reason_codes: [],
        },
      }),
    );

    const mediumPoint = medium.series.recommended.points.find((point) => point.readiness !== null);
    const lowPoint = low.series.recommended.points.find((point) => point.readiness !== null);

    expect(mediumPoint?.low).toBeTypeOf("number");
    expect(mediumPoint?.high).toBeTypeOf("number");
    const resolvedLowPoint = requireFixtureValue(
      lowPoint,
      "expected low-confidence readiness point",
    );
    const resolvedMediumPoint = requireFixtureValue(
      mediumPoint,
      "expected medium-confidence readiness point",
    );
    expect(
      requireFixtureValue(resolvedLowPoint.readiness, "expected low readiness") -
        requireFixtureValue(resolvedLowPoint.low, "expected low confidence lower bound") >
        requireFixtureValue(resolvedMediumPoint.readiness, "expected medium readiness") -
          requireFixtureValue(resolvedMediumPoint.low, "expected medium confidence lower bound"),
    ).toBe(true);
  });

  it("lowers confidence when the forecast uses fallback baseline state", () => {
    const forecast = buildReadinessForecastTimeline(
      baseInput({
        baseline: {
          start_date: "2026-04-01",
          today: "2026-04-05",
          initial_longTermLoad: 30,
          initial_recentLoad: 28,
          initial_readiness: 60,
          today_longTermLoad: 34,
          today_recentLoad: 32,
          today_readiness: 62,
          source: "profile_estimate",
          confidence: "high",
          confidence_reason_codes: [],
        },
        actualDailyLoad: [],
      }),
    );

    expect(forecast.confidence).not.toBe("high");
    expect(forecast.confidence_reason_codes).toContain("projection_fallback_baseline");
    expect(forecast.confidence_reason_codes).toContain("missing_recent_history");
  });

  it("returns sorted deterministic series and stable reason codes", () => {
    const first = buildReadinessForecastTimeline(
      baseInput({
        scheduledDailyLoad: [
          { date: "2026-04-08", load: 65, confidence: "medium" },
          { date: "2026-04-01", load: 70, confidence: "high" },
          { date: "2026-04-06", load: 60, confidence: "medium" },
          { date: "2026-04-03", load: 75, confidence: "high" },
        ],
      }),
    );
    const second = buildReadinessForecastTimeline(
      baseInput({
        scheduledDailyLoad: [
          { date: "2026-04-08", load: 65, confidence: "medium" },
          { date: "2026-04-01", load: 70, confidence: "high" },
          { date: "2026-04-06", load: 60, confidence: "medium" },
          { date: "2026-04-03", load: 75, confidence: "high" },
        ],
      }),
    );

    expect(first).toEqual(second);
    expect(first.series.scheduled.points.map((point) => point.date)).toEqual(
      [...first.series.scheduled.points.map((point) => point.date)].sort(),
    );
    expect(first.confidence_reason_codes).toEqual(["inferred_scheduled_load"]);
  });

  it("selects gap summaries in deterministic priority order", () => {
    const lowConfidence = buildReadinessForecastTimeline(
      baseInput({
        actualDailyLoad: [],
        scheduledDailyLoad: [],
        recommendedDailyLoad: [],
      }),
    );
    const overload = buildReadinessForecastTimeline(
      baseInput({
        scheduledDailyLoad: [
          { date: "2026-04-06", load: 240, confidence: "high" },
          { date: "2026-04-07", load: 240, confidence: "high" },
        ],
        recommendedDailyLoad: [{ date: "2026-04-06", load: 60 }],
      }),
    );
    const goalRisk = buildReadinessForecastTimeline(
      baseInput({
        scheduledDailyLoad: [{ date: "2026-04-06", load: 10, confidence: "high" }],
        recommendedDailyLoad: [{ date: "2026-04-06", load: 10 }],
        goals: [
          {
            goal_id: "goal-1",
            title: "A Race",
            target_date: "2026-04-10",
            target_readiness_min: 99,
          },
        ],
      }),
    );
    const planGap = buildReadinessForecastTimeline(
      baseInput({
        scheduledDailyLoad: [{ date: "2026-04-06", load: 10, confidence: "high" }],
        recommendedDailyLoad: [
          { date: "2026-04-06", load: 80 },
          { date: "2026-04-07", load: 80 },
        ],
        goals: [
          {
            goal_id: "goal-1",
            title: "A Race",
            target_date: "2026-04-10",
            target_readiness_min: 0,
          },
        ],
      }),
    );
    const adherenceGap = buildReadinessForecastTimeline(
      baseInput({
        actualDailyLoad: [
          { date: "2026-04-01", load: 300 },
          { date: "2026-04-02", load: 300 },
          { date: "2026-04-03", load: 300 },
        ],
        scheduledDailyLoad: [
          { date: "2026-04-01", load: 0, confidence: "high" },
          { date: "2026-04-02", load: 0, confidence: "high" },
          { date: "2026-04-03", load: 0, confidence: "high" },
        ],
        recommendedDailyLoad: [{ date: "2026-04-06", load: 60 }],
        goals: [],
      }),
    );
    const onTrack = buildReadinessForecastTimeline(
      baseInput({
        goals: [],
        scheduledDailyLoad: [{ date: "2026-04-06", load: 60, confidence: "high" }],
        recommendedDailyLoad: [{ date: "2026-04-06", load: 60 }],
      }),
    );

    expect(lowConfidence.gap_summary?.type).not.toBe("low_confidence");
    expect(overload.gap_summary?.type).toBe("overload_risk");
    expect(goalRisk.gap_summary?.type).toBe("goal_risk");
    expect(planGap.gap_summary?.type).toBe("plan_gap");
    expect(adherenceGap.gap_summary?.type).toBe("adherence_gap");
    expect(onTrack.gap_summary?.type).toBe("on_track");
  });

  it("simulates adding scheduled load without mutating the base schedule", () => {
    const input = baseInput({
      scheduledDailyLoad: [{ date: "2026-04-06", load: 40, confidence: "high" }],
    });
    const before = buildReadinessForecastTimeline(input);
    const simulation = simulateReadinessScheduleAdjustment({
      forecastInput: input,
      date: "2026-04-07",
      loadDelta: 50,
      comparisonDate: "2026-04-10",
    });
    const after = buildReadinessForecastTimeline(input);

    expect(simulation.adjustment).toEqual({
      date: "2026-04-07",
      load_delta: 50,
      resulting_scheduled_load: 50,
    });
    expect(simulation.scheduled_load).toBe(0);
    expect(simulation.simulated_load).toBe(50);
    expect(simulation.readiness_delta).toBeTypeOf("number");
    expect(after.series.scheduled.points).toEqual(before.series.scheduled.points);
  });

  it("simulates reducing scheduled load and clamps the adjusted day at zero", () => {
    const simulation = simulateReadinessScheduleAdjustment({
      forecastInput: baseInput({
        scheduledDailyLoad: [{ date: "2026-04-06", load: 40, confidence: "high" }],
      }),
      date: "2026-04-06",
      loadDelta: -80,
      comparisonDate: "2026-04-10",
    });

    expect(simulation.adjustment.resulting_scheduled_load).toBe(0);
    expect(simulation.scheduled_load).toBe(40);
    expect(simulation.simulated_load).toBe(0);
    expect(simulation.readiness_delta).toBeTypeOf("number");
  });
});
