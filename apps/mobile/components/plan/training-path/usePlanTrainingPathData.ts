import {
  buildCenteredPlanAnalysisWindow,
  type PlanAnalysisWindowPeriod,
  shiftPlanAnalysisWindow,
} from "@repo/core";
import { keepPreviousData } from "@tanstack/react-query";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { buildPlanTabProjectionPresentation } from "./planTabProjectionPresentation";
import {
  getTrainingPathTodayKey,
  millisecondsUntilNextTrainingPathDay,
} from "./trainingPathPlanningTime";
import { getWeekStartDateKey } from "./trainingPathUtils";

const DORMANT_DATE_KEY = "1970-01-01";

function resolveProjectionSelectedDate(input: {
  pendingBoundarySelection?: {
    date: string;
    endDate: string;
    startDate: string;
  } | null;
  selectedDate: string | null;
  timeline: { startDate: string; endDate: string } | null | undefined;
  todayKey: string;
}) {
  const timeline = input.timeline;
  if (!timeline) return input.selectedDate ?? input.todayKey;
  const inRange = (date: string) => date >= timeline.startDate && date <= timeline.endDate;
  if (
    input.pendingBoundarySelection &&
    timeline.startDate === input.pendingBoundarySelection.startDate &&
    timeline.endDate === input.pendingBoundarySelection.endDate
  ) {
    return input.pendingBoundarySelection.date;
  }
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

export function usePlanTrainingPathData(
  input: string | { anchorDate: string; period: PlanAnalysisWindowPeriod } | null = null,
) {
  const initialSelectedDate = typeof input === "string" ? input : (input?.anchorDate ?? null);
  const { profile, profileLoading, refreshProfile } = useAuth();
  const utils = api.useUtils();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate);
  const [analysisPeriod, setAnalysisPeriod] = useState<PlanAnalysisWindowPeriod>(
    typeof input === "object" && input ? input.period : "6w",
  );
  const [requestedAnalysisAnchor, setRequestedAnalysisAnchor] = useState<string | null>(
    typeof input === "object" && input ? input.anchorDate : null,
  );
  const [serverPlanningTimezone, setServerPlanningTimezone] = useState<string | null>(null);
  const pendingBoundarySelectionRef = useRef<{
    date: string;
    endDate: string;
    startDate: string;
  } | null>(null);
  // A legacy or partially completed profile can lack a timezone. Do not turn
  // that profile gap into a Plan-tab outage: UTC is a safe request anchor, and
  // the server projection remains authoritative for the returned planning zone.
  const planningTimezone = serverPlanningTimezone ?? profile?.planning_timezone ?? "UTC";
  const planningTodayKey = useTrainingPathTodayKey(planningTimezone);
  const planningTimezoneState = profileLoading ? "loading" : "ready";
  const clientTodayKey = planningTodayKey ?? "";
  const queryEnabled = useAuthStore(
    (state) => state.ready && !!state.session && hasSessionAuthCredentials() && !!planningTodayKey,
  );
  // The server projection is always bounded to the same centered window that
  // drives chart presentation. Switching a view never silently changes anchor.
  const dataAnchor = planningTodayKey ?? DORMANT_DATE_KEY;
  const analysisAnchor = requestedAnalysisAnchor ?? dataAnchor;
  const queryWindow = useMemo(
    () =>
      buildCenteredPlanAnalysisWindow({
        anchorDate: queryEnabled ? analysisAnchor : DORMANT_DATE_KEY,
        period: analysisPeriod,
      }),
    [analysisAnchor, analysisPeriod, queryEnabled],
  );
  const dataAnchorWeekStart = getWeekStartDateKey(dataAnchor);
  const queryStartDate = queryEnabled ? queryWindow.startDate : DORMANT_DATE_KEY;
  const queryEndDate = queryEnabled ? queryWindow.endDate : DORMANT_DATE_KEY;
  const projectionQuery = api.trainingPlans.getPlanTabProjection.useQuery(
    { startDate: queryStartDate, endDate: queryEndDate },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: queryEnabled,
      placeholderData: keepPreviousData,
      // This projection performs bounded server composition. Avoid multiplying
      // deterministic server timeouts through the global retry policy.
      retry: false,
    },
  );
  const projection = planningTodayKey ? projectionQuery.data : undefined;
  const todayKey = projection?.today ?? clientTodayKey;
  const resolvedSelectedDate = resolveProjectionSelectedDate({
    pendingBoundarySelection: pendingBoundarySelectionRef.current,
    selectedDate,
    timeline: projection?.timeline,
    todayKey,
  });
  const resolvedSelectedWeekStart = getWeekStartDateKey(resolvedSelectedDate);
  const analysisSelectedDate = resolvedSelectedDate;
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
  const { trainingPath, dailyTrainingPathPoints, goalMarkers, timelineDaysByDate, hasUsableData } =
    presentation;
  const chartLoading =
    profileLoading ||
    (planningTimezoneState === "ready" && (!queryEnabled || projectionQuery.isLoading));
  const chartUnavailable =
    planningTimezoneState === "ready" && !projectionQuery.isLoading && !projection?.timeline;
  const queryFailureCount = projectionQuery.isError ? 1 : 0;

  useEffect(() => {
    const nextTimezone = projection?.planningTimezone;
    if (nextTimezone && nextTimezone !== serverPlanningTimezone) {
      setServerPlanningTimezone(nextTimezone);
    }
  }, [projection?.planningTimezone, serverPlanningTimezone]);

  const handleSelectedWeekChange = useCallback((weekStart: string) => {
    startTransition(() => setSelectedDate(weekStart));
  }, []);
  const handleSelectedDateChange = useCallback((date: string) => {
    pendingBoundarySelectionRef.current = null;
    setSelectedDate(date);
  }, []);
  const handleToday = useCallback(() => {
    pendingBoundarySelectionRef.current = null;
    setSelectedDate(todayKey);
  }, [todayKey]);
  const handleAnalysisRangeChange = useCallback((period: PlanAnalysisWindowPeriod) => {
    pendingBoundarySelectionRef.current = null;
    setAnalysisPeriod(period);
  }, []);
  const handleAnalysisPeriodShift = useCallback(
    (direction: -1 | 1) => {
      const shifted = shiftPlanAnalysisWindow({
        anchorDate: analysisAnchor,
        direction,
        period: analysisPeriod,
      });
      pendingBoundarySelectionRef.current = {
        date: direction < 0 ? shifted.endDate : shifted.startDate,
        endDate: shifted.endDate,
        startDate: shifted.startDate,
      };
      setRequestedAnalysisAnchor(shifted.anchorDate);
    },
    [analysisAnchor, analysisPeriod],
  );
  const handleAnalysisToday = useCallback(() => {
    pendingBoundarySelectionRef.current = null;
    setRequestedAnalysisAnchor(null);
    setSelectedDate(todayKey);
  }, [todayKey]);

  useEffect(() => {
    if (!projection?.timeline || selectedDate === null || selectedDate === resolvedSelectedDate) {
      return;
    }
    const pending = pendingBoundarySelectionRef.current;
    if (pending) {
      if (
        projection.timeline.startDate !== pending.startDate ||
        projection.timeline.endDate !== pending.endDate
      ) {
        return;
      }
      pendingBoundarySelectionRef.current = null;
    }
    setSelectedDate(resolvedSelectedDate);
  }, [projection?.timeline, resolvedSelectedDate, selectedDate]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        queryEnabled ? projectionQuery.refetch() : Promise.resolve(null),
        refreshProfile(),
        utils.calendar.day.invalidate(),
        utils.athleteIntelligence.getGoalAssessment.invalidate(),
        utils.athleteIntelligence.getGoalPortfolio.invalidate(),
        utils.athleteIntelligence.getGoalProgress.invalidate(),
        utils.athleteIntelligence.getThresholdOverview.invalidate(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    projectionQuery.refetch,
    queryEnabled,
    refreshProfile,
    utils.athleteIntelligence.getGoalAssessment,
    utils.athleteIntelligence.getGoalPortfolio,
    utils.athleteIntelligence.getGoalProgress,
    utils.athleteIntelligence.getThresholdOverview,
    utils.calendar.day,
  ]);

  return {
    refreshing,
    handleRefresh,
    trainingPath,
    projectionAsOf: projection?.asOf ?? null,
    projectionRevision: projection?.publishedRevision ?? null,
    timelineEndDate: projection?.timeline?.endDate ?? null,
    timelineStartDate: projection?.timeline?.startDate ?? null,
    fitnessVerifiedThrough: projection?.fitnessHistory?.verifiedThrough ?? null,
    dailyTrainingPathPoints: planningTimezoneState === "ready" ? dailyTrainingPathPoints : [],
    timelineDaysByDate: planningTimezoneState === "ready" ? timelineDaysByDate : {},
    goalMarkers: planningTimezoneState === "ready" ? goalMarkers : [],
    goalMarkersTruncated: projection?.goalMarkersTruncated ?? false,
    chartLoading,
    chartUnavailable,
    planningTimezoneState,
    selectedDate: resolvedSelectedDate,
    selectedWeekStart: resolvedSelectedWeekStart,
    analysisSelectedDate,
    analysisAnchor,
    analysisPeriod,
    analysisWindow: queryWindow,
    analysisWindowLoading: projectionQuery.isFetching,
    handleAnalysisRangeChange,
    handleAnalysisPeriodShift,
    handleAnalysisToday,
    handleSelectedWeekChange,
    handleSelectedDateChange,
    handleToday,
    hasUsableData,
    queryFailureCount,
  };
}
