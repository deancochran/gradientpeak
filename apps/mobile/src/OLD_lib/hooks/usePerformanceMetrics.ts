import { ActivityService } from "@lib/services/activity-service";
import { ProfileService } from "@lib/services/profile-service";
import type { PerformanceMetrics, TSSHistoryEntry } from "@repo/core";
import { analyzeTrainingLoad } from "@repo/core/calculations";
import { useEffect, useState } from "react";

export function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log(
        "📊 Performance Metrics Hook - Loading real metrics from activities",
      );

      const profile = await ProfileService.getCurrentProfile();
      if (!profile) {
        setError("Profile not found");
        console.warn("📊 Performance Metrics Hook - No profile found");
        return;
      }

      // Get real activities from local database
      const activities = await ActivityService.getActivities(profile.id);
      console.log(
        "📊 Performance Metrics Hook - Loaded activities:",
        activities.length,
      );

      // Build TSS history from real activities
      const tssHistory: TSSHistoryEntry[] = [];
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Process activities to build TSS history
      for (const activity of activities) {
        const activityDate = new Date(activity.startDate);

        // Only include activities from the last 90 days
        if (activityDate >= ninetyDaysAgo && activityDate <= now) {
          // Use TSS from activity if available, otherwise estimate based on duration
          let tss = activity.tss || 0;

          // If no TSS recorded but we have activity data, estimate it
          if (tss === 0 && activity.totalTime && activity.totalTime > 0) {
            // Simple estimation: ~50 TSS per hour for moderate intensity
            const hours = activity.totalTime / 3600;
            tss = hours * 50;

            // Adjust based on activity type and intensity indicators
            if (activity.avgHeartRate && profile.thresholdHr) {
              const intensityFactor =
                activity.avgHeartRate / profile.thresholdHr;
              tss = hours * Math.pow(intensityFactor, 2) * 100;
            }

            // Cap estimated TSS at reasonable values
            tss = Math.min(tss, 300);
          }

          if (tss > 0) {
            tssHistory.push({
              date: activityDate,
              tss: Math.round(tss * 10) / 10,
            });
          }
        }
      }

      // Fill in missing days with 0 TSS for accurate CTL/ATL calculation
      const filledTssHistory: TSSHistoryEntry[] = [];
      for (let i = 89; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const existingEntry = tssHistory.find(
          (entry) => entry.date.toDateString() === date.toDateString(),
        );

        filledTssHistory.push({
          date,
          tss: existingEntry ? existingEntry.tss : 0,
        });
      }

      console.log(
        "📊 Performance Metrics Hook - TSS History entries:",
        filledTssHistory.length,
      );

      // Calculate training load using real data
      const trainingLoadAnalysis = analyzeTrainingLoad(filledTssHistory);
      const { ctl, atl, tsb, form, fitnessLevel } = trainingLoadAnalysis;

      // Calculate weekly and monthly TSS from real activities
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const weeklyTSS = filledTssHistory
        .filter((entry) => entry.date >= oneWeekAgo)
        .reduce((sum, entry) => sum + entry.tss, 0);

      const monthlyTSS = filledTssHistory
        .filter((entry) => entry.date >= oneMonthAgo)
        .reduce((sum, entry) => sum + entry.tss, 0);

      // Map fitness level to metrics fitness
      let fitness: PerformanceMetrics["fitness"];
      switch (fitnessLevel) {
        case "very_high":
          fitness = "excellent";
          break;
        case "high":
          fitness = "good";
          break;
        case "moderate":
          fitness = "average";
          break;
        default:
          fitness = "poor";
          break;
      }

      const calculatedMetrics: PerformanceMetrics = {
        currentCTL: Math.round(ctl * 10) / 10,
        currentATL: Math.round(atl * 10) / 10,
        currentTSB: Math.round(tsb * 10) / 10,
        weeklyTSS: Math.round(weeklyTSS),
        monthlyTSS: Math.round(monthlyTSS),
        fitness,
        form,
      };

      setMetrics(calculatedMetrics);
      console.log("📊 Performance Metrics Hook - Real metrics calculated:", {
        ctl: calculatedMetrics.currentCTL,
        atl: calculatedMetrics.currentATL,
        tsb: calculatedMetrics.currentTSB,
        weeklyTSS: calculatedMetrics.weeklyTSS,
        monthlyTSS: calculatedMetrics.monthlyTSS,
        form: calculatedMetrics.form,
        activitiesProcessed: activities.length,
      });
    } catch (err) {
      console.error(
        "📊 Performance Metrics Hook - Error loading real metrics:",
        err,
      );
      setError("Failed to load performance metrics from activities");

      // Fallback to empty metrics rather than mock data
      setMetrics({
        currentCTL: 0,
        currentATL: 0,
        currentTSB: 0,
        weeklyTSS: 0,
        monthlyTSS: 0,
        fitness: "poor",
        form: "optimal",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const refreshMetrics = () => {
    console.log("📊 Performance Metrics Hook - Refreshing real metrics");
    loadMetrics();
  };

  return {
    metrics,
    isLoading,
    error,
    refreshMetrics,
  };
}
