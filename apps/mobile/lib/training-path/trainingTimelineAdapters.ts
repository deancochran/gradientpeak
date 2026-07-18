import type { ActivityTssIdentity } from "@repo/core";
import type { TrainingTimelineWindow } from "@repo/core/training-timeline";
import { type CompletedObservationMetadata, sameTssIdentity } from "./completedTssObservation";
import {
  type DailyTrainingAdjustmentPoint,
  normalizeDailyTrainingAdjustmentPoints,
  type TrainingPathDailyFitnessInput,
  type TrainingPathDailyLoadInput,
} from "./dailyTrainingPathModel";

export { sameTssIdentity } from "./completedTssObservation";

export type TrainingTimelineDailyTssObservation = {
  activity_count?: number;
  date: string;
  unavailable_activity_count: number;
} & (
  | {
      state: "calculated";
      tss_identity: ActivityTssIdentity;
      value: number;
    }
  | {
      state: "unavailable";
      tss_identity: null;
      value: null;
    }
);

export type DailyTssObservationsResponse = {
  end_date: string;
  observations: readonly TrainingTimelineDailyTssObservation[];
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

export type CompletedTssObservationMerge = {
  completedObservationsByDate: Map<string, CompletedObservationMetadata>;
  completedActivityDatesWithoutLoad: string[];
  timeline: Array<
    Omit<
      TrainingPathDailyLoadInput,
      | "completed_load_tss"
      | "recommended_load_tss"
      | "scheduled_load_tss"
      | "tentative_scheduled_load_tss"
    > & {
      completed_load_tss: number;
      recommended_load_tss: number;
      scheduled_load_tss: number;
      tentative_scheduled_load_tss?: number;
    }
  >;
};

function normalizeCompletedLoadTimeline(
  points: readonly TrainingPathDailyLoadInput[],
): CompletedTssObservationMerge["timeline"] {
  return points
    .map((point) => ({
      ...point,
      completed_load_tss:
        typeof point.completed_load_tss === "number" && Number.isFinite(point.completed_load_tss)
          ? point.completed_load_tss
          : 0,
      recommended_load_tss:
        typeof point.recommended_load_tss === "number" &&
        Number.isFinite(point.recommended_load_tss)
          ? point.recommended_load_tss
          : 0,
      scheduled_load_tss:
        typeof point.scheduled_load_tss === "number" && Number.isFinite(point.scheduled_load_tss)
          ? point.scheduled_load_tss
          : 0,
      tentative_scheduled_load_tss:
        typeof point.tentative_scheduled_load_tss === "number" &&
        Number.isFinite(point.tentative_scheduled_load_tss)
          ? point.tentative_scheduled_load_tss
          : undefined,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

/** Applies authoritative API local-day observations without collapsing unavailable load to zero. */
export function mergeCompletedTssObservations(input: {
  requestedRange?: { end_date: string; start_date: string; timezone: string } | null;
  response?: DailyTssObservationsResponse | null;
  timeline?: readonly TrainingPathDailyLoadInput[] | null;
}): CompletedTssObservationMerge {
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
      timelineByDate.set(date, { ...existing, actual_tss: null, completed_load_tss: 0 });
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
        timelineByDate.set(date, { ...existing, actual_tss: null, completed_load_tss: 0 });
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
      const calculated = observation.state === "calculated";
      const existingObserved = existingMetadata?.state === "observed";
      const identitiesCompatible =
        !existingObserved || sameTssIdentity(existingMetadata.identity, observation.tss_identity);
      const completedLoad =
        calculated && identitiesCompatible
          ? (existingObserved ? (existing.completed_load_tss ?? 0) : 0) + observation.value
          : existingObserved
            ? (existing.completed_load_tss ?? 0)
            : 0;
      timelineByDate.set(observation.date, {
        ...existing,
        actual_tss: null,
        completed_load_tss: completedLoad,
      });
      completedObservationsByDate.set(observation.date, {
        hasUnavailableCompletedActivity:
          existingMetadata?.hasUnavailableCompletedActivity === true ||
          !calculated ||
          !identitiesCompatible ||
          observation.unavailable_activity_count > 0,
        identity:
          calculated && identitiesCompatible
            ? observation.tss_identity
            : existingObserved
              ? existingMetadata.identity
              : null,
        state: calculated || existingObserved ? "observed" : "unavailable",
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
        completedTssIdentity: completedObservation?.identity ?? null,
        hasCompletedActivityWithoutLoad:
          completedObservation?.hasUnavailableCompletedActivity === true,
        hasTargetLoad: input.targetLoadDates?.has(day.date) === true,
        plannedLoadTss: day.load.scheduledTss,
        tentativePlannedLoadTss: day.load.tentativeScheduledTss,
        completedLoadTss: day.load.completedTss,
        remainingScheduledLoadTss: day.load.remainingTss,
        targetLoadTss: day.load.recommendedTss ?? day.load.plannedTss,
        fitnessCtl: fitness?.ctl ?? null,
        targetFitnessCtl: targetFitness?.ctl ?? null,
        scheduledFitnessCtl: scheduledFitness?.ctl ?? null,
        fatigueAtl: scheduledFitness?.atl ?? fitness?.atl ?? null,
        formTsb: scheduledFitness?.tsb ?? fitness?.tsb ?? null,
      };
    }),
  });
}
