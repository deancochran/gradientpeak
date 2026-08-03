import {
  type CommonLoadIdentity,
  type CompletedObservationState,
  sameCommonLoadIdentity,
} from "@/lib/training-path/completedCommonLoadObservation";

export type TrainingPathSelectedWeekPoint = {
  actualOrScheduledLoad?: number | null;
  completedLoad?: number | null;
  completedObservationState?: CompletedObservationState;
  completedCommonLoadIdentity?: CommonLoadIdentity | null;
  date: string;
  hasTargetLoad?: boolean;
  hasCompletedActivityWithoutLoad?: boolean;
  plannedLoad?: number | null;
  targetLoad?: number | null;
  tentativePlannedLoad?: number | null;
};

export type TrainingPathSelectedWeekBucket<TPoint extends TrainingPathSelectedWeekPoint> = {
  actualOrScheduledLoad: number | null;
  completedLoad: number | null;
  completedLoadUnavailable: boolean;
  loadDelta: number | null;
  plannedLoad: number | null;
  points: TPoint[];
  targetLoad: number | null;
  weekEndDate: string;
  weekStartDate: string;
};

function finiteValue(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isPositiveFinite(value: number | null | undefined): boolean {
  const finite = finiteValue(value);
  return finite !== null && finite > 0;
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
  const sumAvailable = (selector: (point: TPoint) => number | null | undefined) => {
    const values = points.map((point) => finiteValue(selector(point)));
    if (values.some((value) => value === null)) return null;
    return values
      .filter((value): value is number => value !== null)
      .reduce((total, value) => total + value, 0);
  };
  let completedIdentity: CommonLoadIdentity | null = null;
  let completedLoadUnavailable = false;
  let hasCompletedObservation = false;
  let completedLoad = 0;
  for (const point of points) {
    const finiteCompletedLoad = finiteValue(point.completedLoad);
    if (point.completedObservationState === "observed") {
      hasCompletedObservation = true;
      if (
        point.hasCompletedActivityWithoutLoad ||
        !point.completedCommonLoadIdentity ||
        finiteCompletedLoad === null ||
        (completedIdentity &&
          !sameCommonLoadIdentity(completedIdentity, point.completedCommonLoadIdentity))
      ) {
        completedLoadUnavailable = true;
      } else {
        completedIdentity ??= point.completedCommonLoadIdentity;
        completedLoad += finiteCompletedLoad;
      }
    } else if (point.completedObservationState === "known_zero") {
      hasCompletedObservation = true;
    } else if (
      point.completedObservationState === "unavailable" ||
      point.completedObservationState === "uncovered"
    ) {
      completedLoadUnavailable = true;
    } else if (isPositiveFinite(point.completedLoad)) {
      completedLoadUnavailable = true;
    }
  }
  const targetLoadByDate = new Map(
    points.flatMap((point) =>
      point.hasTargetLoad !== false &&
      typeof point.targetLoad === "number" &&
      Number.isFinite(point.targetLoad)
        ? [[point.date, point.targetLoad] as const]
        : [],
    ),
  );
  const hasCompleteTargetCoverage = Array.from({ length: 7 }, (_, index) => {
    const dateKey = dateKeyAtOffset(input.weekStart, index);
    return dateKey !== null && targetLoadByDate.has(dateKey);
  }).every(Boolean);
  const actualOrScheduledLoad = sumAvailable((point) => point.actualOrScheduledLoad);
  const targetLoad = hasCompleteTargetCoverage
    ? [...targetLoadByDate.values()].reduce((total, value) => total + value, 0)
    : null;
  return {
    actualOrScheduledLoad,
    completedLoad: hasCompletedObservation && !completedLoadUnavailable ? completedLoad : null,
    completedLoadUnavailable,
    loadDelta:
      targetLoad == null || completedLoadUnavailable || actualOrScheduledLoad == null
        ? null
        : actualOrScheduledLoad - targetLoad,
    plannedLoad: (() => {
      const planned = sumAvailable((point) => point.plannedLoad);
      const tentative = sumAvailable((point) => point.tentativePlannedLoad);
      return planned === null || tentative === null ? null : planned + tentative;
    })(),
    points,
    targetLoad,
    weekEndDate: input.weekEnd,
    weekStartDate: input.weekStart,
  };
}
