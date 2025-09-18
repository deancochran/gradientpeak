import { useCallback, useEffect, useState } from "react";

import { SelectLocalActivity } from "../db/schemas";
import { ActivityService } from "../services/activity-service";
import { SyncStatus } from "../services/activity-sync-service";

export interface UseActivityManagerReturn {
  // Activities data
  activities: SelectLocalActivity[];
  isLoading: boolean;
  error: string | null;

  // Sync status
  syncStatus: SyncStatus;
  isSyncing: boolean;

  // Actions
  loadActivities: (profileId: string) => Promise<void>;
  getActivityMetadata: (activityId: string) => Promise<any | null>;
  deleteActivity: (activityId: string) => Promise<boolean>;
  syncAllActivities: () => Promise<{ success: number; failed: number }>;
  syncActivity: (activityId: string) => Promise<boolean>;
  retrySyncActivity: (activityId: string) => Promise<boolean>;
  importJsonFile: (
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: false,
    syncInProgress: false,
    pendingCount: 0,
    failedCount: 0,
    lastSyncAttempt: null,
    nextRetryAt: null,
  });

  // Initialize service
  useEffect(() => {
    ActivityService.initialize().catch((err) => {
      setError("Failed to initialize activity service");
      console.error(err);
    });
  }, []);

  // Load activities for a profile
  const loadActivities = useCallback(
    async (profileId: string): Promise<void> => {
      try {
        setIsLoading(true);
        setError(null);

        const activitiesList = await ActivityService.getActivities(profileId);
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
    async (activityId: string): Promise<any | null> => {
      try {
        const activity = await ActivityService.getActivity(activityId);
        if (!activity || !activity.localStoragePath) {
          return null;
        }

        // For now, return basic metadata since cached_metadata is not in schema
        // TODO: Implement metadata caching if needed

        // Get metadata from cached activity data
        return await ActivityService.getActivityMetadata(activityId);
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
        const success = await ActivityService.deleteActivity(activityId);

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

      const result = await ActivityService.syncAllActivities();

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
        const success = await ActivityService.syncActivity(activityId);

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
        const success = await ActivityService.retrySyncActivity(activityId);

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

  // Import a JSON file
  const importJsonFile = useCallback(
    async (filePath: string, fileName?: string): Promise<string | null> => {
      try {
        setError(null);
        const activityId = await ActivityService.importJsonFile(
          filePath,
          fileName,
        );

        if (activityId) {
          // Reload activities to include the new import
          const newActivity = await ActivityService.getActivity(activityId);
          if (newActivity) {
            setActivities((prev) => [newActivity, ...prev]);
          }
          await refreshSyncStatus();
        }

        return activityId;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed";
        setError(message);
        console.error("Activity import failed:", err);
        return null;
      }
    },
    [],
  );

  // Refresh sync status
  const refreshSyncStatus = useCallback(async (): Promise<void> => {
    try {
      const status = await ActivityService.getSyncStatus();
      setSyncStatus(status);
    } catch (err) {
      console.error("Error refreshing sync status:", err);
    }
  }, []);

  // Clean up synced activities
  const cleanupSyncedActivities = useCallback(async (): Promise<number> => {
    try {
      setError(null);
      const deletedCount = await ActivityService.cleanupSyncedActivities();

      // Remove synced activities from local state
      setActivities((prev) =>
        prev.filter((activity) => activity.syncStatus !== "synced"),
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
    importJsonFile,
    refreshSyncStatus,
    cleanupSyncedActivities,

    // Utility
    clearError,
  };
};
