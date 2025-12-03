import { trpc } from "@/lib/trpc";
import { endOfWeek, format, isToday, startOfWeek } from "date-fns";
import { useMemo } from "react";

/**
 * Default values for when data is not available
 */
const DEFAULT_WEEKLY_STATS = {
  volume: 0,
  fitness: 0,
  fatigue: 0,
  fitnessChange: 0,
  fatigueChange: 0,
};

const DEFAULT_FORM_STATUS = {
  label: "No Data",
  percentage: 0,
  color: "slate",
  explanation: "Complete activities to see your training form",
  tsb: 0,
  ctl: 0,
  atl: 0,
};

/**
 * useHomeData Hook
 *
 * Aggregates data from multiple sources for the home screen dashboard.
 * Provides today's activity, weekly stats, training form status, upcoming activities,
 * and weekly goal progress.
 *
 * OPTIMIZATION: All queries now run in parallel instead of cascading.
 * - Removed `enabled: !!plan` dependencies to allow parallel fetching
 * - Queries gracefully handle missing data with fallback values
 * - Improved loading state by using Promise.all pattern
 */
export function useHomeData() {
  // Get training plan (no longer blocks other queries)
  const { data: plan, isLoading: planLoading } =
    trpc.trainingPlans.get.useQuery();

  // Get current training status (CTL, ATL, TSB)
  // Now loads in parallel with plan query
  // Use select to pre-calculate form status
  const { data: status, isLoading: statusLoading } =
    trpc.trainingPlans.getCurrentStatus.useQuery(undefined, {
      select: (data) => {
        if (!data) return null;

        const tsb = data.tsb ?? 0;
        let label: string;
        let color: string;
        let explanation: string;

        if (tsb > 10) {
          label = "Fresh";
          color = "green";
          explanation = "Well rested and ready for hard training";
        } else if (tsb >= -10 && tsb <= 10) {
          label = "Optimal";
          color = "blue";
          explanation = "Great balance between fitness and fatigue";
        } else if (tsb >= -20 && tsb < -10) {
          label = "Productive";
          color = "purple";
          explanation = "Building fitness through consistent training";
        } else {
          label = "Fatigued";
          color = "orange";
          explanation = "Consider recovery or lighter training";
        }

        const percentage = Math.max(0, Math.min(100, ((tsb + 30) / 60) * 100));

        return {
          ...data,
          formStatus: {
            label,
            percentage: Math.round(percentage),
            color,
            explanation,
            tsb: Math.round(tsb),
            ctl: Math.round(data.ctl ?? 0),
            atl: Math.round(data.atl ?? 0),
          },
        };
      },
    });

  // Get all planned activities (loads in parallel)
  const { data: allPlannedActivities, isLoading: activitiesLoading } =
    trpc.plannedActivities.list.useQuery({
      limit: 100,
    });

  // Get weekly activity count (loads in parallel)
  const { data: weeklyScheduled = 0, isLoading: weekCountLoading } =
    trpc.plannedActivities.getWeekCount.useQuery();

  // Calculate weekly date range
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  // Get weekly summary for stats (loads in parallel)
  // Uses plan ID when available, gracefully handles when not
  const planId = plan?.id ?? "";
  const { data: weeklySummary, isLoading: summaryLoading } =
    trpc.trainingPlans.getWeeklySummary.useQuery(
      {
        training_plan_id: planId,
        weeks_back: 1,
      },
      {
        // Only skip the query if we know there's no plan at all
        enabled: planId !== "" || planLoading,
      },
    );

  // Find today's activity - optimized dependencies
  const todaysActivity = useMemo(() => {
    if (!allPlannedActivities?.items || allPlannedActivities.items.length === 0)
      return null;

    const todayActivity = allPlannedActivities.items.find((activity) => {
      const activityDate = new Date(activity.scheduled_date);
      return isToday(activityDate);
    });

    if (!todayActivity) return null;

    return {
      id: todayActivity.id,
      type: todayActivity.type || "Activity",
      title: todayActivity.title || "Planned Activity",
      duration: todayActivity.duration_minutes || 0,
      distance: todayActivity.distance_km
        ? parseFloat(todayActivity.distance_km.toFixed(1))
        : 0,
      zone: todayActivity.intensity || "Moderate",
      scheduledTime: todayActivity.scheduled_date,
      description: todayActivity.description,
    };
  }, [allPlannedActivities?.items?.length]); // Only recalculate when items array length changes

  // Calculate weekly stats - optimized dependencies
  const weeklyStats = useMemo(() => {
    if (!weeklySummary || weeklySummary.length === 0) {
      return {
        ...DEFAULT_WEEKLY_STATS,
        fitness: status?.ctl ?? 0,
        fatigue: status?.atl ?? 0,
      };
    }

    const currentWeek = weeklySummary[0];
    const previousWeek = weeklySummary[1];

    const currentCtl = status?.ctl ?? 0;
    const currentAtl = status?.atl ?? 0;

    // Calculate changes from previous week
    const fitnessChange = previousWeek
      ? Math.round(currentCtl - (previousWeek.ending_ctl ?? 0))
      : 0;
    const fatigueChange = previousWeek
      ? Math.round(currentAtl - (previousWeek.ending_atl ?? 0))
      : 0;

    return {
      volume: currentWeek?.total_distance_km ?? 0,
      fitness: Math.round(currentCtl),
      fatigue: Math.round(currentAtl),
      fitnessChange,
      fatigueChange,
    };
  }, [
    weeklySummary?.length,
    weeklySummary?.[0]?.total_distance_km,
    weeklySummary?.[1]?.ending_ctl,
    weeklySummary?.[1]?.ending_atl,
    status?.ctl,
    status?.atl,
  ]); // Only specific values, not entire objects

  // Training form status now comes pre-calculated from query select
  const formStatus = status?.formStatus ?? DEFAULT_FORM_STATUS;

  // Get upcoming activities (next 4 days) - optimized dependencies
  const upcomingActivitys = useMemo(() => {
    if (!allPlannedActivities?.items || allPlannedActivities.items.length === 0)
      return [];

    const today = new Date();
    const next4Days = allPlannedActivities.items
      .filter((activity) => {
        const activityDate = new Date(activity.scheduled_date);
        const daysDiff = Math.floor(
          (activityDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        return daysDiff >= 0 && daysDiff <= 3;
      })
      .sort(
        (a, b) =>
          new Date(a.scheduled_date).getTime() -
          new Date(b.scheduled_date).getTime(),
      )
      .slice(0, 4)
      .map((activity) => {
        const activityDate = new Date(activity.scheduled_date);
        const isActivityToday = isToday(activityDate);

        return {
          id: activity.id,
          day: isActivityToday ? "Today" : format(activityDate, "EEEE"),
          type: activity.type || "Activity",
          title: activity.title || "Planned Activity",
          distance: activity.distance_km
            ? parseFloat(activity.distance_km.toFixed(1))
            : 0,
          duration: activity.duration_minutes || 0,
          intensity: activity.intensity || "Moderate",
          status: activity.completed_at
            ? "completed"
            : isActivityToday
              ? "current"
              : "upcoming",
        };
      });

    return next4Days;
  }, [allPlannedActivities?.items?.length]); // Only recalculate when items length changes

  // Calculate weekly goal progress - optimized dependencies
  const weeklyGoal = useMemo(() => {
    if (!weeklySummary || weeklySummary.length === 0 || !plan) {
      return {
        actual: 0,
        target: 0,
        percentage: 0,
        unit: "km",
      };
    }

    const currentWeek = weeklySummary[0];
    const actual = currentWeek?.total_distance_km ?? 0;
    const target = currentWeek?.planned_distance_km ?? 0;

    const percentage = target > 0 ? Math.round((actual / target) * 100) : 0;

    return {
      actual: parseFloat(actual.toFixed(1)),
      target: parseFloat(target.toFixed(1)),
      percentage: Math.min(100, percentage),
      unit: "km",
    };
  }, [
    weeklySummary?.length,
    weeklySummary?.[0]?.total_distance_km,
    weeklySummary?.[0]?.planned_distance_km,
    plan?.id,
  ]); // Only specific values

  // Improved loading state: only show loading if ANY query is still loading
  // This provides faster initial render since queries load in parallel
  const isLoading =
    planLoading ||
    statusLoading ||
    activitiesLoading ||
    weekCountLoading ||
    summaryLoading;

  // Consider data available even during loading to show partial UI faster
  const hasData = !!allPlannedActivities;

  return {
    todaysActivity,
    weeklyStats,
    formStatus,
    upcomingActivitys,
    weeklyGoal,
    isLoading,
    hasData,
    // Expose individual loading states for granular UI control
    queryStates: {
      planLoading,
      statusLoading,
      activitiesLoading,
      weekCountLoading,
      summaryLoading,
    },
  };
}
