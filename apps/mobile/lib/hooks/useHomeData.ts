import { trpc } from "@/lib/trpc";
import { format, isToday } from "date-fns";
import { useMemo } from "react";

/**
 * useHomeData Hook - Simplified for MVP
 *
 * Uses the new home.getDashboard endpoint which combines multiple queries
 * into a single optimized call. This provides:
 * - Today's activity
 * - Upcoming activities (next 4 days)
 * - Basic 30-day stats
 * - Training plan info
 */
export function useHomeData() {
  // Single optimized query for all home screen data
  const { data, isLoading, refetch } = trpc.home.getDashboard.useQuery({
    days: 4,
  });

  // Transform today's activity for the UI
  const todaysActivity = useMemo(() => {
    if (!data?.todaysActivity) return null;

    const activity = data.todaysActivity;
    const plan = activity.activity_plan as any; // Type includes dynamic estimation fields
    return {
      id: activity.id,
      type: plan?.activity_category || "Activity",
      title: plan?.name || "Planned Activity",
      duration: plan?.estimated_duration || 0,
      distance: plan?.estimated_distance
        ? parseFloat(plan.estimated_distance.toFixed(1))
        : 0,
      zone: "Moderate", // Intensity is determined after completion, not before
      scheduledTime: activity.scheduled_date,
      description: plan?.description,
    };
  }, [data?.todaysActivity]);

  // Transform upcoming activities for the UI
  const upcomingActivitys = useMemo(() => {
    if (!data?.upcomingActivities?.length) return [];

    return data.upcomingActivities.map((activity) => {
      const activityDate = new Date(activity.scheduled_date);
      const isActivityToday = isToday(activityDate);
      const plan = activity.activity_plan as any; // Type includes dynamic estimation fields

      return {
        id: activity.id,
        day: isActivityToday ? "Today" : format(activityDate, "EEEE"),
        type: plan?.activity_category || "Activity",
        title: plan?.name || "Planned Activity",
        distance: plan?.estimated_distance
          ? parseFloat(plan.estimated_distance.toFixed(1))
          : 0,
        duration: plan?.estimated_duration || 0,
        intensity: "Moderate", // Intensity is determined after completion
        status: "upcoming" as const,
      };
    });
  }, [data?.upcomingActivities]);

  // Simple weekly stats (using 30-day data)
  const weeklyStats = useMemo(() => {
    if (!data?.stats) {
      return {
        volume: 0,
        activitiesCompleted: 0,
        totalTSS: 0,
        daysActive: 0,
      };
    }

    return {
      volume: parseFloat(data.stats.totalDistance.toFixed(1)),
      activitiesCompleted: data.stats.totalActivities,
      totalTSS: data.stats.totalTSS,
      daysActive: data.stats.daysActive,
    };
  }, [data?.stats]);

  // Simplified form status - for MVP, just show if they have recent activity
  const formStatus = useMemo(() => {
    if (!data?.stats?.totalActivities) {
      return {
        label: "No Data",
        percentage: 0,
        color: "slate",
        explanation: "Complete activities to see your training progress",
        ctl: 0,
        atl: 0,
        tsb: 0,
      };
    }

    const daysActive = data.stats.daysActive;
    const avgTSSPerDay = data.stats.avgTSSPerDay;

    // Simple heuristic: 3-5 active days per week is optimal
    if (daysActive >= 12) {
      // ~3+ days/week over 30 days
      return {
        label: "Active",
        percentage: 80,
        color: "green",
        explanation: `${daysActive} active days in the last month`,
        ctl: 0,
        atl: 0,
        tsb: 0,
      };
    } else if (daysActive >= 8) {
      return {
        label: "Moderate",
        percentage: 60,
        color: "blue",
        explanation: `${daysActive} active days in the last month`,
        ctl: 0,
        atl: 0,
        tsb: 0,
      };
    } else if (daysActive >= 4) {
      return {
        label: "Light",
        percentage: 40,
        color: "purple",
        explanation: `${daysActive} active days in the last month`,
        ctl: 0,
        atl: 0,
        tsb: 0,
      };
    } else {
      return {
        label: "Getting Started",
        percentage: 20,
        color: "orange",
        explanation: `${daysActive} active days in the last month`,
        ctl: 0,
        atl: 0,
        tsb: 0,
      };
    }
  }, [data?.stats]);

  // Simplified weekly goal - based on current week's TSS
  const weeklyGoal = useMemo(() => {
    if (!data?.stats?.totalTSS) {
      return {
        actual: 0,
        target: 0,
        percentage: 0,
        unit: "TSS",
      };
    }

    // For MVP: show weekly average from 30-day stats
    const weeklyAverage = Math.round((data.stats.totalTSS / 30) * 7);

    return {
      actual: weeklyAverage,
      target: 0, // Will be set when user creates a structured plan
      percentage: 100, // Always 100% for now since we're just showing average
      unit: "TSS/week avg",
    };
  }, [data?.stats]);

  const hasData = !!(
    data?.plan ||
    data?.todaysActivity ||
    data?.upcomingActivities?.length
  );

  return {
    todaysActivity,
    weeklyStats,
    formStatus,
    upcomingActivitys,
    weeklyGoal,
    isLoading,
    hasData,
    refetch,
  };
}
