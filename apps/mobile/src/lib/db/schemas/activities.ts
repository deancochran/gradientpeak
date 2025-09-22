import {
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityType,
  PublicSyncStatus,
} from "@repo/core";
import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Activities table - matches Supabase schema structure
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
