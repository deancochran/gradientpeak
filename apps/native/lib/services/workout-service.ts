import * as FileSystem from "expo-file-system";
import { Alert } from "react-native";
import type { LocalActivity, RecordingSession } from "../types/activity";
import { ActivityRecorderService } from "./activity-recorder";
import { ActivitySyncService } from "./activity-sync-service";
import { LocalActivityDatabaseService } from "./local-activity-database";

/**
 * Advanced workout service that orchestrates activity recording, storage, and sync
 */
export class WorkoutService {
  private static initialized = false;

  /**
   * Initialize all workout-related services
   */
  static async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await ActivityRecorderService.initialize();
      await ActivitySyncService.initialize();
      await LocalActivityDatabaseService.initDatabase();

      this.initialized = true;
      console.log("Workout service initialized successfully");
    } catch (error) {
      console.error("Failed to initialize workout service:", error);
      throw error;
    }
  }

  /**
   * Start recording a new workout
   */
  static async startWorkout(profileId: string): Promise<string | null> {
    if (!profileId?.trim()) {
      throw new Error("Profile ID is required");
    }

    if (!this.initialized) {
      await this.initialize();
    }

    return await ActivityRecorderService.startRecording(profileId);
  }

  /**
   * Pause the current workout
   */
  static async pauseWorkout(): Promise<boolean> {
    return await ActivityRecorderService.pauseRecording();
  }

  /**
   * Resume the current workout
   */
  static async resumeWorkout(): Promise<boolean> {
    return await ActivityRecorderService.resumeRecording();
  }

  /**
   * Stop the current workout (will prompt user to save/discard)
   */
  static async stopWorkout(): Promise<void> {
    await ActivityRecorderService.stopRecording();
  }

  /**
   * Add sensor data to the current workout
   */
  static addSensorData(sensorData: any): void {
    ActivityRecorderService.addSensorData(sensorData);
  }

  /**
   * Get current recording session
   */
  static getCurrentSession(): RecordingSession | null {
    return ActivityRecorderService.getCurrentSession();
  }

  /**
   * Check if currently recording
   */
  static isRecording(): boolean {
    return ActivityRecorderService.isRecording();
  }

  /**
   * Check if currently paused
   */
  static isPaused(): boolean {
    return ActivityRecorderService.isPaused();
  }

  // Activity Management

  /**
   * Get all activities for a user
   */
  static async getActivities(profileId: string): Promise<LocalActivity[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    return await LocalActivityDatabaseService.getActivitiesForProfile(
      profileId,
    );
  }

  /**
   * Get a specific activity
   */
  static async getActivity(activityId: string): Promise<LocalActivity | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    return await LocalActivityDatabaseService.getActivity(activityId);
  }

  /**
   * Delete an activity (local and cloud)
   */
  static async deleteActivity(activityId: string): Promise<boolean> {
    try {
      const activity =
        await LocalActivityDatabaseService.getActivity(activityId);
      if (!activity) return false;

      // Delete local JSON file if it exists
      if (activity.local_fit_file_path) {
        try {
          const fileExists = await FileSystem.getInfoAsync(
            activity.local_fit_file_path,
          );
          if (fileExists.exists) {
            await FileSystem.deleteAsync(activity.local_fit_file_path);
            console.log(
              `Local JSON file deleted: ${activity.local_fit_file_path}`,
            );
          }
        } catch (fileError) {
          console.warn(
            "File deletion failed, continuing with database cleanup:",
            fileError,
          );
        }
      }

      await LocalActivityDatabaseService.deleteActivity(activityId);
      return true;
    } catch (error) {
      console.error("Error deleting activity:", error);
      return false;
    }
  }

  /**
   * Get metadata from cached activity data
   */
  static async getActivityMetadata(activityId: string) {
    const activity = await LocalActivityDatabaseService.getActivity(activityId);
    if (!activity || !activity.cached_metadata) {
      return null;
    }

    try {
      return JSON.parse(activity.cached_metadata);
    } catch (error) {
      console.error("Error parsing cached metadata:", error);
      return null;
    }
  }

  // Sync Management

  /**
   * Sync all pending activities
   */
  static async syncAllActivities(): Promise<{
    success: number;
    failed: number;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    return await ActivitySyncService.syncAll();
  }

  /**
   * Sync a specific activity
   */
  static async syncActivity(activityId: string): Promise<boolean> {
    return await ActivitySyncService.syncActivity(activityId);
  }

  /**
   * Retry syncing a failed activity
   */
  static async retrySyncActivity(activityId: string): Promise<boolean> {
    return await ActivitySyncService.retrySyncActivity(activityId);
  }

  /**
   * Get sync status for all activities
   */
  static async getSyncStatus() {
    return await ActivitySyncService.getSyncStatus();
  }

  /**
   * Clean up successfully synced activities from local storage
   */
  static async cleanupSyncedActivities(): Promise<number> {
    return await ActivitySyncService.cleanupSyncedActivities();
  }

  // Import/Export

  /**
   * Import a FIT file from external source
   */
  static async importFitFile(
    filePath: string,
    fileName?: string,
  ): Promise<string | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    return await ActivitySyncService.importFitFile(filePath, fileName);
  }

  /**
   * Export activity data (JSON file copy to external location)
   */
  static async exportActivityData(
    activityId: string,
    destinationPath: string,
  ): Promise<boolean> {
    try {
      const activity =
        await LocalActivityDatabaseService.getActivity(activityId);
      if (!activity || !activity.local_fit_file_path) {
        return false;
      }

      // TODO: Implement file export
      // This would copy the JSON file to the destination path
      console.log(
        `Export ${activity.local_fit_file_path} to ${destinationPath}`,
      );
      return true;
    } catch (error) {
      console.error("Error exporting activity data:", error);
      return false;
    }
  }

  // Storage Management

  /**
   * Get storage information
   */
  static async getStorageInfo(profileId: string) {
    if (!this.initialized) {
      await this.initialize();
    }

    return await LocalActivityDatabaseService.getStorageInfo(profileId);
  }

  /**
   * Clear all local data (for testing/reset)
   */
  static async clearAllData(): Promise<void> {
    try {
      await LocalActivityDatabaseService.resetDatabase();
      console.log("All local workout data cleared");
    } catch (error) {
      console.error("Error clearing local data:", error);
      throw error;
    }
  }

  // Utility Methods

  /**
   * Format duration in seconds to readable string
   */
  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Format distance in meters to readable string
   */
  static formatDistance(meters: number): string {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${meters.toFixed(0)} m`;
  }

  /**
   * Format pace from speed in m/s
   */
  static formatPace(speedMs: number): string {
    if (speedMs <= 0) return "--:--";

    const paceSeconds = 1000 / speedMs;
    const minutes = Math.floor(paceSeconds / 60);
    const seconds = Math.floor(paceSeconds % 60);

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  /**
   * Show storage usage and sync status to user
   */
  static async showStorageStatus(profileId: string): Promise<void> {
    try {
      const storageInfo = await this.getStorageInfo(profileId);
      const syncStatus = await this.getSyncStatus();

      Alert.alert(
        "Storage Status",
        `Total Activities: ${storageInfo.totalActivities}\n` +
          `Pending Sync: ${syncStatus.pendingActivities}\n` +
          `Failed Sync: ${syncStatus.failedActivities}`,
        [
          { text: "Cancel" },
          {
            text: "Sync Now",
            onPress: async () => {
              const result = await this.syncAllActivities();
              Alert.alert(
                "Sync Complete",
                `Synced: ${result.success}\nFailed: ${result.failed}`,
              );
            },
          },
        ],
      );
    } catch (error) {
      console.error("Error showing storage status:", error);
      Alert.alert("Error", "Failed to get storage information");
    }
  }
}
