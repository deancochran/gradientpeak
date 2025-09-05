import * as SQLite from "expo-sqlite";

import type { LocalActivity } from "../types/activity";

const DATABASE_NAME = "turbofit_local.db";
const DATABASE_VERSION = 1;

export class LocalActivityDatabaseService {
  private static db: SQLite.SQLiteDatabase | null = null;

  /**
   * Initialize the local database
   */
  static async initDatabase(): Promise<void> {
    if (this.db) return;

    try {
      this.db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await this.createTables();
      console.log("Local activity database initialized");
    } catch (error) {
      console.error("Error initializing local database:", error);
      throw error;
    }
  }

  /**
   * Create necessary tables
   */
  private static async createTables(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized");

    try {
      // Activities table - matches the Supabase schema structure but with local timestamps
      // Note: SQLite doesn't have native UUID type, so we use TEXT but validate UUID format
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS activities (
          id TEXT PRIMARY KEY NOT NULL,
          profile_id TEXT NOT NULL,
          local_fit_file_path TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'local_only',
          cloud_storage_path TEXT,
          sync_error_message TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          cached_metadata TEXT
        );
      `);
      console.log("Activities table created successfully");

      // Index for faster queries
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_activities_profile_id ON activities(profile_id);
        CREATE INDEX IF NOT EXISTS idx_activities_sync_status ON activities(sync_status);
        CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);
      `);

      console.log("Database tables created successfully");
    } catch (error) {
      console.error("Database creation error:", error);
      throw error;
    }
  }

  /**
   * Create a new activity record
   */
  static async createActivity(activity: LocalActivity): Promise<string> {
    if (!this.db) await this.initDatabase();

    // Validate that the activity ID looks like a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(activity.id)) {
      console.warn(`Activity ID does not appear to be a valid UUID: ${activity.id}`);
    }

    try {
      await this.db!.runAsync(
        `INSERT INTO activities (
          id, profile_id, local_fit_file_path, sync_status,
          cloud_storage_path, sync_error_message, created_at, updated_at, cached_metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          activity.id,
          activity.profile_id,
          activity.local_fit_file_path,
          activity.sync_status,
          activity.cloud_storage_path || null,
          activity.sync_error_message || null,
          activity.created_at,
          activity.updated_at,
          activity.cached_metadata || null,
        ],
      );

      console.log(`Activity created: ${activity.id}`);
      return activity.id;
    } catch (error) {
      console.error("Error creating activity:", error);
      throw error;
    }
  }

  /**
   * Get an activity by ID
   */
  static async getActivity(activityId: string): Promise<LocalActivity | null> {
    if (!this.db) await this.initDatabase();

    try {
      const result = await this.db!.getFirstAsync<LocalActivity>(
        "SELECT * FROM activities WHERE id = ?",
        [activityId],
      );
      return result || null;
    } catch (error) {
      console.error("Error getting activity:", error);
      throw error;
    }
  }

  /**
   * Get all activities for a profile
   */
  static async getActivitiesForProfile(
    profileId: string,
  ): Promise<LocalActivity[]> {
    if (!this.db) await this.initDatabase();

    try {
      const results = await this.db!.getAllAsync<LocalActivity>(
        "SELECT * FROM activities WHERE profile_id = ? ORDER BY created_at DESC",
        [profileId],
      );
      return results;
    } catch (error) {
      console.error("Error getting activities for profile:", error);
      throw error;
    }
  }

  /**
   * Get activities by sync status
   */
  static async getActivitiesByStatus(
    syncStatus: string,
  ): Promise<LocalActivity[]> {
    if (!this.db) await this.initDatabase();

    try {
      const results = await this.db!.getAllAsync<LocalActivity>(
        "SELECT * FROM activities WHERE sync_status = ? ORDER BY created_at DESC",
        [syncStatus],
      );
      return results;
    } catch (error) {
      console.error("Error getting activities by status:", error);
      throw error;
    }
  }

  /**
   * Update activity sync status
   */
  static async updateSyncStatus(
    activityId: string,
    syncStatus: string,
    cloudStoragePath?: string,
    errorMessage?: string,
  ): Promise<void> {
    if (!this.db) await this.initDatabase();

    try {
      await this.db!.runAsync(
        `UPDATE activities
         SET sync_status = ?, cloud_storage_path = ?, sync_error_message = ?, updated_at = ?
         WHERE id = ?`,
        [
          syncStatus,
          cloudStoragePath || null,
          errorMessage || null,
          Date.now(),
          activityId,
        ],
      );

      console.log(
        `Activity sync status updated: ${activityId} -> ${syncStatus}`,
      );
    } catch (error) {
      console.error("Error updating sync status:", error);
      throw error;
    }
  }

  /**
   * Update cached metadata
   */
  static async updateCachedMetadata(
    activityId: string,
    metadata: string,
  ): Promise<void> {
    if (!this.db) await this.initDatabase();

    try {
      await this.db!.runAsync(
        "UPDATE activities SET cached_metadata = ?, updated_at = ? WHERE id = ?",
        [metadata, Date.now(), activityId],
      );

      console.log(`Activity metadata updated: ${activityId}`);
    } catch (error) {
      console.error("Error updating cached metadata:", error);
      throw error;
    }
  }

  /**
   * Delete an activity (and its FIT file)
   */
  static async deleteActivity(activityId: string): Promise<void> {
    if (!this.db) await this.initDatabase();

    try {
      await this.db!.runAsync("DELETE FROM activities WHERE id = ?", [
        activityId,
      ]);

      console.log(`Activity deleted: ${activityId}`);
    } catch (error) {
      console.error("Error deleting activity:", error);
      throw error;
    }
  }

  /**
   * Get activities that need to be synced
   */
  static async getActivitiesNeedingSync(): Promise<LocalActivity[]> {
    return this.getActivitiesByStatus("local_only");
  }

  /**
   * Get failed sync activities
   */
  static async getFailedSyncActivities(): Promise<LocalActivity[]> {
    return this.getActivitiesByStatus("sync_failed");
  }

  /**
   * Get total count of activities for a profile
   */
  static async getActivityCount(profileId: string): Promise<number> {
    if (!this.db) await this.initDatabase();

    try {
      const result = await this.db!.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM activities WHERE profile_id = ?",
        [profileId],
      );
      return result?.count || 0;
    } catch (error) {
      console.error("Error getting activity count:", error);
      throw error;
    }
  }

  /**
   * Get storage usage (sum of FIT file sizes would need to be calculated separately)
   */
  static async getStorageInfo(profileId: string): Promise<{
    totalActivities: number;
    unsyncedActivities: number;
    failedSyncActivities: number;
  }> {
    if (!this.db) await this.initDatabase();

    try {
      const result = await this.db!.getFirstAsync<{
        total: number;
        unsynced: number;
        failed: number;
      }>(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN sync_status = 'local_only' THEN 1 ELSE 0 END) as unsynced,
          SUM(CASE WHEN sync_status = 'sync_failed' THEN 1 ELSE 0 END) as failed
         FROM activities WHERE profile_id = ?`,
        [profileId],
      );

      return {
        totalActivities: result?.total || 0,
        unsyncedActivities: result?.unsynced || 0,
        failedSyncActivities: result?.failed || 0,
      };
    } catch (error) {
      console.error("Error getting storage info:", error);
      throw error;
    }
  }

  /**
   * Clean up synced activities (remove local records after successful sync)
   */
  static async cleanupSyncedActivities(): Promise<number> {
    if (!this.db) await this.initDatabase();

    try {
      const result = await this.db!.runAsync(
        "DELETE FROM activities WHERE sync_status = 'synced'",
      );

      const deletedCount = result.changes;
      console.log(`Cleaned up ${deletedCount} synced activities`);
      return deletedCount;
    } catch (error) {
      console.error("Error cleaning up synced activities:", error);
      throw error;
    }
  }

  /**
   * Reset database (for development/testing)
   */
  static async resetDatabase(): Promise<void> {
    if (!this.db) await this.initDatabase();

    try {
      await this.db!.execAsync("DROP TABLE IF EXISTS activities");
      console.log("Database reset complete");
      await this.createTables();
    } catch (error) {
      console.error("Error resetting database:", error);
      throw error;
    }
  }
}
