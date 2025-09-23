import {
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityType,
  PublicSyncStatus,
} from "@repo/core";
import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Activities table - enhanced with recovery fields for consolidated system
export const activities = sqliteTable("activities", {
  // Primary identification
  id: text("id").primaryKey(), // UUID stored as text in SQLite
  idx: integer("idx"), // Serial equivalent, managed by app
  profileId: text("profile_id").notNull(),

  // Activity metadata
  name: text("name").notNull(),
  notes: text("notes"),
  localFilePath: text("local_file_path").notNull(),
  syncStatus: text("sync_status")
    .$type<PublicSyncStatus>()
    .notNull()
    .default("local_only"),

  // Activity Type - renamed to match Supabase column name
  activityType: text("activity_type")
    .$type<PublicActivityType>()
    .notNull()
    .default("other"),

  // Timing information
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  totalTime: integer("total_time").notNull().default(0),
  movingTime: integer("moving_time").notNull().default(0),

  // ===== ENHANCED RECOVERY AND FAULT TOLERANCE FIELDS =====
  // Recovery checkpoint data (JSON string containing checkpoint history)
  recoveryCheckpoints: text("recovery_checkpoints"), // JSON string of ActivityCheckpoint[]

  // Last successful checkpoint timestamp
  lastCheckpointAt: integer("last_checkpoint_at", { mode: "timestamp" }),

  // Error log for debugging and recovery (JSON string)
  errorLog: text("error_log"), // JSON string of ErrorLogEntry[]

  // Recording session state for recovery
  sessionState: text("session_state"), // 'idle' | 'recording' | 'paused' | 'finished'

  // Recovery attempt count (for limiting recovery attempts)
  recoveryAttempts: integer("recovery_attempts").default(0),

  // Planned activity reference (if this was from a planned workout)
  plannedActivityId: text("planned_activity_id"),

  // Device and app version info for debugging
  recordingVersion: text("recording_version"), // e.g., "2.0.0-consolidated"
  devicePlatform: text("device_platform"), // iOS/Android
  appVersion: text("app_version"),

  // Snapshot data (user's fitness profile at time of activity)
  snapshotWeightKg: integer("snapshot_weight_kg").notNull(),
  snapshotFtp: integer("snapshot_ftp").notNull(),
  snapshotThresholdHr: integer("snapshot_threshold_hr").notNull(),

  // Performance metrics
  tss: integer("tss").notNull(), // Training Stress Score
  intensityFactor: integer("if").notNull(), // Note: 'if' is renamed to avoid keyword conflict
  normalizedPower: integer("normalized_power"),
  avgPower: integer("avg_power"),
  peakPower: integer("peak_power"),

  // Heart rate metrics
  avgHeartRate: integer("avg_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),

  // Cadence metrics
  avgCadence: integer("avg_cadence"),
  maxCadence: integer("max_cadence"),

  // Distance and speed metrics
  distance: integer("distance"),
  avgSpeed: real("avg_speed"), // numeric(5,2) equivalent in SQLite
  maxSpeed: real("max_speed"), // numeric(5,2) equivalent in SQLite

  // Elevation metrics
  totalAscent: integer("total_ascent"),
  totalDescent: integer("total_descent"),

  // System metadata
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Activity streams table - matches Supabase schema structure
export const activityStreams = sqliteTable("activity_streams", {
  // Primary identification
  id: text("id").primaryKey(), // UUID stored as text in SQLite
  activityId: text("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),

  // Stream metadata
  type: text("type").$type<PublicActivityMetric>().notNull(),
  dataType: text("data_type").$type<PublicActivityMetricDataType>().notNull(),
  chunkIndex: integer("chunk_index").notNull().default(0),
  originalSize: integer("original_size").notNull(),

  // Stream data (JSONB equivalent stored as text in SQLite)
  data: text("data").notNull(), // JSON stringified data

  // System metadata
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),

  // Additional local-only fields for fault tolerance
  syncStatus: text("sync_status")
    .$type<PublicSyncStatus>()
    .notNull()
    .default("local_only"),
});

// Relations definition
export const activitiesRelations = relations(activities, ({ many }) => ({
  streams: many(activityStreams),
}));

export const activityStreamsRelations = relations(
  activityStreams,
  ({ one }) => ({
    activity: one(activities, {
      fields: [activityStreams.activityId],
      references: [activities.id],
    }),
  }),
);

// ===== MIGRATION HELPERS FOR SAFE SCHEMA UPDATES =====

/**
 * Migration helper to safely add recovery fields
 * This would be used in a Drizzle migration script
 */
export const addRecoveryFieldsMigration = `
  -- Add recovery and checkpoint fields with safe defaults
  ALTER TABLE activities ADD COLUMN recovery_checkpoints TEXT;
  ALTER TABLE activities ADD COLUMN last_checkpoint_at INTEGER;
  ALTER TABLE activities ADD COLUMN error_log TEXT;
  ALTER TABLE activities ADD COLUMN session_state TEXT;
  ALTER TABLE activities ADD COLUMN recovery_attempts INTEGER DEFAULT 0;
  ALTER TABLE activities ADD COLUMN planned_activity_id TEXT;
  ALTER TABLE activities ADD COLUMN recording_version TEXT;
  ALTER TABLE activities ADD COLUMN device_platform TEXT;
  ALTER TABLE activities ADD COLUMN app_version TEXT;

  -- Update existing records to have safe defaults
  UPDATE activities SET session_state = 'finished' WHERE session_state IS NULL;
  UPDATE activities SET recovery_attempts = 0 WHERE recovery_attempts IS NULL;
`;

/**
 * Rollback migration to remove recovery fields if needed
 */
export const removeRecoveryFieldsMigration = `
  -- Remove recovery fields (use with caution in production)
  ALTER TABLE activities DROP COLUMN recovery_checkpoints;
  ALTER TABLE activities DROP COLUMN last_checkpoint_at;
  ALTER TABLE activities DROP COLUMN error_log;
  ALTER TABLE activities DROP COLUMN session_state;
  ALTER TABLE activities DROP COLUMN recovery_attempts;
  ALTER TABLE activities DROP COLUMN planned_activity_id;
  ALTER TABLE activities DROP COLUMN recording_version;
  ALTER TABLE activities DROP COLUMN device_platform;
  ALTER TABLE activities DROP COLUMN app_version;
`;

// ===== TYPE EXPORTS FOR ENHANCED SCHEMA =====

/**
 * Enhanced activity type with recovery fields
 */
export type EnhancedActivity = typeof activities.$inferSelect;

/**
 * Enhanced activity insert type with recovery fields
 */
export type EnhancedInsertActivity = typeof activities.$inferInsert;

/**
 * Activity stream type
 */
export type ActivityStream = typeof activityStreams.$inferSelect;

/**
 * Activity stream insert type
 */
export type InsertActivityStream = typeof activityStreams.$inferInsert;
