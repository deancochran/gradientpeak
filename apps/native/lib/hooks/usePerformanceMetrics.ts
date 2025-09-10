import { ProfileService } from "@lib/services/profile-service";
import { calculateTrainingLoad } from "@repo/core/calculations";
import type { PerformanceMetrics } from "@repo/core/schemas";
import { useEffect, useState } from "react";

export function usePerformanceMetrics() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log("📊 Performance Metrics Hook - Loading metrics");

      const profile = await ProfileService.getCurrentProfile();
      if (!profile) {
        setError("Profile not found");
        console.warn("📊 Performance Metrics Hook - No profile found");
        return;
      }

      // Generate mock training load data for now
      // In production this would fetch from database using getTrainingLoadData
      const mockTssHistory = Array.from({ length: 90 }, (_, i) => ({
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        tss: Math.max(0, 50 + Math.sin(i / 7) * 30 + Math.random() * 20),
      })).reverse();

      // Calculate current training load
      const trainingLoad = calculateTrainingLoad(mockTssHistory);

      // Calculate weekly and monthly TSS
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const weeklyTSS = mockTssHistory
        .filter((d) => d.date >= oneWeekAgo)
        .reduce((sum, d) => sum + d.tss, 0);

      const monthlyTSS = mockTssHistory
        .filter((d) => d.date >= oneMonthAgo)
        .reduce((sum, d) => sum + d.tss, 0);

      // Determine fitness level based on CTL
      let fitness: PerformanceMetrics["fitness"];
      if (trainingLoad.ctl > 80) fitness = "excellent";
      else if (trainingLoad.ctl > 60) fitness = "good";
      else if (trainingLoad.ctl > 40) fitness = "average";
      else fitness = "poor";

      // Determine form based on TSB
      let form: PerformanceMetrics["form"];
      if (trainingLoad.tsb > 10) form = "optimal";
      else if (trainingLoad.tsb > -10) form = "good";
      else if (trainingLoad.tsb > -30) form = "tired";
      else form = "very_tired";

      const calculatedMetrics: PerformanceMetrics = {
        currentCTL: trainingLoad.ctl,
        currentATL: trainingLoad.atl,
        currentTSB: trainingLoad.tsb,
        weeklyTSS: Math.round(weeklyTSS),
        monthlyTSS: Math.round(monthlyTSS),
        fitness,
        form,
      };

      setMetrics(calculatedMetrics);
      console.log("📊 Performance Metrics Hook - Metrics loaded:", {
        ctl: trainingLoad.ctl.toFixed(1),
        atl: trainingLoad.atl.toFixed(1),
        tsb: trainingLoad.tsb.toFixed(1),
        form,
      });
    } catch (err) {
      console.error(
        "📊 Performance Metrics Hook - Error loading metrics:",
        err,
      );
      setError("Failed to load performance metrics");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const refreshMetrics = () => {
    console.log("📊 Performance Metrics Hook - Refreshing metrics");
    loadMetrics();
  };

  return {
    metrics,
    isLoading,
    error,
    refreshMetrics,
  };
}
