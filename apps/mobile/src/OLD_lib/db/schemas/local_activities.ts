import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Schema for activities stored locally during recording sessions.
 * This table holds real-time activity data before it is processed and synced
 * to the cloud.
 */
export const localActivities = sqliteTable("local_activities", {
  id: text("id").primaryKey(), // UUID generated on the client
  name: text("name").notNull(),
  activityType: text("activity_type").notNull(), // e.g., 'run', 'bike'
  startDate: integer("start_date", { mode: "timestamp" }).notNull(),
  // Using real for floating point numbers in SQLite
  totalDistance: real("total_distance").default(0),
  totalTime: integer("total_time").default(0),
  // Foreign key to the online profile ID
  profileId: text("profile_id").notNull(),

  // Sync-related fields
  syncStatus: text("sync_status", {
    enum: ["pending", "syncing", "synced", "sync_failed", "conflict"],
  })
    .notNull()
    .default("pending"),
  syncAttempts: integer("sync_attempts").notNull().default(0),
  lastSyncAttempt: integer("last_sync_attempt", { mode: "timestamp" }),
  syncError: text("sync_error"),

  // File storage paths
  localStoragePath: text("local_storage_path"), // Path to local JSON
  cloudStoragePath: text("cloud_storage_path"), // Path in Supabase Storage

  // Activity metrics
  avgHeartRate: integer("avg_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),
  avgPower: integer("avg_power"),
  maxPower: integer("max_power"),
  avgCadence: integer("avg_cadence"),
  elevationGain: real("elevation_gain"),
  calories: integer("calories"),
  tss: real("tss"), // Training Stress Score

  // Cached processed data
  cached_metadata: text("cached_metadata"), // JSON string of processed activity data

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const localActivitiesRelations = relations(
  localActivities,
  ({ many }) => ({}),
);
