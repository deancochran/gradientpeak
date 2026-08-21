import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { addDaysToDateKey } from "@/lib/calendar/dateMath";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { buildPlanTabProjectionPresentation } from "./planTabProjectionPresentation";
import {
  getTrainingPathTodayKey,
  millisecondsUntilNextTrainingPathDay,
} from "./trainingPathPlanningTime";
import { getWeekStartDateKey } from "./trainingPathUtils";

const DORMANT_DATE_KEY = "1970-01-01";
const PLAN_TAB_PAST_DAYS = 42;
const PLAN_TAB_FUTURE_DAYS = 41;

function resolveProjectionSelectedDate(input: {
  selectedDate: string | null;
  timeline: { startDate: string; endDate: string } | null | undefined;
  todayKey: string;
}) {
  const timeline = input.timeline;
  if (!timeline) return input.selectedDate ?? input.todayKey;
  const inRange = (date: string) => date >= timeline.startDate && date <= timeline.endDate;
  if (input.selectedDate && inRange(input.selectedDate)) return input.selectedDate;
  if (input.todayKey && inRange(input.todayKey)) return input.todayKey;
  return timeline.startDate;
}

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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pendingSelectedWeekStart, setPendingSelectedWeekStart] = useState<string | null>(null);
  // A legacy or partially completed profile can lack a timezone. Do not turn
  // that profile gap into a Plan-tab outage: UTC is a safe request anchor, and
  // the server projection remains authoritative for the returned planning zone.
  const planningTimezone = profile?.planning_timezone ?? "UTC";
  const planningTodayKey = useTrainingPathTodayKey(planningTimezone);
  const planningTimezoneState = profileLoading ? "loading" : "ready";
  const todayKey = planningTodayKey ?? "";
  const queryEnabled = useAuthStore(
    (state) => state.ready && !!state.session && hasSessionAuthCredentials() && !!planningTodayKey,
  );
  // Selection is presentation state. One 84-day server projection is the
  // complete authoritative source for every chart mode; chart gestures only
  // move through or locally slice this result.
  const dataAnchor = planningTodayKey ?? DORMANT_DATE_KEY;
  const dataAnchorWeekStart = getWeekStartDateKey(dataAnchor);
  const queryStartDate = queryEnabled
    ? addDaysToDateKey(dataAnchorWeekStart, -PLAN_TAB_PAST_DAYS)
    : DORMANT_DATE_KEY;
  const queryEndDate = queryEnabled
    ? addDaysToDateKey(dataAnchorWeekStart, PLAN_TAB_FUTURE_DAYS)
    : DORMANT_DATE_KEY;
  const projectionQuery = api.trainingPlans.getPlanTabProjection.useQuery(
    { startDate: queryStartDate, endDate: queryEndDate },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: queryEnabled,
      // This projection performs bounded server composition. Avoid multiplying
      // deterministic server timeouts through the global retry policy.
      retry: false,
    },
  );
  const projection = planningTodayKey ? projectionQuery.data : undefined;
  const resolvedSelectedDate = resolveProjectionSelectedDate({
    selectedDate,
    timeline: projection?.timeline,
    todayKey,
  });
  const resolvedSelectedWeekStart = resolvedSelectedDate
    ? getWeekStartDateKey(resolvedSelectedDate)
    : null;
  const authoritativeWeekWindow = useMemo(
    () =>
      projection?.timeline
        ? { start: projection.timeline.startDate, end: projection.timeline.endDate }
        : { start: dataAnchorWeekStart, end: dataAnchorWeekStart },
    [dataAnchorWeekStart, projection?.timeline],
  );
  const presentation = useMemo(
    () =>
      buildPlanTabProjectionPresentation({
        projection,
        selectedWeekStart: resolvedSelectedWeekStart,
        weekWindow: authoritativeWeekWindow,
        todayKey,
      }),
    [authoritativeWeekWindow, projection, resolvedSelectedWeekStart, todayKey],
  );
  const {
    trainingPath,
    dailyTrainingPathPoints,
    selectedWeekGoals,
    selectedWeekEvents,
    selectedWeekGroupEvents,
    selectedWeekCompletedActivities,
    hasUsableData,
  } = presentation;
  const selectedWeekLoading =
    projectionQuery.isFetching ||
    (!!pendingSelectedWeekStart &&
      pendingSelectedWeekStart !== trainingPath.selectedWeekSummary?.weekStart);
  const chartLoading =
    profileLoading ||
    (planningTimezoneState === "ready" && (!queryEnabled || projectionQuery.isLoading));
  const chartUnavailable =
    planningTimezoneState === "ready" && !projectionQuery.isLoading && !projection?.timeline;
  const queryFailureCount = projectionQuery.isError ? 1 : 0;

  const handleSelectedWeekChange = useCallback((weekStart: string) => {
    setPendingSelectedWeekStart(weekStart);
    startTransition(() => {
      setSelectedDate(weekStart);
    });
  }, []);
  const handleSelectedDateChange = useCallback((date: string) => {
    setSelectedDate(date);
    const weekStart = getWeekStartDateKey(date);
    setPendingSelectedWeekStart(weekStart);
  }, []);
  const handleWeekScrollStart = useCallback(() => setPendingSelectedWeekStart(null), []);

  useEffect(() => {
    if (!projection?.timeline || selectedDate === null || selectedDate === resolvedSelectedDate) {
      return;
    }
    setSelectedDate(resolvedSelectedDate);
    setPendingSelectedWeekStart(null);
  }, [projection?.timeline, resolvedSelectedDate, selectedDate]);

  useEffect(() => {
    if (!pendingSelectedWeekStart) return;
    if (trainingPath.selectedWeekSummary?.weekStart !== pendingSelectedWeekStart) return;
    setPendingSelectedWeekStart(null);
  }, [pendingSelectedWeekStart, trainingPath.selectedWeekSummary?.weekStart]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryEnabled ? projectionQuery.refetch() : Promise.resolve(null),
        refreshProfile(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [projectionQuery.refetch, queryEnabled, refreshProfile]);

  return {
    refreshing,
    handleRefresh,
    trainingPath,
    dailyTrainingPathPoints: planningTimezoneState === "ready" ? dailyTrainingPathPoints : [],
    chartLoading,
    chartUnavailable,
    planningTimezoneState,
    selectedDate: resolvedSelectedDate,
    selectedWeekGoals,
    selectedWeekEvents,
    selectedWeekGroupEvents,
    selectedWeekCompletedActivities,
    selectedWeekLoading,
    handleSelectedWeekChange,
    handleSelectedDateChange,
    handleWeekScrollStart,
    hasUsableData,
    queryFailureCount,
  };
}
