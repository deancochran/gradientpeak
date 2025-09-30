import {
  PublicActivityMetric,
  PublicActivityMetricDataType,
  PublicActivityType,
} from "@repo/core";
import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type RecordingState = "ready" | "recording" | "paused" | "finished";

// Activities table
export const activityRecordings = sqliteTable("activity_recordings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  state: text("state").notNull().$type<RecordingState>().default("ready"),
  synced: integer("synced", { mode: "boolean" }).notNull().default(false),
  activityType: text("activity_type")
    .notNull()
    .$type<PublicActivityType>()
    .default("outdoor_run"),
  version: text("version").notNull().default("1.0"),
  profileId: text("profile_id").notNull(),
  profileWeightKg: real("profile_weight_kg"),
  profileFtp: real("profile_ftp"),
  profileThresholdHr: integer("profile_threshold_hr"),

  plannedActivityId: text("planned_activity_id"),
  plannedActivityName: text("planned_activity_name"),
  plannedActivityDescription: text("planned_activity_description"),
  plannedActivityStructureVersion: text("planned_activity_structure_version"),
  plannedActivityStructure: text("planned_activity_structure", {
    mode: "json",
  }),
  plannedActivityEstimatedDuration: integer(
    "planned_activity_estimated_duration",
  ),
  plannedActivityEstimatedDistance: real("planned_activity_estimated_distance"),
  plannedActivityEstimatedTss: real("planned_activity_estimated_tss"),

  createdAt: text("created_at")
    .default(sql`(CURRENT_TIMESTAMP)`)
    .notNull(),
});

// Unified Activity Streams Table
export const activityRecordingStreams = sqliteTable(
  "activity_recording_streams",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    activityRecordingId: text("activity_recording_id")
      .notNull()
      .references(() => activityRecordings.id, { onDelete: "cascade" }),
    metric: text("metric").$type<PublicActivityMetric>().notNull(),
    dataType: text("data_type").$type<PublicActivityMetricDataType>().notNull(),

    chunkIndex: integer("chunk_index").notNull().default(0),
    sampleCount: integer("sample_count").notNull().default(0),
    startTime: integer("start_time", { mode: "timestamp" }).notNull(),
    endTime: integer("end_time", { mode: "timestamp" }).notNull(),

    data: text("data", { mode: "json" }).notNull(),
    timestamps: text("timestamps", { mode: "json" }).notNull(),

    synced: integer("synced", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .default(sql`(CURRENT_TIMESTAMP)`)
      .notNull(),
  },
);
