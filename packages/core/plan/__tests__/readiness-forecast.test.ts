import { describe, expect, it } from "vitest";
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
      initial_ctl: 42,
      initial_atl: 40,
      initial_readiness: 72,
      source: "history",
      confidence: "high",
      confidence_reason_codes: [],
    },
    actualDailyLoad: [
      { date: "2026-04-01", tss: 45 },
      { date: "2026-04-03", tss: 50 },
      { date: "2026-04-05", tss: 35 },
    ],
    scheduledDailyLoad: [
      { date: "2026-04-01", tss: 70, confidence: "high" },
      { date: "2026-04-03", tss: 75, confidence: "high" },
      { date: "2026-04-06", tss: 60, confidence: "high" },
      { date: "2026-04-08", tss: 65, confidence: "high" },
    ],
    recommendedDailyLoad: [
      { date: "2026-04-06", tss: 55 },
      { date: "2026-04-08", tss: 60 },
      { date: "2026-04-10", tss: 45 },
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
          { date: "2026-04-02", tss: 40 },
          { date: "2026-04-06", tss: 55 },
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

  it("changes future scheduled readiness when scheduled load changes", () => {
    const lighter = buildReadinessForecastTimeline(baseInput());
    const heavier = buildReadinessForecastTimeline(
      baseInput({
        scheduledDailyLoad: [
          { date: "2026-04-01", tss: 70, confidence: "high" },
          { date: "2026-04-03", tss: 75, confidence: "high" },
          { date: "2026-04-06", tss: 130, confidence: "high" },
          { date: "2026-04-08", tss: 135, confidence: "high" },
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
          initial_ctl: 30,
          initial_atl: 30,
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
    expect(
      lowPoint?.readiness! - lowPoint?.low! > mediumPoint?.readiness! - mediumPoint?.low!,
    ).toBe(true);
  });

  it("lowers confidence when the forecast uses fallback baseline state", () => {
    const forecast = buildReadinessForecastTimeline(
      baseInput({
        baseline: {
          start_date: "2026-04-01",
          today: "2026-04-05",
          initial_ctl: 30,
          initial_atl: 28,
          initial_readiness: 60,
          today_ctl: 34,
          today_atl: 32,
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
          { date: "2026-04-08", tss: 65, confidence: "medium" },
          { date: "2026-04-01", tss: 70, confidence: "high" },
          { date: "2026-04-06", tss: 60, confidence: "medium" },
          { date: "2026-04-03", tss: 75, confidence: "high" },
        ],
      }),
    );
    const second = buildReadinessForecastTimeline(
      baseInput({
        scheduledDailyLoad: [
          { date: "2026-04-08", tss: 65, confidence: "medium" },
          { date: "2026-04-01", tss: 70, confidence: "high" },
          { date: "2026-04-06", tss: 60, confidence: "medium" },
          { date: "2026-04-03", tss: 75, confidence: "high" },
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
          { date: "2026-04-06", tss: 240, confidence: "high" },
          { date: "2026-04-07", tss: 240, confidence: "high" },
        ],
        recommendedDailyLoad: [{ date: "2026-04-06", tss: 60 }],
      }),
    );
    const goalRisk = buildReadinessForecastTimeline(
      baseInput({
        scheduledDailyLoad: [{ date: "2026-04-06", tss: 10, confidence: "high" }],
        recommendedDailyLoad: [{ date: "2026-04-06", tss: 10 }],
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
        scheduledDailyLoad: [{ date: "2026-04-06", tss: 10, confidence: "high" }],
        recommendedDailyLoad: [
          { date: "2026-04-06", tss: 80 },
          { date: "2026-04-07", tss: 80 },
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
          { date: "2026-04-01", tss: 300 },
          { date: "2026-04-02", tss: 300 },
          { date: "2026-04-03", tss: 300 },
        ],
        scheduledDailyLoad: [
          { date: "2026-04-01", tss: 0, confidence: "high" },
          { date: "2026-04-02", tss: 0, confidence: "high" },
          { date: "2026-04-03", tss: 0, confidence: "high" },
        ],
        recommendedDailyLoad: [{ date: "2026-04-06", tss: 60 }],
        goals: [],
      }),
    );
    const onTrack = buildReadinessForecastTimeline(
      baseInput({
        goals: [],
        scheduledDailyLoad: [{ date: "2026-04-06", tss: 60, confidence: "high" }],
        recommendedDailyLoad: [{ date: "2026-04-06", tss: 60 }],
      }),
    );

    expect(lowConfidence.gap_summary?.type).toBe("low_confidence");
    expect(overload.gap_summary?.type).toBe("overload_risk");
    expect(goalRisk.gap_summary?.type).toBe("goal_risk");
    expect(planGap.gap_summary?.type).toBe("plan_gap");
    expect(adherenceGap.gap_summary?.type).toBe("adherence_gap");
    expect(onTrack.gap_summary?.type).toBe("on_track");
  });

  it("simulates adding scheduled load without mutating the base schedule", () => {
    const input = baseInput({
      scheduledDailyLoad: [{ date: "2026-04-06", tss: 40, confidence: "high" }],
    });
    const before = buildReadinessForecastTimeline(input);
    const simulation = simulateReadinessScheduleAdjustment({
      forecastInput: input,
      date: "2026-04-07",
      tssDelta: 50,
      comparisonDate: "2026-04-10",
    });
    const after = buildReadinessForecastTimeline(input);

    expect(simulation.adjustment).toEqual({
      date: "2026-04-07",
      tss_delta: 50,
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
        scheduledDailyLoad: [{ date: "2026-04-06", tss: 40, confidence: "high" }],
      }),
      date: "2026-04-06",
      tssDelta: -80,
      comparisonDate: "2026-04-10",
    });

    expect(simulation.adjustment.resulting_scheduled_load).toBe(0);
    expect(simulation.scheduled_load).toBe(40);
    expect(simulation.simulated_load).toBe(0);
    expect(simulation.readiness_delta).toBeTypeOf("number");
  });
});
