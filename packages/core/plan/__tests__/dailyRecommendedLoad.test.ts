import { describe, expect, it } from "vitest";
import { buildDailyRecommendedLoad } from "../dailyRecommendedLoad";

describe("buildDailyRecommendedLoad", () => {
  it("preserves weekly TSS while varying daily load across preferred training days", () => {
    const points = buildDailyRecommendedLoad({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      preferredWeekdays: [1, 3, 5],
      weeklyTargets: [{ weekIndex: 0, targetTss: 300 }],
    });

    expect(points.reduce((sum, point) => sum + point.recommendedLoadTss, 0)).toBe(300);
    expect(points.map((point) => point.recommendedLoadTss)).toEqual([0, 58, 0, 105, 0, 137, 0]);
    expect(new Set(points.map((point) => point.recommendedLoadTss)).size).toBeGreaterThan(2);
  });

  it("uses session estimates and focus to make key days heavier than recovery days", () => {
    const points = buildDailyRecommendedLoad({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      weeklyTargets: [{ weekIndex: 0, targetTss: 280 }],
      sessions: [
        { offsetDays: 1, estimatedTss: 35, intentType: "recovery" },
        { offsetDays: 3, estimatedTss: 85, intentType: "threshold" },
        { offsetDays: 5, estimatedTss: 130, intentType: "endurance" },
      ],
    });

    expect(points.reduce((sum, point) => sum + point.recommendedLoadTss, 0)).toBe(280);
    expect(points[5]?.recommendedLoadTss).toBeGreaterThan(points[3]?.recommendedLoadTss ?? 0);
    expect(points[3]?.recommendedLoadTss).toBeGreaterThan(points[1]?.recommendedLoadTss ?? 0);
    expect(points[5]?.primaryFocus).toBe("long_endurance");
  });

  it("keeps completed load comparison neutral without inferring skipped or missed state", () => {
    const points = buildDailyRecommendedLoad({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      preferredWeekdays: [0, 2, 4],
      weeklyTargets: [{ weekIndex: 0, targetTss: 210 }],
      completedLoads: [{ date: "2026-01-05", tss: 20 }],
    });

    const firstDay = points[0];
    expect(firstDay).toBeDefined();
    if (!firstDay) return;
    expect(firstDay.loadDeltaTss).toBe(firstDay.completedLoadTss - firstDay.recommendedLoadTss);
    expect(firstDay.reasonCodes.join(" ")).not.toMatch(/miss|skip/i);
  });

  it("uses scaled TSS as the fatigue fallback for partial weeks", () => {
    const points = buildDailyRecommendedLoad({
      startDate: "2026-01-05",
      endDate: "2026-01-07",
      preferredWeekdays: [0, 1, 2],
      weeklyTargets: [{ weekIndex: 0, targetTss: 280 }],
    });

    const recommendedTss = points.reduce((sum, point) => sum + point.recommendedLoadTss, 0);
    const recommendedFatigue = points.reduce((sum, point) => sum + point.recommendedFatigueCost, 0);

    expect(recommendedTss).toBe(120);
    expect(recommendedFatigue).toBe(recommendedTss);
  });

  it("emits high confidence reasons for explicit planned session days", () => {
    const points = buildDailyRecommendedLoad({
      startDate: "2026-01-05",
      endDate: "2026-01-11",
      preferredWeekdays: [1, 3, 5],
      weeklyTargets: [{ weekIndex: 0, targetTss: 300 }],
      sessions: [
        {
          offsetDays: 3,
          estimatedTss: 90,
          primaryFocus: "threshold",
          activityCategory: "bike",
        },
      ],
    });

    const plannedDay = points[3];
    expect(plannedDay?.confidence).toBe("high");
    expect(plannedDay?.confidence_score).toBeGreaterThanOrEqual(80);
    expect(plannedDay?.reasonCodes).toEqual([
      "daily_recommended_load_v1",
      "source_weekly_target",
      "target_positive_tss",
      "source_planned_session",
      "planned_session_estimated_tss",
      "planned_session_explicit_focus",
      "planned_session_explicit_activity",
      "source_preferred_weekdays",
      "weekly_target_daily_distribution",
    ]);
  });

  it("marks missing targets and default weekday fallback as low confidence", () => {
    const points = buildDailyRecommendedLoad({
      startDate: "2026-01-05",
      endDate: "2026-01-07",
      weeklyTargets: [],
    });

    expect(points[0]?.confidence).toBe("low");
    expect(points[0]?.reasonCodes).toEqual([
      "daily_recommended_load_v1",
      "source_missing_weekly_target",
      "target_zero_tss",
      "partial_week_scaled",
      "fallback_no_planned_session",
      "fallback_missing_preferred_weekdays",
      "fallback_default_all_weekdays",
      "weekly_target_daily_distribution",
    ]);
  });
});
