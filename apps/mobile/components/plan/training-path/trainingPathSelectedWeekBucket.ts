import type { ActivityTssIdentity } from "@repo/core";
import type { CompletedObservationState } from "@/lib/training-path/completedTssObservation";
import { sameTssIdentity } from "@/lib/training-path/completedTssObservation";

export type TrainingPathSelectedWeekPoint = {
  actualOrScheduledLoadTss?: number | null;
  completedLoadTss?: number | null;
  completedObservationState?: CompletedObservationState;
  completedTssIdentity?: ActivityTssIdentity | null;
  date: string;
  hasTargetLoad?: boolean;
  hasCompletedActivityWithoutLoad?: boolean;
  plannedLoadTss?: number | null;
  targetLoadTss?: number | null;
  tentativePlannedLoadTss?: number | null;
};

export type TrainingPathSelectedWeekBucket<TPoint extends TrainingPathSelectedWeekPoint> = {
  actualOrScheduledLoadTss: number;
  completedLoadTss: number | null;
  completedLoadUnavailable: boolean;
  loadDeltaTss: number | null;
  plannedLoadTss: number;
  points: TPoint[];
  targetLoadTss: number | null;
  weekEndDate: string;
  weekStartDate: string;
};

function numberValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dateKeyAtOffset(dateKey: string, offsetDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== dateKey) return null;
  date.setUTCDate(date.getUTCDate() + offsetDays);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function buildSelectedWeekBucket<TPoint extends TrainingPathSelectedWeekPoint>(input: {
  points: TPoint[];
  weekEnd: string;
  weekStart: string;
}): TrainingPathSelectedWeekBucket<TPoint> | null {
  const points = input.points.filter(
    (point) => point.date >= input.weekStart && point.date <= input.weekEnd,
  );
  if (points.length === 0) return null;
  const sum = (selector: (point: TPoint) => number | null | undefined) =>
    points.reduce((total, point) => total + numberValue(selector(point)), 0);
  let completedIdentity: ActivityTssIdentity | null = null;
  let completedLoadUnavailable = false;
  let hasCompletedObservation = false;
  let completedLoadTss = 0;
  for (const point of points) {
    if (point.completedObservationState === "observed") {
      hasCompletedObservation = true;
      if (
        point.hasCompletedActivityWithoutLoad ||
        !point.completedTssIdentity ||
        (completedIdentity && !sameTssIdentity(completedIdentity, point.completedTssIdentity))
      ) {
        completedLoadUnavailable = true;
      } else {
        completedIdentity ??= point.completedTssIdentity;
        completedLoadTss += numberValue(point.completedLoadTss);
      }
    } else if (point.completedObservationState === "known_zero") {
      hasCompletedObservation = true;
    } else if (
      point.completedObservationState === "unavailable" ||
      point.completedObservationState === "uncovered"
    ) {
      completedLoadUnavailable = true;
    } else if (numberValue(point.completedLoadTss) > 0) {
      completedLoadUnavailable = true;
    }
  }
  const targetLoadByDate = new Map(
    points.flatMap((point) =>
      point.hasTargetLoad !== false &&
      typeof point.targetLoadTss === "number" &&
      Number.isFinite(point.targetLoadTss)
        ? [[point.date, point.targetLoadTss] as const]
        : [],
    ),
  );
  const hasCompleteTargetCoverage = Array.from({ length: 7 }, (_, index) => {
    const dateKey = dateKeyAtOffset(input.weekStart, index);
    return dateKey !== null && targetLoadByDate.has(dateKey);
  }).every(Boolean);
  const actualOrScheduledLoadTss = sum((point) => point.actualOrScheduledLoadTss);
  const targetLoadTss = hasCompleteTargetCoverage
    ? [...targetLoadByDate.values()].reduce((total, value) => total + value, 0)
    : null;
  return {
    actualOrScheduledLoadTss,
    completedLoadTss:
      hasCompletedObservation && !completedLoadUnavailable ? completedLoadTss : null,
    completedLoadUnavailable,
    loadDeltaTss:
      targetLoadTss == null || completedLoadUnavailable
        ? null
        : actualOrScheduledLoadTss - targetLoadTss,
    plannedLoadTss:
      sum((point) => point.plannedLoadTss) + sum((point) => point.tentativePlannedLoadTss),
    points,
    targetLoadTss,
    weekEndDate: input.weekEnd,
    weekStartDate: input.weekStart,
  };
}
