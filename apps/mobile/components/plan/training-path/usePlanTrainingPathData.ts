import {
  buildCenteredPlanAnalysisWindow,
  type PlanAnalysisWindowPeriod,
  shiftPlanAnalysisWindow,
} from "@repo/core";
import { ianaTimezoneSchema } from "@repo/core/athlete-intelligence";
import { keepPreviousData } from "@tanstack/react-query";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { getDetectedDeviceTimeZone } from "@/lib/calendar/eventSchedule";
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
  const { profile, profileLoading, profileError, refreshProfile, user } = useAuth();
  const utils = api.useUtils();
  const initializeTimezoneMutation = api.profiles.initializePlanningTimezone.useMutation();
  const [refreshing, setRefreshing] = useState(false);
  const [timezoneSetupError, setTimezoneSetupError] = useState<string | null>(null);
  const [detectedPlanningTimezone] = useState(() => {
    const detected = ianaTimezoneSchema.safeParse(getDetectedDeviceTimeZone());
    return detected.success ? detected.data : "UTC";
  });
  const activeAccount = useRef({ id: user?.id, active: true });
  if (activeAccount.current.id !== user?.id) activeAccount.current = { id: user?.id, active: true };
  const account = activeAccount.current;
  const [initializedProfile, setInitializedProfile] = useState<{
    account: typeof account;
    timezone: string;
  } | null>(null);
  const timezoneAttempt = useRef<typeof account | null>(null);
  const automaticallyAttemptedAccount = useRef<typeof account | null>(null);
  const [pendingAccount, setPendingAccount] = useState<typeof account | null>(null);
  useEffect(() => {
    account.active = true;
    setTimezoneSetupError(null);
    return () => {
      account.active = false;
    };
  }, [account]);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate);
  const [analysisPeriod, setAnalysisPeriod] = useState<PlanAnalysisWindowPeriod>(
    typeof input === "object" && input ? input.period : "6w",
  );
  const [requestedAnalysisAnchor, setRequestedAnalysisAnchor] = useState<string | null>(
    typeof input === "object" && input ? input.anchorDate : null,
  );
  const pendingBoundarySelectionRef = useRef<{
    date: string;
    endDate: string;
    startDate: string;
  } | null>(null);
  const ownedProfile = profile?.id === user?.id ? profile : null;
  const persistedCandidate = ianaTimezoneSchema.safeParse(
    ownedProfile?.planning_timezone ??
      (initializedProfile?.account === account ? initializedProfile.timezone : null),
  );
  const persistedTimezone = persistedCandidate.success ? persistedCandidate.data : null;
  useEffect(() => {
    if (ownedProfile?.planning_timezone) {
      // The profile has acknowledged a saved value. A later explicit clear is a
      // new gap to initialize, not permission to reuse an old acknowledgement.
      automaticallyAttemptedAccount.current = null;
      setInitializedProfile((current) => (current?.account === account ? null : current));
    }
  }, [account, ownedProfile?.planning_timezone]);
  const planningTimezone = persistedTimezone ?? detectedPlanningTimezone;
  const requestTimezone = planningTimezone;
  const requestTodayKey = useTrainingPathTodayKey(requestTimezone);
  const planningTimezoneState =
    profileLoading || !ownedProfile ? "loading" : persistedTimezone ? "ready" : "initializing";
  // The dashboard can render before profile hydration decides whether a planning
  // timezone exists. Keep its temporary selection parseable until that decision.
  const clientTodayKey = planningTimezone
    ? (requestTodayKey ?? DORMANT_DATE_KEY)
    : DORMANT_DATE_KEY;
  const authReady = useAuthStore(
    (state) => state.ready && !!state.session && hasSessionAuthCredentials(),
  );
  const queryEnabled = authReady && !!requestTodayKey && !!persistedTimezone && !profileLoading;
  // The server projection is always bounded to the same centered window that
  // drives chart presentation. Switching a view never silently changes anchor.
  const dataAnchor = requestTodayKey ?? DORMANT_DATE_KEY;
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
  const projection = queryEnabled ? projectionQuery.data : undefined;
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
    planningTimezoneState !== "ready" || !queryEnabled || projectionQuery.isLoading;
  const chartUnavailable =
    planningTimezoneState === "ready" && !projectionQuery.isLoading && !projection?.timeline;
  const queryFailureCount = projectionQuery.isError ? 1 : 0;
  const timezoneInitializing = pendingAccount === account;

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

  const retryTimezoneInitialization = useCallback(async () => {
    const id = ownedProfile?.id;
    if (
      profileLoading ||
      persistedTimezone ||
      !authReady ||
      !account.active ||
      activeAccount.current !== account ||
      timezoneAttempt.current === account
    )
      return;
    timezoneAttempt.current = account;
    automaticallyAttemptedAccount.current = account;
    setPendingAccount(account);
    setTimezoneSetupError(null);
    try {
      if (!id) {
        // A failed profile read is retryable; never initialize against stale account data.
        await refreshProfile();
        if (account.active && activeAccount.current === account) {
          automaticallyAttemptedAccount.current = null;
        }
        return;
      }
      const saved = await initializeTimezoneMutation.mutateAsync({
        timezone: detectedPlanningTimezone,
      });
      if (!account.active || activeAccount.current !== account) return;
      const savedTimezone = ianaTimezoneSchema.parse(saved.planning_timezone);
      setInitializedProfile({ account, timezone: savedTimezone });
      utils.profiles.get.setData(undefined, saved);
      // The write is acknowledged. A failed cache refresh must not repeat it.
      await Promise.allSettled([
        refreshProfile(),
        utils.profiles.invalidate(),
        utils.trainingPlans.getPlanTabProjection.invalidate(),
        utils.trainingPlans.getPlanPeriodReview.invalidate(),
        utils.athleteIntelligence.getReadModel.invalidate(),
      ]);
    } catch {
      if (account.active && activeAccount.current === account) {
        setTimezoneSetupError(
          "Plan setup could not be completed. Check your connection and retry.",
        );
      }
    } finally {
      if (timezoneAttempt.current === account) timezoneAttempt.current = null;
      setPendingAccount((current) => (current === account ? null : current));
    }
  }, [
    ownedProfile?.id,
    authReady,
    detectedPlanningTimezone,
    profileLoading,
    persistedTimezone,
    account,
    refreshProfile,
    initializeTimezoneMutation,
    utils.athleteIntelligence.getReadModel,
    utils.profiles,
    utils.trainingPlans.getPlanPeriodReview,
    utils.trainingPlans.getPlanTabProjection,
  ]);

  useEffect(() => {
    if (
      authReady &&
      ownedProfile &&
      !profileLoading &&
      !persistedTimezone &&
      automaticallyAttemptedAccount.current !== account
    ) {
      void retryTimezoneInitialization();
    }
  }, [
    account,
    authReady,
    ownedProfile,
    profileLoading,
    persistedTimezone,
    retryTimezoneInitialization,
  ]);

  return {
    refreshing,
    accountId: user?.id,
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
    timezoneInitializing,
    timezoneSetupError:
      profileError && !ownedProfile
        ? "Your profile could not be loaded. Check your connection and retry."
        : timezoneSetupError,
    retryTimezoneInitialization,
  };
}
