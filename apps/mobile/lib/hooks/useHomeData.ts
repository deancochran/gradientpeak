import { trpc } from "@/lib/trpc";
import { endOfWeek, format, isToday, startOfWeek } from "date-fns";
import { useMemo } from "react";

/**
 * useHomeData Hook
 *
 * Aggregates data from multiple sources for the home screen dashboard.
 * Provides today's workout, weekly stats, training form status, upcoming workouts,
 * and weekly goal progress.
 */
export function useHomeData() {
  // Get training plan
  const { data: plan, isLoading: planLoading } = trpc.trainingPlans.get.useQuery();

  // Get current training status (CTL, ATL, TSB)
  const { data: status, isLoading: statusLoading } = trpc.trainingPlans.getCurrentStatus.useQuery(
    undefined,
    { enabled: !!plan }
  );

  // Get all planned activities
  const { data: allPlannedActivities, isLoading: activitiesLoading } =
    trpc.plannedActivities.list.useQuery({
      limit: 100,
    });

  // Get weekly activity count
  const { data: weeklyScheduled = 0, isLoading: weekCountLoading } =
    trpc.plannedActivities.getWeekCount.useQuery();

  // Calculate weekly date range
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  // Get weekly summary for stats
  const { data: weeklySummary, isLoading: summaryLoading } =
    trpc.trainingPlans.getWeeklySummary.useQuery(
      {
        training_plan_id: plan?.id ?? "",
        weeks_back: 1,
      },
      {
        enabled: !!plan,
      }
    );

  // Find today's workout
  const todaysWorkout = useMemo(() => {
    if (!allPlannedActivities?.items) return null;

    const today = new Date();
    const todayActivity = allPlannedActivities.items.find((activity) => {
      const activityDate = new Date(activity.scheduled_date);
      return isToday(activityDate);
    });

    if (!todayActivity) return null;

    return {
      id: todayActivity.id,
      type: todayActivity.type || "Workout",
      title: todayActivity.title || "Planned Workout",
      duration: todayActivity.duration_minutes || 0,
      distance: todayActivity.distance_km
        ? parseFloat(todayActivity.distance_km.toFixed(1))
        : 0,
      zone: todayActivity.intensity || "Moderate",
      scheduledTime: todayActivity.scheduled_date,
      description: todayActivity.description,
    };
  }, [allPlannedActivities]);

  // Calculate weekly stats
  const weeklyStats = useMemo(() => {
    if (!weeklySummary || weeklySummary.length === 0) {
      return {
        volume: 0,
        fitness: status?.ctl ?? 0,
        fatigue: status?.atl ?? 0,
        fitnessChange: 0,
        fatigueChange: 0,
      };
    }

    const currentWeek = weeklySummary[0];
    const previousWeek = weeklySummary[1];

    // Calculate changes from previous week
    const fitnessChange = previousWeek
      ? Math.round((status?.ctl ?? 0) - (previousWeek.ending_ctl ?? 0))
      : 0;
    const fatigueChange = previousWeek
      ? Math.round((status?.atl ?? 0) - (previousWeek.ending_atl ?? 0))
      : 0;

    return {
      volume: currentWeek?.total_distance_km ?? 0,
      fitness: Math.round(status?.ctl ?? 0),
      fatigue: Math.round(status?.atl ?? 0),
      fitnessChange,
      fatigueChange,
    };
  }, [weeklySummary, status]);

  // Calculate training form status
  const formStatus = useMemo(() => {
    if (!status) {
      return {
        label: "No Data",
        percentage: 0,
        color: "slate",
        explanation: "Complete activities to see your training form",
      };
    }

    const tsb = status.tsb ?? 0;

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

    // Convert TSB to percentage (map -30 to 30 range to 0-100)
    const percentage = Math.max(0, Math.min(100, ((tsb + 30) / 60) * 100));

    return {
      label,
      percentage: Math.round(percentage),
      color,
      explanation,
      tsb: Math.round(tsb),
      ctl: Math.round(status.ctl ?? 0),
      atl: Math.round(status.atl ?? 0),
    };
  }, [status]);

  // Get upcoming workouts (next 4 days)
  const upcomingWorkouts = useMemo(() => {
    if (!allPlannedActivities?.items) return [];

    const today = new Date();
    const next4Days = allPlannedActivities.items
      .filter((activity) => {
        const activityDate = new Date(activity.scheduled_date);
        const daysDiff = Math.floor((activityDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff <= 3;
      })
      .sort((a, b) =>
        new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
      )
      .slice(0, 4)
      .map((activity) => {
        const activityDate = new Date(activity.scheduled_date);
        const isActivityToday = isToday(activityDate);

        return {
          id: activity.id,
          day: isActivityToday ? "Today" : format(activityDate, "EEEE"),
          type: activity.type || "Workout",
          title: activity.title || "Planned Workout",
          distance: activity.distance_km
            ? parseFloat(activity.distance_km.toFixed(1))
            : 0,
          duration: activity.duration_minutes || 0,
          intensity: activity.intensity || "Moderate",
          status: activity.completed_at ? "completed" : isActivityToday ? "current" : "upcoming",
        };
      });

    return next4Days;
  }, [allPlannedActivities]);

  // Calculate weekly goal progress
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
  }, [weeklySummary, plan]);

  const isLoading =
    planLoading ||
    statusLoading ||
    activitiesLoading ||
    weekCountLoading ||
    summaryLoading;

  return {
    todaysWorkout,
    weeklyStats,
    formStatus,
    upcomingWorkouts,
    weeklyGoal,
    isLoading,
    hasData: !!plan && !!allPlannedActivities,
  };
}
