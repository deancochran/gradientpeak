import { formatDateOnlyUtc, parseDateOnlyUtc } from "@repo/core";
import type { UpcomingActivityImpact } from "./upcomingActivityImpact";

type ReadinessForecastForScheduleRecommendation = {
  gap_summary?: {
    type?: string | null;
  } | null;
};

type WeeklyLoadComparisonForScheduleRecommendation = {
  weeks: Array<{
    week_start: string;
    scheduled_load: number | null;
    recommended_load: number | null;
  }>;
};

export type ScheduleRecommendation = {
  type: "add_load" | "reduce_load" | "add_schedule_detail" | "review_session" | "maintain_schedule";
  label: string;
  description: string;
  target_date: string;
  target_week_start: string | null;
  target_load_delta: number | null;
};

function getWeekStartDateOnly(date: string): string {
  const parsed = parseDateOnlyUtc(date);
  const day = parsed.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return formatDateOnlyUtc(parsed);
}

export function buildScheduleRecommendation(input: {
  today: string;
  readinessForecast: ReadinessForecastForScheduleRecommendation;
  loadComparison: WeeklyLoadComparisonForScheduleRecommendation | null;
  upcomingImpact: UpcomingActivityImpact[];
}): ScheduleRecommendation | null {
  const gapType = input.readinessForecast.gap_summary?.type;
  const currentWeekStart = getWeekStartDateOnly(input.today);
  const currentWeek =
    input.loadComparison?.weeks.find((week) => week.week_start === currentWeekStart) ??
    input.loadComparison?.weeks.find((week) => week.week_start >= currentWeekStart) ??
    null;
  const targetDate =
    input.upcomingImpact[0]?.scheduled_at.slice(0, 10) ?? currentWeek?.week_start ?? input.today;
  const scheduledLoad = currentWeek?.scheduled_load ?? 0;
  const recommendedLoad = currentWeek?.recommended_load ?? 0;
  const loadDelta = Math.round((recommendedLoad - scheduledLoad) * 10) / 10;

  if (gapType === "overload_risk") {
    return {
      type: "reduce_load",
      label: "Review overloaded week",
      description:
        "Move, shorten, or reduce intensity on scheduled sessions above the recommended path.",
      target_date: targetDate,
      target_week_start: currentWeek?.week_start ?? null,
      target_load_delta: loadDelta < 0 ? loadDelta : null,
    };
  }

  if (gapType === "plan_gap" || gapType === "goal_risk") {
    return {
      type: "add_load",
      label: "Adjust schedule",
      description:
        loadDelta > 15
          ? `Add about ${Math.round(loadDelta)} TSS this week or schedule one moderate session.`
          : "Add or refine scheduled sessions to close the readiness gap before your goal.",
      target_date: targetDate,
      target_week_start: currentWeek?.week_start ?? null,
      target_load_delta: loadDelta > 0 ? loadDelta : null,
    };
  }

  if (gapType === "low_confidence") {
    return {
      type: "add_schedule_detail",
      label: "Add schedule details",
      description: "Add duration and intensity to upcoming sessions for a more reliable forecast.",
      target_date: targetDate,
      target_week_start: currentWeek?.week_start ?? null,
      target_load_delta: null,
    };
  }

  if (input.upcomingImpact.length > 0) {
    return {
      type: "review_session",
      label: "View upcoming session",
      description: "Review the next scheduled session and its expected readiness impact.",
      target_date: targetDate,
      target_week_start: currentWeek?.week_start ?? null,
      target_load_delta: null,
    };
  }

  if (gapType === "on_track") {
    return {
      type: "maintain_schedule",
      label: "View schedule",
      description:
        "Your schedule is aligned with the recommended path. Keep upcoming sessions on track.",
      target_date: targetDate,
      target_week_start: currentWeek?.week_start ?? null,
      target_load_delta: null,
    };
  }

  return null;
}
