import { useRouter } from "expo-router";
import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { ErrorBoundary, ScreenErrorFallback } from "@/components/ErrorBoundary";
import { TrainingPathSection } from "@/components/plan/training-path/TrainingPathSection";
import type {
  TrainingPathCompletedActivity,
  TrainingPathScheduledItem,
  TrainingPathSelectedGoal,
  TrainingPathWeekWindow,
} from "@/components/plan/training-path/trainingPathTypes";
import {
  addDays,
  buildScheduledFitnessTrend,
  buildScrollableTrainingPathWindow,
} from "@/components/plan/training-path/trainingPathUtils";
import { useTrainingPathViewModel } from "@/components/plan/training-path/useTrainingPathViewModel";
import { usePlanDashboardViewModel } from "@/components/plan/usePlanDashboardViewModel";
import { AppHeader } from "@/components/shared";
import { api } from "@/lib/api";
import { scheduleAwareReadQueryOptions } from "@/lib/api/scheduleQueryOptions";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
import {
  attachSelectedGroupEventActivityPlans,
  getSelectedGroupEventActivityPlanIds,
  toGroupEventScheduledActivityPlanEvent,
} from "@/lib/calendar/groupEventPlans";
import { ROUTES } from "@/lib/constants/routes";
import { useAuth } from "@/lib/hooks/useAuth";
import { useProfileGoals } from "@/lib/hooks/useProfileGoals";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { usePerformanceScreenReady } from "@/lib/performance";
import { refreshPlanTabData } from "@/lib/scheduling/refreshScheduleViews";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  buildTrainingPreferencesLoadTimeline,
  buildTrainingPreferencesProjectionPreview,
} from "@/lib/training-plan-form/projectionPreview";

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

type ScheduledWeekEvent = {
  id?: string | null;
  event_type?: string | null;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  notes?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  all_day?: boolean | null;
  recurrence_rule?: string | null;
  recurrence?: { rule?: string | null } | null;
  series_id?: string | null;
  scheduled_date?: string | null;
  linked_activity_id?: string | null;
  training_plan_id?: string | null;
  completed?: boolean | null;
  status?: string | null;
  activity_plan?: {
    id?: string | null;
    name?: string | null;
    title?: string | null;
    activity_category?: string | null;
    description?: string | null;
    notes?: string | null;
    estimated_tss?: number | null;
    authoritative_metrics?: {
      estimated_duration?: number | null;
      estimated_tss?: number | null;
      intensity_factor?: number | null;
      estimated_distance?: number | null;
    } | null;
  } | null;
};

type CompletedWeekActivity = {
  id: string;
  profile_id?: string | null;
  name?: string | null;
  started_at?: string | Date | null;
  derived?: {
    tss?: number | null;
    stress?: {
      tss?: number | null;
    } | null;
  } | null;
};

type ActivityOwner = {
  id?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

function getScheduledEventDate(event: ScheduledWeekEvent) {
  return event.scheduled_date ?? event.starts_at?.split("T")[0] ?? null;
}

function getScheduledEventTitle(event: ScheduledWeekEvent) {
  return (
    event.activity_plan?.name ??
    event.activity_plan?.title ??
    event.title ??
    event.name ??
    "Scheduled session"
  );
}

function getScheduledEventLoad(event: ScheduledWeekEvent) {
  return (
    event.activity_plan?.authoritative_metrics?.estimated_tss ??
    event.activity_plan?.estimated_tss ??
    null
  );
}

function toTrainingPathScheduledItem(
  event: ScheduledWeekEvent,
  index: number,
): TrainingPathScheduledItem | null {
  const date = getScheduledEventDate(event);
  if (!date) return null;
  return {
    id: event.id ?? `${date}-${index}`,
    title: getScheduledEventTitle(event),
    date,
    estimatedLoad: getScheduledEventLoad(event),
    activityPlanId: event.activity_plan?.id ?? null,
    event: {
      id: event.id ?? `${date}-${index}`,
      event_type: event.event_type,
      title: event.title ?? event.name ?? null,
      description: event.description,
      notes: event.notes,
      scheduled_date: event.scheduled_date,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      all_day: event.all_day,
      recurrence_rule: event.recurrence_rule,
      recurrence: event.recurrence,
      series_id: event.series_id,
      linked_activity_id: event.linked_activity_id,
      training_plan_id: event.training_plan_id,
      completed: event.completed,
      status: event.status,
      activity_plan: event.activity_plan,
    },
    activityPlan: event.activity_plan?.id
      ? {
          id: event.activity_plan.id,
          name: getScheduledEventTitle(event),
          activity_category: event.activity_plan.activity_category ?? "other",
          description: event.activity_plan.description,
          notes: event.activity_plan.notes,
          authoritative_metrics: event.activity_plan.authoritative_metrics,
        }
      : null,
    plannedActivity: event.activity_plan?.id
      ? {
          id: event.id ?? `${date}-${index}`,
          activity_plan_id: event.activity_plan.id,
          scheduled_date: event.starts_at ?? event.scheduled_date ?? date,
          activity_plan: {
            id: event.activity_plan.id,
            name: getScheduledEventTitle(event),
            activity_category: event.activity_plan.activity_category ?? "other",
            description: event.activity_plan.description,
            notes: event.activity_plan.notes,
            authoritative_metrics: event.activity_plan.authoritative_metrics,
          },
        }
      : null,
  };
}

function getCompletedActivityDate(activity: CompletedWeekActivity) {
  if (!activity.started_at) return null;
  const value =
    activity.started_at instanceof Date ? activity.started_at.toISOString() : activity.started_at;
  return value.split("T")[0] ?? null;
}

function toTrainingPathCompletedActivity(
  activity: CompletedWeekActivity,
  owner: ActivityOwner | null,
): TrainingPathCompletedActivity | null {
  const date = getCompletedActivityDate(activity);
  if (!date) return null;
  return {
    id: activity.id,
    title: activity.name?.trim() || "Completed activity",
    date,
    load: activity.derived?.stress?.tss ?? activity.derived?.tss ?? null,
    activity: owner ? { ...activity, profile: owner } : activity,
  };
}

function PlanDashboardScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();
  usePerformanceScreenReady("route-plan");
  const [refreshing, setRefreshing] = useState(false);
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
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
  const [trainingPathWindow, setTrainingPathWindow] = useState<TrainingPathWeekWindow | null>(null);

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
      include_adhoc: false,
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
      include_adhoc: false,
      date_from: recentWindowStart,
      date_to: todayKey,
      limit: 500,
    },
    scheduleAwareReadQueryOptions,
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
  const groupScheduledActivityPlanEvents = useMemo(
    () =>
      attachSelectedGroupEventActivityPlans(
        groupCalendarEvents,
        selectedGroupActivityPlansQuery.data?.items ?? [],
      )
        .map(toGroupEventScheduledActivityPlanEvent)
        .filter(isPresent),
    [groupCalendarEvents, selectedGroupActivityPlansQuery.data?.items],
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
  const lastProjectionRefreshKeyRef = useRef<string | null>(null);
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
  const initialTrainingPathWindow = useMemo(
    () => buildScrollableTrainingPathWindow({ goalMarkers: dashboard.goalMarkers, todayKey }),
    [dashboard.goalMarkers, todayKey],
  );

  useEffect(() => {
    setTrainingPathWindow(initialTrainingPathWindow);
  }, [initialTrainingPathWindow]);

  const resolvedTrainingPathWindow = trainingPathWindow ?? initialTrainingPathWindow;
  const trainingPath = useTrainingPathViewModel({
    timeline: loadTimelinePoints,
    fitnessHistory: dashboard.fitnessHistory,
    projectedFitness: scheduledFitnessTrend,
    idealFitnessCurve,
    goalMarkers: dashboard.goalMarkers,
    selectedWeekStart,
    range: "season",
    weekWindow: resolvedTrainingPathWindow,
    todayKey,
  });
  const selectedWeekRangeStart = trainingPath.selectedWeekSummary?.weekStart ?? null;
  const selectedWeekRangeEnd = trainingPath.selectedWeekSummary?.weekEnd ?? null;
  const activityOwner = useMemo(
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
  const scheduledReviewItems = useMemo<TrainingPathScheduledItem[]>(() => {
    const scheduledEvents = [
      ...(recentPlannedEventsQuery.data?.items ?? []),
      ...(upcomingPlannedEventsQuery.data?.items ?? []),
    ]
      .map(toTrainingPathScheduledItem)
      .filter(isPresent);
    const groupEvents = groupCalendarEvents
      .filter(
        (event) =>
          event.viewerRsvp?.status !== "declined" && event.viewerSeriesRsvp?.status !== "declined",
      )
      .map((event, index) => {
        const date = event.starts_at.split("T")[0] ?? null;
        if (!date) return null;
        return {
          id: event.id ?? `${date}-group-${index}`,
          title: event.title ?? "Group event",
          date,
          groupEvent: event,
        } satisfies TrainingPathScheduledItem;
      })
      .filter(isPresent);

    return [...scheduledEvents, ...groupEvents].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
  }, [
    groupCalendarEvents,
    recentPlannedEventsQuery.data?.items,
    upcomingPlannedEventsQuery.data?.items,
  ]);
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
    return dashboard.goalReadiness
      .filter(
        (item) =>
          !!item.goal.target_date &&
          item.goal.target_date >= selectedWeekRangeStart &&
          item.goal.target_date <= selectedWeekRangeEnd,
      )
      .map((item) => ({
        id: item.goal.id,
        label: item.goal.title,
        targetDate: item.goal.target_date!,
        status: item.status,
        readinessPercent: item.readinessPercent,
        readinessTarget: item.readinessTarget,
      }));
  }, [dashboard.goalReadiness, selectedWeekRangeEnd, selectedWeekRangeStart]);
  const selectedWeekScheduledItems = useMemo<TrainingPathScheduledItem[]>(() => {
    if (!selectedWeekRangeStart || !selectedWeekRangeEnd) return [];
    return scheduledReviewItems.filter(
      (item) => item.date >= selectedWeekRangeStart && item.date <= selectedWeekRangeEnd,
    );
  }, [scheduledReviewItems, selectedWeekRangeEnd, selectedWeekRangeStart]);
  const selectedWeekCompletedActivities = useMemo<TrainingPathCompletedActivity[]>(() => {
    if (!selectedWeekRangeStart || !selectedWeekRangeEnd) return [];
    return completedReviewActivities.filter(
      (activity) =>
        activity.date >= selectedWeekRangeStart && activity.date <= selectedWeekRangeEnd,
    );
  }, [completedReviewActivities, selectedWeekRangeEnd, selectedWeekRangeStart]);

  const extendTrainingPathWindowStart = useCallback(() => {
    startTransition(() => {
      setTrainingPathWindow((current) => {
        const window = current ?? initialTrainingPathWindow;
        return { ...window, start: addDays(window.start, -56) };
      });
    });
  }, [initialTrainingPathWindow]);

  const extendTrainingPathWindowEnd = useCallback(() => {
    startTransition(() => {
      setTrainingPathWindow((current) => {
        const window = current ?? initialTrainingPathWindow;
        return { ...window, end: addDays(window.end, 56) };
      });
    });
  }, [initialTrainingPathWindow]);

  const resetTrainingPathChart = useCallback(() => {
    startTransition(() => {
      setTrainingPathWindow(initialTrainingPathWindow);
      setSelectedWeekStart(null);
    });
  }, [initialTrainingPathWindow]);

  const handleSelectedWeekChange = useCallback((weekStart: string) => {
    startTransition(() => {
      setSelectedWeekStart(weekStart);
    });
  }, []);

  const navigateToActivity = useCallback(
    (activityId: string) =>
      router.navigate({ pathname: "/activity-detail", params: { id: activityId } } as never),
    [router],
  );
  const navigateToActivityPlan = useCallback(
    (activityPlanId: string) =>
      router.navigate({
        pathname: "/activity-plan-detail",
        params: { id: activityPlanId },
      } as never),
    [router],
  );
  const navigateToGoal = useCallback(
    (goalId: string) =>
      router.navigate({ pathname: "/goal-detail", params: { id: goalId } } as never),
    [router],
  );
  const navigateToGroupEvent = useCallback(
    (eventId: string) =>
      router.navigate({
        pathname: "/group-event-detail",
        params: { groupEventId: eventId },
      } as never),
    [router],
  );
  const navigateToScheduledEvent = useCallback(
    (eventId: string) =>
      router.navigate({ pathname: "/event-detail", params: { id: eventId } } as never),
    [router],
  );
  const navigateToTrainingPreferences = useCallback(
    () => router.navigate(ROUTES.PLAN.TRAINING_PREFERENCES as never),
    [router],
  );
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

    if (lastProjectionRefreshKeyRef.current === refreshKey) {
      return;
    }

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

  const handleRefresh = async () => {
    setRefreshing(true);
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
    setRefreshing(false);
  };

  return (
    <View className="flex-1 bg-background" testID="plan-screen">
      <AppHeader title="Plan" />
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View className="gap-5 px-2 pb-6 pt-3">
          <TrainingPathSection
            model={trainingPath}
            selectedWeekGoals={selectedWeekGoals}
            selectedWeekScheduledItems={selectedWeekScheduledItems}
            selectedWeekCompletedActivities={selectedWeekCompletedActivities}
            onResetChart={resetTrainingPathChart}
            onScrollNearEnd={extendTrainingPathWindowEnd}
            onScrollNearStart={extendTrainingPathWindowStart}
            onOpenActivity={navigateToActivity}
            onOpenActivityPlan={navigateToActivityPlan}
            onOpenGoal={navigateToGoal}
            onOpenGroupEvent={navigateToGroupEvent}
            onOpenScheduledEvent={navigateToScheduledEvent}
            onOpenSettings={navigateToTrainingPreferences}
            onSelectedWeekChange={handleSelectedWeekChange}
          />
        </View>
      </ScrollView>
    </View>
  );
}

export default function PlanDashboardWithBoundary() {
  return (
    <ErrorBoundary fallback={ScreenErrorFallback}>
      <PlanDashboardScreen />
    </ErrorBoundary>
  );
}
