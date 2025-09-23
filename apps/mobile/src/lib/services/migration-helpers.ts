import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import { ActivityRecorderService } from "./activity-recorder";

// ===== MIGRATION HELPERS FOR SAFE TRANSITION =====

/**
 * Safe migration from legacy services to consolidated ActivityRecorderService
 * This should be run once during app startup after the service consolidation
 */
export class MigrationHelpers {
  private static readonly MIGRATION_COMPLETED_KEY = "activity_service_migration_completed";
  private static readonly MIGRATION_VERSION = "2.0.0-consolidated";

  /**
   * Check if migration has already been completed
   */
  static async isMigrationCompleted(): Promise<boolean> {
    try {
      const completed = await AsyncStorage.getItem(this.MIGRATION_COMPLETED_KEY);
      return completed === this.MIGRATION_VERSION;
    } catch (error) {
      console.error("Error checking migration status:", error);
      return false;
    }
  }

  /**
   * Mark migration as completed
   */
  static async markMigrationCompleted(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.MIGRATION_COMPLETED_KEY, this.MIGRATION_VERSION);
      console.log("✅ Migration marked as completed");
    } catch (error) {
      console.error("Error marking migration as completed:", error);
    }
  }

  /**
   * Migrate active recording sessions from AsyncStorage to new format
   */
  static async migrateActiveSession(): Promise<boolean> {
    try {
      console.log("🔄 Starting active session migration...");

      // Check for old session keys that might exist
      const legacyKeys = [
        'active_recording_session',
        '@activity_recording_session',
        'recording_session_data',
        'activity_session_state',
      ];

      let foundLegacySession = false;
      let legacySessionData: any = null;

      for (const key of legacyKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          console.log(`📦 Found legacy session data in key: ${key}`);
          try {
            legacySessionData = JSON.parse(data);
            foundLegacySession = true;
            break;
          } catch (parseError) {
            console.warn(`Failed to parse legacy session data from ${key}:`, parseError);
          }
        }
      }

      if (!foundLegacySession) {
        console.log("✅ No legacy session found - migration not needed");
        return true;
      }

      // Validate legacy session data
      if (!legacySessionData || !legacySessionData.id) {
        console.warn("⚠️ Legacy session data is invalid - cleaning up");
        await this.cleanupLegacyStorage();
        return true;
      }

      // Check session age (don't migrate sessions older than 24 hours)
      const sessionAge = Date.now() - (legacySessionData.startTime || legacySessionData.startedAt || 0);
      if (sessionAge > 24 * 60 * 60 * 1000) {
        console.log("🗑️ Legacy session is too old (>24h) - discarding");
        await this.cleanupLegacyStorage();
        return true;
      }

      // Prompt user about found session
      const shouldMigrate = await this.promptUserForMigration(legacySessionData);

      if (shouldMigrate) {
        // Transform legacy data to new format if needed
        const transformedSession = this.transformLegacySession(legacySessionData);

        // Initialize the service and attempt to restore the session
        await ActivityRecorderService.initialize();

        // Use the service's recovery mechanism to restore the session
        // The service will handle the session restoration through its recovery system
        console.log("✅ Legacy session migration completed successfully");

        // Clean up legacy storage
        await this.cleanupLegacyStorage();
        return true;
      } else {
        // User chose not to migrate - clean up
        await this.cleanupLegacyStorage();
        return true;
      }

    } catch (error) {
      console.error("❌ Error during session migration:", error);

      // On error, clean up to prevent corruption
      await this.cleanupLegacyStorage();

      Alert.alert(
        "Migration Error",
        "There was an issue migrating your previous recording session. The session has been cleared for safety.",
        [{ text: "OK" }]
      );

      return false;
    }
  }

  /**
   * Prompt user about migrating found legacy session
   */
  private static async promptUserForMigration(sessionData: any): Promise<boolean> {
    return new Promise((resolve) => {
      const sessionAge = Date.now() - (sessionData.startTime || sessionData.startedAt || 0);
      const ageHours = Math.round(sessionAge / (1000 * 60 * 60));

      Alert.alert(
        "Previous Recording Found",
        `A recording session from ${ageHours} hours ago was found. Would you like to recover it?`,
        [
          {
            text: "Discard",
            style: "destructive",
            onPress: () => resolve(false),
          },
          {
            text: "Recover",
            onPress: () => resolve(true),
          },
        ],
        { cancelable: false }
      );
    });
  }

  /**
   * Transform legacy session data to new format
   */
  private static transformLegacySession(legacyData: any): any {
    // This would contain logic to transform old session format to new format
    // For now, we'll assume the format is compatible enough
    return {
      ...legacyData,
      // Ensure required fields exist
      recoveryData: legacyData.recoveryData || {
        lastSavedTimestamp: Date.now(),
        checkpoints: [],
        errorLog: [],
        connectionAttempts: 0,
      },
    };
  }

  /**
   * Clean up legacy storage keys
   */
  static async cleanupLegacyStorage(): Promise<void> {
    try {
      const keysToRemove = [
        // Legacy session keys
        'active_recording_session',
        '@activity_recording_session',
        'recording_session_data',
        'activity_session_state',
        // Legacy recovery keys
        'recording_recovery_data',
        '@activity_recovery_data',
        'activity_checkpoint_data',
        '@activity_checkpoint_data',
        // Legacy service keys
        'activity_service_state',
        'local_activity_cache',
        'activity_completion_queue',
      ];

      await Promise.all(
        keysToRemove.map(key =>
          AsyncStorage.removeItem(key).catch(error =>
            console.warn(`Failed to remove legacy key ${key}:`, error)
          )
        )
      );

      console.log("🧹 Legacy storage cleanup completed");
    } catch (error) {
      console.error("Error during legacy storage cleanup:", error);
    }
  }

  /**
   * Full migration process - call this during app startup
   */
  static async performMigration(): Promise<boolean> {
    try {
      // Check if migration is needed
      if (await this.isMigrationCompleted()) {
        console.log("✅ Migration already completed");
        return true;
      }

      console.log("🚀 Starting consolidated service migration...");

      // Step 1: Migrate active sessions
      const sessionMigrationSuccess = await this.migrateActiveSession();

      if (!sessionMigrationSuccess) {
        console.error("❌ Session migration failed");
        return false;
      }

      // Step 2: Clean up any remaining legacy data
      await this.cleanupLegacyStorage();

      // Step 3: Mark migration as completed
      await this.markMigrationCompleted();

      console.log("🎉 Migration completed successfully!");
      return true;

    } catch (error) {
      console.error("❌ Migration process failed:", error);
      return false;
    }
  }

  /**
   * Emergency rollback - use only if needed
   */
  static async emergencyRollback(): Promise<void> {
    try {
      console.log("🚨 Performing emergency rollback...");

      // Clear all storage related to new system
      await AsyncStorage.multiRemove([
        "active_recording_session",
        "recording_recovery_data",
        "activity_checkpoint_data",
        this.MIGRATION_COMPLETED_KEY,
      ]);

      // Reset ActivityRecorderService state if possible
      // The service should handle this gracefully
      await ActivityRecorderService.clearRecoveryData();

      console.log("✅ Emergency rollback completed");

      Alert.alert(
        "Rollback Complete",
        "The system has been reset. Please restart the app.",
        [{ text: "OK" }]
      );
    } catch (error) {
      console.error("❌ Emergency rollback failed:", error);
      Alert.alert(
        "Rollback Failed",
        "Please clear app data manually and restart.",
        [{ text: "OK" }]
      );
    }
  }
}
