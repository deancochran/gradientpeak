import type { AppRouter, inferRouterOutputs } from "@repo/api/client";
import { COMMON_RELATIVE_LOAD_MODEL, COMMON_RELATIVE_LOAD_VERSION } from "@repo/core/load";
import type { CompletedObservationState } from "@/lib/training-path/completedCommonLoadObservation";
import { normalizeDailyTrainingAdjustmentPoints } from "@/lib/training-path/dailyTrainingPathModel";
import type {
  TrainingPathCompletedActivity,
  TrainingPathScheduledItem,
  TrainingPathSelectedGoal,
  TrainingPathWeekWindow,
} from "./trainingPathTypes";
import { buildTrainingPathViewModel } from "./trainingPathUtils";

export type PlanTabProjection =
  inferRouterOutputs<AppRouter>["trainingPlans"]["getPlanTabProjection"];

type CompletedLoadStatus = NonNullable<
  PlanTabProjection["timeline"]
>["days"][number]["load"]["completedLoadStatus"];

function completedObservationState(status: CompletedLoadStatus): CompletedObservationState {
  if (status === "known_zero") return "known_zero";
  if (status === "unavailable") return "unavailable";
  return "observed";
}

export function buildPlanTabProjectionPresentation(input: {
  projection: PlanTabProjection | undefined;
  selectedWeekStart: string | null;
  weekWindow: TrainingPathWeekWindow;
  todayKey: string;
}) {
  const { projection } = input;
  const goalMarkers = projection?.goalMarkers ?? [];
  const timelineLoadPoints = (projection?.timeline?.days ?? []).map((day) => ({
    date: day.date,
    completed_common_load: day.load.completedLoad,
    completed_common_load_status: day.load.completedLoadStatus,
    scheduled_common_load: day.load.scheduledLoad,
    scheduled_common_load_status: day.load.scheduledLoadStatus,
    completed_observation_state: completedObservationState(day.load.completedLoadStatus),
    completed_common_load_identity:
      day.load.completedLoad === null
        ? null
        : { model: COMMON_RELATIVE_LOAD_MODEL, version: COMMON_RELATIVE_LOAD_VERSION },
    has_unavailable_completed_activity:
      projection?.dayLoads[day.date]?.hasUnavailableCompletedLoad === true,
  }));
  const trainingPath = buildTrainingPathViewModel({
    timeline: timelineLoadPoints,
    fitnessHistory: projection?.fitness.actual ?? [],
    projectedFitness: projection?.fitness.scheduled ?? [],
    idealFitnessCurve: [],
    goalMarkers,
    selectedWeekStart: input.selectedWeekStart,
    range: "season",
    weekWindow: input.weekWindow,
    todayKey: input.todayKey,
  });
  const timeline = projection?.timeline;
  const actualByDate = new Map(projection?.fitness.actual.map((point) => [point.date, point]));
  const scheduledByDate = new Map(
    projection?.fitness.scheduled.map((point) => [point.date, point]),
  );
  const dailyTrainingPathPoints = !timeline
    ? []
    : normalizeDailyTrainingAdjustmentPoints({
        startDate: timeline.startDate,
        endDate: timeline.endDate,
        points: timeline.days.map((day) => {
          const load = projection.dayLoads[day.date];
          const actual = actualByDate.get(day.date);
          const scheduled = scheduledByDate.get(day.date);
          return {
            date: day.date,
            plannedLoad: day.load.scheduledLoad,
            plannedLoadStatus: day.load.scheduledLoadStatus,
            completedLoad: day.load.completedLoad,
            effectiveCompletedLoadStatus: day.load.completedLoadStatus,
            remainingScheduledLoad: day.load.remainingLoad,
            completedObservationState: completedObservationState(day.load.completedLoadStatus),
            completedCommonLoadIdentity:
              day.load.completedLoad === null
                ? null
                : { model: COMMON_RELATIVE_LOAD_MODEL, version: COMMON_RELATIVE_LOAD_VERSION },
            hasCompletedActivityWithoutLoad:
              day.load.completedLoadStatus === "unavailable" ||
              load?.hasUnavailableCompletedLoad === true,
            hasTargetLoad: false,
            fitnessCtl: actual?.longTermLoad ?? null,
            scheduledFitnessCtl: scheduled?.longTermLoad ?? null,
            actualFatigueAtl: actual?.recentLoad ?? null,
            scheduledFatigueAtl: scheduled?.recentLoad ?? null,
            formTsb: scheduled?.loadBalance ?? actual?.loadBalance ?? null,
          };
        }),
      }).map((point) => {
        const load = projection.dayLoads[point.date];
        return {
          ...point,
          effectiveLoadStatus: load?.status ?? "unavailable",
          effectiveLoad: load?.commonLoad ?? null,
          effectiveCompletedLoadStatus: point.effectiveCompletedLoadStatus ?? "unavailable",
          effectiveCompletedLoad: point.completedLoad,
          effectiveRemainingLoadStatus: load?.remainingLoadStatus ?? "unavailable",
          effectiveRemainingLoad: load?.remainingLoad ?? null,
          plannedLoadStatus: load?.scheduledLoadStatus ?? "unavailable",
        };
      });
  const selectedWeekRangeStart = trainingPath.selectedWeekSummary?.weekStart ?? null;
  const selectedWeekRangeEnd = trainingPath.selectedWeekSummary?.weekEnd ?? null;
  const selectedDays =
    selectedWeekRangeStart && selectedWeekRangeEnd
      ? (timeline?.days ?? []).filter(
          (day) => day.date >= selectedWeekRangeStart && day.date <= selectedWeekRangeEnd,
        )
      : [];
  const selectedWeekGoals: TrainingPathSelectedGoal[] =
    selectedWeekRangeStart && selectedWeekRangeEnd
      ? goalMarkers
          .filter(
            (goal) =>
              goal.targetDate >= selectedWeekRangeStart && goal.targetDate <= selectedWeekRangeEnd,
          )
          .map((goal) => ({ ...goal, status: "Goal due" }))
      : [];
  const selectedWeekEvents: TrainingPathScheduledItem[] = selectedDays.flatMap((day) =>
    day.scheduledItems
      .filter((item) => item.source !== "group_event")
      .map((item) => ({
        id: item.id,
        title: item.title,
        date: item.date,
        estimatedLoad: item.plannedLoad ?? null,
      })),
  );
  const selectedWeekGroupEvents: TrainingPathScheduledItem[] = selectedDays.flatMap((day) =>
    day.scheduledItems
      .filter((item) => item.source === "group_event")
      .map((item) => ({
        id: item.id,
        title: item.title,
        date: item.date,
        estimatedLoad: item.plannedLoad ?? null,
      })),
  );
  const selectedWeekCompletedActivities: TrainingPathCompletedActivity[] = selectedDays.flatMap(
    (day) =>
      day.completedItems.map((item) => ({
        id: item.id,
        title: item.title,
        date: item.date,
        load: item.completedLoad ?? null,
        loadStatus: item.completedLoadStatus,
      })),
  );
  const hasUsableData = Boolean(
    projection?.currentScheduledPlan ||
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
    selectedWeekGoals,
    selectedWeekEvents,
    selectedWeekGroupEvents,
    selectedWeekCompletedActivities,
    hasUsableData,
  };
}
