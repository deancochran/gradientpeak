import {
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityType,
} from "@repo/core";
import { boolean, jsonb } from "drizzle-orm/pg-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type RecordingState =
  | "pending"
  | "ready"
  | "recording"
  | "paused"
  | "discarded"
  | "finished";

// Activities table - enhanced with recovery fields for consolidated system
export const activityRecordings = sqliteTable("activity_recordings", {
  // Primary identification
  id: text("id")
    .primaryKey()
    .$default(() => crypto.randomUUID()),

  // Timestamps
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => Date.now()),
  finishedAt: integer("finished_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => Date.now()),

  // Recording state
  state: text("state").$type<RecordingState>().notNull(),
  synced: boolean("synced").notNull().default(false),

  // Activity Type
  activityType: text("activity_type").$type<PublicActivityType>().notNull(),

  // Device and app version info
  version: text("version").notNull(),

  // Snapshot data (user's fitness profile at time of activity)
  profileId: text("profile_id").notNull(),
  profileWeightKg: real("profile_weight_kg"),
  profileFtp: real("profile_ftp"),
  profileThresholdHr: integer("profile_threshold_hr"),

  // Planned Activity Data
  plannedActivityId: text("planned_activity_id"),
  plannedActivityName: text("planned_activity_name"),
  plannedActivityDescription: text("planned_activity_description"),
  plannedActivityStructureVersion: text("planned_activity_structure_version"),
  plannedActivityStructure: jsonb("planned_activity_structure"),
  plannedActivityEstimatedDuration: integer(
    "planned_activity_estimated_duration",
  ),
  plannedActivityEstimatedDistance: real("planned_activity_estimated_distance"),
  plannedActivityEstimatedTss: real("planned_activity_estimated_tss"),

  // System metadata
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const activityRecordingStreams = sqliteTable(
  "activity_recording_streams",
  {
    // Primary identification
    id: text("id")
      .primaryKey()
      .$default(() => crypto.randomUUID()),

    // Reference to session
    activityRecordingId: text("activity_recording_id")
      .notNull()
      .references(() => activityRecordings.id, { onDelete: "cascade" }),

    // Metric info
    metric: text("metric").$type<PublicActivityMetric>().notNull(), // e.g., heartRate, moving, power, speed, cadence, gps, moving
    dataType: text("data_type").$type<PublicActivityMetricDataType>().notNull(),

    // Chunk info
    chunkIndex: integer("chunk_index").notNull().default(0),
    sampleCount: integer("sample_count").notNull().default(0),
    startTime: integer("start_time", { mode: "timestamp" }).notNull(),
    endTime: integer("end_time", { mode: "timestamp" }).notNull(),

    // Raw data for this metric chunk
    data: jsonb("data").notNull(),
    timestamps: jsonb("timestamps").notNull(),

    // Sync & metadata
    synced: boolean("synced").notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
);
