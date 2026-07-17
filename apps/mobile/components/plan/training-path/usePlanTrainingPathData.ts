import { buildTrainingTimelineWindowFromLoadTimeline } from "@repo/core/training-timeline";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import {
  attachSelectedGroupEventActivityPlans,
  getSelectedGroupEventActivityPlanIds,
  toGroupEventScheduledActivityPlanEvent,
} from "@/lib/calendar/groupEventPlans";
import { useAuth } from "@/lib/hooks/useAuth";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { refreshPlanTabData } from "@/lib/scheduling/refreshScheduleViews";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  buildDailyTrainingAdjustmentPointsFromTimelineWindow,
  buildEffectiveCompletedObservationsByDate,
  mergeCompletedTssObservations,
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
import { buildScheduledFitnessTrend, getWeekStartDateKey } from "./trainingPathUtils";
import { useScrollableTrainingPathWindow } from "./useScrollableTrainingPathWindow";
import { useTrainingPathViewModel } from "./useTrainingPathViewModel";

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function useTrainingPathTodayKey(planningTimezone: string | null) {
  const [todayKey, setTodayKey] = useState<string | null>(null);

  useEffect(() => {
    if (!planningTimezone) {
      setTodayKey(null);
      return;
    }

    const refreshToday = () => {
      const nextTodayKey = getTrainingPathTodayKey(new Date(), planningTimezone);
      setTodayKey((current) => (current === nextTodayKey ? current : nextTodayKey));
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

    if (refreshToday()) scheduleRefresh();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [planningTimezone]);

  return todayKey;
}

function toInclusiveQueryEnd(range: { startsBefore: string } | null) {
  if (!range) return "";
  const end = new Date(range.startsBefore);
  if (Number.isNaN(end.getTime())) return "";
  return new Date(end.getTime() - 1).toISOString();
}

export function usePlanTrainingPathData() {
  const { profile, user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pendingSelectedWeekStart, setPendingSelectedWeekStart] = useState<string | null>(null);
  const lastProjectionRefreshKeyRef = useRef<string | null>(null);
  const planningTimezone = profile?.planning_timezone ?? null;
  const planningTodayKey = useTrainingPathTodayKey(planningTimezone);
  const planningTimezoneState = planningTodayKey ? "ready" : "unavailable";
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
  const scheduledWindowRange = useMemo(
    () => getTrainingPathPlanningDayRange(scheduledWindowStart, planningTimezone),
    [planningTimezone, scheduledWindowStart],
  );
  const scheduledWindowEndRange = useMemo(
    () => getTrainingPathPlanningDayRange(scheduledWindowEnd, planningTimezone),
    [planningTimezone, scheduledWindowEnd],
  );
  const todayRange = useMemo(
    () => getTrainingPathPlanningDayRange(todayKey, planningTimezone),
    [planningTimezone, todayKey],
  );

  const upcomingPlannedEventsQuery = api.events.list.useInfiniteQuery(
    {
      include_adhoc: true,
      date_from: todayKey,
      date_to: toInclusiveQueryEnd(scheduledWindowEndRange),
      limit: 500,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const recentPlannedEventsQuery = api.events.list.useInfiniteQuery(
    {
      include_adhoc: true,
      date_from: scheduledWindowStart,
      date_to: toInclusiveQueryEnd(todayRange),
      limit: 500,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const groupCalendarEventsQuery = api.groups.events.myUpcomingGroupEvents.useInfiniteQuery(
    {
      includeCancelled: false,
      startsAfter: scheduledWindowRange?.startsAfter ?? "",
      startsBefore: toInclusiveQueryEnd(scheduledWindowEndRange),
      limit: 100,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const upcomingPlannedEvents = useMemo(
    () =>
      planningTodayKey
        ? (upcomingPlannedEventsQuery.data?.pages.flatMap((page) => page.items) ?? [])
        : [],
    [planningTodayKey, upcomingPlannedEventsQuery.data?.pages],
  );
  const recentPlannedEvents = useMemo(
    () =>
      planningTodayKey
        ? (recentPlannedEventsQuery.data?.pages.flatMap((page) => page.items) ?? [])
        : [],
    [planningTodayKey, recentPlannedEventsQuery.data?.pages],
  );
  const planningUpcomingPlannedEvents = useMemo(
    () =>
      upcomingPlannedEvents.map((event) => ({
        ...event,
        scheduled_date:
          event.all_day || !event.starts_at || !planningTimezone
            ? event.scheduled_date
            : (getTrainingPathDateKey(event.starts_at, planningTimezone) ?? event.scheduled_date),
      })),
    [planningTimezone, upcomingPlannedEvents],
  );
  const planningRecentPlannedEvents = useMemo(
    () =>
      recentPlannedEvents.map((event) => ({
        ...event,
        scheduled_date:
          event.all_day || !event.starts_at || !planningTimezone
            ? event.scheduled_date
            : (getTrainingPathDateKey(event.starts_at, planningTimezone) ?? event.scheduled_date),
      })),
    [planningTimezone, recentPlannedEvents],
  );
  const groupCalendarEvents = useMemo(
    () =>
      planningTodayKey
        ? (groupCalendarEventsQuery.data?.pages.flatMap((page) => page.items) ?? [])
        : [],
    [planningTodayKey, groupCalendarEventsQuery.data?.pages],
  );
  const selectedGroupActivityPlanIds = useMemo(
    () => getSelectedGroupEventActivityPlanIds(groupCalendarEvents),
    [groupCalendarEvents],
  );
  const selectedGroupActivityPlansQuery = api.activityPlans.getManyByIds.useQuery(
    { ids: selectedGroupActivityPlanIds },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled && selectedGroupActivityPlanIds.length > 0,
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
      date_from: scheduledWindowRange?.startsAfter ?? "",
      date_to: toInclusiveQueryEnd(todayRange),
      limit: 50,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const completedActivities = useMemo(
    () =>
      planningTodayKey
        ? (completedActivitiesQuery.data?.pages.flatMap((page) => page.items) ?? [])
        : [],
    [planningTodayKey, completedActivitiesQuery.data?.pages],
  );

  useEffect(() => {
    if (!eventsQueryEnabled) return;

    const paginatedQueries = [
      upcomingPlannedEventsQuery,
      recentPlannedEventsQuery,
      groupCalendarEventsQuery,
      completedActivitiesQuery,
    ];
    for (const query of paginatedQueries) {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    }
  }, [
    completedActivitiesQuery,
    eventsQueryEnabled,
    groupCalendarEventsQuery,
    recentPlannedEventsQuery,
    upcomingPlannedEventsQuery,
  ]);

  const snapshot = useTrainingPlanSnapshot({
    planId: activePlan?.id,
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
  const observationWindowEnd = planningTodayKey
    ? scheduledWindowEnd < todayKey
      ? scheduledWindowEnd
      : todayKey
    : "";
  const observationWindowStart = planningTodayKey ? scheduledWindowStart : "";
  const dailyTssObservationsQuery = api.activities.dailyTssObservations.useQuery(
    {
      start_date: observationWindowStart,
      end_date: observationWindowEnd,
      timezone: planningTimezone ?? "",
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
      placeholderData: (previousData) => previousData,
    },
  );
  const localProjectionPreview = useMemo(
    () =>
      buildTrainingPreferencesProjectionPreview({
        draft: profileSettings.settings,
        fitnessHistory: dashboard.fitnessHistory,
        snapshot,
      }),
    [dashboard.fitnessHistory, profileSettings.settings, snapshot],
  );
  const projectedLoadTimelinePoints = useMemo(
    () =>
      buildTrainingPreferencesLoadTimeline({
        projectionChart: localProjectionPreview.projectionChart,
        snapshot,
        scheduledEvents: [
          ...planningRecentPlannedEvents,
          ...planningUpcomingPlannedEvents,
          ...planningGroupScheduledActivityPlanEvents,
        ],
        scheduledWindowStart,
        scheduledWindowEnd,
      }),
    [
      localProjectionPreview.projectionChart,
      planningGroupScheduledActivityPlanEvents,
      planningRecentPlannedEvents,
      scheduledWindowEnd,
      scheduledWindowStart,
      snapshot,
      planningUpcomingPlannedEvents,
    ],
  );
  const targetLoadDates = useMemo(
    () =>
      new Set([
        ...(localProjectionPreview.projectionChart?.daily_load_points ?? []).map(
          (point) => point.date,
        ),
        ...(localProjectionPreview.projectionChart?.display_points ?? []).map(
          (point) => point.date,
        ),
      ]),
    [localProjectionPreview.projectionChart],
  );
  const completedObservationMerge = useMemo(
    () =>
      mergeCompletedTssObservations({
        requestedRange: {
          start_date: observationWindowStart,
          end_date: observationWindowEnd,
        },
        response: dailyTssObservationsQuery.data,
        timeline: projectedLoadTimelinePoints,
      }),
    [
      dailyTssObservationsQuery.data,
      observationWindowEnd,
      observationWindowStart,
      projectedLoadTimelinePoints,
    ],
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
  const loadTimelinePoints = useMemo(
    () =>
      completedObservationMerge.timeline.map((point) => {
        const completedObservation = effectiveCompletedObservationsByDate.get(point.date);
        const hasTargetLoad = targetLoadDates.has(point.date);
        return {
          ...point,
          completed_observation_state: completedObservation?.state,
          completed_tss_identity: completedObservation?.identity ?? null,
          has_unavailable_completed_activity:
            completedObservation?.hasUnavailableCompletedActivity === true,
          ideal_tss: hasTargetLoad ? point.ideal_tss : null,
          recommended_load_tss: hasTargetLoad ? point.recommended_load_tss : null,
        };
      }),
    [completedObservationMerge.timeline, effectiveCompletedObservationsByDate, targetLoadDates],
  );
  const idealFitnessCurve = useMemo(
    () =>
      localProjectionPreview.previewIdealCurve.length > 0
        ? localProjectionPreview.previewIdealCurve
        : dashboard.idealFitnessCurve,
    [dashboard.idealFitnessCurve, localProjectionPreview.previewIdealCurve],
  );
  const scheduledFitnessTrend = useMemo(
    () =>
      buildScheduledFitnessTrend({
        fitnessHistory: dashboard.fitnessHistory,
        idealFitnessCurve,
        timeline: loadTimelinePoints,
        todayKey,
        endDate: scheduledWindowEnd,
      }),
    [dashboard.fitnessHistory, idealFitnessCurve, loadTimelinePoints, scheduledWindowEnd, todayKey],
  );
  const canonicalTimelineWindow = useMemo(
    () =>
      buildTrainingTimelineWindowFromLoadTimeline({
        today: todayKey,
        startDate: completedObservationMerge.timeline[0]?.date ?? scheduledWindowStart,
        endDate:
          completedObservationMerge.timeline[completedObservationMerge.timeline.length - 1]?.date ??
          scheduledWindowEnd,
        timeline: completedObservationMerge.timeline,
      }),
    [completedObservationMerge.timeline, scheduledWindowEnd, scheduledWindowStart, todayKey],
  );
  const trainingPath = useTrainingPathViewModel({
    timeline: planningTodayKey ? loadTimelinePoints : [],
    fitnessHistory: planningTodayKey ? dashboard.fitnessHistory : [],
    projectedFitness: planningTodayKey ? scheduledFitnessTrend : [],
    idealFitnessCurve: planningTodayKey ? idealFitnessCurve : [],
    goalMarkers: planningTodayKey ? dashboard.goalMarkers : [],
    selectedWeekStart,
    range: "season",
    weekWindow: trainingPathWindow.resolvedWeekWindow,
    todayKey,
  });
  const dailyTrainingPathPoints = useMemo(
    () =>
      buildDailyTrainingAdjustmentPointsFromTimelineWindow({
        completedObservationsByDate: effectiveCompletedObservationsByDate,
        targetLoadDates,
        timelineWindow: canonicalTimelineWindow,
        fitnessHistory: dashboard.fitnessHistory,
        idealFitnessCurve,
        scheduledFitnessTrend,
      }),
    [
      canonicalTimelineWindow,
      dashboard.fitnessHistory,
      effectiveCompletedObservationsByDate,
      idealFitnessCurve,
      scheduledFitnessTrend,
      targetLoadDates,
    ],
  );

  const selectedWeekRangeStart = trainingPath.selectedWeekSummary?.weekStart ?? null;
  const selectedWeekRangeEnd = trainingPath.selectedWeekSummary?.weekEnd ?? null;
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
      events: [...planningRecentPlannedEvents, ...planningUpcomingPlannedEvents],
      owner: activityOwner,
      planningTimezone,
    });
  }, [activityOwner, planningRecentPlannedEvents, planningTimezone, planningUpcomingPlannedEvents]);
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
    !!pendingSelectedWeekStart &&
    pendingSelectedWeekStart !== trainingPath.selectedWeekSummary?.weekStart;
  const chartLoading =
    !eventsQueryEnabled ||
    activePlanQuery.isLoading ||
    upcomingPlannedEventsQuery.isLoading ||
    recentPlannedEventsQuery.isLoading ||
    dailyTssObservationsQuery.isLoading ||
    profileSettings.isLoading;
  const queryFailureCount =
    [
      activePlanQuery.isError,
      upcomingPlannedEventsQuery.isError,
      recentPlannedEventsQuery.isError,
      groupCalendarEventsQuery.isError,
      selectedGroupActivityPlansQuery.isError,
      completedActivitiesQuery.isError,
      dailyTssObservationsQuery.isError,
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
        dailyTssObservationsQuery.data?.observations.length ||
        goals.goals.length ||
        dailyTrainingPathPoints.length,
    );

  const resetTrainingPathChart = useCallback(() => {
    trainingPathWindow.resetWindow();
    startTransition(() => {
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
      String(dailyTssObservationsQuery.dataUpdatedAt ?? 0),
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
    dailyTssObservationsQuery.dataUpdatedAt,
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
          refetchActivePlan,
          refetchSnapshot: snapshot.refetchAll,
          refetchGoals: goals.refetch,
          refetchUpcomingEvents: upcomingPlannedEventsQuery.refetch,
          refetchRecentEvents: recentPlannedEventsQuery.refetch,
        }),
        groupCalendarEventsQuery.refetch(),
        selectedGroupActivityPlanIds.length > 0
          ? selectedGroupActivityPlansQuery.refetch()
          : Promise.resolve(null),
        completedActivitiesQuery.refetch(),
        dailyTssObservationsQuery.refetch(),
        profileSettings.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    completedActivitiesQuery.refetch,
    dailyTssObservationsQuery.refetch,
    goals.refetch,
    groupCalendarEventsQuery.refetch,
    recentPlannedEventsQuery.refetch,
    refetchActivePlan,
    resetTrainingPathChart,
    selectedGroupActivityPlanIds.length,
    selectedGroupActivityPlansQuery.refetch,
    snapshot.refetchAll,
    upcomingPlannedEventsQuery.refetch,
    profileSettings.refetch,
  ]);

  return {
    refreshing,
    handleRefresh,
    trainingPath,
    dailyTrainingPathPoints: planningTimezoneState === "ready" ? dailyTrainingPathPoints : [],
    chartLoading: planningTimezoneState === "unavailable" || chartLoading,
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
