import { addDaysDateKey } from "../plan/trainingLoadTimeline";

export type DailyTrainingLoadAdjustment = {
  date: string;
  plannedLoad: number | null;
  tentativePlannedLoad: number | null;
  completedLoad: number | null;
  targetLoad: number | null;
  actualOrScheduledLoad: number | null;
  loadDelta: number | null;
  plannedDelta: number | null;
};

export type DailyTrainingLoadAdjustmentInput = Partial<
  Omit<DailyTrainingLoadAdjustment, "actualOrScheduledLoad" | "date" | "loadDelta" | "plannedDelta">
> & {
  actualOrScheduledLoad?: number | null;
  completedLoad?: number | null;
  date: string;
  plannedLoad?: number | null;
  remainingScheduledLoad?: number | null;
  targetLoad?: number | null;
  tentativePlannedLoad?: number | null;
};

export type WeeklyTrainingLoadAdjustment = {
  weekStartDate: string;
  weekEndDate: string;
  points: DailyTrainingLoadAdjustment[];
  plannedLoad: number | null;
  tentativePlannedLoad: number | null;
  completedLoad: number | null;
  targetLoad: number | null;
  actualOrScheduledLoad: number | null;
  loadDelta: number | null;
  plannedDelta: number | null;
};

function finiteNonnegativeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function deriveLoad(
  values: readonly (number | null)[],
  calculation: (...knownValues: number[]) => number,
): number | null {
  return values.some((value) => value === null)
    ? null
    : calculation(...values.filter((value): value is number => value !== null));
}

function dateKeyRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = startDate;
  for (let guard = 0; cursor <= endDate && guard < 3700; guard += 1) {
    dates.push(cursor);
    cursor = addDaysDateKey(cursor, 1);
  }
  return dates;
}

/**
 * Normalizes sparse load inputs and derives the canonical expected load and deltas.
 * Completed load replaces the matching portion of scheduled load while pending
 * scheduled and tentative load remains in the day's expected total.
 */
export function normalizeDailyTrainingLoadAdjustments(input: {
  startDate: string;
  endDate: string;
  points?: DailyTrainingLoadAdjustmentInput[];
}): DailyTrainingLoadAdjustment[] {
  const pointsByDate = new Map((input.points ?? []).map((point) => [point.date, point]));

  return dateKeyRange(input.startDate, input.endDate).map((date) => {
    const raw = pointsByDate.get(date);
    const plannedLoad = finiteNonnegativeNumber(raw?.plannedLoad);
    const tentativePlannedLoad = finiteNonnegativeNumber(raw?.tentativePlannedLoad);
    const completedLoad = finiteNonnegativeNumber(raw?.completedLoad);
    const targetLoad = finiteNonnegativeNumber(raw?.targetLoad);
    const remainingScheduledLoad =
      raw?.remainingScheduledLoad === undefined
        ? deriveLoad(
            [plannedLoad, tentativePlannedLoad, completedLoad],
            (planned, tentative, completed) => Math.max(0, planned + tentative - completed),
          )
        : finiteNonnegativeNumber(raw.remainingScheduledLoad);
    const actualOrScheduledLoad =
      raw?.actualOrScheduledLoad === undefined
        ? deriveLoad(
            [completedLoad, remainingScheduledLoad],
            (completed, remaining) => completed + remaining,
          )
        : finiteNonnegativeNumber(raw.actualOrScheduledLoad);

    return {
      date,
      plannedLoad,
      tentativePlannedLoad,
      completedLoad,
      targetLoad,
      actualOrScheduledLoad,
      loadDelta: deriveLoad(
        [actualOrScheduledLoad, targetLoad],
        (actual, target) => actual - target,
      ),
      plannedDelta: deriveLoad(
        [plannedLoad, tentativePlannedLoad, targetLoad],
        (planned, tentative, target) => planned + tentative - target,
      ),
    };
  });
}

export function aggregateDailyTrainingLoadAdjustmentsToWeeks(
  points: DailyTrainingLoadAdjustment[],
): WeeklyTrainingLoadAdjustment[] {
  const buckets: WeeklyTrainingLoadAdjustment[] = [];
  for (let index = 0; index < points.length; index += 7) {
    const weekPoints = points.slice(index, index + 7);
    const weekStartDate = weekPoints[0]?.date;
    const weekEndDate = weekPoints[weekPoints.length - 1]?.date;
    if (!weekStartDate || !weekEndDate) continue;

    const sum = (selector: (point: DailyTrainingLoadAdjustment) => number | null) =>
      deriveLoad(weekPoints.map(selector), (...values) =>
        values.reduce((total, value) => total + value, 0),
      );
    const plannedLoad = sum((point) => point.plannedLoad);
    const tentativePlannedLoad = sum((point) => point.tentativePlannedLoad);
    const targetLoad = sum((point) => point.targetLoad);
    const actualOrScheduledLoad = sum((point) => point.actualOrScheduledLoad);

    buckets.push({
      weekStartDate,
      weekEndDate,
      points: weekPoints,
      plannedLoad,
      tentativePlannedLoad,
      completedLoad: sum((point) => point.completedLoad),
      targetLoad,
      actualOrScheduledLoad,
      loadDelta: deriveLoad(
        [actualOrScheduledLoad, targetLoad],
        (actual, target) => actual - target,
      ),
      plannedDelta: deriveLoad(
        [plannedLoad, tentativePlannedLoad, targetLoad],
        (planned, tentative, target) => planned + tentative - target,
      ),
    });
  }
  return buckets;
}
