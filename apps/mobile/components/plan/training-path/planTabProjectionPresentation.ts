import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { COMMON_RELATIVE_LOAD_MODEL, COMMON_RELATIVE_LOAD_VERSION } from "@repo/core/load";
import type { CompletedObservationState } from "@/lib/training-path/completedCommonLoadObservation";
import { normalizeDailyTrainingAdjustmentPoints } from "@/lib/training-path/dailyTrainingPathModel";
import type { TrainingPathWeekWindow } from "./trainingPathTypes";
import { buildTrainingPathViewModel } from "./trainingPathUtils";

export type MobilePlanTabProjection =
  inferRouterOutputs<AppRouter>["trainingPlans"]["getPlanTabProjection"];

function historicalFitnessNotice(projection: MobilePlanTabProjection | undefined): string | null {
  const freshness = projection?.fitnessHistory;
  if (freshness?.status === "unavailable") {
    return "Fitness, fatigue, and form use the available baseline and assume zero on days where no Load can be established. Incomplete Load bars remain marked unavailable.";
  }
  if (!freshness?.verifiedThrough) return null;
  const verifiedThrough = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${freshness.verifiedThrough}T00:00:00.000Z`));
  const maturity =
    freshness.maturity === "establishing_baseline"
      ? " The baseline is still establishing."
      : freshness.maturity === "mature"
        ? " The baseline is mature."
        : "";
  return freshness.status === "historical"
    ? `Fitness, fatigue, and form are based on verified history through ${verifiedThrough}, then assume zero on days where no Load can be established.${maturity}`
    : `Fitness, fatigue, and form are verified through ${verifiedThrough}.${maturity}`;
}

type CompletedLoadStatus = NonNullable<
  MobilePlanTabProjection["timeline"]
>["days"][number]["load"]["completedLoadStatus"];

function completedObservationState(status: CompletedLoadStatus): CompletedObservationState {
  if (status === "known_zero") return "known_zero";
  if (status === "unavailable") return "unavailable";
  return "observed";
}

export function buildPlanTabProjectionPresentation(input: {
  projection: MobilePlanTabProjection | undefined;
  selectedWeekStart: string | null;
  weekWindow: TrainingPathWeekWindow;
  todayKey: string;
}) {
  const { projection } = input;
  const goalMarkers = projection?.goalMarkers ?? [];
  const timelineLoadPoints = (projection?.timeline?.days ?? []).map((day) => {
    const load = projection?.dayLoads[day.date];
    const completedLoad = day.load.completedLoad ?? load?.knownCompletedLoadSubtotal ?? null;
    const completedLoadStatus =
      day.load.completedLoadStatus === "unavailable" && load?.knownCompletedLoadSubtotal != null
        ? ("partial" as const)
        : day.load.completedLoadStatus;
    const scheduledLoad = day.load.scheduledLoad ?? load?.knownScheduledLoadSubtotal ?? null;
    const scheduledLoadStatus =
      day.load.scheduledLoadStatus === "unavailable" && load?.knownScheduledLoadSubtotal != null
        ? ("partial" as const)
        : day.load.scheduledLoadStatus;
    return {
      date: day.date,
      completed_common_load: completedLoad,
      completed_common_load_status: completedLoadStatus,
      scheduled_common_load: scheduledLoad,
      scheduled_common_load_status: scheduledLoadStatus,
      completed_observation_state: completedObservationState(completedLoadStatus),
      completed_common_load_identity:
        completedLoad === null
          ? null
          : { model: COMMON_RELATIVE_LOAD_MODEL, version: COMMON_RELATIVE_LOAD_VERSION },
      has_unavailable_completed_activity: load?.hasUnavailableCompletedLoad === true,
      recommended_common_load:
        load?.recommendedLoadStatus === "complete" || load?.recommendedLoadStatus === "known_zero"
          ? load.recommendedLoad
          : null,
    };
  });
  const trainingPath = {
    ...buildTrainingPathViewModel({
      timeline: timelineLoadPoints,
      fitnessHistory: projection?.fitness.actual ?? [],
      projectedFitness: projection?.fitness.scheduled ?? [],
      idealFitnessCurve: [],
      goalMarkers,
      selectedWeekStart: input.selectedWeekStart,
      range: "season",
      weekWindow: input.weekWindow,
      todayKey: input.todayKey,
    }),
    fitnessHistoryNotice: historicalFitnessNotice(projection),
  };
  const timeline = projection?.timeline;
  const timelineDaysByDate = Object.fromEntries(
    (timeline?.days ?? []).map((day) => [day.date, day] as const),
  );
  const actualByDate = new Map(projection?.fitness.actual.map((point) => [point.date, point]));
  const scheduledByDate = new Map(
    projection?.fitness.scheduled.map((point) => [point.date, point]),
  );
  const recommendedByDate = new Map(
    projection?.fitness.recommended.map((point) => [point.date, point]),
  );
  const dailyTrainingPathPoints = !timeline
    ? []
    : normalizeDailyTrainingAdjustmentPoints({
        startDate: timeline.startDate,
        endDate: timeline.endDate,
        points: timeline.days.map((day) => {
          const load = projection.dayLoads[day.date];
          const incompleteCompletedLoad = load?.knownCompletedLoadSubtotal ?? null;
          const completedLoad = day.load.completedLoad ?? incompleteCompletedLoad;
          const completedLoadStatus =
            day.load.completedLoadStatus === "unavailable" && incompleteCompletedLoad !== null
              ? ("partial" as const)
              : day.load.completedLoadStatus;
          const actual = actualByDate.get(day.date);
          const scheduled = scheduledByDate.get(day.date);
          return {
            date: day.date,
            plannedLoad: day.load.scheduledLoad ?? load?.knownScheduledLoadSubtotal ?? null,
            plannedLoadStatus:
              day.load.scheduledLoadStatus === "unavailable" &&
              load?.knownScheduledLoadSubtotal != null
                ? "partial"
                : day.load.scheduledLoadStatus,
            completedLoad,
            effectiveCompletedLoadStatus: completedLoadStatus,
            remainingScheduledLoad: day.load.remainingLoad,
            completedObservationState: completedObservationState(completedLoadStatus),
            completedCommonLoadIdentity:
              completedLoad === null
                ? null
                : { model: COMMON_RELATIVE_LOAD_MODEL, version: COMMON_RELATIVE_LOAD_VERSION },
            hasCompletedActivityWithoutLoad:
              completedLoadStatus === "unavailable" ||
              (load?.hasUnavailableCompletedLoad === true && incompleteCompletedLoad === null),
            hasTargetLoad: false,
            fitnessCtl: actual?.longTermLoad ?? null,
            scheduledFitnessCtl: scheduled?.longTermLoad ?? null,
            actualFatigueAtl: actual?.recentLoad ?? null,
            scheduledFatigueAtl: scheduled?.recentLoad ?? null,
            formTsb: actual?.loadBalance ?? null,
            scheduledFormTsb: scheduled?.loadBalance ?? null,
          };
        }),
      }).map((point) => {
        const load = projection.dayLoads[point.date];
        const actual = actualByDate.get(point.date);
        const scheduled = scheduledByDate.get(point.date);
        const recommended = recommendedByDate.get(point.date);
        return {
          ...point,
          effectiveLoadStatus: load?.status ?? "unavailable",
          effectiveLoad: load?.commonLoad ?? null,
          effectiveCompletedLoadStatus: point.effectiveCompletedLoadStatus ?? "unavailable",
          effectiveCompletedLoad: point.completedLoad,
          effectiveRemainingLoadStatus: load?.remainingLoadStatus ?? "unavailable",
          effectiveRemainingLoad: load?.remainingLoad ?? null,
          plannedLoadStatus:
            load?.scheduledLoadStatus === "unavailable" && load.knownScheduledLoadSubtotal != null
              ? "partial"
              : (load?.scheduledLoadStatus ?? "unavailable"),
          recommendedLoad: load?.recommendedLoad ?? null,
          recommendedLoadStatus: load?.recommendedLoadStatus ?? "unavailable",
          actualFatigueAtl: actual?.recentLoad ?? null,
          scheduledFatigueAtl: scheduled?.recentLoad ?? null,
          scheduledFormTsb: scheduled?.loadBalance ?? null,
          recommendedFitnessCtl: recommended?.longTermLoad ?? null,
          recommendedFatigueAtl: recommended?.recentLoad ?? null,
          recommendedFormTsb: recommended?.loadBalance ?? null,
        };
      });
  const hasUsableData = Boolean(
    goalMarkers.length ||
      projection?.fitness.actual.length ||
      timeline?.days.some(
        (day) =>
          day.scheduledItems.length > 0 ||
          day.completedItems.length > 0 ||
          day.load.completedLoad !== null,
      ),
  );
  return {
    goalMarkers,
    trainingPath,
    dailyTrainingPathPoints,
    timelineDaysByDate,
    hasUsableData,
  };
}
