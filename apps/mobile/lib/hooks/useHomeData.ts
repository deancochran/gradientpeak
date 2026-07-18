import { useMemo } from "react";
import { api } from "@/lib/api";
import { useProfileGoals } from "./useProfileGoals";
import { useProfileSettings } from "./useProfileSettings";

export interface LoadBalanceContext {
  status: "unknown" | "more_recent_load" | "balanced" | "less_recent_load";
  label: string;
  description: string;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
}

export function deriveLoadBalanceContext(
  currentStatus?: { ctl?: number | null; atl?: number | null; tsb?: number | null } | null,
): LoadBalanceContext {
  const ctl = currentStatus?.ctl ?? null;
  const atl = currentStatus?.atl ?? null;
  const tsb = currentStatus?.tsb ?? null;

  if (ctl === null || atl === null || tsb === null) {
    return {
      status: "unknown",
      label: "Unknown",
      description: "Training load balance is unavailable until load history is available.",
      ctl,
      atl,
      tsb,
    };
  }

  if (tsb < -15) {
    return {
      status: "more_recent_load",
      label: "Recent load is higher",
      description: "Recent training load is above your longer-term load trend.",
      ctl,
      atl,
      tsb,
    };
  }

  if (tsb > 15) {
    return {
      status: "less_recent_load",
      label: "Recent load is lower",
      description: "Recent training load is below your longer-term load trend.",
      ctl,
      atl,
      tsb,
    };
  }

  return {
    status: "balanced",
    label: "Loads are similar",
    description: "Recent and longer-term training load are in a similar range.",
    ctl,
    atl,
    tsb,
  };
}

/**
 * useHomeData Hook
 *
 * Consumes the consolidated home.getDashboard endpoint.
 * Adapted to provide data for the Home Screen UI.
 */
export function useHomeData() {
  const { data, isLoading, refetch } = api.home.getDashboard.useQuery({
    days: 7,
  });
  const profileGoals = useProfileGoals({ loadAllPages: true });
  const profileSettings = useProfileSettings();

  const plan = useMemo(() => data?.activePlan, [data?.activePlan]);

  // Transform today's activity for the UI
  const todaysActivity = useMemo(() => {
    if (!data?.todaysActivity) return null;

    const activity = data.todaysActivity;
    return {
      id: activity.id,
      type: activity.activityType || "Activity",
      title: activity.activityName || "Planned Activity",
      duration: activity.estimatedDuration || 0,
      distance: activity.estimatedDistance
        ? parseFloat((activity.estimatedDistance / 1000).toFixed(1)) // Convert meters to km
        : 0,
      zone: "Moderate",
      scheduledTime: activity.date,
      description: "",
    };
  }, [data?.todaysActivity]);

  // Weekly stats
  const weeklyStats = useMemo(() => {
    if (!data?.weeklySummary) {
      return {
        volume: 0,
        activitiesCompleted: 0,
        totalTSS: 0,
      };
    }

    return {
      volume: parseFloat(data.weeklySummary.actual.distance.toFixed(1)),
      activitiesCompleted: data.weeklySummary.actual.count,
      totalTSS: data.weeklySummary.actual.tss,
    };
  }, [data?.weeklySummary]);

  // Load balance context. These workload trends are not physiological readiness signals.
  const formStatus = useMemo(() => {
    const context = deriveLoadBalanceContext(data?.currentStatus);

    return {
      ...context,
      percentage: null,
      color: "slate",
      explanation: context.description,
    };
  }, [data?.currentStatus]);

  // Weekly Goal (Planned vs Actual)
  const weeklyGoal = useMemo(() => {
    if (!data?.weeklySummary) {
      return {
        actual: 0,
        target: 0,
        percentage: 0,
        unit: "TSS",
      };
    }

    return {
      actual: data.weeklySummary.actual.tss,
      target: data.weeklySummary.planned.tss,
      percentage:
        data.weeklySummary.planned.tss > 0
          ? Math.min(
              100,
              Math.round((data.weeklySummary.actual.tss / data.weeklySummary.planned.tss) * 100),
            )
          : 0,
      unit: "TSS",
    };
  }, [data?.weeklySummary]);

  const hasData = !!(data?.activePlan || data?.todaysActivity || data?.schedule?.length);

  return {
    plan: plan ? { ...plan, targetType: "targetType" in plan ? plan.targetType : undefined } : null,
    todaysActivity,
    weeklyStats,
    formStatus,
    weeklyGoal,
    isLoading,
    hasData,
    refetch,
    // Expose raw new data for new components
    trends: data?.trends || [],
    projectedLoad: data?.projectedLoad || [],
    idealFitnessCurve: data?.idealFitnessCurve || [],
    goalMetrics: data?.goalMetrics || null,
    consistency: data?.consistency || { streak: 0, weeklyCount: 0 },
    schedule: data?.schedule || [],
    weeklySummary: data?.weeklySummary,
    profileGoals: profileGoals.goals,
    profileGoalsCount: profileGoals.goalsCount,
    profileSettings: profileSettings.settings,
    profileSettingsRecord: profileSettings.settingsRecord,
  };
}
