import { COMMON_RELATIVE_LOAD_MODEL, COMMON_RELATIVE_LOAD_VERSION } from "@repo/core/load";
import { keepPreviousData } from "@tanstack/react-query";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { addDaysToDateKey, isCanonicalDateKey } from "@/lib/calendar/dateMath";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { normalizeDailyTrainingAdjustmentPoints } from "@/lib/training-path/dailyTrainingPathModel";
import {
  getTrainingPathTodayKey,
  millisecondsUntilNextTrainingPathDay,
} from "./trainingPathPlanningTime";
import type {
  TrainingPathCompletedActivity,
  TrainingPathScheduledItem,
  TrainingPathSelectedGoal,
} from "./trainingPathTypes";
import { buildTrainingPathViewModel, getWeekStartDateKey } from "./trainingPathUtils";
import { useScrollableTrainingPathWindow } from "./useScrollableTrainingPathWindow";

const DORMANT_DATE_KEY = "1970-01-01";
const PLAN_TAB_DAY_RADIUS = 44;

function useTrainingPathTodayKey(planningTimezone: string | null) {
  const [todayState, setTodayState] = useState(() => {
    const now = new Date();
    return {
      planningTimezone,
      todayKey: planningTimezone ? getTrainingPathTodayKey(now, planningTimezone) : null,
    };
  });
  const todayStateRef = useRef(todayState);
  todayStateRef.current = todayState;
  const currentState =
    todayState.planningTimezone === planningTimezone
      ? todayState
      : {
          planningTimezone,
          todayKey: planningTimezone ? getTrainingPathTodayKey(new Date(), planningTimezone) : null,
        };

  useEffect(() => {
    if (!planningTimezone) {
      const nextState = { planningTimezone, todayKey: null };
      todayStateRef.current = nextState;
      setTodayState(nextState);
      return;
    }
    const refreshToday = () => {
      const nextTodayKey = getTrainingPathTodayKey(new Date(), planningTimezone);
      const current = todayStateRef.current;
      if (current.planningTimezone !== planningTimezone || current.todayKey !== nextTodayKey) {
        const nextState = { planningTimezone, todayKey: nextTodayKey };
        todayStateRef.current = nextState;
        setTodayState(nextState);
      }
    };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      const delay = millisecondsUntilNextTrainingPathDay(new Date(), planningTimezone);
      if (delay == null) return;
      timeout = setTimeout(() => {
        refreshToday();
        scheduleRefresh();
      }, delay);
    };
    refreshToday();
    scheduleRefresh();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [planningTimezone]);

  return currentState.todayKey;
}

export function usePlanTrainingPathData() {
  const { profile, profileLoading, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pendingSelectedWeekStart, setPendingSelectedWeekStart] = useState<string | null>(null);
  const planningTimezone = profile?.planning_timezone ?? null;
  const planningTodayKey = useTrainingPathTodayKey(planningTimezone);
  const planningTimezoneState = profileLoading
    ? "loading"
    : planningTodayKey
      ? "ready"
      : "unavailable";
  const todayKey = planningTodayKey ?? "";
  const queryEnabled = useAuthStore(
    (state) => state.ready && !!state.session && hasSessionAuthCredentials() && !!planningTodayKey,
  );
  const dataAnchor =
    selectedDate && isCanonicalDateKey(selectedDate)
      ? selectedDate
      : selectedWeekStart && isCanonicalDateKey(selectedWeekStart)
        ? selectedWeekStart
        : (planningTodayKey ?? DORMANT_DATE_KEY);
  const queryStartDate = queryEnabled
    ? addDaysToDateKey(dataAnchor, -PLAN_TAB_DAY_RADIUS)
    : DORMANT_DATE_KEY;
  const queryEndDate = queryEnabled
    ? addDaysToDateKey(dataAnchor, PLAN_TAB_DAY_RADIUS)
    : DORMANT_DATE_KEY;
  const projectionQuery = api.trainingPlans.getPlanTabProjection.useQuery(
    { startDate: queryStartDate, endDate: queryEndDate },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: queryEnabled,
      placeholderData: keepPreviousData,
    },
  );
  const projection = planningTodayKey ? projectionQuery.data : undefined;
  const goalMarkers = projection?.goalMarkers ?? [];
  const trainingPathWindow = useScrollableTrainingPathWindow({ goalMarkers, todayKey });
  const timelineLoadPoints = useMemo(
    () =>
      (projection?.timeline?.days ?? []).map((day) => ({
        date: day.date,
        completed_common_load: day.load.completedLoad,
        scheduled_common_load: day.load.scheduledLoad,
        completed_observation_state:
          day.completedItems.length > 0
            ? ("observed" as const)
            : day.load.completedLoad === 0
              ? ("known_zero" as const)
              : ("unavailable" as const),
        completed_common_load_identity:
          day.load.completedLoad === null
            ? null
            : {
                model: COMMON_RELATIVE_LOAD_MODEL,
                version: COMMON_RELATIVE_LOAD_VERSION,
              },
        has_unavailable_completed_activity:
          projection?.dayLoads[day.date]?.hasUnavailableCompletedLoad === true,
      })),
    [projection?.dayLoads, projection?.timeline?.days],
  );
  const trainingPath = useMemo(
    () =>
      buildTrainingPathViewModel({
        timeline: timelineLoadPoints,
        fitnessHistory: projection?.fitness.actual ?? [],
        projectedFitness: projection?.fitness.scheduled ?? [],
        idealFitnessCurve: [],
        goalMarkers,
        selectedWeekStart,
        range: "season",
        weekWindow: trainingPathWindow.resolvedWeekWindow,
        todayKey,
      }),
    [
      goalMarkers,
      projection?.fitness.actual,
      projection?.fitness.scheduled,
      selectedWeekStart,
      timelineLoadPoints,
      todayKey,
      trainingPathWindow.resolvedWeekWindow,
    ],
  );
  const dailyTrainingPathPoints = useMemo(() => {
    const actualByDate = new Map(projection?.fitness.actual.map((point) => [point.date, point]));
    const scheduledByDate = new Map(
      projection?.fitness.scheduled.map((point) => [point.date, point]),
    );
    const timeline = projection?.timeline;
    if (!timeline) return [];
    const normalized = normalizeDailyTrainingAdjustmentPoints({
      startDate: timeline.startDate,
      endDate: timeline.endDate,
      points: timeline.days.map((day) => {
        const load = projection.dayLoads[day.date];
        const actual = actualByDate.get(day.date);
        const scheduled = scheduledByDate.get(day.date);
        return {
          date: day.date,
          plannedLoad: day.load.scheduledLoad,
          completedLoad: day.load.completedLoad,
          remainingScheduledLoad: day.load.remainingLoad,
          completedObservationState:
            day.completedItems.length > 0
              ? ("observed" as const)
              : day.load.completedLoad === 0
                ? ("known_zero" as const)
                : ("unavailable" as const),
          completedCommonLoadIdentity:
            day.load.completedLoad === null
              ? null
              : {
                  model: COMMON_RELATIVE_LOAD_MODEL,
                  version: COMMON_RELATIVE_LOAD_VERSION,
                },
          hasCompletedActivityWithoutLoad: load?.hasUnavailableCompletedLoad === true,
          hasTargetLoad: false,
          fitnessCtl: actual?.longTermLoad ?? null,
          scheduledFitnessCtl: scheduled?.longTermLoad ?? null,
          actualFatigueAtl: actual?.recentLoad ?? null,
          scheduledFatigueAtl: scheduled?.recentLoad ?? null,
          formTsb: scheduled?.loadBalance ?? actual?.loadBalance ?? null,
        };
      }),
    });
    return normalized.map((point) => {
      const load = projection.dayLoads[point.date];
      return {
        ...point,
        effectiveLoadStatus: load?.status ?? "unavailable",
        effectiveLoad: load?.commonLoad ?? null,
        effectiveCompletedLoad: load?.completedLoad ?? null,
        effectiveRemainingLoad: load?.remainingLoad ?? null,
      };
    });
  }, [projection]);
  const selectedWeekRangeStart = trainingPath.selectedWeekSummary?.weekStart ?? null;
  const selectedWeekRangeEnd = trainingPath.selectedWeekSummary?.weekEnd ?? null;
  const selectedDays = useMemo(
    () =>
      selectedWeekRangeStart && selectedWeekRangeEnd
        ? (projection?.timeline?.days ?? []).filter(
            (day) => day.date >= selectedWeekRangeStart && day.date <= selectedWeekRangeEnd,
          )
        : [],
    [projection?.timeline?.days, selectedWeekRangeEnd, selectedWeekRangeStart],
  );
  const selectedWeekGoals = useMemo<TrainingPathSelectedGoal[]>(
    () =>
      selectedWeekRangeStart && selectedWeekRangeEnd
        ? goalMarkers
            .filter(
              (goal) =>
                goal.targetDate >= selectedWeekRangeStart &&
                goal.targetDate <= selectedWeekRangeEnd,
            )
            .map((goal) => ({
              id: goal.id,
              label: goal.label,
              targetDate: goal.targetDate,
              activityCategory: goal.activityCategory,
              status: "Goal due",
            }))
        : [],
    [goalMarkers, selectedWeekRangeEnd, selectedWeekRangeStart],
  );
  const selectedWeekEvents = useMemo<TrainingPathScheduledItem[]>(
    () =>
      selectedDays.flatMap((day) =>
        day.scheduledItems
          .filter((item) => item.source !== "group_event")
          .map((item) => ({
            id: item.id,
            title: item.title,
            date: item.date,
            estimatedLoad: item.plannedLoad ?? null,
          })),
      ),
    [selectedDays],
  );
  const selectedWeekGroupEvents = useMemo<TrainingPathScheduledItem[]>(
    () =>
      selectedDays.flatMap((day) =>
        day.scheduledItems
          .filter((item) => item.source === "group_event")
          .map((item) => ({
            id: item.id,
            title: item.title,
            date: item.date,
            estimatedLoad: item.plannedLoad ?? null,
          })),
      ),
    [selectedDays],
  );
  const selectedWeekCompletedActivities = useMemo<TrainingPathCompletedActivity[]>(
    () =>
      selectedDays.flatMap((day) =>
        day.completedItems.map((item) => ({
          id: item.id,
          title: item.title,
          date: item.date,
          load: item.completedLoad ?? null,
        })),
      ),
    [selectedDays],
  );
  const selectedWeekLoading =
    projectionQuery.isFetching ||
    (!!pendingSelectedWeekStart &&
      pendingSelectedWeekStart !== trainingPath.selectedWeekSummary?.weekStart);
  const chartLoading =
    profileLoading ||
    (planningTimezoneState === "ready" && (!queryEnabled || projectionQuery.isLoading));
  const chartUnavailable =
    planningTimezoneState === "unavailable" ||
    (planningTimezoneState === "ready" && !projectionQuery.isLoading && !projection?.timeline);
  const queryFailureCount =
    (projectionQuery.isError ? 1 : 0) + (planningTimezoneState === "unavailable" ? 1 : 0);
  const hasUsableData = Boolean(
    projection?.currentScheduledPlan ||
      goalMarkers.length ||
      projection?.fitness.actual.length ||
      projection?.timeline?.days.some(
        (day) =>
          day.scheduledItems.length > 0 ||
          day.completedItems.length > 0 ||
          day.load.completedLoad !== null,
      ),
  );

  const resetTrainingPathChart = useCallback(() => {
    trainingPathWindow.resetWindow();
    startTransition(() => {
      setSelectedDate(null);
      setSelectedWeekStart(null);
      setPendingSelectedWeekStart(null);
    });
  }, [trainingPathWindow.resetWindow]);
  const handleSelectedWeekChange = useCallback((weekStart: string) => {
    setPendingSelectedWeekStart(weekStart);
    startTransition(() => {
      setSelectedWeekStart(weekStart);
    });
  }, []);
  const handleSelectedDateChange = useCallback((date: string) => {
    setSelectedDate(date);
    const weekStart = getWeekStartDateKey(date);
    setPendingSelectedWeekStart(weekStart);
    startTransition(() => {
      setSelectedWeekStart(weekStart);
    });
  }, []);
  const handleWeekScrollStart = useCallback(() => setPendingSelectedWeekStart(null), []);

  useEffect(() => {
    if (!pendingSelectedWeekStart) return;
    if (trainingPath.selectedWeekSummary?.weekStart !== pendingSelectedWeekStart) return;
    setPendingSelectedWeekStart(null);
  }, [pendingSelectedWeekStart, trainingPath.selectedWeekSummary?.weekStart]);

  const handleRefresh = useCallback(async () => {
    resetTrainingPathChart();
    setRefreshing(true);
    try {
      await Promise.all([
        queryEnabled ? projectionQuery.refetch() : Promise.resolve(null),
        refreshProfile(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [projectionQuery.refetch, queryEnabled, refreshProfile, resetTrainingPathChart]);

  return {
    refreshing,
    handleRefresh,
    trainingPath,
    dailyTrainingPathPoints: planningTimezoneState === "ready" ? dailyTrainingPathPoints : [],
    chartLoading,
    chartUnavailable,
    planningTimezoneState,
    selectedDate: selectedDate ?? todayKey,
    selectedWeekGoals,
    selectedWeekEvents,
    selectedWeekGroupEvents,
    selectedWeekCompletedActivities,
    selectedWeekLoading,
    extendTrainingPathWindowEnd: trainingPathWindow.extendWindowEnd,
    extendTrainingPathWindowStart: trainingPathWindow.extendWindowStart,
    handleSelectedWeekChange,
    handleSelectedDateChange,
    handleWeekScrollStart,
    hasUsableData,
    queryFailureCount,
  };
}
