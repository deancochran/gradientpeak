import type { TrainingPlanBuilderSession, TrainingPlanBuilderState } from "./types";

export const BUILDER_WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;
export const BUILDER_WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export function getBuilderWeekdayIndex(offsetDays: number) {
  return ((offsetDays % 7) + 7) % 7;
}

export function formatBuilderWeekday(offsetDays: number) {
  return BUILDER_WEEKDAY_NAMES[getBuilderWeekdayIndex(offsetDays)] ?? "Weekday";
}

export function formatBuilderWeekdayWithWeek(offsetDays: number) {
  return `${formatBuilderWeekLabel(Math.floor(offsetDays / 7))} · ${formatBuilderWeekday(offsetDays)}`;
}

export function formatBuilderRelativeDay(offsetDays: number) {
  return offsetDays === 0 ? "Day 1" : `Day ${offsetDays + 1}`;
}

export function formatBuilderCompactDay(offsetDays: number) {
  return `D${offsetDays + 1}`;
}

export function formatBuilderWeekLabel(weekIndex: number) {
  return `Week ${weekIndex + 1}`;
}

export function formatBuilderSessionTitle(session: TrainingPlanBuilderSession) {
  return session.eventOverrides?.title ?? session.activityPlan?.name ?? "Unassigned workout";
}

export function formatBuilderCompactDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatBuilderGoalOffsetDetail(targetOffsetDays: number | null) {
  return targetOffsetDays !== null ? ` · ${targetOffsetDays}d away` : "";
}

export function formatBuilderGender(
  gender: TrainingPlanBuilderState["athleteContext"]["demographics"]["gender"],
) {
  if (gender === "prefer_not_to_say" || gender === null) {
    return null;
  }
  return gender === "male" ? "Male" : gender === "female" ? "Female" : "Other";
}

export function formatBuilderNumberWithUnit(value: number | null, unit: string | null) {
  if (value === null) {
    return null;
  }
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1);
  return unit ? `${rounded} ${unit}` : rounded;
}
