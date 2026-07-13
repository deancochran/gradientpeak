import { addDaysDateKey } from "../plan/trainingLoadTimeline";

export type DailyTrainingLoadAdjustment = {
  date: string;
  plannedLoadTss: number;
  tentativePlannedLoadTss: number;
  completedLoadTss: number;
  targetLoadTss: number;
  actualOrScheduledLoadTss: number;
  loadDeltaTss: number;
  plannedDeltaTss: number;
};

export type DailyTrainingLoadAdjustmentInput = Partial<
  Omit<
    DailyTrainingLoadAdjustment,
    "actualOrScheduledLoadTss" | "date" | "loadDeltaTss" | "plannedDeltaTss"
  >
> & {
  actualOrScheduledLoadTss?: number | null;
  completedLoadTss?: number | null;
  date: string;
  plannedLoadTss?: number | null;
  remainingScheduledLoadTss?: number | null;
  targetLoadTss?: number | null;
  tentativePlannedLoadTss?: number | null;
};

export type WeeklyTrainingLoadAdjustment = {
  weekStartDate: string;
  weekEndDate: string;
  points: DailyTrainingLoadAdjustment[];
  plannedLoadTss: number;
  tentativePlannedLoadTss: number;
  completedLoadTss: number;
  targetLoadTss: number;
  actualOrScheduledLoadTss: number;
  loadDeltaTss: number;
  plannedDeltaTss: number;
};

function finiteNumber(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
    const plannedLoadTss = finiteNumber(raw?.plannedLoadTss);
    const tentativePlannedLoadTss = finiteNumber(raw?.tentativePlannedLoadTss);
    const completedLoadTss = finiteNumber(raw?.completedLoadTss);
    const targetLoadTss = finiteNumber(raw?.targetLoadTss);
    const remainingScheduledLoadTss = finiteNumber(
      raw?.remainingScheduledLoadTss,
      Math.max(0, plannedLoadTss + tentativePlannedLoadTss - completedLoadTss),
    );
    const actualOrScheduledLoadTss = finiteNumber(
      raw?.actualOrScheduledLoadTss,
      completedLoadTss + remainingScheduledLoadTss,
    );

    return {
      date,
      plannedLoadTss,
      tentativePlannedLoadTss,
      completedLoadTss,
      targetLoadTss,
      actualOrScheduledLoadTss,
      loadDeltaTss: actualOrScheduledLoadTss - targetLoadTss,
      plannedDeltaTss: plannedLoadTss + tentativePlannedLoadTss - targetLoadTss,
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

    const sum = (selector: (point: DailyTrainingLoadAdjustment) => number) =>
      weekPoints.reduce((total, point) => total + selector(point), 0);
    const plannedLoadTss = sum((point) => point.plannedLoadTss);
    const tentativePlannedLoadTss = sum((point) => point.tentativePlannedLoadTss);
    const targetLoadTss = sum((point) => point.targetLoadTss);
    const actualOrScheduledLoadTss = sum((point) => point.actualOrScheduledLoadTss);

    buckets.push({
      weekStartDate,
      weekEndDate,
      points: weekPoints,
      plannedLoadTss,
      tentativePlannedLoadTss,
      completedLoadTss: sum((point) => point.completedLoadTss),
      targetLoadTss,
      actualOrScheduledLoadTss,
      loadDeltaTss: actualOrScheduledLoadTss - targetLoadTss,
      plannedDeltaTss: plannedLoadTss + tentativePlannedLoadTss - targetLoadTss,
    });
  }
  return buckets;
}
