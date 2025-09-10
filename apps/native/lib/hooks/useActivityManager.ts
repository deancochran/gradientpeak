import { useCallback, useEffect, useState } from "react";

import { SelectLocalActivity } from "@lib/db/schemas";
import { WorkoutService } from "@lib/services/workout-service";

export interface UseActivityManagerReturn {
  // Activities data
  activities: SelectLocalActivity[];
  isLoading: boolean;
  error: string | null;

  // Sync status
  syncStatus: {
    totalActivities: number;
    pendingActivities: number;
    failedActivities: number;
  };
  isSyncing: boolean;

  // Actions
  loadActivities: (profileId: string) => Promise<void>;
  getActivityMetadata: (activityId: string) => Promise<ActivityMetadata | null>;
  deleteActivity: (activityId: string) => Promise<boolean>;
  syncAllActivities: () => Promise<{ success: number; failed: number }>;
  syncActivity: (activityId: string) => Promise<boolean>;
  retrySyncActivity: (activityId: string) => Promise<boolean>;
  importFitFile: (
    filePath: string,
    fileName?: string,
  ) => Promise<string | null>;
  refreshSyncStatus: () => Promise<void>;
  cleanupSyncedActivities: () => Promise<number>;

  // Utility
  clearError: () => void;
}

export const useActivityManager = (): UseActivityManagerReturn => {
  // State
  const [activities, setActivities] = useState<SelectLocalActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({
    totalActivities: 0,
    pendingActivities: 0,
    failedActivities: 0,
  });

  // Initialize service
  useEffect(() => {
    WorkoutService.initialize().catch((err) => {
      setError("Failed to initialize workout service");
      console.error(err);
    });
  }, []);

  // Load activities for a profile
  const loadActivities = useCallback(
    async (profileId: string): Promise<void> => {
      try {
        setIsLoading(true);
        setError(null);

        const activitiesList = await WorkoutService.getActivities(profileId);
        setActivities(activitiesList);

        // Also refresh sync status
        await refreshSyncStatus();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(`Failed to load activities: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Get metadata for a specific activity
  const getActivityMetadata = useCallback(
    async (activityId: string): Promise<ActivityMetadata | null> => {
      try {
        const activity = await WorkoutService.getActivity(activityId);
        if (!activity || !activity.local_fit_file_path) {
          return null;
        }

        // Check if we have cached metadata
        if (activity.cached_metadata) {
          try {
            return JSON.parse(activity.cached_metadata);
          } catch {
            // Fall through to re-parse if cached data is corrupted
          }
        }

        // Get metadata from cached activity data
        return await WorkoutService.getActivityMetadata(activityId);
      } catch (err) {
        console.error("Error getting activity metadata:", err);
        return null;
      }
    },
    [],
  );

  // Delete an activity
  const deleteActivity = useCallback(
    async (activityId: string): Promise<boolean> => {
      try {
        setError(null);
        const success = await WorkoutService.deleteActivity(activityId);

        if (success) {
          // Remove from local state
          setActivities((prev) =>
            prev.filter((activity) => activity.id !== activityId),
          );
          await refreshSyncStatus();
        }

        return success;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(`Failed to delete activity: ${errorMessage}`);
        return false;
      }
    },
    [],
  );

  // Sync all activities
  const syncAllActivities = useCallback(async (): Promise<{
    success: number;
    failed: number;
  }> => {
    try {
      setIsSyncing(true);
      setError(null);

      const result = await WorkoutService.syncAllActivities();

      // Refresh activities and sync status after sync
      await refreshSyncStatus();

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Sync failed: ${errorMessage}`);
      return { success: 0, failed: 0 };
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Sync a specific activity
  const syncActivity = useCallback(
    async (activityId: string): Promise<boolean> => {
      try {
        setError(null);
        const success = await WorkoutService.syncActivity(activityId);

        if (success) {
          // Update the activity in local state
          setActivities((prev) =>
            prev.map((activity) =>
              activity.id === activityId
                ? { ...activity, sync_status: "synced" as const }
                : activity,
            ),
          );
          await refreshSyncStatus();
        }

        return success;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(`Failed to sync activity: ${errorMessage}`);
        return false;
      }
    },
    [],
  );

  // Retry syncing a failed activity
  const retrySyncActivity = useCallback(
    async (activityId: string): Promise<boolean> => {
      try {
        setError(null);
        const success = await WorkoutService.retrySyncActivity(activityId);

        if (success) {
          // Update the activity in local state
          setActivities((prev) =>
            prev.map((activity) =>
              activity.id === activityId
                ? {
                    ...activity,
                    sync_status: "synced" as const,
                    sync_error_message: undefined,
                  }
                : activity,
            ),
          );
          await refreshSyncStatus();
        }

        return success;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(`Failed to retry sync: ${errorMessage}`);
        return false;
      }
    },
    [],
  );

  // Import a FIT file
  const importFitFile = useCallback(
    async (filePath: string, fileName?: string): Promise<string | null> => {
      try {
        setError(null);
        const activityId = await WorkoutService.importFitFile(
          filePath,
          fileName,
        );

        if (activityId) {
          // Reload activities to include the new import
          const newActivity = await WorkoutService.getActivity(activityId);
          if (newActivity) {
            setActivities((prev) => [newActivity, ...prev]);
          }
          await refreshSyncStatus();
        }

        return activityId;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(`Import failed: ${errorMessage}`);
        return null;
      }
    },
    [],
  );

  // Refresh sync status
  const refreshSyncStatus = useCallback(async (): Promise<void> => {
    try {
      const status = await WorkoutService.getSyncStatus();
      setSyncStatus(status);
    } catch (err) {
      console.error("Error refreshing sync status:", err);
    }
  }, []);

  // Clean up synced activities
  const cleanupSyncedActivities = useCallback(async (): Promise<number> => {
    try {
      setError(null);
      const deletedCount = await WorkoutService.cleanupSyncedActivities();

      // Remove synced activities from local state
      setActivities((prev) =>
        prev.filter((activity) => activity.sync_status !== "synced"),
      );
      await refreshSyncStatus();

      return deletedCount;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(`Cleanup failed: ${errorMessage}`);
      return 0;
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-refresh sync status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refreshSyncStatus().catch(console.error);
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [refreshSyncStatus]);

  return {
    // Data
    activities,
    isLoading,
    error,

    // Sync status
    syncStatus,
    isSyncing,

    // Actions
    loadActivities,
    getActivityMetadata,
    deleteActivity,
    syncAllActivities,
    syncActivity,
    retrySyncActivity,
    importFitFile,
    refreshSyncStatus,
    cleanupSyncedActivities,

    // Utility
    clearError,
  };
};
