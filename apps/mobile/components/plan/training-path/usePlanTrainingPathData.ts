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
  buildTrainingPreferencesLoadTimeline,
  buildTrainingPreferencesProjectionPreview,
} from "@/lib/training-plan-form/projectionPreview";
import { usePlanDashboardViewModel } from "../usePlanDashboardViewModel";
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
import { buildScheduledFitnessTrend } from "./trainingPathUtils";
import { useScrollableTrainingPathWindow } from "./useScrollableTrainingPathWindow";
import { useTrainingPathViewModel } from "./useTrainingPathViewModel";

function getDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function getDayStartIso(dateKey: string) {
  return `${dateKey}T00:00:00.000Z`;
}

function getDayEndIso(dateKey: string) {
  return `${dateKey}T23:59:59.999Z`;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

export function usePlanTrainingPathData() {
  const { profile, user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [pendingSelectedWeekStart, setPendingSelectedWeekStart] = useState<string | null>(null);
  const lastProjectionRefreshKeyRef = useRef<string | null>(null);
  const eventsQueryEnabled = useAuthStore(
    (state) => state.ready && !!state.session && hasSessionAuthCredentials(),
  );

  const { data: activePlan, refetch: refetchActivePlan } = api.trainingPlans.getActivePlan.useQuery(
    undefined,
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
    },
  );
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => getDateKey(today), [today]);
  const recentWindowStart = useMemo(() => {
    const start = new Date(today);
    start.setDate(start.getDate() - 45);
    return getDateKey(start);
  }, [today]);
  const upcomingWindowEnd = useMemo(() => {
    const end = new Date(today);
    end.setDate(end.getDate() + 365);
    return getDateKey(end);
  }, [today]);

  const upcomingPlannedEventsQuery = api.events.list.useQuery(
    {
      include_adhoc: true,
      date_from: todayKey,
      date_to: upcomingWindowEnd,
      limit: 100,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
    },
  );
  const recentPlannedEventsQuery = api.events.list.useQuery(
    {
      include_adhoc: true,
      date_from: recentWindowStart,
      date_to: todayKey,
      limit: 500,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
    },
  );
  const groupCalendarEventsQuery = api.groups.events.myUpcomingGroupEvents.useQuery(
    {
      includeCancelled: false,
      startsAfter: `${recentWindowStart}T00:00:00.000Z`,
      startsBefore: `${upcomingWindowEnd}T23:59:59.999Z`,
      limit: 100,
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
    },
  );
  const groupCalendarEvents = useMemo(
    () => groupCalendarEventsQuery.data?.items ?? [],
    [groupCalendarEventsQuery.data?.items],
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
  const completedActivitiesQuery = api.activities.list.useQuery(
    {
      date_from: getDayStartIso(recentWindowStart),
      date_to: getDayEndIso(todayKey),
    },
    {
      ...scheduleAwareReadQueryOptions,
      enabled: eventsQueryEnabled,
    },
  );

  const snapshot = useTrainingPlanSnapshot({
    planId: activePlan?.id,
    includeStatus: false,
    includeWeeklySummaries: false,
    curveWindow: "overview",
  });
  const goals = useProfileGoals({ loadAllPages: true });
  const profileSettings = useProfileSettings();
  const dashboard = usePlanDashboardViewModel({
    activePlan,
    goals,
    profileSettings: profileSettings.settings,
    snapshot,
    upcomingPlannedEvents: upcomingPlannedEventsQuery.data?.items,
    recentPlannedEvents: recentPlannedEventsQuery.data?.items,
    today,
  });
  const localProjectionPreview = useMemo(
    () =>
      buildTrainingPreferencesProjectionPreview({
        draft: profileSettings.settings,
        fitnessHistory: dashboard.fitnessHistory,
        snapshot,
      }),
    [dashboard.fitnessHistory, profileSettings.settings, snapshot],
  );
  const loadTimelinePoints = useMemo(
    () =>
      buildTrainingPreferencesLoadTimeline({
        projectionChart: localProjectionPreview.projectionChart,
        snapshot,
        scheduledEvents: [
          ...(recentPlannedEventsQuery.data?.items ?? []),
          ...(upcomingPlannedEventsQuery.data?.items ?? []),
          ...groupScheduledActivityPlanEvents,
        ],
        scheduledWindowStart: recentWindowStart,
        scheduledWindowEnd: upcomingWindowEnd,
      }),
    [
      localProjectionPreview.projectionChart,
      groupScheduledActivityPlanEvents,
      recentPlannedEventsQuery.data?.items,
      recentWindowStart,
      snapshot,
      upcomingPlannedEventsQuery.data?.items,
      upcomingWindowEnd,
    ],
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
      }),
    [dashboard.fitnessHistory, idealFitnessCurve, loadTimelinePoints, todayKey],
  );
  const trainingPathWindow = useScrollableTrainingPathWindow({
    goalMarkers: dashboard.goalMarkers,
    todayKey,
  });
  const trainingPath = useTrainingPathViewModel({
    timeline: loadTimelinePoints,
    fitnessHistory: dashboard.fitnessHistory,
    projectedFitness: scheduledFitnessTrend,
    idealFitnessCurve,
    goalMarkers: dashboard.goalMarkers,
    selectedWeekStart,
    range: "season",
    weekWindow: trainingPathWindow.resolvedWeekWindow,
    todayKey,
  });

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
      events: [
        ...(recentPlannedEventsQuery.data?.items ?? []),
        ...(upcomingPlannedEventsQuery.data?.items ?? []),
      ],
      owner: activityOwner,
    });
  }, [activityOwner, recentPlannedEventsQuery.data?.items, upcomingPlannedEventsQuery.data?.items]);
  const groupEventReviewItems = useMemo<TrainingPathScheduledItem[]>(() => {
    return buildTrainingPathGroupEventReviewItems({
      groupEvents: groupCalendarEventsWithActivityPlans,
    });
  }, [groupCalendarEventsWithActivityPlans]);
  const completedReviewActivities = useMemo<TrainingPathCompletedActivity[]>(
    () =>
      (completedActivitiesQuery.data ?? [])
        .map((activity) => toTrainingPathCompletedActivity(activity, activityOwner))
        .filter(isPresent)
        .sort((left, right) => left.date.localeCompare(right.date)),
    [activityOwner, completedActivitiesQuery.data],
  );
  const selectedWeekGoals = useMemo<TrainingPathSelectedGoal[]>(() => {
    if (!selectedWeekRangeStart || !selectedWeekRangeEnd) return [];
    return dashboard.goalReadiness.flatMap((item) => {
      const targetDate = item.goal.target_date;
      if (!targetDate || targetDate < selectedWeekRangeStart || targetDate > selectedWeekRangeEnd) {
        return [];
      }

      return [
        {
          id: item.goal.id,
          label: item.goal.title,
          targetDate,
          status: item.status,
          readinessPercent: item.readinessPercent,
          readinessTarget: item.readinessTarget,
        },
      ];
    });
  }, [dashboard.goalReadiness, selectedWeekRangeEnd, selectedWeekRangeStart]);
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
      activePlan?.id ?? "",
      String(upcomingPlannedEventsQuery.dataUpdatedAt ?? 0),
      String(recentPlannedEventsQuery.dataUpdatedAt ?? 0),
      String(groupCalendarEventsQuery.dataUpdatedAt ?? 0),
      String(selectedGroupActivityPlansQuery.dataUpdatedAt ?? 0),
      String(completedActivitiesQuery.dataUpdatedAt ?? 0),
      String(goals.dataUpdatedAt ?? 0),
    ].join(":");

    if (!activePlan?.id) {
      lastProjectionRefreshKeyRef.current = refreshKey;
      return;
    }
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
    activePlan?.id,
    completedActivitiesQuery.dataUpdatedAt,
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
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    completedActivitiesQuery.refetch,
    goals.refetch,
    groupCalendarEventsQuery.refetch,
    recentPlannedEventsQuery.refetch,
    refetchActivePlan,
    resetTrainingPathChart,
    selectedGroupActivityPlanIds.length,
    selectedGroupActivityPlansQuery.refetch,
    snapshot.refetchAll,
    upcomingPlannedEventsQuery.refetch,
  ]);

  return {
    refreshing,
    handleRefresh,
    trainingPath,
    selectedWeekGoals,
    selectedWeekEvents,
    selectedWeekGroupEvents,
    selectedWeekCompletedActivities,
    selectedWeekLoading,
    extendTrainingPathWindowEnd: trainingPathWindow.extendWindowEnd,
    extendTrainingPathWindowStart: trainingPathWindow.extendWindowStart,
    handleSelectedWeekChange,
    handleWeekScrollStart,
  };
}
