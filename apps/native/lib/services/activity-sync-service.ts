import * as FileSystem from "expo-file-system";

import * as Network from "expo-network";
import { Alert, AppState } from "react-native";

import { supabase, type ActivityInsert } from "../supabase";
import type { ActivityMetadata, LocalActivity } from "../types/activity";
import { FitFileService } from "./fit-file-service";
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
      this.setupAppStateListener();
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
          const success = await this.syncSingleActivity(activity, user.id);
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

    try {
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

      return await this.syncSingleActivity(activity, user.id);
    } catch (error) {
      console.error(`Failed to sync activity ${activityId}:`, error);
      return false;
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
   * Import a FIT file from external source
   */
  static async importFitFile(
    filePath: string,
    fileName?: string,
  ): Promise<string | null> {
    try {
      // Check if it's a valid FIT file
      const isValid = await FitFileService.isValidFitFile(filePath);
      if (!isValid) {
        Alert.alert(
          "Invalid File",
          "The selected file is not a valid FIT file.",
        );
        return null;
      }

      // Parse the FIT file to extract metadata
      const metadata = await FitFileService.parseActivityFile(filePath);
      if (!metadata) {
        Alert.alert("Error", "Failed to read the FIT file.");
        return null;
      }

      // Get current user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        Alert.alert(
          "Authentication Error",
          "Please sign in to import activities.",
        );
        return null;
      }

      // Copy file to our app directory
      const newFileName = fileName || `imported_${Date.now()}.fit`;
      const newFilePath = `${FileSystem.documentDirectory}${newFileName}`;
      await FileSystem.copyAsync({
        from: filePath,
        to: newFilePath,
      });

      // Create local activity record
      const activityId = `imported_${Date.now()}`;
      await LocalActivityDatabaseService.createActivity({
        id: activityId,
        profile_id: user.id,
        local_fit_file_path: newFilePath,
        sync_status: "local_only",
        created_at: Date.now(),
        updated_at: Date.now(),
        cached_metadata: JSON.stringify(metadata),
      });

      Alert.alert(
        "Import Successful",
        `Activity imported successfully!\n\nStart: ${metadata.startTime.toLocaleDateString()}\nDuration: ${metadata.totalTimerTime ? this.formatDuration(metadata.totalTimerTime) : "N/A"}\nDistance: ${metadata.totalDistance ? `${(metadata.totalDistance / 1000).toFixed(2)}km` : "N/A"}`,
      );

      return activityId;
    } catch (error) {
      console.error("Error importing FIT file:", error);
      Alert.alert("Import Error", "Failed to import the FIT file.");
      return null;
    }
  }

  // Private methods

  /**
   * Sync a single activity to Supabase
   */
  private static async syncSingleActivity(
    activity: LocalActivity,
    userId: string,
  ): Promise<boolean> {
    try {
      console.log(`Syncing activity: ${activity.id}`);

      // Update status to syncing
      await LocalActivityDatabaseService.updateSyncStatus(
        activity.id,
        "syncing",
      );

      // Check if FIT file exists
      const fileExists = await FileSystem.getInfoAsync(
        activity.local_fit_file_path,
      );
      if (!fileExists.exists) {
        throw new Error("FIT file not found on device");
      }

      // Parse metadata from FIT file if not cached
      let metadata: ActivityMetadata | null = null;
      if (activity.cached_metadata) {
        try {
          metadata = JSON.parse(activity.cached_metadata);
        } catch {
          // If cached metadata is corrupted, re-parse
          metadata = await FitFileService.parseActivityFile(
            activity.local_fit_file_path,
          );
        }
      } else {
        metadata = await FitFileService.parseActivityFile(
          activity.local_fit_file_path,
        );
      }

      if (!metadata) {
        throw new Error("Failed to parse FIT file metadata");
      }

      // Upload FIT file to Supabase Storage
      const cloudPath = await this.uploadFitFile(
        activity.local_fit_file_path,
        activity.id,
      );
      if (!cloudPath) {
        throw new Error("Failed to upload FIT file");
      }

      // Create activity record in Supabase
      const activityData: ActivityInsert = {
        id: activity.id,
        profile_id: userId,
        local_fit_file_path: activity.local_fit_file_path,
        sync_status: "synced",
        cloud_storage_path: cloudPath,
        created_at: new Date(activity.created_at).toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("activities")
        .insert(activityData)
        .select()
        .single();

      if (error) {
        // If the activity already exists, update it
        if (error.code === "23505") {
          // Unique violation
          const { error: updateError } = await supabase
            .from("activities")
            .update({
              cloud_storage_path: cloudPath,
              sync_status: "synced",
              updated_at: new Date().toISOString(),
            })
            .eq("id", activity.id);

          if (updateError) {
            throw updateError;
          }
        } else {
          throw error;
        }
      }

      // Update local status to synced
      await LocalActivityDatabaseService.updateSyncStatus(
        activity.id,
        "synced",
        cloudPath,
      );

      // Delete local FIT file after successful sync
      try {
        await FileSystem.deleteAsync(activity.local_fit_file_path);
        console.log(`Local FIT file deleted: ${activity.local_fit_file_path}`);
      } catch (deleteError) {
        console.warn("Failed to delete local FIT file:", deleteError);
      }

      console.log(`Successfully synced activity: ${activity.id}`);
      return true;
    } catch (error) {
      console.error(`Error syncing activity ${activity.id}:`, error);

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
   * Upload FIT file to Supabase Storage
   */
  private static async uploadFitFile(
    localPath: string,
    activityId: string,
  ): Promise<string | null> {
    try {
      // Read the FIT file
      const base64Data = await FileSystem.readAsStringAsync(localPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Upload to Supabase Storage
      const fileName = `${activityId}.fit`;
      const { data, error } = await supabase.storage
        .from("activity-files")
        .upload(`fit-files/${fileName}`, bytes.buffer, {
          contentType: "application/octet-stream",
          upsert: true,
        });

      if (error) {
        console.error("Storage upload error:", error);
        return null;
      }

      return data.path;
    } catch (error) {
      console.error("Error uploading FIT file:", error);
      return null;
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
   * Setup app state listener for automatic sync
   */
  private static setupAppStateListener(): void {
    AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "active" && !this.syncInProgress) {
        // Check network and sync when app becomes active
        try {
          const networkState = await Network.getNetworkStateAsync();
          if (networkState.isConnected) {
            console.log("App became active with network, starting auto-sync");
            this.syncAll().catch((error) => {
              console.error("Auto-sync failed:", error);
            });
          }
        } catch (error) {
          console.error("Error checking network state:", error);
        }
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
