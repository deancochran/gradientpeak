import { and, count, desc, eq, sql } from "drizzle-orm";
import * as FileSystem from "expo-file-system";

import { db } from "../db";
import {
  InsertLocalActivity,
  localActivities,
  SelectLocalActivity,
} from "../db/schemas";

export class LocalActivityDatabaseService {
  /**
   * Initialize the database (now handled by DrizzleProvider in _layout.tsx)
   */
  static async initDatabase(): Promise<void> {
    // Database initialization is handled by the DrizzleProvider
    // This method is kept for backward compatibility
    console.log("✅ Database initialization handled by DrizzleProvider");
  }

  /**
   * Create a new activity record
   */
  static async createActivity(activity: InsertLocalActivity): Promise<string> {
    try {
      const [createdActivity] = await db
        .insert(localActivities)
        .values({
          ...activity,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: localActivities.id });

      console.log(`📱 Activity created locally: ${createdActivity.id}`);
      return createdActivity.id;
    } catch (error) {
      console.error("❌ Error creating local activity:", error);
      throw error;
    }
  }

  /**
   * Get an activity by ID
   */
  static async getActivity(
    activityId: string,
  ): Promise<SelectLocalActivity | null> {
    try {
      const [activity] = await db
        .select()
        .from(localActivities)
        .where(eq(localActivities.id, activityId))
        .limit(1);

      return activity || null;
    } catch (error) {
      console.error("❌ Error getting activity:", error);
      throw error;
    }
  }

  /**
   * Get all activities for a profile
   */
  static async getActivitiesForProfile(
    profileId: string,
  ): Promise<SelectLocalActivity[]> {
    try {
      const activities = await db
        .select()
        .from(localActivities)
        .where(eq(localActivities.profileId, profileId))
        .orderBy(desc(localActivities.createdAt));

      return activities;
    } catch (error) {
      console.error("❌ Error getting activities for profile:", error);
      throw error;
    }
  }

  /**
   * Get activities by sync status
   */
  static async getActivitiesByStatus(
    syncStatus: "pending" | "syncing" | "synced" | "sync_failed" | "conflict",
  ): Promise<SelectLocalActivity[]> {
    try {
      const activities = await db
        .select()
        .from(localActivities)
        .where(eq(localActivities.syncStatus, syncStatus))
        .orderBy(desc(localActivities.createdAt));

      return activities;
    } catch (error) {
      console.error("❌ Error getting activities by status:", error);
      throw error;
    }
  }

  /**
   * Get activities that need syncing (pending status)
   */
  static async getPendingSync(): Promise<SelectLocalActivity[]> {
    return this.getActivitiesByStatus("pending");
  }

  /**
   * Get failed sync activities
   */
  static async getFailedSync(): Promise<SelectLocalActivity[]> {
    return this.getActivitiesByStatus("sync_failed");
  }

  /**
   * Update activity sync status
   */
  static async updateSyncStatus(
    activityId: string,
    syncStatus: "pending" | "syncing" | "synced" | "sync_failed" | "conflict",
    cloudStoragePath?: string,
    errorMessage?: string,
    attemptCount?: number,
  ): Promise<void> {
    try {
      const updateData: Partial<SelectLocalActivity> = {
        syncStatus,
        updatedAt: new Date(),
      };

      if (cloudStoragePath !== undefined) {
        updateData.cloudStoragePath = cloudStoragePath;
      }

      if (errorMessage !== undefined) {
        updateData.syncError = errorMessage;
      }

      if (attemptCount !== undefined) {
        updateData.syncAttempts = attemptCount;
        updateData.lastSyncAttempt = new Date();
      }

      await db
        .update(localActivities)
        .set(updateData)
        .where(eq(localActivities.id, activityId));

      console.log(
        `📱 Activity sync status updated: ${activityId} -> ${syncStatus}`,
      );
    } catch (error) {
      console.error("❌ Error updating sync status:", error);
      throw error;
    }
  }

  /**
   * Update activity metrics
   */
  static async updateActivityMetrics(
    activityId: string,
    metrics: {
      avgHeartRate?: number;
      maxHeartRate?: number;
      avgPower?: number;
      maxPower?: number;
      avgCadence?: number;
      elevationGain?: number;
      calories?: number;
      tss?: number;
    },
  ): Promise<void> {
    try {
      await db
        .update(localActivities)
        .set({
          ...metrics,
          updatedAt: new Date(),
        })
        .where(eq(localActivities.id, activityId));

      console.log(`📱 Activity metrics updated: ${activityId}`);
    } catch (error) {
      console.error("❌ Error updating activity metrics:", error);
      throw error;
    }
  }

  /**
   * Delete an activity (and optionally its local file)
   */
  static async deleteActivity(
    activityId: string,
    deleteLocalFile: boolean = true,
  ): Promise<void> {
    try {
      // Get activity to access file path before deletion
      const activity = await this.getActivity(activityId);

      // Delete from database
      await db
        .delete(localActivities)
        .where(eq(localActivities.id, activityId));

      // Delete local file if it exists and deleteLocalFile is true
      if (deleteLocalFile && activity?.localFitFilePath) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(
            activity.localFitFilePath,
          );
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(activity.localFitFilePath);
            console.log(`🗑️ Local file deleted: ${activity.localFitFilePath}`);
          }
        } catch (fileError) {
          console.warn("⚠️ Could not delete local file:", fileError);
          // Don't throw error if file deletion fails
        }
      }

      console.log(`📱 Activity deleted: ${activityId}`);
    } catch (error) {
      console.error("❌ Error deleting activity:", error);
      throw error;
    }
  }

  /**
   * Get total count of activities for a profile
   */
  static async getActivityCount(profileId: string): Promise<number> {
    try {
      const [result] = await db
        .select({ count: count() })
        .from(localActivities)
        .where(eq(localActivities.profileId, profileId));

      return result.count;
    } catch (error) {
      console.error("❌ Error getting activity count:", error);
      throw error;
    }
  }

  /**
   * Get storage and sync statistics
   */
  static async getStorageInfo(profileId: string): Promise<{
    totalActivities: number;
    unsyncedActivities: number;
    failedSyncActivities: number;
    syncedActivities: number;
    syncingActivities: number;
  }> {
    try {
      const [result] = await db
        .select({
          total: count(),
          unsynced: sql<number>`SUM(CASE WHEN ${localActivities.syncStatus} = 'pending' THEN 1 ELSE 0 END)`,
          failed: sql<number>`SUM(CASE WHEN ${localActivities.syncStatus} = 'sync_failed' THEN 1 ELSE 0 END)`,
          synced: sql<number>`SUM(CASE WHEN ${localActivities.syncStatus} = 'synced' THEN 1 ELSE 0 END)`,
          syncing: sql<number>`SUM(CASE WHEN ${localActivities.syncStatus} = 'syncing' THEN 1 ELSE 0 END)`,
        })
        .from(localActivities)
        .where(eq(localActivities.profileId, profileId));

      return {
        totalActivities: result.total,
        unsyncedActivities: result.unsynced,
        failedSyncActivities: result.failed,
        syncedActivities: result.synced,
        syncingActivities: result.syncing,
      };
    } catch (error) {
      console.error("❌ Error getting storage info:", error);
      throw error;
    }
  }

  /**
   * Clean up old synced activities
   */
  static async cleanupOldSyncedActivities(cutoffDate: Date): Promise<number> {
    try {
      // Get activities to delete for file cleanup
      const activitiesToDelete = await db
        .select({
          id: localActivities.id,
          localFitFilePath: localActivities.localFitFilePath,
        })
        .from(localActivities)
        .where(
          and(
            eq(localActivities.syncStatus, "synced"),
            sql`${localActivities.createdAt} < ${cutoffDate.getTime()}`,
          ),
        );

      // Delete local files first
      for (const activity of activitiesToDelete) {
        if (activity.localFitFilePath) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(
              activity.localFitFilePath,
            );
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(activity.localFitFilePath);
            }
          } catch (fileError) {
            console.warn(
              `⚠️ Could not delete file for ${activity.id}:`,
              fileError,
            );
          }
        }
      }

      // Delete from database
      const result = await db
        .delete(localActivities)
        .where(
          and(
            eq(localActivities.syncStatus, "synced"),
            sql`${localActivities.createdAt} < ${cutoffDate.getTime()}`,
          ),
        );

      const deletedCount = activitiesToDelete.length;
      console.log(`🧹 Cleaned up ${deletedCount} old synced activities`);

      return deletedCount;
    } catch (error) {
      console.error("❌ Error cleaning up synced activities:", error);
      throw error;
    }
  }

  /**
   * Get activities that have failed sync attempts with retry eligibility
   */
  static async getRetryEligibleActivities(
    maxAttempts: number = 3,
  ): Promise<SelectLocalActivity[]> {
    try {
      const activities = await db
        .select()
        .from(localActivities)
        .where(
          and(
            eq(localActivities.syncStatus, "sync_failed"),
            sql`${localActivities.syncAttempts} < ${maxAttempts}`,
          ),
        )
        .orderBy(desc(localActivities.lastSyncAttempt));

      return activities;
    } catch (error) {
      console.error("❌ Error getting retry eligible activities:", error);
      throw error;
    }
  }

  /**
   * Reset all activities to pending status (for testing/debugging)
   */
  static async resetAllToPending(profileId?: string): Promise<number> {
    try {
      const whereClause = profileId
        ? eq(localActivities.profileId, profileId)
        : undefined;

      const result = await db
        .update(localActivities)
        .set({
          syncStatus: "pending",
          syncAttempts: 0,
          syncError: null,
          lastSyncAttempt: null,
          updatedAt: new Date(),
        })
        .where(whereClause);

      console.log(`🔄 Reset activities to pending status`);
      return 1; // SQLite doesn't return affected rows count in the same way
    } catch (error) {
      console.error("❌ Error resetting activities:", error);
      throw error;
    }
  }

  /**
   * Get recent activities (last N days)
   */
  static async getRecentActivities(
    profileId: string,
    days: number = 7,
  ): Promise<SelectLocalActivity[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const activities = await db
        .select()
        .from(localActivities)
        .where(
          and(
            eq(localActivities.profileId, profileId),
            sql`${localActivities.createdAt} >= ${cutoffDate.getTime()}`,
          ),
        )
        .orderBy(desc(localActivities.createdAt));

      return activities;
    } catch (error) {
      console.error("❌ Error getting recent activities:", error);
      throw error;
    }
  }

  /**
   * Update activity file path
   */
  static async updateFilePath(
    activityId: string,
    localFitFilePath: string,
  ): Promise<void> {
    try {
      await db
        .update(localActivities)
        .set({
          localFitFilePath,
          updatedAt: new Date(),
        })
        .where(eq(localActivities.id, activityId));

      console.log(`📱 Activity file path updated: ${activityId}`);
    } catch (error) {
      console.error("❌ Error updating file path:", error);
      throw error;
    }
  }
}
