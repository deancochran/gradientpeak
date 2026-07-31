import { buildTrainingTimelineWindowFromLoadTimeline } from "@repo/core/training-timeline";
import { keepPreviousData } from "@tanstack/react-query";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import { addDaysToDateKey, isCanonicalDateKey } from "@/lib/calendar/dateMath";
import {
  attachSelectedGroupEventActivityPlans,
  getSelectedGroupEventActivityPlanIds,
  toGroupEventScheduledActivityPlanEvent,
} from "@/lib/calendar/groupEventPlans";
import { resolveBoundedPlanningDateRange } from "@/lib/calendar/planningQueryRange";
import { useAuth } from "@/lib/hooks/useAuth";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { refreshPlanTabData } from "@/lib/scheduling/refreshScheduleViews";
import { useAuthStore } from "@/lib/stores/auth-store";
import { buildPlanCommonLoadFitnessSeries } from "@/lib/training-path/planCommonLoadFitness";
import { buildServerEffectiveLoadSummaries } from "@/lib/training-path/serverEffectiveLoadSummaries";
import {
  buildDailyTrainingAdjustmentPointsFromTimelineWindow,
  buildEffectiveCompletedObservationsByDate,
  mergeCompletedCommonLoadObservations,
} from "@/lib/training-path/trainingTimelineAdapters";
import {
  buildTrainingPreferencesLoadTimeline,
  buildTrainingPreferencesProjectionPreview,
} from "@/lib/training-plan-form/projectionPreview";
import { usePlanDashboardViewModel } from "../usePlanDashboardViewModel";
import {
  getTrainingPathDateKey,
  getTrainingPathPlanningDayRange,
  getTrainingPathTodayKey,
  millisecondsUntilNextTrainingPathDay,
} from "./trainingPathPlanningTime";
import {
  type ActivityOwner,
  buildTrainingPathEventReviewItems,
  buildTrainingPathGroupEventReviewItems,
  toTrainingPathCompletedActivity,
} from "./trainingPathReviewItems";
import type {
  TrainingPathCompletedActivity,
  TrainingPathScheduledItem,
  TrainingPathSelectedGoal,
} from "./trainingPathTypes";
import { getWeekStartDateKey } from "./trainingPathUtils";
import { useScrollableTrainingPathWindow } from "./useScrollableTrainingPathWindow";
import { useTrainingPathViewModel } from "./useTrainingPathViewModel";

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

const DORMANT_DATE_KEY = "1970-01-01";
const DORMANT_INSTANT = "1970-01-01T00:00:00.000Z";
const DATA_QUERY_DAY_RADIUS = 182;
const MAX_RETAINED_DATA_CHUNKS = 12;

function useTrainingPathTodayKey(planningTimezone: string | null) {
  const [todayState, setTodayState] = useState(() => {
    const now = new Date();
    return {
      planningTimezone,
      todayKey: planningTimezone ? getTrainingPathTodayKey(now, planningTimezone) : null,
      asOfInstant: now.toISOString(),
    };
  });
  const todayStateRef = useRef(todayState);
  todayStateRef.current = todayState;
  const currentState =
    todayState.planningTimezone === planningTimezone
      ? todayState
      : planningTimezone
        ? (() => {
            const now = new Date();
            return {
              planningTimezone,
              todayKey: getTrainingPathTodayKey(now, planningTimezone),
              asOfInstant: now.toISOString(),
            };
          })()
        : { planningTimezone, todayKey: null, asOfInstant: new Date().toISOString() };
  const todayKey = currentState.todayKey;

  useEffect(() => {
    if (!planningTimezone) {
      const nextState = { planningTimezone, todayKey: null, asOfInstant: new Date().toISOString() };
      todayStateRef.current = nextState;
      setTodayState(nextState);
      return;
    }

    const refreshToday = () => {
      const now = new Date();
      const nextTodayKey = getTrainingPathTodayKey(now, planningTimezone);
      const current = todayStateRef.current;
      if (current.planningTimezone !== planningTimezone || current.todayKey !== nextTodayKey) {
        const nextState = {
          planningTimezone,
          todayKey: nextTodayKey,
          asOfInstant: now.toISOString(),
        };
        todayStateRef.current = nextState;
        setTodayState(nextState);
      }
      return nextTodayKey != null;
    };

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      const delay = millisecondsUntilNextTrainingPathDay(new Date(), planningTimezone);
      if (delay == null) return;
      timeout = setTimeout(() => {
        if (refreshToday()) scheduleRefresh();
      }, delay);
    };

    if (
      todayStateRef.current.planningTimezone === planningTimezone &&
      todayStateRef.current.todayKey != null
    ) {
      scheduleRefresh();
    } else if (refreshToday()) {
      scheduleRefresh();
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [planningTimezone]);

  return { todayKey, asOfInstant: currentState.asOfInstant };
}

function toInclusiveQueryEnd(range: { startsBefore: string } | null) {
  if (!range) return "";
  const end = new Date(range.startsBefore);
  if (Number.isNaN(end.getTime())) return "";
  return new Date(end.getTime() - 1).toISOString();
}

function pageItems<T>(pages: readonly { items?: readonly T[] | null }[] | undefined): T[] {
  if (!Array.isArray(pages)) return [];
  return pages.flatMap((page) => {
    if (!page || typeof page !== "object") return [];
    const items = (page as { items?: unknown }).items;
    return Array.isArray(items) ? (items as T[]) : [];
  });
}

function mergeUniqueById<T extends { id: string }>(...collections: readonly T[][]): T[] {
  return Array.from(new Map(collections.flat().map((item) => [item.id, item] as const)).values());
}

function useRetainedPageItems<T extends { id: string }>(input: {
  chunkKey: string;
  maxRetainedChunks?: number | null;
  retentionKey: string;
  hasNextPage?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  isPlaceholderData?: boolean;
  pages: readonly { items?: readonly T[] | null }[] | undefined;
}) {
  const currentItems = useMemo(() => pageItems(input.pages), [input.pages]);
  const displayCurrentItems = input.isPlaceholderData ? [] : currentItems;
  const retainedRef = useRef<{ key: string; chunks: Map<string, T[]> }>({
    key: input.retentionKey,
    chunks: new Map(),
  });
  if (retainedRef.current.key !== input.retentionKey) {
    retainedRef.current = { key: input.retentionKey, chunks: new Map() };
  }
  const isSettled =
    !input.isError && !input.isFetching && !input.isPlaceholderData && !input.hasNextPage;

  useEffect(() => {
    if (isSettled) {
      retainedRef.current.chunks.delete(input.chunkKey);
      retainedRef.current.chunks.set(input.chunkKey, currentItems);
      const maxRetainedChunks =
        input.maxRetainedChunks === null
          ? 0
          : (input.maxRetainedChunks ?? MAX_RETAINED_DATA_CHUNKS);
      while (maxRetainedChunks > 0 && retainedRef.current.chunks.size > maxRetainedChunks) {
        const oldestChunkKey = retainedRef.current.chunks.keys().next().value;
        if (typeof oldestChunkKey !== "string") break;
        retainedRef.current.chunks.delete(oldestChunkKey);
      }
    }
  }, [currentItems, input.chunkKey, input.maxRetainedChunks, isSettled]);

  return useMemo(
    () =>
      mergeUniqueById(
        ...Array.from(retainedRef.current.chunks.entries()).flatMap(([chunkKey, items]) =>
          isSettled && chunkKey === input.chunkKey ? [] : [items],
        ),
        displayCurrentItems,
      ),
    [displayCurrentItems, input.chunkKey, isSettled],
  );
}

export function usePlanTrainingPathData() {
  const { profile, profileLoading, refreshProfile, user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pendingSelectedWeekStart, setPendingSelectedWeekStart] = useState<string | null>(null);
  const lastProjectionRefreshKeyRef = useRef<string | null>(null);
  const planningTimezone = profile?.planning_timezone ?? null;
  const { todayKey: planningTodayKey } = useTrainingPathTodayKey(planningTimezone);
  const planningTimezoneState = profileLoading
    ? "loading"
    : planningTodayKey
      ? "ready"
      : "unavailable";
  const todayKey = planningTodayKey ?? "";
  const eventsQueryEnabled = useAuthStore(
    (state) => state.ready && !!state.session && hasSessionAuthCredentials() && !!planningTodayKey,
  );

  const activePlanQuery = api.trainingPlans.getActivePlan.useQuery(undefined, {
    ...scheduleAwareReadQueryOptions,
    enabled: eventsQueryEnabled,
  });
  const { data: activePlanData, refetch: refetchActivePlan } = activePlanQuery;
  const activePlan = planningTodayKey ? activePlanData : undefined;
  const goals = useProfileGoals({ loadAllPages: true });
  const goalMarkersForWindow = useMemo(
    () =>
      goals.goals.flatMap((goal) =>
        goal.target_date ? [{ id: goal.id, label: goal.title, targetDate: goal.target_date }] : [],
      ),
    [goals.goals],
  );
  const today = useMemo(
    () => (planningTodayKey ? new Date(`${planningTodayKey}T12:00:00.000Z`) : new Date(0)),
    [planningTodayKey],
  );
  const trainingPathWindow = useScrollableTrainingPathWindow({
    goalMarkers: goalMarkersForWindow,
    todayKey,
  });
  const scheduledWindowStart = trainingPathWindow.resolvedWeekWindow.start;
  const scheduledWindowEnd = trainingPathWindow.resolvedWeekWindow.end;
  const hasCanonicalScheduledWindow =
    isCanonicalDateKey(scheduledWindowStart) &&
    isCanonicalDateKey(scheduledWindowEnd) &&
    scheduledWindowStart <= scheduledWindowEnd;
  const scheduleQueryWindowStart =
    planningTodayKey && hasCanonicalScheduledWindow && scheduledWindowStart < planningTodayKey
      ? scheduledWindowStart
      : (planningTodayKey ?? DORMANT_DATE_KEY);
  const scheduleQueryWindowEnd =
    planningTodayKey && hasCanonicalScheduledWindow && scheduledWindowEnd > planningTodayKey
      ? scheduledWindowEnd
      : (planningTodayKey ?? DORMANT_DATE_KEY);
  const dataWindowAnchor =
    selectedDate && isCanonicalDateKey(selectedDate) ? selectedDate : todayKey;
  const candidateDataWindowStart = addDaysToDateKey(dataWindowAnchor, -DATA_QUERY_DAY_RADIUS);
  const candidateDataWindowEnd = addDaysToDateKey(dataWindowAnchor, DATA_QUERY_DAY_RADIUS);
  const dataWindowStart = hasCanonicalScheduledWindow
    ? scheduleQueryWindowStart > candidateDataWindowStart
      ? scheduleQueryWindowStart
      : candidateDataWindowStart
    : DORMANT_DATE_KEY;
  const dataWindowEnd = hasCanonicalScheduledWindow
    ? scheduleQueryWindowEnd < candidateDataWindowEnd
      ? scheduleQueryWindowEnd
      : candidateDataWindowEnd
    : DORMANT_DATE_KEY;
  const upcomingWindowStart = dataWindowStart > todayKey ? dataWindowStart : todayKey;
  const recentWindowEnd = dataWindowEnd < todayKey ? dataWindowEnd : todayKey;
  const scheduledWindowRange = useMemo(
    () => getTrainingPathPlanningDayRange(dataWindowStart, planningTimezone),
    [dataWindowStart, planningTimezone],
  );
  const scheduledWindowEndRange = useMemo(
    () => getTrainingPathPlanningDayRange(dataWindowEnd, planningTimezone),
    [dataWindowEnd, planningTimezone],
  );
  const todayRange = useMemo(
    () => getTrainingPathPlanningDayRange(todayKey, planningTimezone),
    [planningTimezone, todayKey],
  );
  const recentWindowRange = useMemo(
    () => getTrainingPathPlanningDayRange(recentWindowEnd, planningTimezone),
    [planningTimezone, recentWindowEnd],
  );
  const scheduleQueriesEnabled =
    eventsQueryEnabled &&
    hasCanonicalScheduledWindow &&
    scheduleQueryWindowStart <= todayKey &&
    todayKey <= scheduleQueryWindowEnd &&
    dataWindowStart <= dataWindowEnd &&
    scheduledWindowRange != null &&
    scheduledWindowEndRange != null &&
    todayRange != null;
  const upcomingQueryEnabled = scheduleQueriesEnabled && upcomingWindowStart <= dataWindowEnd;
  const recentQueryEnabled = scheduleQueriesEnabled && dataWindowStart <= recentWindowEnd;

  const upcomingPlannedEventsQuery = api.events.list.useInfiniteQuery(
    {
      include_adhoc: true,
      date_from: upcomingQueryEnabled ? upcomingWindowStart : DORMANT_DATE_KEY,
      date_to: toInclusiveQueryEnd(scheduledWindowEndRange) || DORMANT_INSTANT,
      limit: 500,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: upcomingQueryEnabled,
      placeholderData: keepPreviousData,
      getNextPageParam: (lastPage) => lastPage?.nextCursor,
    },
  );
  const recentPlannedEventsQuery = api.events.list.useInfiniteQuery(
    {
      include_adhoc: true,
      date_from: recentQueryEnabled ? dataWindowStart : DORMANT_DATE_KEY,
      date_to: recentQueryEnabled
        ? toInclusiveQueryEnd(recentWindowRange) || DORMANT_INSTANT
        : DORMANT_INSTANT,
      limit: 500,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: recentQueryEnabled,
      placeholderData: keepPreviousData,
      getNextPageParam: (lastPage) => lastPage?.nextCursor,
    },
  );
  const groupCalendarEventsQuery = api.groups.events.myUpcomingGroupEvents.useInfiniteQuery(
    {
      includeCancelled: false,
      startsAfter: scheduledWindowRange?.startsAfter ?? DORMANT_INSTANT,
      startsBefore: toInclusiveQueryEnd(scheduledWindowEndRange) || DORMANT_INSTANT,
      limit: 100,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: scheduleQueriesEnabled,
      placeholderData: keepPreviousData,
      getNextPageParam: (lastPage) => lastPage?.nextCursor,
    },
  );
  const retainedUpcomingPlannedEvents = useRetainedPageItems({
    chunkKey: `${upcomingWindowStart}:${dataWindowEnd}`,
    maxRetainedChunks: null,
    retentionKey: `${user?.id ?? "anonymous"}:${planningTimezone ?? "unknown"}:events-upcoming`,
    pages: upcomingPlannedEventsQuery.data?.pages,
    hasNextPage: upcomingPlannedEventsQuery.hasNextPage,
    isError: upcomingPlannedEventsQuery.isError,
    isFetching: upcomingPlannedEventsQuery.isFetching,
    isPlaceholderData: upcomingPlannedEventsQuery.isPlaceholderData,
  });
  const upcomingPlannedEvents = planningTodayKey ? retainedUpcomingPlannedEvents : [];
  const retainedRecentPlannedEvents = useRetainedPageItems({
    chunkKey: `${dataWindowStart}:${recentWindowEnd}`,
    retentionKey: `${user?.id ?? "anonymous"}:${planningTimezone ?? "unknown"}:events-recent`,
    pages: recentPlannedEventsQuery.data?.pages,
    hasNextPage: recentPlannedEventsQuery.hasNextPage,
    isError: recentPlannedEventsQuery.isError,
    isFetching: recentPlannedEventsQuery.isFetching,
    isPlaceholderData: recentPlannedEventsQuery.isPlaceholderData,
  });
  const recentPlannedEvents = planningTodayKey ? retainedRecentPlannedEvents : [];
  const planningUpcomingPlannedEvents = useMemo(
    () =>
      upcomingPlannedEvents
        .map((event) => ({
          ...event,
          scheduled_date:
            event.all_day || !event.starts_at || !planningTimezone
              ? event.scheduled_date
              : (getTrainingPathDateKey(event.starts_at, planningTimezone) ?? event.scheduled_date),
        }))
        .filter(
          (event) =>
            event.scheduled_date >= scheduledWindowStart &&
            event.scheduled_date <= scheduledWindowEnd,
        ),
    [planningTimezone, scheduledWindowEnd, scheduledWindowStart, upcomingPlannedEvents],
  );
  const planningRecentPlannedEvents = useMemo(
    () =>
      recentPlannedEvents
        .map((event) => ({
          ...event,
          scheduled_date:
            event.all_day || !event.starts_at || !planningTimezone
              ? event.scheduled_date
              : (getTrainingPathDateKey(event.starts_at, planningTimezone) ?? event.scheduled_date),
        }))
        .filter(
          (event) =>
            event.scheduled_date >= scheduledWindowStart &&
            event.scheduled_date <= scheduledWindowEnd,
        ),
    [planningTimezone, recentPlannedEvents, scheduledWindowEnd, scheduledWindowStart],
  );
  const planningPlannedEvents = useMemo(
    () => mergeUniqueById(planningRecentPlannedEvents, planningUpcomingPlannedEvents),
    [planningRecentPlannedEvents, planningUpcomingPlannedEvents],
  );
  const retainedGroupCalendarEvents = useRetainedPageItems({
    chunkKey: `${dataWindowStart}:${dataWindowEnd}`,
    maxRetainedChunks: null,
    retentionKey: `${user?.id ?? "anonymous"}:${planningTimezone ?? "unknown"}:group-events`,
    pages: groupCalendarEventsQuery.data?.pages,
    hasNextPage: groupCalendarEventsQuery.hasNextPage,
    isError: groupCalendarEventsQuery.isError,
    isFetching: groupCalendarEventsQuery.isFetching,
    isPlaceholderData: groupCalendarEventsQuery.isPlaceholderData,
  });
  const groupCalendarEvents = useMemo(
    () =>
      planningTodayKey
        ? retainedGroupCalendarEvents.filter((event) => {
            const date = planningTimezone
              ? getTrainingPathDateKey(event.starts_at, planningTimezone)
              : null;
            return !!date && date >= scheduledWindowStart && date <= scheduledWindowEnd;
          })
        : [],
    [
      planningTimezone,
      planningTodayKey,
      retainedGroupCalendarEvents,
      scheduledWindowEnd,
      scheduledWindowStart,
    ],
  );
  const selectedGroupActivityPlanIds = useMemo(
    () => getSelectedGroupEventActivityPlanIds(groupCalendarEvents),
    [groupCalendarEvents],
  );
  const selectedGroupActivityPlansQuery = api.activityPlans.getManyByIds.useQuery(
    { ids: selectedGroupActivityPlanIds },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: scheduleQueriesEnabled && selectedGroupActivityPlanIds.length > 0,
      placeholderData: keepPreviousData,
    },
  );
  const groupCalendarEventsWithActivityPlans = useMemo(
    () =>
      attachSelectedGroupEventActivityPlans(
        groupCalendarEvents,
        selectedGroupActivityPlansQuery.data?.items ?? [],
      ),
    [groupCalendarEvents, selectedGroupActivityPlansQuery.data?.items],
  );
  const groupScheduledActivityPlanEvents = useMemo(
    () =>
      groupCalendarEventsWithActivityPlans
        .map(toGroupEventScheduledActivityPlanEvent)
        .filter(isPresent),
    [groupCalendarEventsWithActivityPlans],
  );
  const planningGroupScheduledActivityPlanEvents = useMemo(
    () =>
      groupScheduledActivityPlanEvents.map((event) => ({
        ...event,
        scheduled_date: planningTimezone
          ? (getTrainingPathDateKey(event.starts_at, planningTimezone) ?? event.scheduled_date)
          : event.scheduled_date,
      })),
    [groupScheduledActivityPlanEvents, planningTimezone],
  );
  const completedActivitiesQuery = api.activities.listPaginated.useInfiniteQuery(
    {
      date_from: scheduledWindowRange?.startsAfter ?? DORMANT_INSTANT,
      date_to: toInclusiveQueryEnd(recentWindowRange) || DORMANT_INSTANT,
      limit: 50,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: recentQueryEnabled,
      placeholderData: keepPreviousData,
      getNextPageParam: (lastPage) => lastPage?.nextCursor,
    },
  );
  const retainedCompletedActivities = useRetainedPageItems({
    chunkKey: `${dataWindowStart}:${recentWindowEnd}`,
    retentionKey: `${user?.id ?? "anonymous"}:${planningTimezone ?? "unknown"}:activities`,
    pages: completedActivitiesQuery.data?.pages,
    hasNextPage: completedActivitiesQuery.hasNextPage,
    isError: completedActivitiesQuery.isError,
    isFetching: completedActivitiesQuery.isFetching,
    isPlaceholderData: completedActivitiesQuery.isPlaceholderData,
  });
  const completedActivities = planningTodayKey ? retainedCompletedActivities : [];

  useEffect(() => {
    if (!scheduleQueriesEnabled) return;

    const paginatedQueries = [
      { enabled: upcomingQueryEnabled, query: upcomingPlannedEventsQuery },
      { enabled: recentQueryEnabled, query: recentPlannedEventsQuery },
      { enabled: scheduleQueriesEnabled, query: groupCalendarEventsQuery },
      { enabled: recentQueryEnabled, query: completedActivitiesQuery },
    ];
    for (const item of paginatedQueries) {
      if (
        item.enabled &&
        item.query.hasNextPage &&
        !item.query.isFetchingNextPage &&
        !item.query.isFetchNextPageError
      ) {
        void item.query.fetchNextPage();
      }
    }
  }, [
    completedActivitiesQuery,
    groupCalendarEventsQuery,
    recentQueryEnabled,
    recentPlannedEventsQuery,
    scheduleQueriesEnabled,
    upcomingQueryEnabled,
    upcomingPlannedEventsQuery,
  ]);

  const snapshot = useTrainingPlanSnapshot({
    ...(activePlan?.id ? { planId: activePlan.id } : {}),
    includeStatus: false,
    includeInsightTimeline: false,
    includeWeeklySummaries: false,
    curveWindow: "overview",
  });
  const profileSettings = useProfileSettings();
  const dashboard = usePlanDashboardViewModel({
    activePlan,
    goals,
    includeGoalReadiness: false,
    profileSettings: profileSettings.settings,
    snapshot,
    upcomingPlannedEvents: planningUpcomingPlannedEvents,
    recentPlannedEvents: planningRecentPlannedEvents,
    today,
  });
  const firstActualFitnessDate = dashboard.fitnessHistory[0]?.date ?? null;
  const expandedActualCurveEnabled =
    recentQueryEnabled && (!firstActualFitnessDate || dataWindowStart < firstActualFitnessDate);
  const expandedActualCurveQuery = api.trainingPlans.getActualCurve.useQuery(
    {
      start_date: expandedActualCurveEnabled ? dataWindowStart : DORMANT_DATE_KEY,
      end_date: expandedActualCurveEnabled ? recentWindowEnd : DORMANT_DATE_KEY,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: expandedActualCurveEnabled,
      placeholderData: keepPreviousData,
    },
  );
  const fitnessHistoryForWindow = useMemo(
    () =>
      Array.from(
        new Map(
          [...dashboard.fitnessHistory, ...(expandedActualCurveQuery.data?.dataPoints ?? [])].map(
            (point) => [point.date, point] as const,
          ),
        ).values(),
      ).sort((left, right) => left.date.localeCompare(right.date)),
    [dashboard.fitnessHistory, expandedActualCurveQuery.data?.dataPoints],
  );
  const commonLoadHistoryQuery = api.activities.commonLoadHistory.useQuery(undefined, {
    ...scheduleAwareReadQueryOptions,
    enabled: eventsQueryEnabled,
    placeholderData: keepPreviousData,
  });
  const commonLoadFitnessHistory = useMemo(
    () =>
      commonLoadHistoryQuery.data?.status === "available"
        ? commonLoadHistoryQuery.data.points.map((point) => ({
            date: point.date,
            ctl: point.longTermLoad,
            atl: point.recentLoad,
            tsb: point.loadBalance,
          }))
        : [],
    [commonLoadHistoryQuery.data],
  );
  const projectionBaselineFitnessHistory =
    commonLoadFitnessHistory.length > 0 ? commonLoadFitnessHistory : fitnessHistoryForWindow;
  const dailyCommonLoadReadiness = resolveBoundedPlanningDateRange({
    startDate: recentQueryEnabled ? dataWindowStart : null,
    endDate: recentQueryEnabled ? recentWindowEnd : null,
    maxInclusiveDays: 365,
    timezone: planningTimezone,
  });
  const dailyCommonLoadInput =
    dailyCommonLoadReadiness.status === "ready"
      ? {
          start_date: dailyCommonLoadReadiness.value.startDate,
          end_date: dailyCommonLoadReadiness.value.endDate,
          timezone: dailyCommonLoadReadiness.value.timezone,
        }
      : {
          start_date: DORMANT_DATE_KEY,
          end_date: DORMANT_DATE_KEY,
          timezone: "UTC",
        };
  const dailyCommonLoadQueryEnabled =
    scheduleQueriesEnabled && dailyCommonLoadReadiness.status === "ready";
  const dailyCommonLoadObservationsQuery = api.activities.dailyCommonLoadObservations.useQuery(
    dailyCommonLoadInput,
    {
      ...scheduleAwareReadQueryOptions,
      enabled: dailyCommonLoadQueryEnabled,
      placeholderData: (previousData) => previousData,
    },
  );
  const localProjectionPreview = useMemo(
    () =>
      buildTrainingPreferencesProjectionPreview({
        draft: profileSettings.settings,
        fitnessHistory: projectionBaselineFitnessHistory,
        snapshot,
      }),
    [profileSettings.settings, projectionBaselineFitnessHistory, snapshot],
  );
  const projectedLoadTimelinePoints = useMemo(
    () =>
      buildTrainingPreferencesLoadTimeline({
        projectionChart: localProjectionPreview.projectionChart,
        snapshot,
        scheduledEvents: [...planningPlannedEvents, ...planningGroupScheduledActivityPlanEvents],
        scheduledWindowStart,
        scheduledWindowEnd,
      }),
    [
      localProjectionPreview.projectionChart,
      planningGroupScheduledActivityPlanEvents,
      planningPlannedEvents,
      scheduledWindowEnd,
      scheduledWindowStart,
      snapshot,
    ],
  );
  // Legacy recommended_load_tss dates cannot authorize a common-Load target.
  const targetLoadDates = useMemo(() => new Set<string>(), []);
  const completedObservationMerge = useMemo(
    () =>
      mergeCompletedCommonLoadObservations({
        requestedRange:
          dailyCommonLoadReadiness.status === "ready"
            ? {
                start_date: dailyCommonLoadReadiness.value.startDate,
                end_date: dailyCommonLoadReadiness.value.endDate,
                timezone: dailyCommonLoadReadiness.value.timezone,
              }
            : null,
        response: dailyCommonLoadObservationsQuery.data ?? null,
        timeline: projectedLoadTimelinePoints,
      }),
    [dailyCommonLoadObservationsQuery.data, dailyCommonLoadReadiness, projectedLoadTimelinePoints],
  );
  const effectiveCompletedObservationsByDate = useMemo(
    () =>
      buildEffectiveCompletedObservationsByDate({
        completedObservationsByDate: completedObservationMerge.completedObservationsByDate,
        endDate: scheduledWindowEnd,
        todayKey,
      }),
    [completedObservationMerge.completedObservationsByDate, scheduledWindowEnd, todayKey],
  );
  const noRecommendedFitnessCurve = useMemo<[]>(() => [], []);
  const canonicalTimelineWindow = useMemo(
    () =>
      buildTrainingTimelineWindowFromLoadTimeline({
        today: todayKey,
        startDate: completedObservationMerge.timeline[0]?.date ?? scheduledWindowStart,
        endDate:
          completedObservationMerge.timeline[completedObservationMerge.timeline.length - 1]?.date ??
          scheduledWindowEnd,
        timeline: completedObservationMerge.timeline.map((point) => ({
          ...point,
          tentative_scheduled_load_tss: point.tentative_scheduled_load_tss ?? 0,
        })),
      }),
    [completedObservationMerge.timeline, scheduledWindowEnd, scheduledWindowStart, todayKey],
  );
  const baseTrainingPath = useTrainingPathViewModel({
    // Canonical Plan load metrics are attached below from getEffectiveLoad. The local timeline
    // remains a legacy adjustment-chart adapter and must not define this path's load values.
    timeline: [],
    fitnessHistory: planningTodayKey ? commonLoadFitnessHistory : [],
    projectedFitness: [],
    idealFitnessCurve: planningTodayKey ? noRecommendedFitnessCurve : [],
    goalMarkers: planningTodayKey ? dashboard.goalMarkers : [],
    selectedWeekStart,
    range: "season",
    weekWindow: trainingPathWindow.resolvedWeekWindow,
    todayKey,
  });
  const baseDailyTrainingPathPoints = useMemo(
    () =>
      buildDailyTrainingAdjustmentPointsFromTimelineWindow({
        completedObservationsByDate: effectiveCompletedObservationsByDate,
        targetLoadDates,
        timelineWindow: canonicalTimelineWindow,
        fitnessHistory: commonLoadFitnessHistory,
        idealFitnessCurve: noRecommendedFitnessCurve,
        scheduledFitnessTrend: [],
      }),
    [
      canonicalTimelineWindow,
      effectiveCompletedObservationsByDate,
      commonLoadFitnessHistory,
      noRecommendedFitnessCurve,
      targetLoadDates,
    ],
  );

  const effectiveMetricPeriods = useMemo(
    () => [
      ...baseDailyTrainingPathPoints.map((point) => ({
        key: `day:${point.date}`,
        startDate: point.date,
        endDate: point.date,
      })),
      ...(baseTrainingPath.weeks ?? []).map((week) => ({
        key: `week:${week.weekStart}`,
        startDate: week.weekStart,
        endDate: week.weekEnd,
      })),
      ...(baseTrainingPath.selectedWeekSummary &&
      !(baseTrainingPath.weeks ?? []).some(
        (week) => week.weekStart === baseTrainingPath.selectedWeekSummary?.weekStart,
      )
        ? [
            {
              key: `week:${baseTrainingPath.selectedWeekSummary.weekStart}`,
              startDate: baseTrainingPath.selectedWeekSummary.weekStart,
              endDate: baseTrainingPath.selectedWeekSummary.weekEnd,
            },
          ]
        : []),
    ],
    [baseDailyTrainingPathPoints, baseTrainingPath.selectedWeekSummary, baseTrainingPath.weeks],
  );
  const effectivePlanLoadQuery = api.trainingPlans.getEffectiveLoad.useQuery(
    {
      startDate: dataWindowStart,
      endDate: dataWindowEnd,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: scheduleQueriesEnabled && dataWindowStart <= dataWindowEnd,
      placeholderData: keepPreviousData,
    },
  );
  const effectiveMetricSummaries = useMemo(
    () =>
      buildServerEffectiveLoadSummaries({
        periods: effectiveMetricPeriods,
        response: effectivePlanLoadQuery.data,
      }),
    [effectiveMetricPeriods, effectivePlanLoadQuery.data],
  );
  const effectiveBaseDailyTrainingPathPoints = useMemo(
    () =>
      baseDailyTrainingPathPoints.map((point) => {
        const summary = effectiveMetricSummaries.get(`day:${point.date}`);
        if (!summary) return point;
        const observedCompletedLoad =
          point.completedObservationState === "observed" &&
          typeof point.completedLoadTss === "number" &&
          Number.isFinite(point.completedLoadTss)
            ? point.completedLoadTss
            : null;
        return {
          ...point,
          effectiveLoadStatus: summary.status,
          effectiveLoad: summary.commonLoad,
          effectiveIntensity: summary.intensity,
          effectiveCompletedLoad: summary.completedLoad ?? observedCompletedLoad,
          effectiveRemainingLoad: summary.remainingLoad,
          effectiveTentativeLoad: summary.tentativeLoad,
          recommendedLoadStatus: summary.recommendedLoadStatus,
          recommendedLoad: summary.recommendedLoad,
          hasTargetLoad:
            summary.recommendedLoadStatus === "complete" ||
            summary.recommendedLoadStatus === "partial" ||
            summary.recommendedLoadStatus === "known_zero",
          hasCompletedActivityWithoutLoad:
            summary.hasUnavailableCompletedLoad === true ||
            point.hasCompletedActivityWithoutLoad === true,
        };
      }),
    [baseDailyTrainingPathPoints, effectiveMetricSummaries],
  );
  const commonLoadFitnessSeries = useMemo(
    () =>
      buildPlanCommonLoadFitnessSeries({
        history: commonLoadHistoryQuery.data,
        points: effectiveBaseDailyTrainingPathPoints,
        ...(effectivePlanLoadQuery.data?.status === "available"
          ? { recommendation: effectivePlanLoadQuery.data.recommendation }
          : {}),
      }),
    [
      commonLoadHistoryQuery.data,
      effectiveBaseDailyTrainingPathPoints,
      effectivePlanLoadQuery.data,
    ],
  );
  const scheduledFitnessTrend = commonLoadFitnessSeries.projectedFitness;
  const recommendedFitnessTrend = commonLoadFitnessSeries.recommendedFitness;
  const trainingPath = useTrainingPathViewModel({
    timeline: [],
    fitnessHistory: planningTodayKey ? commonLoadFitnessSeries.actualFitnessHistory : [],
    projectedFitness: planningTodayKey ? scheduledFitnessTrend : [],
    idealFitnessCurve: planningTodayKey ? recommendedFitnessTrend : [],
    goalMarkers: planningTodayKey ? dashboard.goalMarkers : [],
    selectedWeekStart,
    range: "season",
    weekWindow: trainingPathWindow.resolvedWeekWindow,
    todayKey,
  });
  const selectedWeekRangeStart = trainingPath.selectedWeekSummary?.weekStart ?? null;
  const selectedWeekRangeEnd = trainingPath.selectedWeekSummary?.weekEnd ?? null;
  const effectiveSelectedWeekSummary = selectedWeekRangeStart
    ? (effectiveMetricSummaries.get(`week:${selectedWeekRangeStart}`) ?? null)
    : null;
  const effectiveDailyTrainingPathPoints = useMemo(() => {
    const projectedFitnessByDate = new Map(
      scheduledFitnessTrend.map((point) => [point.date, point] as const),
    );
    const recommendedFitnessByDate = new Map(
      recommendedFitnessTrend.map((point) => [point.date, point] as const),
    );
    return effectiveBaseDailyTrainingPathPoints.map((point) => {
      const projectedFitness = projectedFitnessByDate.get(point.date);
      const recommendedFitness = recommendedFitnessByDate.get(point.date);
      return {
        ...point,
        scheduledFitnessCtl: projectedFitness?.ctl ?? point.scheduledFitnessCtl ?? null,
        targetFitnessCtl: recommendedFitness?.ctl ?? point.targetFitnessCtl ?? null,
        fatigueAtl: projectedFitness?.atl ?? point.fatigueAtl ?? null,
        formTsb: projectedFitness?.tsb ?? point.formTsb ?? null,
      };
    });
  }, [effectiveBaseDailyTrainingPathPoints, recommendedFitnessTrend, scheduledFitnessTrend]);
  const effectiveTrainingPath = useMemo(() => {
    const weeks = (trainingPath.weeks ?? []).map((week) => {
      const summary = effectiveMetricSummaries.get(`week:${week.weekStart}`);
      return summary
        ? {
            ...week,
            effectiveLoadStatus: summary.status,
            effectiveLoad: summary.commonLoad,
            effectiveIntensity: summary.intensity,
            effectiveCompletedLoad: summary.completedLoad,
            effectiveRemainingLoad: summary.remainingLoad,
            effectiveTentativeLoad: summary.tentativeLoad,
            recommendedLoadStatus: summary.recommendedLoadStatus,
            recommendedLoad: summary.recommendedLoad,
            targetFitness:
              summary.recommendedLoadStatus === "complete" ||
              summary.recommendedLoadStatus === "known_zero"
                ? week.targetFitness
                : null,
            completedLoadUnavailable:
              summary.hasUnavailableCompletedLoad === true ||
              week.completedLoadUnavailable === true,
          }
        : week;
    });
    if (!effectiveSelectedWeekSummary || !trainingPath.selectedWeekSummary) {
      return { ...trainingPath, weeks };
    }
    return {
      ...trainingPath,
      weeks,
      selectedWeekSummary: {
        ...trainingPath.selectedWeekSummary,
        effectiveLoadStatus: effectiveSelectedWeekSummary.status,
        effectiveLoad: effectiveSelectedWeekSummary.commonLoad,
        effectiveIntensity: effectiveSelectedWeekSummary.intensity,
        effectiveCompletedLoad: effectiveSelectedWeekSummary.completedLoad,
        effectiveRemainingLoad: effectiveSelectedWeekSummary.remainingLoad,
        effectiveTentativeLoad: effectiveSelectedWeekSummary.tentativeLoad,
        recommendedLoadStatus: effectiveSelectedWeekSummary.recommendedLoadStatus,
        recommendedLoad: effectiveSelectedWeekSummary.recommendedLoad,
        targetFitness:
          effectiveSelectedWeekSummary.recommendedLoadStatus === "complete" ||
          effectiveSelectedWeekSummary.recommendedLoadStatus === "known_zero"
            ? trainingPath.selectedWeekSummary.targetFitness
            : null,
        completedLoadUnavailable:
          effectiveSelectedWeekSummary.hasUnavailableCompletedLoad === true ||
          trainingPath.selectedWeekSummary.completedLoadUnavailable === true,
      },
    };
  }, [effectiveMetricSummaries, effectiveSelectedWeekSummary, trainingPath]);
  const activityOwner = useMemo<ActivityOwner | null>(
    () =>
      user?.id
        ? {
            avatar_url: profile?.avatar_url ?? null,
            id: user.id,
            username: profile?.username ?? user.email?.split("@")[0] ?? "You",
          }
        : null,
    [profile?.avatar_url, profile?.username, user?.email, user?.id],
  );
  const eventReviewItems = useMemo<TrainingPathScheduledItem[]>(() => {
    return buildTrainingPathEventReviewItems({
      events: planningPlannedEvents,
      owner: activityOwner,
      planningTimezone,
    });
  }, [activityOwner, planningPlannedEvents, planningTimezone]);
  const groupEventReviewItems = useMemo<TrainingPathScheduledItem[]>(() => {
    return buildTrainingPathGroupEventReviewItems({
      groupEvents: groupCalendarEventsWithActivityPlans,
      planningTimezone,
    });
  }, [groupCalendarEventsWithActivityPlans, planningTimezone]);
  const completedReviewActivities = useMemo<TrainingPathCompletedActivity[]>(
    () =>
      completedActivities
        .map((activity) =>
          toTrainingPathCompletedActivity(activity, activityOwner, planningTimezone),
        )
        .filter(isPresent)
        .sort((left, right) => left.date.localeCompare(right.date)),
    [activityOwner, completedActivities, planningTimezone],
  );
  const selectedWeekGoals = useMemo<TrainingPathSelectedGoal[]>(() => {
    if (!selectedWeekRangeStart || !selectedWeekRangeEnd) return [];
    return goals.goals.flatMap((goal) => {
      const targetDate = goal.target_date;
      if (!targetDate || targetDate < selectedWeekRangeStart || targetDate > selectedWeekRangeEnd) {
        return [];
      }

      return [
        {
          id: goal.id,
          label: goal.title,
          targetDate,
          activityCategory: goal.activity_category,
          status: "Goal due",
        },
      ];
    });
  }, [goals.goals, selectedWeekRangeEnd, selectedWeekRangeStart]);
  const selectedWeekEvents = useMemo<TrainingPathScheduledItem[]>(() => {
    if (!selectedWeekRangeStart || !selectedWeekRangeEnd) return [];
    return eventReviewItems.filter(
      (item) => item.date >= selectedWeekRangeStart && item.date <= selectedWeekRangeEnd,
    );
  }, [eventReviewItems, selectedWeekRangeEnd, selectedWeekRangeStart]);
  const selectedWeekGroupEvents = useMemo<TrainingPathScheduledItem[]>(() => {
    if (!selectedWeekRangeStart || !selectedWeekRangeEnd) return [];
    return groupEventReviewItems.filter(
      (item) => item.date >= selectedWeekRangeStart && item.date <= selectedWeekRangeEnd,
    );
  }, [groupEventReviewItems, selectedWeekRangeEnd, selectedWeekRangeStart]);
  const selectedWeekCompletedActivities = useMemo<TrainingPathCompletedActivity[]>(() => {
    if (!selectedWeekRangeStart || !selectedWeekRangeEnd) return [];
    return completedReviewActivities.filter(
      (activity) =>
        activity.date >= selectedWeekRangeStart && activity.date <= selectedWeekRangeEnd,
    );
  }, [completedReviewActivities, selectedWeekRangeEnd, selectedWeekRangeStart]);
  const selectedWeekLoading =
    (!!pendingSelectedWeekStart &&
      pendingSelectedWeekStart !== trainingPath.selectedWeekSummary?.weekStart) ||
    (upcomingQueryEnabled &&
      (upcomingPlannedEventsQuery.isLoading ||
        upcomingPlannedEventsQuery.isFetching ||
        upcomingPlannedEventsQuery.isFetchingNextPage ||
        (upcomingPlannedEventsQuery.hasNextPage &&
          !upcomingPlannedEventsQuery.isFetchNextPageError))) ||
    (recentQueryEnabled &&
      (recentPlannedEventsQuery.isLoading ||
        recentPlannedEventsQuery.isFetching ||
        recentPlannedEventsQuery.isFetchingNextPage ||
        (recentPlannedEventsQuery.hasNextPage &&
          !recentPlannedEventsQuery.isFetchNextPageError))) ||
    groupCalendarEventsQuery.isLoading ||
    groupCalendarEventsQuery.isFetching ||
    groupCalendarEventsQuery.isFetchingNextPage ||
    (groupCalendarEventsQuery.hasNextPage && !groupCalendarEventsQuery.isFetchNextPageError) ||
    selectedGroupActivityPlansQuery.isLoading ||
    selectedGroupActivityPlansQuery.isFetching ||
    (recentQueryEnabled &&
      (completedActivitiesQuery.isLoading ||
        completedActivitiesQuery.isFetching ||
        completedActivitiesQuery.isFetchingNextPage ||
        (completedActivitiesQuery.hasNextPage && !completedActivitiesQuery.isFetchNextPageError)));
  const chartLoading =
    profileLoading ||
    (planningTimezoneState === "ready" && !eventsQueryEnabled) ||
    activePlanQuery.isLoading ||
    upcomingPlannedEventsQuery.isLoading ||
    recentPlannedEventsQuery.isLoading ||
    commonLoadHistoryQuery.isLoading ||
    dailyCommonLoadObservationsQuery.isLoading ||
    effectivePlanLoadQuery.isLoading ||
    profileSettings.isLoading;
  const queryFailureCount =
    [
      activePlanQuery.isError,
      upcomingPlannedEventsQuery.isError,
      recentPlannedEventsQuery.isError,
      groupCalendarEventsQuery.isError,
      selectedGroupActivityPlansQuery.isError,
      completedActivitiesQuery.isError,
      commonLoadHistoryQuery.isError,
      dailyCommonLoadObservationsQuery.isError,
      effectivePlanLoadQuery.isError,
      expandedActualCurveQuery.isError,
      goals.isError,
      profileSettings.isError,
      snapshot.hasAnyError,
    ].filter(Boolean).length + (planningTimezoneState === "unavailable" ? 1 : 0);
  const hasUsableData =
    planningTimezoneState === "ready" &&
    Boolean(
      activePlan ||
        upcomingPlannedEvents?.length ||
        recentPlannedEvents?.length ||
        groupCalendarEvents.length ||
        completedActivities.length ||
        commonLoadHistoryQuery.data?.status === "available" ||
        dailyCommonLoadObservationsQuery.data?.observations.length ||
        goals.goals.length ||
        effectiveDailyTrainingPathPoints.length,
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

  const handleWeekScrollStart = useCallback(() => {
    setPendingSelectedWeekStart(null);
  }, []);

  useEffect(() => {
    if (!pendingSelectedWeekStart) return;
    if (trainingPath.selectedWeekSummary?.weekStart !== pendingSelectedWeekStart) return;
    setPendingSelectedWeekStart(null);
  }, [pendingSelectedWeekStart, trainingPath.selectedWeekSummary?.weekStart]);

  useEffect(() => {
    const refreshKey = [
      String(upcomingPlannedEventsQuery.dataUpdatedAt ?? 0),
      String(recentPlannedEventsQuery.dataUpdatedAt ?? 0),
      String(groupCalendarEventsQuery.dataUpdatedAt ?? 0),
      String(selectedGroupActivityPlansQuery.dataUpdatedAt ?? 0),
      String(completedActivitiesQuery.dataUpdatedAt ?? 0),
      String(commonLoadHistoryQuery.dataUpdatedAt ?? 0),
      String(dailyCommonLoadObservationsQuery.dataUpdatedAt ?? 0),
      String(goals.dataUpdatedAt ?? 0),
    ].join(":");

    if (
      !upcomingPlannedEventsQuery.dataUpdatedAt &&
      !recentPlannedEventsQuery.dataUpdatedAt &&
      !groupCalendarEventsQuery.dataUpdatedAt
    ) {
      return;
    }
    if (lastProjectionRefreshKeyRef.current === null) {
      lastProjectionRefreshKeyRef.current = refreshKey;
      return;
    }
    if (lastProjectionRefreshKeyRef.current === refreshKey) return;

    lastProjectionRefreshKeyRef.current = refreshKey;
    void Promise.all([refetchActivePlan(), snapshot.refetchAll()]);
  }, [
    completedActivitiesQuery.dataUpdatedAt,
    commonLoadHistoryQuery.dataUpdatedAt,
    dailyCommonLoadObservationsQuery.dataUpdatedAt,
    goals.dataUpdatedAt,
    groupCalendarEventsQuery.dataUpdatedAt,
    recentPlannedEventsQuery.dataUpdatedAt,
    refetchActivePlan,
    selectedGroupActivityPlansQuery.dataUpdatedAt,
    snapshot.refetchAll,
    upcomingPlannedEventsQuery.dataUpdatedAt,
  ]);

  const handleRefresh = useCallback(async () => {
    resetTrainingPathChart();
    setRefreshing(true);
    try {
      await Promise.all([
        refreshPlanTabData({
          refetchActivePlan: () => (eventsQueryEnabled ? refetchActivePlan() : undefined),
          refetchSnapshot: () => (eventsQueryEnabled ? snapshot.refetchAll() : undefined),
          refetchGoals: goals.refetch,
          refetchUpcomingEvents: () =>
            upcomingQueryEnabled ? upcomingPlannedEventsQuery.refetch() : undefined,
          refetchRecentEvents: () =>
            recentQueryEnabled ? recentPlannedEventsQuery.refetch() : undefined,
        }),
        scheduleQueriesEnabled ? groupCalendarEventsQuery.refetch() : Promise.resolve(null),
        scheduleQueriesEnabled && selectedGroupActivityPlanIds.length > 0
          ? selectedGroupActivityPlansQuery.refetch()
          : Promise.resolve(null),
        recentQueryEnabled ? completedActivitiesQuery.refetch() : Promise.resolve(null),
        eventsQueryEnabled ? commonLoadHistoryQuery.refetch() : Promise.resolve(null),
        dailyCommonLoadQueryEnabled
          ? dailyCommonLoadObservationsQuery.refetch()
          : Promise.resolve(null),
        scheduleQueriesEnabled ? effectivePlanLoadQuery.refetch() : Promise.resolve(null),
        expandedActualCurveEnabled ? expandedActualCurveQuery.refetch() : Promise.resolve(null),
        refreshProfile(),
        profileSettings.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    completedActivitiesQuery.refetch,
    commonLoadHistoryQuery.refetch,
    dailyCommonLoadObservationsQuery.refetch,
    dailyCommonLoadQueryEnabled,
    effectivePlanLoadQuery,
    eventsQueryEnabled,
    expandedActualCurveEnabled,
    expandedActualCurveQuery.refetch,
    goals.refetch,
    groupCalendarEventsQuery.refetch,
    recentPlannedEventsQuery.refetch,
    refetchActivePlan,
    refreshProfile,
    resetTrainingPathChart,
    scheduleQueriesEnabled,
    selectedGroupActivityPlanIds.length,
    selectedGroupActivityPlansQuery.refetch,
    snapshot.refetchAll,
    upcomingPlannedEventsQuery.refetch,
    profileSettings.refetch,
    recentQueryEnabled,
    upcomingQueryEnabled,
  ]);

  return {
    refreshing,
    handleRefresh,
    trainingPath: effectiveTrainingPath,
    dailyTrainingPathPoints:
      planningTimezoneState === "ready" ? effectiveDailyTrainingPathPoints : [],
    chartLoading: profileLoading || (planningTimezoneState === "ready" && chartLoading),
    chartUnavailable:
      planningTimezoneState === "unavailable" ||
      (!chartLoading && queryFailureCount > 0 && !hasUsableData),
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
