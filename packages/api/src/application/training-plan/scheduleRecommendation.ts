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
  const currentWeekStart = getWeekStartDateOnly(input.today);
  const currentWeek =
    input.loadComparison?.weeks.find((week) => week.week_start === currentWeekStart) ??
    input.loadComparison?.weeks.find((week) => week.week_start >= currentWeekStart) ??
    null;
  const targetDate =
    input.upcomingImpact[0]?.scheduled_at.slice(0, 10) ?? currentWeek?.week_start ?? input.today;
  const hasLoadComparison =
    currentWeek?.scheduled_load != null && currentWeek.recommended_load != null;
  const loadDelta = hasLoadComparison
    ? Math.round((currentWeek.recommended_load! - currentWeek.scheduled_load!) * 10) / 10
    : null;

  if (loadDelta !== null && loadDelta < -15) {
    return {
      type: "reduce_load",
      label: "Review overloaded week",
      description:
        "Move, shorten, or reduce intensity on scheduled sessions above the recommended path.",
      target_date: targetDate,
      target_week_start: currentWeek?.week_start ?? null,
      target_load_delta: loadDelta,
    };
  }

  if (loadDelta !== null && loadDelta > 15) {
    return {
      type: "add_load",
      label: "Adjust schedule",
      description: `Add about ${Math.round(loadDelta)} TSS this week or schedule one moderate session to approach the recommended load.`,
      target_date: targetDate,
      target_week_start: currentWeek?.week_start ?? null,
      target_load_delta: loadDelta,
    };
  }

  if (input.loadComparison !== null && loadDelta === null) {
    return {
      type: "add_schedule_detail",
      label: "Add schedule details",
      description:
        "Add duration and intensity so scheduled load can be compared with the recommended load.",
      target_date: targetDate,
      target_week_start: currentWeek?.week_start ?? null,
      target_load_delta: null,
    };
  }

  if (input.upcomingImpact.length > 0) {
    return {
      type: "review_session",
      label: "View upcoming session",
      description: "Review the next scheduled session and its planned load comparison.",
      target_date: targetDate,
      target_week_start: currentWeek?.week_start ?? null,
      target_load_delta: null,
    };
  }

  if (loadDelta !== null) {
    return {
      type: "maintain_schedule",
      label: "View schedule",
      description:
        "Scheduled load is close to the recommended load. Keep upcoming sessions on track.",
      target_date: targetDate,
      target_week_start: currentWeek?.week_start ?? null,
      target_load_delta: null,
    };
  }

  return null;
}
