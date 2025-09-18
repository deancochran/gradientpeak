import * as FileSystem from "expo-file-system";
import * as Network from "expo-network";
import { AppState, AppStateStatus } from "react-native";

import { apiClient } from "../api";
import { SelectLocalActivity } from "../db/schemas";
import { supabase } from "../supabase";
import { LocalActivityDatabaseService } from "./local-activity-database";

export interface SyncResult {
  success: number;
  failed: number;
  skipped: number;
  conflicts: number;
  details: Array<{
    activityId: string;
    status: "success" | "failed" | "skipped" | "conflict";
    error?: string;
    action?: "created" | "updated";
  }>;
}

export interface SyncStatus {
  isOnline: boolean;
  syncInProgress: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncAttempt: Date | null;
  nextRetryAt: Date | null;
}

export class ActivitySyncService {
  private static isInitialized = false;
  private static syncInProgress = false;
  private static syncQueue: Set<string> = new Set();
  private static retryTimeouts = new Map<string, NodeJS.Timeout>();
  private static appStateSubscription: any;

  // Configuration
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s
  private static readonly BATCH_SIZE = 5;
  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  /**
   * Initialize the sync service with proper error handling
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await LocalActivityDatabaseService.initDatabase();
      this.setupSyncListeners();
      this.isInitialized = true;
      console.log("✅ Activity sync service initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize activity sync service:", error);
      throw new Error(
        `Sync service initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Sync all pending activities with improved error handling and batching
   */
  static async syncAll(): Promise<SyncResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.syncInProgress) {
      console.log("⏳ Sync already in progress, returning previous state");
      return { success: 0, failed: 0, skipped: 0, conflicts: 0, details: [] };
    }

    const result: SyncResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      conflicts: 0,
      details: [],
    };

    try {
      this.syncInProgress = true;

      // Check network connectivity
      const isOnline = await this.isNetworkAvailable();
      if (!isOnline) {
        console.log("🔌 No network connection, sync postponed");
        return result;
      }

      // Get user session
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("Authentication required for sync");
      }

      // Get pending activities
      const pendingActivities =
        await LocalActivityDatabaseService.getPendingSync();
      if (pendingActivities.length === 0) {
        console.log("📱 No activities to sync");
        return result;
      }

      console.log(
        `🔄 Starting sync for ${pendingActivities.length} activities`,
      );

      // Process activities in batches
      const batches = this.createBatches(pendingActivities, this.BATCH_SIZE);

      for (const batch of batches) {
        const batchResults = await this.syncBatch(batch, user.id);

        // Aggregate results
        result.success += batchResults.success;
        result.failed += batchResults.failed;
        result.skipped += batchResults.skipped;
        result.conflicts += batchResults.conflicts;
        result.details.push(...batchResults.details);
      }

      console.log(
        `✅ Sync completed: ${result.success} success, ${result.failed} failed`,
      );

      return result;
    } catch (error) {
      console.error("❌ Sync all failed:", error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync a single activity with comprehensive error handling
   */
  static async syncActivity(activityId: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Prevent duplicate sync attempts
    if (this.syncQueue.has(activityId)) {
      console.log(`⏳ Activity ${activityId} already in sync queue`);
      return false;
    }

    this.syncQueue.add(activityId);

    try {
      // Get user session
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("Authentication required for sync");
      }

      // Get activity from local database
      const activity =
        await LocalActivityDatabaseService.getActivity(activityId);
      if (!activity) {
        throw new Error(`Activity ${activityId} not found in local database`);
      }

      // Check if already synced
      if (activity.syncStatus === "synced") {
        console.log(`✅ Activity ${activityId} already synced`);
        return true;
      }

      const success = await this.syncSingleActivityWithRetry(activity, user.id);
      return success;
    } catch (error) {
      console.error(`❌ Error syncing activity ${activityId}:`, error);

      // Update sync status to failed
      await LocalActivityDatabaseService.updateSyncStatus(
        activityId,
        "sync_failed",
        undefined,
        error instanceof Error ? error.message : "Unknown error",
      );

      return false;
    } finally {
      this.syncQueue.delete(activityId);
    }
  }

  /**
   * Get comprehensive sync status
   */
  static async getSyncStatus(): Promise<SyncStatus> {
    try {
      const isOnline = await this.isNetworkAvailable();
      const pendingActivities =
        await LocalActivityDatabaseService.getPendingSync();
      const failedActivities =
        await LocalActivityDatabaseService.getFailedSync();

      return {
        isOnline,
        syncInProgress: this.syncInProgress,
        pendingCount: pendingActivities.length,
        failedCount: failedActivities.length,
        lastSyncAttempt: null, // Could be stored in AsyncStorage
        nextRetryAt: null, // Could be calculated based on retry logic
      };
    } catch (error) {
      console.error("❌ Error getting sync status:", error);
      return {
        isOnline: false,
        syncInProgress: false,
        pendingCount: 0,
        failedCount: 0,
        lastSyncAttempt: null,
        nextRetryAt: null,
      };
    }
  }

  /**
   * Retry failed activity sync with exponential backoff
   */
  static async retrySyncActivity(activityId: string): Promise<boolean> {
    try {
      const activity =
        await LocalActivityDatabaseService.getActivity(activityId);
      if (!activity) {
        throw new Error(`Activity ${activityId} not found`);
      }

      if (activity.syncAttempts >= this.MAX_RETRY_ATTEMPTS) {
        console.log(
          `⚠️ Activity ${activityId} has exceeded max retry attempts`,
        );
        return false;
      }

      // Reset sync status and attempt sync
      await LocalActivityDatabaseService.updateSyncStatus(
        activityId,
        "pending",
      );
      return await this.syncActivity(activityId);
    } catch (error) {
      console.error(
        `❌ Error retrying sync for activity ${activityId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Clean up successfully synced activities from local storage
   */
  static async cleanupSyncedActivities(
    olderThanDays: number = 7,
  ): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const cleanedCount =
        await LocalActivityDatabaseService.cleanupOldSyncedActivities(
          cutoffDate,
        );
      console.log(`🧹 Cleaned up ${cleanedCount} old synced activities`);

      return cleanedCount;
    } catch (error) {
      console.error("❌ Error cleaning up synced activities:", error);
      return 0;
    }
  }

  // Private helper methods

  /**
   * Sync a batch of activities
   */
  private static async syncBatch(
    activities: SelectLocalActivity[],
    userId: string,
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      conflicts: 0,
      details: [],
    };

    for (const activity of activities) {
      try {
        const success = await this.syncSingleActivityWithRetry(
          activity,
          userId,
        );

        if (success) {
          result.success++;
          result.details.push({
            activityId: activity.id,
            status: "success",
          });
        } else {
          result.failed++;
          result.details.push({
            activityId: activity.id,
            status: "failed",
            error: "Sync failed after retries",
          });
        }
      } catch (error) {
        result.failed++;
        result.details.push({
          activityId: activity.id,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return result;
  }

  /**
   * Sync single activity with retry logic
   */
  private static async syncSingleActivityWithRetry(
    activity: SelectLocalActivity,
    userId: string,
  ): Promise<boolean> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        // Update attempt count
        await LocalActivityDatabaseService.updateSyncStatus(
          activity.id,
          "syncing",
          undefined,
          undefined,
          attempt + 1,
        );

        const success = await this.syncSingleActivity(activity, userId);

        if (success) {
          return true;
        }
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error("Unknown sync error");
        console.error(
          `❌ Sync attempt ${attempt + 1} failed for ${activity.id}:`,
          lastError.message,
        );

        // Wait before retry (except on last attempt)
        if (attempt < this.MAX_RETRY_ATTEMPTS - 1) {
          await this.sleep(this.RETRY_DELAYS[attempt] || 15000);
        }
      }
    }

    // All attempts failed
    await LocalActivityDatabaseService.updateSyncStatus(
      activity.id,
      "sync_failed",
      undefined,
      lastError?.message || "All retry attempts failed",
      this.MAX_RETRY_ATTEMPTS,
    );

    return false;
  }

  /**
   * Core sync logic for a single activity
   */
  private static async syncSingleActivity(
    activity: SelectLocalActivity,
    userId: string,
  ): Promise<boolean> {
    try {
      console.log(`🔄 Syncing activity: ${activity.id} to Next.js API`);

      // Validate file exists and is readable
      if (!activity.localStoragePath) {
        throw new Error("No local file path found for activity");
      }

      const fileExists = await FileSystem.getInfoAsync(
        activity.localStoragePath,
      );
      if (!fileExists.exists) {
        throw new Error(
          `Activity file not found: ${activity.localStoragePath}`,
        );
      }

      // Check file size
      if (fileExists.size && fileExists.size > this.MAX_FILE_SIZE) {
        throw new Error(`Activity file too large: ${fileExists.size} bytes`);
      }

      // Read and validate JSON data
      const jsonData = await FileSystem.readAsStringAsync(
        activity.localStoragePath,
        { encoding: FileSystem.EncodingType.UTF8 },
      );

      let activityData;
      try {
        activityData = JSON.parse(jsonData);
      } catch (parseError) {
        throw new Error("Invalid JSON data in activity file");
      }

      // Step 1: Upload to Supabase Storage (keep this direct!)
      const fileName = `${userId}/${activity.id}.json`;
      const { error: uploadError } = await supabase.storage
        .from("activity-json-files")
        .upload(fileName, new Blob([jsonData], { type: "application/json" }), {
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      console.log(`📁 Activity JSON uploaded to Supabase Storage: ${fileName}`);

      // Step 2: Call Next.js API for metadata and processing
      const syncResponse = await apiClient.syncActivity({
        activityId: activity.id,
        startedAt: activityData.startedAt || activity.startDate.toISOString(),
        liveMetrics: {
          name: activity.name,
          sport: activity.activityType,
          duration: activity.totalTime || 0,
          distance: activity.totalDistance || 0,
          elevationGain: activity.elevationGain,
          calories: activity.calories,
          avgHeartRate: activity.avgHeartRate,
          maxHeartRate: activity.maxHeartRate,
          avgPower: activity.avgPower,
          maxPower: activity.maxPower,
          avgCadence: activity.avgCadence,
          tss: activity.tss,
          notes: activityData.notes,
        },
        filePath: fileName,
      });

      if (!syncResponse.success) {
        throw new Error(syncResponse.error || "API sync failed");
      }

      console.log(
        `✅ Activity ${activity.id} synced successfully via Next.js API`,
      );

      // Update local status to synced
      await LocalActivityDatabaseService.updateSyncStatus(
        activity.id,
        "synced",
        fileName,
      );

      // Clean up local JSON file after successful sync
      try {
        await FileSystem.deleteAsync(activity.localStoragePath);
        console.log(`🗑️ Local JSON file deleted: ${activity.localStoragePath}`);

        // Clear the local storage path from the database
        await LocalActivityDatabaseService.updateActivity(activity.id, {
          localStoragePath: null,
        });
      } catch (deleteError) {
        console.warn(`⚠️ Failed to delete local JSON file: ${deleteError}`);
      }

      return true;
    } catch (error) {
      console.error(`❌ Error syncing activity ${activity.id}:`, error);
      throw error;
    }
  }

  /**
   * Check network connectivity
   */
  static async isNetworkAvailable(): Promise<boolean> {
    try {
      const networkState = await Network.getNetworkStateAsync();
      return networkState.isConnected === true;
    } catch (error) {
      console.error("❌ Network check failed:", error);
      return false;
    }
  }

  /**
   * Set up sync listeners for app state changes
   */
  private static setupSyncListeners(): void {
    // Listen to app state changes
    this.appStateSubscription = AppState.addEventListener(
      "change",
      this.handleAppStateChange.bind(this),
    );

    console.log("🔔 Sync listeners initialized");
  }

  /**
   * Handle app state changes for automatic sync
   */
  private static async handleAppStateChange(
    nextAppState: AppStateStatus,
  ): Promise<void> {
    if (nextAppState === "active") {
      console.log("📱 App became active, checking for pending sync");

      try {
        const isOnline = await this.isNetworkAvailable();
        if (isOnline) {
          // Trigger background sync after a short delay
          setTimeout(() => {
            this.syncAll().catch((error) => {
              console.error("❌ Background sync failed:", error);
            });
          }, 2000);
        }
      } catch (error) {
        console.error("❌ Error in app state change handler:", error);
      }
    }
  }

  /**
   * Create batches from array
   */
  private static createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Sleep utility for retry delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Format duration for logging
   */
  private static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  }

  /**
   * Import a JSON file from external source
   */
  static async importJsonFile(
    filePath: string,
    fileName?: string,
  ): Promise<string | null> {
    try {
      console.log("📂 Importing JSON file:", filePath);

      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        throw new Error("JSON file not found");
      }

      // Read and parse JSON file
      const jsonContent = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const activityData = JSON.parse(jsonContent);

      // Validate required fields
      if (!activityData.activityRecord) {
        throw new Error("Invalid JSON format: missing activityRecord");
      }

      const activityRecord = activityData.activityRecord;

      // Create local activity entry
      const localActivity = {
        id: activityRecord.id,
        name: fileName || activityRecord.name,
        activityType: activityRecord.activityType,
        startDate: new Date(activityRecord.startTime),
        totalDistance: activityRecord.distance,
        totalTime: activityRecord.totalTime,
        profileId: activityRecord.profileId,
        localStoragePath: filePath,
        avgHeartRate: activityRecord.averageHeartRate,
        maxHeartRate: activityRecord.maxHeartRate,
        avgPower: activityRecord.averagePower,
        maxPower: activityRecord.maxPower,
        avgCadence: activityRecord.averageCadence,
        elevationGain: activityRecord.elevation?.gain,
        calories: activityRecord.calories,
        tss: activityRecord.trainingStressScore,
        syncStatus: "pending" as const,
        syncAttempts: 0,
      };

      // Save to local database
      await LocalActivityDatabaseService.createActivity(localActivity);

      console.log("✅ JSON file imported successfully:", activityRecord.id);
      return activityRecord.id;
    } catch (error) {
      console.error("❌ Failed to import JSON file:", error);
      throw error;
    }
  }

  /**
   * Cleanup method for when the service is destroyed
   */
  static cleanup(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    // Clear any pending retry timeouts
    this.retryTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.retryTimeouts.clear();

    this.isInitialized = false;
    console.log("🧹 Activity sync service cleaned up");
  }
}
