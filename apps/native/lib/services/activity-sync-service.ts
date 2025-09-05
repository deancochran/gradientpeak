import Constants from "expo-constants";
import * as FileSystem from "expo-file-system";
import * as Network from "expo-network";
import { Alert, AppState } from "react-native";

import { supabase, type ActivityInsert } from "../supabase";
import type { LocalActivity } from "../types/activity";
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
      // Check if it's a valid FIT file (import still supports FIT files for parsing)
      const isValid = await FitFileService.isValidFitFile(filePath);
      if (!isValid) {
        Alert.alert(
          "Invalid File",
          "The selected file is not a valid FIT file.",
        );
        return null;
      }

      // Parse the FIT file to extract metadata (import still uses FIT parsing)
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
   * Sync a single activity to Supabase using Edge Function
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

      // Check if JSON file exists
      const fileExists = await FileSystem.getInfoAsync(
        activity.local_fit_file_path,
      );
      if (!fileExists.exists) {
        console.error(`JSON file not found at path: ${activity.local_fit_file_path}`);
        console.error('This could be due to:');
        console.error('1. File was deleted or moved');
        console.error('2. App was uninstalled/reinstalled');
        console.error('3. File path format has changed');
        
        // List files in the document directory to help debug
        try {
          const documentDirectory = FileSystem.documentDirectory;
          if (documentDirectory) {
            const files = await FileSystem.readDirectoryAsync(documentDirectory);
            console.error(`Files in document directory (${files.length}):`, files.slice(0, 10));
          }
        } catch (listError) {
          console.error('Could not list document directory:', listError);
        }
        
        throw new Error(`Activity JSON file not found: ${activity.local_fit_file_path}`);
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

      // Create or update activity record in Supabase first
      const activityRecord: ActivityInsert = {
        id: activity.id,
        profile_id: userId,
        local_fit_file_path: activity.local_fit_file_path,
        sync_status: "syncing",
        created_at: new Date(activity.created_at).toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: dbError } = await supabase
        .from("activities")
        .upsert(activityRecord, {
          onConflict: "id",
          ignoreDuplicates: false,
        });

      if (dbError) {
        throw new Error(
          `Failed to create/update activity record: ${dbError.message}`,
        );
      }

      // Call the Edge Function to convert JSON to FIT
      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) {
        throw new Error("No active session");
      }

      // Get the Supabase URL from the Expo constants
      const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                         process.env.EXPO_PUBLIC_SUPABASE_URL || 
                         'https://your-project.supabase.co';
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/json-to-fit`;
      const response = await fetch(edgeFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authData.session.access_token}`,
        },
        body: JSON.stringify({
          activityId: activity.id,
          profileId: userId,
          activityData: activityData,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorText;
        } catch {
          errorMessage = errorText;
        }
        throw new Error(`Edge function failed: ${errorMessage}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Edge function returned failure");
      }

      console.log(
        `Edge function completed: FIT file size ${result.fitSize} bytes`,
      );

      // Update local status to synced
      await LocalActivityDatabaseService.updateSyncStatus(
        activity.id,
        "synced",
        result.fitPath,
      );

      // Delete local JSON file after successful sync
      try {
        await FileSystem.deleteAsync(activity.local_fit_file_path);
        console.log(`Local JSON file deleted: ${activity.local_fit_file_path}`);
      } catch (deleteError) {
        console.warn("Failed to delete local JSON file:", deleteError);
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
