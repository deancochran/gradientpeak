import {
  diffDateOnlyUtcDays,
  isValidDateOnlyUtc,
  type ThresholdGoalProgressResult,
} from "@repo/core";

type SupportedGoalProgress = Exclude<ThresholdGoalProgressResult, { status: "unsupported" }>;

export function formatGoalThresholdValue(category: "bike" | "run" | "swim", value: number) {
  if (category === "bike") return `${Math.round(value)} W`;
  if (value <= 0) return "—";
  const seconds = Math.round((category === "run" ? 1000 : 100) / value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} /${category === "run" ? "km" : "100m"}`;
}

export function formatGoalTimeLeft(deadlineDate: string | null, todayDate: string | null) {
  if (
    !deadlineDate ||
    !todayDate ||
    !isValidDateOnlyUtc(deadlineDate) ||
    !isValidDateOnlyUtc(todayDate)
  )
    return "Unavailable";
  const days = diffDateOnlyUtcDays(todayDate, deadlineDate);
  if (days === 0) return "Due today";
  const duration = `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"}`;
  return days < 0 ? `${duration} overdue` : `${duration} left`;
}

export function formatGoalGap(result: SupportedGoalProgress) {
  if (result.metrics.remainingGap === null) return "Unavailable";
  if (result.target.unit === "watts") return `${Math.round(result.metrics.remainingGap)} W`;
  if (!result.current) return "Unavailable";
  const distance = result.target.activityCategory === "swim" ? 100 : 1000;
  const seconds =
    result.metrics.remainingGap === 0
      ? 0
      : Math.max(0, distance / result.current.value - distance / result.target.achievementValue);
  return `${Math.round(seconds)} s/${distance === 100 ? "100m" : "km"}`;
}
