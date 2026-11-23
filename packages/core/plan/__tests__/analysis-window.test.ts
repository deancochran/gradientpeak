import { describe, expect, it } from "vitest";
import {
  buildCenteredPlanAnalysisWindow,
  PLAN_ANALYSIS_WINDOW_MAX_DAYS,
  PLAN_ANALYSIS_WINDOW_PERIODS,
  planAnalysisWindowPeriodSchema,
  shiftPlanAnalysisWindow,
} from "../analysisWindow";
import { diffDateOnlyUtcDays } from "../dateOnlyUtc";

describe("Plan analysis windows", () => {
  it("defines exactly the shared 6w, 3m, 6m, and 1y periods", () => {
    expect(PLAN_ANALYSIS_WINDOW_PERIODS).toEqual(["6w", "3m", "6m", "1y"]);
    expect(planAnalysisWindowPeriodSchema.safeParse("12w").success).toBe(false);
    expect(planAnalysisWindowPeriodSchema.safeParse("12m").success).toBe(false);
  });

  it.each(
    PLAN_ANALYSIS_WINDOW_PERIODS,
  )("builds a deterministic centered inclusive %s calendar-date window", (period) => {
    const first = buildCenteredPlanAnalysisWindow({ anchorDate: "2026-04-15", period });
    const second = buildCenteredPlanAnalysisWindow({ anchorDate: "2026-04-15", period });
    const daysBefore = diffDateOnlyUtcDays(first.startDate, first.anchorDate);
    const daysAfter = diffDateOnlyUtcDays(first.anchorDate, first.endDate);

    expect(first).toEqual(second);
    expect(first.inclusiveDayCount).toBe(diffDateOnlyUtcDays(first.startDate, first.endDate) + 1);
    expect(Math.abs(daysBefore - daysAfter)).toBeLessThanOrEqual(1);
    expect(first.inclusiveDayCount).toBeLessThanOrEqual(PLAN_ANALYSIS_WINDOW_MAX_DAYS);
  });

  it("uses calendar months and years, including month-end clamping and leap years", () => {
    expect(buildCenteredPlanAnalysisWindow({ anchorDate: "2026-04-15", period: "3m" })).toEqual({
      period: "3m",
      anchorDate: "2026-04-15",
      startDate: "2026-03-01",
      endDate: "2026-05-31",
      inclusiveDayCount: 92,
    });

    const leapYear = buildCenteredPlanAnalysisWindow({
      anchorDate: "2024-02-29",
      period: "1y",
    });
    expect(leapYear.inclusiveDayCount).toBe(366);
    expect(leapYear.inclusiveDayCount).toBe(PLAN_ANALYSIS_WINDOW_MAX_DAYS);
  });

  it("shifts the anchor by one selected calendar period before re-centering", () => {
    expect(
      shiftPlanAnalysisWindow({ anchorDate: "2026-01-31", period: "3m", direction: 1 }).anchorDate,
    ).toBe("2026-04-30");
    expect(
      shiftPlanAnalysisWindow({ anchorDate: "2024-02-29", period: "1y", direction: 1 }).anchorDate,
    ).toBe("2025-02-28");
    expect(
      shiftPlanAnalysisWindow({ anchorDate: "2026-04-15", period: "6w", direction: -1 }).anchorDate,
    ).toBe("2026-03-04");
  });
});
