import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import {
  diffDateOnlyUtcDays,
  formatDateOnlyInTimeZone,
  isValidDateOnlyUtc,
} from "@repo/core/calendar";
import { buildChartSegments, getPaddedChartDomain } from "@repo/ui/lib/chart";

type Outputs = inferRouterOutputs<AppRouter>["athleteIntelligence"];
export type GoalProgress = Outputs["getGoalProgress"];
export type ThresholdHistory = Outputs["getThresholdOverview"]["history"]["items"];

export function nearestGoalChartPoint(
  points: readonly { label?: string; plotX: number; plotY: number }[],
  pointer: { x: number; y: number; width: number; height: number },
) {
  if (pointer.width <= 0 || pointer.height <= 0) return null;
  let nearest: string | null = null;
  let distance = Infinity;
  for (const point of points) {
    const candidate = Math.hypot(
      (point.plotX * pointer.width) / 100 - pointer.x,
      (point.plotY * pointer.height) / 100 - pointer.y,
    );
    if (point.label && candidate < distance) {
      distance = candidate;
      nearest = point.label;
    }
  }
  return nearest;
}

export function goalPlanningDate(instant: Date, timezone: string | null) {
  if (!timezone) return null;
  try {
    return formatDateOnlyInTimeZone(instant, timezone);
  } catch {
    return null;
  }
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

export function formatGoalGap(result: Exclude<GoalProgress["result"], { status: "unsupported" }>) {
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

export function formatThreshold(value: number, category: "bike" | "run" | "swim") {
  if (category === "bike") return `${Math.round(value)} W`;
  if (value <= 0) return "—";
  const seconds = Math.round((category === "run" ? 1000 : 100) / value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} /${category === "run" ? "km" : "100m"}`;
}

export function buildGoalProgressPlot(data: GoalProgress, history: ThresholdHistory) {
  const result = data.result;
  if (result.status === "unsupported") return null;
  const candidates = [...history, data.provenance?.baseline, data.provenance?.current];
  const unique = new Map<string, ThresholdHistory[number]>();
  for (const point of candidates) {
    if (
      point &&
      point.activityCategory === result.target.activityCategory &&
      point.metric === result.target.metric &&
      point.unit === result.target.unit &&
      Date.parse(point.effectiveAt) <= Date.parse(result.assessedAt)
    ) {
      unique.set(point.thresholdId, point);
    }
  }
  const points = [...unique.values()].sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt));
  const domain = getPaddedChartDomain(
    [...points.map((point) => point.value), result.target.targetValue],
    { minimumPadding: result.target.unit === "watts" ? 1 : 0.01 },
  );
  const deadline = Date.parse(result.deadlineAt);
  const start = Math.min(
    Date.parse(result.assessedAt),
    deadline,
    ...points.map((point) => Date.parse(point.effectiveAt)),
  );
  const end = Math.max(
    Date.parse(result.assessedAt),
    deadline,
    ...points.map((point) => Date.parse(point.effectiveAt)),
  );
  const segments = buildChartSegments(
    [
      { x: start, y: null },
      ...points.flatMap((point, index) => {
        const previous = points[index - 1];
        // Preserve the canonical evidence set, but do not draw a continuous trend
        // across a measurement-method or policy change.
        const boundary =
          previous &&
          (previous.method !== point.method || previous.policyVersion !== point.policyVersion);
        return [
          ...(boundary ? [{ x: Date.parse(point.effectiveAt), y: null }] : []),
          { x: Date.parse(point.effectiveAt), y: point.value, label: point.thresholdId },
        ];
      }),
      { x: end, y: null },
    ],
    { domain, left: 8, right: 92, top: 10, bottom: 86 },
  );
  return {
    points,
    segments,
    domain,
    start,
    end,
    deadlineX: start === end ? 50 : 8 + ((deadline - start) / (end - start)) * 84,
    assessedX:
      start === end ? 50 : 8 + ((Date.parse(result.assessedAt) - start) / (end - start)) * 84,
    targetY: 86 - ((result.target.targetValue - domain.min) / (domain.max - domain.min)) * 76,
  };
}
