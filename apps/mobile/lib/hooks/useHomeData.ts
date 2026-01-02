import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { useMemo } from "react";

/**
 * useHomeData Hook
 *
 * Consumes the consolidated home.getDashboard endpoint.
 * Adapted to provide data for the Home Screen UI.
 */
export function useHomeData() {
  const { data, isLoading, refetch } = trpc.home.getDashboard.useQuery({
    days: 7,
  });

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

  // Transform upcoming activities
  // Note: Keeping typo 'upcomingActivitys' for backward compatibility if used elsewhere
  const upcomingActivitys = useMemo(() => {
    if (!data?.schedule?.length) return [];

    return data.schedule
      .filter((a) => !a.isToday)
      .map((activity) => {
        const activityDate = new Date(activity.date);
        return {
          id: activity.id,
          day: format(activityDate, "EEEE"),
          type: activity.activityType || "Activity",
          title: activity.activityName || "Planned Activity",
          distance: activity.estimatedDistance
            ? parseFloat((activity.estimatedDistance / 1000).toFixed(1))
            : 0,
          duration: activity.estimatedDuration || 0,
          intensity: "Moderate",
          status: "upcoming" as const,
        };
      });
  }, [data?.schedule]);

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

  // Form Status (Real Data)
  const formStatus = useMemo(() => {
    if (!data?.currentStatus) {
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

    const { ctl, atl, tsb, form } = data.currentStatus;

    // Map form status to UI props
    const statusMap: Record<
      string,
      { label: string; color: string; percentage: number }
    > = {
      fresh: { label: "Fresh", color: "green", percentage: 90 },
      optimal: { label: "Optimal", color: "blue", percentage: 80 },
      neutral: { label: "Neutral", color: "gray", percentage: 60 },
      tired: { label: "Tired", color: "orange", percentage: 40 },
      overreaching: { label: "Overreaching", color: "red", percentage: 20 },
    };

    const status = statusMap[form] || statusMap.neutral;

    return {
      label: status.label,
      percentage: status.percentage,
      color: status.color,
      explanation: `TSB: ${tsb > 0 ? "+" : ""}${tsb}`,
      ctl,
      atl,
      tsb,
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
              Math.round(
                (data.weeklySummary.actual.tss /
                  data.weeklySummary.planned.tss) *
                  100,
              ),
            )
          : 0,
      unit: "TSS",
    };
  }, [data?.weeklySummary]);

  // Training Readiness (Derived from Real TSB)
  const trainingReadiness = useMemo(() => {
    const ctl = formStatus.ctl || 0;
    const atl = formStatus.atl || 0;
    const tsb = formStatus.tsb || 0;

    // Calculate readiness
    const percentage = Math.min(100, Math.max(0, 50 + tsb * 2));

    let status = "Moderate";
    if (percentage >= 85) status = "Prime";
    else if (percentage >= 70) status = "Good";
    else if (percentage < 40) status = "Fatigued";

    const getCtlStatus = (val: number) =>
      val < 30 ? "Building" : val < 60 ? "Steady" : "Strong";
    const getAtlStatus = (val: number) =>
      val > 80 ? "High" : val > 40 ? "Moderate" : "Low";
    const getTsbStatus = (val: number) =>
      val > 15 ? "Fresh" : val < -15 ? "Tired" : "Neutral";

    return {
      percentage: Math.round(percentage),
      status,
      ctl,
      ctlStatus: getCtlStatus(ctl),
      atl,
      atlStatus: getAtlStatus(atl),
      tsb,
      tsbStatus: getTsbStatus(tsb),
    };
  }, [formStatus]);

  const hasData = !!(
    data?.activePlan ||
    data?.todaysActivity ||
    data?.schedule?.length
  );

  return {
    plan,
    todaysActivity,
    weeklyStats,
    formStatus,
    trainingReadiness,
    upcomingActivitys,
    weeklyGoal,
    isLoading,
    hasData,
    refetch,
    // Expose raw new data for new components
    trends: data?.trends || [],
    projectedFitness: data?.projectedFitness || [],
    idealFitnessCurve: data?.idealFitnessCurve || [],
    goalMetrics: data?.goalMetrics || null,
    consistency: data?.consistency || { streak: 0, weeklyCount: 0 },
    schedule: data?.schedule || [],
    weeklySummary: data?.weeklySummary,
  };
}
