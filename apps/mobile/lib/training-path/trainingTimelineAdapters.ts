import type { DailyCommonLoadObservation } from "@repo/core/load";
import type { TrainingTimelineWindow } from "@repo/core/training-timeline";
import {
  type CompletedObservationMetadata,
  sameCommonLoadIdentity,
} from "./completedCommonLoadObservation";
import {
  type DailyTrainingAdjustmentPoint,
  normalizeDailyTrainingAdjustmentPoints,
  type TrainingPathDailyFitnessInput,
  type TrainingPathDailyLoadInput,
} from "./dailyTrainingPathModel";

export { sameCommonLoadIdentity } from "./completedCommonLoadObservation";

export type DailyCommonLoadObservationsResponse = {
  end_date: string;
  observations: readonly DailyCommonLoadObservation[];
  start_date: string;
  timezone: string;
};

function eachDate(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00.000Z`);
  const end = new Date(`${endDate}T12:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Adds Plan-only future known-zero metadata without changing historical API coverage semantics. */
export function buildEffectiveCompletedObservationsByDate(input: {
  completedObservationsByDate: ReadonlyMap<string, CompletedObservationMetadata>;
  endDate: string;
  todayKey: string;
}) {
  const effective = new Map(input.completedObservationsByDate);
  if (input.endDate <= input.todayKey) return effective;
  for (const date of eachDate(input.todayKey, input.endDate)) {
    if (date <= input.todayKey) continue;
    effective.set(date, {
      hasUnavailableCompletedActivity: false,
      identity: null,
      state: "known_zero",
    });
  }
  return effective;
}

export type CompletedCommonLoadObservationMerge = {
  completedObservationsByDate: Map<string, CompletedObservationMetadata>;
  completedActivityDatesWithoutLoad: string[];
  timeline: Array<
    Omit<
      TrainingPathDailyLoadInput,
      "completed_common_load" | "recommended_common_load" | "scheduled_common_load"
    > & {
      completed_common_load: number;
      recommended_common_load: number;
      scheduled_common_load: number;
    }
  >;
};

function normalizeCompletedLoadTimeline(
  points: readonly TrainingPathDailyLoadInput[],
): CompletedCommonLoadObservationMerge["timeline"] {
  return points
    .map((point) => ({
      ...point,
      completed_common_load:
        typeof point.completed_common_load === "number" &&
        Number.isFinite(point.completed_common_load)
          ? point.completed_common_load
          : 0,
      recommended_common_load:
        typeof point.recommended_common_load === "number" &&
        Number.isFinite(point.recommended_common_load)
          ? point.recommended_common_load
          : 0,
      scheduled_common_load:
        typeof point.scheduled_common_load === "number" &&
        Number.isFinite(point.scheduled_common_load)
          ? point.scheduled_common_load
          : 0,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

/** Applies authoritative API local-day observations without collapsing unavailable load to zero. */
export function mergeCompletedCommonLoadObservations(input: {
  requestedRange?: { end_date: string; start_date: string; timezone: string } | null;
  response?: DailyCommonLoadObservationsResponse | null;
  timeline?: readonly TrainingPathDailyLoadInput[] | null;
}): CompletedCommonLoadObservationMerge {
  const timelineByDate = new Map((input.timeline ?? []).map((point) => [point.date, { ...point }]));
  const completedObservationsByDate = new Map<string, CompletedObservationMetadata>();
  if (!input.requestedRange) {
    return {
      completedObservationsByDate,
      completedActivityDatesWithoutLoad: [],
      timeline: normalizeCompletedLoadTimeline([...timelineByDate.values()]),
    };
  }

  for (const date of eachDate(input.requestedRange.start_date, input.requestedRange.end_date)) {
    completedObservationsByDate.set(date, {
      hasUnavailableCompletedActivity: false,
      identity: null,
      state: "uncovered",
    });
    const existing = timelineByDate.get(date);
    if (existing) {
      timelineByDate.set(date, { ...existing, completed_common_load: 0 });
    }
  }

  const compatibleResponse =
    input.response?.timezone === input.requestedRange.timezone ? input.response : null;
  if (compatibleResponse) {
    for (const date of eachDate(compatibleResponse.start_date, compatibleResponse.end_date)) {
      if (date < input.requestedRange.start_date || date > input.requestedRange.end_date) continue;
      completedObservationsByDate.set(date, {
        hasUnavailableCompletedActivity: false,
        identity: null,
        state: "known_zero",
      });
      const existing = timelineByDate.get(date);
      if (existing) {
        timelineByDate.set(date, { ...existing, completed_common_load: 0 });
      }
    }

    for (const observation of compatibleResponse.observations) {
      if (
        observation.date < input.requestedRange.start_date ||
        observation.date > input.requestedRange.end_date
      ) {
        continue;
      }
      const existing = timelineByDate.get(observation.date) ?? { date: observation.date };
      const existingMetadata = completedObservationsByDate.get(observation.date);
      const aggregate = observation.aggregate;
      const knownAggregate = aggregate.status === "complete" || aggregate.status === "partial";
      const existingObserved = existingMetadata?.state === "observed";
      const identitiesCompatible =
        !existingObserved ||
        sameCommonLoadIdentity(existingMetadata.identity, {
          model: aggregate.model,
          version: aggregate.version,
        });
      const completedLoad =
        knownAggregate && identitiesCompatible
          ? (existingObserved ? (existing.completed_common_load ?? 0) : 0) + aggregate.load
          : existingObserved
            ? (existing.completed_common_load ?? 0)
            : 0;
      timelineByDate.set(observation.date, {
        ...existing,
        completed_common_load: completedLoad,
      });
      completedObservationsByDate.set(observation.date, {
        hasUnavailableCompletedActivity:
          existingMetadata?.hasUnavailableCompletedActivity === true ||
          !knownAggregate ||
          !identitiesCompatible ||
          aggregate.status !== "complete",
        identity:
          knownAggregate && identitiesCompatible
            ? { model: aggregate.model, version: aggregate.version }
            : existingObserved
              ? existingMetadata.identity
              : null,
        state: knownAggregate || existingObserved ? "observed" : "unavailable",
      });
    }
  }

  return {
    completedObservationsByDate,
    completedActivityDatesWithoutLoad: [...completedObservationsByDate]
      .filter(([, metadata]) => metadata.hasUnavailableCompletedActivity)
      .map(([date]) => date)
      .sort((left, right) => left.localeCompare(right)),
    timeline: normalizeCompletedLoadTimeline([...timelineByDate.values()]),
  };
}

export function buildDailyTrainingAdjustmentPointsFromTimelineWindow(input: {
  completedObservationsByDate?: ReadonlyMap<string, CompletedObservationMetadata>;
  targetLoadDates?: ReadonlySet<string>;
  timelineWindow: TrainingTimelineWindow;
  fitnessHistory?: TrainingPathDailyFitnessInput[] | null;
  idealFitnessCurve?: TrainingPathDailyFitnessInput[] | null;
  scheduledFitnessTrend?: TrainingPathDailyFitnessInput[] | null;
}): DailyTrainingAdjustmentPoint[] {
  const fitnessByDate = new Map((input.fitnessHistory ?? []).map((point) => [point.date, point]));
  const targetFitnessByDate = new Map(
    (input.idealFitnessCurve ?? []).map((point) => [point.date, point]),
  );
  const scheduledFitnessByDate = new Map(
    (input.scheduledFitnessTrend ?? []).map((point) => [point.date, point]),
  );

  return normalizeDailyTrainingAdjustmentPoints({
    startDate: input.timelineWindow.startDate,
    endDate: input.timelineWindow.endDate,
    points: input.timelineWindow.days.map((day) => {
      const fitness = fitnessByDate.get(day.date);
      const targetFitness = targetFitnessByDate.get(day.date);
      const scheduledFitness = scheduledFitnessByDate.get(day.date);
      const completedObservation = input.completedObservationsByDate?.get(day.date);
      return {
        date: day.date,
        completedObservationState: completedObservation?.state,
        completedCommonLoadIdentity: completedObservation?.identity ?? null,
        hasCompletedActivityWithoutLoad:
          completedObservation?.hasUnavailableCompletedActivity === true,
        hasTargetLoad: input.targetLoadDates?.has(day.date) === true,
        plannedLoad: day.load.scheduledLoad,
        completedLoad: day.load.completedLoad,
        remainingScheduledLoadTss: day.load.remainingLoad,
        targetLoad: day.load.recommendedLoad ?? day.load.plannedLoad,
        fitnessCtl: fitness?.longTermLoad ?? null,
        targetFitnessCtl: targetFitness?.longTermLoad ?? null,
        scheduledFitnessCtl: scheduledFitness?.longTermLoad ?? null,
        fatigueAtl: scheduledFitness?.recentLoad ?? fitness?.recentLoad ?? null,
        formTsb: scheduledFitness?.loadBalance ?? fitness?.loadBalance ?? null,
      };
    }),
  });
}
