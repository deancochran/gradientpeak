import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import * as Network from "expo-network";
import { Alert, AppState } from "react-native";

import { supabase } from "../supabase";
import type { LocalActivity } from "../types/activity";
import { LocalActivityDatabaseService } from "./local-activity-database";

export class ActivitySyncService {
  private static isInitialized = false;
  private static syncInProgress = false;
  private static syncQueue: string[] = [];

  /**
   * Initialize the sync service
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await LocalActivityDatabaseService.initDatabase();
      this.setupSyncListeners();
      this.isInitialized = true;
      console.log("Activity sync service initialized");
    } catch (error) {
      console.error("Failed to initialize activity sync service:", error);
      throw error;
    }
  }

  /**
   * Sync all pending activities
   */
  static async syncAll(): Promise<{ success: number; failed: number }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.syncInProgress) {
      console.log("Sync already in progress, skipping");
      return { success: 0, failed: 0 };
    }

    try {
      this.syncInProgress = true;

      // Check network connectivity
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected) {
        console.log("No network connection, skipping sync");
        return { success: 0, failed: 0 };
      }

      // Check authentication
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        console.log("User not authenticated, skipping sync");
        return { success: 0, failed: 0 };
      }

      // Get activities that need syncing
      const activitiesToSync =
        await LocalActivityDatabaseService.getActivitiesNeedingSync();
      const failedActivities =
        await LocalActivityDatabaseService.getFailedSyncActivities();
      const allActivities = [...activitiesToSync, ...failedActivities];

      console.log(`Starting sync for ${allActivities.length} activities`);

      let successCount = 0;
      let failedCount = 0;

      for (const activity of allActivities) {
        try {
          const success = await this.syncWithRetry(activity, user.id);
          if (success) {
            successCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error(`Failed to sync activity ${activity.id}:`, error);
          failedCount++;

          // Update local record with error
          await LocalActivityDatabaseService.updateSyncStatus(
            activity.id,
            "sync_failed",
            undefined,
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      }

      console.log(
        `Sync completed: ${successCount} successful, ${failedCount} failed`,
      );
      return { success: successCount, failed: failedCount };
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync a single activity by ID
   */
  static async syncActivity(activityId: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.syncInProgress) {
      console.log(
        `Sync already in progress. The new activity (${activityId}) will be synced later.`,
      );
      return true; // Not an error, it will be picked up by the next sync cycle
    }

    try {
      this.syncInProgress = true;

      // Check authentication
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("User not authenticated");
      }

      const activity =
        await LocalActivityDatabaseService.getActivity(activityId);
      if (!activity) {
        throw new Error("Activity not found");
      }

      return await this.syncWithRetry(activity, user.id);
    } catch (error) {
      console.error(`Failed to sync activity ${activityId}:`, error);
      return false;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Force sync a specific activity (retry failed sync)
   */
  static async retrySyncActivity(activityId: string): Promise<boolean> {
    // Reset the status to local_only and try again
    await LocalActivityDatabaseService.updateSyncStatus(
      activityId,
      "local_only",
    );
    return this.syncActivity(activityId);
  }

  /**
   * Get sync status for all activities
   */
  static async getSyncStatus(): Promise<{
    totalActivities: number;
    syncedActivities: number;
    pendingActivities: number;
    failedActivities: number;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        totalActivities: 0,
        syncedActivities: 0,
        pendingActivities: 0,
        failedActivities: 0,
      };
    }

    const storageInfo = await LocalActivityDatabaseService.getStorageInfo(
      user.id,
    );

    return {
      totalActivities: storageInfo.totalActivities,
      syncedActivities: 0, // We clean up synced activities, so this is always 0
      pendingActivities: storageInfo.unsyncedActivities,
      failedActivities: storageInfo.failedSyncActivities,
    };
  }

  /**
   * Bulk sync multiple activities to Next.js API
   */
  static async syncMultipleActivities(
    activityIds: string[],
  ): Promise<{ success: number; failed: number }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`🔄 Starting bulk sync for ${activityIds.length} activities`);

    let successCount = 0;
    let failedCount = 0;

    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < activityIds.length; i += batchSize) {
      const batch = activityIds.slice(i, i + batchSize);
      const batchActivities = [];

      // Prepare batch data
      for (const activityId of batch) {
        try {
          const activity =
            await LocalActivityDatabaseService.getActivity(activityId);
          if (!activity) continue;

          const fileExists = await FileSystem.getInfoAsync(
            activity.local_fit_file_path,
          );
          if (!fileExists.exists) continue;

          const jsonData = await FileSystem.readAsStringAsync(
            activity.local_fit_file_path,
            {
              encoding: FileSystem.EncodingType.UTF8,
            },
          );

          const activityData = JSON.parse(jsonData);

          // Upload to Supabase Storage first
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("User not authenticated");

          const fileName = `${user.id}/${activity.id}.json`;
          await supabase.storage
            .from("activity-json-files")
            .upload(
              fileName,
              new Blob([jsonData], { type: "application/json" }),
              {
                upsert: true,
              },
            );

          batchActivities.push({
            activityId: activity.id,
            startedAt: activityData.startedAt,
            liveMetrics: activityData.liveMetrics,
            filePath: fileName,
          });

          // Update status to syncing
          await LocalActivityDatabaseService.updateSyncStatus(
            activity.id,
            "syncing",
          );
        } catch (error) {
          console.error(
            `Failed to prepare activity ${activityId} for batch sync:`,
            error,
          );
          await LocalActivityDatabaseService.updateSyncStatus(
            activityId,
            "sync_failed",
            undefined,
            error instanceof Error ? error.message : "Preparation failed",
          );
          failedCount++;
        }
      }

      // Send batch to API
      if (batchActivities.length > 0) {
        try {
          const response = await apiClient.bulkSyncActivities(batchActivities);

          if (response.success && response.data) {
            const results = response.data.results || [];

            for (const result of results) {
              if (result.success) {
                await LocalActivityDatabaseService.updateSyncStatus(
                  result.activityId,
                  "synced",
                  result.activity?.cloudStoragePath,
                );

                // Delete local file
                try {
                  const activity =
                    await LocalActivityDatabaseService.getActivity(
                      result.activityId,
                    );
                  if (activity?.local_fit_file_path) {
                    await FileSystem.deleteAsync(activity.local_fit_file_path);
                  }
                } catch (deleteError) {
                  console.warn("Failed to delete local file:", deleteError);
                }

                successCount++;
              } else {
                await LocalActivityDatabaseService.updateSyncStatus(
                  result.activityId,
                  "sync_failed",
                  undefined,
                  result.error || "Bulk sync failed",
                );
                failedCount++;
              }
            }
          } else {
            // All activities in batch failed
            for (const activity of batchActivities) {
              await LocalActivityDatabaseService.updateSyncStatus(
                activity.activityId,
                "sync_failed",
                undefined,
                response.error || "Bulk API call failed",
              );
              failedCount++;
            }
          }
        } catch (error) {
          console.error("Batch sync API call failed:", error);
          // Mark all activities in batch as failed
          for (const activity of batchActivities) {
            await LocalActivityDatabaseService.updateSyncStatus(
              activity.activityId,
              "sync_failed",
              undefined,
              error instanceof Error ? error.message : "Batch sync failed",
            );
            failedCount++;
          }
        }
      }
    }

    console.log(
      `✅ Bulk sync completed: ${successCount} successful, ${failedCount} failed`,
    );
    return { success: successCount, failed: failedCount };
  }

  /**
   * Clean up successfully synced activities
   */
  static async cleanupSyncedActivities(): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Delete local records of synced activities
    const deletedCount =
      await LocalActivityDatabaseService.cleanupSyncedActivities();

    console.log(
      `Cleaned up ${deletedCount} synced activities from local storage`,
    );
    return deletedCount;
  }

  /**
   * Import a FIT file from external source - Legacy method, now disabled
   */
  static async importFitFile(
    filePath: string,
    fileName?: string,
  ): Promise<string | null> {
    Alert.alert(
      "Feature Disabled",
      "FIT file import is disabled in the new JSON-first architecture. Please use the native app to record activities instead.",
    );
    return null;
  }

  // Private methods

  private static async syncWithRetry(
    activity: LocalActivity,
    userId: string,
    maxRetries = 3,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.syncSingleActivity(activity, userId);
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000),
        );
      }
    }
    return false;
  }

  private static getSupabaseUrl(): string {
    const url =
      Constants.expoConfig?.extra?.supabaseUrl ||
      process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!url) throw new Error("Supabase URL not configured");
    return url;
  }

  /**
   * Sync a single activity to Next.js API using hybrid approach
   */
  private static async syncSingleActivity(
    activity: LocalActivity,
    userId: string,
  ): Promise<boolean> {
    try {
      console.log(`🔄 Syncing activity: ${activity.id} to Next.js API`);

      // Update status to syncing
      await LocalActivityDatabaseService.updateSyncStatus(
        activity.id,
        "syncing",
      );

      // Check if JSON file exists
      const fileExists = await FileSystem.getInfoAsync(
        activity.local_fit_file_path,
      );
      if (!fileExists.exists) {
        throw new Error(
          `Activity JSON file not found: ${activity.local_fit_file_path}`,
        );
      }

      // Read the JSON file
      const jsonData = await FileSystem.readAsStringAsync(
        activity.local_fit_file_path,
        {
          encoding: FileSystem.EncodingType.UTF8,
        },
      );

      let activityData;
      try {
        activityData = JSON.parse(jsonData);
      } catch (parseError) {
        throw new Error("Failed to parse activity JSON file");
      }

      // Step 1: Upload JSON to Supabase Storage (keep existing storage)
      const fileName = `${userId}/${activity.id}.json`;
      const { error: uploadError } = await supabase.storage
        .from("activity-json-files")
        .upload(fileName, new Blob([jsonData], { type: "application/json" }), {
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`JSON upload failed: ${uploadError.message}`);
      }

      console.log(`📁 Activity JSON uploaded to Supabase Storage: ${fileName}`);

      // Step 2: Call the Next.js API endpoint instead of Edge Function
      const syncResponse = await apiClient.syncActivity({
        activityId: activity.id,
        startedAt: activityData.startedAt,
        liveMetrics: activityData.liveMetrics,
        filePath: fileName,
      });

      if (!syncResponse.success) {
        throw new Error(syncResponse.error || "Next.js API sync failed");
      }

      console.log(
        `✅ Activity ${activity.id} synced successfully to Next.js API`,
      );

      // Update local status to synced
      await LocalActivityDatabaseService.updateSyncStatus(
        activity.id,
        "synced",
        fileName, // Store the JSON storage path
      );

      // Delete local JSON file after successful sync
      try {
        await FileSystem.deleteAsync(activity.local_fit_file_path);
        console.log(
          `🗑️ Local JSON file deleted: ${activity.local_fit_file_path}`,
        );
      } catch (deleteError) {
        console.warn("⚠️ Failed to delete local JSON file:", deleteError);
      }

      return true;
    } catch (error) {
      console.error(`❌ Error syncing activity ${activity.id}:`, error);

      // Update status to sync_failed
      await LocalActivityDatabaseService.updateSyncStatus(
        activity.id,
        "sync_failed",
        undefined,
        error instanceof Error ? error.message : "Unknown error",
      );

      return false;
    }
  }

  /**
   * Check if network is available
   */
  static async isNetworkAvailable(): Promise<boolean> {
    try {
      const networkState = await Network.getNetworkStateAsync();
      return networkState.isConnected || false;
    } catch (error) {
      console.error("Error checking network state:", error);
      return false;
    }
  }

  /**
   * Setup app state and network listeners for automatic sync
   */
  private static setupSyncListeners(): void {
    // Listener for app state changes (e.g., app comes to foreground)
    AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "active" && !this.syncInProgress) {
        try {
          const networkState = await Network.getNetworkStateAsync();
          if (networkState.isConnected) {
            console.log("App became active with network, starting auto-sync");
            this.syncAll().catch((error) => {
              console.error("Auto-sync on app active failed:", error);
            });
          }
        } catch (error) {
          console.error("Error checking network state on app active:", error);
        }
      }
    });

    // Listener for network connectivity changes
    Network.addNetworkStateListener(async (networkState) => {
      if (networkState.isConnected && !this.syncInProgress) {
        console.log("Network connection detected, starting auto-sync");
        this.syncAll().catch((error) => {
          console.error("Auto-sync on network change failed:", error);
        });
      }
    });
  }

  /**
   * Format duration helper
   */
  private static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
}
