import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { SelectLocalActivity } from "@/lib/db/schemas";
import { ActivityService } from "@/lib/services/activity-service";
import { ProfileService } from "@/lib/services/profile-service";
import { analyzeTrainingLoad } from "@repo/core/calculations";
import type {
  PerformanceMetrics,
  TSSHistoryEntry,
  TrainingLoadAnalysis,
} from "@repo/core/types";

// ================================
// Types
// ================================

export interface ActivityDataState {
  // Performance metrics
  performanceMetrics: PerformanceMetrics | null;
  metricsLoading: boolean;
  metricsError: string | null;

  // Activity data
  activities: SelectLocalActivity[];
  activitiesLoading: boolean;
  activitiesError: string | null;

  // TSS history for charts
  tssHistory: TSSHistoryEntry[];
  trainingLoadAnalysis: TrainingLoadAnalysis | null;

  // Sync status
  syncStatus: {
    isOnline: boolean;
    syncInProgress: boolean;
    pendingCount: number;
    failedCount: number;
  };

  // Last refresh timestamps
  lastMetricsRefresh: Date | null;
  lastActivitiesRefresh: Date | null;

  // Actions
  loadPerformanceMetrics: (forceRefresh?: boolean) => Promise<void>;
  loadActivities: (profileId: string, forceRefresh?: boolean) => Promise<void>;
  refreshAllData: () => Promise<void>;
  getTSSHistoryForPeriod: (days: number) => TSSHistoryEntry[];
  getActivitiesForPeriod: (days: number) => SelectLocalActivity[];
  clearError: (type: "metrics" | "activities") => void;
  resetStore: () => void;
}

// ================================
// Initial State
// ================================

const initialState = {
  // Performance metrics
  performanceMetrics: null,
  metricsLoading: false,
  metricsError: null,

  // Activity data
  activities: [],
  activitiesLoading: false,
  activitiesError: null,

  // TSS history
  tssHistory: [],
  trainingLoadAnalysis: null,

  // Sync status
  syncStatus: {
    isOnline: false,
    syncInProgress: false,
    pendingCount: 0,
    failedCount: 0,
  },

  // Timestamps
  lastMetricsRefresh: null,
  lastActivitiesRefresh: null,
};

// ================================
// Zustand Store
// ================================

export const useActivityDataStore = create<ActivityDataState>()(
  immer((set, get) => ({
    ...initialState,

    // Load performance metrics from real activity data
    loadPerformanceMetrics: async (forceRefresh = false) => {
      const state = get();

      // Skip if already loading
      if (state.metricsLoading) {
        return;
      }

      // Skip if recently refreshed and not forced
      if (!forceRefresh && state.lastMetricsRefresh) {
        const timeSinceRefresh =
          Date.now() - state.lastMetricsRefresh.getTime();
        if (timeSinceRefresh < 30000) {
          // 30 seconds
          return;
        }
      }

      set((draft) => {
        draft.metricsLoading = true;
        draft.metricsError = null;
      });

      try {
        console.log("🏪 Activity Data Store - Loading performance metrics");

        const profile = await ProfileService.getCurrentProfile();
        if (!profile) {
          throw new Error("Profile not found");
        }

        // Use existing activities from state to prevent infinite loops
        const activities = state.activities;

        // If no activities available, skip metrics calculation
        if (activities.length === 0) {
          console.log(
            "🏪 Activity Data Store - No activities available for metrics calculation",
          );
          set((draft) => {
            draft.performanceMetrics = {
              currentCTL: 0,
              currentATL: 0,
              currentTSB: 0,
              weeklyTSS: 0,
              monthlyTSS: 0,
              fitness: "poor",
              form: "optimal",
            };
            draft.tssHistory = [];
            draft.trainingLoadAnalysis = null;
            draft.lastMetricsRefresh = new Date();
            draft.metricsLoading = false;
          });
          return;
        }

        // Build TSS history from real activities
        const tssHistory: TSSHistoryEntry[] = [];
        const now = new Date();
        const ninetyDaysAgo = new Date(
          now.getTime() - 90 * 24 * 60 * 60 * 1000,
        );

        // Process activities to build TSS history
        for (const activity of activities) {
          const activityDate = new Date(activity.startDate);

          // Only include activities from the last 90 days
          if (activityDate >= ninetyDaysAgo && activityDate <= now) {
            // Use TSS from activity if available, otherwise estimate
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

        // Calculate training load analysis
        const trainingLoadAnalysis = analyzeTrainingLoad(filledTssHistory);
        const { ctl, atl, tsb, form, fitnessLevel } = trainingLoadAnalysis;

        // Calculate weekly and monthly TSS
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

        const performanceMetrics: PerformanceMetrics = {
          currentCTL: Math.round(ctl * 10) / 10,
          currentATL: Math.round(atl * 10) / 10,
          currentTSB: Math.round(tsb * 10) / 10,
          weeklyTSS: Math.round(weeklyTSS),
          monthlyTSS: Math.round(monthlyTSS),
          fitness,
          form,
        };

        set((draft) => {
          draft.performanceMetrics = performanceMetrics;
          draft.tssHistory = filledTssHistory;
          draft.trainingLoadAnalysis = trainingLoadAnalysis;
          draft.lastMetricsRefresh = new Date();
          draft.metricsLoading = false;
        });

        console.log("🏪 Activity Data Store - Metrics loaded:", {
          ctl: performanceMetrics.currentCTL,
          atl: performanceMetrics.currentATL,
          tsb: performanceMetrics.currentTSB,
          weeklyTSS: performanceMetrics.weeklyTSS,
          monthlyTSS: performanceMetrics.monthlyTSS,
          activitiesProcessed: activities.length,
        });
      } catch (error) {
        console.error("🏪 Activity Data Store - Error loading metrics:", error);

        set((draft) => {
          draft.metricsError =
            error instanceof Error
              ? error.message
              : "Failed to load performance metrics";
          draft.metricsLoading = false;
        });
      }
    },

    // Load activities from database
    loadActivities: async (profileId: string, forceRefresh = false) => {
      const state = get();

      // Skip if already loading
      if (state.activitiesLoading) {
        return;
      }

      // Skip if recently refreshed and not forced
      if (!forceRefresh && state.lastActivitiesRefresh) {
        const timeSinceRefresh =
          Date.now() - state.lastActivitiesRefresh.getTime();
        if (timeSinceRefresh < 15000) {
          // 15 seconds
          return;
        }
      }

      set((draft) => {
        draft.activitiesLoading = true;
        draft.activitiesError = null;
      });

      try {
        console.log(
          "🏪 Activity Data Store - Loading activities for profile:",
          profileId,
        );

        const activities = await ActivityService.getActivities(profileId);
        const syncStatus = await ActivityService.getSyncStatus();

        set((draft) => {
          draft.activities = activities;
          draft.syncStatus = {
            isOnline: syncStatus.isOnline,
            syncInProgress: syncStatus.syncInProgress,
            pendingCount: syncStatus.pendingCount,
            failedCount: syncStatus.failedCount,
          };
          draft.lastActivitiesRefresh = new Date();
          draft.activitiesLoading = false;
        });

        console.log("🏪 Activity Data Store - Activities loaded:", {
          count: activities.length,
          pending: syncStatus.pendingCount,
          failed: syncStatus.failedCount,
        });
      } catch (error) {
        console.error(
          "🏪 Activity Data Store - Error loading activities:",
          error,
        );

        set((draft) => {
          draft.activitiesError =
            error instanceof Error
              ? error.message
              : "Failed to load activities";
          draft.activitiesLoading = false;
        });
      }
    },

    // Refresh all data
    refreshAllData: async () => {
      const profile = await ProfileService.getCurrentProfile();
      if (!profile) {
        console.warn("🏪 Activity Data Store - No profile found for refresh");
        return;
      }

      console.log("🏪 Activity Data Store - Refreshing all data");

      // Load activities first, then metrics
      try {
        await get().loadActivities(profile.id, true);
        // Wait a bit to ensure activities are loaded before calculating metrics
        setTimeout(() => {
          get().loadPerformanceMetrics(true);
        }, 100);
      } catch (error) {
        console.error("🏪 Activity Data Store - Error refreshing data:", error);
      }
    },

    // Get TSS history for a specific period
    getTSSHistoryForPeriod: (days: number): TSSHistoryEntry[] => {
      const state = get();
      const now = new Date();
      const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      return state.tssHistory.filter((entry) => entry.date >= periodStart);
    },

    // Get activities for a specific period
    getActivitiesForPeriod: (days: number): SelectLocalActivity[] => {
      const state = get();
      const now = new Date();
      const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      return state.activities.filter(
        (activity) => new Date(activity.startDate) >= periodStart,
      );
    },

    // Clear specific error
    clearError: (type: "metrics" | "activities") => {
      set((draft) => {
        if (type === "metrics") {
          draft.metricsError = null;
        } else {
          draft.activitiesError = null;
        }
      });
    },

    // Reset store to initial state
    resetStore: () => {
      set((draft) => {
        Object.assign(draft, initialState);
      });
    },
  })),
);

// ================================
// Selector Hooks
// ================================

// Performance metrics selectors
export const usePerformanceMetrics = () =>
  useActivityDataStore((state) => state.performanceMetrics);

export const usePerformanceMetricsLoading = () =>
  useActivityDataStore((state) => state.metricsLoading);

export const usePerformanceMetricsError = () =>
  useActivityDataStore((state) => state.metricsError);

// Activity selectors
export const useActivities = () =>
  useActivityDataStore((state) => state.activities);

export const useActivitiesLoading = () =>
  useActivityDataStore((state) => state.activitiesLoading);

export const useActivitiesError = () =>
  useActivityDataStore((state) => state.activitiesError);

// TSS and training load selectors
export const useTSSHistory = () =>
  useActivityDataStore((state) => state.tssHistory);

export const useTrainingLoadAnalysis = () =>
  useActivityDataStore((state) => state.trainingLoadAnalysis);

// Sync status selector
export const useSyncStatus = () =>
  useActivityDataStore((state) => state.syncStatus);

// Action selectors
export const useLoadPerformanceMetrics = () =>
  useActivityDataStore((state) => state.loadPerformanceMetrics);

export const useLoadActivities = () =>
  useActivityDataStore((state) => state.loadActivities);

export const useRefreshAllData = () =>
  useActivityDataStore((state) => state.refreshAllData);

export const useGetTSSHistoryForPeriod = () =>
  useActivityDataStore((state) => state.getTSSHistoryForPeriod);

export const useGetActivitiesForPeriod = () =>
  useActivityDataStore((state) => state.getActivitiesForPeriod);

// Utility selectors
export const useRecentActivities = (limit: number = 10) =>
  useActivityDataStore((state) =>
    state.activities
      .sort(
        (a, b) =>
          new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
      )
      .slice(0, limit),
  );

export const useWeeklyTSS = () =>
  useActivityDataStore((state) => {
    const weeklyData = state.getTSSHistoryForPeriod(7);
    return weeklyData.reduce((sum, entry) => sum + entry.tss, 0);
  });

export const useCurrentForm = () =>
  useActivityDataStore((state) => state.performanceMetrics?.form || "optimal");

export const useCurrentFitness = () =>
  useActivityDataStore((state) => state.performanceMetrics?.fitness || "poor");
